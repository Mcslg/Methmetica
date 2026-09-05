import React from 'react';
import { type NodeProps, Handle, Position, useReactFlow } from '@xyflow/react';
import { Icons } from '../components/Icons';
import { NodeFrame } from '../components/NodeFrame';
import useStore, { type AppNode } from '../store/useStore';
import { useLanguage } from '../contexts/LanguageContext';
import type { WorkflowChangeType, WorkflowIcon, WorkflowVisibility } from '../community/types';
import { DEFAULT_WORKFLOW_ICON, WORKFLOW_ICON_OPTIONS, normalizeWorkflowIcon, renderWorkflowIconVisual } from '../utils/workflowIcons';
import { publishWorkflowToSupabase } from '../integrations/supabase/workflows';
import { getUserRole } from '../integrations/supabase/auth';
import { clearPublicWorkflowEdit } from '../utils/localDraftService';

const parseTags = (value: string) => value
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);

const INVISIBLE_HANDLE_STYLE = { opacity: 0 };
const getPublishVisibility = (visibility: unknown): WorkflowVisibility => (visibility === 'core' ? 'core' : 'public');

type PublishUpdateMetadata = {
  changeType?: WorkflowChangeType;
  updatePolicy?: 'none' | 'manual' | 'auto';
  updateSummary?: string;
  warningMessage?: string;
};

