create table if not exists public.workflows (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug text unique,
  title text not null,
  description text not null default '',
  tags text[] not null default '{}',
  visibility text not null default 'private' check (visibility in ('private', 'public', 'core')),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  workflow_json jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workflows enable row level security;

create or replace function public.set_workflows_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workflows_set_updated_at on public.workflows;
create trigger workflows_set_updated_at
before update on public.workflows
for each row
execute function public.set_workflows_updated_at();

drop policy if exists "workflows_select_public_or_owner" on public.workflows;
create policy "workflows_select_public_or_owner"
on public.workflows
for select
to authenticated, anon
using (
  visibility = 'public'
  or owner_id = auth.uid()
  or exists (
    select 1
    from public.profiles editor_profile
    where editor_profile.id = auth.uid()
      and editor_profile.role in ('trusted_editor', 'admin')
      and public.workflows.visibility = 'core'
  )
);

drop policy if exists "workflows_insert_owner" on public.workflows;
create policy "workflows_insert_owner"
on public.workflows
for insert
to authenticated
with check (
  owner_id = auth.uid()
  and (
    visibility <> 'core'
    or exists (
      select 1
      from public.profiles editor_profile
      where editor_profile.id = auth.uid()
        and editor_profile.role in ('trusted_editor', 'admin')
    )
  )
);

drop policy if exists "workflows_update_owner_or_admin" on public.workflows;
create policy "workflows_update_owner_or_admin"
on public.workflows
for update
to authenticated
using (
  owner_id = auth.uid()
  or exists (
    select 1
    from public.profiles editor_profile
    where editor_profile.id = auth.uid()
      and editor_profile.role = 'admin'
  )
)
with check (
  (
    owner_id = auth.uid()
    or exists (
      select 1
      from public.profiles editor_profile
      where editor_profile.id = auth.uid()
        and editor_profile.role = 'admin'
    )
  )
  and (
    visibility <> 'core'
    or exists (
      select 1
      from public.profiles editor_profile
      where editor_profile.id = auth.uid()
        and editor_profile.role in ('trusted_editor', 'admin')
    )
  )
);

drop policy if exists "workflows_delete_owner_or_admin" on public.workflows;
create policy "workflows_delete_owner_or_admin"
on public.workflows
for delete
to authenticated
using (
  owner_id = auth.uid()
  or exists (
    select 1
    from public.profiles editor_profile
    where editor_profile.id = auth.uid()
      and editor_profile.role = 'admin'
  )
);
