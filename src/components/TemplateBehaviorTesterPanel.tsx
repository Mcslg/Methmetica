import React from 'react';
import { createPortal } from 'react-dom';
import { Icons } from './Icons';
import { TemplateBehaviorTester } from './TemplateBehaviorTester';
import useStore from '../store/useStore';
import type { BuiltWorkflowNode, CommunityNodeTemplate } from '../community/types';

export function TemplateBehaviorTesterPanel() {
  const projectNodeId = useStore(state => state.templateTesterProjectNodeId);
  const closeTemplateTester = useStore(state => state.closeTemplateTester);
  const updateNodeData = useStore(state => state.updateNodeData);
  const projectNode = useStore(state => (
    projectNodeId ? state.nodes.find(node => node.id === projectNodeId) ?? null : null
  ));

  React.useEffect(() => {
    if (!projectNodeId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeTemplateTester();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeTemplateTester, projectNodeId]);

  if (!projectNodeId) return null;

  const builderDraft = projectNode?.data.builderDraft as CommunityNodeTemplate | undefined;

  return createPortal(
    <div className="template-tester-shell nodrag" role="dialog" aria-modal="false" aria-label="Test Node Behavior">
      <div className="template-tester-panel">
        <div className="template-tester-header">
          <div>
            <strong>Test Node Behavior</strong>
            <span>{builderDraft?.title || projectNode?.data.label || 'Project node'}</span>
          </div>
          <button
            type="button"
            className="handle-panel-close"
            onClick={closeTemplateTester}
            title="Close tester"
          >
            <Icons.Clear />
          </button>
        </div>

        {!projectNode ? (
          <div className="template-tester-empty">找不到這個 ProjectNode。</div>
        ) : !builderDraft ? (
          <div className="template-tester-empty">這個 ProjectNode 還沒有 Builder Root。</div>
        ) : (
          <TemplateBehaviorTester
            projectNodeId={projectNode.id}
            builderDraft={builderDraft}
            linkedTemplateNodeId={projectNode.data.linkedTemplateNodeId as string | undefined}
            onRuntimePlanBuilt={(runtimePlan: BuiltWorkflowNode) => {
              const nextBuilderDraft = {
                ...builderDraft,
                runtimePlan,
              };

              updateNodeData(projectNode.id, {
                builderDraft: nextBuilderDraft,
              }, { skipGraphEval: true });

              const linkedProjectNodeId = projectNode.data.projectNodeId as string | undefined;
              if (projectNode.type === 'nodeBuilderNode' && linkedProjectNodeId) {
                updateNodeData(linkedProjectNodeId, {
                builderDraft: {
                  ...nextBuilderDraft,
                },
              }, { skipGraphEval: true });
              }
            }}
          />
        )}
      </div>
    </div>,
    document.body
  );
}
