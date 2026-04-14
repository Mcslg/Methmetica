import React from 'react';
import { createPortal } from 'react-dom';
import { Icons } from './Icons';
import { getTemplateInterfaceSchema, portToHandleSpec } from '../community/types';
import type {
  CommunityNodeTemplate,
  TemplateBuilderBlock,
  TemplateBuilderBlockKind,
  TemplateHandleSpec,
  TemplateInterfaceSchema,
  TemplatePortSpec,
} from '../community/types';

const TOOLKIT: Array<{ kind: TemplateBuilderBlockKind; label: string; hint: string }> = [
  { kind: 'input', label: 'Input', hint: '建立外部資料流入模板的接口' },
  { kind: 'output', label: 'Output', hint: '建立模板結果對外暴露的接口' },
  { kind: 'text', label: 'Text', hint: '靜態教學文字與說明' },
  { kind: 'toggle', label: 'Toggle', hint: '切換額外說明或替代方法' },
  { kind: 'math', label: 'Math', hint: '輸入數學公式區塊' },
];
const ACTIVE_TOOLKIT = TOOLKIT.filter(item => item.kind !== 'input' && item.kind !== 'output');

const BLOCK_KIND_META: Record<TemplateBuilderBlockKind, { color: string; icon: keyof typeof Icons; summaryLabel: string }> = {
  input: { color: '#4facfe', icon: 'Trigger', summaryLabel: 'Incoming interface' },
  output: { color: '#f59e0b', icon: 'Result', summaryLabel: 'Outgoing interface' },
  text: { color: '#a78bfa', icon: 'Text', summaryLabel: 'Static explanation' },
  toggle: { color: '#f472b6', icon: 'Comment', summaryLabel: 'Collapsible note' },
  math: { color: '#10b981', icon: 'Calculate', summaryLabel: 'Static formula' },
};

const handlePositionByIndex = (index: number) => Math.max(16, Math.min(84, 24 + index * 18));

