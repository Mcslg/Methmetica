import useStore from '../store/useStore';
import { NodeFrame } from '../components/NodeFrame';
import { Icons } from '../components/Icons';
import { getCommunityWorkflowBlueprint } from '../community/catalog';
import { getWorkflowBlueprintFromSupabase } from '../integrations/supabase/workflows';

export function WorkflowLinkNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const updateNodeData = useStore(state => state.updateNodeData);

  const openTarget = async () => {
    const targetId = data.targetWorkflowId;
    if (!targetId) return;
    const blueprint =
      (await getWorkflowBlueprintFromSupabase(targetId)) ??
      getCommunityWorkflowBlueprint(targetId);
    if (!blueprint) return;
    const store = useStore.getState();
    store.setGraph(blueprint.nodes as any, blueprint.edges as any);
    store.setActiveFileId(null);
    store.setCurrentView('editor');
  };

  return (
    <NodeFrame
      id={id}
      data={data}
      selected={selected}
      icon={<Icons.ExternalLink />}
      defaultLabel={data.label || 'Workflow Link'}
      minWidth={260}
      minHeight={160}
      className="workflow-link-node"
      headerExtras={
        <button className="exec-button" onClick={(e) => { e.stopPropagation(); openTarget(); }}>
          Open
        </button>
      }
      customHandleDescriptions={{ 'h-in': 'Incoming reference', 'h-out': 'Open target workflow' }}
    >
      <div className="workflow-link-body">
        <label className="workflow-link-field">
          <span>Target workflow ID</span>
          <input
            value={data.targetWorkflowId || ''}
            onChange={(e) => updateNodeData(id, { ...data, targetWorkflowId: e.target.value })}
            placeholder="workflow-cosine-law"
          />
        </label>
        <label className="workflow-link-field">
          <span>Display title</span>
          <input
            value={data.targetWorkflowTitle || ''}
            onChange={(e) => updateNodeData(id, { ...data, targetWorkflowTitle: e.target.value })}
            placeholder="餘弦定理工作流"
          />
        </label>
        <label className="workflow-link-field">
          <span>Callout</span>
          <textarea
            value={data.callout || ''}
            onChange={(e) => updateNodeData(id, { ...data, callout: e.target.value })}
            placeholder="Why should users jump here?"
          />
        </label>
        <div className="workflow-link-foot">
          <span className="workflow-link-badge">Reference</span>
          <button className="sidebar-btn" onClick={(e) => { e.stopPropagation(); openTarget(); }}>
            <Icons.ExternalLink /> Open referenced workflow
          </button>
        </div>
      </div>

      <style>{`
        .workflow-link-body {
          padding: 12px 16px 16px;
          display: grid;
          gap: 10px;
        }
        .workflow-link-field {
          display: grid;
          gap: 4px;
          font-size: 0.72rem;
          color: var(--text-sub);
        }
        .workflow-link-field input,
        .workflow-link-field textarea {
          width: 100%;
          box-sizing: border-box;
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--border-node);
          border-radius: 10px;
          color: var(--text-main);
          padding: 8px 10px;
          font: inherit;
          outline: none;
        }
        .workflow-link-field textarea {
          min-height: 72px;
          resize: vertical;
        }
        .workflow-link-foot {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-top: 4px;
        }
        .workflow-link-badge {
          display: inline-flex;
          align-items: center;
          border: 1px solid var(--border-node);
          border-radius: 999px;
          padding: 2px 8px;
          font-size: 0.68rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--accent-bright);
        }
      `}</style>
    </NodeFrame>
  );
}
