create table if not exists public.workflows (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug text unique,
  title text not null,
  description text not null default '',
  tags text[] not null default '{}',
  visibility text not null default 'private' check (visibility in ('private', 'public', 'core')),
  status text not null default 'draft' check (status in ('draft', 'pending_review', 'published', 'archived')),
  review_status text not null default 'unreviewed' check (review_status in ('unreviewed', 'approved')),
  review_count integer not null default 0,
  review_required boolean not null default false,
  review_warning boolean not null default false,
  required_contributor_reviews integer not null default 0,
  required_expert_reviews integer not null default 0,
  contributor_review_count integer not null default 0,
  expert_review_count integer not null default 0,
  extra_contributor_reviews integer not null default 0,
  extra_expert_reviews integer not null default 0,
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
  review_status text not null default 'unreviewed' check (review_status in ('unreviewed', 'approved')),
  review_count integer not null default 0,
  review_required boolean not null default false,
  review_warning boolean not null default false,
  required_contributor_reviews integer not null default 0,
  required_expert_reviews integer not null default 0,
  contributor_review_count integer not null default 0,
  expert_review_count integer not null default 0,
  extra_contributor_reviews integer not null default 0,
  extra_expert_reviews integer not null default 0,
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

do $$
begin
  alter table public.workflows drop constraint if exists workflows_status_check;
  alter table public.workflows
    add constraint workflows_status_check check (status in ('draft', 'pending_review', 'published', 'archived'));
end $$;

alter table public.workflows
add column if not exists compiled_artifact jsonb,
add column if not exists review_status text not null default 'unreviewed' check (review_status in ('unreviewed', 'approved')),
add column if not exists review_count integer not null default 0,
add column if not exists review_required boolean not null default false,
add column if not exists review_warning boolean not null default false,
add column if not exists required_contributor_reviews integer not null default 0,
add column if not exists required_expert_reviews integer not null default 0,
add column if not exists contributor_review_count integer not null default 0,
add column if not exists expert_review_count integer not null default 0,
add column if not exists extra_contributor_reviews integer not null default 0,
add column if not exists extra_expert_reviews integer not null default 0,
add column if not exists artifact_status text not null default 'legacy' check (artifact_status in ('legacy', 'ready', 'failed')),
add column if not exists compiler_version text,
add column if not exists runtime_version text,
add column if not exists dependency_manifest jsonb not null default '{"entries":[]}'::jsonb,
add column if not exists contains_admin_code boolean not null default false;

alter table public.workflow_versions
add column if not exists compiled_artifact jsonb,
add column if not exists review_status text not null default 'unreviewed' check (review_status in ('unreviewed', 'approved')),
add column if not exists review_count integer not null default 0,
add column if not exists review_required boolean not null default false,
add column if not exists review_warning boolean not null default false,
add column if not exists required_contributor_reviews integer not null default 0,
add column if not exists required_expert_reviews integer not null default 0,
add column if not exists contributor_review_count integer not null default 0,
add column if not exists expert_review_count integer not null default 0,
add column if not exists extra_contributor_reviews integer not null default 0,
add column if not exists extra_expert_reviews integer not null default 0,
add column if not exists artifact_status text not null default 'legacy' check (artifact_status in ('legacy', 'ready', 'failed')),
add column if not exists compiler_version text,
add column if not exists runtime_version text,
add column if not exists dependency_manifest jsonb not null default '{"entries":[]}'::jsonb,
add column if not exists contains_admin_code boolean not null default false;

update public.workflows
set
  review_status = 'approved',
  review_count = greatest(review_count, 3),
  contributor_review_count = greatest(contributor_review_count, greatest(review_count, 3))
where status = 'published' and review_status = 'unreviewed';

update public.workflow_versions
set
  review_status = 'approved',
  review_count = greatest(review_count, 3),
  contributor_review_count = greatest(contributor_review_count, greatest(review_count, 3))
where review_status = 'unreviewed'
  and exists (
    select 1
    from public.workflows w
    where w.id = public.workflow_versions.workflow_id
      and w.status = 'published'
  );

create index if not exists workflow_versions_workflow_version_idx
  on public.workflow_versions (workflow_id, version desc);

create index if not exists workflow_versions_published_at_idx
  on public.workflow_versions (published_at desc);

alter table public.workflows enable row level security;
alter table public.workflow_versions enable row level security;

create table if not exists public.workflow_reviews (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  workflow_version_id uuid references public.workflow_versions(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (workflow_id, reviewer_id)
);

alter table public.workflow_reviews enable row level security;

create table if not exists public.review_requests (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('workflow', 'node', 'core_page', 'update')),
  target_id text not null,
  workflow_id uuid references public.workflows(id) on delete cascade,
  workflow_version_id uuid references public.workflow_versions(id) on delete cascade,
  required boolean not null default false,
  warning_if_unreviewed boolean not null default false,
  required_contributor_reviews integer not null default 0,
  required_expert_reviews integer not null default 0,
  extra_contributor_reviews integer not null default 0,
  extra_expert_reviews integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reason text,
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (target_type, target_id, workflow_version_id)
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  review_request_id uuid not null references public.review_requests(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  reviewer_role text not null check (reviewer_role in ('contributor', 'expert', 'trusted_editor', 'admin')),
  review_kind text not null check (review_kind in ('contributor', 'expert')),
  created_at timestamptz not null default now(),
  unique (review_request_id, reviewer_id)
);

alter table public.review_requests enable row level security;
alter table public.reviews enable row level security;

create index if not exists review_requests_workflow_idx
  on public.review_requests (workflow_id, workflow_version_id);

create index if not exists reviews_request_kind_idx
  on public.reviews (review_request_id, review_kind);

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
  (status = 'published' and visibility in ('public', 'core'))
  or owner_id = auth.uid()
  or exists (
    select 1
    from public.profiles editor_profile
    where editor_profile.id = auth.uid()
      and editor_profile.role in ('contributor', 'expert', 'trusted_editor', 'admin')
      and (
        public.workflows.visibility = 'core'
        or public.workflows.status = 'pending_review'
      )
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
        (w.status = 'published' and w.visibility in ('public', 'core'))
        or w.owner_id = auth.uid()
        or exists (
          select 1
          from public.profiles editor_profile
          where editor_profile.id = auth.uid()
            and editor_profile.role in ('contributor', 'expert', 'trusted_editor', 'admin')
            and (
              w.visibility = 'core'
              or w.status = 'pending_review'
            )
        )
      )
  )
);