const getInterfaceCopy = (kind: 'input' | 'output') => {
  if (kind === 'input') {
    return {
      badge: 'Interface In',
      title: 'External input',
      detail: '外部傳進來的值會從這個接口流入模板，因此在模板內部它會成為可繼續往下游傳遞的資料來源。',
      flow: 'outside -> template',
    };
  }

  return {
    badge: 'Interface Out',
    title: 'External output',
    detail: '模板內部整理好的結果會在這個接口被接住，然後再對外暴露成模板的輸出。',
    flow: 'template -> outside',
  };
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

const blockToPort = (block: TemplateBuilderBlock, index: number): TemplatePortSpec | null => {
  const handle = blockToHandle(block, index);
  if (!handle) return null;

  return {
    ...handle,
    source: 'static',
    valueKind: 'value',
    derivesFrom: 'builderBlocks',
    description: block.placeholder,
  };
};

const buildInterfaceSchemaFromBlocks = (draft: CommunityNodeTemplate): TemplateInterfaceSchema => {
  const inputs = draft.builderBlocks
    .map((block, index) => blockToPort(block, index))
    .filter((item): item is TemplatePortSpec => Boolean(item && item.type === 'input'));

  const outputs = draft.builderBlocks
    .map((block, index) => blockToPort(block, index))
    .filter((item): item is TemplatePortSpec => Boolean(item && item.type === 'output'));

  return { inputs, outputs };
};

export const buildTemplateFromBlocks = (draft: CommunityNodeTemplate): CommunityNodeTemplate => {
  const derivedSchema = buildInterfaceSchemaFromBlocks(draft);
  const interfaceSchema = draft.interfaceSchema ?? derivedSchema;
  const inputs = interfaceSchema.inputs.map(portToHandleSpec);
  const outputs = interfaceSchema.outputs.map(portToHandleSpec);

  return {
    ...draft,
    discovery: 'search-only',
    interfaceSchema,
    fields: [],
    inputs,
    outputs,
  };
};

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const validateDraft = (draft: CommunityNodeTemplate): string | null => {
  if (!draft.title.trim()) return 'Title 不能為空。';
  if (!draft.slug.trim()) return 'Slug 不能為空。';
  if (!slugPattern.test(draft.slug.trim())) return 'Slug 只能包含小寫英數字與連字號。';

  if (draft.builderBlocks.length === 0) {
    return '至少要加入一個 block。';
  }

  const blockIds = new Set<string>();
  const interfaceSchema = getTemplateInterfaceSchema(draft);
  const interfaceCount = interfaceSchema.inputs.length + interfaceSchema.outputs.length;

  for (const block of draft.builderBlocks) {
    if (blockIds.has(block.id)) return 'Block id 重複，請重新加入該 block。';
    blockIds.add(block.id);

    if (block.kind !== 'text' && !block.label.trim()) {
      return '每個 block 都需要 label。';
    }
  }

  if (interfaceCount === 0) {
    return '至少需要一個 input 或 output interface。';
  }

  return null;
};

interface CommunityNodeMakerProps {
  draft: CommunityNodeTemplate;
  onChange: (draft: CommunityNodeTemplate) => void;
  onPublish: (draft: CommunityNodeTemplate) => void;
  publishLabel?: string;
  status?: string;
  hideMetadataFields?: boolean;
  hidePublishAction?: boolean;
  showDetachedToolkit?: boolean;
}

const BUILDER_BLOCK_KIND_MIME = 'application/x-methmatica-builder-block';
const BUILDER_BLOCK_REORDER_MIME = 'application/x-methmatica-builder-reorder';

const readDraggedKind = (event: Pick<React.DragEvent, 'dataTransfer'>): TemplateBuilderBlockKind | null => {
  const raw = event.dataTransfer.getData(BUILDER_BLOCK_KIND_MIME) || event.dataTransfer.getData('text/plain');
  if (ACTIVE_TOOLKIT.some(item => item.kind === raw)) {
    return raw as TemplateBuilderBlockKind;
  }

  return null;
};

const stopNodeDragPropagation = (event: React.PointerEvent | React.MouseEvent) => {
  event.stopPropagation();
};

export function CommunityNodeMaker({
  draft,
  onChange,
  onPublish,
  publishLabel = 'Publish template',
  status,
  hideMetadataFields = false,
  hidePublishAction = false,
  showDetachedToolkit = false,
}: CommunityNodeMakerProps) {
  const [draggingKind, setDraggingKind] = React.useState<TemplateBuilderBlockKind | null>(null);
  const [draggingBlockIndex, setDraggingBlockIndex] = React.useState<number | null>(null);
  const [dropIndex, setDropIndex] = React.useState<number | null>(null);
  const [pieMenu, setPieMenu] = React.useState<{ x: number; y: number; insertIndex: number } | null>(null);
  const [pieSelection, setPieSelection] = React.useState<TemplateBuilderBlockKind | null>(null);
  const [blockMenu, setBlockMenu] = React.useState<{ x: number; y: number; blockId: string; index: number } | null>(null);
  const [selectedBlockId, setSelectedBlockId] = React.useState<string | null>(null);
  const [recentlyInsertedBlockId, setRecentlyInsertedBlockId] = React.useState<string | null>(null);
  const [collapsedBlocks, setCollapsedBlocks] = React.useState<Record<string, boolean>>({});
  const shellRef = React.useRef<HTMLDivElement | null>(null);

  const packagedDraft = React.useMemo(() => buildTemplateFromBlocks(draft), [draft]);
  const validationError = React.useMemo(() => validateDraft(packagedDraft), [packagedDraft]);

  const updateDraft = (patch: Partial<CommunityNodeTemplate>) => {
    onChange({ ...draft, ...patch });
  };

  const createBlock = (kind: TemplateBuilderBlockKind): TemplateBuilderBlock => ({
    id: `${kind}-${Date.now()}`,
    kind,
    label:
      kind === 'input' ? 'input' :
      kind === 'output' ? 'output' :
      kind === 'toggle' ? 'toggle' :
      kind === 'math' ? 'formula' :
      '',
    content: kind === 'text' ? '輸入教學說明...' : kind === 'math' ? 'a^2 + b^2 = c^2' : '',
    placeholder: kind === 'input' ? '使用此節點時會提供的值' : kind === 'output' ? '此節點輸出的命名' : '',
  });

  const flashInsertedBlock = (blockId: string) => {
    setRecentlyInsertedBlockId(blockId);
    window.setTimeout(() => {
      setRecentlyInsertedBlockId((current) => current === blockId ? null : current);
    }, 900);
  };

  const insertBlock = (kind: TemplateBuilderBlockKind, index?: number) => {
    const next = [...draft.builderBlocks];
    const targetIndex = index === undefined ? next.length : index;
    const newBlock = createBlock(kind);
    next.splice(targetIndex, 0, newBlock);
    updateDraft({ builderBlocks: next });
    setSelectedBlockId(newBlock.id);
    flashInsertedBlock(newBlock.id);
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
    setSelectedBlockId((prev) => (prev === blockId ? null : prev));
  };

  const duplicateBlock = (blockId: string, index: number) => {
    const source = draft.builderBlocks.find(block => block.id === blockId);
    if (!source) return;

    const clone: TemplateBuilderBlock = {
      ...source,
      id: `${source.kind}-${Date.now()}`,
    };
    const next = [...draft.builderBlocks];
    next.splice(index + 1, 0, clone);
    updateDraft({ builderBlocks: next });
    setSelectedBlockId(clone.id);
    flashInsertedBlock(clone.id);
  };

  const toggleBlockCollapse = (blockId: string) => {
    setCollapsedBlocks((current) => ({ ...current, [blockId]: !current[blockId] }));
  };

  const onToolkitDragStart = (kind: TemplateBuilderBlockKind) => {
    setDraggingKind(kind);
  };

  const onToolkitDragEnd = () => {
    setDraggingKind(null);
    setDraggingBlockIndex(null);
    setDropIndex(null);
  };

  const beginDrag = (event: React.DragEvent<HTMLElement>, kind: TemplateBuilderBlockKind) => {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(BUILDER_BLOCK_KIND_MIME, kind);
    event.dataTransfer.setData('text/plain', kind);
    onToolkitDragStart(kind);
  };

  const beginBlockReorderDrag = (event: React.DragEvent<HTMLElement>, index: number) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(BUILDER_BLOCK_REORDER_MIME, String(index));
    setDraggingBlockIndex(index);
    setDropIndex(index);
    setPieMenu(null);
  };

  const moveBlockToIndex = (fromIndex: number, rawTargetIndex: number) => {
    if (fromIndex < 0 || fromIndex >= draft.builderBlocks.length) return;

    const next = [...draft.builderBlocks];
    const [item] = next.splice(fromIndex, 1);
    const targetIndex = fromIndex < rawTargetIndex ? rawTargetIndex - 1 : rawTargetIndex;
    next.splice(Math.max(0, Math.min(targetIndex, next.length)), 0, item);
    updateDraft({ builderBlocks: next });
  };

  const handleDropAtIndex = (event: React.DragEvent<HTMLElement>, index?: number) => {
    event.preventDefault();
    event.stopPropagation();
    const reorderIndexRaw = event.dataTransfer.getData(BUILDER_BLOCK_REORDER_MIME);
    if (reorderIndexRaw) {
      const fromIndex = Number(reorderIndexRaw);
      if (Number.isFinite(fromIndex) && index !== undefined) {
        moveBlockToIndex(fromIndex, index);
      }
      setDropIndex(null);
      setDraggingBlockIndex(null);
      setDraggingKind(null);
      return;
    }

    const kind = readDraggedKind(event) || draggingKind;
    if (kind) insertBlock(kind, index);
    setDropIndex(null);
    setDraggingKind(null);
    setDraggingBlockIndex(null);
  };

  const handleDragOverIndex = (event: React.DragEvent<HTMLElement>, index: number | null) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = draggingBlockIndex !== null ? 'move' : 'copy';
    setDropIndex(index);
  };

  const openPieMenu = (event: React.MouseEvent<HTMLElement>, insertIndex: number) => {
    event.preventDefault();
    event.stopPropagation();
    setBlockMenu(null);
    setPieSelection(null);
    setPieMenu({ x: event.clientX, y: event.clientY, insertIndex });
  };

  const openBlockMenu = (event: React.MouseEvent<HTMLElement>, blockId: string, index: number) => {
    event.preventDefault();
    event.stopPropagation();
    setPieMenu(null);
    setSelectedBlockId(blockId);
    setBlockMenu({ x: event.clientX, y: event.clientY, blockId, index });
  };

  React.useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!shellRef.current?.contains(event.target as Node)) {
        setPieMenu(null);
        setBlockMenu(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!shellRef.current?.contains(document.activeElement)) return;
      if (!selectedBlockId) return;

      const selectedIndex = draft.builderBlocks.findIndex(block => block.id === selectedBlockId);
      if (selectedIndex < 0) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicateBlock(selectedBlockId, selectedIndex);
      }

      if (event.key === 'Backspace' || event.key === 'Delete') {
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        event.preventDefault();
        removeBlock(selectedBlockId);
      }

      if (event.altKey && event.key === 'ArrowUp') {
        event.preventDefault();
        moveBlock(selectedIndex, selectedIndex - 1);
      }

      if (event.altKey && event.key === 'ArrowDown') {
        event.preventDefault();
        moveBlock(selectedIndex, selectedIndex + 1);
      }

      if (event.key === 'Escape') {
        setSelectedBlockId(null);
        setPieMenu(null);
        setPieSelection(null);
        setBlockMenu(null);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [draft.builderBlocks, duplicateBlock, selectedBlockId]);

  React.useEffect(() => {
    if (!pieMenu) return;

    const handleMouseMove = (event: MouseEvent) => {
      const dx = event.clientX - pieMenu.x;
      const dy = event.clientY - pieMenu.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 52) {
        setPieSelection(null);
        return;
      }

      let angle = Math.atan2(dx, -dy) * 180 / Math.PI;
      if (angle < 0) angle += 360;

      const angleSize = 360 / ACTIVE_TOOLKIT.length;
      const index = Math.floor(angle / angleSize);
      const item = ACTIVE_TOOLKIT[index];
      setPieSelection(item?.kind ?? null);
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (event.button !== 2) return;
      if (pieSelection) {
        insertBlock(pieSelection, pieMenu.insertIndex);
      }
      setPieSelection(null);
      setPieMenu(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [insertBlock, pieMenu, pieSelection]);

  const previewBlock = React.useMemo(() => {
    if (draggingBlockIndex !== null) {
      return draft.builderBlocks[draggingBlockIndex] ?? null;
    }

    if (draggingKind) {
      return {
        kind: draggingKind,
        label:
          draggingKind === 'input' ? 'input' :
          draggingKind === 'output' ? 'output' :
          draggingKind === 'toggle' ? 'toggle' :
          draggingKind === 'math' ? 'formula' :
          'text',
        content: draggingKind === 'text' ? '輸入教學說明...' : draggingKind === 'math' ? 'a^2 + b^2 = c^2' : '',
        placeholder: draggingKind === 'input' ? '使用此節點時會提供的值' : draggingKind === 'output' ? '此節點輸出的命名' : '',
      } as TemplateBuilderBlock;
    }

    return null;
  }, [draft.builderBlocks, draggingBlockIndex, draggingKind]);

  const renderToolkit = () => (
    <div className="builder-toolbar nodrag" onPointerDown={stopNodeDragPropagation} onMouseDown={stopNodeDragPropagation}>
      <div className="panel-title">Builder toolkit</div>
      <div className="builder-toolbar-items">
        {ACTIVE_TOOLKIT.map(item => (
          <div
            key={item.kind}
            className={`toolkit-item nodrag ${draggingKind === item.kind ? 'is-dragging' : ''}`}
            draggable
            onDragStart={(event) => beginDrag(event, item.kind)}
            onDragEnd={onToolkitDragEnd}
            onClick={() => insertBlock(item.kind)}
            onPointerDown={stopNodeDragPropagation}
            onMouseDown={stopNodeDragPropagation}
            title={item.hint}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                insertBlock(item.kind);
              }
            }}
          >
            <strong>{item.label}</strong>
            <span>{item.hint}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div ref={shellRef} className="node-maker-shell nodrag" onPointerDown={stopNodeDragPropagation} onMouseDown={stopNodeDragPropagation}>
      {showDetachedToolkit && renderToolkit()}
      <div className="maker-card nodrag" onPointerDown={stopNodeDragPropagation} onMouseDown={stopNodeDragPropagation}>
        <div className="maker-card-header">
          <div>
            <h3>Node Builder</h3>
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
          <div
            className="builder-canvas nodrag"
            onDragOver={(e) => handleDragOverIndex(e, draft.builderBlocks.length)}
            onDragEnter={(e) => handleDragOverIndex(e, draft.builderBlocks.length)}
            onDrop={(e) => handleDropAtIndex(e)}
            onDragLeave={() => setDropIndex(null)}
            onContextMenu={(e) => openPieMenu(e, draft.builderBlocks.length)}
            onPointerDown={stopNodeDragPropagation}
            onMouseDown={stopNodeDragPropagation}
          >
            <div className="panel-title">Template canvas</div>
            <div
              className={`builder-drop-zone nodrag ${dropIndex === 0 ? 'active' : ''}`}
              onDragEnter={(e) => handleDragOverIndex(e, 0)}
              onDragOver={(e) => handleDragOverIndex(e, 0)}
              onDrop={(e) => handleDropAtIndex(e, 0)}
              onContextMenu={(e) => openPieMenu(e, 0)}
            >
              {dropIndex === 0 && previewBlock && (
                <div className="builder-preview-card" style={{ '--block-accent': BLOCK_KIND_META[previewBlock.kind].color } as React.CSSProperties}>
                  <strong>{previewBlock.label}</strong>
                  <span>{previewBlock.content || previewBlock.placeholder || BLOCK_KIND_META[previewBlock.kind].summaryLabel}</span>
                </div>
              )}
            </div>
            {draft.builderBlocks.map((block, index) => (
              <React.Fragment key={block.id}>
                <div
                  className={`builder-block nodrag kind-${block.kind} ${selectedBlockId === block.id ? 'is-selected' : ''} ${draggingBlockIndex === index ? 'is-reordering' : ''} ${recentlyInsertedBlockId === block.id ? 'is-inserted' : ''}`}
                  style={{ '--block-accent': BLOCK_KIND_META[block.kind].color } as React.CSSProperties}
                  onPointerDown={(event) => {
                    stopNodeDragPropagation(event);
                    setSelectedBlockId(block.id);
                    setPieMenu(null);
                    setBlockMenu(null);
                  }}
                  onMouseDown={stopNodeDragPropagation}
                  onContextMenu={(event) => openBlockMenu(event, block.id, index)}
                >
                  <div className="builder-block-head">
                    <div className="builder-block-head-main">
                      <button
                        className="builder-drag-handle nodrag"
                        draggable
                        onDragStart={(event) => beginBlockReorderDrag(event, index)}
                        onDragEnd={onToolkitDragEnd}
                        onPointerDown={stopNodeDragPropagation}
                        onMouseDown={stopNodeDragPropagation}
                        title="Drag to reorder"
                      >
                        <Icons.Grid size={12} />
                      </button>
                      {(() => {
                        const IconComponent = Icons[BLOCK_KIND_META[block.kind].icon];
                        return <IconComponent size={14} />;
                      })()}
                      <span className="builder-chip">{block.kind}</span>
                    </div>
                    <div className="builder-block-actions">
                      <button
                        className="icon-btn-small nodrag"
                        onClick={() => toggleBlockCollapse(block.id)}
                        onPointerDown={stopNodeDragPropagation}
                        onMouseDown={stopNodeDragPropagation}
                        title={collapsedBlocks[block.id] ? 'Expand details' : 'Collapse details'}
                      >
                        <Icons.Collapse size={12} />
                      </button>
                      <button className="icon-btn-small nodrag" onClick={() => duplicateBlock(block.id, index)} onPointerDown={stopNodeDragPropagation} onMouseDown={stopNodeDragPropagation} title="Duplicate block">
                        <Icons.Append size={12} />
                      </button>
                      <button className="icon-btn-small nodrag" onClick={() => moveBlock(index, index - 1)} onPointerDown={stopNodeDragPropagation} onMouseDown={stopNodeDragPropagation} title="Move up">
                        <span style={{ fontSize: 12 }}>↑</span>
                      </button>
                      <button className="icon-btn-small nodrag" onClick={() => moveBlock(index, index + 1)} onPointerDown={stopNodeDragPropagation} onMouseDown={stopNodeDragPropagation} title="Move down">
                        <span style={{ fontSize: 12 }}>↓</span>
                      </button>
                      <button className="icon-btn-small nodrag" onClick={() => removeBlock(block.id)} onPointerDown={stopNodeDragPropagation} onMouseDown={stopNodeDragPropagation} title="Remove block">
                        <Icons.Clear />
                      </button>
                    </div>
                  </div>
                  <div className="builder-block-summary">
                    <strong>
                      {block.kind === 'text' ? 'Text' : (block.label || 'Untitled block')}
                    </strong>
                    <span>
                      {block.kind === 'input'
                        ? 'Shows as a left-side input handle on the community node.'
                        : block.kind === 'output'
                          ? 'Shows as a right-side output handle on the community node.'
                          : (block.content || BLOCK_KIND_META[block.kind].summaryLabel)}
                    </span>
                  </div>
                  {!collapsedBlocks[block.id] && (
                    <>
                      {block.kind !== 'text' && (
                        <label className="stack compact nodrag">
                          <span>Label</span>
                          <input className="nodrag" value={block.label} onChange={(e) => updateBlock(block.id, { label: e.target.value })} onPointerDown={stopNodeDragPropagation} onMouseDown={stopNodeDragPropagation} />
                        </label>
                      )}

                      {(block.kind === 'text' || block.kind === 'toggle' || block.kind === 'math') && (
                        <label className="stack compact nodrag">
                          <span>{block.kind === 'math' ? 'Formula' : 'Content'}</span>
                          <textarea className="nodrag" value={block.content || ''} onChange={(e) => updateBlock(block.id, { content: e.target.value })} onPointerDown={stopNodeDragPropagation} onMouseDown={stopNodeDragPropagation} />
                        </label>
                      )}

                      {(block.kind === 'input' || block.kind === 'output') && (
                        <>
                          <div className={`interface-note kind-${block.kind}`}>
                            <div className="interface-note-head">
                              <span className="builder-chip">{getInterfaceCopy(block.kind).badge}</span>
                              <strong>{getInterfaceCopy(block.kind).title}</strong>
                            </div>
                            <p>{getInterfaceCopy(block.kind).detail}</p>
                            <small>{getInterfaceCopy(block.kind).flow}</small>
                          </div>

                          <label className="stack compact nodrag">
                            <span>Description</span>
                            <input className="nodrag" value={block.placeholder || ''} onChange={(e) => updateBlock(block.id, { placeholder: e.target.value })} onPointerDown={stopNodeDragPropagation} onMouseDown={stopNodeDragPropagation} />
                          </label>
                        </>
                      )}
                    </>
                  )}
                </div>
                <div
                  className={`builder-drop-zone nodrag ${dropIndex === index + 1 ? 'active' : ''}`}
                  onDragEnter={(e) => handleDragOverIndex(e, index + 1)}
                  onDragOver={(e) => handleDragOverIndex(e, index + 1)}
                  onDrop={(e) => handleDropAtIndex(e, index + 1)}
                  onContextMenu={(e) => openPieMenu(e, index + 1)}
                >
                  {dropIndex === index + 1 && previewBlock && (
                    <div className="builder-preview-card" style={{ '--block-accent': BLOCK_KIND_META[previewBlock.kind].color } as React.CSSProperties}>
                      <strong>{previewBlock.label}</strong>
                      <span>{previewBlock.content || previewBlock.placeholder || BLOCK_KIND_META[previewBlock.kind].summaryLabel}</span>
                    </div>
                  )}
                </div>
              </React.Fragment>
            ))}

            {draft.builderBlocks.length === 0 && (
              <div className="canvas-empty">把左側元件拖進來，或直接點一下加入。</div>
            )}
          </div>
        </div>

        {!hidePublishAction && (
          <div className="maker-actions">
            <button
              className="new-workflow-btn nodrag"
              onClick={() => onPublish(packagedDraft)}
              disabled={Boolean(validationError)}
              title={validationError || publishLabel}
              onPointerDown={stopNodeDragPropagation}
              onMouseDown={stopNodeDragPropagation}
            >
              <Icons.Save /> {publishLabel}
            </button>
            <div className="maker-status">{validationError || status}</div>
          </div>
        )}

        {hidePublishAction && (validationError || status) && (
          <div className="maker-status">{validationError || status}</div>
        )}

        <div className="builder-footer-note">
          <strong>Template node lives on the main canvas.</strong>
          <p>右側 preview 已移除。真正可接線的模板節點會直接出現在主工作流畫布上，並隨這裡的草稿同步更新。</p>
        </div>
      </div>

      <style>{`
        .node-maker-shell {
          display: block;
        }
        .builder-toolbar {
          display: grid;
          gap: 10px;
          margin-bottom: 12px;
          padding: 12px;
          border: 1px solid var(--border-node);
          border-radius: 18px;
          background: rgba(255,255,255,0.03);
        }
        .builder-toolbar-items {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 8px;
        }
        .maker-card {
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
          display: block;
          margin: 14px 0;
        }
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
          gap: 6px;
        }
        .builder-drop-zone {
          position: relative;
          min-height: 24px;
          border-radius: 999px;
          transition: background 0.16s ease, transform 0.16s ease, opacity 0.16s ease;
          display: grid;
          align-items: center;
          justify-items: center;
          cursor: context-menu;
        }
        .builder-drop-zone::before {
          content: '';
          width: 100%;
          height: 1px;
          border-top: 1px dashed rgba(255,255,255,0.2);
          position: absolute;
          inset: 50% 0 auto 0;
          transform: translateY(-50%);
        }
        .builder-drop-zone::after {
          content: '+';
          position: relative;
          z-index: 1;
          width: 22px;
          height: 22px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          border: 1px solid var(--border-node);
          background: rgba(17, 24, 39, 0.78);
          color: var(--text-sub);
          font-weight: 700;
          font-size: 0.9rem;
          opacity: 0.72;
        }
        .builder-drop-zone.active {
          background: linear-gradient(90deg, rgba(79, 172, 254, 0.12), rgba(255,255,255,0.04), rgba(245, 158, 11, 0.12));
          transform: scaleY(1.02);
        }
        .builder-drop-zone.active::before {
          border-top-style: solid;
          border-top-color: var(--accent-bright);
        }
        .builder-drop-zone.active::after,
        .builder-drop-zone:hover::after {
          color: var(--accent-bright);
          border-color: color-mix(in srgb, var(--accent-bright) 65%, var(--border-node));
          opacity: 1;
        }
        .builder-preview-card {
          position: relative;
          z-index: 2;
          width: min(340px, calc(100% - 20px));
          justify-self: stretch;
          margin: 16px auto 8px;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid color-mix(in srgb, var(--block-accent) 60%, var(--border-node));
          background: color-mix(in srgb, var(--block-accent) 12%, rgba(255,255,255,0.06));
          box-shadow: 0 10px 25px rgba(0,0,0,0.16);
          opacity: 0.72;
          display: grid;
          gap: 4px;
          backdrop-filter: blur(8px);
        }
        .builder-preview-card strong {
          color: var(--text-main);
          font-size: 0.82rem;
        }
        .builder-preview-card span {
          color: var(--text-sub);
          font-size: 0.72rem;
          line-height: 1.4;
        }
        .builder-block,
        .live-node-block {
          border: 1px solid color-mix(in srgb, var(--block-accent) 45%, var(--border-node));
          border-radius: 16px;
          background: rgba(255,255,255,0.04);
          padding: 10px;
          display: grid;
          gap: 8px;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02);
        }
        .builder-block.is-selected {
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--block-accent) 65%, white 12%);
        }
        .builder-block.is-reordering {
          opacity: 0.45;
        }
        .builder-block.is-inserted {
          animation: builder-block-insert 0.72s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .interface-note {
          display: grid;
          gap: 6px;
          padding: 10px;
          border-radius: 12px;
          border: 1px dashed var(--border-node);
          background: rgba(255,255,255,0.02);
        }
        .interface-note-head {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .interface-note p,
        .interface-note small {
          margin: 0;
          color: var(--text-sub);
        }
        .builder-block-head {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          align-items: center;
        }
        .builder-block-head-main {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--block-accent);
        }
        .builder-drag-handle {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 8px;
          border: 1px solid var(--border-node);
          background: rgba(255,255,255,0.04);
          color: var(--text-sub);
          cursor: grab;
        }
        .builder-drag-handle:active {
          cursor: grabbing;
        }
        .builder-block-actions {
          display: flex;
          gap: 4px;
        }
        .builder-block-summary {
          display: grid;
          gap: 4px;
        }
        .builder-block-summary strong {
          color: var(--text-main);
          font-size: 0.9rem;
        }
        .builder-block-summary span {
          color: var(--text-sub);
          font-size: 0.76rem;
          line-height: 1.45;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        @keyframes builder-block-insert {
          0% {
            transform: translateY(10px) scale(0.985);
            opacity: 0.2;
            box-shadow: 0 0 0 0 color-mix(in srgb, var(--block-accent) 0%, transparent);
          }
          45% {
            transform: translateY(-2px) scale(1.01);
            opacity: 1;
            box-shadow: 0 0 0 8px color-mix(in srgb, var(--block-accent) 14%, transparent);
          }
          100% {
            transform: translateY(0) scale(1);
            opacity: 1;
            box-shadow: 0 0 0 0 color-mix(in srgb, var(--block-accent) 0%, transparent);
          }
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
        .maker-actions .new-workflow-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .builder-footer-note {
          display: grid;
          margin-top: 12px;
          padding: 12px 14px;
          gap: 4px;
          border: 1px dashed var(--border-node);
          border-radius: 14px;
          background: rgba(255,255,255,0.03);
        }
        .builder-footer-note strong,
        .builder-footer-note p {
          margin: 0;
        }
        .builder-footer-note p {
          color: var(--text-sub);
          font-size: 0.78rem;
        }
        [data-theme='light'] .maker-card {
          background: rgba(255,255,255,0.92);
        }
        [data-theme='light'] .builder-toolbar,
        [data-theme='light'] .builder-canvas,
        [data-theme='light'] .builder-block,
        [data-theme='light'] .builder-footer-note {
          background: rgba(14, 47, 11, 0.03);
        }
        [data-theme='light'] .toolkit-item,
        [data-theme='light'] .interface-note {
          background: rgba(255,255,255,0.76);
        }
        @media (max-width: 1100px) {
          .meta-grid,
          .two-col {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
      {pieMenu && createPortal(
        <>
          <div className="pie-menu-overlay" onClick={() => setPieMenu(null)} />
          <div className="pie-menu-container" style={{ left: pieMenu.x - 160, top: pieMenu.y - 160 }}>
            <svg className="pie-svg" viewBox="0 0 320 320">
              {(() => {
                const center = 160;
                const outer = 140;
                const inner = 58;
                const angleSize = 360 / ACTIVE_TOOLKIT.length;
                const polarToCartesian = (r: number, angle: number) => {
                  const rad = (angle - 90) * Math.PI / 180;
                  return { x: center + r * Math.cos(rad), y: center + r * Math.sin(rad) };
                };

                return ACTIVE_TOOLKIT.map((item, index) => {
                  const start = index * angleSize + 2;
                  const end = (index + 1) * angleSize - 2;
                  const sOut = polarToCartesian(outer, end);
                  const eOut = polarToCartesian(outer, start);
                  const sIn = polarToCartesian(inner, end);
                  const eIn = polarToCartesian(inner, start);
                  const d = ['M', sOut.x, sOut.y, 'A', outer, outer, 0, 0, 0, eOut.x, eOut.y, 'L', eIn.x, eIn.y, 'A', inner, inner, 0, 0, 1, sIn.x, sIn.y, 'Z'].join(' ');
                  const midAngle = (start + end) / 2;
                  const rad = (midAngle - 90) * Math.PI / 180;
                  const tx = center + Math.cos(rad) * 96;
                  const ty = center + Math.sin(rad) * 96;
                  const color =
                    item.kind === 'input' ? '#4facfe' :
                    item.kind === 'output' ? '#f59e0b' :
                    item.kind === 'math' ? '#10b981' :
                    item.kind === 'toggle' ? '#f472b6' :
                    '#a78bfa';
                  const isActive = pieSelection === item.kind;

                  return (
                    <g key={item.kind}>
                      <path
                        className={`pie-segment ${isActive ? 'active' : ''}`}
                        d={d}
                        style={{ '--item-color': color } as React.CSSProperties}
                        onClick={() => {
                          insertBlock(item.kind, pieMenu.insertIndex);
                          setPieMenu(null);
                        }}
                      />
                      <g className="pie-label-group" transform={`translate(${tx}, ${ty})`}>
                        <text className="pie-item-label" y="5" style={{ fill: 'var(--text-main)', opacity: isActive ? 1 : 0.78 }}>{item.label}</text>
                        <text className="pie-item-desc" y="20" style={{ fill: 'var(--text-main)', opacity: 0.45 }}>{item.hint}</text>
                      </g>
                    </g>
                  );
                });
              })()}
            </svg>
            <div className="pie-menu-center-v2" onClick={() => setPieMenu(null)}>+</div>
          </div>
        </>,
        document.body
      )}
      {blockMenu && createPortal(
        <div className="pane-context-menu" style={{ position: 'fixed', left: blockMenu.x, top: blockMenu.y, zIndex: 10001 }}>
          <div className="menu-header">Block actions</div>
          <div className="menu-item" onClick={() => { insertBlock(draft.builderBlocks[blockMenu.index].kind, blockMenu.index); setBlockMenu(null); }}>
            Insert same kind before
          </div>
          <div className="menu-item" onClick={() => { insertBlock(draft.builderBlocks[blockMenu.index].kind, blockMenu.index + 1); setBlockMenu(null); }}>
            Insert same kind after
          </div>
          <div className="menu-item" onClick={() => { duplicateBlock(blockMenu.blockId, blockMenu.index); setBlockMenu(null); }}>
            Duplicate block
          </div>
          <div className="menu-item" style={{ color: '#ff7855' }} onClick={() => { removeBlock(blockMenu.blockId); setBlockMenu(null); }}>
            Delete block
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
