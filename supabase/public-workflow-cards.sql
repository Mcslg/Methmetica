create or replace view public.public_workflow_cards
with (security_invoker = true)
as
select
  w.id,
  coalesce(nullif(w.slug, ''), 'workflow-' || replace(w.id::text, '-', '')) as slug,
  w.title,
  w.description as summary,
  coalesce(nullif(w.workflow_json -> 'meta' ->> 'authorName', ''), 'Methmatica Community') as author,
  case when w.visibility = 'core' then '核心' else '社群' end as difficulty,
  w.visibility,
  w.tags,
  w.updated_at,
  coalesce(jsonb_array_length(w.workflow_json -> 'nodes'), 0) as node_count,
  coalesce(jsonb_array_length(w.workflow_json -> 'edges'), 0) as edge_count
from public.workflows w
where
  w.status = 'published'
  and w.visibility in ('public', 'core');

grant select on public.public_workflow_cards to anon, authenticated;
