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
import type { CompiledWorkflowArtifact } from '../../utils/workflowCompiler';
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
  compiledArtifact?: CompiledWorkflowArtifact;
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
  compiled_artifact?: CompiledWorkflowArtifact | null;
  artifact_status?: string | null;
  compiler_version?: string | null;
  runtime_version?: string | null;
  dependency_manifest?: CompiledWorkflowArtifact['dependencyManifest'] | null;
  contains_admin_code?: boolean | null;
  published_at: string | null;
  updated_at: string;
  created_at: string;
  current_version_id?: string | null;
  current_version?: number | null;
  workflow_version_id?: string | null;
};

type PublicWorkflowCardRow = {
  id: string;
  slug: string | null;
  title: string;
  summary: string;
  author: string;
  difficulty: string;
  visibility: WorkflowVisibility;
  tags: string[] | null;
  updated_at: string;
  node_count: number | null;
  edge_count: number | null;
};

export type WorkflowVersionSummary = {
  id: string;
  workflowId: string;
  version: number;
  title: string;
  description: string;
  tags: string[];
  visibility: WorkflowVisibility;
  publishedAt: string;
  createdAt: string;
  isCurrent: boolean;
  artifactStatus?: string | null;
  compilerVersion?: string | null;
  runtimeVersion?: string | null;
  dependencyCount?: number;
  containsAdminCode?: boolean;
};

type WorkflowVersionRow = {
  id: string;
  workflow_id: string;
  version: number;
  title: string;
  description: string;
  tags: string[] | null;
  visibility: WorkflowVisibility;
  workflow_json: WorkflowRow['workflow_json'];
  compiled_artifact?: CompiledWorkflowArtifact | null;
  artifact_status?: string | null;
  compiler_version?: string | null;
  runtime_version?: string | null;
  dependency_manifest?: CompiledWorkflowArtifact['dependencyManifest'] | null;
  contains_admin_code?: boolean | null;
  created_by: string;
  published_at: string;
  created_at: string;
};

type WorkflowEngagementRow = {
  workflow_id: string;
  view_count: number | null;
  like_count: number | null;
  bookmark_count: number | null;
  fork_count: number | null;
};

