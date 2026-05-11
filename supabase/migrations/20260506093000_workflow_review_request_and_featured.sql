alter table public.workflows
add column if not exists featured boolean not null default false,
add column if not exists featured_at timestamptz,
add column if not exists curation_score numeric not null default 0;

create or replace function public.request_workflow_review(
  p_workflow_id uuid,
  p_reason text default null
)
returns table (
  workflow_id uuid,
  workflow_version_id uuid,
  review_status text,
  review_count integer,
  review_required boolean,
  review_warning boolean,
  required_contributor_reviews integer,
  required_expert_reviews integer,
  contributor_review_count integer,
  expert_review_count integer,
  extra_contributor_reviews integer,
  extra_expert_reviews integer,
  status text,
  reviewed_by_me boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_workflow public.workflows%rowtype;
  v_request public.review_requests%rowtype;
  v_publish_kind text;
  v_required_contributor_reviews integer;
  v_required_expert_reviews integer;
  v_request_required boolean;
  v_review_warning boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_workflow
  from public.workflows
  where public.workflows.id = p_workflow_id
  for update;

  if not found then
    raise exception 'Workflow not found';
  end if;

  if v_workflow.owner_id <> v_user_id then
    raise exception 'Only the workflow owner can request review';
  end if;

  if v_workflow.visibility not in ('public', 'core') then
    raise exception 'Only public or core workflows can request review';
  end if;

  if v_workflow.current_version_id is null then
    raise exception 'Workflow has no published version';
  end if;

  if v_workflow.review_status = 'approved' then
    raise exception 'Workflow is already approved';
  end if;

  v_publish_kind := coalesce(v_workflow.publish_kind, v_workflow.workflow_json -> 'meta' ->> 'publishKind', 'workflow');
  v_required_contributor_reviews := case
    when v_workflow.visibility = 'core' and v_publish_kind = 'node' then 2
    when v_workflow.visibility = 'core' then 1
    when v_publish_kind = 'node' then 3
    else 2
  end;
  v_required_expert_reviews := case when v_workflow.visibility = 'core' then 1 else 0 end;
  v_request_required := v_workflow.visibility = 'core';
  v_review_warning := v_publish_kind = 'node';

  insert into public.review_requests (
    target_type,
    target_id,
    workflow_id,
    workflow_version_id,
    required,
    warning_if_unreviewed,
    required_contributor_reviews,
    required_expert_reviews,
    status,
    reason,
    requested_by
  )
  values (
    'workflow',
    v_workflow.id::text,
    v_workflow.id,
    v_workflow.current_version_id,
    v_request_required,
    v_review_warning,
    v_required_contributor_reviews,
    v_required_expert_reviews,
    'pending',
    nullif(trim(coalesce(p_reason, '')), ''),
    v_user_id
  )
  on conflict (target_type, target_id, workflow_version_id)
  do update set
    required = excluded.required,
    warning_if_unreviewed = excluded.warning_if_unreviewed,
    required_contributor_reviews = excluded.required_contributor_reviews,
    required_expert_reviews = excluded.required_expert_reviews,
    status = 'pending',
    reason = excluded.reason,
    requested_by = excluded.requested_by,
    updated_at = now()
  returning * into v_request;

  update public.workflows
  set
    review_status = 'unreviewed',
    review_required = true,
    review_warning = v_review_warning,
    required_contributor_reviews = v_required_contributor_reviews,
    required_expert_reviews = v_required_expert_reviews,
    contributor_review_count = 0,
    expert_review_count = 0,
    extra_contributor_reviews = v_request.extra_contributor_reviews,
    extra_expert_reviews = v_request.extra_expert_reviews,
    status = case when v_request.required then 'pending_review' else 'published' end,
    featured = false,
    featured_at = null
  where public.workflows.id = v_workflow.id
  returning * into v_workflow;

  update public.workflow_versions
  set
    review_status = v_workflow.review_status,
    review_required = v_workflow.review_required,
    review_warning = v_workflow.review_warning,
    required_contributor_reviews = v_workflow.required_contributor_reviews,
    required_expert_reviews = v_workflow.required_expert_reviews,
    contributor_review_count = v_workflow.contributor_review_count,
    expert_review_count = v_workflow.expert_review_count,
    extra_contributor_reviews = v_workflow.extra_contributor_reviews,
    extra_expert_reviews = v_workflow.extra_expert_reviews
  where public.workflow_versions.id = v_workflow.current_version_id;

  update public.node_templates
  set
    review_status = v_workflow.review_status,
    review_required = v_workflow.review_required,
    review_warning = v_workflow.review_warning,
    required_contributor_reviews = v_workflow.required_contributor_reviews,
    required_expert_reviews = v_workflow.required_expert_reviews,
    contributor_review_count = v_workflow.contributor_review_count,
    expert_review_count = v_workflow.expert_review_count,
    extra_contributor_reviews = v_workflow.extra_contributor_reviews,
    extra_expert_reviews = v_workflow.extra_expert_reviews
  where public.node_templates.source_workflow_id = v_workflow.id;

  return query
  select
    v_workflow.id,
    v_workflow.current_version_id,
    v_workflow.review_status,
    v_workflow.review_count,
    v_workflow.review_required,
    v_workflow.review_warning,
    v_workflow.required_contributor_reviews + v_workflow.extra_contributor_reviews,
    v_workflow.required_expert_reviews + v_workflow.extra_expert_reviews,
    v_workflow.contributor_review_count,
    v_workflow.expert_review_count,
    v_workflow.extra_contributor_reviews,
    v_workflow.extra_expert_reviews,
    v_workflow.status,
    false;
end;
$$;

grant execute on function public.request_workflow_review(uuid, text) to authenticated;

create or replace function public.admin_set_workflow_featured(
  p_workflow_id uuid,
  p_featured boolean default true,
  p_curation_score numeric default null
)
returns table (
  workflow_id uuid,
  featured boolean,
  featured_at timestamptz,
  curation_score numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_admin boolean;
  v_workflow public.workflows%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select exists (
    select 1
    from public.profiles admin_profile
    where admin_profile.id = v_user_id
      and admin_profile.role = 'admin'
  )
  into v_is_admin;

  if not v_is_admin then
    raise exception 'Only admins can feature workflows';
  end if;

  select *
  into v_workflow
  from public.workflows
  where public.workflows.id = p_workflow_id
  for update;

  if not found then
    raise exception 'Workflow not found';
  end if;

  if p_featured and v_workflow.review_status <> 'approved' then
    raise exception 'Only approved workflows can be featured';
  end if;

  update public.workflows
  set
    featured = coalesce(p_featured, false),
    featured_at = case when coalesce(p_featured, false) then coalesce(featured_at, now()) else null end,
    curation_score = coalesce(p_curation_score, curation_score, 0)
  where public.workflows.id = p_workflow_id
  returning * into v_workflow;

  return query
  select
    v_workflow.id,
    v_workflow.featured,
    v_workflow.featured_at,
    v_workflow.curation_score;
end;
$$;

grant execute on function public.admin_set_workflow_featured(uuid, boolean, numeric) to authenticated;

drop view if exists public.public_workflow_cards;

create or replace view public.public_workflow_cards
with (security_invoker = true)
as
select
  w.id,
  coalesce(nullif(w.slug, ''), 'workflow-' || replace(w.id::text, '-', '')) as slug,
  w.title,
  w.description as summary,
  coalesce(nullif(w.workflow_json -> 'meta' ->> 'authorName', ''), 'Methmatica Community') as author,
  case when w.visibility = 'core' then '核心' else '社群' end as difficulty,
  w.visibility,
  w.tags,
  w.updated_at,
  w.review_status,
  w.review_count,
  w.review_required,
  w.review_warning,
  w.required_contributor_reviews,
  w.required_expert_reviews,
  w.contributor_review_count,
  w.expert_review_count,
  w.extra_contributor_reviews,
  w.extra_expert_reviews,
  w.featured,
  w.featured_at,
  w.curation_score,
  coalesce(jsonb_array_length(w.workflow_json -> 'nodes'), 0) as node_count,
  coalesce(jsonb_array_length(w.workflow_json -> 'edges'), 0) as edge_count
from public.workflows w
where
  w.visibility in ('public', 'core')
  and (
    w.status = 'published'
    or exists (
      select 1
      from public.profiles reviewer_profile
      where reviewer_profile.id = auth.uid()
        and reviewer_profile.role in ('contributor', 'expert', 'trusted_editor', 'admin')
        and w.status = 'pending_review'
    )
  );

grant select on public.public_workflow_cards to anon, authenticated;
