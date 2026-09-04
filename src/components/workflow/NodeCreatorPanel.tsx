import React, { useState, useMemo } from 'react';
import useStore from '../../store/useStore';
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

export const NodeCreatorPanel: React.FC<NodeCreatorPanelProps> = () => {
  const nodes = useStore(state => state.nodes);

  // 取得 ProjectNode 的名稱與描述作為預設
  const projectNode = useMemo(() => nodes.find(n => n.type === 'projectNode'), [nodes]);
  const defaultTitle = projectNode?.data?.label || '自訂節點';
  const defaultDesc = projectNode?.data?.description || '';

  // 掃描畫布上目前的 Interface In / Out
  const { inputs, outputs } = useMemo(() => deriveInterfaceFromNodes(nodes), [nodes]);

  // 卡片內部的宣告式 UI 元件狀態
  const [uiComponents, setUiComponents] = useState<WorkflowUIComponentSpec[]>([]);
  const [componentValues, setComponentValues] = useState<Record<string, any>>({});
  const [isDragOverCard, setIsDragOverCard] = useState(false);

  // 新增 UI 元件
  const handleAddUIComponent = (type: 'slider' | 'latexInput' | 'svgPicture' | 'text') => {
    const id = `comp-${type}-${Date.now()}`;
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
        label: '公式輸入',
        bindInput: defaultBind,
        defaultValue: 'x^2',
      };
    } else if (type === 'svgPicture') {
      const defaultBind = outputs[0]?.id || 'output_1';
      newComp = {
        type: 'svgPicture',
        id,
        label: '幾何圖形預覽',
        bindOutput: defaultBind,
        height: 120,
      };
    } else {
      newComp = {
        type: 'text',
        id,
        content: '在此填寫節點的簡短使用說明與備註。',
        isMarkdown: false,
      };
    }

    setUiComponents(prev => [...prev, newComp]);
  };

  // 移除 UI 元件
  const handleRemoveComponent = (id: string) => {
    setUiComponents(prev => prev.filter(c => c.id !== id));
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
    const compType = e.dataTransfer.getData('text/component-type') as any;
    if (['slider', 'latexInput', 'svgPicture', 'text'].includes(compType)) {
      handleAddUIComponent(compType);
    }
  };

  // 預覽卡片的虛擬 NodeData
  const previewData: any = {
    label: defaultTitle,
    description: defaultDesc,
    handles: [
      ...inputs.map((p, idx) => ({
        id: p.id,
        type: 'input',
        position: 'left',
        offset: inputs.length === 1 ? 50 : Math.round(25 + (idx * 50) / (inputs.length - 1)),
        label: p.name,
      })),
      ...outputs.map((p, idx) => ({
        id: p.id,
        type: 'output',
        position: 'right',
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
        color: '#f8fafc',
        width: '100%',
      }}
    >
      {/* 標題與簡介 */}
      <div>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Icons.Package style={{ width: 15, height: 15 }} />
          <span>自訂節點封裝器</span>
        </div>
        <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0, lineHeight: 1.4 }}>
          將畫布上的邏輯打包為獨立節點。設定對外接口並客製化節點卡片元件。
        </p>
      </div>

      {/* 介面端點偵測狀態 */}
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid var(--border-node)',
          borderRadius: '8px',
          padding: '10px 12px',
          fontSize: '11px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontWeight: 600, color: '#cbd5e1' }}>已偵測對外接口</span>
          <span
            style={{
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '4px',
              background: inputs.length + outputs.length > 0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(234, 179, 8, 0.15)',
              color: inputs.length + outputs.length > 0 ? '#4ade80' : '#facc15',
              fontWeight: 600,
            }}
          >
            {inputs.length} 入 / {outputs.length} 出
          </span>
        </div>

        {inputs.length === 0 && outputs.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: '10.5px', lineHeight: 1.4 }}>
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
                  background: '#1e293b',
                  color: '#38bdf8',
                  fontSize: '10px',
                  border: '1px solid #334155',
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
                  background: '#1e293b',
                  color: '#a855f7',
                  fontSize: '10px',
                  border: '1px solid #334155',
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
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
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
                background: 'rgba(15, 23, 42, 0.6)',
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
                e.currentTarget.style.borderColor = '#38bdf8';
                e.currentTarget.style.background = '#1e293b';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border-node)';
                e.currentTarget.style.background = 'rgba(15, 23, 42, 0.6)';
              }}
              title="點擊或拖入下方卡片"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 600, color: '#e2e8f0' }}>
                <span>{comp.icon}</span>
                <span>{comp.label}</span>
              </div>
              <div style={{ fontSize: '9.5px', color: '#64748b' }}>{comp.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 卡片即時預覽與 Drop Zone */}
      <div>
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
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
            border: isDragOverCard ? '2px dashed #38bdf8' : '1px solid var(--border-node)',
            borderRadius: '8px',
            background: isDragOverCard ? 'rgba(56, 189, 248, 0.05)' : 'rgba(15, 23, 42, 0.4)',
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
                    color: '#94a3b8',
                    border: '1px solid rgba(255,255,255,0.1)',
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
                  <div style={{ fontSize: '10px', color: '#94a3b8', fontStyle: 'italic' }}>
                    {defaultDesc}
                  </div>
                )}

                {uiComponents.length === 0 ? (
                  <div
                    style={{
                      border: '1px dashed #334155',
                      borderRadius: '6px',
                      padding: '16px 8px',
                      textAlign: 'center',
                      fontSize: '10.5px',
                      color: '#64748b',
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
                          border: '1px solid #1e293b',
                          borderRadius: '6px',
                          padding: '6px 8px',
                          background: '#131e36',
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
                              color: idx === 0 ? '#475569' : '#94a3b8',
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
                              color: idx === uiComponents.length - 1 ? '#475569' : '#94a3b8',
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
                              color: '#ef4444',
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
                          onValueChange={(k: string, v: any) => setComponentValues(prev => ({ ...prev, [k]: v }))}
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
        background: 'rgba(56, 189, 248, 0.08)',
        border: '1px solid rgba(56, 189, 248, 0.2)',
        fontSize: '11px',
        color: '#94a3b8',
        lineHeight: 1.5
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#38bdf8', fontWeight: 600, marginBottom: '3px' }}>
          <Icons.Check style={{ width: 14, height: 14 }} />
          <span>節點規格已就緒</span>
        </div>
        本工作流設定之介面端點與卡片外觀會隨存檔自動保存。為避免循環依賴，此自訂節點可在「其他工作流」中透過右鍵選單檢索並放置使用。
      </div>
    </div>
  );
};
