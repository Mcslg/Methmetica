import React from 'react';
import { type NodeProps, Handle, Position, useReactFlow } from '@xyflow/react';
import { Icons } from '../components/Icons';
import { NodeFrame } from '../components/NodeFrame';
import useStore, { type AppNode } from '../store/useStore';
import { useLanguage } from '../contexts/LanguageContext';
import type { CommunityNodeTemplate, WorkflowVisibility } from '../community/types';
import { makeInitialDraft } from '../community/templateDraft';

const parseTags = (value: string) => value
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);

const INVISIBLE_HANDLE_STYLE = { opacity: 0 };

export const ProjectNode = React.memo(function ProjectNode({ id, data, selected }: NodeProps<AppNode>) {
  const { setViewport, getNodes } = useReactFlow();
  const { t } = useLanguage();
  const updateNodeData = useStore(state => state.updateNodeData);
  const addNode = useStore(state => state.addNode);
  const activeFileId = useStore(state => state.activeFileId);

  const [localName, setLocalName] = React.useState(data.label || '');
  const [localDesc, setLocalDesc] = React.useState(data.description || '');
  const [localTags, setLocalTags] = React.useState(Array.isArray(data.tags) ? data.tags.join(', ') : '');
  const [localVisibility, setLocalVisibility] = React.useState<WorkflowVisibility>(data.visibility || 'private');
  const [isExpanded, setIsExpanded] = React.useState(true);

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
  }, [data.description, data.label, data.tags, data.visibility, localDesc, localName, localTags, localVisibility]);

  const saveWorkflowMetadata = React.useCallback((patch?: Partial<{
    label: string;
    description: string;
    tags: string[];
    visibility: WorkflowVisibility;
  }>) => {
    const finalName = (patch?.label ?? localName).trim() || 'Untitled Workflow';
    const finalDesc = patch?.description ?? localDesc;
    const finalTags = patch?.tags ?? parseTags(localTags);
    const finalVisibility = patch?.visibility ?? localVisibility;

    if (finalName !== localName) setLocalName(finalName);
    if (finalDesc !== localDesc) setLocalDesc(finalDesc);
    if (finalVisibility !== localVisibility) setLocalVisibility(finalVisibility);
    const finalTagsText = finalTags.join(', ');
    if (finalTagsText !== localTags) setLocalTags(finalTagsText);

    updateNodeData(id, {
      label: finalName,
      description: finalDesc,
      tags: finalTags,
      visibility: finalVisibility,
    }, { skipGraphEval: true });

    const builderNodeId = data.builderNodeId as string | undefined;
    if (builderNodeId) {
      updateNodeData(builderNodeId, {
        label: finalName,
        description: finalDesc,
        tags: finalTags,
        visibility: finalVisibility,
      }, { skipGraphEval: true });
    }
  }, [data.builderNodeId, id, localDesc, localName, localTags, localVisibility, updateNodeData]);

  const focusNodeById = React.useCallback((nodeId: string) => {
    const node = getNodes().find(n => n.id === nodeId);
    if (!node) return;
    useStore.setState((current) => ({
      nodes: current.nodes.map(item => ({ ...item, selected: item.id === nodeId })),
    }));
    setViewport({ x: window.innerWidth / 2 - node.position.x - 420, y: window.innerHeight / 2 - node.position.y - 260, zoom: 0.72 }, { duration: 800 });
  }, [getNodes, setViewport]);

  const handleCreateBuilder = () => {
    const existingBuilder = getNodes().find(node =>
      node.type === 'nodeBuilderNode' &&
      (node.data?.projectNodeId === id || node.id === data.builderNodeId)
    );
    if (existingBuilder) {
      focusNodeById(existingBuilder.id);
      return;
    }

    const draft = (data.builderDraft as CommunityNodeTemplate | undefined) || makeInitialDraft({
      title: (localName || data.label || 'Untitled Workflow').trim(),
      summary: localDesc || data.description || '',
      tags: parseTags(localTags),
    });
    const builderNodeId = `node-builder-${id}`;
    const projectNode = getNodes().find(node => node.id === id);

    addNode({
      id: builderNodeId,
      type: 'nodeBuilderNode',
      position: {
        x: (projectNode?.position.x ?? 0) + 360,
        y: projectNode?.position.y ?? 0,
      },
      width: 900,
      style: { width: 900 },
      selected: true,
      data: {
        projectNodeId: id,
        label: draft.title,
        description: draft.summary,
        tags: draft.tags,
        visibility: localVisibility,
        builderDraft: draft,
        publishStatus: 'Node Builder 已獨立成節點，發布時仍會同步到 Project Root。',
      },
    } as AppNode);

    updateNodeData(id, {
      builderNodeId,
      label: draft.title,
      description: draft.summary,
      tags: draft.tags,
      visibility: localVisibility,
      builderDraft: draft,
      publishStatus: '這條工作流已連到獨立 Node Builder。',
    }, { skipGraphEval: true });
    setTimeout(() => focusNodeById(builderNodeId), 0);
  };

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
      <div className="project-node-content">
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
        </div>

        {isExpanded && (
          <div className="project-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="root-metadata">
              <label className="root-field" style={{ gridColumn: '1 / -1' }}>
                <span>{t('nodes.project.name_label') || 'Project Name'}</span>
                <input
                  name={`project-name-${id}`}
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
                  name={`project-description-${id}`}
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
                  name={`project-tags-${id}`}
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
                  name={`project-visibility-${id}`}
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

            <div className="builder-cta">
              <div>
                <strong>{data.builderDraft ? '開啟 Node Builder' : '把這條工作流建立成節點'}</strong>
                <p>
                  {data.builderDraft
                    ? 'Builder 已獨立成節點；ProjectNode 只保留 workflow metadata 和發布狀態。'
                    : '建立後會新增一個獨立 Node Builder 節點，用來設計 input、output 和 template UI。'}
                </p>
              </div>
              <button className="builder-create-btn" onClick={handleCreateBuilder}>
                <Icons.Package /> {data.builderDraft ? 'Open Builder' : '建立 Builder Node'}
              </button>
            </div>
          </div>
        )}
        <Handle type="source" position={Position.Right} id="name-out" style={INVISIBLE_HANDLE_STYLE} />
      </div>
    </NodeFrame>
  );
});
