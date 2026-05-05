import React from 'react';
import useStore, { type NodeComment, type NodeData } from '../store/useStore';
import { Icons } from './Icons';
import {
  saveNodeCommentToSupabase,
  updateNodeCommentStatusInSupabase,
} from '../integrations/supabase/nodeComments';

type NodeCommentsProps = {
  nodeId: string;
  data: NodeData;
};

const makeCommentId = () => `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const commentKinds = [
  { value: 'comment', label: '留言' },
  { value: 'question', label: '提問' },
  { value: 'request', label: '要求' },
  { value: 'issue', label: '回報' },
] as const;

const kindLabel = (kind: NodeComment['kind']) => (
  commentKinds.find(item => item.value === (kind ?? 'comment'))?.label ?? '留言'
);

export function NodeComments({ nodeId, data }: NodeCommentsProps) {
  const user = useStore(state => state.user);
  const projectRoot = useStore(state => state.nodes.find(node => node.type === 'projectNode'));
  const updateNodeData = useStore(state => state.updateNodeData);
  const [isOpen, setIsOpen] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [kind, setKind] = React.useState<NodeComment['kind']>('comment');
  const comments = data.nodeComments ?? [];
  const openCount = comments.filter(comment => (comment.status ?? 'open') === 'open').length;

  const addComment = () => {
    const body = draft.trim();
    if (!body) return;

    const nextComment: NodeComment = {
      id: makeCommentId(),
      body,
      kind,
      status: 'open',
      authorId: user?.id,
      authorName: user?.name || 'Anonymous',
      createdAt: new Date().toISOString(),
    };

    updateNodeData(nodeId, {
      nodeComments: [...comments, nextComment],
    }, { skipGraphEval: true });
    const workflowId = projectRoot?.data.supabaseWorkflowId;
    if (workflowId) {
      void saveNodeCommentToSupabase({
        comment: nextComment,
        workflowId,
        workflowVersionId: projectRoot.data.workflowVersionId,
        nodeId,
        nodeLabel: data.label || nodeId,
      }).catch((error) => {
        console.warn('[node-comments] failed to sync comment:', error);
      });
    }
    setDraft('');
    setIsOpen(true);
  };

  const toggleResolved = (comment: NodeComment) => {
    const nextStatus = (comment.status ?? 'open') === 'resolved' ? 'open' : 'resolved';
    updateNodeData(nodeId, {
      nodeComments: comments.map(item => (
        item.id === comment.id
          ? {
              ...item,
              status: nextStatus,
              resolvedAt: nextStatus === 'resolved' ? new Date().toISOString() : undefined,
              resolvedBy: nextStatus === 'resolved' ? user?.id : undefined,
            }
          : item
      )),
    }, { skipGraphEval: true });
    void updateNodeCommentStatusInSupabase(comment.id, nextStatus, user?.id).catch((error) => {
      console.warn('[node-comments] failed to sync status:', error);
    });
  };

  return (
    <div className="node-comments nodrag" onMouseDown={(event) => event.stopPropagation()}>
      <button
        type="button"
        className={`node-comments-trigger ${comments.length > 0 ? 'has-comments' : ''}`}
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen(value => !value);
        }}
        title={comments.length > 0 ? `${comments.length} 則留言，${openCount} 則未解決` : '留言'}
      >
        <Icons.Comment size={13} style={{ marginRight: 0 }} />
        {comments.length > 0 && <span>{comments.length}</span>}
      </button>

      {isOpen && (
        <div className="node-comments-popover">
          <div className="node-comments-title">
            <strong>節點留言</strong>
            <button type="button" onClick={() => setIsOpen(false)} aria-label="Close comments">×</button>
          </div>
          <div className="node-comments-list">
            {comments.length === 0 ? (
              <p className="node-comments-empty">還沒有留言。</p>
            ) : comments.map(comment => {
              const status = comment.status ?? 'open';
              return (
              <article key={comment.id} className={`node-comment-item ${status}`}>
                <div className="node-comment-meta">
                  <span className={`node-comment-kind ${comment.kind ?? 'comment'}`}>{kindLabel(comment.kind)}</span>
                  <strong>{comment.authorName}</strong>
                  <time>{new Date(comment.createdAt).toLocaleString()}</time>
                </div>
                <p>{comment.body}</p>
                {(comment.kind === 'question' || comment.kind === 'request' || comment.kind === 'issue') && (
                  <button type="button" className="node-comment-resolve" onClick={() => toggleResolved(comment)}>
                    {status === 'resolved' ? '重新開啟' : '標記 resolved'}
                  </button>
                )}
              </article>
            );})}
          </div>
          <div className="node-comments-compose-row">
            <select
              name={`node-comment-kind-${nodeId}`}
              value={kind}
              onChange={(event) => setKind(event.target.value as NodeComment['kind'])}
              aria-label="Comment type"
            >
              {commentKinds.map(item => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <span>{kind === 'comment' ? '一般討論' : kind === 'question' ? '可進論壇提問' : kind === 'request' ? '可追蹤要求' : '可追蹤問題'}</span>
          </div>
          <textarea
            name={`node-comment-draft-${nodeId}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="對這個節點留言..."
            rows={3}
            onKeyDown={(event) => {
              event.stopPropagation();
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                addComment();
              }
            }}
          />
          <button type="button" className="node-comments-submit" onClick={addComment} disabled={!draft.trim()}>
            發送
          </button>
        </div>
      )}
    </div>
  );
}
