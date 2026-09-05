import useStore from '../../store/useStore';
import { NodeFrame } from '../../components/NodeFrame';
import { Icons } from '../../components/Icons';

export function WorkflowLinkNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const updateNodeData = useStore(state => state.updateNodeData);

  const openTarget = () => {
    const targetId = data.targetWorkflowId;
    if (!targetId) return;
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'editor');
    url.searchParams.set('source', 'public');
    url.searchParams.set('id', targetId);
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  };

  return (
    <NodeFrame
      id={id}
      data={data}
      selected={selected}
      icon={<Icons.ExternalLink />}
      defaultLabel={data.label || '工作流連結'}
      minWidth={260}
      minHeight={160}
      className="workflow-link-node"
      headerExtras={
        <button className="exec-button" onClick={(e) => { e.stopPropagation(); openTarget(); }}>
          開啟
        </button>
      }
      customHandleDescriptions={{ 'h-in': '關聯引用輸入', 'h-out': '開啟目標工作流' }}
    >
      <div className="workflow-link-body">
        <label className="workflow-link-field">
          <span>目標工作流 ID</span>
          <input
            value={data.targetWorkflowId || ''}
            onChange={(e) => updateNodeData(id, { ...data, targetWorkflowId: e.target.value })}
            placeholder="workflow-cosine-law"
          />
        </label>
        <label className="workflow-link-field">
          <span>顯示標題</span>
          <input
            value={data.targetWorkflowTitle || ''}
            onChange={(e) => updateNodeData(id, { ...data, targetWorkflowTitle: e.target.value })}
            placeholder="餘弦定理工作流"
          />
        </label>
        <label className="workflow-link-field">
          <span>說明文字</span>
          <textarea
            value={data.callout || ''}
            onChange={(e) => updateNodeData(id, { ...data, callout: e.target.value })}
            placeholder="說明跳轉至此工作流的原因..."
          />
        </label>
        <div className="workflow-link-foot">
          <span className="workflow-link-badge">外部連結</span>
          <button className="sidebar-btn" onClick={(e) => { e.stopPropagation(); openTarget(); }}>
            <Icons.ExternalLink /> 開啟引用的工作流
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
