import { memo, useEffect, useMemo } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import useStore, { type AppState, type NodeData, type CustomHandle } from '../../store/useStore';
import { NodeFrame } from '../../components/NodeFrame';
import { Icons } from '../../components/Icons';
import type { WorkflowPortSpec } from '../../types/workflowSpec';

export const DummyNode = memo(function DummyNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
  const updateNodeData = useStore((state: AppState) => state.updateNodeData);

  const label = data.label || '佔位節點 (Dummy)';
  const description = data.description || 'AI 生成之抽象節點，尚未實作內部邏輯。';
  
  // 取得預期的輸入與輸出合約
  const rawData = data as unknown as Record<string, unknown>;
  const expectedInputs: WorkflowPortSpec[] = useMemo(() => (rawData.expectedInputs as WorkflowPortSpec[] | undefined) || [
    { id: 'in', name: 'in', dataType: 'any' }
  ], [rawData]);
  const expectedOutputs: WorkflowPortSpec[] = useMemo(() => (rawData.expectedOutputs as WorkflowPortSpec[] | undefined) || [
    { id: 'out', name: 'out', dataType: 'any' }
  ], [rawData]);

  // 動態同步 handles 到 data.handles，以便 NodeFrame 和 DynamicHandles 渲染
  useEffect(() => {
    const computedHandles: CustomHandle[] = [];

    expectedInputs.forEach((p, idx) => {
      const offset = expectedInputs.length === 1 ? 50 : Math.round(25 + (idx * 50) / (expectedInputs.length - 1));
      computedHandles.push({
        id: p.id,
        type: 'input',
        position: 'left',
        offset,
        label: p.name,
      });
    });

    expectedOutputs.forEach((p, idx) => {
      const offset = expectedOutputs.length === 1 ? 50 : Math.round(25 + (idx * 50) / (expectedOutputs.length - 1));
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
    if (currentHandlesStr !== computedHandlesStr) {
      updateNodeData(id, { handles: computedHandles });
    }
  }, [id, data.handles, expectedInputs, expectedOutputs, updateNodeData]);

  const handleGenerate = () => {
    const event = new CustomEvent('ai-implement-dummy-node', {
      detail: {
        nodeId: id,
        label,
        description,
        inputs: expectedInputs,
        outputs: expectedOutputs,
      }
    });
    window.dispatchEvent(event);
  };

  return (
    <NodeFrame
      id={id}
      data={data}
      selected={selected}
      icon={<Icons.Code />}
      defaultLabel={label}
      className="dummy-placeholder-node"
      minWidth={220}
      minHeight={150}
      headerExtras={
        <span
          style={{
            background: 'rgba(236, 72, 153, 0.2)',
            color: '#f472b6',
            fontSize: '9px',
            padding: '2px 5px',
            borderRadius: '4px',
            fontWeight: 600,
          }}
        >
          待實作
        </span>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '6px 4px' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-sub, #94a3b8)', lineHeight: '1.4' }}>
          {description}
        </div>

        <button
          onClick={handleGenerate}
          style={{
            width: '100%',
            background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            padding: '7px 10px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            boxShadow: '0 2px 8px rgba(236, 72, 153, 0.3)',
            marginTop: '4px',
            transition: 'opacity 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          <span>✨</span>
          <span>由 AI 實作此節點</span>
        </button>
      </div>
    </NodeFrame>
  );
});
