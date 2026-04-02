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
  metadata: Record<string, any>;
};

export type SupabaseWorkflowNodeRow = {
  id: string;
  workflow_id: string;
  node_type: string;
  payload: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export type SupabaseNodeTemplateRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  visibility: 'community' | 'core';
  version: string;
  payload: Record<string, any>;
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

