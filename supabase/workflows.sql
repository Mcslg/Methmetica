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
  compiled_artifact jsonb,
  artifact_status text not null default 'legacy' check (artifact_status in ('legacy', 'ready', 'failed')),
  compiler_version text,
  runtime_version text,
  dependency_manifest jsonb not null default '{"entries":[]}'::jsonb,
  contains_admin_code boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workflow_versions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  version integer not null,
  title text not null,
  description text not null default '',
  tags text[] not null default '{}',
  visibility text not null check (visibility in ('private', 'public', 'core')),
  workflow_json jsonb not null default '{}'::jsonb,
  compiled_artifact jsonb,
  artifact_status text not null default 'legacy' check (artifact_status in ('legacy', 'ready', 'failed')),
  compiler_version text,
  runtime_version text,
  dependency_manifest jsonb not null default '{"entries":[]}'::jsonb,
  contains_admin_code boolean not null default false,
  created_by uuid not null references auth.users(id) on delete cascade,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  unique (workflow_id, version)
);

alter table public.workflows
add column if not exists current_version_id uuid references public.workflow_versions(id) on delete set null;

alter table public.workflows
add column if not exists compiled_artifact jsonb,
add column if not exists artifact_status text not null default 'legacy' check (artifact_status in ('legacy', 'ready', 'failed')),
add column if not exists compiler_version text,
add column if not exists runtime_version text,
add column if not exists dependency_manifest jsonb not null default '{"entries":[]}'::jsonb,
add column if not exists contains_admin_code boolean not null default false;

alter table public.workflow_versions
add column if not exists compiled_artifact jsonb,
add column if not exists artifact_status text not null default 'legacy' check (artifact_status in ('legacy', 'ready', 'failed')),
add column if not exists compiler_version text,
add column if not exists runtime_version text,
add column if not exists dependency_manifest jsonb not null default '{"entries":[]}'::jsonb,
add column if not exists contains_admin_code boolean not null default false;

create index if not exists workflow_versions_workflow_version_idx
  on public.workflow_versions (workflow_id, version desc);

create index if not exists workflow_versions_published_at_idx
  on public.workflow_versions (published_at desc);

alter table public.workflows enable row level security;
alter table public.workflow_versions enable row level security;

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

drop policy if exists "workflow_versions_select_public_or_owner" on public.workflow_versions;
create policy "workflow_versions_select_public_or_owner"
on public.workflow_versions
for select
to authenticated, anon
using (
  exists (
    select 1
    from public.workflows w
    where w.id = public.workflow_versions.workflow_id
      and (
        (w.status = 'published' and w.visibility = 'public')
        or w.owner_id = auth.uid()
        or exists (
          select 1
          from public.profiles editor_profile
          where editor_profile.id = auth.uid()
            and editor_profile.role in ('trusted_editor', 'admin')
            and w.visibility = 'core'
        )
      )
  )
);

drop policy if exists "workflow_versions_insert_via_rpc" on public.workflow_versions;
create policy "workflow_versions_insert_via_rpc"
on public.workflow_versions
for insert
to authenticated
with check (false);

drop policy if exists "workflow_versions_update_blocked" on public.workflow_versions;
create policy "workflow_versions_update_blocked"
on public.workflow_versions
for update
to authenticated
using (false)
with check (false);

drop policy if exists "workflow_versions_delete_owner_or_admin" on public.workflow_versions;
create policy "workflow_versions_delete_owner_or_admin"
on public.workflow_versions
for delete
to authenticated
using (
  exists (
    select 1
    from public.workflows w
    where w.id = public.workflow_versions.workflow_id
      and (
        w.owner_id = auth.uid()
        or exists (
          select 1
          from public.profiles editor_profile
          where editor_profile.id = auth.uid()
            and editor_profile.role = 'admin'
        )
      )
  )
);

insert into public.workflow_versions (
  workflow_id,
  version,
  title,
  description,
  tags,
  visibility,
  workflow_json,
  created_by,
  published_at,
  created_at
)
select
  w.id,
  1,
  w.title,
  w.description,
  w.tags,
  w.visibility,
  w.workflow_json,
  w.owner_id,
  coalesce(w.published_at, w.created_at, now()),
  coalesce(w.published_at, w.created_at, now())
from public.workflows w
where
  w.status = 'published'
  and not exists (
    select 1
    from public.workflow_versions existing_version
    where existing_version.workflow_id = w.id
  );

update public.workflows w
set current_version_id = latest_version.id
from (
  select distinct on (workflow_id)
    workflow_id,
    id
  from public.workflow_versions
  order by workflow_id, version desc
) latest_version
where
  latest_version.workflow_id = w.id
  and w.current_version_id is null;

