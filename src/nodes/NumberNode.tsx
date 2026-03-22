import { useEffect, useRef } from 'react';
import { type NodeProps, type Node, NodeResizer } from '@xyflow/react';
import useStore, { type AppState, type NodeData } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';
import { Icons } from '../components/Icons';
import 'mathlive';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'math-field': any;
    }
  }
}

export function NumberNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
  const updateNodeData = useStore((state: AppState) => state.updateNodeData);
  const mfRef = useRef<any>(null);

  useEffect(() => {
    const mf = mfRef.current;
    if (!mf) return;

    // Prevent update loops
    if (mf.value !== data.value && data.value !== undefined) {
      mf.value = data.value;
    }

    const handleInput = (e: any) => {
      updateNodeData(id, { value: e.target.value });
    };

    mf.addEventListener('input', handleInput);
    return () => mf.removeEventListener('input', handleInput);
  }, [id, data.value, updateNodeData]);

  const touchingClasses = data.touchingEdges
    ? Object.entries(data.touchingEdges)
      .filter(([_, touching]) => touching)
      .map(([edge]) => `edge-touch-${edge}`)
      .join(' ')
    : '';

  return (
    <div className={`math-node number-node ${touchingClasses}`} style={{ width: '100%', height: '100%' }}>
      <NodeResizer minWidth={100} minHeight={60} isVisible={selected} lineStyle={{ border: 'none' }} handleStyle={{ width: 8, height: 8, borderRadius: '50%', background: '#ff7eb3' }} />
      <DynamicHandles
        nodeId={id}
        handles={data.handles}
        allowedTypes={['input', 'output', 'trigger-out']}
        touchingEdges={data.touchingEdges}
        customDescriptions={{
          'trigger-out': '當傳入的數值更新時同步發出電流'
        }}
      />
      <div className="node-header"><Icons.Number /> Data</div>
      <div className="node-content math-input-container">
        {/* @ts-ignore */}
        <math-field
          ref={mfRef}
          class="nodrag"
          style={{ fontSize: '1.2rem', minWidth: '80px', padding: '5px', color: 'var(--text-main)' }}
        >
          {data.value || ''}
          {/* @ts-ignore */}
        </math-field>
      </div>
    </div>
  );
}
