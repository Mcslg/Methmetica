import type { Edge } from '@xyflow/react';
import type {
  CommunityWorkflowCard,
  ReviewMetadata,
  WorkflowBlueprint,
  WorkflowChangeType,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowPublishKind,
  WorkflowUpdateSeverity,
  WorkflowUpdatePolicy,
  WorkflowVisibility,
} from '../../community/types';
import type { AppNode } from '../../store/useStore';
import type { AppUser } from './types';
import type { CompiledWorkflowArtifact } from '../../utils/workflowCompiler';
import { isSupabaseConfigured, supabase, supabaseConfig } from './client';
import { withSupabaseTimeout } from './utils';

type WorkflowStatus = 'draft' | 'pending_review' | 'published' | 'archived';
export type WorkflowReviewStatus = 'unreviewed' | 'approved';

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
  publishKind?: WorkflowPublishKind;
  changeType?: WorkflowChangeType;
  updatePolicy?: WorkflowUpdatePolicy;
  updateSummary?: string;
  warningMessage?: string;
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
  review_status?: WorkflowReviewStatus | null;
  review_count?: number | null;
  review_required?: boolean | null;
  review_warning?: boolean | null;
  required_contributor_reviews?: number | null;
  required_expert_reviews?: number | null;
  contributor_review_count?: number | null;
  expert_review_count?: number | null;
  extra_contributor_reviews?: number | null;
  extra_expert_reviews?: number | null;
  reviewed_by_me?: boolean | null;
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
      publishKind?: WorkflowPublishKind;
      changeType?: WorkflowChangeType;
      updatePolicy?: WorkflowUpdatePolicy;
      updateSummary?: string;
      warningMessage?: string;
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
  publish_kind?: WorkflowPublishKind | null;
  change_type?: WorkflowChangeType | null;
  update_policy?: WorkflowUpdatePolicy | null;
  update_summary?: string | null;
  warning_message?: string | null;
  supersedes_version_id?: string | null;
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
  review_status?: WorkflowReviewStatus | null;
  review_count?: number | null;
  review_required?: boolean | null;
  review_warning?: boolean | null;
  required_contributor_reviews?: number | null;
  required_expert_reviews?: number | null;
  contributor_review_count?: number | null;
  expert_review_count?: number | null;
  extra_contributor_reviews?: number | null;
  extra_expert_reviews?: number | null;
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
  publishKind?: WorkflowPublishKind | null;
  changeType?: WorkflowChangeType | null;
  updatePolicy?: WorkflowUpdatePolicy | null;
  updateSummary?: string | null;
  warningMessage?: string | null;
  supersedesVersionId?: string | null;
  updateAvailable?: boolean;
  updateSeverity?: WorkflowUpdateSeverity;
  updateMessage?: string;
  latestWorkflowVersionId?: string;
  latestWorkflowVersion?: number;
  reviewStatus?: WorkflowReviewStatus | null;
  reviewCount?: number;
  reviewRequired?: boolean;
  reviewWarning?: boolean;
  requiredContributorReviews?: number;
  requiredExpertReviews?: number;
  contributorReviewCount?: number;
  expertReviewCount?: number;
  extraContributorReviews?: number;
  extraExpertReviews?: number;
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
  review_status?: WorkflowReviewStatus | null;
  review_count?: number | null;
  review_required?: boolean | null;
  review_warning?: boolean | null;
  required_contributor_reviews?: number | null;
  required_expert_reviews?: number | null;
  contributor_review_count?: number | null;
  expert_review_count?: number | null;
  extra_contributor_reviews?: number | null;
  extra_expert_reviews?: number | null;
  reviewed_by_me?: boolean | null;
  compiled_artifact?: CompiledWorkflowArtifact | null;
  artifact_status?: string | null;
  compiler_version?: string | null;
  runtime_version?: string | null;
  dependency_manifest?: CompiledWorkflowArtifact['dependencyManifest'] | null;
  contains_admin_code?: boolean | null;
  publish_kind?: WorkflowPublishKind | null;
  change_type?: WorkflowChangeType | null;
  update_policy?: WorkflowUpdatePolicy | null;
  update_summary?: string | null;
  warning_message?: string | null;
  supersedes_version_id?: string | null;
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

