import type { NodeComment } from '../../store/useStore';
import { supabase } from './client';
import { withSupabaseTimeout } from './utils';

export type NodeCommentKind = NonNullable<NodeComment['kind']>;
export type NodeCommentStatus = NonNullable<NodeComment['status']>;

export type NodeCommentRecord = {
  id: string;
  workflow_id: string;
  workflow_version_id: string | null;
  node_id: string;
  node_label: string;
  kind: NodeCommentKind;
  status: NodeCommentStatus | 'hidden';
  body: string;
  author_id: string | null;
  author_name: string;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  read_by_me?: boolean;
  read_at?: string | null;
  workflows?: {
    title?: string | null;
    slug?: string | null;
    visibility?: string | null;
  } | null;
};

type NodeCommentReadRow = {
  comment_id: string;
  read_at: string;
};

type NodeCommentWorkflowRow = {
  workflow_id: string;
};

type SaveNodeCommentPayload = {
  comment: NodeComment;
  workflowId: string;
  workflowVersionId?: string | null;
  nodeId: string;
  nodeLabel: string;
};

export async function saveNodeCommentToSupabase({
  comment,
  workflowId,
  workflowVersionId,
  nodeId,
  nodeLabel,
}: SaveNodeCommentPayload) {
  if (!supabase) return null;

  const { data, error } = await withSupabaseTimeout(
    supabase
      .from('node_comments')
      .upsert({
        id: comment.id,
        workflow_id: workflowId,
        workflow_version_id: workflowVersionId ?? null,
        node_id: nodeId,
        node_label: nodeLabel,
        kind: comment.kind ?? 'comment',
        status: comment.status ?? 'open',
        body: comment.body,
        author_id: comment.authorId ?? null,
        author_name: comment.authorName,
        resolved_by: comment.resolvedBy ?? null,
        resolved_at: comment.resolvedAt ?? null,
        created_at: comment.createdAt,
      }, { onConflict: 'id' })
      .select()
      .single(),
    'Saving node comment',
  );

  if (error) throw error;
  return data as NodeCommentRecord;
}

export async function updateNodeCommentStatusInSupabase(
  commentId: string,
  status: Extract<NodeCommentStatus, 'open' | 'resolved'>,
  resolvedBy?: string | null,
) {
  if (!supabase) return null;

  const { data, error } = await withSupabaseTimeout(
    supabase
      .from('node_comments')
      .update({
        status,
        resolved_by: status === 'resolved' ? resolvedBy ?? null : null,
        resolved_at: status === 'resolved' ? new Date().toISOString() : null,
      })
      .eq('id', commentId)
      .select()
      .single(),
    'Updating node comment status',
  );

  if (error) throw error;
  return data as NodeCommentRecord;
}

export async function listForumNodeComments(options?: {
  kind?: 'all' | NodeCommentKind;
  status?: 'all' | Extract<NodeCommentStatus, 'open' | 'resolved'>;
  limit?: number;
  currentUserId?: string;
}) {
  if (!supabase) return [];

  let query = supabase
    .from('node_comments')
    .select('id, workflow_id, workflow_version_id, node_id, node_label, kind, status, body, author_id, author_name, resolved_by, resolved_at, created_at, updated_at, workflows(title, slug, visibility)')
    .in('kind', ['question', 'request', 'issue'])
    .neq('status', 'hidden')
    .order('created_at', { ascending: false })
    .limit(options?.limit ?? 80);

  if (options?.kind && options.kind !== 'all') {
    query = query.eq('kind', options.kind);
  }
  if (options?.status && options.status !== 'all') {
    query = query.eq('status', options.status);
  }

  const { data, error } = await withSupabaseTimeout(query, 'Loading forum comments');
  if (error) throw error;

  const comments = (data ?? []) as unknown as NodeCommentRecord[];
  if (comments.length === 0 || !supabase) return comments;

  try {
    if (!options?.currentUserId) return comments;

    const { data: readRows, error: readError } = await withSupabaseTimeout(
      supabase
        .from('node_comment_reads')
        .select('comment_id, read_at')
        .eq('user_id', options.currentUserId)
        .in('comment_id', comments.map(comment => comment.id)),
      'Loading read receipts',
      1500,
    );
    if (readError) throw readError;

    const readById = new Map(
      ((readRows ?? []) as NodeCommentReadRow[]).map(row => [row.comment_id, row.read_at]),
    );
    return comments.map(comment => ({
      ...comment,
      read_by_me: readById.has(comment.id),
      read_at: readById.get(comment.id) ?? null,
    }));
  } catch (error) {
    console.warn('[node-comments] read receipts unavailable:', error);
    return comments;
  }
}

export async function getWorkflowCommentCounts(workflowIds: string[]) {
  if (!supabase || workflowIds.length === 0) return new Map<string, number>();

  const { data, error } = await withSupabaseTimeout(
    supabase
      .from('node_comments')
      .select('workflow_id')
      .in('workflow_id', workflowIds)
      .neq('status', 'hidden')
      .limit(1000),
    'Loading workflow comment counts',
    1800,
  );

  if (error) throw error;

  return ((data ?? []) as NodeCommentWorkflowRow[]).reduce((counts, row) => {
    counts.set(row.workflow_id, (counts.get(row.workflow_id) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
}

export async function markNodeCommentRead(commentId: string, userId: string) {
  if (!supabase) return null;
  if (!userId) return null;

  const { data, error } = await withSupabaseTimeout(
    supabase
      .from('node_comment_reads')
      .upsert({
        comment_id: commentId,
        user_id: userId,
        read_at: new Date().toISOString(),
      }, { onConflict: 'comment_id,user_id' })
      .select()
      .single(),
    'Marking comment read',
  );

  if (error) throw error;
  return data as NodeCommentReadRow;
}
