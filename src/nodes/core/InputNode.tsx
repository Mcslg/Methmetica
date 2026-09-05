import React, { memo, useEffect } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import useStore, { type AppState, type NodeData, type CustomHandle } from '../../store/useStore';
import { NodeFrame } from '../../components/NodeFrame';
import { Icons } from '../../components/Icons';
import type { WorkflowPortDataType } from '../../types/workflowSpec';

const DATA_TYPES: WorkflowPortDataType[] = [
  'real', 'integer', 'boolean', 'string', 'matrix', 'vector', 'latex', 'svg', 'any'
];

export const InputNode = memo(function InputNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
  const updateNodeData = useStore((state: AppState) => state.updateNodeData);
  const evaluateGraph = useStore((state: AppState) => state.evaluateGraph);

  const portName = data.nodeName || data.label || 'input_1';
  const dataType = (data.variant as WorkflowPortDataType) || 'real';
  const defaultValue = data.value ?? '';

  // 確保 handles 遵循專案規範初始化
  useEffect(() => {
    if (!data.handles || data.handles.length === 0) {
      const initialHandles: CustomHandle[] = [
        { id: 'out', type: 'output', position: 'right', offset: 50, label: portName }
      ];
      updateNodeData(id, { handles: initialHandles });
    }
  }, [id, data.handles, portName, updateNodeData]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextName = e.target.value;
    const nextHandles: CustomHandle[] = (data.handles || []).map(h => 
      h.type === 'output' ? { ...h, label: nextName } : h
    );
    updateNodeData(id, { 
      nodeName: nextName, 
      label: nextName,
      handles: nextHandles.length > 0 ? nextHandles : [{ id: 'out', type: 'output', position: 'right', offset: 50, label: nextName }]
    });
  };

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateNodeData(id, { variant: e.target.value as NodeData['variant'] });
  };

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = e.target.value;
    updateNodeData(id, { value: nextVal });
    evaluateGraph();
  };

  return (
    <NodeFrame
      id={id}
      data={data}
      selected={selected}
      icon={<Icons.Trigger />}
      defaultLabel={portName || 'Interface In'}
      className="input-interface-node"
      minWidth={200}
      minHeight={130}
      headerExtras={
        <select
          value={dataType}
          onChange={handleTypeChange}
          style={{
            background: 'var(--bg-input, rgba(0, 0, 0, 0.3))',
            border: '1px solid var(--border-input, rgba(255, 255, 255, 0.15))',
            color: 'var(--text-sub, #94a3b8)',
            borderRadius: '4px',
            fontSize: '10px',
            padding: '1px 4px',
            cursor: 'pointer',
          }}
        >
          {DATA_TYPES.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '6px 4px' }}>
        <div>
          <label style={{ fontSize: '10px', color: 'var(--text-sub, #94a3b8)', display: 'block', marginBottom: '3px' }}>
            變數名稱 (Port Name)
          </label>
          <input
            type="text"
            value={portName}
            onChange={handleNameChange}
            placeholder="例如: radius, x"
            style={{
              width: '100%',
              background: 'var(--bg-input, rgba(0, 0, 0, 0.2))',
              border: '1px solid var(--border-input, rgba(255, 255, 255, 0.15))',
              borderRadius: '4px',
              color: 'var(--text-main, #fff)',
              padding: '5px 8px',
              fontSize: '12px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div>
          <label style={{ fontSize: '10px', color: 'var(--text-sub, #94a3b8)', display: 'block', marginBottom: '3px' }}>
            輸入數值 (Value)
          </label>
          <input
            type="text"
            value={defaultValue}
            onChange={handleValueChange}
            placeholder="例如: 5, [1, 2]"
            style={{
              width: '100%',
              background: 'var(--bg-input, rgba(0, 0, 0, 0.2))',
              border: '1px solid var(--border-input, rgba(255, 255, 255, 0.15))',
              borderRadius: '4px',
              color: 'var(--accent, #38bdf8)',
              fontWeight: 600,
              padding: '5px 8px',
              fontSize: '12px',
              fontFamily: 'monospace',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>
    </NodeFrame>
  );
});