type MyWorkflowReviewRow = {
  review_requests?: { workflow_id?: string | null } | null;
};

const FALLBACK_AUTHOR = 'Methmatica Community';
const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `workflow-${Date.now()}`;

const WORKFLOW_REVIEW_COLUMNS = 'review_status, review_count, review_required, review_warning, required_contributor_reviews, required_expert_reviews, contributor_review_count, expert_review_count, extra_contributor_reviews, extra_expert_reviews';
const WORKFLOW_UPDATE_COLUMNS = 'publish_kind,change_type,update_policy,update_summary,warning_message,supersedes_version_id';
const WORKFLOW_OPEN_COLUMNS = `id,owner_id,slug,title,description,tags,visibility,status,${WORKFLOW_REVIEW_COLUMNS.replaceAll(' ', '')},workflow_json,artifact_status,compiler_version,runtime_version,${WORKFLOW_UPDATE_COLUMNS},published_at,updated_at,created_at,current_version_id`;
const SUPABASE_HEALTH_TIMEOUT_MS = 1500;
const WORKFLOW_INTERACTION_TIMEOUT_MS = 2000;
const OPEN_WORKFLOW_TIMEOUT_MS = 3500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const getReviewMetadata = (row: {
  review_status?: WorkflowReviewStatus | null;
  review_count?: number | null;
  review_required?: boolean | null;
  review_warning?: boolean | null;
  required_contributor_reviews?: number | null;
  required_expert_reviews?: number | null;
  contributor_review_count?: number | null;
  expert_review_count?: number | null;
  extra_contributor_reviews?: number | null;
  extra_expert_reviews?: number | null;
  reviewed_by_me?: boolean | null;
}): ReviewMetadata => ({
  reviewStatus: row.review_status ?? 'approved',
  reviewCount: row.review_count ?? 0,
  reviewRequired: Boolean(row.review_required),
  reviewWarning: Boolean(row.review_warning),
  requiredContributorReviews: row.required_contributor_reviews ?? 0,
  requiredExpertReviews: row.required_expert_reviews ?? 0,
  contributorReviewCount: row.contributor_review_count ?? 0,
  expertReviewCount: row.expert_review_count ?? 0,
  extraContributorReviews: row.extra_contributor_reviews ?? 0,
  extraExpertReviews: row.extra_expert_reviews ?? 0,
  reviewedByMe: row.reviewed_by_me ?? undefined,
});

export const getSupersededVersionMessage = (version: {
  changeType?: WorkflowChangeType | null;
  warningMessage?: string | null;
}) => {
  if (version.changeType === 'hotfix') {
    return version.warningMessage || '這個版本有重要修復，建議盡快更新。';
  }
  if (version.changeType === 'fix') {
    return version.warningMessage || '這個版本已有修正版，建議手動更新。';
  }
  if (version.changeType === 'feature') {
    return '這個版本已有新版，可手動更新。';
  }
  return null;
};

const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
};

const rowToCard = (row: WorkflowRow): CommunityWorkflowCard => {
  const graphNodes = row.workflow_json?.nodes ?? [];
  const graphEdges = row.workflow_json?.edges ?? [];
  const tags = row.tags ?? [];
  const author = row.workflow_json?.meta?.authorName || FALLBACK_AUTHOR;
  const review = getReviewMetadata(row);

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
    ...review,
    seoTitle: `${row.title} | Methmatica`,
    seoDescription: row.description || `${row.title} 的工作流頁面`,
  };
};

