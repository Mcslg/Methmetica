create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role then
    if current_user in ('postgres', 'supabase_admin', 'service_role')
      or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' then
      return new;
    end if;

    if not exists (
      select 1
      from public.profiles admin_profile
      where admin_profile.id = auth.uid()
        and admin_profile.role = 'admin'
    ) then
      raise exception 'Only admins can change roles.';
    end if;
  end if;

  return new;
end;
$$;