drop policy if exists "workflow_reviews_select_participants" on public.workflow_reviews;
create policy "workflow_reviews_select_participants"
on public.workflow_reviews
for select
to authenticated
using (
  reviewer_id = auth.uid()
  or exists (
    select 1
    from public.workflows w
    where w.id = public.workflow_reviews.workflow_id
      and (
        w.owner_id = auth.uid()
        or exists (
          select 1
          from public.profiles reviewer_profile
          where reviewer_profile.id = auth.uid()
            and reviewer_profile.role in ('contributor', 'expert', 'trusted_editor', 'admin')
        )
      )
  )
);

drop policy if exists "workflow_reviews_insert_via_rpc" on public.workflow_reviews;
create policy "workflow_reviews_insert_via_rpc"
on public.workflow_reviews
for insert
to authenticated
with check (false);

drop policy if exists "review_requests_select_participants" on public.review_requests;
create policy "review_requests_select_participants"
on public.review_requests
for select
to authenticated
using (
  requested_by = auth.uid()
  or exists (
    select 1
    from public.workflows w
    where w.id = public.review_requests.workflow_id
      and (
        w.owner_id = auth.uid()
        or w.status = 'published'
        or exists (
          select 1
          from public.profiles reviewer_profile
          where reviewer_profile.id = auth.uid()
            and reviewer_profile.role in ('contributor', 'expert', 'trusted_editor', 'admin')
        )
      )
  )
);

