import type { CommunityNodeTemplate, WorkflowChangeType, WorkflowPublishKind, WorkflowVisibility } from '../../community/types';
import type { SupabaseNodeTemplateRow } from '../../community/schema';
import { supabase } from './client';
import { withSupabaseTimeout } from './utils';
import { getSupersededVersionMessage } from './workflows';

type NodeTemplateVisibility = 'community' | 'core';

type NodeTemplatePayload = {
  template: CommunityNodeTemplate;
  sourceWorkflowId: string;
  sourceWorkflowVersionId?: string;
  sourceWorkflowSlug?: string;
  workflowVisibility: WorkflowVisibility;
  publishKind: WorkflowPublishKind;
  publishedAt: string;
};

type NodeTemplateRow = Omit<SupabaseNodeTemplateRow, 'payload' | 'visibility'> & {
  visibility: NodeTemplateVisibility;
  review_status?: 'unreviewed' | 'approved' | null;
  review_count?: number | null;
  review_required?: boolean | null;
  review_warning?: boolean | null;
  required_contributor_reviews?: number | null;
  required_expert_reviews?: number | null;
  contributor_review_count?: number | null;
  expert_review_count?: number | null;
  extra_contributor_reviews?: number | null;
  extra_expert_reviews?: number | null;
  source_workflow_id?: string | null;
  source_workflow_version_id?: string | null;
  source_workflow_slug?: string | null;
  publish_kind?: WorkflowPublishKind | null;
  payload: NodeTemplatePayload | CommunityNodeTemplate | null;
};

type WorkflowVersionUpdateRow = {
  id: string;
  workflow_id: string;
  version: number;
  change_type: WorkflowChangeType | null;
  update_summary: string | null;
  warning_message: string | null;
  supersedes_version_id: string | null;
};

type PublishNodeTemplatePayload = {
  template: CommunityNodeTemplate;
  sourceWorkflowId: string;
  sourceWorkflowVersionId?: string;
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
    reviewStatus: row.review_status ?? template.reviewStatus,
    reviewCount: row.review_count ?? template.reviewCount,
    reviewRequired: row.review_required ?? template.reviewRequired,
    reviewWarning: row.review_warning ?? template.reviewWarning,
    requiredContributorReviews: row.required_contributor_reviews ?? template.requiredContributorReviews,
    requiredExpertReviews: row.required_expert_reviews ?? template.requiredExpertReviews,
    contributorReviewCount: row.contributor_review_count ?? template.contributorReviewCount,
    expertReviewCount: row.expert_review_count ?? template.expertReviewCount,
    extraContributorReviews: row.extra_contributor_reviews ?? template.extraContributorReviews,
    extraExpertReviews: row.extra_expert_reviews ?? template.extraExpertReviews,
    relatedWorkflowIds: Array.from(new Set([
      ...template.relatedWorkflowIds,
      ...('sourceWorkflowId' in payload ? [payload.sourceWorkflowId] : []),
    ].filter((workflowId): workflowId is string => Boolean(workflowId)))),
    sourceWorkflowId: row.source_workflow_id ?? template.sourceWorkflowId,
    sourceWorkflowVersionId: row.source_workflow_version_id ?? template.sourceWorkflowVersionId,
    sourceWorkflowSlug: row.source_workflow_slug ?? template.sourceWorkflowSlug,
    publishKind: row.publish_kind ?? template.publishKind ?? 'node',
  };
};