export const ProjectNode = React.memo(function ProjectNode({ id, data, selected }: NodeProps<AppNode>) {
  const { setViewport, getNodes } = useReactFlow();
  const { t } = useLanguage();
  const updateNodeData = useStore(state => state.updateNodeData);
  const activeFileId = useStore(state => state.activeFileId);
  const user = useStore(state => state.user);
  const setUser = useStore(state => state.setUser);
  const markCurrentGraphSaved = useStore(state => state.markCurrentGraphSaved);

  const [localName, setLocalName] = React.useState(data.label || '');
  const [localDesc, setLocalDesc] = React.useState(data.description || '');
  const [localTags, setLocalTags] = React.useState(Array.isArray(data.tags) ? data.tags.join(', ') : '');
  const [localWorkflowIcon, setLocalWorkflowIcon] = React.useState(normalizeWorkflowIcon(data.workflowIcon));
  const [isIconPickerOpen, setIsIconPickerOpen] = React.useState(false);
  const [isExpanded, setIsExpanded] = React.useState(true);
  const [isPublishing, setIsPublishing] = React.useState(false);

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
    const nextWorkflowIcon = normalizeWorkflowIcon(data.workflowIcon);
    if (JSON.stringify(nextWorkflowIcon) !== JSON.stringify(localWorkflowIcon)) {
      setLocalWorkflowIcon(nextWorkflowIcon);
    }
  }, [data.description, data.label, data.tags, data.workflowIcon, localDesc, localName, localTags, localWorkflowIcon]);

  const saveWorkflowMetadata = React.useCallback((patch?: Partial<{
    label: string;
    description: string;
    tags: string[];
    workflowIcon: WorkflowIcon;
  }>) => {
    const finalName = (patch?.label ?? localName).trim() || '未命名工作流';
    const finalDesc = patch?.description ?? localDesc;
    const finalTags = patch?.tags ?? parseTags(localTags);
    const finalWorkflowIcon = patch?.workflowIcon ?? localWorkflowIcon;

    if (finalName !== localName) setLocalName(finalName);
    if (finalDesc !== localDesc) setLocalDesc(finalDesc);
    const finalTagsText = finalTags.join(', ');
    if (finalTagsText !== localTags) setLocalTags(finalTagsText);

    updateNodeData(id, {
      label: finalName,
      description: finalDesc,
      tags: finalTags,
      visibility: data.visibility || 'private',
      workflowIcon: finalWorkflowIcon,
    }, { skipGraphEval: true });

    const builderNodeId = data.builderNodeId as string | undefined;
    if (builderNodeId) {
      updateNodeData(builderNodeId, {
        label: finalName,
        description: finalDesc,
        tags: finalTags,
        visibility: data.visibility || 'private',
        workflowIcon: finalWorkflowIcon,
      }, { skipGraphEval: true });
    }
  }, [data.builderNodeId, data.visibility, id, localDesc, localName, localTags, localWorkflowIcon, updateNodeData]);

  const handlePublishWorkflowOnly = React.useCallback(async (publishOptions?: PublishUpdateMetadata) => {
    setIsPublishing(true);
    try {
      if (!user) {
        updateNodeData(id, { publishStatus: '先登入，才能發布 workflow。' }, { skipGraphEval: true });
        return;
      }

      let effectiveUser = user;
      const fetchedRole = await getUserRole(user.id);
      if (fetchedRole !== user.role) {
        effectiveUser = { ...user, role: fetchedRole };
        setUser(effectiveUser);
      }

      const visibility = getPublishVisibility(data.visibility);
      if (visibility === 'core' && !['trusted_editor', 'admin'].includes(fetchedRole)) {
        updateNodeData(id, {
          publishStatus: '只有 trusted_editor 或 admin 能發布 core workflow。先改成 public，或提升身份後再發布。',
        }, { skipGraphEval: true });
        return;
      }

      const state = useStore.getState();
      const hasCodeNode = state.nodes.some(node => node.type === 'codeNode');
      if (hasCodeNode && fetchedRole !== 'admin') {
        updateNodeData(id, { publishStatus: '只有 admin 可發布含 CodeNode 的 workflow。' }, { skipGraphEval: true });
        return;
      }

      const title = (localName || data.label || '未命名工作流').trim() || '未命名工作流';
      const description = localDesc || data.description || '';
      const tags = parseTags(localTags);
      const updateMetadata = {
        changeType: publishOptions?.changeType ?? 'feature',
        updatePolicy: publishOptions?.updatePolicy ?? 'manual',
        updateSummary: publishOptions?.updateSummary,
        warningMessage: publishOptions?.warningMessage,
      };

      const publishedNodes = state.nodes.map(node => (
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                label: title,
                description,
                tags,
                visibility,
                workflowIcon: localWorkflowIcon,
                supabaseWorkflowId: data.supabaseWorkflowId,
                reviewStatus: 'unreviewed' as const,
                reviewCount: 0,
                reviewRequired: visibility === 'core',
                reviewWarning: false,
                requiredContributorReviews: visibility === 'core' ? 1 : 2,
                requiredExpertReviews: visibility === 'core' ? 1 : 0,
                contributorReviewCount: 0,
                expertReviewCount: 0,
                extraContributorReviews: 0,
                extraExpertReviews: 0,
                reviewedByMe: false,
                changeType: updateMetadata.changeType,
                updatePolicy: updateMetadata.updatePolicy,
                updateSummary: updateMetadata.updateSummary,
                warningMessage: updateMetadata.warningMessage,
              },
            }
          : node
      ));

      const blueprint = await publishWorkflowToSupabase({
        id: typeof data.supabaseWorkflowId === 'string' ? data.supabaseWorkflowId : undefined,
        title,
        description,
        tags,
        visibility,
        nodes: publishedNodes,
        edges: state.edges,
        author: effectiveUser,
        publishKind: 'workflow',
        workflowIcon: localWorkflowIcon,
        ...updateMetadata,
      });

      updateNodeData(id, {
        label: title,
        description,
        tags,
        visibility,
        workflowIcon: localWorkflowIcon,
        supabaseWorkflowId: blueprint.card.id,
        hasPublishedTemplate: false,
        reviewStatus: blueprint.meta?.reviewStatus ?? 'unreviewed',
        reviewCount: blueprint.meta?.reviewCount ?? 0,
        reviewRequired: blueprint.meta?.reviewRequired ?? (visibility === 'core'),
        reviewWarning: blueprint.meta?.reviewWarning ?? false,
        requiredContributorReviews: blueprint.meta?.requiredContributorReviews ?? (visibility === 'core' ? 1 : 2),
        requiredExpertReviews: blueprint.meta?.requiredExpertReviews ?? (visibility === 'core' ? 1 : 0),
        contributorReviewCount: blueprint.meta?.contributorReviewCount ?? 0,
        expertReviewCount: blueprint.meta?.expertReviewCount ?? 0,
        extraContributorReviews: blueprint.meta?.extraContributorReviews ?? 0,
        extraExpertReviews: blueprint.meta?.extraExpertReviews ?? 0,
        reviewedByMe: false,
        changeType: blueprint.meta?.changeType ?? updateMetadata.changeType,
        updatePolicy: blueprint.meta?.updatePolicy ?? updateMetadata.updatePolicy,
        updateSummary: blueprint.meta?.updateSummary ?? updateMetadata.updateSummary,
        warningMessage: blueprint.meta?.warningMessage ?? updateMetadata.warningMessage,
        supersedesVersionId: blueprint.meta?.supersedesVersionId,
        publishStatus: visibility === 'core'
          ? `已送出 workflow "${title}"，核心 workflow 需要 1 位貢獻者與 1 位專家審核後才會開放。`
          : `已發布 workflow "${title}"，目前未驗證；2 位貢獻者審核後會標記 verified。`,
      }, { skipGraphEval: true });
      window.dispatchEvent(new CustomEvent('methmetica:public-workflows-changed', {
        detail: { workflowId: blueprint.card.id, action: 'published' },
      }));
      clearPublicWorkflowEdit(blueprint.card.id, effectiveUser.id);
      setTimeout(() => markCurrentGraphSaved(), 0);
    } catch (error) {
      console.error('Failed to publish workflow only from ProjectNode', error);
      updateNodeData(id, {
        publishStatus: `發布失敗：${error instanceof Error ? error.message : '發布失敗'}`,
      }, { skipGraphEval: true });
    } finally {
      setIsPublishing(false);
    }
  }, [
    data.description,
    data.label,
    data.supabaseWorkflowId,
    data.visibility,
    id,
    localDesc,
    localName,
    localTags,
    localWorkflowIcon,
    markCurrentGraphSaved,
    setUser,
    updateNodeData,
    user,
  ]);

  React.useEffect(() => {
    const handleSidebarPublishWorkflow = (event: Event) => {
      const detail = (event as CustomEvent<PublishUpdateMetadata & { projectNodeId?: string }>).detail;
      if (detail?.projectNodeId && detail.projectNodeId !== id) return;
      if (isPublishing || data.builderDraft) return;
      void handlePublishWorkflowOnly(detail);
    };

    window.addEventListener('publish-project-workflow', handleSidebarPublishWorkflow);
    return () => window.removeEventListener('publish-project-workflow', handleSidebarPublishWorkflow);
  }, [data.builderDraft, handlePublishWorkflowOnly, id, isPublishing]);

  const handleFocus = () => {
    const node = getNodes().find(n => n.id === id);
    if (node) {
      setViewport({ x: window.innerWidth / 2 - node.position.x - 280, y: window.innerHeight / 2 - node.position.y - 240, zoom: 0.72 }, { duration: 800 });
    }
  };

  return (
    <NodeFrame
      id={id}
      data={data}
      selected={selected}
      icon={<Icons.Package />}
      defaultLabel={t('nodes.project.name_label') || '專案設定'}
      className="project-node"
      minWidth={320}
      minHeight={180}
      contentStyle={{ overflow: 'visible' }}
      headerExtras={
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button
            onClick={handleFocus}
            title={t('nodes.project.view_label') || '聚焦視角'}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-sub)', cursor: 'pointer', padding: '4px' }}
          >
            <Icons.Grid size={14} />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-sub)', cursor: 'pointer', padding: '4px' }}
          >
            {isExpanded ? <Icons.Collapse size={14} /> : <Icons.Search size={14} />}
          </button>
        </div>
      }
    >
      <div className="project-node-content">
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', fontSize: '0.7rem', color: 'var(--text-sub)' }}>
          {activeFileId ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--system-success)' }}>
              <Icons.Languages size={10} /> {t('nodes.project.last_sync') || '已同步至雲端'}
            </span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--system-warning)' }}>
              <Icons.Moon size={10} /> {t('nodes.project.unsaved') || '未同步至雲端'}
            </span>
          )}
        </div>

        {isExpanded && (
          <div className="project-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="root-metadata">
              <div className="root-field">
                <span>圖示</span>
                <div className="workflow-icon-picker">
                  <button
                    type="button"
                    className={`workflow-icon-preview ${isIconPickerOpen ? 'active' : ''}`}
                    title="選擇工作流圖示"
                    aria-expanded={isIconPickerOpen}
                    onClick={() => setIsIconPickerOpen(value => !value)}
                    style={{
                      background: `${localWorkflowIcon.accent || DEFAULT_WORKFLOW_ICON.accent}22`,
                      color: localWorkflowIcon.accent || DEFAULT_WORKFLOW_ICON.accent,
                    }}
                  >
                    {renderWorkflowIconVisual(localWorkflowIcon, 20)}
                  </button>
                  <span className="workflow-icon-current">{localWorkflowIcon.value}</span>
                  {isIconPickerOpen && (
                    <div className="workflow-icon-popover">
                      <div className="workflow-icon-popover-header">
                        <strong>圖示</strong>
                        <input
                          name={`project-icon-accent-${id}`}
                          className="workflow-icon-color"
                          type="color"
                          value={localWorkflowIcon.accent || DEFAULT_WORKFLOW_ICON.accent}
                          title="圖示顏色"
                          onChange={(e) => {
                            const nextIcon = { ...localWorkflowIcon, accent: e.target.value };
                            setLocalWorkflowIcon(nextIcon);
                            saveWorkflowMetadata({ workflowIcon: nextIcon });
                          }}
                        />
                      </div>
                      <div className="workflow-icon-option-grid">
                        {WORKFLOW_ICON_OPTIONS.map(option => {
                          const isActive = option.value === localWorkflowIcon.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              className={`workflow-icon-option ${isActive ? 'active' : ''}`}
                              title={option.label}
                              aria-pressed={isActive}
                              onClick={() => {
                                const nextIcon = normalizeWorkflowIcon({ ...localWorkflowIcon, type: 'lucide', value: option.value });
                                setLocalWorkflowIcon(nextIcon);
                                saveWorkflowMetadata({ workflowIcon: nextIcon });
                                setIsIconPickerOpen(false);
                              }}
                            >
                              {option.render({ size: 16, style: { marginRight: 0 } })}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <label className="root-field" style={{ gridColumn: '1 / -1' }}>
                <span>{t('nodes.project.name_label') || '工作流名稱'}</span>
                <input
                  name={`project-name-${id}`}
                  type="text"
                  className="project-name-input"
                  value={localName}
                  onChange={(e) => setLocalName(e.target.value)}
                  onBlur={() => saveWorkflowMetadata()}
                  placeholder={t('nodes.project.name_placeholder') || '請輸入工作流名稱...'}
                />
              </label>
              <label className="root-field">
                <span>{t('nodes.project.desc_label') || '專案描述'}</span>
                <textarea
                  name={`project-description-${id}`}
                  className="project-desc-input"
                  value={localDesc}
                  onChange={(e) => setLocalDesc(e.target.value)}
                  onBlur={() => saveWorkflowMetadata()}
                  placeholder={t('nodes.project.desc_placeholder') || '寫下關於這個工作流的細節...'}
                />
              </label>
              <label className="root-field">
                <span>標籤</span>
                <input
                  name={`project-tags-${id}`}
                  type="text"
                  className="project-tags-input"
                  value={localTags}
                  onChange={(e) => setLocalTags(e.target.value)}
                  onBlur={() => saveWorkflowMetadata()}
                  placeholder="geometry, theorem, core"
                />
              </label>
            </div>

            <div className="builder-cta">
              <div>
                <strong>把這條工作流建立成自訂節點</strong>
                <p>
                  開啟側邊欄節點製造工具箱，透過拖曳輕鬆客製卡片外觀並一鍵封裝。
                </p>
              </div>
              <button
                className="builder-create-btn"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('open-node-creator-tab'));
                }}
              >
                <Icons.Package /> 設計與建立節點
              </button>
            </div>
          </div>
        )}
        <Handle type="source" position={Position.Right} id="name-out" style={INVISIBLE_HANDLE_STYLE} />
      </div>
    </NodeFrame>
  );
});