create or replace function public.publish_workflow_version(
  p_workflow_id uuid,
  p_title text,
  p_description text,
  p_tags text[],
  p_visibility text,
  p_slug text,
  p_workflow_json jsonb,
  p_compiled_artifact jsonb default null
)
returns table (
  id uuid,
  owner_id uuid,
  slug text,
  title text,
  description text,
  tags text[],
  visibility text,
  status text,
  workflow_json jsonb,
  compiled_artifact jsonb,
  artifact_status text,
  compiler_version text,
  runtime_version text,
  dependency_manifest jsonb,
  contains_admin_code boolean,
  published_at timestamptz,
  updated_at timestamptz,
  created_at timestamptz,
  current_version_id uuid,
  current_version integer,
  workflow_version_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_workflow public.workflows%rowtype;
  v_version_id uuid;
  v_next_version integer;
  v_title text := coalesce(nullif(trim(p_title), ''), 'Untitled Workflow');
  v_description text := coalesce(p_description, '');
  v_tags text[] := coalesce(p_tags, '{}'::text[]);
  v_visibility text := coalesce(p_visibility, 'public');
  v_slug text := nullif(trim(coalesce(p_slug, '')), '');
  v_artifact_status text := case when p_compiled_artifact is null then 'legacy' else 'ready' end;
  v_compiler_version text := p_compiled_artifact #>> '{compilerVersion}';
  v_runtime_version text := p_compiled_artifact #>> '{runtimeVersion}';
  v_dependency_manifest jsonb := coalesce(p_compiled_artifact -> 'dependencyManifest', '{"entries":[]}'::jsonb);
  v_contains_admin_code boolean := coalesce((p_compiled_artifact #>> '{permissions,containsCodeNode}')::boolean, false);
  v_is_admin boolean := false;
  v_can_publish_core boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if v_visibility not in ('private', 'public', 'core') then
    raise exception 'Unsupported workflow visibility: %', v_visibility;
  end if;

  select exists (
    select 1
    from public.profiles editor_profile
    where editor_profile.id = v_user_id
      and editor_profile.role = 'admin'
  )
  into v_is_admin;

  select exists (
    select 1
    from public.profiles editor_profile
    where editor_profile.id = v_user_id
      and editor_profile.role in ('trusted_editor', 'admin')
  )
  into v_can_publish_core;

  if v_visibility = 'core' and not v_can_publish_core then
    raise exception 'Only trusted editors or admins can publish core workflows';
  end if;

  if p_workflow_id is null then
    insert into public.workflows (
      owner_id,
      slug,
      title,
      description,
      tags,
      visibility,
      status,
      workflow_json,
      compiled_artifact,
      artifact_status,
      compiler_version,
      runtime_version,
      dependency_manifest,
      contains_admin_code,
      published_at
    )
    values (
      v_user_id,
      v_slug,
      v_title,
      v_description,
      v_tags,
      v_visibility,
      'published',
      coalesce(p_workflow_json, '{}'::jsonb),
      p_compiled_artifact,
      v_artifact_status,
      v_compiler_version,
      v_runtime_version,
      v_dependency_manifest,
      v_contains_admin_code,
      now()
    )
    returning * into v_workflow;
  else
    select *
    into v_workflow
    from public.workflows
    where public.workflows.id = p_workflow_id
    for update;

    if not found then
      raise exception 'Workflow not found';
    end if;

    if v_workflow.owner_id <> v_user_id and not v_is_admin then
      raise exception 'Only the workflow owner or an admin can publish a new version';
    end if;

    update public.workflows
    set
      slug = v_slug,
      title = v_title,
      description = v_description,
      tags = v_tags,
      visibility = v_visibility,
      status = 'published',
      workflow_json = coalesce(p_workflow_json, '{}'::jsonb),
      compiled_artifact = p_compiled_artifact,
      artifact_status = v_artifact_status,
      compiler_version = v_compiler_version,
      runtime_version = v_runtime_version,
      dependency_manifest = v_dependency_manifest,
      contains_admin_code = v_contains_admin_code,
      published_at = now()
    where public.workflows.id = p_workflow_id
    returning * into v_workflow;
  end if;

  select coalesce(max(public.workflow_versions.version), 0) + 1
  into v_next_version
  from public.workflow_versions
  where public.workflow_versions.workflow_id = v_workflow.id;

  insert into public.workflow_versions (
    workflow_id,
    version,
    title,
    description,
    tags,
    visibility,
    workflow_json,
    compiled_artifact,
    artifact_status,
    compiler_version,
    runtime_version,
    dependency_manifest,
    contains_admin_code,
    created_by,
    published_at
  )
  values (
    v_workflow.id,
    v_next_version,
    v_title,
    v_description,
    v_tags,
    v_visibility,
    coalesce(p_workflow_json, '{}'::jsonb),
    p_compiled_artifact,
    v_artifact_status,
    v_compiler_version,
    v_runtime_version,
    v_dependency_manifest,
    v_contains_admin_code,
    v_user_id,
    now()
  )
  returning public.workflow_versions.id into v_version_id;

  update public.workflows
  set current_version_id = v_version_id
  where public.workflows.id = v_workflow.id
  returning * into v_workflow;

  return query
  select
    v_workflow.id,
    v_workflow.owner_id,
    v_workflow.slug,
    v_workflow.title,
    v_workflow.description,
    v_workflow.tags,
    v_workflow.visibility,
    v_workflow.status,
    v_workflow.workflow_json,
    v_workflow.compiled_artifact,
    v_workflow.artifact_status,
    v_workflow.compiler_version,
    v_workflow.runtime_version,
    v_workflow.dependency_manifest,
    v_workflow.contains_admin_code,
    v_workflow.published_at,
    v_workflow.updated_at,
    v_workflow.created_at,
    v_workflow.current_version_id,
    v_next_version,
    v_version_id;
end;
$$;

grant execute on function public.publish_workflow_version(uuid, text, text, text[], text, text, jsonb, jsonb) to authenticated;
