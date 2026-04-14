import useStore from '../store/useStore';

export function WorkflowHeader() {
  const nodes = useStore(state => state.nodes);
  const user = useStore(state => state.user);
  const isSidebarOpen = useStore(state => state.isSidebarOpen);
  const projectNode = nodes.find(node => node.type === 'projectNode');

  if (!projectNode) return null;

  const title = projectNode.data.label || 'Untitled Workflow';
  const visibility = projectNode.data.visibility || 'private';
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
        left: isSidebarOpen ? 292 : 24,
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
        </span>
      </div>
    </div>
  );
}
