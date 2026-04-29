create or replace function public.admin_approve_workflow(
  p_workflow_id uuid
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
  v_is_admin boolean := false;
  v_contributor_target integer := 0;
  v_expert_target integer := 0;
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
    raise exception 'Only admins can approve workflows';
  end if;

  select *
  into v_workflow
  from public.workflows
  where public.workflows.id = p_workflow_id
  for update;

  if not found then
    raise exception 'Workflow not found';
  end if;

  select *
  into v_request
  from public.review_requests
  where public.review_requests.workflow_id = v_workflow.id
    and public.review_requests.workflow_version_id = v_workflow.current_version_id
    and public.review_requests.target_type = 'workflow'
  for update;

  if found then
    v_contributor_target := v_request.required_contributor_reviews + v_request.extra_contributor_reviews;
    v_expert_target := v_request.required_expert_reviews + v_request.extra_expert_reviews;

    update public.review_requests
    set
      status = 'approved',
      updated_at = now()
    where public.review_requests.id = v_request.id
    returning * into v_request;
  else
    v_contributor_target := v_workflow.required_contributor_reviews + v_workflow.extra_contributor_reviews;
    v_expert_target := v_workflow.required_expert_reviews + v_workflow.extra_expert_reviews;
  end if;

  update public.workflows
  set
    review_count = v_contributor_target + v_expert_target,
    contributor_review_count = v_contributor_target,
    expert_review_count = v_expert_target,
    review_status = 'approved',
    status = 'published'
  where public.workflows.id = v_workflow.id
  returning * into v_workflow;

  update public.workflow_versions
  set
    review_count = v_workflow.review_count,
    contributor_review_count = v_workflow.contributor_review_count,
    expert_review_count = v_workflow.expert_review_count,
    review_status = v_workflow.review_status
  where public.workflow_versions.id = v_workflow.current_version_id;

  update public.node_templates
  set
    review_count = v_workflow.review_count,
    contributor_review_count = v_workflow.contributor_review_count,
    expert_review_count = v_workflow.expert_review_count,
    review_status = v_workflow.review_status
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

grant execute on function public.admin_approve_workflow(uuid) to authenticated;
