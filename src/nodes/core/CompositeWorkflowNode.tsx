import React, { memo, useState, useMemo, useEffect } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import useStore, { type AppState, type NodeData, type CustomHandle } from '../../store/useStore';
import { NodeFrame } from '../../components/NodeFrame';
import { Icons } from '../../components/Icons';
import { WorkflowUIComponentRenderer } from '../../components/workflow/NodeUIComponents';
import type { WorkflowSpec } from '../../types/workflowSpec';

export const CompositeWorkflowNode = memo(function CompositeWorkflowNode({
  id,
  data,
  selected,
}: NodeProps<Node<NodeData>>) {
  const updateNodeData = useStore((state: AppState) => state.updateNodeData);
  const evaluateGraph = useStore((state: AppState) => state.evaluateGraph);

  // 取得封裝的工作流規格
  const workflowSpec = (data as any).workflowSpec as WorkflowSpec | undefined;
  const label = workflowSpec?.name || data.label || '複合工作流節點';
  const description = workflowSpec?.description || data.description || '';

  const inputs = useMemo(() => workflowSpec?.inputs || [], [workflowSpec]);
  const outputs = useMemo(() => workflowSpec?.outputs || [], [workflowSpec]);
  const uiSpecs = useMemo(() => workflowSpec?.ui || [], [workflowSpec]);

  // 動態同步 handles 到 data.handles，以便 NodeFrame 和 DynamicHandles 渲染
  useEffect(() => {
    const computedHandles: CustomHandle[] = [];

    inputs.forEach((p, idx) => {
      const offset = inputs.length === 1 ? 50 : Math.round(20 + (idx * 60) / (inputs.length - 1));
      computedHandles.push({
        id: p.id,
        type: 'input',
        position: 'left',
        offset,
        label: p.name,
      });
    });

    outputs.forEach((p, idx) => {
      const offset = outputs.length === 1 ? 50 : Math.round(20 + (idx * 60) / (outputs.length - 1));
      computedHandles.push({
        id: p.id,
        type: 'output',
        position: 'right',
        offset,
        label: p.name,
      });
    });

    const currentHandlesStr = JSON.stringify(data.handles || []);
    const computedHandlesStr = JSON.stringify(computedHandles);
    if (currentHandlesStr !== computedHandlesStr && computedHandles.length > 0) {
      updateNodeData(id, { handles: computedHandles });
    }
  }, [id, data.handles, inputs, outputs, updateNodeData]);

  // 元件狀態管理（雙向連動）
  const [componentValues, setComponentValues] = useState<Record<string, any>>(() => {
    const initial: Record<string, any> = { ...data.inputs, ...data.outputs };
    inputs.forEach(p => {
      if (initial[p.id] === undefined && p.defaultValue !== undefined) {
        initial[p.id] = p.defaultValue;
      }
    });
    return initial;
  });

  const handleComponentValueChange = (bindKey: string, nextValue: any) => {
    const nextValues = { ...componentValues, [bindKey]: nextValue };
    setComponentValues(nextValues);

    // 同步到節點 inputs 並觸發求值
    const currentInputs = { ...(data.inputs || {}), [bindKey]: String(nextValue) };
    updateNodeData(id, { inputs: currentInputs });
    evaluateGraph();
  };

  // 在新頁面開啟內部工作流
  const handleOpenInNewPage = (e: React.MouseEvent) => {
    e.stopPropagation();
    const targetWorkflowId = (data as any).workflowSpec?.id || (data as any).subgraphId;
    if (targetWorkflowId) {
      window.open(`/?subgraph=${targetWorkflowId}`, '_blank');
    } else {
      window.dispatchEvent(
        new CustomEvent('open-subgraph-new-page', {
          detail: { nodeId: id, workflowSpec }
        })
      );
    }
  };

  return (
    <NodeFrame
      id={id}
      data={data}
      selected={selected}
      icon={<Icons.Package />}
      defaultLabel={label}
      className="composite-workflow-node"
      minWidth={250}
      minHeight={160}
      headerExtras={
        <button
          className="exec-button community-template-action-btn community-template-open-btn"
          onClick={handleOpenInNewPage}
          title="開啟內部工作流"
        >
          開啟
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '6px 4px' }}>
        {description && (
          <div style={{ fontSize: '11px', color: 'var(--text-sub, #94a3b8)', lineHeight: 1.3 }}>
            {description}
          </div>
        )}

        {/* 渲染宣告式 UI 元件卡片 */}
        {uiSpecs.length > 0 && (
          <div
            className="nodrag"
            style={{
              background: 'rgba(0, 0, 0, 0.2)',
              border: '1px solid var(--border-input, rgba(255, 255, 255, 0.08))',
              borderRadius: '6px',
              padding: '8px',
            }}
          >
            {uiSpecs.map((spec) => (
              <WorkflowUIComponentRenderer
                key={spec.id}
                spec={spec}
                values={componentValues}
                onValueChange={handleComponentValueChange}
              />
            ))}
          </div>
        )}
      </div>
    </NodeFrame>
  );
});
