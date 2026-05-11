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

  if coalesce(p_featured, false) and v_workflow.review_status <> 'approved' then
    raise exception 'Only approved workflows can be featured';
  end if;

  update public.workflows as workflow_row
  set
    featured = coalesce(p_featured, false),
    featured_at = case
      when coalesce(p_featured, false) then coalesce(workflow_row.featured_at, now())
      else null
    end,
    curation_score = coalesce(p_curation_score, workflow_row.curation_score, 0)
  where workflow_row.id = p_workflow_id
  returning workflow_row.* into v_workflow;

  return query
  select
    v_workflow.id as workflow_id,
    v_workflow.featured,
    v_workflow.featured_at,
    v_workflow.curation_score;
end;
$$;

grant execute on function public.admin_set_workflow_featured(uuid, boolean, numeric) to authenticated;
