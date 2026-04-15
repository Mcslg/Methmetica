import React from 'react';
import { type NodeProps, Handle, Position, useReactFlow } from '@xyflow/react';
import { Icons } from '../components/Icons';
import { NodeFrame } from '../components/NodeFrame';
import useStore, { type AppNode, type NodeData } from '../store/useStore';
import { useLanguage } from '../contexts/LanguageContext';
import { CommunityNodeMaker, buildTemplateFromBlocks } from '../components/CommunityNodeMaker';
import type { CommunityNodeTemplate, TemplateInterfaceSchema, TemplatePortSpec, WorkflowVisibility } from '../community/types';
import { getTemplateInternalHandles, getTemplateInterfaceSchema } from '../community/types';
import { makeInitialDraft, syncDraftWithWorkflowMetadata } from '../community/templateDraft';
import { publishWorkflowToSupabase } from '../integrations/supabase/workflows';
import { publishNodeTemplateToSupabase } from '../integrations/supabase/nodeTemplates';
import { getUserRole } from '../integrations/supabase/auth';
import { mathTypeCatalog, getAllCapabilities, getTypesByCapability } from '../config/mathTypeCatalog';
import { buildWorkflowNode, runBuiltWorkflowNode } from '../utils/workflowTestRunner';

const parseTags = (value: string) => value
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);

const DRAFT_SYNC_DELAY_MS = 180;
const INVISIBLE_HANDLE_STYLE = { opacity: 0 };
const serializeDraft = (draft?: CommunityNodeTemplate) => (draft ? JSON.stringify(draft) : '');
const stripLegacyInterfaceBlocks = (draft?: CommunityNodeTemplate): CommunityNodeTemplate | undefined => (
  draft ? {
    ...draft,
    builderBlocks: draft.builderBlocks.filter(block => block.kind !== 'input' && block.kind !== 'output'),
  } : undefined
);
const slugifyPortId = (value: string, fallback: string) => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || fallback;
};

const createPort = (type: 'input' | 'output', index: number): TemplatePortSpec => ({
  id: `${type}-${Date.now()}-${index}`,
  label: type === 'input' ? `input_${index + 1}` : `output_${index + 1}`,
  type,
  position: type === 'input' ? 'left' : 'right',
  offset: 42,
  source: 'static',
  valueKind: 'value',
  derivesFrom: 'builderBlocks',
});

const normalizePortOffsets = (ports: TemplatePortSpec[]): TemplatePortSpec[] => {
  if (ports.length === 0) return ports;
  const spacing = 100 / (ports.length + 1);
  return ports.map((port, index) => ({
    ...port,
    offset: Math.max(12, Math.min(88, Math.round((index + 1) * spacing))),
  }));
};

const normalizeInterfaceSchema = (schema: TemplateInterfaceSchema): TemplateInterfaceSchema => ({
  inputs: normalizePortOffsets(schema.inputs),
  outputs: normalizePortOffsets(schema.outputs),
});

const attachRuntimePlan = (
  draft: CommunityNodeTemplate,
  params: { nodes: AppNode[]; edges: any[]; bridgeNodeId?: string | null }
): CommunityNodeTemplate => {
  if (!params.bridgeNodeId) return draft;

  return {
    ...draft,
    runtimePlan: buildWorkflowNode({
      sourceNodes: params.nodes,
      sourceEdges: params.edges,
      bridgeNodeId: params.bridgeNodeId,
      interfaceSchema: getTemplateInterfaceSchema(draft),
    }),
  };
};

const stripRuntimePlan = (draft: CommunityNodeTemplate): CommunityNodeTemplate => {
  const { runtimePlan: _runtimePlan, ...rest } = draft;
  return rest;
};

function SearchableConstraintSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  const capabilities = getAllCapabilities().map(c => ({ value: `cap:${c}`, label: c, group: 'cap' }));
  const exactTypes = mathTypeCatalog.map(t => ({ value: `type:${t.id}`, label: t.label, group: 'type' }));
  
  const allOptions = [{ value: '', label: 'Any Type (不限制)', group: 'any' }, ...capabilities, ...exactTypes];
  
  const filteredOptions = allOptions.filter(o => 
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  const currentLabel = allOptions.find(o => o.value === value)?.label || 'Any Type (不限制)';

  // Handle click outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className="nodrag" style={{ position: 'relative', width: '100%' }}>
      <input
        type="text"
        placeholder={isOpen ? "Type to search..." : currentLabel}
        value={isOpen ? search : currentLabel}
        className="project-tags-input"
        style={{ width: '100%', fontSize: '0.7rem', padding: '4px', cursor: isOpen ? 'text' : 'pointer' }}
        onFocus={() => {
          setIsOpen(true);
          setSearch('');
        }}
        onChange={(e) => setSearch(e.target.value)}
      />
      {isOpen && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: 'rgba(10, 14, 24, 0.95)', border: '1px solid var(--border-node)',
          borderRadius: '4px', marginTop: '2px', maxHeight: '180px', overflowY: 'auto',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
        }}>
          {filteredOptions.map(o => (
            <div
              key={o.value}
              style={{
                padding: '6px 8px',
                fontSize: '0.7rem',
                cursor: 'pointer',
                background: o.value === value ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                color: o.group === 'cap' ? '#93c5fd' : o.group === 'any' ? '#d1d5db' : '#6ee7b7'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = o.value === value ? 'rgba(59, 130, 246, 0.2)' : 'transparent')}
              onClick={() => {
                onChange(o.value);
                setIsOpen(false);
                setSearch('');
              }}
            >
              <div style={{ fontWeight: o.value === value ? 'bold' : 'normal' }}>
                {o.label}
              </div>
            </div>
          ))}
          {filteredOptions.length === 0 && (
            <div style={{ padding: '6px 8px', fontSize: '0.7rem', color: 'var(--text-sub)' }}>
              無符合結果
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const ProjectNode = React.memo(function ProjectNode({ id, data, selected }: NodeProps<AppNode>) {
  const { setViewport, getNodes } = useReactFlow();
  const updateNodeData = useStore(state => state.updateNodeData);
  const nodes = useStore(state => state.nodes);
  const edges = useStore(state => state.edges);
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
    stripLegacyInterfaceBlocks(data.builderDraft as CommunityNodeTemplate | undefined)
  );
  const [testInputs, setTestInputs] = React.useState<Record<string, string>>({});
  const [testOutputs, setTestOutputs] = React.useState<Record<string, string>>({});
  const [testStatus, setTestStatus] = React.useState('');
  const [testTrace, setTestTrace] = React.useState<string[]>([]);
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

  const updateBuilderInterface = React.useCallback((updater: (schema: TemplateInterfaceSchema) => TemplateInterfaceSchema) => {
    setLocalBuilderDraft((current) => {
      if (!current) return current;
      const nextSchema = normalizeInterfaceSchema(updater(getTemplateInterfaceSchema(current)));
      return {
        ...current,
        interfaceSchema: nextSchema,
        inputs: nextSchema.inputs.map(({ id: portId, label, position, type, offset }) => ({
          id: portId,
          label,
          position,
          type,
          offset,
        })),
        outputs: nextSchema.outputs.map(({ id: portId, label, position, type, offset }) => ({
          id: portId,
          label,
          position,
          type,
          offset,
        })),
      };
    });
  }, []);

  const updateProjectData = React.useCallback((patch: Partial<{
    label: string;
    description: string;
    tags: string[];
    visibility: WorkflowVisibility;
    builderDraft: CommunityNodeTemplate;
    hasPublishedTemplate: boolean;
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
    const packagedBase = buildTemplateFromBlocks({
      ...draft,
      slug: draft.slug || draft.id,
      version: draft.version || '1.0.0',
      discovery: 'search-only',
      visibility,
    });
    const packagedDraft = stripRuntimePlan(packagedBase);

    const linkedNodeData = {
      label: packagedDraft.title || 'Community Template',
      templateId: packagedDraft.id,
      templateDraft: packagedDraft,
      builderSourceId: id,
      autoManagedTemplateNode: true,
      templateFields: Object.fromEntries(packagedDraft.fields.map(field => [field.id, field.defaultValue || ''])),
      templateSummary: packagedDraft.summary,
      handles: getTemplateInternalHandles(packagedDraft).map(handle => ({ ...handle })),
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
        style: { width: packagedDraft.size.width },
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
    const draft = stripLegacyInterfaceBlocks(makeInitialDraft({
      title: (localName || data.label || 'Untitled Workflow').trim(),
      summary: localDesc || data.description || '',
      tags: parseTags(localTags),
    })) as CommunityNodeTemplate;

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
    setLocalBuilderDraft(stripLegacyInterfaceBlocks(syncDraftWithLocalMetadata(draft)));
  };

  const activeInterfaceSchema = React.useMemo(
    () => builderDraft ? getTemplateInterfaceSchema(builderDraft) : null,
    [builderDraft]
  );

  React.useEffect(() => {
    if (!activeInterfaceSchema) return;

    setTestInputs((current) => {
      const next: Record<string, string> = {};
      activeInterfaceSchema.inputs.forEach((port) => {
        next[port.id] = current[port.id] ?? '';
      });
      return next;
    });

    setTestOutputs((current) => {
      const next: Record<string, string> = {};
      activeInterfaceSchema.outputs.forEach((port) => {
        next[port.id] = current[port.id] ?? '';
      });
      return next;
    });
  }, [activeInterfaceSchema]);

  const handleRunBehaviorTest = React.useCallback(async () => {
    if (!activeInterfaceSchema) return;
    const bridgeNodeId = linkedTemplateNodeId || nodes.find(node =>
      node.type === 'communityTemplateNode' &&
      node.data?.builderSourceId === id &&
      node.data?.autoManagedTemplateNode
    )?.id;

    if (!bridgeNodeId) {
      setTestStatus('找不到 template bridge node。請先建立 Builder Root。');
      return;
    }

    setTestStatus('Running test...');
    setTestTrace([]);
    const builtNode = buildWorkflowNode({
        sourceNodes: nodes,
        sourceEdges: edges,
        bridgeNodeId,
        interfaceSchema: activeInterfaceSchema,
      });
    setLocalBuilderDraft((current) => current ? { ...current, runtimePlan: builtNode } : current);
    const result = await runBuiltWorkflowNode(builtNode, testInputs);
    setTestOutputs(result.outputs);
    setTestStatus(result.error || 'Test complete.');
    setTestTrace(result.trace);
  }, [activeInterfaceSchema, edges, id, linkedTemplateNodeId, nodes, testInputs]);

  const handlePublish = async (draft: CommunityNodeTemplate) => {
    setIsPublishing(true);
    const syncedDraft = syncDraftWithWorkflowMetadata(draft, {
      title: (localName || data.label || draft.title).trim() || draft.title,
      summary: localDesc || data.description || draft.summary,
      tags: parseTags(localTags),
    });

    try {
      const packagedBase = buildTemplateFromBlocks({
        ...syncedDraft,
        version: syncedDraft.version || '1.0.0',
        discovery: 'search-only',
        visibility: localVisibility,
      });
      const { nodes, edges } = useStore.getState();
      const bridgeNodeId = linkedTemplateNodeId || nodes.find(node =>
        node.type === 'communityTemplateNode' &&
        node.data?.builderSourceId === id &&
        node.data?.autoManagedTemplateNode
      )?.id || `builder-template-${id}`;
      const packaged = attachRuntimePlan(packagedBase, { nodes, edges, bridgeNodeId });

      if (localVisibility === 'private') {
        const localTemplate = {
          ...packaged,
          relatedWorkflowIds: [...(packaged.relatedWorkflowIds || [])],
        };

        upsertCommunityTemplate(localTemplate);
        setLocalBuilderDraft(localTemplate);
        updateProjectData({
          label: localTemplate.title,
          description: localTemplate.summary,
          tags: localTemplate.tags,
          visibility: localVisibility,
          builderDraft: localTemplate,
          hasPublishedTemplate: true,
          publishStatus: `已在本機更新 private 節點 "${localTemplate.title}"，不會寫入資料庫。`,
        });
        syncLinkedTemplateNode(localTemplate, localVisibility);
        setTimeout(() => markCurrentGraphSaved(), 0);
        return;
      }

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
                hasPublishedTemplate: true,
                supabaseWorkflowId: data.supabaseWorkflowId,
              },
            }
          : node.type === 'communityTemplateNode' && node.data?.builderSourceId === id && node.data?.autoManagedTemplateNode && node.data?.templateDraft
            ? {
                ...node,
                data: {
                  ...node.data,
                  templateDraft: stripRuntimePlan(node.data.templateDraft as CommunityNodeTemplate),
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

      await publishNodeTemplateToSupabase({
        template: publishedTemplate,
        sourceWorkflowId: blueprint.card.id,
        sourceWorkflowSlug: blueprint.card.slug,
        workflowVisibility: localVisibility,
      });

      upsertCommunityTemplate(publishedTemplate);
      setLocalBuilderDraft(publishedTemplate);
      updateProjectData({
        label: publishedTemplate.title,
        description: publishedTemplate.summary,
        tags: publishedTemplate.tags,
        visibility: localVisibility,
        builderDraft: publishedTemplate,
        hasPublishedTemplate: true,
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
    const handleSidebarPublish = (event: Event) => {
      const detail = (event as CustomEvent<{ projectNodeId?: string }>).detail;
      if (detail?.projectNodeId && detail.projectNodeId !== id) return;

      const draft = localBuilderDraft || stripLegacyInterfaceBlocks(data.builderDraft as CommunityNodeTemplate | undefined);
      if (!draft || isPublishing) return;
      handlePublish(draft);
    };

    window.addEventListener('publish-project-template', handleSidebarPublish);
    return () => window.removeEventListener('publish-project-template', handleSidebarPublish);
  }, [data.builderDraft, handlePublish, id, isPublishing, localBuilderDraft]);

  React.useEffect(() => {
    const incoming = stripLegacyInterfaceBlocks(data.builderDraft as CommunityNodeTemplate | undefined);
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
    <NodeFrame
      id={id}
      data={data}
      selected={selected}
      icon={<Icons.Package />}
      defaultLabel={t('nodes.project.name_label') || 'Project Root'}
      className="project-node"
      minWidth={320}
      minHeight={180}
      contentStyle={{ overflow: 'visible' }}
      headerExtras={
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button 
            onClick={handleFocus} 
            title={t('nodes.project.view_label') || 'Focus Area'}
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
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', fontSize: '0.7rem', color: 'var(--text-sub)' }}>
          {activeFileId ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--system-success)' }}>
              <Icons.Languages size={10} /> {t('nodes.project.last_sync') || 'Cloud Protected'}
            </span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--system-warning)' }}>
              <Icons.Moon size={10} /> {t('nodes.project.unsaved') || 'Local Session'}
            </span>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Icons.Search size={10} /> Search-only node
          </span>
      </div>

      {isExpanded && (
        <div className="project-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="root-metadata">
            <label className="root-field" style={{ gridColumn: '1 / -1' }}>
              <span>{t('nodes.project.name_label') || 'Project Name'}</span>
              <input
                type="text"
                className="project-name-input"
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                onBlur={() => saveWorkflowMetadata()}
                placeholder={t('nodes.project.name_placeholder') || 'Enter workflow name...'}
              />
            </label>
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

              {activeInterfaceSchema && (
                <div style={{
                  display: 'grid',
                  gap: '16px',
                  padding: '14px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '14px',
                  background: 'rgba(255,255,255,0.03)',
                  marginBottom: '14px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div>
                      <strong style={{ display: 'block', color: 'var(--text-main)' }}>Interface</strong>
                      <p style={{ margin: '4px 0 0', color: 'var(--text-sub)', fontSize: '0.82rem' }}>
                        先用這裡定義節點對外的 input / output。這一版先只支援 UI 建立。
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ display: 'grid', gap: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: '0.86rem' }}>Inputs</strong>
                        <button
                          type="button"
                          className="builder-refresh-btn"
                          onClick={() => updateBuilderInterface((schema) => ({
                            ...schema,
                            inputs: [...schema.inputs, createPort('input', schema.inputs.length)],
                          }))}
                        >
                          + Input
                        </button>
                      </div>
                      {activeInterfaceSchema.inputs.length === 0 ? (
                        <div style={{ color: 'var(--text-sub)', fontSize: '0.82rem' }}>尚未定義 input。</div>
                      ) : activeInterfaceSchema.inputs.map((port, index) => (
                        <div key={port.id} style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr auto',
                          gap: '8px',
                          alignItems: 'center',
                          padding: '10px',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '10px',
                          background: 'rgba(0,0,0,0.16)'
                        }}>
                          <div style={{ display: 'grid', gap: '6px' }}>
                            <input
                              className="project-tags-input"
                              value={port.label}
                              onChange={(e) => {
                                const nextLabel = e.target.value;
                                updateBuilderInterface((schema) => ({
                                  ...schema,
                                  inputs: schema.inputs.map((item, itemIndex) => itemIndex === index ? {
                                    ...item,
                                    label: nextLabel,
                                    id: slugifyPortId(nextLabel, item.id),
                                  } : item),
                                }));
                              }}
                              placeholder="input name"
                            />
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-sub)' }}>
                              <span>id: {port.id}</span>
                            </div>
                            <SearchableConstraintSelect
                              value={port.typeConstraint || ''}
                              onChange={(nextConstraint) => {
                                updateBuilderInterface((schema) => ({
                                  ...schema,
                                  inputs: schema.inputs.map((item, itemIndex) => itemIndex === index ? {
                                    ...item,
                                    typeConstraint: nextConstraint,
                                  } : item),
                                }));
                              }}
                            />
                            {port.typeConstraint?.startsWith('cap:') && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
                                {getTypesByCapability(port.typeConstraint.split(':')[1] as any).map(t => (
                                  <span key={t} style={{ fontSize: '0.62rem', background: 'rgba(59, 130, 246, 0.15)', color: '#93c5fd', padding: '1px 5px', borderRadius: '4px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                            {port.typeConstraint?.startsWith('type:') && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
                                <span style={{ fontSize: '0.62rem', background: 'rgba(16, 185, 129, 0.15)', color: '#6ee7b7', padding: '1px 5px', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                                  {port.typeConstraint.split(':')[1]}
                                </span>
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            className="focus-btn"
                            onClick={() => updateBuilderInterface((schema) => ({
                              ...schema,
                              inputs: schema.inputs.filter((_, itemIndex) => itemIndex !== index),
                            }))}
                            title="Remove input"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'grid', gap: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: '0.86rem' }}>Outputs</strong>
                        <button
                          type="button"
                          className="builder-refresh-btn"
                          onClick={() => updateBuilderInterface((schema) => ({
                            ...schema,
                            outputs: [...schema.outputs, createPort('output', schema.outputs.length)],
                          }))}
                        >
                          + Output
                        </button>
                      </div>
                      {activeInterfaceSchema.outputs.length === 0 ? (
                        <div style={{ color: 'var(--text-sub)', fontSize: '0.82rem' }}>尚未定義 output。</div>
                      ) : activeInterfaceSchema.outputs.map((port, index) => (
                        <div key={port.id} style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr auto',
                          gap: '8px',
                          alignItems: 'center',
                          padding: '10px',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '10px',
                          background: 'rgba(0,0,0,0.16)'
                        }}>
                          <div style={{ display: 'grid', gap: '6px' }}>
                            <input
                              className="project-tags-input"
                              value={port.label}
                              onChange={(e) => {
                                const nextLabel = e.target.value;
                                updateBuilderInterface((schema) => ({
                                  ...schema,
                                  outputs: schema.outputs.map((item, itemIndex) => itemIndex === index ? {
                                    ...item,
                                    label: nextLabel,
                                    id: slugifyPortId(nextLabel, item.id),
                                  } : item),
                                }));
                              }}
                              placeholder="output name"
                            />
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-sub)' }}>
                              <span>id: {port.id}</span>
                            </div>
                            <SearchableConstraintSelect
                              value={port.typeConstraint || ''}
                              onChange={(nextConstraint) => {
                                updateBuilderInterface((schema) => ({
                                  ...schema,
                                  outputs: schema.outputs.map((item, itemIndex) => itemIndex === index ? {
                                    ...item,
                                    typeConstraint: nextConstraint,
                                  } : item),
                                }));
                              }}
                            />
                            {port.typeConstraint?.startsWith('cap:') && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
                                {getTypesByCapability(port.typeConstraint.split(':')[1] as any).map(t => (
                                  <span key={t} style={{ fontSize: '0.62rem', background: 'rgba(59, 130, 246, 0.15)', color: '#93c5fd', padding: '1px 5px', borderRadius: '4px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                            {port.typeConstraint?.startsWith('type:') && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
                                <span style={{ fontSize: '0.62rem', background: 'rgba(16, 185, 129, 0.15)', color: '#6ee7b7', padding: '1px 5px', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                                  {port.typeConstraint.split(':')[1]}
                                </span>
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            className="focus-btn"
                            onClick={() => updateBuilderInterface((schema) => ({
                              ...schema,
                              outputs: schema.outputs.filter((_, itemIndex) => itemIndex !== index),
                            }))}
                            title="Remove output"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeInterfaceSchema && (
                <div style={{
                  display: 'grid',
                  gap: '14px',
                  padding: '14px',
                  border: '1px solid rgba(56, 189, 248, 0.18)',
                  borderRadius: '16px',
                  background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.08), rgba(255,255,255,0.03))',
                  marginBottom: '14px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div>
                      <strong style={{ display: 'block', color: 'var(--text-main)' }}>Test Node Behavior</strong>
                      <p style={{ margin: '4px 0 0', color: 'var(--text-sub)', fontSize: '0.82rem' }}>
                        外部使用視角的測試卡。這版先支援 bridge → CodeNode → bridge 的最小 workflow runtime。
                      </p>
                    </div>
                    <button
                      type="button"
                      className="builder-refresh-btn"
                      onClick={handleRunBehaviorTest}
                    >
                      Run Test
                    </button>
                  </div>
                  {testStatus && (
                    <div style={{ color: testStatus.includes('找不到') || testStatus.includes('只支援') ? '#fca5a5' : 'var(--text-sub)', fontSize: '0.78rem' }}>
                      {testStatus}
                    </div>
                  )}
                  {testTrace.length > 0 && (
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '6px',
                      alignItems: 'center',
                      color: 'var(--text-sub)',
                      fontSize: '0.74rem'
                    }}>
                      <span>Trace:</span>
                      {testTrace.map((item, index) => (
                        <React.Fragment key={`${item}-${index}`}>
                          {index > 0 && <span>→</span>}
                          <span style={{
                            padding: '2px 7px',
                            border: '1px solid rgba(56,189,248,0.24)',
                            borderRadius: '999px',
                            color: '#93c5fd',
                            background: 'rgba(56,189,248,0.08)'
                          }}>
                            {item}
                          </span>
                        </React.Fragment>
                      ))}
                    </div>
                  )}

                  <div style={{
                    position: 'relative',
                    display: 'grid',
                    gridTemplateColumns: 'minmax(120px, 1fr) minmax(180px, 1.1fr) minmax(120px, 1fr)',
                    gap: '14px',
                    alignItems: 'center',
                    padding: '12px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '18px',
                    background: 'rgba(0,0,0,0.18)'
                  }}>
                    <div style={{ display: 'grid', gap: '10px' }}>
                      {activeInterfaceSchema.inputs.length === 0 ? (
                        <div style={{ color: 'var(--text-sub)', fontSize: '0.78rem' }}>No external inputs</div>
                      ) : activeInterfaceSchema.inputs.map((port) => (
                        <label
                          key={port.id}
                          className="nodrag"
                          style={{
                            display: 'grid',
                            gap: '5px',
                            padding: '8px',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '12px',
                            background: 'rgba(255,255,255,0.03)'
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-sub)', fontSize: '0.72rem' }}>
                            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#38bdf8', boxShadow: '0 0 0 3px rgba(56,189,248,0.16)' }} />
                            {port.label}
                          </span>
                          <input
                            className="project-tags-input nodrag"
                            value={testInputs[port.id] || ''}
                            onChange={(event) => setTestInputs((current) => ({ ...current, [port.id]: event.target.value }))}
                            placeholder={`value for ${port.label}`}
                          />
                        </label>
                      ))}
                    </div>

                    <div style={{
                      minHeight: '140px',
                      display: 'grid',
                      placeItems: 'center',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '18px',
                      background: 'radial-gradient(circle at 50% 0%, rgba(56,189,248,0.16), rgba(255,255,255,0.04) 58%, rgba(0,0,0,0.18))',
                      boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.03)'
                    }}>
                      <div style={{ textAlign: 'center', display: 'grid', gap: '6px', padding: '16px' }}>
                        <Icons.Package size={28} />
                        <strong style={{ color: 'var(--text-main)' }}>{builderDraft.title || 'Community Template'}</strong>
                        <span style={{ color: 'var(--text-sub)', fontSize: '0.76rem' }}>
                          External preview node
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gap: '10px' }}>
                      {activeInterfaceSchema.outputs.length === 0 ? (
                        <div style={{ color: 'var(--text-sub)', fontSize: '0.78rem' }}>No external outputs</div>
                      ) : activeInterfaceSchema.outputs.map((port) => (
                        <div
                          key={port.id}
                          style={{
                            display: 'grid',
                            gap: '5px',
                            padding: '8px',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '12px',
                            background: 'rgba(255,255,255,0.03)'
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', color: 'var(--text-sub)', fontSize: '0.72rem' }}>
                            {port.label}
                            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 0 3px rgba(245,158,11,0.16)' }} />
                          </span>
                          <pre style={{
                            margin: 0,
                            minHeight: '31px',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            fontSize: '0.75rem',
                            color: testOutputs[port.id] ? 'var(--text-main)' : 'var(--text-sub)',
                            background: 'rgba(0,0,0,0.2)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: '10px',
                            padding: '8px'
                          }}>
                            {testOutputs[port.id] || 'Run test to preview'}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <CommunityNodeMaker
                draft={builderDraft}
                onChange={handleDraftChange}
                onPublish={handlePublish}
                publishLabel={isPublishing ? '發布中...' : '發布此工作流為節點'}
                status={publishStatus}
                hideMetadataFields
                hidePublishAction
                showDetachedToolkit={selected}
              />
            </div>
          )}
        </div>
      )}
      <Handle type="source" position={Position.Right} id="name-out" style={INVISIBLE_HANDLE_STYLE} />
    </NodeFrame>
  );
});