drop policy if exists "review_requests_insert_via_rpc" on public.review_requests;
create policy "review_requests_insert_via_rpc"
on public.review_requests
for insert
to authenticated
with check (false);

drop policy if exists "review_requests_update_via_rpc" on public.review_requests;
create policy "review_requests_update_via_rpc"
on public.review_requests
for update
to authenticated
using (false)
with check (false);

drop policy if exists "reviews_select_participants" on public.reviews;
create policy "reviews_select_participants"
on public.reviews
for select
to authenticated
using (
  reviewer_id = auth.uid()
  or exists (
    select 1
    from public.review_requests rr
    join public.workflows w on w.id = rr.workflow_id
    where rr.id = public.reviews.review_request_id
      and (
        w.owner_id = auth.uid()
        or exists (
          select 1
          from public.profiles reviewer_profile
          where reviewer_profile.id = auth.uid()
            and reviewer_profile.role in ('contributor', 'expert', 'trusted_editor', 'admin')
        )
      )
  )
);

drop policy if exists "reviews_insert_via_rpc" on public.reviews;
create policy "reviews_insert_via_rpc"
on public.reviews
for insert
to authenticated
with check (false);

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
  review_status,
  review_count,
  review_required,
  review_warning,
  required_contributor_reviews,
  required_expert_reviews,
  contributor_review_count,
  expert_review_count,
  extra_contributor_reviews,
  extra_expert_reviews,
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
  coalesce(w.review_status, 'approved'),
  coalesce(w.review_count, 3),
  coalesce(w.review_required, false),
  coalesce(w.review_warning, false),
  coalesce(w.required_contributor_reviews, 0),
  coalesce(w.required_expert_reviews, 0),
  coalesce(w.contributor_review_count, coalesce(w.review_count, 0)),
  coalesce(w.expert_review_count, 0),
  coalesce(w.extra_contributor_reviews, 0),
  coalesce(w.extra_expert_reviews, 0),
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

