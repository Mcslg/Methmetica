create table if not exists public.workflow_interactions (
  id bigserial primary key,
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  interaction text not null check (interaction in ('view', 'like', 'bookmark', 'fork')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists workflow_interactions_unique_user_action
  on public.workflow_interactions (workflow_id, user_id, interaction)
  where interaction in ('like', 'bookmark', 'fork');

create index if not exists workflow_interactions_workflow_idx
  on public.workflow_interactions (workflow_id, interaction, created_at desc);

create index if not exists workflow_interactions_user_idx
  on public.workflow_interactions (user_id, interaction, created_at desc);

alter table public.workflow_interactions enable row level security;

create or replace function public.set_workflow_interactions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workflow_interactions_set_updated_at on public.workflow_interactions;
create trigger workflow_interactions_set_updated_at
before update on public.workflow_interactions
for each row
execute function public.set_workflow_interactions_updated_at();

create or replace function public.record_workflow_view(
  p_workflow_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.workflows w
    where w.id = p_workflow_id
      and w.status = 'published'
      and w.visibility in ('public', 'core')
  ) then
    return;
  end if;

  insert into public.workflow_interactions (workflow_id, user_id, interaction, metadata)
  values (p_workflow_id, auth.uid(), 'view', coalesce(p_metadata, '{}'::jsonb));
end;
$$;

create or replace function public.set_workflow_interaction(
  p_workflow_id uuid,
  p_interaction text,
  p_enabled boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_interaction not in ('like', 'bookmark', 'fork') then
    raise exception 'Unsupported interaction type: %', p_interaction;
  end if;

  if not exists (
    select 1
    from public.workflows w
    where w.id = p_workflow_id
      and w.status = 'published'
      and w.visibility in ('public', 'core')
  ) then
    raise exception 'Workflow is not publicly available';
  end if;

  if p_enabled then
    insert into public.workflow_interactions (workflow_id, user_id, interaction)
    values (p_workflow_id, v_user_id, p_interaction)
    on conflict (workflow_id, user_id, interaction)
    where interaction in ('like', 'bookmark', 'fork')
    do update set updated_at = now();
  else
    delete from public.workflow_interactions wi
    where wi.workflow_id = p_workflow_id
      and wi.user_id = v_user_id
      and wi.interaction = p_interaction;
  end if;
end;
$$;

create or replace function public.get_workflow_engagement(
  p_workflow_ids uuid[] default null
)
returns table (
  workflow_id uuid,
  view_count bigint,
  like_count bigint,
  bookmark_count bigint,
  fork_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    w.id as workflow_id,
    count(*) filter (where wi.interaction = 'view') as view_count,
    count(*) filter (where wi.interaction = 'like') as like_count,
    count(*) filter (where wi.interaction = 'bookmark') as bookmark_count,
    count(*) filter (where wi.interaction = 'fork') as fork_count
  from public.workflows w
  left join public.workflow_interactions wi on wi.workflow_id = w.id
  where
    w.status = 'published'
    and w.visibility in ('public', 'core')
    and (p_workflow_ids is null or w.id = any(p_workflow_ids))
  group by w.id;
$$;

create or replace function public.get_my_workflow_interactions(
  p_workflow_ids uuid[] default null
)
returns table (
  workflow_id uuid,
  liked boolean,
  bookmarked boolean,
  forked boolean
)
language sql
security definer
set search_path = public
as $$
  select
    w.id as workflow_id,
    exists (
      select 1
      from public.workflow_interactions wi
      where wi.workflow_id = w.id
        and wi.user_id = auth.uid()
        and wi.interaction = 'like'
    ) as liked,
    exists (
      select 1
      from public.workflow_interactions wi
      where wi.workflow_id = w.id
        and wi.user_id = auth.uid()
        and wi.interaction = 'bookmark'
    ) as bookmarked,
    exists (
      select 1
      from public.workflow_interactions wi
      where wi.workflow_id = w.id
        and wi.user_id = auth.uid()
        and wi.interaction = 'fork'
    ) as forked
  from public.workflows w
  where
    auth.uid() is not null
    and w.status = 'published'
    and w.visibility in ('public', 'core')
    and (p_workflow_ids is null or w.id = any(p_workflow_ids));
$$;

revoke all on public.workflow_interactions from anon, authenticated;
grant execute on function public.record_workflow_view(uuid, jsonb) to anon, authenticated;
grant execute on function public.set_workflow_interaction(uuid, text, boolean) to authenticated;
grant execute on function public.get_workflow_engagement(uuid[]) to anon, authenticated;
grant execute on function public.get_my_workflow_interactions(uuid[]) to authenticated;
