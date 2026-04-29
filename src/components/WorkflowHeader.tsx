import useStore from '../store/useStore';

export function WorkflowHeader() {
  const nodes = useStore(state => state.nodes);
  const user = useStore(state => state.user);
  const isSidebarOpen = useStore(state => state.isSidebarOpen);
  const projectNode = nodes.find(node => node.type === 'projectNode');

  if (!projectNode) return null;

  const title = projectNode.data.label || 'Untitled Workflow';
  const visibility = projectNode.data.visibility || 'private';
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
        padding: '10px 14px',
        minWidth: 210,
        maxWidth: 440,
        borderRadius: 4,
        border: '1px solid rgba(148, 163, 184, 0.28)',
        background: 'rgba(10, 14, 12, 0.72)',
        backdropFilter: 'blur(18px)',
        boxShadow: '0 14px 34px rgba(0,0,0,0.22)',
        color: 'var(--text-main)',
      }}
    >
      <div style={{ display: 'grid', gap: 3, minWidth: 0, flex: 1 }}>
        <strong style={{ fontSize: '0.92rem', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </strong>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-sub)', lineHeight: 1.4 }}>
          {shouldShowAuthor ? `by ${authorName} · ` : ''}
          {String(visibility).toUpperCase()}
          {isUnverified ? ' · 未驗證' : ''}
        </span>
      </div>
      {isUnverified && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(251, 191, 36, 0.14)',
          border: '1px solid rgba(251, 191, 36, 0.38)',
          borderRadius: '12px',
          padding: '2px 8px',
          fontSize: '0.72rem',
          fontWeight: 700,
          color: '#fbbf24',
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
        borderRadius: '12px',
        padding: '2px 8px',
        fontSize: '0.75rem',
        fontWeight: 600,
        color: 'var(--text-sub)'
      }} title={`${nodes.length} Nodes`}>
        {nodes.length}
      </div>
    </div>
  );
}
