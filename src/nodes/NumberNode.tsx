import { memo } from 'react';
import { type NodeProps, type Node, NodeResizer } from '@xyflow/react';
import useStore, { type NodeData } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';
import { Icons } from '../components/Icons';
import { MathInput } from '../components/MathInput';

export const NumberNode = memo(function NumberNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
  const updateNodeData = useStore.getState().updateNodeData;


  const touchingClasses = data.touchingEdges
    ? Object.entries(data.touchingEdges)
      .filter(([_, touching]) => touching)
      .map(([edge]) => `edge-touch-${edge}`)
      .join(' ')
    : '';

  return (
    <div className={`math-node number-node ${touchingClasses}`} style={{ width: '100%', height: '100%' }}>
      <NodeResizer minWidth={100} minHeight={60} isVisible={selected} lineStyle={{ border: 'none' }} handleStyle={{ width: 8, height: 8, borderRadius: '50%', background: 'transparent', border: 'none' }} />
      <DynamicHandles
        nodeId={id}
        handles={data.handles}
        allowedTypes={['input', 'output']}
        touchingEdges={data.touchingEdges}
      />
      <div className="node-header"><span><Icons.Number /> Data</span></div>
      <div className="node-content math-input-container">
        <MathInput
          value={data.value || ''}
          onChange={(val) => updateNodeData(id, { value: val })}
          className="nodrag"
          style={{ fontSize: '1.2rem', minWidth: '80px', padding: '5px', color: 'var(--text-main)' }}
        />
      </div>
    </div>
  );
});

