create table if not exists public.core_proposals (
  id uuid primary key default gen_random_uuid(),
  core_workflow_id uuid not null references public.workflows(id) on delete cascade,
  base_version_id uuid references public.workflow_versions(id) on delete set null,
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  summary text not null default '',
  proposal_kind text not null default 'content' check (proposal_kind in ('content', 'behavior', 'fix', 'hotfix')),
  status text not null default 'submitted' check (status in ('draft', 'submitted', 'needs_changes', 'approved', 'merged', 'rejected', 'superseded')),
  workflow_json jsonb not null default '{}'::jsonb,
  compiled_artifact jsonb,
  diagnostics jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists core_proposals_core_workflow_idx
  on public.core_proposals (core_workflow_id, created_at desc);

create index if not exists core_proposals_status_idx
  on public.core_proposals (status, updated_at desc);

alter table public.core_proposals enable row level security;

drop policy if exists "core_proposals_select_visible" on public.core_proposals;
create policy "core_proposals_select_visible"
on public.core_proposals
for select
using (
  author_id = auth.uid()
  or exists (
    select 1
    from public.profiles reviewer_profile
    where reviewer_profile.id = auth.uid()
      and reviewer_profile.role in ('contributor', 'expert', 'trusted_editor', 'admin')
  )
  or status in ('approved', 'merged')
);

drop policy if exists "core_proposals_insert_own" on public.core_proposals;
create policy "core_proposals_insert_own"
on public.core_proposals
for insert
with check (author_id = auth.uid());

drop policy if exists "core_proposals_update_author_or_admin" on public.core_proposals;
create policy "core_proposals_update_author_or_admin"
on public.core_proposals
for update
using (
  author_id = auth.uid()
  or exists (
    select 1
    from public.profiles admin_profile
    where admin_profile.id = auth.uid()
      and admin_profile.role in ('trusted_editor', 'admin')
  )
)
with check (
  author_id = auth.uid()
  or exists (
    select 1
    from public.profiles admin_profile
    where admin_profile.id = auth.uid()
      and admin_profile.role in ('trusted_editor', 'admin')
  )
);

create or replace function public.set_core_proposals_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists core_proposals_set_updated_at on public.core_proposals;
create trigger core_proposals_set_updated_at
before update on public.core_proposals
for each row
execute function public.set_core_proposals_updated_at();

create or replace function public.submit_core_workflow_proposal(
  p_core_workflow_id uuid,
  p_base_version_id uuid,
  p_title text,
  p_summary text,
  p_proposal_kind text,
  p_workflow_json jsonb,
  p_compiled_artifact jsonb default null
)
returns table (
  proposal_id uuid,
  core_workflow_id uuid,
  base_version_id uuid,
  status text,
  title text,
  summary text,
  proposal_kind text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_core_workflow public.workflows%rowtype;
  v_proposal public.core_proposals%rowtype;
  v_kind text := coalesce(nullif(trim(p_proposal_kind), ''), 'content');
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if v_kind not in ('content', 'behavior', 'fix', 'hotfix') then
    raise exception 'Unsupported proposal kind: %', v_kind;
  end if;

  select *
  into v_core_workflow
  from public.workflows
  where public.workflows.id = p_core_workflow_id
    and public.workflows.visibility = 'core';

  if not found then
    raise exception 'Core workflow not found';
  end if;

  if p_base_version_id is not null and p_base_version_id <> v_core_workflow.current_version_id and v_kind in ('behavior', 'fix') then
    raise exception 'Core workflow has a newer version. Please fork the latest version before submitting behavior or fix proposals.';
  end if;

  insert into public.core_proposals (
    core_workflow_id,
    base_version_id,
    author_id,
    title,
    summary,
    proposal_kind,
    status,
    workflow_json,
    compiled_artifact
  )
  values (
    p_core_workflow_id,
    p_base_version_id,
    v_user_id,
    coalesce(nullif(trim(p_title), ''), 'Untitled core proposal'),
    coalesce(p_summary, ''),
    v_kind,
    'submitted',
    coalesce(p_workflow_json, '{}'::jsonb),
    p_compiled_artifact
  )
  returning * into v_proposal;

  return query
  select
    v_proposal.id,
    v_proposal.core_workflow_id,
    v_proposal.base_version_id,
    v_proposal.status,
    v_proposal.title,
    v_proposal.summary,
    v_proposal.proposal_kind,
    v_proposal.created_at;
end;
$$;

grant execute on function public.submit_core_workflow_proposal(uuid, uuid, text, text, text, jsonb, jsonb) to authenticated;

create or replace view public.core_proposal_queue
with (security_invoker = true)
as
select
  cp.id,
  cp.core_workflow_id,
  cp.base_version_id,
  cp.author_id,
  cp.title,
  cp.summary,
  cp.proposal_kind,
  cp.status,
  cp.created_at,
  cp.updated_at,
  w.title as core_title,
  w.slug as core_slug,
  w.current_version_id,
  coalesce(p.display_name, p.email, 'Methmatica contributor') as author_name
from public.core_proposals cp
join public.workflows w on w.id = cp.core_workflow_id
left join public.profiles p on p.id = cp.author_id
where cp.status in ('submitted', 'needs_changes');

grant select on public.core_proposal_queue to authenticated;
