import React from 'react';
import { Icons } from './Icons';
import type {
  CommunityNodeTemplate,
  TemplateBuilderBlock,
  TemplateBuilderBlockKind,
  TemplateFieldSpec,
  TemplateHandleSpec,
} from '../community/types';

const TOOLKIT: Array<{ kind: TemplateBuilderBlockKind; label: string; hint: string }> = [
  { kind: 'input', label: 'Input', hint: '會生成使用此節點時的輸入 handle' },
  { kind: 'output', label: 'Output', hint: '會生成使用此節點時的輸出 handle' },
  { kind: 'text', label: 'Text', hint: '靜態教學文字與說明' },
  { kind: 'toggle', label: 'Toggle', hint: '切換額外說明或替代方法' },
  { kind: 'math', label: 'Math', hint: '輸入數學公式區塊' },
];

const handlePositionByIndex = (index: number) => Math.max(16, Math.min(84, 24 + index * 18));

const blockToField = (block: TemplateBuilderBlock): TemplateFieldSpec | null => {
  if (block.kind === 'text') {
    return {
      id: block.id,
      label: block.label,
      kind: 'textarea',
      placeholder: block.placeholder || '輸入說明文字',
      defaultValue: block.content || '',
    };
  }

  if (block.kind === 'math') {
    return {
      id: block.id,
      label: block.label,
      kind: 'text',
      placeholder: block.placeholder || '輸入數學公式',
      defaultValue: block.content || '',
    };
  }

  if (block.kind === 'toggle') {
    return {
      id: block.id,
      label: block.label,
      kind: 'textarea',
      placeholder: block.placeholder || '切換後顯示的補充說明',
      defaultValue: block.content || '',
    };
  }

  return null;
};

const blockToHandle = (block: TemplateBuilderBlock, index: number): TemplateHandleSpec | null => {
  if (block.kind === 'input') {
    return {
      id: `h-in-${block.id}`,
      label: block.label,
      position: 'left',
      type: 'input',
      offset: handlePositionByIndex(index),
    };
  }

  if (block.kind === 'output') {
    return {
      id: `h-out-${block.id}`,
      label: block.label,
      position: 'right',
      type: 'output',
      offset: handlePositionByIndex(index),
    };
  }

  return null;
};

export const buildTemplateFromBlocks = (draft: CommunityNodeTemplate): CommunityNodeTemplate => {
  const inputs = draft.builderBlocks
    .map((block, index) => blockToHandle(block, index))
    .filter((item): item is TemplateHandleSpec => Boolean(item && item.type === 'input'));

  const outputs = draft.builderBlocks
    .map((block, index) => blockToHandle(block, index))
    .filter((item): item is TemplateHandleSpec => Boolean(item && item.type === 'output'));

  const fields = draft.builderBlocks
    .map(blockToField)
    .filter((item): item is TemplateFieldSpec => Boolean(item));

  return {
    ...draft,
    discovery: 'search-only',
    fields,
    inputs,
    outputs,
  };
};

interface CommunityNodeMakerProps {
  draft: CommunityNodeTemplate;
  onChange: (draft: CommunityNodeTemplate) => void;
  onPublish: (draft: CommunityNodeTemplate) => void;
  publishLabel?: string;
  status?: string;
  hideMetadataFields?: boolean;
}

