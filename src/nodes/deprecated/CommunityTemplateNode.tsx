import React from 'react';
import { type Edge, type NodeProps } from '@xyflow/react';
import useStore, { type AppNode } from '../../store/useStore';
import { NodeFrame } from '../../components/NodeFrame';
import { Icons } from '../../components/Icons';
import { getCommunityTemplateById, getCommunityWorkflowBlueprint } from '../../community/catalog';
import { getWorkflowBlueprintFromSupabase } from '../../integrations/supabase/workflows';
import type { CommunityNodeTemplate, TemplateBuilderBlock } from '../../community/types';

const openCommunityWorkflow = async (workflowId: string) => {
  const blueprint =
    (await getWorkflowBlueprintFromSupabase(workflowId)) ??
    getCommunityWorkflowBlueprint(workflowId);
  if (!blueprint) return false;

  const store = useStore.getState();
  store.setGraph(blueprint.nodes as AppNode[], blueprint.edges as Edge[]);
  store.setActiveFileId(null);
  store.setCurrentView('editor');
  return true;
};

export const CommunityTemplateNode = React.memo(function CommunityTemplateNode({ id, data, selected }: NodeProps<AppNode>) {
  const isReadOnlyPreview = Boolean(data.readOnlyPreview);
  const templateFromStore = useStore(
    state => state.communityTemplates.find((item: CommunityNodeTemplate) => item.id === data.templateId) ?? null
  );
  const template =
    (data.templateDraft as CommunityNodeTemplate | undefined) ??
    templateFromStore ??
    getCommunityTemplateById(data.templateId || '') as CommunityNodeTemplate | undefined;
  if (!template) {
    return (
      <div className="community-template-missing">
        <div className="node-header">
          <span><Icons.Package />Unknown Template</span>
        </div>
        <div className="node-content">
          <p style={{ margin: 0, color: 'var(--text-sub)' }}>Template not found.</p>
        </div>
      </div>
    );
  }

  return (
    <NodeFrame
      id={id}
      data={data}
      selected={selected}
      icon={<Icons.Package />}
      defaultLabel={template.title}
      minWidth={template.size.width}
      minHeight={template.size.height}
      className={`community-template-node template-${template.source}`}
      headerExtras={
        <button
          className="exec-button"
          onClick={(e) => {
            e.stopPropagation();
            const firstWorkflow = template.relatedWorkflowIds[0];
            if (firstWorkflow) openCommunityWorkflow(firstWorkflow);
          }}
        >
          Open
        </button>
      }
      customHandleDescriptions={{
        'h-in': 'Community input',
        'h-out': 'Community output',
      }}
    >
      <div className="community-template-body">
        <div className="community-template-summary">{template.summary}</div>

        <div className="community-template-pill-row">
          <span className="community-template-pill" style={{ borderColor: template.accent, color: template.accent }}>{template.category}</span>
          <span className="community-template-pill">{template.visibility}</span>
          <span className="community-template-pill">v{template.version}</span>
        </div>

        {template.builderBlocks.length > 0 && (
          <div className="community-template-fields">
            {template.builderBlocks.map((block: TemplateBuilderBlock) => {
              if (block.kind === 'input' || block.kind === 'output') {
                return null;
              }

              if (block.kind === 'text') {
                return (
                  <p key={block.id} className="community-template-text-block">{block.content || '尚未填入內容。'}</p>
                );
              }

              if (block.kind === 'math') {
                return (
                  <div key={block.id} className="community-template-static-block math">
                    <span className="community-template-static-label">{block.label}</span>
                    <code>{block.content || '尚未填入公式。'}</code>
                  </div>
                );
              }

              return (
                <details key={block.id} className="community-template-toggle" open={!isReadOnlyPreview}>
                  <summary>{block.label}</summary>
                  <p>{block.content || block.placeholder || '尚未填入切換內容。'}</p>
                </details>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        .community-template-body {
          padding: 14px 16px 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .community-template-summary {
          color: var(--text-main);
          font-size: 0.9rem;
          line-height: 1.5;
        }
        .community-template-pill-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .community-template-pill {
          border: 1px solid var(--border-node);
          border-radius: 999px;
          padding: 2px 8px;
          font-size: 0.68rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-sub);
        }
        .community-template-fields {
          display: grid;
          gap: 10px;
        }
        .community-template-text-block {
          margin: 0;
          color: var(--text-main);
          line-height: 1.6;
        }
        .community-template-static-block,
        .community-template-toggle {
          display: grid;
          gap: 6px;
          padding: 10px;
          border: 1px solid var(--border-node);
          border-radius: 12px;
          background: rgba(255,255,255,0.03);
        }
        .community-template-static-block p,
        .community-template-toggle p {
          margin: 0;
          color: var(--text-main);
          line-height: 1.5;
        }
        .community-template-static-label {
          font-size: 0.72rem;
          color: var(--text-sub);
        }
        .community-template-static-block.math code {
          font-family: 'IBM Plex Mono', 'SFMono-Regular', monospace;
          font-size: 0.85rem;
          color: var(--text-main);
          white-space: pre-wrap;
          word-break: break-word;
        }
        .community-template-toggle summary {
          cursor: pointer;
          color: var(--text-main);
          font-weight: 600;
        }
      `}</style>
    </NodeFrame>
  );
});
