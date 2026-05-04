alter table public.workflows
add column if not exists change_type text not null default 'edit'
check (change_type in ('edit', 'feature', 'fix', 'hotfix')),
add column if not exists update_policy text not null default 'none'
check (update_policy in ('none', 'manual', 'auto')),
add column if not exists warning_message text,
add column if not exists supersedes_version_id uuid references public.workflow_versions(id) on delete set null;

alter table public.workflow_versions
add column if not exists change_type text not null default 'edit'
check (change_type in ('edit', 'feature', 'fix', 'hotfix')),
add column if not exists update_policy text not null default 'none'
check (update_policy in ('none', 'manual', 'auto')),
add column if not exists warning_message text,
add column if not exists supersedes_version_id uuid references public.workflow_versions(id) on delete set null;

create index if not exists workflow_versions_supersedes_version_idx
  on public.workflow_versions (supersedes_version_id);

create or replace function public.workflow_change_type_from_json(p_workflow_json jsonb, p_fallback text default 'edit')
returns text
language sql
immutable
as $$
  select case coalesce(p_workflow_json #>> '{meta,changeType}', p_fallback, 'edit')
    when 'feature' then 'feature'
    when 'fix' then 'fix'
    when 'hotfix' then 'hotfix'
    else 'edit'
  end;
$$;

create or replace function public.workflow_update_policy_from_json(p_workflow_json jsonb, p_change_type text, p_fallback text default null)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_workflow_json #>> '{meta,updatePolicy}', p_fallback) in ('none', 'manual', 'auto')
      then coalesce(p_workflow_json #>> '{meta,updatePolicy}', p_fallback)
    when p_change_type = 'hotfix' then 'auto'
    when p_change_type in ('feature', 'fix') then 'manual'
    else 'none'
  end;
$$;

create or replace function public.apply_workflow_update_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_previous_version_id uuid;
begin
  new.change_type := public.workflow_change_type_from_json(new.workflow_json, new.change_type);
  new.update_policy := public.workflow_update_policy_from_json(new.workflow_json, new.change_type, new.update_policy);
  new.warning_message := nullif(trim(coalesce(new.workflow_json #>> '{meta,warningMessage}', new.warning_message, '')), '');

  if tg_table_name = 'workflow_versions' then
    if new.supersedes_version_id is null then
      select current_version_id into v_previous_version_id
      from public.workflows
      where id = new.workflow_id;
      new.supersedes_version_id := v_previous_version_id;
    end if;
  elsif tg_table_name = 'workflows' and tg_op = 'UPDATE' and new.supersedes_version_id is null then
    new.supersedes_version_id := old.current_version_id;
  end if;

  if new.change_type = 'edit' then
    new.update_policy := 'none';
    new.warning_message := null;
  elsif new.change_type = 'fix' and new.warning_message is null then
    new.warning_message := '這個版本已有修正版，建議手動更新。';
  elsif new.change_type = 'hotfix' and new.warning_message is null then
    new.warning_message := '這個版本有重要修復，建議盡快更新。';
  end if;

  return new;
end;
$$;

drop trigger if exists workflows_apply_update_metadata on public.workflows;
create trigger workflows_apply_update_metadata
before insert or update of workflow_json, change_type, update_policy, warning_message
on public.workflows
for each row
execute function public.apply_workflow_update_metadata();

drop trigger if exists workflow_versions_apply_update_metadata on public.workflow_versions;
create trigger workflow_versions_apply_update_metadata
before insert or update of workflow_json, change_type, update_policy, warning_message
on public.workflow_versions
for each row
execute function public.apply_workflow_update_metadata();

create or replace function public.apply_publish_kind_review_defaults()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_is_update boolean := false;
  v_previous_version_id uuid;
begin
  new.publish_kind := public.workflow_publish_kind_from_json(new.workflow_json, new.publish_kind);
  new.change_type := public.workflow_change_type_from_json(new.workflow_json, new.change_type);
  new.update_policy := public.workflow_update_policy_from_json(new.workflow_json, new.change_type, new.update_policy);

  if new.supersedes_version_id is null and tg_table_name = 'workflow_versions' then
    select current_version_id into v_previous_version_id
    from public.workflows
    where id = new.workflow_id;
    new.supersedes_version_id := v_previous_version_id;
  elsif new.supersedes_version_id is null and tg_table_name = 'workflows' and tg_op = 'UPDATE' then
    new.supersedes_version_id := old.current_version_id;
  end if;

  v_is_update := new.supersedes_version_id is not null;

  if v_is_update and new.change_type = 'edit' then
    new.review_status := 'approved';
    new.review_required := false;
    new.review_warning := false;
    new.required_contributor_reviews := 0;
    new.required_expert_reviews := 0;
    if tg_table_name = 'workflows' then
      new.status := 'published';
    end if;
    return new;
  end if;

  if v_is_update and new.change_type in ('feature', 'fix', 'hotfix') then
    new.review_required := true;
    new.review_warning := new.change_type in ('fix', 'hotfix');
    new.required_contributor_reviews := 1;
    new.required_expert_reviews := 0;
    return new;
  end if;

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
  new.status := case when v_version.review_required then new.status else 'approved' end;

  return new;
end;
$$;
