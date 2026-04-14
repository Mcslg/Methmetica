import type { Edge } from '@xyflow/react';
import type { AppNode } from '../store/useStore';
import type { AppUser } from '../integrations/supabase/types';
import { createLocalDraft } from './localDraftService';
import { pushRoute } from './navigation';

type ForkWorkflowArgs = {
  nodes: AppNode[];
  edges: Edge[];
  user: AppUser | null;
  setGraph: (nodes: AppNode[], edges: Edge[]) => void;
  setActiveFileId: (id: string | null) => void;
};

export const forkWorkflowToLocalDraft = ({
  nodes,
  edges,
  user,
  setGraph,
  setActiveFileId,
}: ForkWorkflowArgs) => {
  const forkedNodes = nodes.map(node => (
    node.type === 'projectNode'
      ? {
          ...node,
          data: {
            ...node.data,
            label: `Copy of ${node.data.label || 'Untitled Workflow'}`,
            visibility: 'private' as const,
            workflowSource: 'draft' as const,
            readOnlyPreview: false,
            ownerId: user?.id,
            authorName: user?.name,
            supabaseWorkflowId: undefined,
            hasPublishedTemplate: false,
            publishStatus: '這是從公開工作流 Fork 出來的本機副本。',
          },
        }
      : node
  ));
  const draftId = createLocalDraft({ nodes: forkedNodes, edges });
  setGraph(forkedNodes, edges);
  setActiveFileId(null);
  pushRoute({ view: 'editor', source: 'draft', id: draftId });
};
