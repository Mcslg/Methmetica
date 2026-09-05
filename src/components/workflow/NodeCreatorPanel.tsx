import React, { useState, useMemo, useRef, useCallback } from 'react';
import useStore, { type NodeData } from '../../store/useStore';
import { Icons } from '../Icons';
import { NodeFrame } from '../NodeFrame';
import { WorkflowUIComponentRenderer } from './NodeUIComponents';
import {
  deriveInterfaceFromNodes,
  type WorkflowUIComponentSpec
} from '../../types/workflowSpec';

interface NodeCreatorPanelProps {
  onNodeCreated?: () => void;
}

export const NodeCreatorPanel: React.FC<NodeCreatorPanelProps> = ({ onNodeCreated }) => {
  const nodes = useStore(state => state.nodes);

  // 取得 ProjectNode 的名稱與描述作為預設
  const projectNode = useMemo(() => nodes.find(n => n.type === 'projectNode'), [nodes]);
  const defaultTitle = projectNode?.data?.label || '自訂節點';
  const defaultDesc = projectNode?.data?.description || '';

  // 掃描畫布上目前的 Interface In / Out
  const { inputs, outputs } = useMemo(() => deriveInterfaceFromNodes(nodes), [nodes]);

  // 卡片內部的宣告式 UI 元件狀態
  const nextIdRef = useRef(1);
  const [uiComponents, setUiComponents] = useState<WorkflowUIComponentSpec[]>([]);
  const [componentValues, setComponentValues] = useState<Record<string, unknown>>({});
  const [isDragOverCard, setIsDragOverCard] = useState(false);

  // 新增 UI 元件
  const handleAddUIComponent = useCallback((type: 'slider' | 'latexInput' | 'svgPicture' | 'text') => {
    const id = `comp-${type}-${nextIdRef.current++}`;
    let newComp: WorkflowUIComponentSpec;

    if (type === 'slider') {
      const defaultBind = inputs[0]?.id || 'input_1';
      newComp = {
        type: 'slider',
        id,
        label: `數值控制 (${defaultBind})`,
        bindInput: defaultBind,
        min: 0,
        max: 50,
        step: 1,
        defaultValue: 10,
      };
    } else if (type === 'latexInput') {
      const defaultBind = inputs[0]?.id || 'input_1';
      newComp = {
        type: 'latexInput',
        id,
        label: `公式輸入 (${defaultBind})`,
        bindInput: defaultBind,
        defaultValue: 'x^2 + 1',
        placeholder: '輸入 LaTeX 數學式...',
      };
    } else if (type === 'svgPicture') {
      const defaultBind = outputs[0]?.id || 'output_1';
      newComp = {
        type: 'svgPicture',
        id,
        label: `圖表渲染 (${defaultBind})`,
        bindOutput: defaultBind,
        width: 240,
        height: 140,
      };
    } else {
      newComp = {
        type: 'text',
        id,
        content: '### 節點說明\n請在此處填寫本節點的用途與操作指引。',
        isMarkdown: true,
      };
    }

    setUiComponents(prev => [...prev, newComp]);
  }, [inputs, outputs]);

  // 移除 UI 元件
  const handleRemoveComponent = (compId: string) => {
    setUiComponents(prev => prev.filter(c => c.id !== compId));
  };

  // 移動順序
  const handleMoveComponent = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === uiComponents.length - 1)
    ) {
      return;
    }
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    const next = [...uiComponents];
    const [moved] = next.splice(index, 1);
    next.splice(targetIdx, 0, moved);
    setUiComponents(next);
  };

  // 處理元件拖入 Drop Zone
  const handleDropOnCard = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverCard(false);
    const compType = e.dataTransfer.getData('text/component-type');
    if (compType === 'slider' || compType === 'latexInput' || compType === 'svgPicture' || compType === 'text') {
      handleAddUIComponent(compType);
    }
  };

  // 預覽卡片的虛擬 NodeData
  const previewData: Partial<NodeData> = {
    label: defaultTitle,
    description: defaultDesc,
    handles: [
      ...inputs.map((p, idx) => ({
        id: p.id,
        type: 'input' as const,
        position: 'left' as const,
        offset: inputs.length === 1 ? 50 : Math.round(25 + (idx * 50) / (inputs.length - 1)),
        label: p.name,
      })),
      ...outputs.map((p, idx) => ({
        id: p.id,
        type: 'output' as const,
        position: 'right' as const,
        offset: outputs.length === 1 ? 50 : Math.round(25 + (idx * 50) / (outputs.length - 1)),
        label: p.name,
      })),
    ],
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        color: 'var(--text-main)',
        width: '100%',
      }}
    >
      {/* 標題與簡介 */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-bright)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Icons.Package style={{ width: 15, height: 15 }} />
            <span>自訂節點封裝器</span>
          </div>
          {onNodeCreated && (
            <button
              onClick={onNodeCreated}
              style={{
                background: 'transparent',
                border: '1px solid var(--border-node)',
                borderRadius: '6px',
                color: 'var(--text-sub)',
                fontSize: '11px',
                padding: '2px 8px',
                cursor: 'pointer',
              }}
              title="返回元件庫"
            >
              ← 返回元件庫
            </button>
          )}
        </div>
        <p style={{ fontSize: '11px', color: 'var(--text-sub)', margin: 0, lineHeight: 1.4 }}>
          將畫布上的邏輯打包為獨立節點。設定對外接口並客製化節點卡片元件。
        </p>
      </div>

      {/* 介面端點偵測狀態 */}
      <div
        style={{
          background: 'var(--bg-input, rgba(0, 0, 0, 0.05))',
          border: '1px solid var(--border-node)',
          borderRadius: '8px',
          padding: '10px 12px',
          fontSize: '11px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>已偵測對外接口</span>
          <span
            style={{
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '4px',
              background: inputs.length + outputs.length > 0 ? 'var(--accent-light, rgba(74, 222, 128, 0.15))' : 'var(--color-warning-bg, rgba(234, 179, 8, 0.15))',
              color: inputs.length + outputs.length > 0 ? 'var(--accent-bright, #4ade80)' : 'var(--color-warning, #facc15)',
              fontWeight: 600,
            }}
          >
            {inputs.length} 入 / {outputs.length} 出
          </span>
        </div>

        {inputs.length === 0 && outputs.length === 0 ? (
          <div style={{ color: 'var(--text-sub)', fontSize: '10.5px', lineHeight: 1.4 }}>
            💡 提示：請在「元件庫」分頁將「Interface In」或「Interface Out」拖入畫布拉線，即可自動形成此節點的連接端口。
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
            {inputs.map(inp => (
              <span
                key={inp.id}
                style={{
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: 'var(--bg-node)',
                  color: 'var(--accent-bright)',
                  fontSize: '10px',
                  border: '1px solid var(--border-input)',
                }}
              >
                ◀ {inp.name}
              </span>
            ))}
            {outputs.map(out => (
              <span
                key={out.id}
                style={{
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: 'var(--bg-node)',
                  color: 'var(--accent-bright)',
                  fontSize: '10px',
                  border: '1px solid var(--border-input)',
                }}
              >
                {out.name} ▶
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 卡片外觀 UI 元件庫 */}
      <div>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
          卡片外觀元件 (點擊或拖放加入卡片)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
          {[
            { type: 'slider' as const, label: '數值滑桿', icon: '🎚️', desc: '可拉動參數' },
            { type: 'latexInput' as const, label: '公式輸入', icon: '📐', desc: 'MathLive 輸入' },
            { type: 'svgPicture' as const, label: '向量圖形', icon: '🖼️', desc: 'SVG 即時渲染' },
            { type: 'text' as const, label: '文字說明', icon: '📝', desc: '註解與標籤' },
          ].map(comp => (
            <div
              key={comp.type}
              draggable
              onDragStart={e => {
                e.dataTransfer.setData('text/component-type', comp.type);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => handleAddUIComponent(comp.type)}
              style={{
                background: 'var(--bg-input, rgba(0, 0, 0, 0.05))',
                border: '1px solid var(--border-node)',
                borderRadius: '6px',
                padding: '8px',
                cursor: 'grab',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--accent-bright)';
                e.currentTarget.style.background = 'var(--accent-light)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border-node)';
                e.currentTarget.style.background = 'var(--bg-input, rgba(0, 0, 0, 0.05))';
              }}
              title="點擊或拖入下方卡片"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 600, color: 'var(--text-main)' }}>
                <span>{comp.icon}</span>
                <span>{comp.label}</span>
              </div>
              <div style={{ fontSize: '9.5px', color: 'var(--text-sub)' }}>{comp.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 卡片即時預覽與 Drop Zone */}
      <div>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
          節點卡片外觀預覽 (Drop Zone)
        </div>
        <div
          onDragOver={e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            setIsDragOverCard(true);
          }}
          onDragLeave={() => setIsDragOverCard(false)}
          onDrop={handleDropOnCard}
          style={{
            border: isDragOverCard ? '2px dashed var(--accent-bright)' : '1px solid var(--border-node)',
            borderRadius: '8px',
            background: isDragOverCard ? 'var(--accent-light)' : 'var(--bg-input, rgba(0, 0, 0, 0.03))',
            padding: '10px 6px',
            transition: 'all 0.2s',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <div style={{ width: '100%', maxWidth: '280px', pointerEvents: 'auto' }}>
            <NodeFrame
              id="preview-custom-node"
              data={previewData}
              selected={false}
              icon={<Icons.Package />}
              defaultLabel={defaultTitle}
              minWidth={240}
              minHeight={140}
              contentStyle={{ padding: '8px' }}
              headerExtras={
                <span
                  style={{
                    fontSize: '10px',
                    color: 'var(--text-sub)',
                    border: '1px solid var(--border-node)',
                    borderRadius: '4px',
                    padding: '1px 4px',
                  }}
                >
                  開啟
                </span>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {defaultDesc && (
                  <div style={{ fontSize: '10px', color: 'var(--text-sub)', fontStyle: 'italic' }}>
                    {defaultDesc}
                  </div>
                )}

                {uiComponents.length === 0 ? (
                  <div
                    style={{
                      border: '1px dashed var(--border-node)',
                      borderRadius: '6px',
                      padding: '16px 8px',
                      textAlign: 'center',
                      fontSize: '10.5px',
                      color: 'var(--text-sub)',
                    }}
                  >
                    拖曳或點選上方元件加入卡片
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {uiComponents.map((spec, idx) => (
                      <div
                        key={spec.id}
                        style={{
                          position: 'relative',
                          border: '1px solid var(--border-node)',
                          borderRadius: '6px',
                          padding: '6px 8px',
                          background: 'var(--bg-node)',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: '4px',
                            marginBottom: '4px',
                          }}
                        >
                          <button
                            onClick={() => handleMoveComponent(idx, 'up')}
                            disabled={idx === 0}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: idx === 0 ? 'var(--border-input)' : 'var(--text-sub)',
                              cursor: idx === 0 ? 'default' : 'pointer',
                              fontSize: '10px',
                              padding: '0 2px',
                            }}
                            title="向上移"
                          >
                            ▲
                          </button>
                          <button
                            onClick={() => handleMoveComponent(idx, 'down')}
                            disabled={idx === uiComponents.length - 1}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: idx === uiComponents.length - 1 ? 'var(--border-input)' : 'var(--text-sub)',
                              cursor: idx === uiComponents.length - 1 ? 'default' : 'pointer',
                              fontSize: '10px',
                              padding: '0 2px',
                            }}
                            title="向下移"
                          >
                            ▼
                          </button>
                          <button
                            onClick={() => handleRemoveComponent(spec.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--color-danger, #ef4444)',
                              cursor: 'pointer',
                              fontSize: '10px',
                              padding: '0 2px',
                            }}
                            title="刪除"
                          >
                            ✕
                          </button>
                        </div>
                        <WorkflowUIComponentRenderer
                          spec={spec}
                          values={componentValues}
                          onValueChange={(k: string, v: unknown) => setComponentValues(prev => ({ ...prev, [k]: v }))}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </NodeFrame>
          </div>
        </div>
      </div>

      {/* 底部說明：防止自我引用，提示於其他工作流透過右鍵使用 */}
      <div style={{
        marginTop: '6px',
        padding: '10px 12px',
        borderRadius: '8px',
        background: 'var(--ai-bg, rgba(74, 222, 128, 0.08))',
        border: '1px solid var(--ai-border, rgba(74, 222, 128, 0.2))',
        fontSize: '11px',
        color: 'var(--text-sub)',
        lineHeight: 1.5
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-bright)', fontWeight: 600, marginBottom: '3px' }}>
          <Icons.Check style={{ width: 14, height: 14 }} />
          <span>節點規格已就緒</span>
        </div>
        本工作流設定之介面端點與卡片外觀會隨存檔自動保存。為避免循環依賴，此自訂節點可在「其他工作流」中透過右鍵選單檢索並放置使用。
      </div>
    </div>
  );
};
