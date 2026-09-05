import React, { memo, useEffect } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
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
  const incomingInput = data.input ?? data.inputs?.in ?? (data.inputs ? Object.values(data.inputs)[0] : undefined);
  const displayValue = data.value ?? (incomingInput !== undefined ? incomingInput : '(等待連線輸入...)');

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
    updateNodeData(id, { variant: e.target.value as NodeData['variant'] });
  };

  const renderDisplayValue = () => {
    if (typeof displayValue === 'object') {
      return JSON.stringify(displayValue);
    }
    const str = String(displayValue);
    if (str === '(等待連線輸入...)') {
      return <span style={{ color: 'var(--text-sub, #94a3b8)', fontStyle: 'italic', fontFamily: 'inherit' }}>{str}</span>;
    }
    const isLatex = dataType === 'latex' || str.includes('\\') || /[\^_]/.test(str);
    if (isLatex) {
      try {
        const clean = str.startsWith('$$') && str.endsWith('$$') ? str.slice(2, -2) : (str.startsWith('$') && str.endsWith('$') ? str.slice(1, -1) : str);
        const html = katex.renderToString(clean.trim(), { throwOnError: false, displayMode: false });
        return <span dangerouslySetInnerHTML={{ __html: html }} />;
      } catch {
        return str;
      }
    }
    return str;
  };

  return (
    <NodeFrame
      id={id}
      data={data}
      selected={selected}
      icon={<Icons.Result />}
      defaultLabel={portName || '端點輸出'}
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
            端點名稱 (Port Name)
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
            即時運算結果
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
            {renderDisplayValue()}
          </div>
        </div>
      </div>
    </NodeFrame>
  );
});
