export const SUPABASE_TABLES = {
  workflows: 'workflows',
  workflowNodes: 'workflow_nodes',
  nodeTemplates: 'node_templates',
  coreNodes: 'core_nodes',
  workflowLinks: 'workflow_links',
} as const;

export type SupabaseWorkflowRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  visibility: 'public' | 'private' | 'core';
  author_id: string | null;
  updated_at: string;
  metadata: Record<string, unknown>;
};

export type SupabaseWorkflowNodeRow = {
  id: string;
  workflow_id: string;
  node_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type SupabaseNodeTemplateRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  visibility: 'community' | 'core';
  review_status?: 'unreviewed' | 'approved';
  review_count?: number;
  review_required?: boolean;
  review_warning?: boolean;
  required_contributor_reviews?: number;
  required_expert_reviews?: number;
  contributor_review_count?: number;
  expert_review_count?: number;
  extra_contributor_reviews?: number;
  extra_expert_reviews?: number;
  version: string;
  payload: Record<string, unknown>;
  updated_at: string;
};

export type SupabaseCoreNodeRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  canonical_template_id: string;
  trusted_only: boolean;
  updated_at: string;
};
