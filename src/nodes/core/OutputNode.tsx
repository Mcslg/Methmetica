import React, { memo, useEffect } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import useStore, { type AppState, type NodeData, type CustomHandle } from '../../store/useStore';
import { NodeFrame } from '../../components/NodeFrame';
import { Icons } from '../../components/Icons';
import type { WorkflowPortDataType } from '../../types/workflowSpec';

const DATA_TYPES: WorkflowPortDataType[] = [
  'real', 'integer', 'boolean', 'string', 'matrix', 'vector', 'latex', 'svg', 'any'
];

export const OutputNode = memo(function OutputNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
  const updateNodeData = useStore((state: AppState) => state.updateNodeData);

  const portName = data.nodeName || data.label || 'output_1';
  const dataType = (data.variant as WorkflowPortDataType) || 'real';
  const displayValue = data.value ?? (data.input !== undefined ? data.input : '(等待連線輸入...)');

  // 確保 handles 遵循專案規範初始化（左側 input）
  useEffect(() => {
    if (!data.handles || data.handles.length === 0) {
      const initialHandles: CustomHandle[] = [
        { id: 'in', type: 'input', position: 'left', offset: 50, label: portName }
      ];
      updateNodeData(id, { handles: initialHandles });
    }
  }, [id, data.handles, portName, updateNodeData]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextName = e.target.value;
    const nextHandles: CustomHandle[] = (data.handles || []).map(h =>
      h.type === 'input' ? { ...h, label: nextName } : h
    );
    updateNodeData(id, {
      nodeName: nextName,
      label: nextName,
      handles: nextHandles.length > 0 ? nextHandles : [{ id: 'in', type: 'input', position: 'left', offset: 50, label: nextName }]
    });
  };

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateNodeData(id, { variant: e.target.value as any });
  };

  return (
    <NodeFrame
      id={id}
      data={data}
      selected={selected}
      icon={<Icons.Result />}
      defaultLabel={portName || 'Interface Out'}
      className="output-interface-node"
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
            輸出名稱 (Port Name)
          </label>
          <input
            type="text"
            value={portName}
            onChange={handleNameChange}
            placeholder="例如: area, result"
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
            即時結果 (Output Value)
          </label>
          <div
            style={{
              width: '100%',
              background: 'var(--bg-input, rgba(0, 0, 0, 0.3))',
              border: '1px solid var(--border-input, rgba(255, 255, 255, 0.1))',
              borderRadius: '4px',
              color: '#f59e0b',
              padding: '5px 8px',
              fontSize: '12px',
              minHeight: '26px',
              display: 'flex',
              alignItems: 'center',
              wordBreak: 'break-all',
              fontFamily: 'monospace',
              fontWeight: 600,
              boxSizing: 'border-box',
            }}
          >
            {typeof displayValue === 'object' ? JSON.stringify(displayValue) : String(displayValue)}
          </div>
        </div>
      </div>
    </NodeFrame>
  );
});
