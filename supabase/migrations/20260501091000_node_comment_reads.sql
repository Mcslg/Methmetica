create table if not exists public.node_comment_reads (
  comment_id text not null references public.node_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists node_comment_reads_user_idx
  on public.node_comment_reads (user_id, read_at desc);

alter table public.node_comment_reads enable row level security;

drop policy if exists "node_comment_reads_select_own" on public.node_comment_reads;
create policy "node_comment_reads_select_own"
on public.node_comment_reads
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "node_comment_reads_insert_own" on public.node_comment_reads;
create policy "node_comment_reads_insert_own"
on public.node_comment_reads
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.node_comments nc
    where nc.id = comment_id
      and nc.status <> 'hidden'
  )
);

drop policy if exists "node_comment_reads_update_own" on public.node_comment_reads;
create policy "node_comment_reads_update_own"
on public.node_comment_reads
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
