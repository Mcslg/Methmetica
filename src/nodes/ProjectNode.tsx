import React from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import { Icons } from '../components/Icons';
import useStore from '../store/useStore';
import { useLanguage } from '../contexts/LanguageContext';
import { CommunityNodeMaker, buildTemplateFromBlocks } from '../components/CommunityNodeMaker';
import type { CommunityNodeTemplate, WorkflowVisibility } from '../community/types';
import { makeInitialDraft, syncDraftWithWorkflowMetadata } from '../community/templateDraft';
import { publishWorkflowToSupabase } from '../integrations/supabase/workflows';
import { getUserRole } from '../integrations/supabase/auth';

const parseTags = (value: string) => value
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);

export function ProjectNode({ id, data }: { id: string; data: any }) {
  const { setViewport, getNodes } = useReactFlow();
  const { updateNodeData, activeFileId, upsertCommunityTemplate, nodes, edges, user, setUser, markCurrentGraphSaved } = useStore();
  const { t } = useLanguage();

  const [localName, setLocalName] = React.useState(data.label || '');
  const [localDesc, setLocalDesc] = React.useState(data.description || '');
  const [localTags, setLocalTags] = React.useState(Array.isArray(data.tags) ? data.tags.join(', ') : '');
  const [localVisibility, setLocalVisibility] = React.useState<WorkflowVisibility>(data.visibility || 'private');
  const [isExpanded, setIsExpanded] = React.useState(true);
  const [isPublishing, setIsPublishing] = React.useState(false);

  const saveWorkflowMetadata = React.useCallback((patch?: Partial<{ label: string; description: string; tags: string[]; visibility: WorkflowVisibility }>) => {
    const finalName = (patch?.label ?? localName).trim() || 'Untitled Workflow';
    const finalDesc = patch?.description ?? localDesc;
    const finalTags = patch?.tags ?? parseTags(localTags);
    const finalVisibility = patch?.visibility ?? localVisibility;
    const existingDraft = data.builderDraft as CommunityNodeTemplate | undefined;
    const nextDraft = existingDraft
      ? syncDraftWithWorkflowMetadata(existingDraft, {
          title: finalName,
          summary: finalDesc,
          tags: finalTags,
        })
      : undefined;

    if (finalName !== localName) setLocalName(finalName);

    updateNodeData(id, {
      ...data,
      label: finalName,
      description: finalDesc,
      tags: finalTags,
      visibility: finalVisibility,
      ...(nextDraft ? { builderDraft: nextDraft } : {}),
    });
  }, [data, id, localDesc, localName, localTags, localVisibility, updateNodeData]);

  const handleFocus = () => {
    const node = getNodes().find(n => n.id === id);
    if (node) {
      setViewport({ x: window.innerWidth / 2 - node.position.x - 280, y: window.innerHeight / 2 - node.position.y - 240, zoom: 0.72 }, { duration: 800 });
    }
  };

  const handleCreateBuilder = () => {
    const draft = makeInitialDraft({
      title: (localName || data.label || 'Untitled Workflow').trim(),
      summary: localDesc || data.description || '',
      tags: parseTags(localTags),
    });

    updateNodeData(id, {
      ...data,
      label: draft.title,
      description: draft.summary,
      tags: draft.tags,
      visibility: localVisibility,
      builderDraft: draft,
      publishStatus: '這條工作流現在已經是可發布的節點 root。',
    });
    setIsExpanded(true);
  };

  const handleDraftChange = (draft: CommunityNodeTemplate) => {
    const syncedDraft = syncDraftWithWorkflowMetadata(draft, {
      title: (localName || data.label || draft.title).trim() || draft.title,
      summary: localDesc || data.description || draft.summary,
      tags: parseTags(localTags),
    });

    updateNodeData(id, {
      ...data,
      builderDraft: syncedDraft,
      label: syncedDraft.title,
      description: syncedDraft.summary,
      tags: syncedDraft.tags,
    });
  };

  const handlePublish = async (draft: CommunityNodeTemplate) => {
    if (!user) {
      updateNodeData(id, {
        ...data,
        publishStatus: '先登入，才能把這條工作流發布到公開社群。',
      });
      return;
    }

    let effectiveUser = user;

    if (localVisibility === 'core' && !['trusted_editor', 'admin'].includes(user.role)) {
      const fetchedRole = await getUserRole(user.id);
      if (fetchedRole !== user.role) {
        effectiveUser = { ...user, role: fetchedRole };
        setUser(effectiveUser);
      }

      if (!['trusted_editor', 'admin'].includes(fetchedRole)) {
        updateNodeData(id, {
          ...data,
          publishStatus: '只有 trusted_editor 或 admin 能發布 core workflow。先改成 public，或提升身份後再發布。',
        });
        return;
      }
    }

    setIsPublishing(true);
    const syncedDraft = syncDraftWithWorkflowMetadata(draft, {
      title: (localName || data.label || draft.title).trim() || draft.title,
      summary: localDesc || data.description || draft.summary,
      tags: parseTags(localTags),
    });

    try {
      const packaged = buildTemplateFromBlocks({
        ...syncedDraft,
        version: syncedDraft.version || '1.0.0',
        discovery: 'search-only',
        visibility: localVisibility,
      });

      const publishedNodes = nodes.map(node => (
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                label: packaged.title,
                description: packaged.summary,
                tags: packaged.tags,
                visibility: localVisibility,
                builderDraft: packaged,
                supabaseWorkflowId: data.supabaseWorkflowId,
              },
            }
          : node
      ));

      const blueprint = await publishWorkflowToSupabase({
        id: data.supabaseWorkflowId,
        title: packaged.title,
        description: packaged.summary,
        tags: packaged.tags,
        visibility: localVisibility,
        nodes: publishedNodes,
        edges,
        author: effectiveUser,
      });

      const publishedTemplate = {
        ...packaged,
        relatedWorkflowIds: Array.from(new Set([...(packaged.relatedWorkflowIds || []), blueprint.card.id])),
      };

      upsertCommunityTemplate(publishedTemplate);
      updateNodeData(id, {
        ...data,
        label: publishedTemplate.title,
        description: publishedTemplate.summary,
        tags: publishedTemplate.tags,
        visibility: localVisibility,
        builderDraft: publishedTemplate,
        supabaseWorkflowId: blueprint.card.id,
        publishStatus: `已發布 "${publishedTemplate.title}" 到公開社群，可透過右鍵搜尋找到，也會出現在 Public Workflows。`,
      });
      setTimeout(() => markCurrentGraphSaved(), 0);
    } catch (error) {
      console.error('Failed to publish workflow', error);
      const message = error instanceof Error ? error.message : '發布失敗';
      updateNodeData(id, {
        ...data,
        publishStatus: `發布失敗：${message}`,
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const publishStatus = data.publishStatus || '發布此工作流，就等於發布這個節點。';
  const builderDraft = data.builderDraft as CommunityNodeTemplate | undefined;

  React.useEffect(() => {
    if (data.label !== localName && document.activeElement?.className !== 'project-name-input') {
      setLocalName(data.label || '');
    }
    if (data.description !== localDesc && document.activeElement?.className !== 'project-desc-input') {
      setLocalDesc(data.description || '');
    }
    const nextTags = Array.isArray(data.tags) ? data.tags.join(', ') : '';
    if (nextTags !== localTags && document.activeElement?.className !== 'project-tags-input') {
      setLocalTags(nextTags);
    }
    if (data.visibility && data.visibility !== localVisibility) {
      setLocalVisibility(data.visibility);
    }
  }, [data.label, data.description, data.tags, data.visibility, localDesc, localName, localTags, localVisibility]);

  return (
    <div className={`project-node-container ${isExpanded ? 'expanded' : ''}`}>
      <div className="project-header">
        <div className="project-icon-wrapper">
          <Icons.Package size={28} />
        </div>
        <div className="project-title-area">
          <input
            type="text"
            className="project-name-input"
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            onBlur={() => saveWorkflowMetadata()}
            placeholder={t('nodes.project.name_label') || 'Workflow Name'}
          />
          <div className="project-meta">
            {activeFileId ? (
              <span className="sync-status">
                <Icons.Languages size={10} /> {t('nodes.project.last_sync') || 'Cloud Protected'}
              </span>
            ) : (
              <span className="sync-status local">
                <Icons.Moon size={10} /> {t('nodes.project.unsaved') || 'Local Session'}
              </span>
            )}
            <span className="sync-status builder">
              <Icons.Search size={10} /> Search-only node
            </span>
          </div>
        </div>
        <div className="project-ctrls">
          <button className="focus-btn" onClick={handleFocus} title={t('nodes.project.view_label') || 'Focus Area'}>
            <Icons.Grid size={16} />
          </button>
          <button className={`expand-btn ${isExpanded ? 'active' : ''}`} onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? <Icons.Collapse size={14} /> : <Icons.Search size={14} />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="project-body">
          <div className="root-metadata">
            <label className="root-field">
              <span>{t('nodes.project.desc_label') || 'Description'}</span>
              <textarea
                className="project-desc-input"
                value={localDesc}
                onChange={(e) => setLocalDesc(e.target.value)}
                onBlur={() => saveWorkflowMetadata()}
                placeholder={t('nodes.project.desc_placeholder') || 'Explain this workflow...'}
              />
            </label>
            <label className="root-field">
              <span>Tags</span>
              <input
                type="text"
                className="project-tags-input"
                value={localTags}
                onChange={(e) => setLocalTags(e.target.value)}
                onBlur={() => saveWorkflowMetadata()}
                placeholder="geometry, theorem, core"
              />
            </label>
            <label className="root-field">
              <span>Visibility</span>
              <select
                className="project-visibility-select"
                value={localVisibility}
                onChange={(e) => {
                  const nextVisibility = e.target.value as WorkflowVisibility;
                  setLocalVisibility(nextVisibility);
                  saveWorkflowMetadata({ visibility: nextVisibility });
                }}
              >
                <option value="private">Private</option>
                <option value="public">Public</option>
                <option value="core">Core</option>
              </select>
            </label>
          </div>
          <div className="root-visibility-hint">
            {localVisibility === 'private' && 'Private 不會出現在公開社群。'}
            {localVisibility === 'public' && 'Public 會出現在公開社群，任何人都可讀。'}
            {localVisibility === 'core' && 'Core 只允許 trusted_editor / admin 發布與更新。'}
          </div>

          {!builderDraft ? (
            <div className="builder-cta">
              <div>
                <strong>把這條工作流建立成節點</strong>
                <p>建立後就能在 root 內設計輸入、輸出、文字、切換和公式元件。發布工作流時，就等於發布此節點。</p>
              </div>
              <button className="builder-create-btn" onClick={handleCreateBuilder}>
                <Icons.Package /> 建立節點
              </button>
            </div>
          ) : (
            <div className="builder-root-panel">
              <div className="builder-root-banner">
                <div>
                  <strong>Builder Root</strong>
                  <p>{publishStatus}</p>
                </div>
                <button className="builder-refresh-btn" onClick={() => saveWorkflowMetadata()}>
                  Sync metadata
                </button>
              </div>

              <CommunityNodeMaker
                draft={builderDraft}
                onChange={handleDraftChange}
                onPublish={handlePublish}
                publishLabel={isPublishing ? '發布中...' : '發布此工作流為節點'}
                status={publishStatus}
                hideMetadataFields
              />
            </div>
          )}
        </div>
      )}

      <style>{`
        .project-node-container {
          padding: 20px;
          background: linear-gradient(180deg, rgba(56, 189, 248, 0.08), rgba(26, 26, 26, 0.88) 24%);
          border: 2px solid rgba(56, 189, 248, 0.45);
          border-radius: 24px;
          min-width: 520px;
          box-shadow: 0 18px 45px rgba(0, 0, 0, 0.35), 0 0 18px rgba(56, 189, 248, 0.12);
          backdrop-filter: blur(20px);
          transition: all 0.3s cubic-bezier(0.19, 1, 0.22, 1);
        }
        .project-node-container.expanded {
          min-width: 1080px;
        }
        .project-header {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .project-icon-wrapper {
          width: 56px;
          height: 56px;
          background: linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(14, 165, 233, 0.9));
          color: white;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 10px 22px rgba(56, 189, 248, 0.22);
        }
        .project-title-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .project-name-input {
          background: transparent;
          border: none;
          color: var(--text-main);
          font-size: 1.35rem;
          font-weight: 800;
          outline: none;
          width: 100%;
        }
        .project-visibility-select {
          width: 100%;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.22);
          background: rgba(15, 23, 42, 0.68);
          color: var(--text-main);
          padding: 12px 14px;
          font: inherit;
        }
        .root-visibility-hint {
          margin-top: -4px;
          font-size: 0.76rem;
          color: var(--text-sub);
          opacity: 0.9;
        }
        .project-meta {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
        }
        .sync-status {
          font-size: 0.68rem;
          font-weight: 700;
          color: var(--accent-bright);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          display: flex;
          align-items: center;
          gap: 4px;
          opacity: 0.9;
        }
        .sync-status.local {
          color: #fbbf24;
        }
        .sync-status.builder {
          color: #38bdf8;
        }
        .project-ctrls {
          display: flex;
          gap: 6px;
        }
        .focus-btn, .expand-btn, .builder-refresh-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: var(--text-sub);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          font: inherit;
        }
        .focus-btn, .expand-btn {
          width: 36px;
          height: 36px;
        }
        .builder-refresh-btn {
          padding: 10px 14px;
        }
        .focus-btn:hover, .expand-btn:hover, .builder-refresh-btn:hover {
          background: rgba(56, 189, 248, 0.12);
          color: #7dd3fc;
          border-color: rgba(56, 189, 248, 0.4);
        }
        .expand-btn.active {
          background: #0284c7;
          color: white;
        }
        .project-body {
          margin-top: 18px;
          padding-top: 18px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          display: grid;
          gap: 16px;
        }
        .root-metadata {
          display: grid;
          grid-template-columns: minmax(0, 1.2fr) minmax(260px, 0.8fr);
          gap: 14px;
        }
        .root-field {
          display: grid;
          gap: 8px;
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--text-sub);
          text-transform: uppercase;
        }
        .project-desc-input,
        .project-tags-input {
          width: 100%;
          box-sizing: border-box;
          background: rgba(0, 0, 0, 0.24);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 12px;
          color: var(--text-main);
          font-size: 0.9rem;
          line-height: 1.5;
          resize: vertical;
          outline: none;
          text-transform: none;
          font-weight: 400;
        }
        .project-desc-input {
          min-height: 112px;
        }
        .project-desc-input:focus,
        .project-tags-input:focus {
          border-color: rgba(56, 189, 248, 0.45);
          background: rgba(0, 0, 0, 0.32);
        }
        .builder-cta {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
          background: rgba(255,255,255,0.03);
          border: 1px dashed rgba(56, 189, 248, 0.35);
          border-radius: 18px;
          padding: 20px;
        }
        .builder-cta strong,
        .builder-root-banner strong {
          display: block;
          color: var(--text-main);
          margin-bottom: 6px;
          text-transform: none;
          font-size: 0.95rem;
        }
        .builder-cta p,
        .builder-root-banner p {
          margin: 0;
          color: var(--text-sub);
          text-transform: none;
          font-weight: 400;
          line-height: 1.5;
        }
        .builder-create-btn {
          white-space: nowrap;
          border: 1px solid rgba(56, 189, 248, 0.35);
          background: rgba(56, 189, 248, 0.14);
          color: #e0f2fe;
          padding: 12px 16px;
          border-radius: 999px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font: inherit;
        }
        .builder-root-panel {
          display: grid;
          gap: 12px;
        }
        .builder-root-banner {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 18px;
          padding: 16px;
        }
        @media (max-width: 1100px) {
          .project-node-container.expanded {
            min-width: 780px;
          }
          .root-metadata {
            grid-template-columns: 1fr;
          }
          .builder-cta,
          .builder-root-banner {
            flex-direction: column;
            align-items: stretch;
          }
        }
      `}</style>

      <Handle type="source" position={Position.Right} id="name-out" style={{ opacity: 0 }} />
    </div>
  );
}
