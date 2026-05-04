create or replace function public.admin_delete_public_workflow(p_workflow_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select exists (
    select 1
    from public.profiles admin_profile
    where admin_profile.id = v_user_id
      and admin_profile.role = 'admin'
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Only admins can delete public workflows';
  end if;

  if not exists (
    select 1
    from public.workflows workflow
    where workflow.id = p_workflow_id
      and workflow.visibility in ('public', 'core')
  ) then
    raise exception 'Public workflow not found';
  end if;

  delete from public.node_templates
  where source_workflow_id = p_workflow_id;

  delete from public.workflows
  where id = p_workflow_id;
end;
$$;

grant execute on function public.admin_delete_public_workflow(uuid) to authenticated;
