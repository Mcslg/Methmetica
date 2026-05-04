alter table public.workflows
add column if not exists publish_kind text not null default 'workflow'
check (publish_kind in ('workflow', 'node'));

alter table public.workflow_versions
add column if not exists publish_kind text not null default 'workflow'
check (publish_kind in ('workflow', 'node'));

alter table public.node_templates
add column if not exists source_workflow_version_id uuid references public.workflow_versions(id) on delete set null,
add column if not exists publish_kind text not null default 'node'
check (publish_kind in ('workflow', 'node'));

create index if not exists node_templates_source_workflow_version_idx
  on public.node_templates (source_workflow_version_id);

create or replace function public.workflow_publish_kind_from_json(p_workflow_json jsonb, p_fallback text default 'workflow')
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_workflow_json #>> '{meta,publishKind}', p_fallback, 'workflow') = 'node' then 'node'
    else 'workflow'
  end;
$$;

create or replace function public.apply_publish_kind_review_defaults()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.publish_kind := public.workflow_publish_kind_from_json(new.workflow_json, new.publish_kind);

  if new.visibility in ('public', 'core') then
    new.review_required := new.visibility = 'core';
    new.review_warning := new.publish_kind = 'node' and new.visibility = 'public';
    new.required_contributor_reviews := case
      when new.publish_kind = 'node' and new.visibility = 'core' then 2
      when new.publish_kind = 'node' and new.visibility = 'public' then 3
      when new.visibility = 'core' then 1
      when new.visibility = 'public' then 2
      else 0
    end;
    new.required_expert_reviews := case when new.visibility = 'core' then 1 else 0 end;
  else
    new.review_required := false;
    new.review_warning := false;
    new.required_contributor_reviews := 0;
    new.required_expert_reviews := 0;
  end if;

  return new;
end;
$$;

drop trigger if exists workflows_apply_publish_kind_review_defaults on public.workflows;
create trigger workflows_apply_publish_kind_review_defaults
before insert or update of workflow_json, visibility, publish_kind
on public.workflows
for each row
execute function public.apply_publish_kind_review_defaults();

drop trigger if exists workflow_versions_apply_publish_kind_review_defaults on public.workflow_versions;
create trigger workflow_versions_apply_publish_kind_review_defaults
before insert or update of workflow_json, visibility, publish_kind
on public.workflow_versions
for each row
execute function public.apply_publish_kind_review_defaults();

create or replace function public.apply_review_request_version_defaults()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_version public.workflow_versions%rowtype;
begin
  if new.workflow_version_id is null then
    return new;
  end if;

  select * into v_version
  from public.workflow_versions
  where id = new.workflow_version_id;

  if not found then
    return new;
  end if;

  new.warning_if_unreviewed := v_version.review_warning;
  new.required := v_version.review_required;
  new.required_contributor_reviews := v_version.required_contributor_reviews;
  new.required_expert_reviews := v_version.required_expert_reviews;

  return new;
end;
$$;

drop trigger if exists review_requests_apply_version_defaults on public.review_requests;
create trigger review_requests_apply_version_defaults
before insert or update of workflow_version_id
on public.review_requests
for each row
execute function public.apply_review_request_version_defaults();

create or replace function public.sync_node_template_review_from_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.node_templates
  set
    review_status = new.review_status,
    review_count = new.review_count,
    review_required = new.review_required,
    review_warning = new.review_warning,
    required_contributor_reviews = new.required_contributor_reviews,
    required_expert_reviews = new.required_expert_reviews,
    contributor_review_count = new.contributor_review_count,
    expert_review_count = new.expert_review_count,
    extra_contributor_reviews = new.extra_contributor_reviews,
    extra_expert_reviews = new.extra_expert_reviews
  where public.node_templates.source_workflow_version_id = new.id;

  return new;
end;
$$;

drop trigger if exists workflow_versions_sync_node_template_review on public.workflow_versions;
create trigger workflow_versions_sync_node_template_review
after update of review_status, review_count, review_required, review_warning,
  required_contributor_reviews, required_expert_reviews,
  contributor_review_count, expert_review_count,
  extra_contributor_reviews, extra_expert_reviews
on public.workflow_versions
for each row
execute function public.sync_node_template_review_from_version();

update public.workflows
set publish_kind = public.workflow_publish_kind_from_json(workflow_json, publish_kind);

update public.workflow_versions
set publish_kind = public.workflow_publish_kind_from_json(workflow_json, publish_kind);

update public.node_templates template
set source_workflow_version_id = workflow.current_version_id
from public.workflows workflow
where template.source_workflow_version_id is null
  and template.source_workflow_id = workflow.id;
