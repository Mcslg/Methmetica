create table if not exists public.node_comments (
  id text primary key,
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  workflow_version_id uuid references public.workflow_versions(id) on delete set null,
  node_id text not null,
  node_label text not null default '',
  kind text not null default 'comment' check (kind in ('comment', 'question', 'request', 'issue')),
  status text not null default 'open' check (status in ('open', 'resolved', 'hidden')),
  body text not null,
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null default 'Anonymous',
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists node_comments_forum_idx
  on public.node_comments (kind, status, created_at desc)
  where kind in ('question', 'request', 'issue') and status <> 'hidden';

create index if not exists node_comments_workflow_idx
  on public.node_comments (workflow_id, node_id, created_at desc);

alter table public.node_comments enable row level security;

create or replace function public.set_node_comments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists node_comments_set_updated_at on public.node_comments;
create trigger node_comments_set_updated_at
before update on public.node_comments
for each row
execute function public.set_node_comments_updated_at();

drop policy if exists "node_comments_select_visible" on public.node_comments;
create policy "node_comments_select_visible"
on public.node_comments
for select
to anon, authenticated
using (
  status <> 'hidden'
  and exists (
    select 1
    from public.workflows w
    where w.id = public.node_comments.workflow_id
      and (
        (w.status = 'published' and w.visibility in ('public', 'core'))
        or w.owner_id = auth.uid()
        or exists (
          select 1
          from public.profiles reviewer_profile
          where reviewer_profile.id = auth.uid()
            and reviewer_profile.role in ('contributor', 'expert', 'trusted_editor', 'admin')
            and (
              w.visibility = 'core'
              or w.status = 'pending_review'
            )
        )
      )
  )
);

drop policy if exists "node_comments_insert_authenticated_visible_workflow" on public.node_comments;
create policy "node_comments_insert_authenticated_visible_workflow"
on public.node_comments
for insert
to authenticated
with check (
  author_id = auth.uid()
  and exists (
    select 1
    from public.workflows w
    where w.id = workflow_id
      and (
        (w.status = 'published' and w.visibility in ('public', 'core'))
        or w.owner_id = auth.uid()
      )
  )
);

drop policy if exists "node_comments_update_author_owner_reviewer" on public.node_comments;
create policy "node_comments_update_author_owner_reviewer"
on public.node_comments
for update
to authenticated
using (
  author_id = auth.uid()
  or exists (
    select 1
    from public.workflows w
    where w.id = public.node_comments.workflow_id
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
)
with check (
  status in ('open', 'resolved', 'hidden')
);
