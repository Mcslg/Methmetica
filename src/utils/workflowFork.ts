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
  const sourceProject = nodes.find(node => node.type === 'projectNode');
  const isCoreSource = sourceProject?.data.visibility === 'core';
  const sourceWorkflowId = typeof sourceProject?.data.supabaseWorkflowId === 'string'
    ? sourceProject.data.supabaseWorkflowId
    : undefined;
  const sourceVersionId = typeof sourceProject?.data.workflowVersionId === 'string'
    ? sourceProject.data.workflowVersionId
    : undefined;
  const sourceTitle = String(sourceProject?.data.label || '核心工作流');
  const forkedNodes = nodes.map(node => (
    node.type === 'projectNode'
      ? {
          ...node,
          data: {
            ...node.data,
            label: `${node.data.label || '未命名工作流'} (副本)`,
            visibility: 'private' as const,
            workflowSource: 'draft' as const,
            readOnlyPreview: false,
            ownerId: user?.id,
            authorName: user?.name,
            supabaseWorkflowId: undefined,
            hasPublishedTemplate: false,
            ...(isCoreSource && sourceWorkflowId ? {
              coreProposalWorkflowId: sourceWorkflowId,
              coreProposalBaseVersionId: sourceVersionId,
              coreProposalSourceTitle: sourceTitle,
              coreProposalStatus: 'draft' as const,
            } : {
              coreProposalWorkflowId: undefined,
              coreProposalBaseVersionId: undefined,
              coreProposalSourceTitle: undefined,
              coreProposalStatus: undefined,
            }),
            publishStatus: isCoreSource
              ? '這是從核心工作流 Fork 出來的修改提案草稿。'
              : '這是從公開工作流 Fork 出來的本機副本。',
          },
        }
      : node
  ));
  const draftId = createLocalDraft({ nodes: forkedNodes, edges });
  setGraph(forkedNodes, edges);
  setActiveFileId(null);
  pushRoute({ view: 'editor', source: 'draft', id: draftId });
};
