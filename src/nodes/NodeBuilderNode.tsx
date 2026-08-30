import React from 'react';
import { type Edge, type NodeProps, Handle, Position, useReactFlow } from '@xyflow/react';
import { Icons } from '../components/Icons';
import { NodeFrame } from '../components/NodeFrame';
import useStore, { type AppNode, type NodeData } from '../store/useStore';
import { useLanguage } from '../contexts/LanguageContext';
import { CommunityNodeMaker, buildTemplateFromBlocks, validateDraft } from '../components/CommunityNodeMaker';
import type { CommunityNodeTemplate, TemplateInterfaceSchema, TemplatePortSpec, WorkflowChangeType, WorkflowVisibility } from '../community/types';
import { getTemplateInternalHandles, getTemplateInterfaceSchema } from '../community/types';
import { makeInitialDraft, syncDraftWithWorkflowMetadata } from '../community/templateDraft';
import { resolveTemplateViewOverrides } from '../community/templateView';
import {
  getLanguageText,
  getLocalizedText,
  hasLanguageText,
  setLocalizedText,
  type SupportedLanguage,
} from '../community/localizedText';
import { publishWorkflowToSupabase } from '../integrations/supabase/workflows';
import { publishNodeTemplateToSupabase } from '../integrations/supabase/nodeTemplates';
import { getUserRole } from '../integrations/supabase/auth';
import type { AppUser } from '../integrations/supabase/types';
import { mathTypeCatalog, getAllCapabilities, getTypesByCapability } from '../config/mathTypeCatalog';
import { buildWorkflowNode } from '../utils/workflowTestRunner';
import { compileWorkflowToArtifact, formatCompileDiagnostics } from '../utils/workflowCompiler';
import { clearPublicWorkflowEdit } from '../utils/localDraftService';

const parseTags = (value: string) => value
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);

const DRAFT_SYNC_DELAY_MS = 180;
const INVISIBLE_HANDLE_STYLE = { opacity: 0 };
const CHANGE_TYPE_OPTIONS: Array<{
  value: WorkflowChangeType;
  label: string;
  description: string;
  updatePolicy: 'none' | 'manual' | 'auto';
  warningMessage?: string;
}> = [
  {
    value: 'edit',
    label: '編修',
    description: '只改文字、說明、教學或排版，不推送功能更新。',
    updatePolicy: 'none',
  },
  {
    value: 'feature',
    label: '新增',
    description: '新增能力但不破壞舊用法；使用者之後可手動更新。',
    updatePolicy: 'manual',
  },
  {
    value: 'fix',
    label: '修正',
    description: '修一般 bug，舊版本會顯示有已知問題。',
    updatePolicy: 'manual',
    warningMessage: '這個版本已有修正版，建議手動更新。',
  },
  {
    value: 'hotfix',
    label: '緊急修復',
    description: '安全、錯誤結果或嚴重問題；之後可支援自動更新。',
    updatePolicy: 'auto',
    warningMessage: '這個版本有重要修復，建議盡快更新。',
  },
];
const getChangeTypeOption = (changeType?: WorkflowChangeType) => (
  CHANGE_TYPE_OPTIONS.find(option => option.value === changeType) ?? CHANGE_TYPE_OPTIONS[0]
);
const getPublishVisibility = (visibility: WorkflowVisibility): WorkflowVisibility => (
  visibility === 'core' ? 'core' : 'public'
);
type PublishUpdateMetadata = {
  changeType?: WorkflowChangeType;
  updatePolicy?: 'none' | 'manual' | 'auto';
  updateSummary?: string;
  warningMessage?: string;
};
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
  labelI18n: {
    'zh-TW': type === 'input' ? `input_${index + 1}` : `output_${index + 1}`,
    en: type === 'input' ? `input_${index + 1}` : `output_${index + 1}`,
  },
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

const languageLabel = (language: SupportedLanguage) => language === 'zh-TW' ? '中文' : 'EN';