const publicRowToCard = (row: PublicWorkflowCardRow): CommunityWorkflowCard => {
  const tags = row.tags ?? [];
  const review = getReviewMetadata(row);

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
    ...review,
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
    publishKind: row.publish_kind ?? row.workflow_json?.meta?.publishKind ?? 'workflow',
    changeType: row.change_type ?? row.workflow_json?.meta?.changeType ?? 'edit',
    updatePolicy: row.update_policy ?? row.workflow_json?.meta?.updatePolicy ?? 'none',
    updateSummary: row.update_summary ?? row.workflow_json?.meta?.updateSummary ?? undefined,
    warningMessage: row.warning_message ?? row.workflow_json?.meta?.warningMessage ?? undefined,
    supersedesVersionId: row.supersedes_version_id ?? undefined,
    ownerId: row.owner_id,
    authorName: row.workflow_json?.meta?.authorName || FALLBACK_AUTHOR,
    ...getReviewMetadata(row),
    artifactStatus: row.artifact_status ?? undefined,
    compilerVersion: row.compiler_version ?? undefined,
    runtimeVersion: row.runtime_version ?? undefined,
  },
});

const fetchWorkflowBlueprintViaRest = async (column: 'id' | 'slug', value: string) => {
  if (!supabaseConfig.url || !supabaseConfig.anonKey) return null;

  const params = new URLSearchParams({
    select: WORKFLOW_OPEN_COLUMNS,
    limit: '1',
  });
  params.set(column, `eq.${value}`);

  const response = await withSupabaseTimeout(
    fetch(`${supabaseConfig.url}/rest/v1/workflows?${params.toString()}`, {
      headers: {
        apikey: supabaseConfig.anonKey,
        Authorization: `Bearer ${supabaseConfig.anonKey}`,
      },
    }),
    'Opening workflow',
    OPEN_WORKFLOW_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw new Error(`Opening workflow failed with HTTP ${response.status}`);
  }

  const rows = (await response.json()) as WorkflowRow[];
  return rows[0] ? rowToBlueprint(rows[0]) : null;
};

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
    publishKind: version.publish_kind ?? version.workflow_json?.meta?.publishKind ?? 'workflow',
    changeType: version.change_type ?? version.workflow_json?.meta?.changeType ?? 'edit',
    updatePolicy: version.update_policy ?? version.workflow_json?.meta?.updatePolicy ?? 'none',
    updateSummary: version.update_summary ?? version.workflow_json?.meta?.updateSummary ?? undefined,
    warningMessage: version.warning_message ?? version.workflow_json?.meta?.warningMessage ?? undefined,
    supersedesVersionId: version.supersedes_version_id ?? undefined,
    ownerId: workflow.owner_id,
    authorName: version.workflow_json?.meta?.authorName || FALLBACK_AUTHOR,
    ...getReviewMetadata(version),
    artifactStatus: version.artifact_status ?? undefined,
    compilerVersion: version.compiler_version ?? undefined,
    runtimeVersion: version.runtime_version ?? undefined,
  },
});

