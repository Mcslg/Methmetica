drop view if exists public.public_workflow_cards;

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
  w.review_status,
  w.review_count,
  w.review_required,
  w.review_warning,
  w.required_contributor_reviews,
  w.required_expert_reviews,
  w.contributor_review_count,
  w.expert_review_count,
  w.extra_contributor_reviews,
  w.extra_expert_reviews,
  w.featured,
  w.featured_at,
  w.curation_score,
  coalesce(jsonb_array_length(w.workflow_json -> 'nodes'), 0) as node_count,
  coalesce(jsonb_array_length(w.workflow_json -> 'edges'), 0) as edge_count
from public.workflows w
where
  w.visibility in ('public', 'core')
  and (
    w.status = 'published'
    or (
      w.status = 'pending_review'
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

grant select on public.public_workflow_cards to anon, authenticated;
