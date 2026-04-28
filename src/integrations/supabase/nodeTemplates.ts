import type { CommunityNodeTemplate, WorkflowVisibility } from '../../community/types';
import type { SupabaseNodeTemplateRow } from '../../community/schema';
import { supabase } from './client';
import { withSupabaseTimeout } from './utils';

type NodeTemplateVisibility = 'community' | 'core';

type NodeTemplatePayload = {
  template: CommunityNodeTemplate;
  sourceWorkflowId: string;
  sourceWorkflowSlug?: string;
  workflowVisibility: WorkflowVisibility;
  publishedAt: string;
};

type NodeTemplateRow = Omit<SupabaseNodeTemplateRow, 'payload' | 'visibility'> & {
  visibility: NodeTemplateVisibility;
  review_status?: 'unreviewed' | 'approved' | null;
  review_count?: number | null;
  source_workflow_id?: string | null;
  source_workflow_slug?: string | null;
  payload: NodeTemplatePayload | CommunityNodeTemplate | null;
};

type PublishNodeTemplatePayload = {
  template: CommunityNodeTemplate;
  sourceWorkflowId: string;
  sourceWorkflowSlug?: string;
  workflowVisibility: WorkflowVisibility;
};

const toTemplateVisibility = (visibility: WorkflowVisibility): NodeTemplateVisibility => (
  visibility === 'core' ? 'core' : 'community'
);

const rowToTemplate = (row: NodeTemplateRow): CommunityNodeTemplate | null => {
  const payload = row.payload;
  if (!payload) return null;

  const template = 'template' in payload ? payload.template : payload;
  if (!template) return null;

  return {
    ...template,
    id: row.id,
    slug: row.slug || template.slug,
    title: row.title || template.title,
    summary: row.summary || template.summary,
    version: row.version || template.version,
    visibility: row.visibility === 'core' ? 'core' : template.visibility,
    relatedWorkflowIds: Array.from(new Set([
      ...template.relatedWorkflowIds,
      ...('sourceWorkflowId' in payload ? [payload.sourceWorkflowId] : []),
    ].filter(Boolean))),
  };
};

export async function publishNodeTemplateToSupabase({
  template,
  sourceWorkflowId,
  sourceWorkflowSlug,
  workflowVisibility,
}: PublishNodeTemplatePayload) {
  if (!supabase) throw new Error('Supabase is not configured.');

  const publishedAt = new Date().toISOString();
  const payload: NodeTemplatePayload = {
    template,
    sourceWorkflowId,
    sourceWorkflowSlug,
    workflowVisibility,
    publishedAt,
  };

  const record = {
    id: template.id,
    slug: template.slug,
    title: template.title,
    summary: template.summary,
    visibility: toTemplateVisibility(workflowVisibility),
    review_status: 'unreviewed',
    review_count: 0,
    version: template.version,
    source_workflow_id: sourceWorkflowId,
    source_workflow_slug: sourceWorkflowSlug,
    payload,
  };

  const { data, error } = await withSupabaseTimeout(
    supabase
      .from('node_templates')
      .upsert(record, { onConflict: 'id' })
      .select('id, slug, title, summary, visibility, review_status, review_count, version, source_workflow_id, source_workflow_slug, payload, updated_at')
      .single(),
    'Publishing node template'
  );

  if (error) throw error;
  return rowToTemplate(data as NodeTemplateRow);
}

export async function listPublicNodeTemplates() {
  if (!supabase) return [];

  const { data, error } = await withSupabaseTimeout(
    supabase
      .from('node_templates')
      .select('id, slug, title, summary, visibility, review_status, review_count, version, source_workflow_id, source_workflow_slug, payload, updated_at')
      .in('visibility', ['community', 'core'])
      .eq('review_status', 'approved')
      .order('updated_at', { ascending: false }),
    'Loading public node templates'
  );

  if (error) throw error;
  return ((data ?? []) as NodeTemplateRow[])
    .map(rowToTemplate)
    .filter((template): template is CommunityNodeTemplate => Boolean(template));
}