export async function listPublicWorkflows(options?: { includeInteractions?: boolean; limit?: number; currentUserId?: string }) {
  if (!supabase || !supabaseConfig.url || !supabaseConfig.anonKey) return [];
  const includeInteractions = options?.includeInteractions ?? true;
  const params = new URLSearchParams({
    select: `id,slug,title,summary,author,difficulty,visibility,tags,updated_at,node_count,edge_count,${WORKFLOW_REVIEW_COLUMNS.replaceAll(' ', '')}`,
    order: 'updated_at.desc',
  });
  if (options?.limit) params.set('limit', String(options.limit));

  const response = await withSupabaseTimeout(
    fetch(`${supabaseConfig.url}/rest/v1/public_workflow_cards?${params.toString()}`, {
      headers: {
        apikey: supabaseConfig.anonKey,
        Authorization: `Bearer ${supabaseConfig.anonKey}`,
      },
    }),
    'Loading public workflows',
  );

  if (!response.ok) {
    throw new Error(`Loading public workflows failed with HTTP ${response.status}`);
  }

  const data = await response.json();
  const cards = ((data ?? []) as PublicWorkflowCardRow[]).map(publicRowToCard);
  if (cards.length === 0 || !includeInteractions) return cards;

  const workflowIds = cards.map(card => card.id);
  let engagementByWorkflowId = new Map<string, WorkflowEngagementRow>();
  let myInteractionsByWorkflowId = new Map<string, MyWorkflowInteractionRow>();
  let reviewedWorkflowIds = new Set<string>();

  try {
    const engagementResult = await withSupabaseTimeout(
      supabase.rpc('get_workflow_engagement', { p_workflow_ids: workflowIds }),
      'Loading workflow engagement',
      WORKFLOW_INTERACTION_TIMEOUT_MS,
    );

    if (engagementResult.error) throw engagementResult.error;

    const engagementRows = ((engagementResult.data ?? []) as WorkflowEngagementRow[]);
    engagementByWorkflowId = new Map<string, WorkflowEngagementRow>(
      engagementRows.map(row => [row.workflow_id, row])
    );

    const currentUserId = options?.currentUserId;
    if (currentUserId) {
      const [myInteractionResult, myReviewResult] = await Promise.all([
        withSupabaseTimeout(
          supabase.rpc('get_my_workflow_interactions', { p_workflow_ids: workflowIds }),
          'Loading my workflow interactions',
          WORKFLOW_INTERACTION_TIMEOUT_MS,
        ),
        withSupabaseTimeout(
          supabase
            .from('reviews')
            .select('review_requests!inner(workflow_id)')
            .eq('reviewer_id', currentUserId)
            .in('review_requests.workflow_id', workflowIds),
          'Loading my workflow reviews',
          WORKFLOW_INTERACTION_TIMEOUT_MS,
        ),
      ]);
      if (myInteractionResult.error) throw myInteractionResult.error;
      const myRows = (myInteractionResult.data ?? []) as MyWorkflowInteractionRow[];
      myInteractionsByWorkflowId = new Map<string, MyWorkflowInteractionRow>(
        myRows.map(row => [row.workflow_id, row])
      );
      if (myReviewResult.error) throw myReviewResult.error;
      reviewedWorkflowIds = new Set(
        ((myReviewResult.data ?? []) as unknown as MyWorkflowReviewRow[])
          .map(row => row.review_requests?.workflow_id)
          .filter((workflowId): workflowId is string => Boolean(workflowId))
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
      reviewedByMe: reviewedWorkflowIds.has(card.id) || card.reviewedByMe,
    };
  });
}

export async function getWorkflowBlueprintFromSupabase(workflowId: string) {
  if (!supabase) return null;

  try {
    const fastBlueprint = await fetchWorkflowBlueprintViaRest('id', workflowId);
    if (fastBlueprint) return fastBlueprint;
  } catch (restError) {
    console.warn('[workflows] fast public workflow open failed, falling back to Supabase client:', restError);
  }

  const { data, error } = await withSupabaseTimeout(
    supabase
      .from('workflows')
      .select(WORKFLOW_OPEN_COLUMNS)
      .eq('id', workflowId)
      .maybeSingle(),
    'Opening workflow',
    OPEN_WORKFLOW_TIMEOUT_MS,
  );

  if (error) throw error;
  if (!data) return null;
  return rowToBlueprint(data as unknown as WorkflowRow);
}

