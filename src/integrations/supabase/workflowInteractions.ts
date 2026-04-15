import { supabase } from './client';
import { withSupabaseTimeout } from './utils';

export type WorkflowInteractionKind = 'like' | 'bookmark' | 'fork';

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

export type WorkflowEngagement = {
  workflowId: string;
  viewCount: number;
  likeCount: number;
  bookmarkCount: number;
  forkCount: number;
};

export type MyWorkflowInteractions = {
  workflowId: string;
  liked: boolean;
  bookmarked: boolean;
  forked: boolean;
};

export async function recordWorkflowView(workflowId: string, metadata?: Record<string, unknown>) {
  if (!supabase) return;
  const { error } = await withSupabaseTimeout(
    supabase.rpc('record_workflow_view', {
      p_workflow_id: workflowId,
      p_metadata: metadata ?? {},
    }),
    'Recording workflow view'
  );
  if (error) throw error;
}

export async function setWorkflowInteraction(workflowId: string, interaction: WorkflowInteractionKind, enabled: boolean) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await withSupabaseTimeout(
    supabase.rpc('set_workflow_interaction', {
      p_workflow_id: workflowId,
      p_interaction: interaction,
      p_enabled: enabled,
    }),
    'Updating workflow interaction'
  );
  if (error) throw error;
}

export async function getWorkflowEngagement(workflowIds: string[]) {
  if (!supabase || workflowIds.length === 0) return new Map<string, WorkflowEngagement>();
  const { data, error } = await withSupabaseTimeout(
    supabase.rpc('get_workflow_engagement', { p_workflow_ids: workflowIds }),
    'Loading workflow engagement'
  );
  if (error) throw error;

  const rows = (data ?? []) as WorkflowEngagementRow[];
  return new Map<string, WorkflowEngagement>(
    rows.map((row) => [
      row.workflow_id,
      {
        workflowId: row.workflow_id,
        viewCount: row.view_count ?? 0,
        likeCount: row.like_count ?? 0,
        bookmarkCount: row.bookmark_count ?? 0,
        forkCount: row.fork_count ?? 0,
      },
    ])
  );
}

export async function getMyWorkflowInteractions(workflowIds: string[]) {
  if (!supabase || workflowIds.length === 0) return new Map<string, MyWorkflowInteractions>();
  const { data, error } = await withSupabaseTimeout(
    supabase.rpc('get_my_workflow_interactions', { p_workflow_ids: workflowIds }),
    'Loading my workflow interactions'
  );
  if (error) throw error;

  const rows = (data ?? []) as MyWorkflowInteractionRow[];
  return new Map<string, MyWorkflowInteractions>(
    rows.map((row) => [
      row.workflow_id,
      {
        workflowId: row.workflow_id,
        liked: row.liked ?? false,
        bookmarked: row.bookmarked ?? false,
        forked: row.forked ?? false,
      },
    ])
  );
}