drop function if exists public.publish_workflow_version(uuid, text, text, text[], text, text, jsonb, jsonb);

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
  v_publish_status text;
  v_review_status text;
  v_review_count integer;
  v_review_required boolean;
  v_review_warning boolean;
  v_required_contributor_reviews integer;
  v_required_expert_reviews integer;
  v_is_admin boolean := false;
  v_can_publish_core boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if v_visibility not in ('private', 'public', 'core') then
    raise exception 'Unsupported workflow visibility: %', v_visibility;
  end if;

  v_publish_status := case
    when v_visibility = 'core' then 'pending_review'
    else 'published'
  end;
  v_review_status := case when v_visibility in ('public', 'core') then 'unreviewed' else 'approved' end;
  v_review_count := 0;
  v_review_required := v_visibility = 'core';
  v_review_warning := false;
  v_required_contributor_reviews := case
    when v_visibility = 'core' then 1
    when v_visibility = 'public' then 2
    else 0
  end;
  v_required_expert_reviews := case when v_visibility = 'core' then 1 else 0 end;

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
      review_status,
      review_count,
      review_required,
      review_warning,
      required_contributor_reviews,
      required_expert_reviews,
      contributor_review_count,
      expert_review_count,
      extra_contributor_reviews,
      extra_expert_reviews,
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
      v_publish_status,
      v_review_status,
      v_review_count,
      v_review_required,
      v_review_warning,
      v_required_contributor_reviews,
      v_required_expert_reviews,
      0,
      0,
      0,
      0,
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
      status = v_publish_status,
      review_status = v_review_status,
      review_count = v_review_count,
      review_required = v_review_required,
      review_warning = v_review_warning,
      required_contributor_reviews = v_required_contributor_reviews,
      required_expert_reviews = v_required_expert_reviews,
      contributor_review_count = 0,
      expert_review_count = 0,
      extra_contributor_reviews = 0,
      extra_expert_reviews = 0,
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

  delete from public.reviews existing_review
  using public.review_requests existing_request
  where existing_review.review_request_id = existing_request.id
    and existing_request.workflow_id = v_workflow.id;

  delete from public.review_requests
  where public.review_requests.workflow_id = v_workflow.id;

  delete from public.workflow_reviews
  where public.workflow_reviews.workflow_id = v_workflow.id;

  insert into public.workflow_versions (
    workflow_id,
    version,
    title,
    description,
    tags,
    visibility,
    review_status,
    review_count,
    review_required,
    review_warning,
    required_contributor_reviews,
    required_expert_reviews,
    contributor_review_count,
    expert_review_count,
    extra_contributor_reviews,
    extra_expert_reviews,
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
    v_review_status,
    v_review_count,
    v_review_required,
    v_review_warning,
    v_required_contributor_reviews,
    v_required_expert_reviews,
    0,
    0,
    0,
    0,
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

  if v_visibility in ('public', 'core') then
    insert into public.review_requests (
      target_type,
      target_id,
      workflow_id,
      workflow_version_id,
      required,
      warning_if_unreviewed,
      required_contributor_reviews,
      required_expert_reviews,
      requested_by
    )
    values (
      'workflow',
      v_workflow.id::text,
      v_workflow.id,
      v_version_id,
      v_review_required,
      v_review_warning,
      v_required_contributor_reviews,
      v_required_expert_reviews,
      v_user_id
    );
  end if;

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
    v_workflow.review_status,
    v_workflow.review_count,
    v_workflow.review_required,
    v_workflow.review_warning,
    v_workflow.required_contributor_reviews,
    v_workflow.required_expert_reviews,
    v_workflow.contributor_review_count,
    v_workflow.expert_review_count,
    v_workflow.extra_contributor_reviews,
    v_workflow.extra_expert_reviews,
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

create or replace function public.request_extra_workflow_review(
  p_workflow_id uuid,
  p_extra_contributors integer default 0,
  p_extra_experts integer default 0,
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
  v_reviewer_role text;
  v_extra_contributors integer := greatest(coalesce(p_extra_contributors, 0), 0);
  v_extra_experts integer := greatest(coalesce(p_extra_experts, 0), 0);
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select reviewer_profile.role
  into v_reviewer_role
  from public.profiles reviewer_profile
  where reviewer_profile.id = v_user_id;

  if v_reviewer_role not in ('contributor', 'expert', 'trusted_editor', 'admin') then
    raise exception 'Only contributors or experts can request more review';
  end if;

  if v_extra_contributors = 0 and v_extra_experts = 0 then
    raise exception 'Request at least one additional contributor or expert review';
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

  if not found then
    raise exception 'Workflow review request not found';
  end if;

  update public.review_requests
  set
    extra_contributor_reviews = least(extra_contributor_reviews + v_extra_contributors, 2),
    extra_expert_reviews = least(extra_expert_reviews + v_extra_experts, 1),
    status = 'pending',
    reason = nullif(trim(coalesce(p_reason, '')), ''),
    updated_at = now()
  where public.review_requests.id = v_request.id
  returning * into v_request;

  update public.workflows
  set
    review_status = 'unreviewed',
    status = case when v_request.required then 'pending_review' else 'published' end,
    extra_contributor_reviews = v_request.extra_contributor_reviews,
    extra_expert_reviews = v_request.extra_expert_reviews
  where public.workflows.id = v_workflow.id
  returning * into v_workflow;

  update public.workflow_versions
  set
    review_status = v_workflow.review_status,
    extra_contributor_reviews = v_workflow.extra_contributor_reviews,
    extra_expert_reviews = v_workflow.extra_expert_reviews
  where public.workflow_versions.id = v_workflow.current_version_id;

  update public.node_templates
  set
    review_status = v_workflow.review_status,
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
    exists (
      select 1
      from public.reviews my_review
      join public.review_requests rr on rr.id = my_review.review_request_id
      where rr.workflow_id = v_workflow.id
        and rr.workflow_version_id = v_workflow.current_version_id
        and my_review.reviewer_id = v_user_id
    );
end;
$$;

grant execute on function public.request_extra_workflow_review(uuid, integer, integer, text) to authenticated;

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