export async function getWorkflowBlueprintFromSupabaseByRef(workflowRef: string) {
  if (!supabase) return null;

  try {
    const fastBlueprint = await fetchWorkflowBlueprintViaRest(UUID_PATTERN.test(workflowRef) ? 'id' : 'slug', workflowRef);
    if (fastBlueprint) return fastBlueprint;
  } catch (restError) {
    console.warn('[workflows] fast public workflow open by ref failed, falling back to Supabase client:', restError);
  }

  const column = UUID_PATTERN.test(workflowRef) ? 'id' : 'slug';

  const { data, error } = await withSupabaseTimeout(
    supabase
      .from('workflows')
      .select(WORKFLOW_OPEN_COLUMNS)
      .eq(column, workflowRef)
      .limit(1)
      .maybeSingle(),
    'Opening workflow by ref',
    OPEN_WORKFLOW_TIMEOUT_MS,
  );

  if (error) throw error;
  if (!data) return null;
  return rowToBlueprint(data as unknown as WorkflowRow);
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
      .select(`id, workflow_id, version, title, description, tags, visibility, ${WORKFLOW_REVIEW_COLUMNS}, artifact_status, compiler_version, runtime_version, dependency_manifest, contains_admin_code, publish_kind, change_type, update_policy, update_summary, warning_message, supersedes_version_id, published_at, created_at`)
      .eq('workflow_id', workflowId)
      .order('version', { ascending: false }),
    'Loading workflow versions'
  );

  if (error) throw error;

  const currentVersionId = (workflowData as { current_version_id?: string | null } | null)?.current_version_id ?? null;
  const rows = (data ?? []) as WorkflowVersionRow[];
  const supersedingByOldVersionId = new Map<string, WorkflowVersionRow>();
  rows.forEach((row) => {
    if (!row.supersedes_version_id || !['feature', 'fix', 'hotfix'].includes(row.change_type ?? '')) return;
    const existing = supersedingByOldVersionId.get(row.supersedes_version_id);
    if (!existing || row.version > existing.version) {
      supersedingByOldVersionId.set(row.supersedes_version_id, row);
    }
  });

  return rows.map((row): WorkflowVersionSummary => {
    const supersedingVersion = supersedingByOldVersionId.get(row.id);
    const supersedingChangeType = supersedingVersion?.change_type;
    const shouldWarnSupersededVersion = supersedingChangeType === 'fix' || supersedingChangeType === 'hotfix';
    const updateMessage = shouldWarnSupersededVersion && supersedingVersion ? getSupersededVersionMessage({
      changeType: supersedingVersion.change_type,
      warningMessage: supersedingVersion.warning_message,
    }) : null;

    return {
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
      publishKind: row.publish_kind,
      changeType: row.change_type,
      updatePolicy: row.update_policy,
      updateSummary: row.update_summary,
      warningMessage: updateMessage,
      supersedesVersionId: row.supersedes_version_id,
      updateAvailable: Boolean(supersedingVersion),
      updateSeverity: supersedingChangeType === 'hotfix' || supersedingChangeType === 'fix'
        ? supersedingChangeType
        : supersedingVersion ? 'feature' : undefined,
      updateMessage: updateMessage ?? undefined,
      latestWorkflowVersionId: supersedingVersion?.id,
      latestWorkflowVersion: supersedingVersion?.version,
      ...getReviewMetadata(row),
    };
  });
}