export function CommunityNodeMaker({
  draft,
  onChange,
  onPublish,
  publishLabel = 'Publish template',
  status,
  hideMetadataFields = false,
}: CommunityNodeMakerProps) {
  const [draggingKind, setDraggingKind] = React.useState<TemplateBuilderBlockKind | null>(null);

  const packagedDraft = React.useMemo(() => buildTemplateFromBlocks(draft), [draft]);

  const updateDraft = (patch: Partial<CommunityNodeTemplate>) => {
    onChange({ ...draft, ...patch });
  };

  const updateArrayField = (key: 'alternativeAlgorithms' | 'tutorialSteps' | 'relatedWorkflowIds' | 'tags', value: string) => {
    updateDraft({
      [key]: value.split('\n').map(item => item.trim()).filter(Boolean),
    } as Partial<CommunityNodeTemplate>);
  };

  const createBlock = (kind: TemplateBuilderBlockKind): TemplateBuilderBlock => ({
    id: `${kind}-${Date.now()}`,
    kind,
    label:
      kind === 'input' ? 'input' :
      kind === 'output' ? 'output' :
      kind === 'toggle' ? 'toggle' :
      kind === 'math' ? 'formula' :
      'text',
    content: kind === 'text' ? '輸入教學說明...' : kind === 'math' ? 'a^2 + b^2 = c^2' : '',
    placeholder: kind === 'input' ? '使用此節點時會提供的值' : kind === 'output' ? '此節點輸出的命名' : '',
  });

  const insertBlock = (kind: TemplateBuilderBlockKind, index?: number) => {
    const next = [...draft.builderBlocks];
    const targetIndex = index === undefined ? next.length : index;
    next.splice(targetIndex, 0, createBlock(kind));
    updateDraft({ builderBlocks: next });
  };

  const moveBlock = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= draft.builderBlocks.length) return;
    const next = [...draft.builderBlocks];
    const [item] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, item);
    updateDraft({ builderBlocks: next });
  };

  const updateBlock = (blockId: string, patch: Partial<TemplateBuilderBlock>) => {
    updateDraft({
      builderBlocks: draft.builderBlocks.map(block => block.id === blockId ? { ...block, ...patch } : block),
    });
  };

  const removeBlock = (blockId: string) => {
    updateDraft({
      builderBlocks: draft.builderBlocks.filter(block => block.id !== blockId),
    });
  };

  const onToolkitDragStart = (kind: TemplateBuilderBlockKind) => {
    setDraggingKind(kind);
  };

  const onToolkitDragEnd = () => {
    setDraggingKind(null);
  };

  return (
    <div className="node-maker-shell">
      <div className="maker-card">
        <div className="maker-card-header">
          <div>
            <h3>Node Builder</h3>
            <p>在工作流中拖拉元件，打包成搜尋可用的社群節點。</p>
          </div>
          <span className="maker-badge">search only</span>
        </div>

        {!hideMetadataFields && (
          <>
            <div className="maker-grid meta-grid">
              <label>
                <span>Title</span>
                <input value={draft.title} onChange={(e) => updateDraft({ title: e.target.value })} />
              </label>
              <label>
                <span>Slug</span>
                <input value={draft.slug} onChange={(e) => updateDraft({ slug: e.target.value })} />
              </label>
              <label>
                <span>Category</span>
                <input value={draft.category} onChange={(e) => updateDraft({ category: e.target.value })} />
              </label>
              <label>
                <span>Accent</span>
                <input value={draft.accent} onChange={(e) => updateDraft({ accent: e.target.value })} />
              </label>
            </div>

            <label className="stack">
              <span>Summary</span>
              <textarea value={draft.summary} onChange={(e) => updateDraft({ summary: e.target.value })} />
            </label>
          </>
        )}

        <div className="builder-layout">
          <div className="toolkit-panel">
            <div className="panel-title">Drag & drop toolkit</div>
            <div className="toolkit-list">
              {TOOLKIT.map(item => (
                <button
                  key={item.kind}
                  className={`toolkit-item ${draggingKind === item.kind ? 'is-dragging' : ''}`}
                  draggable
                  onDragStart={() => onToolkitDragStart(item.kind)}
                  onDragEnd={onToolkitDragEnd}
                  onClick={() => insertBlock(item.kind)}
                  title={item.hint}
                >
                  <strong>{item.label}</strong>
                  <span>{item.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div
            className="builder-canvas"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (draggingKind) insertBlock(draggingKind);
              setDraggingKind(null);
            }}
          >
            <div className="panel-title">Template canvas</div>
            {draft.builderBlocks.map((block, index) => (
              <div
                key={block.id}
                className={`builder-block kind-${block.kind}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggingKind) insertBlock(draggingKind, index);
                  setDraggingKind(null);
                }}
              >
                <div className="builder-block-head">
                  <span className="builder-chip">{block.kind}</span>
                  <div className="builder-block-actions">
                    <button className="icon-btn-small" onClick={() => moveBlock(index, index - 1)} title="Move up">
                      <span style={{ fontSize: 12 }}>↑</span>
                    </button>
                    <button className="icon-btn-small" onClick={() => moveBlock(index, index + 1)} title="Move down">
                      <span style={{ fontSize: 12 }}>↓</span>
                    </button>
                    <button className="icon-btn-small" onClick={() => removeBlock(block.id)} title="Remove block">
                      <Icons.Clear />
                    </button>
                  </div>
                </div>

                <label className="stack compact">
                  <span>Label</span>
                  <input value={block.label} onChange={(e) => updateBlock(block.id, { label: e.target.value })} />
                </label>

                {(block.kind === 'text' || block.kind === 'toggle' || block.kind === 'math') && (
                  <label className="stack compact">
                    <span>{block.kind === 'math' ? 'Formula' : 'Content'}</span>
                    <textarea value={block.content || ''} onChange={(e) => updateBlock(block.id, { content: e.target.value })} />
                  </label>
                )}

                {(block.kind === 'input' || block.kind === 'output') && (
                  <label className="stack compact">
                    <span>Description</span>
                    <input value={block.placeholder || ''} onChange={(e) => updateBlock(block.id, { placeholder: e.target.value })} />
                  </label>
                )}
              </div>
            ))}

            {draft.builderBlocks.length === 0 && (
              <div className="canvas-empty">把左側元件拖進來，或直接點一下加入。</div>
            )}
          </div>
        </div>

        <div className="two-col">
          <label className="stack">
            <span>Best Algorithm</span>
            <textarea value={draft.bestAlgorithm} onChange={(e) => updateDraft({ bestAlgorithm: e.target.value })} />
          </label>
          <label className="stack">
            <span>Alternative Algorithms</span>
            <textarea value={draft.alternativeAlgorithms.join('\n')} onChange={(e) => updateArrayField('alternativeAlgorithms', e.target.value)} />
          </label>
        </div>

        <div className="two-col">
          <label className="stack">
            <span>Tutorial Steps</span>
            <textarea value={draft.tutorialSteps.join('\n')} onChange={(e) => updateArrayField('tutorialSteps', e.target.value)} />
          </label>
          <label className="stack">
            <span>Related Workflows</span>
            <textarea value={draft.relatedWorkflowIds.join('\n')} onChange={(e) => updateArrayField('relatedWorkflowIds', e.target.value)} />
          </label>
        </div>

        <div className="maker-actions">
          <button className="new-workflow-btn" onClick={() => onPublish(packagedDraft)}>
            <Icons.Save /> {publishLabel}
          </button>
          <div className="maker-status">{status}</div>
        </div>
      </div>

      <div className="preview-card" style={{ borderColor: draft.accent }}>
        <div className="maker-card-header">
          <div>
            <h3>Template Preview</h3>
            <p>這是別人在搜尋後拖進工作流時會看到的模樣。</p>
          </div>
          <span className="maker-badge">{packagedDraft.discovery}</span>
        </div>

        <div className="preview-node">
          <div className="preview-header">
            <span className="preview-dot" style={{ background: draft.accent }} />
            <div>
              <strong>{draft.title || 'Untitled template'}</strong>
              <p>{draft.summary || '寫下這個節點要解決的事。'}</p>
            </div>
          </div>

          <div className="preview-layout">
            {packagedDraft.builderBlocks.map(block => (
              <div key={block.id} className={`preview-block kind-${block.kind}`}>
                <span className="builder-chip">{block.kind}</span>
                <strong>{block.label}</strong>
                {block.content && <p>{block.content}</p>}
                {!block.content && block.placeholder && <p>{block.placeholder}</p>}
              </div>
            ))}
          </div>

          <div className="preview-foot">
            <span>{packagedDraft.inputs.length} inputs</span>
            <span>{packagedDraft.outputs.length} outputs</span>
            <span>{packagedDraft.fields.length} fields</span>
          </div>
        </div>
      </div>

      <style>{`
        .node-maker-shell {
          display: grid;
          grid-template-columns: minmax(0, 1.25fr) minmax(300px, 0.75fr);
          gap: 14px;
        }
        .maker-card,
        .preview-card {
          background: var(--bg-sidebar);
          border: 1px solid var(--border-node);
          border-radius: 22px;
          padding: 16px;
          box-shadow: var(--node-shadow);
        }
        .maker-card-header {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
          margin-bottom: 14px;
        }
        .maker-card-header h3,
        .maker-card-header p {
          margin: 0;
        }
        .maker-card-header p {
          color: var(--text-sub);
          margin-top: 4px;
        }
        .maker-badge,
        .builder-chip {
          border: 1px solid var(--border-node);
          border-radius: 999px;
          padding: 3px 8px;
          font-size: 0.66rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-sub);
          white-space: nowrap;
        }
        .meta-grid,
        .two-col {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .stack {
          display: grid;
          gap: 5px;
          font-size: 0.72rem;
          color: var(--text-sub);
        }
        .stack.compact textarea {
          min-height: 62px;
        }
        .maker-card input,
        .maker-card textarea {
          width: 100%;
          box-sizing: border-box;
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--border-node);
          border-radius: 10px;
          color: var(--text-main);
          font: inherit;
          padding: 8px 10px;
          outline: none;
        }
        .maker-card textarea {
          min-height: 78px;
          resize: vertical;
        }
        .builder-layout {
          display: grid;
          grid-template-columns: 220px minmax(0, 1fr);
          gap: 12px;
          margin: 14px 0;
        }
        .toolkit-panel,
        .builder-canvas {
          border: 1px solid var(--border-node);
          background: rgba(255,255,255,0.03);
          border-radius: 18px;
          padding: 12px;
        }
        .panel-title {
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--accent-bright);
          margin-bottom: 10px;
        }
        .toolkit-list {
          display: grid;
          gap: 8px;
        }
        .toolkit-item {
          text-align: left;
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--border-node);
          color: var(--text-main);
          border-radius: 14px;
          padding: 10px;
          cursor: grab;
          display: grid;
          gap: 4px;
          font: inherit;
        }
        .toolkit-item strong {
          font-size: 0.84rem;
        }
        .toolkit-item span {
          font-size: 0.74rem;
          color: var(--text-sub);
        }
        .toolkit-item.is-dragging {
          opacity: 0.6;
          border-color: var(--accent-bright);
        }
        .builder-canvas {
          min-height: 320px;
          display: grid;
          align-content: start;
          gap: 10px;
        }
        .builder-block,
        .preview-block {
          border: 1px solid var(--border-node);
          border-radius: 16px;
          background: rgba(255,255,255,0.04);
          padding: 10px;
          display: grid;
          gap: 8px;
        }
        .builder-block-head {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          align-items: center;
        }
        .builder-block-actions {
          display: flex;
          gap: 4px;
        }
        .canvas-empty {
          border: 1px dashed var(--border-node);
          border-radius: 16px;
          padding: 28px 16px;
          text-align: center;
          color: var(--text-sub);
        }
        .maker-actions {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: center;
          margin-top: 12px;
        }
        .maker-status {
          color: var(--accent-bright);
          font-size: 0.78rem;
          min-height: 18px;
          text-align: right;
        }
        .preview-node {
          border: 1px solid var(--border-node);
          border-radius: 18px;
          padding: 14px;
          background: rgba(255,255,255,0.03);
        }
        .preview-header {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          margin-bottom: 12px;
        }
        .preview-header p {
          margin: 4px 0 0;
          color: var(--text-sub);
        }
        .preview-dot {
          width: 12px;
          height: 12px;
          border-radius: 999px;
          margin-top: 6px;
          flex: 0 0 auto;
        }
        .preview-layout {
          display: grid;
          gap: 8px;
        }
        .preview-block strong {
          font-size: 0.85rem;
        }
        .preview-block p {
          margin: 0;
          color: var(--text-sub);
          font-size: 0.78rem;
        }
        .preview-foot {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          margin-top: 12px;
          font-size: 0.72rem;
          color: var(--text-sub);
        }
        @media (max-width: 1100px) {
          .node-maker-shell,
          .builder-layout,
          .meta-grid,
          .two-col {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