const MissingLanguageBadge = ({ language }: { language: SupportedLanguage }) => (
  <small style={{
    border: '1px solid rgba(245, 158, 11, 0.35)',
    borderRadius: 999,
    padding: '1px 6px',
    color: '#fbbf24',
    background: 'rgba(245, 158, 11, 0.1)',
    fontSize: '0.62rem',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  }}>
    未填 {languageLabel(language)}
  </small>
);

const attachRuntimePlan = (
  draft: CommunityNodeTemplate,
  params: { nodes: AppNode[]; edges: Edge[]; bridgeNodeId?: string | null; builderNodeId?: string; user?: AppUser | null; templates?: CommunityNodeTemplate[] }
): CommunityNodeTemplate => {
  if (!params.bridgeNodeId) return draft;
  const interfaceSchema = getTemplateInterfaceSchema(draft);
  const compileResult = compileWorkflowToArtifact({
    nodes: params.nodes,
    edges: params.edges,
    bridgeNodeId: params.bridgeNodeId,
    builderNodeId: params.builderNodeId,
    interfaceSchema,
    controlPorts: draft.controlPorts,
    elementBindings: draft.elementBindings,
  }, {
    author: params.user ?? null,
    templates: params.templates,
  });

  return {
    ...draft,
    runtimePlan: buildWorkflowNode({
      sourceNodes: params.nodes,
      sourceEdges: params.edges,
      bridgeNodeId: params.bridgeNodeId,
      builderNodeId: params.builderNodeId,
      interfaceSchema,
      controlPorts: draft.controlPorts,
      elementBindings: draft.elementBindings,
    }),
    ...(compileResult.artifact ? { compiledArtifact: compileResult.artifact } : {}),
  };
};