export async function getWorkflowVersionBlueprintFromSupabase(workflowVersionId: string) {
  if (!supabase) return null;

  const { data: versionData, error: versionError } = await withSupabaseTimeout(
    supabase
      .from('workflow_versions')
      .select(`id, workflow_id, version, title, description, tags, visibility, workflow_json, ${WORKFLOW_REVIEW_COLUMNS}, compiled_artifact, artifact_status, compiler_version, runtime_version, dependency_manifest, contains_admin_code, publish_kind, change_type, update_policy, update_summary, warning_message, supersedes_version_id, created_by, published_at, created_at`)
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
      .select(`id, owner_id, slug, title, description, tags, visibility, status, ${WORKFLOW_REVIEW_COLUMNS}, workflow_json, compiled_artifact, artifact_status, compiler_version, runtime_version, dependency_manifest, contains_admin_code, ${WORKFLOW_UPDATE_COLUMNS}, published_at, updated_at, created_at, current_version_id`)
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
      publishKind: payload.publishKind ?? 'workflow',
      changeType: payload.changeType ?? 'edit',
      updatePolicy: payload.updatePolicy ?? 'none',
      updateSummary: payload.updateSummary,
      warningMessage: payload.warningMessage,
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

export async function adminDeletePublicWorkflowInSupabase(workflowId: string) {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { error } = await withSupabaseTimeout(
    supabase.rpc('admin_delete_public_workflow', { p_workflow_id: workflowId }),
    'Deleting public workflow',
  );

  if (error) throw error;
}

type ReviewWorkflowRow = {
  workflow_id: string;
  workflow_version_id: string | null;
  review_status: WorkflowReviewStatus;
  review_count: number;
  review_required: boolean;
  review_warning: boolean;
  required_contributor_reviews: number;
  required_expert_reviews: number;
  contributor_review_count: number;
  expert_review_count: number;
  extra_contributor_reviews: number;
  extra_expert_reviews: number;
  status: WorkflowStatus;
  reviewed_by_me: boolean;
};

export async function reviewWorkflowInSupabase(workflowId: string) {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { data, error } = await withSupabaseTimeout(
    supabase
      .rpc('review_workflow', { p_workflow_id: workflowId })
      .single(),
    'Reviewing workflow'
  );

  if (error) throw error;
  const row = data as ReviewWorkflowRow;
  return {
    workflowId: row.workflow_id,
    workflowVersionId: row.workflow_version_id,
    ...getReviewMetadata(row),
    status: row.status,
  };
}

export async function adminApproveWorkflowInSupabase(workflowId: string) {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { data, error } = await withSupabaseTimeout(
    supabase
      .rpc('admin_approve_workflow', { p_workflow_id: workflowId })
      .single(),
    'Approving workflow'
  );

  if (error) throw error;
  const row = data as ReviewWorkflowRow;
  return {
    workflowId: row.workflow_id,
    workflowVersionId: row.workflow_version_id,
    ...getReviewMetadata(row),
    status: row.status,
    reviewedByMe: row.reviewed_by_me,
  };
}

export async function requestExtraWorkflowReviewInSupabase(
  workflowId: string,
  extraContributors: number,
  extraExperts: number,
  reason?: string,
) {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { data, error } = await withSupabaseTimeout(
    supabase
      .rpc('request_extra_workflow_review', {
        p_workflow_id: workflowId,
        p_extra_contributors: extraContributors,
        p_extra_experts: extraExperts,
        p_reason: reason ?? null,
      })
      .single(),
    'Requesting extra workflow review'
  );

  if (error) throw error;
  const row = data as ReviewWorkflowRow;
  return {
    workflowId: row.workflow_id,
    workflowVersionId: row.workflow_version_id,
    ...getReviewMetadata(row),
    status: row.status,
  };
}

export async function runSupabaseHealthCheck() {
  const storageKeyPrefix = 'sb-';
  const authTokenSuffix = '-auth-token';
  const storedSessionKey = typeof window !== 'undefined'
    ? Object.keys(window.localStorage).find((key) => key.startsWith(storageKeyPrefix) && key.endsWith(authTokenSuffix)) || null
    : null;

  if (!supabase || !isSupabaseConfigured || !supabaseConfig.url || !supabaseConfig.anonKey) {
    return {
      configured: false,
      storedSession: false,
      authApiReachable: false,
      workflowsReachable: false,
      message: 'Supabase envs are missing. If .env.local exists, restart the Vite dev server so import.meta.env is refreshed.',
    };
  }

  const authUrl = `${supabaseConfig.url}/auth/v1/settings`;
  const workflowsUrl = `${supabaseConfig.url}/rest/v1/workflows?select=id&limit=1`;
  const headers = {
    apikey: supabaseConfig.anonKey,
    Authorization: `Bearer ${supabaseConfig.anonKey}`,
  };

  const [authResult, workflowResult] = await Promise.allSettled([
    fetchWithTimeout(authUrl, { headers }, SUPABASE_HEALTH_TIMEOUT_MS),
    fetchWithTimeout(workflowsUrl, { headers }, SUPABASE_HEALTH_TIMEOUT_MS),
  ]);

  const authError = authResult.status === 'rejected'
    ? authResult.reason
    : authResult.value.ok ? null : new Error(`Auth API returned ${authResult.value.status}`);
  const workflowError = workflowResult.status === 'rejected'
    ? workflowResult.reason
    : workflowResult.value.ok ? null : new Error(`Workflows table returned ${workflowResult.value.status}`);
  const authApiReachable = !authError;
  const workflowsReachable = !workflowError;
  const messageParts = [
    authError instanceof Error ? authError.message : authError?.message,
    workflowError instanceof Error ? workflowError.message : workflowError?.message,
  ].filter(Boolean);

  return {
    configured: true,
    storedSession: Boolean(storedSessionKey),
    authApiReachable,
    workflowsReachable,
    sessionUserId: null,
    storedSessionKey,
    message: messageParts.length > 0
      ? messageParts.join(' · ')
      : 'Supabase session and workflows table are ready.',
  };
}
