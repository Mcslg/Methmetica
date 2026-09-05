import useStore from '../store/useStore';

export function WorkflowHeader() {
  const nodes = useStore(state => state.nodes);
  const user = useStore(state => state.user);
  const isSidebarOpen = useStore(state => state.isSidebarOpen);
  const projectNode = nodes.find(node => node.type === 'projectNode');

  if (!projectNode) return null;

  const title = projectNode.data.label || '未命名工作流';
  const visibility = projectNode.data.visibility || 'private';
  const visibilityText = String(visibility) === 'public' ? '公開' : String(visibility) === 'unlisted' ? '不公開' : String(visibility) === 'core' ? '核心' : '私人';
  const reviewStatus = projectNode.data.reviewStatus;
  const isUnverified = visibility !== 'private' && reviewStatus === 'unreviewed';
  const ownerId = projectNode.data.ownerId;
  const authorName = projectNode.data.authorName;
  const isPublicSource = projectNode.data.workflowSource === 'public' || projectNode.data.readOnlyPreview;
  const isOwner = Boolean(ownerId && user?.id === ownerId);
  const shouldShowAuthor = Boolean(authorName && isPublicSource && !isOwner);


  return (
    <div
      className="workflow-header-overlay"
      style={{
        position: 'absolute',
        left: isSidebarOpen ? 228 : 24,
        top: 16,
        zIndex: 20,
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 14px',
        minWidth: 210,
        maxWidth: 440,
        borderRadius: 10,
        border: '1px solid var(--border-node)',
        background: 'var(--bg-node)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: 'var(--node-shadow)',
        color: 'var(--text-main)',
        transition: 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.2s ease, border-color 0.2s ease',
      }}
    >
      <div style={{ display: 'grid', gap: 2, minWidth: 0, flex: 1 }}>
        <strong style={{ fontSize: '0.9rem', fontWeight: 600, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-main)' }}>
          {title}
        </strong>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-sub)', lineHeight: 1.4 }}>
          {shouldShowAuthor ? `作者：${authorName} · ` : ''}
          {visibilityText}
          {isUnverified ? ' · 未驗證' : ''}
        </span>
      </div>
      {isUnverified && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-warning-bg)',
          border: '1px solid var(--color-warning-border)',
          borderRadius: '10px',
          padding: '2px 8px',
          fontSize: '0.72rem',
          fontWeight: 700,
          color: 'var(--color-warning)',
          whiteSpace: 'nowrap',
        }} title="此 workflow 尚未通過社群審核">
          未驗證
        </div>
      )}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-input)',
        border: '1px solid var(--border-header)',
        borderRadius: '10px',
        padding: '2px 8px',
        fontSize: '0.75rem',
        fontWeight: 600,
        color: 'var(--text-sub)',
        whiteSpace: 'nowrap',
      }} title={`${nodes.length} 個節點`}>
        {nodes.length}
      </div>
    </div>
  );
}
