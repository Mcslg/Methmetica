create table if not exists public.node_templates (
  id text primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_workflow_id uuid references public.workflows(id) on delete set null,
  source_workflow_slug text,
  slug text unique not null,
  title text not null,
  summary text not null default '',
  visibility text not null default 'community' check (visibility in ('private', 'community', 'core')),
  version text not null default '1.0.0',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.node_templates enable row level security;

create or replace function public.set_node_templates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists node_templates_set_updated_at on public.node_templates;
create trigger node_templates_set_updated_at
before update on public.node_templates
for each row
execute function public.set_node_templates_updated_at();

drop policy if exists "node_templates_select_public_or_owner" on public.node_templates;
create policy "node_templates_select_public_or_owner"
on public.node_templates
for select
to authenticated, anon
using (
  visibility = 'community'
  or owner_id = auth.uid()
  or exists (
    select 1
    from public.profiles editor_profile
    where editor_profile.id = auth.uid()
      and editor_profile.role in ('trusted_editor', 'admin')
      and public.node_templates.visibility = 'core'
  )
);

drop policy if exists "node_templates_insert_owner" on public.node_templates;
create policy "node_templates_insert_owner"
on public.node_templates
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

drop policy if exists "node_templates_update_owner_or_admin" on public.node_templates;
create policy "node_templates_update_owner_or_admin"
on public.node_templates
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

drop policy if exists "node_templates_delete_owner_or_admin" on public.node_templates;
create policy "node_templates_delete_owner_or_admin"
on public.node_templates
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
