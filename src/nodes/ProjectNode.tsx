import React from 'react';
import { type NodeProps, Handle, Position, useReactFlow } from '@xyflow/react';
import { Icons } from '../components/Icons';
import useStore, { type AppNode, type NodeData } from '../store/useStore';
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

const DRAFT_SYNC_DELAY_MS = 180;
const INVISIBLE_HANDLE_STYLE = { opacity: 0 };
const serializeDraft = (draft?: CommunityNodeTemplate) => (draft ? JSON.stringify(draft) : '');

export const ProjectNode = React.memo(function ProjectNode({ id, data, selected }: NodeProps<AppNode>) {
  const { setViewport, getNodes } = useReactFlow();
  const updateNodeData = useStore(state => state.updateNodeData);
  const activeFileId = useStore(state => state.activeFileId);
  const upsertCommunityTemplate = useStore(state => state.upsertCommunityTemplate);
  const user = useStore(state => state.user);
  const setUser = useStore(state => state.setUser);
  const markCurrentGraphSaved = useStore(state => state.markCurrentGraphSaved);
  const addNode = useStore(state => state.addNode);
  const { t } = useLanguage();

  const [localName, setLocalName] = React.useState(data.label || '');
  const [localDesc, setLocalDesc] = React.useState(data.description || '');
  const [localTags, setLocalTags] = React.useState(Array.isArray(data.tags) ? data.tags.join(', ') : '');
  const [localVisibility, setLocalVisibility] = React.useState<WorkflowVisibility>(data.visibility || 'private');
  const [localBuilderDraft, setLocalBuilderDraft] = React.useState<CommunityNodeTemplate | undefined>(
    data.builderDraft as CommunityNodeTemplate | undefined
  );
  const [isExpanded, setIsExpanded] = React.useState(true);
  const [isPublishing, setIsPublishing] = React.useState(false);
  const builderDraft = localBuilderDraft;
  const linkedTemplateNodeId = data.linkedTemplateNodeId as string | undefined;
  const publishStatus = data.publishStatus || '發布此工作流，就等於發布這個節點。';
  const lastSyncedDraftSignatureRef = React.useRef(serializeDraft(data.builderDraft as CommunityNodeTemplate | undefined));

  const syncDraftWithLocalMetadata = React.useCallback((draft: CommunityNodeTemplate) => syncDraftWithWorkflowMetadata(draft, {
    title: (localName || data.label || draft.title).trim() || draft.title,
    summary: localDesc || data.description || draft.summary,
    tags: parseTags(localTags),
  }), [data.description, data.label, localDesc, localName, localTags]);

  const updateProjectData = React.useCallback((patch: Partial<{
    label: string;
    description: string;
    tags: string[];
    visibility: WorkflowVisibility;
    builderDraft: CommunityNodeTemplate;
    publishStatus: string;
    linkedTemplateNodeId: string;
    supabaseWorkflowId: string;
  }>) => {
    updateNodeData(id, patch, { skipGraphEval: true });
  }, [id, updateNodeData]);

  const syncLinkedTemplateNode = React.useCallback((draft: CommunityNodeTemplate, visibility: WorkflowVisibility) => {
    const state = useStore.getState();
    const projectNode = state.nodes.find(node => node.id === id);
    if (!projectNode) return;

    const managedTemplateNodes = state.nodes.filter(
      node => node.type === 'communityTemplateNode' && node.data?.builderSourceId === id && node.data?.autoManagedTemplateNode
    );
    const linkedTemplateNode = state.nodes.find(node => node.id === linkedTemplateNodeId) || managedTemplateNodes[0];
    const packagedDraft = buildTemplateFromBlocks({
      ...draft,
      slug: draft.slug || draft.id,
      version: draft.version || '1.0.0',
      discovery: 'search-only',
      visibility,
    });

    const linkedNodeData = {
      label: packagedDraft.title || 'Community Template',
      templateId: packagedDraft.id,
      templateDraft: packagedDraft,
      builderSourceId: id,
      autoManagedTemplateNode: true,
      templateFields: Object.fromEntries(packagedDraft.fields.map(field => [field.id, field.defaultValue || ''])),
      templateSummary: packagedDraft.summary,
      handles: [
        ...packagedDraft.inputs.map(handle => ({ ...handle })),
        ...packagedDraft.outputs.map(handle => ({ ...handle })),
      ],
    };

    const linkedDataSignature = JSON.stringify(linkedNodeData);
    const duplicateManagedNodes = managedTemplateNodes.slice(1);

    if (duplicateManagedNodes.length > 0) {
      const duplicateIds = new Set(duplicateManagedNodes.map(node => node.id));
      useStore.setState((current) => ({
        nodes: current.nodes.filter(node => !duplicateIds.has(node.id)),
        edges: current.edges.filter(edge => !duplicateIds.has(edge.source) && !duplicateIds.has(edge.target)),
      }));
      return;
    }

    if (linkedTemplateNode && linkedTemplateNodeId !== linkedTemplateNode.id) {
      updateProjectData({ linkedTemplateNodeId: linkedTemplateNode.id });
      return;
    }

    if (!linkedTemplateNodeId || !linkedTemplateNode) {
      const projectWidth = projectNode.width || (typeof projectNode.style?.width === 'number' ? projectNode.style.width : 1080);
      const linkedPosition = {
        x: projectNode.position.x + Math.min(projectWidth + 56, 420),
        y: projectNode.position.y + 36,
      };
      const newLinkedId = `builder-template-${id}`;
      addNode({
        id: newLinkedId,
        type: 'communityTemplateNode',
        position: linkedPosition,
        width: packagedDraft.size.width,
        height: packagedDraft.size.height,
        style: { width: packagedDraft.size.width, height: packagedDraft.size.height },
        selected: true,
        data: linkedNodeData,
      } as AppNode);
      useStore.setState((current) => ({
        nodes: current.nodes.map(node =>
          node.id === id ? { ...node, selected: false } : node.id === newLinkedId ? { ...node, selected: true } : { ...node, selected: false }
        ),
      }));
      updateProjectData({ linkedTemplateNodeId: newLinkedId });
      return;
    }

    const currentLinkedDataSignature = JSON.stringify({
      label: linkedTemplateNode.data?.label,
      templateId: linkedTemplateNode.data?.templateId,
      templateDraft: linkedTemplateNode.data?.templateDraft,
      builderSourceId: linkedTemplateNode.data?.builderSourceId,
      autoManagedTemplateNode: linkedTemplateNode.data?.autoManagedTemplateNode,
      templateFields: linkedTemplateNode.data?.templateFields,
      templateSummary: linkedTemplateNode.data?.templateSummary,
      handles: linkedTemplateNode.data?.handles,
    });

    if (currentLinkedDataSignature !== linkedDataSignature) {
      updateNodeData(linkedTemplateNode.id, linkedNodeData as Partial<NodeData>, { skipGraphEval: true });
    }
  }, [addNode, id, linkedTemplateNodeId, updateNodeData, updateProjectData]);

  const saveWorkflowMetadata = React.useCallback((patch?: Partial<{ label: string; description: string; tags: string[]; visibility: WorkflowVisibility }>) => {
    const finalName = (patch?.label ?? localName).trim() || 'Untitled Workflow';
    const finalDesc = patch?.description ?? localDesc;
    const finalTags = patch?.tags ?? parseTags(localTags);
    const finalVisibility = patch?.visibility ?? localVisibility;
    const existingDraft = localBuilderDraft;
    const nextDraft = existingDraft
      ? syncDraftWithWorkflowMetadata(existingDraft, {
          title: finalName,
          summary: finalDesc,
          tags: finalTags,
        })
      : undefined;

    if (finalName !== localName) setLocalName(finalName);
    if (finalDesc !== localDesc) setLocalDesc(finalDesc);
    if (finalVisibility !== localVisibility) setLocalVisibility(finalVisibility);
    const finalTagsText = finalTags.join(', ');
    if (finalTagsText !== localTags) setLocalTags(finalTagsText);
    if (nextDraft) setLocalBuilderDraft(nextDraft);

    updateProjectData({
      label: finalName,
      description: finalDesc,
      tags: finalTags,
      visibility: finalVisibility,
      ...(nextDraft ? { builderDraft: nextDraft } : {}),
    });
  }, [localBuilderDraft, localDesc, localName, localTags, localVisibility, updateProjectData]);

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

    setLocalBuilderDraft(draft);
    updateProjectData({
      label: draft.title,
      description: draft.summary,
      tags: draft.tags,
      visibility: localVisibility,
      builderDraft: draft,
      publishStatus: '這條工作流現在已經是可發布的節點 root。',
    });
    setIsExpanded(true);
    syncLinkedTemplateNode(draft, localVisibility);
  };

  const handleDraftChange = (draft: CommunityNodeTemplate) => {
    setLocalBuilderDraft(syncDraftWithLocalMetadata(draft));
  };

  const handlePublish = async (draft: CommunityNodeTemplate) => {
    if (!user) {
      updateProjectData({
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
        updateProjectData({
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
      const { nodes, edges } = useStore.getState();

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
      setLocalBuilderDraft(publishedTemplate);
      updateProjectData({
        label: publishedTemplate.title,
        description: publishedTemplate.summary,
        tags: publishedTemplate.tags,
        visibility: localVisibility,
        builderDraft: publishedTemplate,
        supabaseWorkflowId: blueprint.card.id,
        publishStatus: `已發布 "${publishedTemplate.title}" 到公開社群，可透過右鍵搜尋找到，也會出現在 Public Workflows。`,
      });
      syncLinkedTemplateNode(publishedTemplate, localVisibility);
      setTimeout(() => markCurrentGraphSaved(), 0);
    } catch (error) {
      console.error('Failed to publish workflow', error);
      const message = error instanceof Error ? error.message : '發布失敗';
      updateProjectData({
        publishStatus: `發布失敗：${message}`,
      });
    } finally {
      setIsPublishing(false);
    }
  };

  React.useEffect(() => {
    const incoming = data.builderDraft as CommunityNodeTemplate | undefined;
    const incomingSignature = serializeDraft(incoming);
    lastSyncedDraftSignatureRef.current = incomingSignature;
    setLocalBuilderDraft((prev) => {
      if (serializeDraft(prev) === incomingSignature) return prev;
      return incoming;
    });
  }, [data.builderDraft]);

  React.useEffect(() => {
    if (!builderDraft) return;

    const timeoutId = window.setTimeout(() => {
      const syncedDraft = syncDraftWithLocalMetadata(builderDraft);
      const syncedDraftSignature = serializeDraft(syncedDraft);
      if (syncedDraftSignature === lastSyncedDraftSignatureRef.current) return;

      lastSyncedDraftSignatureRef.current = syncedDraftSignature;
      updateProjectData({
        builderDraft: syncedDraft,
        label: syncedDraft.title,
        description: syncedDraft.summary,
        tags: syncedDraft.tags,
        visibility: localVisibility,
      });
      syncLinkedTemplateNode(syncedDraft, localVisibility);
    }, DRAFT_SYNC_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [builderDraft, localVisibility, syncDraftWithLocalMetadata, syncLinkedTemplateNode, updateProjectData]);

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
                showDetachedToolkit={selected}
              />
            </div>
          )}
        </div>
      )}
      <Handle type="source" position={Position.Right} id="name-out" style={INVISIBLE_HANDLE_STYLE} />
    </div>
  );
});