export async function publishNodeTemplateToSupabase({
  template,
  sourceWorkflowId,
  sourceWorkflowVersionId,
  sourceWorkflowSlug,
  workflowVisibility,
}: PublishNodeTemplatePayload) {
  if (!supabase) throw new Error('Supabase is not configured.');

  const publishedAt = new Date().toISOString();
  const payload: NodeTemplatePayload = {
    template,
    sourceWorkflowId,
    sourceWorkflowVersionId,
    sourceWorkflowSlug,
    workflowVisibility,
    publishKind: 'node',
    publishedAt,
  };
  const isCore = workflowVisibility === 'core';

  const record = {
    id: template.id,
    slug: template.slug,
    title: template.title,
    summary: template.summary,
    visibility: toTemplateVisibility(workflowVisibility),
    review_status: 'unreviewed',
    review_count: 0,
    review_required: isCore,
    review_warning: !isCore,
    required_contributor_reviews: isCore ? 2 : 3,
    required_expert_reviews: isCore ? 1 : 0,
    contributor_review_count: 0,
    expert_review_count: 0,
    extra_contributor_reviews: 0,
    extra_expert_reviews: 0,
    version: template.version,
    source_workflow_id: sourceWorkflowId,
    source_workflow_version_id: sourceWorkflowVersionId ?? null,
    source_workflow_slug: sourceWorkflowSlug,
    publish_kind: 'node',
    payload,
  };

  const { data, error } = await withSupabaseTimeout(
    supabase
      .from('node_templates')
      .upsert(record, { onConflict: 'id' })
      .select('id, slug, title, summary, visibility, review_status, review_count, review_required, review_warning, required_contributor_reviews, required_expert_reviews, contributor_review_count, expert_review_count, extra_contributor_reviews, extra_expert_reviews, version, source_workflow_id, source_workflow_version_id, source_workflow_slug, publish_kind, payload, updated_at')
      .single(),
    'Publishing node template'
  );

  if (error) throw error;
  return rowToTemplate(data as NodeTemplateRow);
}

const enrichTemplatesWithUpdateStatus = async (templates: CommunityNodeTemplate[]): Promise<CommunityNodeTemplate[]> => {
  if (!supabase || templates.length === 0) return templates;

  const sourceVersionIds = templates
    .map(template => template.sourceWorkflowVersionId)
    .filter((versionId): versionId is string => Boolean(versionId));
  if (sourceVersionIds.length === 0) return templates;

  const { data, error } = await withSupabaseTimeout(
    supabase
      .from('workflow_versions')
      .select('id, workflow_id, version, change_type, update_summary, warning_message, supersedes_version_id')
      .in('supersedes_version_id', sourceVersionIds),
    'Loading node template updates',
    2000,
  );

  if (error) {
    console.warn('[node-templates] update status unavailable:', error);
    return templates;
  }

  const updateBySupersededId = new Map<string, WorkflowVersionUpdateRow>();
  ((data ?? []) as WorkflowVersionUpdateRow[]).forEach((row) => {
    if (!row.supersedes_version_id || !['feature', 'fix', 'hotfix'].includes(row.change_type ?? '')) return;
    const existing = updateBySupersededId.get(row.supersedes_version_id);
    if (!existing || row.version > existing.version) {
      updateBySupersededId.set(row.supersedes_version_id, row);
    }
  });

  return templates.map((template) => {
    const update = template.sourceWorkflowVersionId
      ? updateBySupersededId.get(template.sourceWorkflowVersionId)
      : undefined;
    if (!update) return template;

    const updateMessage = getSupersededVersionMessage({
      changeType: update.change_type,
      warningMessage: update.warning_message,
    }) ?? '這個節點已有新版。';

    return {
      ...template,
      updateAvailable: true,
      updateSeverity: update.change_type === 'hotfix' || update.change_type === 'fix' ? update.change_type : 'feature' as const,
      updateMessage,
      latestWorkflowVersionId: update.id,
      latestWorkflowVersion: update.version,
    };
  });
};

export async function listPublicNodeTemplates() {
  if (!supabase) return [];

  const { data, error } = await withSupabaseTimeout(
    supabase
      .from('node_templates')
      .select('id, slug, title, summary, visibility, review_status, review_count, review_required, review_warning, required_contributor_reviews, required_expert_reviews, extra_contributor_reviews, extra_expert_reviews, contributor_review_count, expert_review_count, version, source_workflow_id, source_workflow_version_id, source_workflow_slug, publish_kind, payload, updated_at')
      .in('visibility', ['community', 'core'])
      .or('review_required.eq.false,review_status.eq.approved,review_warning.eq.true')
      .order('updated_at', { ascending: false }),
    'Loading public node templates'
  );

  if (error) throw error;
  const templates = ((data ?? []) as NodeTemplateRow[])
    .map(rowToTemplate)
    .filter((template): template is CommunityNodeTemplate => Boolean(template));
  return enrichTemplatesWithUpdateStatus(templates);
}