const stripRuntimePlan = (draft: CommunityNodeTemplate): CommunityNodeTemplate => {
  const next = { ...draft };
  delete next.runtimePlan;
  delete next.compiledArtifact;
  return next;
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

export const NodeBuilderNode = React.memo(function NodeBuilderNode({ id, data, selected }: NodeProps<AppNode>) {
  const { setViewport, getNodes } = useReactFlow();
  const updateNodeData = useStore(state => state.updateNodeData);
  const openTemplateTester = useStore(state => state.openTemplateTester);
  const upsertCommunityTemplate = useStore(state => state.upsertCommunityTemplate);
  const user = useStore(state => state.user);
  const setUser = useStore(state => state.setUser);
  const markCurrentGraphSaved = useStore(state => state.markCurrentGraphSaved);
  const addNode = useStore(state => state.addNode);
  const { t, language } = useLanguage();
  const linkedProjectNodeId = data.projectNodeId as string | undefined;

  const [localName, setLocalName] = React.useState(data.label || '');
  const [localDesc, setLocalDesc] = React.useState(data.description || '');
  const [localTags, setLocalTags] = React.useState(Array.isArray(data.tags) ? data.tags.join(', ') : '');
  const [localVisibility, setLocalVisibility] = React.useState<WorkflowVisibility>(data.visibility || 'private');
  const [localChangeType, setLocalChangeType] = React.useState<WorkflowChangeType>(data.changeType || 'edit');
  const [localBuilderDraft, setLocalBuilderDraft] = React.useState<CommunityNodeTemplate | undefined>(
    stripLegacyInterfaceBlocks(data.builderDraft as CommunityNodeTemplate | undefined)
  );
  const [interfaceLanguage, setInterfaceLanguage] = React.useState<SupportedLanguage>(language);
  const [isExpanded, setIsExpanded] = React.useState(true);
  const [isPublishing, setIsPublishing] = React.useState(false);
  const projectContentRef = React.useRef<HTMLDivElement | null>(null);
  const builderDraft = localBuilderDraft;
  const linkedTemplateNodeId = data.linkedTemplateNodeId as string | undefined;
  const publishStatus = data.publishStatus || '發布此工作流，就等於發布這個節點。';
  const hasPublishedRemoteVersion = Boolean(data.supabaseWorkflowId);
  const lastSyncedDraftSignatureRef = React.useRef(serializeDraft(data.builderDraft as CommunityNodeTemplate | undefined));
  const localizedTemplateTitle = React.useCallback((template: CommunityNodeTemplate) => (
    getLocalizedText(template.titleI18n, language, template.title)
  ), [language]);
  const localizedTemplateSummary = React.useCallback((template: CommunityNodeTemplate) => (
    getLocalizedText(template.summaryI18n, language, template.summary)
  ), [language]);
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
    reviewStatus: 'unreviewed' | 'approved';
    reviewCount: number;
    reviewRequired: boolean;
    reviewWarning: boolean;
    requiredContributorReviews: number;
    requiredExpertReviews: number;
    contributorReviewCount: number;
    expertReviewCount: number;
    extraContributorReviews: number;
    extraExpertReviews: number;
    reviewedByMe: boolean;
    changeType: WorkflowChangeType;
    updatePolicy: 'none' | 'manual' | 'auto';
    updateSummary: string;
    warningMessage: string;
    supersedesVersionId: string;
    builderNodeId: string;
  }>) => {
    updateNodeData(id, patch, { skipGraphEval: true });
    if (linkedProjectNodeId && linkedProjectNodeId !== id) {
      updateNodeData(linkedProjectNodeId, patch, { skipGraphEval: true });
    }
  }, [id, linkedProjectNodeId, updateNodeData]);

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
    const templateViewOverrides = resolveTemplateViewOverrides(packagedDraft, projectNode.data.inputs);

    const linkedNodeData = {
      label: localizedTemplateTitle(packagedDraft) || 'Community Template',
      templateId: packagedDraft.id,
      templateDraft: packagedDraft,
      templateViewOverrides,
      builderSourceId: id,
      autoManagedTemplateNode: true,
      templateFields: Object.fromEntries(packagedDraft.fields.map(field => [field.id, field.defaultValue || ''])),
      templateSummary: localizedTemplateSummary(packagedDraft),
      sourceWorkflowId: packagedDraft.sourceWorkflowId,
      sourceWorkflowVersionId: packagedDraft.sourceWorkflowVersionId,
      sourceWorkflowSlug: packagedDraft.sourceWorkflowSlug,
      updateAvailable: packagedDraft.updateAvailable,
      updateSeverity: packagedDraft.updateSeverity,
      updateMessage: packagedDraft.updateMessage,
      latestWorkflowVersionId: packagedDraft.latestWorkflowVersionId,
      latestWorkflowVersion: packagedDraft.latestWorkflowVersion,
      handles: getTemplateInternalHandles(packagedDraft).map(handle => ({
        ...handle,
        label: getLocalizedText(handle.labelI18n, language, handle.label),
      })),
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
      templateViewOverrides: linkedTemplateNode.data?.templateViewOverrides,
      builderSourceId: linkedTemplateNode.data?.builderSourceId,
      autoManagedTemplateNode: linkedTemplateNode.data?.autoManagedTemplateNode,
      templateFields: linkedTemplateNode.data?.templateFields,
      templateSummary: linkedTemplateNode.data?.templateSummary,
      handles: linkedTemplateNode.data?.handles,
    });

    if (currentLinkedDataSignature !== linkedDataSignature) {
      updateNodeData(linkedTemplateNode.id, linkedNodeData as Partial<NodeData>, { skipGraphEval: true });
    }

    const nextWidth = packagedDraft.size.width;
    const nextHeight = packagedDraft.size.height;
    if (linkedTemplateNode.width !== nextWidth || linkedTemplateNode.height !== nextHeight) {
      useStore.setState((current) => ({
        nodes: current.nodes.map(node => (
          node.id === linkedTemplateNode.id
            ? {
                ...node,
                width: nextWidth,
                height: nextHeight,
                style: { ...node.style, width: nextWidth, height: nextHeight },
              }
            : node
        )),
      }));
    }
  }, [addNode, id, language, linkedTemplateNodeId, localizedTemplateSummary, localizedTemplateTitle, updateNodeData, updateProjectData]);

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

  const getPublishUpdateMetadata = React.useCallback((override?: PublishUpdateMetadata) => {
    const selectedType = override?.changeType ?? (hasPublishedRemoteVersion ? localChangeType : 'feature');
    const option = getChangeTypeOption(selectedType);
    return {
      changeType: hasPublishedRemoteVersion ? option.value : 'feature',
      updatePolicy: hasPublishedRemoteVersion ? override?.updatePolicy ?? option.updatePolicy : 'manual',
      updateSummary: hasPublishedRemoteVersion ? override?.updateSummary?.trim() || undefined : undefined,
      warningMessage: hasPublishedRemoteVersion ? override?.warningMessage ?? option.warningMessage : undefined,
    };
  }, [hasPublishedRemoteVersion, localChangeType]);

  const handlePublish = async (draft: CommunityNodeTemplate, publishOptions?: PublishUpdateMetadata) => {
    setIsPublishing(true);
    const publishVisibility = getPublishVisibility(localVisibility);
    const syncedDraft = syncDraftWithWorkflowMetadata(draft, {
      title: (localName || data.label || draft.title).trim() || draft.title,
      summary: localDesc || data.description || draft.summary,
      tags: parseTags(localTags),
    });
    const validationError = validateDraft(buildTemplateFromBlocks({
      ...syncedDraft,
      version: syncedDraft.version || '1.0.0',
      discovery: 'search-only',
      visibility: publishVisibility,
    }));
    if (validationError) {
      updateProjectData({
        publishStatus: `發布前請先補齊：${validationError}`,
      });
      setIsPublishing(false);
      return;
    }

    try {
      const updateMetadata = getPublishUpdateMetadata(publishOptions);
      const packagedBase = buildTemplateFromBlocks({
        ...syncedDraft,
        version: syncedDraft.version || '1.0.0',
        discovery: 'search-only',
        visibility: publishVisibility,
      });
      if (!user) {
        updateProjectData({
          publishStatus: '先登入，才能把這條工作流發布到公開社群。',
        });
        return;
      }

      let effectiveUser = user;
      if (user) {
        const fetchedRole = await getUserRole(user.id);
        if (fetchedRole !== user.role) {
          effectiveUser = { ...user, role: fetchedRole };
          setUser(effectiveUser);
        }

        if (publishVisibility === 'core' && !['trusted_editor', 'admin'].includes(fetchedRole)) {
          updateProjectData({
            publishStatus: '只有 trusted_editor 或 admin 能發布 core workflow。先改成 public，或提升身份後再發布。',
          });
          return;
        }
      }

      const { nodes, edges } = useStore.getState();
      const bridgeNodeId = linkedTemplateNodeId || nodes.find(node =>
        node.type === 'communityTemplateNode' &&
        node.data?.builderSourceId === id &&
        node.data?.autoManagedTemplateNode
      )?.id || `builder-template-${id}`;
      const interfaceSchema = getTemplateInterfaceSchema(packagedBase);
      const compileResult = compileWorkflowToArtifact({
        nodes,
        edges,
        bridgeNodeId,
        builderNodeId: id,
        interfaceSchema,
        controlPorts: packagedBase.controlPorts,
        elementBindings: packagedBase.elementBindings,
      }, {
        author: effectiveUser,
        templates: useStore.getState().communityTemplates,
      });

      if (!compileResult.ok || !compileResult.artifact) {
        updateProjectData({
          publishStatus: `發布前請先修正 Beta artifact：${formatCompileDiagnostics(compileResult.diagnostics)}`,
        });
        return;
      }

      const packaged = {
        ...attachRuntimePlan(packagedBase, {
          nodes,
          edges,
          bridgeNodeId,
          builderNodeId: id,
          user: effectiveUser,
          templates: useStore.getState().communityTemplates,
        }),
        compiledArtifact: compileResult.artifact,
      };

      if (!effectiveUser) {
        updateProjectData({
          publishStatus: '先登入，才能把這條工作流發布到公開社群。',
        });
        return;
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
                visibility: publishVisibility,
                builderDraft: packaged,
                hasPublishedTemplate: true,
                supabaseWorkflowId: data.supabaseWorkflowId,
                reviewStatus: 'unreviewed' as const,
                reviewCount: 0,
                reviewRequired: publishVisibility === 'core',
                reviewWarning: publishVisibility !== 'core',
                requiredContributorReviews: publishVisibility === 'core' ? 2 : 3,
                requiredExpertReviews: publishVisibility === 'core' ? 1 : 0,
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
        visibility: publishVisibility,
        nodes: publishedNodes,
        edges,
        author: effectiveUser,
        compiledArtifact: packaged.compiledArtifact,
        publishKind: 'node',
        workflowIcon: data.workflowIcon,
        ...updateMetadata,
      });

      const publishedTemplate = {
        ...packaged,
        sourceWorkflowId: blueprint.card.id,
        sourceWorkflowVersionId: blueprint.meta?.workflowVersionId,
        sourceWorkflowSlug: blueprint.card.slug,
        publishKind: 'node' as const,
        changeType: updateMetadata.changeType,
        updatePolicy: updateMetadata.updatePolicy,
        updateSummary: updateMetadata.updateSummary,
        warningMessage: updateMetadata.warningMessage,
        relatedWorkflowIds: Array.from(new Set([...(packaged.relatedWorkflowIds || []), blueprint.card.id])),
      };

      await publishNodeTemplateToSupabase({
        template: publishedTemplate,
        sourceWorkflowId: blueprint.card.id,
        sourceWorkflowVersionId: blueprint.meta?.workflowVersionId,
        sourceWorkflowSlug: blueprint.card.slug,
        workflowVisibility: publishVisibility,
      });

      upsertCommunityTemplate(publishedTemplate);
      setLocalBuilderDraft(publishedTemplate);
      updateProjectData({
        label: publishedTemplate.title,
        description: publishedTemplate.summary,
        tags: publishedTemplate.tags,
        visibility: publishVisibility,
        builderDraft: publishedTemplate,
        hasPublishedTemplate: true,
        supabaseWorkflowId: blueprint.card.id,
        reviewStatus: blueprint.meta?.reviewStatus ?? 'unreviewed',
        reviewCount: blueprint.meta?.reviewCount ?? 0,
        reviewRequired: blueprint.meta?.reviewRequired ?? (publishVisibility === 'core'),
        reviewWarning: blueprint.meta?.reviewWarning ?? (publishVisibility !== 'core'),
        requiredContributorReviews: blueprint.meta?.requiredContributorReviews ?? (publishVisibility === 'core' ? 2 : 3),
        requiredExpertReviews: blueprint.meta?.requiredExpertReviews ?? (publishVisibility === 'core' ? 1 : 0),
        contributorReviewCount: blueprint.meta?.contributorReviewCount ?? 0,
        expertReviewCount: blueprint.meta?.expertReviewCount ?? 0,
        extraContributorReviews: blueprint.meta?.extraContributorReviews ?? 0,
        extraExpertReviews: blueprint.meta?.extraExpertReviews ?? 0,
        reviewedByMe: false,
        changeType: blueprint.meta?.changeType ?? updateMetadata.changeType,
        updatePolicy: blueprint.meta?.updatePolicy ?? updateMetadata.updatePolicy,
        warningMessage: blueprint.meta?.warningMessage ?? updateMetadata.warningMessage,
        supersedesVersionId: blueprint.meta?.supersedesVersionId,
        publishStatus: publishVisibility === 'core'
          ? `已送出核心節點 "${publishedTemplate.title}"，需要 2 位貢獻者與 1 位專家審核後才會開放。`
          : `已發布節點 "${publishedTemplate.title}"，目前未驗證；3 位貢獻者審核後會標記 verified。`,
      });
      window.dispatchEvent(new CustomEvent('methmetica:public-workflows-changed', {
        detail: { workflowId: blueprint.card.id, action: 'published' },
      }));
      clearPublicWorkflowEdit(blueprint.card.id, effectiveUser.id);
      syncLinkedTemplateNode(publishedTemplate, publishVisibility);
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

  const handlePublishWorkflowOnly = React.useCallback(async (publishOptions?: PublishUpdateMetadata) => {
    setIsPublishing(true);
    try {
      const updateMetadata = getPublishUpdateMetadata(publishOptions);
      const publishVisibility = getPublishVisibility(localVisibility);
      if (!user) {
        updateProjectData({
          publishStatus: '先登入，才能發布 workflow。',
        });
        return;
      }

      let effectiveUser = user;
      const fetchedRole = await getUserRole(user.id);
      if (fetchedRole !== user.role) {
        effectiveUser = { ...user, role: fetchedRole };
        setUser(effectiveUser);
      }

      if (publishVisibility === 'core' && !['trusted_editor', 'admin'].includes(fetchedRole)) {
        updateProjectData({
          publishStatus: '只有 trusted_editor 或 admin 能發布 core workflow。先改成 public，或提升身份後再發布。',
        });
        return;
      }

      const state = useStore.getState();
      const hasCodeNode = state.nodes.some(node => node.type === 'codeNode');
      if (hasCodeNode && fetchedRole !== 'admin') {
        updateProjectData({
          publishStatus: '只有 admin 可發布含 CodeNode 的 workflow。',
        });
        return;
      }

      const title = (localName || data.label || 'Untitled Workflow').trim() || 'Untitled Workflow';
      const description = localDesc || data.description || '';
      const tags = parseTags(localTags);
      const publishedNodes = state.nodes.map(node => (
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                label: title,
                description,
                tags,
                visibility: publishVisibility,
                supabaseWorkflowId: data.supabaseWorkflowId,
                reviewStatus: 'unreviewed' as const,
                reviewCount: 0,
                reviewRequired: publishVisibility === 'core',
                reviewWarning: false,
                requiredContributorReviews: publishVisibility === 'core' ? 1 : 2,
                requiredExpertReviews: publishVisibility === 'core' ? 1 : 0,
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
        id: data.supabaseWorkflowId,
        title,
        description,
        tags,
        visibility: publishVisibility,
        nodes: publishedNodes,
        edges: state.edges,
        author: effectiveUser,
        publishKind: 'workflow',
        workflowIcon: data.workflowIcon,
        ...updateMetadata,
      });

      updateProjectData({
        label: title,
        description,
        tags,
        visibility: publishVisibility,
        supabaseWorkflowId: blueprint.card.id,
        reviewStatus: blueprint.meta?.reviewStatus ?? 'unreviewed',
        reviewCount: blueprint.meta?.reviewCount ?? 0,
        reviewRequired: blueprint.meta?.reviewRequired ?? (publishVisibility === 'core'),
        reviewWarning: blueprint.meta?.reviewWarning ?? false,
        requiredContributorReviews: blueprint.meta?.requiredContributorReviews ?? (publishVisibility === 'core' ? 1 : 2),
        requiredExpertReviews: blueprint.meta?.requiredExpertReviews ?? (publishVisibility === 'core' ? 1 : 0),
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
        publishStatus: publishVisibility === 'core'
          ? `已送出 workflow "${title}"，核心 workflow 需要 1 位貢獻者與 1 位專家審核後才會開放。`
          : `已發布 workflow "${title}"，目前未驗證；2 位貢獻者審核後會標記 verified。`,
      });
      window.dispatchEvent(new CustomEvent('methmetica:public-workflows-changed', {
        detail: { workflowId: blueprint.card.id, action: 'published' },
      }));
      clearPublicWorkflowEdit(blueprint.card.id, effectiveUser.id);
      setTimeout(() => markCurrentGraphSaved(), 0);
    } catch (error) {
      console.error('Failed to publish workflow only', error);
      const message = error instanceof Error ? error.message : '發布失敗';
      updateProjectData({
        publishStatus: `發布失敗：${message}`,
      });
    } finally {
      setIsPublishing(false);
    }
  }, [
    data.description,
    data.label,
    data.supabaseWorkflowId,
    id,
    localDesc,
    localName,
    localTags,
    localVisibility,
    markCurrentGraphSaved,
    getPublishUpdateMetadata,
    setUser,
    updateProjectData,
    user,
  ]);

  React.useEffect(() => {
    const handleSidebarPublish = (event: Event) => {
      const detail = (event as CustomEvent<PublishUpdateMetadata & { projectNodeId?: string }>).detail;
      if (detail?.projectNodeId && detail.projectNodeId !== id) return;

      const draft = localBuilderDraft || stripLegacyInterfaceBlocks(data.builderDraft as CommunityNodeTemplate | undefined);
      if (!draft || isPublishing) return;
      handlePublish(draft, detail);
    };

    window.addEventListener('publish-project-template', handleSidebarPublish);
    return () => window.removeEventListener('publish-project-template', handleSidebarPublish);
  }, [data.builderDraft, handlePublish, id, isPublishing, localBuilderDraft]);

  React.useEffect(() => {
    const handleSidebarPublishWorkflow = (event: Event) => {
      const detail = (event as CustomEvent<PublishUpdateMetadata & { projectNodeId?: string }>).detail;
      if (detail?.projectNodeId && detail.projectNodeId !== id) return;
      if (isPublishing) return;
      void handlePublishWorkflowOnly(detail);
    };

    window.addEventListener('publish-project-workflow', handleSidebarPublishWorkflow);
    return () => window.removeEventListener('publish-project-workflow', handleSidebarPublishWorkflow);
  }, [handlePublishWorkflowOnly, id, isPublishing]);

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
    const controlHandles = (builderDraft?.controlPorts || []).map((port, index) => ({
      id: port.id,
      type: 'input' as const,
      position: 'left' as const,
      offset: Math.max(16, Math.min(84, 24 + index * 18)),
      label: getLocalizedText(port.labelI18n, language, port.label),
    }));

    if (JSON.stringify(data.handles || []) !== JSON.stringify(controlHandles)) {
      updateNodeData(id, { handles: controlHandles }, { skipGraphEval: true });
    }
  }, [builderDraft?.controlPorts, data.handles, id, language, updateNodeData]);

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
    if (data.changeType && data.changeType !== localChangeType) {
      setLocalChangeType(data.changeType);
    }
  }, [data.label, data.description, data.tags, data.visibility, data.changeType, localChangeType, localDesc, localName, localTags, localVisibility]);

  return (
    <NodeFrame
      id={id}
      data={data}
      selected={selected}
      icon={<Icons.Package />}
      defaultLabel="Node Builder"
      className="node-builder-node"
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
      <div ref={projectContentRef} className="project-node-content">
      {isExpanded && (
        <div className="project-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                              name={`project-builder-input-${id}-${port.id}`}
                              className="project-tags-input"
                              value={getLanguageText(port.labelI18n, interfaceLanguage, port.label)}
                              onChange={(e) => {
                                const nextLabel = e.target.value;
                                updateBuilderInterface((schema) => ({
                                  ...schema,
                                  inputs: schema.inputs.map((item, itemIndex) => itemIndex === index ? {
                                    ...item,
                                    label: interfaceLanguage === 'zh-TW' || !item.label ? nextLabel : item.label,
                                    labelI18n: setLocalizedText(item.labelI18n, interfaceLanguage, nextLabel),
                                    id: interfaceLanguage === 'zh-TW' ? slugifyPortId(nextLabel, item.id) : item.id,
                                  } : item),
                                }));
                              }}
                              placeholder="input name"
                            />
                            {!hasLanguageText(port.labelI18n, interfaceLanguage, port.label) && (
                              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <MissingLanguageBadge language={interfaceLanguage} />
                              </div>
                            )}
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
                              name={`project-builder-output-${id}-${port.id}`}
                              className="project-tags-input"
                              value={getLanguageText(port.labelI18n, interfaceLanguage, port.label)}
                              onChange={(e) => {
                                const nextLabel = e.target.value;
                                updateBuilderInterface((schema) => ({
                                  ...schema,
                                  outputs: schema.outputs.map((item, itemIndex) => itemIndex === index ? {
                                    ...item,
                                    label: interfaceLanguage === 'zh-TW' || !item.label ? nextLabel : item.label,
                                    labelI18n: setLocalizedText(item.labelI18n, interfaceLanguage, nextLabel),
                                    id: interfaceLanguage === 'zh-TW' ? slugifyPortId(nextLabel, item.id) : item.id,
                                  } : item),
                                }));
                              }}
                              placeholder="output name"
                            />
                            {!hasLanguageText(port.labelI18n, interfaceLanguage, port.label) && (
                              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <MissingLanguageBadge language={interfaceLanguage} />
                              </div>
                            )}
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

              <div style={{
                display: 'grid',
                gap: '10px',
                padding: '12px',
                border: '1px solid rgba(245, 158, 11, 0.18)',
                borderRadius: '12px',
                background: 'rgba(245, 158, 11, 0.06)',
                marginBottom: '14px'
              }}>
                <div>
                  <strong style={{ display: 'block', color: 'var(--text-main)' }}>Internal Content Ports</strong>
                  <p style={{ margin: '4px 0 0', color: 'var(--text-sub)', fontSize: '0.78rem' }}>
                    在 Node Builder canvas 的文字、公式或 toggle 內容旁按 Content Port，就會在內部 bridge 產生可接線輸入口。
                  </p>
                </div>
                {(builderDraft.controlPorts || []).length === 0 ? (
                  <div style={{ color: 'var(--text-sub)', fontSize: '0.8rem' }}>
                    尚未建立 control port。到下方 Node Builder 裡，對內容欄位按「Content Port」。
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {(builderDraft.controlPorts || []).map((port) => (
                      <div
                        key={port.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr auto',
                          gap: '8px',
                          alignItems: 'center',
                          padding: '9px 10px',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '10px',
                          background: 'rgba(0,0,0,0.14)'
                        }}
                      >
                        <div style={{ display: 'grid', gap: '3px', minWidth: 0 }}>
                          <strong style={{ color: 'var(--text-main)', fontSize: '0.82rem' }}>
                            {getLocalizedText(port.labelI18n, interfaceLanguage, port.label)}
                          </strong>
                          <span style={{ color: 'var(--text-sub)', fontSize: '0.68rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {port.id}
                          </span>
                        </div>
                        <span style={{ color: '#fbbf24', fontSize: '0.68rem', border: '1px solid rgba(245,158,11,0.28)', borderRadius: '999px', padding: '3px 7px' }}>
                          internal input
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {builderDraft && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  padding: '12px',
                  border: '1px solid rgba(56, 189, 248, 0.16)',
                  borderRadius: '12px',
                  background: 'rgba(56, 189, 248, 0.06)',
                  marginBottom: '14px'
                }}>
                  <div>
                    <strong style={{ display: 'block', color: 'var(--text-main)' }}>Test Node Behavior</strong>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-sub)', fontSize: '0.78rem' }}>
                      用外部節點視角測試 input / output，不在 ProjectNode 內常駐預覽。
                    </p>
                  </div>
                  <button
                    type="button"
                    className="builder-refresh-btn"
                    onClick={() => openTemplateTester(id)}
                  >
                    Open Tester
                  </button>
                </div>
              )}

              <CommunityNodeMaker
                draft={builderDraft}
                onChange={handleDraftChange}
                onPublish={handlePublish}
                editingLanguage={interfaceLanguage}
                onEditingLanguageChange={setInterfaceLanguage}
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
      </div>
    </NodeFrame>
  );
});
