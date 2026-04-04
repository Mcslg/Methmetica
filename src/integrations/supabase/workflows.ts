import type { Edge } from '@xyflow/react';
import type {
  CommunityWorkflowCard,
  WorkflowBlueprint,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowVisibility,
} from '../../community/types';
import type { AppNode } from '../../store/useStore';
import type { AppUser } from './types';
import { isSupabaseConfigured, supabase } from './client';
import { withSupabaseTimeout } from './utils';

type WorkflowStatus = 'draft' | 'published' | 'archived';

export type WorkflowPayload = {
  id?: string | null;
  title: string;
  description: string;
  tags: string[];
  visibility: WorkflowVisibility;
  status?: WorkflowStatus;
  nodes: AppNode[];
  edges: Edge[];
  author: AppUser;
};

type WorkflowRow = {
  id: string;
  owner_id: string;
  slug: string | null;
  title: string;
  description: string;
  tags: string[] | null;
  visibility: WorkflowVisibility;
  status: WorkflowStatus;
  workflow_json: {
    nodes?: AppNode[];
    edges?: Edge[];
    meta?: {
      authorName?: string;
      authorId?: string;
      authorEmail?: string;
      description?: string;
      title?: string;
      tags?: string[];
    };
  } | null;
  published_at: string | null;
  updated_at: string;
  created_at: string;
};

const FALLBACK_AUTHOR = 'Methmatica Community';
const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `workflow-${Date.now()}`;

const rowToCard = (row: WorkflowRow): CommunityWorkflowCard => {
  const graphNodes = row.workflow_json?.nodes ?? [];
  const graphEdges = row.workflow_json?.edges ?? [];
  const tags = row.tags ?? [];
  const author = row.workflow_json?.meta?.authorName || FALLBACK_AUTHOR;

  return {
    id: row.id,
    slug: row.slug || slugify(row.title),
    title: row.title,
    summary: row.description,
    author,
    difficulty: row.visibility === 'core' ? '核心' : '社群',
    visibility: row.visibility,
    tags,
    updatedAt: row.updated_at,
    featuredTemplateIds: [],
    nodeCount: graphNodes.length,
    edgeCount: graphEdges.length,
    seoTitle: `${row.title} | Methmatica`,
    seoDescription: row.description || `${row.title} 的工作流頁面`,
  };
};

const normalizeNodes = (nodes: AppNode[] = []): WorkflowGraphNode[] =>
  nodes.map(node => ({
    ...node,
    type: node.type || 'textNode',
  }));

const normalizeEdges = (edges: Edge[] = []): WorkflowGraphEdge[] =>
  edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
    ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
    ...(typeof edge.label === 'string' ? { label: edge.label } : {}),
  }));

const rowToBlueprint = (row: WorkflowRow): WorkflowBlueprint => ({
  card: rowToCard(row),
  nodes: normalizeNodes(row.workflow_json?.nodes ?? []),
  edges: normalizeEdges(row.workflow_json?.edges ?? []),
});

export async function listPublicWorkflows() {
  if (!supabase) return [];

  const { data, error } = await withSupabaseTimeout(
    supabase
      .from('workflows')
      .select('id, owner_id, slug, title, description, tags, visibility, status, workflow_json, published_at, updated_at, created_at')
      .in('visibility', ['public', 'core'])
      .eq('status', 'published')
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false }),
    'Loading public workflows'
  );

  if (error) throw error;
  return ((data ?? []) as WorkflowRow[]).map(rowToCard);
}

export async function getWorkflowBlueprintFromSupabase(workflowId: string) {
  if (!supabase) return null;

  const { data, error } = await withSupabaseTimeout(
    supabase
      .from('workflows')
      .select('id, owner_id, slug, title, description, tags, visibility, status, workflow_json, published_at, updated_at, created_at')
      .eq('id', workflowId)
      .maybeSingle(),
    'Opening workflow'
  );

  if (error) throw error;
  if (!data) return null;
  return rowToBlueprint(data as WorkflowRow);
}

export async function publishWorkflowToSupabase(payload: WorkflowPayload) {
  if (!supabase) throw new Error('Supabase is not configured.');

  const title = payload.title.trim() || 'Untitled Workflow';
  const description = payload.description.trim();
  const tags = payload.tags.filter(Boolean);
  const slug = slugify(title);

  const workflowJson = {
    nodes: payload.nodes,
    edges: payload.edges,
    meta: {
      title,
      description,
      tags,
      authorName: payload.author.name,
      authorId: payload.author.id,
      authorEmail: payload.author.email,
    },
  };

  const baseRecord = {
    owner_id: payload.author.id,
    title,
    description,
    tags,
    visibility: payload.visibility,
    status: payload.status ?? 'published',
    slug,
    workflow_json: workflowJson,
    published_at: new Date().toISOString(),
  };

  const query = payload.id
    ? supabase
        .from('workflows')
        .update(baseRecord)
        .eq('id', payload.id)
        .select('id, owner_id, slug, title, description, tags, visibility, status, workflow_json, published_at, updated_at, created_at')
        .single()
    : supabase
        .from('workflows')
        .insert(baseRecord)
        .select('id, owner_id, slug, title, description, tags, visibility, status, workflow_json, published_at, updated_at, created_at')
        .single();

  const { data, error } = await withSupabaseTimeout(query, 'Publishing workflow');
  if (error) throw error;
  return rowToBlueprint(data as WorkflowRow);
}

export async function runSupabaseHealthCheck() {
  const storageKeyPrefix = 'sb-';
  const authTokenSuffix = '-auth-token';
  const storedSessionKey = typeof window !== 'undefined'
    ? Object.keys(window.localStorage).find((key) => key.startsWith(storageKeyPrefix) && key.endsWith(authTokenSuffix)) || null
    : null;

  if (!supabase || !isSupabaseConfigured) {
    return {
      configured: false,
      storedSession: false,
      authApiReachable: false,
      workflowsReachable: false,
      message: 'Supabase envs are missing.',
    };
  }

  try {
    const {
      data: sessionData,
      error: sessionError,
    } = await withSupabaseTimeout(
      supabase.auth.getSession(),
      'Checking auth session'
    );

    const authApiReachable = !sessionError;

    const { error: workflowError } = await withSupabaseTimeout(
      supabase
        .from('workflows')
        .select('id', { count: 'exact', head: true }),
      'Checking workflows table'
    );

    const workflowsReachable = !workflowError;

    return {
      configured: true,
      storedSession: Boolean(storedSessionKey),
      authApiReachable,
      workflowsReachable,
      sessionUserId: sessionData.session?.user?.id ?? null,
      storedSessionKey,
      message: workflowError?.message || sessionError?.message || 'Supabase session and workflows table are ready.',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Supabase health check failed.';
    return {
      configured: true,
      storedSession: Boolean(storedSessionKey),
      authApiReachable: false,
      workflowsReachable: false,
      sessionUserId: null,
      storedSessionKey,
      message,
    };
  }
}