type MyWorkflowInteractionRow = {
  workflow_id: string;
  liked: boolean | null;
  bookmarked: boolean | null;
  forked: boolean | null;
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

const publicRowToCard = (row: PublicWorkflowCardRow): CommunityWorkflowCard => {
  const tags = row.tags ?? [];

  return {
    id: row.id,
    slug: row.slug || slugify(row.title),
    title: row.title,
    summary: row.summary,
    author: row.author || FALLBACK_AUTHOR,
    difficulty: row.difficulty || (row.visibility === 'core' ? '核心' : '社群'),
    visibility: row.visibility,
    tags,
    updatedAt: row.updated_at,
    featuredTemplateIds: [],
    nodeCount: row.node_count ?? 0,
    edgeCount: row.edge_count ?? 0,
    seoTitle: `${row.title} | Methmatica`,
    seoDescription: row.summary || `${row.title} 的工作流頁面`,
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
  meta: {
    workflowId: row.id,
    workflowVersionId: row.workflow_version_id ?? row.current_version_id ?? undefined,
    workflowVersion: row.current_version ?? undefined,
    ownerId: row.owner_id,
    authorName: row.workflow_json?.meta?.authorName || FALLBACK_AUTHOR,
    artifactStatus: row.artifact_status ?? undefined,
    compilerVersion: row.compiler_version ?? undefined,
    runtimeVersion: row.runtime_version ?? undefined,
  },
});

const versionRowToBlueprint = (version: WorkflowVersionRow, workflow: WorkflowRow): WorkflowBlueprint => ({
  card: {
    ...rowToCard({
      ...workflow,
      title: version.title,
      description: version.description,
      tags: version.tags,
      visibility: version.visibility,
      workflow_json: version.workflow_json,
      published_at: version.published_at,
      updated_at: version.published_at,
    }),
    updatedAt: version.published_at,
  },
  nodes: normalizeNodes(version.workflow_json?.nodes ?? []),
  edges: normalizeEdges(version.workflow_json?.edges ?? []),
  meta: {
    workflowId: version.workflow_id,
    workflowVersionId: version.id,
    workflowVersion: version.version,
    ownerId: workflow.owner_id,
    authorName: version.workflow_json?.meta?.authorName || FALLBACK_AUTHOR,
    artifactStatus: version.artifact_status ?? undefined,
    compilerVersion: version.compiler_version ?? undefined,
    runtimeVersion: version.runtime_version ?? undefined,
  },
});

export async function listPublicWorkflows() {
  if (!supabase) return [];

  const { data, error } = await withSupabaseTimeout(
    supabase
      .from('public_workflow_cards')
      .select('id, slug, title, summary, author, difficulty, visibility, tags, updated_at, node_count, edge_count')
      .order('updated_at', { ascending: false }),
    'Loading public workflows'
  );

  if (error) throw error;

  const cards = ((data ?? []) as PublicWorkflowCardRow[]).map(publicRowToCard);
  if (cards.length === 0) return cards;

  const workflowIds = cards.map(card => card.id);
  let engagementByWorkflowId = new Map<string, WorkflowEngagementRow>();
  let myInteractionsByWorkflowId = new Map<string, MyWorkflowInteractionRow>();

  try {
    const [engagementResult, sessionResult] = await Promise.all([
      withSupabaseTimeout(
        supabase.rpc('get_workflow_engagement', { p_workflow_ids: workflowIds }),
        'Loading workflow engagement'
      ),
      withSupabaseTimeout(supabase.auth.getSession(), 'Loading current session'),
    ]);

    if (engagementResult.error) throw engagementResult.error;
    if (sessionResult.error) throw sessionResult.error;

    const engagementRows = ((engagementResult.data ?? []) as WorkflowEngagementRow[]);
    engagementByWorkflowId = new Map<string, WorkflowEngagementRow>(
      engagementRows.map(row => [row.workflow_id, row])
    );

    const currentUserId = sessionResult.data.session?.user?.id;
    if (currentUserId) {
      const myInteractionResult = await withSupabaseTimeout(
        supabase.rpc('get_my_workflow_interactions', { p_workflow_ids: workflowIds }),
        'Loading my workflow interactions'
      );
      if (myInteractionResult.error) throw myInteractionResult.error;
      const myRows = (myInteractionResult.data ?? []) as MyWorkflowInteractionRow[];
      myInteractionsByWorkflowId = new Map<string, MyWorkflowInteractionRow>(
        myRows.map(row => [row.workflow_id, row])
      );
    }
  } catch (interactionError) {
    console.warn('[workflows] interaction stats unavailable, fallback to cards only:', interactionError);
  }

  return cards.map((card) => {
    const engagement = engagementByWorkflowId.get(card.id);
    const mine = myInteractionsByWorkflowId.get(card.id);
    return {
      ...card,
      viewCount: engagement?.view_count ?? 0,
      likeCount: engagement?.like_count ?? 0,
      bookmarkCount: engagement?.bookmark_count ?? 0,
      forkCount: engagement?.fork_count ?? 0,
      liked: mine?.liked ?? false,
      bookmarked: mine?.bookmarked ?? false,
      forked: mine?.forked ?? false,
    };
  });
}

export async function getWorkflowBlueprintFromSupabase(workflowId: string) {
  if (!supabase) return null;

  const { data, error } = await withSupabaseTimeout(
    supabase
      .from('workflows')
      .select('id, owner_id, slug, title, description, tags, visibility, status, workflow_json, compiled_artifact, artifact_status, compiler_version, runtime_version, dependency_manifest, contains_admin_code, published_at, updated_at, created_at, current_version_id')
      .eq('id', workflowId)
      .maybeSingle(),
    'Opening workflow'
  );

  if (error) throw error;
  if (!data) return null;
  return rowToBlueprint(data as WorkflowRow);
}

export async function getWorkflowBlueprintFromSupabaseByRef(workflowRef: string) {
  if (!supabase) return null;

  const { data, error } = await withSupabaseTimeout(
    supabase
      .from('workflows')
      .select('id, owner_id, slug, title, description, tags, visibility, status, workflow_json, compiled_artifact, artifact_status, compiler_version, runtime_version, dependency_manifest, contains_admin_code, published_at, updated_at, created_at, current_version_id')
      .or(`id.eq.${workflowRef},slug.eq.${workflowRef}`)
      .limit(1)
      .maybeSingle(),
    'Opening workflow by ref'
  );

  if (error) throw error;
  if (!data) return null;
  return rowToBlueprint(data as WorkflowRow);
}

export async function listWorkflowVersions(workflowId: string) {
  if (!supabase) return [];

  const { data: workflowData, error: workflowError } = await withSupabaseTimeout(
    supabase
      .from('workflows')
      .select('id, current_version_id')
      .eq('id', workflowId)
      .maybeSingle(),
    'Loading workflow version pointer'
  );

  if (workflowError) throw workflowError;

  const { data, error } = await withSupabaseTimeout(
    supabase
      .from('workflow_versions')
      .select('id, workflow_id, version, title, description, tags, visibility, artifact_status, compiler_version, runtime_version, dependency_manifest, contains_admin_code, published_at, created_at')
      .eq('workflow_id', workflowId)
      .order('version', { ascending: false }),
    'Loading workflow versions'
  );

  if (error) throw error;

  const currentVersionId = (workflowData as { current_version_id?: string | null } | null)?.current_version_id ?? null;
  return ((data ?? []) as WorkflowVersionRow[]).map((row): WorkflowVersionSummary => ({
    id: row.id,
    workflowId: row.workflow_id,
    version: row.version,
    title: row.title,
    description: row.description,
    tags: row.tags ?? [],
    visibility: row.visibility,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    isCurrent: row.id === currentVersionId,
    artifactStatus: row.artifact_status,
    compilerVersion: row.compiler_version,
    runtimeVersion: row.runtime_version,
    dependencyCount: row.dependency_manifest?.entries.length ?? 0,
    containsAdminCode: Boolean(row.contains_admin_code),
  }));
}

export async function getWorkflowVersionBlueprintFromSupabase(workflowVersionId: string) {
  if (!supabase) return null;

  const { data: versionData, error: versionError } = await withSupabaseTimeout(
    supabase
      .from('workflow_versions')
      .select('id, workflow_id, version, title, description, tags, visibility, workflow_json, compiled_artifact, artifact_status, compiler_version, runtime_version, dependency_manifest, contains_admin_code, created_by, published_at, created_at')
      .eq('id', workflowVersionId)
      .maybeSingle(),
    'Opening workflow version'
  );

  if (versionError) throw versionError;
  if (!versionData) return null;

  const version = versionData as WorkflowVersionRow;
  const { data: workflowData, error: workflowError } = await withSupabaseTimeout(
    supabase
      .from('workflows')
      .select('id, owner_id, slug, title, description, tags, visibility, status, workflow_json, compiled_artifact, artifact_status, compiler_version, runtime_version, dependency_manifest, contains_admin_code, published_at, updated_at, created_at, current_version_id')
      .eq('id', version.workflow_id)
      .maybeSingle(),
    'Opening version workflow'
  );

  if (workflowError) throw workflowError;
  if (!workflowData) return null;
  return versionRowToBlueprint(version, workflowData as WorkflowRow);
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
      compiledArtifact: payload.compiledArtifact,
      artifactStatus: payload.compiledArtifact ? 'ready' : 'legacy',
      compilerVersion: payload.compiledArtifact?.compilerVersion,
      runtimeVersion: payload.compiledArtifact?.runtimeVersion,
    },
  };

  const { data, error } = await withSupabaseTimeout(
    supabase
      .rpc('publish_workflow_version', {
        p_workflow_id: payload.id ?? null,
        p_title: title,
        p_description: description,
        p_tags: tags,
        p_visibility: payload.visibility,
        p_slug: slug,
        p_workflow_json: workflowJson,
        p_compiled_artifact: payload.compiledArtifact ?? null,
      })
      .single(),
    'Publishing workflow'
  );

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
