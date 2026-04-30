drop function if exists public.review_workflow(uuid);

create or replace function public.review_workflow(
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
  v_reviewer_role text;
  v_review_kind text;
  v_contributor_count integer := 0;
  v_expert_count integer := 0;
  v_total_count integer := 0;
  v_contributor_target integer := 0;
  v_expert_target integer := 0;
  v_is_approved boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select reviewer_profile.role
  into v_reviewer_role
  from public.profiles reviewer_profile
  where reviewer_profile.id = v_user_id;

  if v_reviewer_role not in ('contributor', 'expert', 'trusted_editor', 'admin') then
    raise exception 'Only contributors or experts can review workflows';
  end if;

  select *
  into v_workflow
  from public.workflows
  where public.workflows.id = p_workflow_id
  for update;

  if not found then
    raise exception 'Workflow not found';
  end if;

  if v_workflow.owner_id = v_user_id then
    raise exception 'Workflow owners cannot review their own workflow';
  end if;

  if v_workflow.review_status = 'approved' then
    raise exception 'Workflow is not pending review';
  end if;

  select *
  into v_request
  from public.review_requests
  where public.review_requests.workflow_id = v_workflow.id
    and public.review_requests.workflow_version_id = v_workflow.current_version_id
    and public.review_requests.target_type = 'workflow'
  for update;

  if not found then
    raise exception 'Workflow review request not found';
  end if;

  v_contributor_target := v_request.required_contributor_reviews + v_request.extra_contributor_reviews;
  v_expert_target := v_request.required_expert_reviews + v_request.extra_expert_reviews;
  v_review_kind := case
    when v_reviewer_role in ('expert', 'trusted_editor', 'admin') and v_expert_target > 0 then 'expert'
    else 'contributor'
  end;

  select count(*)::integer
  into v_contributor_count
  from public.reviews
  where public.reviews.review_request_id = v_request.id
    and public.reviews.review_kind = 'contributor';

  select count(*)::integer
  into v_expert_count
  from public.reviews
  where public.reviews.review_request_id = v_request.id
    and public.reviews.review_kind = 'expert';

  if v_review_kind = 'contributor' and v_contributor_count >= v_contributor_target then
    raise exception 'Contributor reviews are already complete for this workflow';
  end if;

  if v_review_kind = 'expert' and v_expert_count >= v_expert_target then
    raise exception 'Expert reviews are already complete for this workflow';
  end if;

  insert into public.reviews (
    review_request_id,
    reviewer_id,
    reviewer_role,
    review_kind
  )
  values (v_request.id, v_user_id, v_reviewer_role, v_review_kind)
  on conflict (review_request_id, reviewer_id) do nothing;

  insert into public.workflow_reviews (
    workflow_id,
    workflow_version_id,
    reviewer_id
  )
  values (
    v_workflow.id,
    v_workflow.current_version_id,
    v_user_id
  )
  on conflict on constraint workflow_reviews_workflow_id_reviewer_id_key do nothing;

  select count(*)::integer
  into v_contributor_count
  from public.reviews
  where public.reviews.review_request_id = v_request.id
    and public.reviews.review_kind = 'contributor';

  select count(*)::integer
  into v_expert_count
  from public.reviews
  where public.reviews.review_request_id = v_request.id
    and public.reviews.review_kind = 'expert';

  v_total_count := v_contributor_count + v_expert_count;
  v_is_approved := v_contributor_count >= v_contributor_target and v_expert_count >= v_expert_target;

  update public.review_requests
  set
    status = case when v_is_approved then 'approved' else 'pending' end,
    updated_at = now()
  where public.review_requests.id = v_request.id
  returning * into v_request;

  update public.workflows
  set
    review_count = v_total_count,
    contributor_review_count = v_contributor_count,
    expert_review_count = v_expert_count,
    extra_contributor_reviews = v_request.extra_contributor_reviews,
    extra_expert_reviews = v_request.extra_expert_reviews,
    review_status = case when v_is_approved then 'approved' else 'unreviewed' end,
    status = case when v_is_approved or not v_request.required then 'published' else 'pending_review' end
  where public.workflows.id = v_workflow.id
  returning * into v_workflow;

  update public.workflow_versions
  set
    review_count = v_workflow.review_count,
    contributor_review_count = v_workflow.contributor_review_count,
    expert_review_count = v_workflow.expert_review_count,
    extra_contributor_reviews = v_workflow.extra_contributor_reviews,
    extra_expert_reviews = v_workflow.extra_expert_reviews,
    review_status = v_workflow.review_status
  where public.workflow_versions.id = v_workflow.current_version_id;

  update public.node_templates
  set
    review_count = v_workflow.review_count,
    contributor_review_count = v_workflow.contributor_review_count,
    expert_review_count = v_workflow.expert_review_count,
    extra_contributor_reviews = v_workflow.extra_contributor_reviews,
    extra_expert_reviews = v_workflow.extra_expert_reviews,
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
    exists (
      select 1
      from public.reviews my_review
      where my_review.review_request_id = v_request.id
        and my_review.reviewer_id = v_user_id
    );
end;
$$;

grant execute on function public.review_workflow(uuid) to authenticated;
