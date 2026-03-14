import { type NodeProps, type Node } from '@xyflow/react';
import useStore, { type AppState, type NodeData } from '../store/useStore';

import { DynamicHandles } from './DynamicHandles';

export function NumberNode({ id, data }: NodeProps<Node<NodeData>>) {
  const updateNodeData = useStore((state: AppState) => state.updateNodeData);

  const onChange = (evt: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(evt.target.value);
    updateNodeData(id, { value: isNaN(val) ? 0 : val });
  };

  return (
    <div className="math-node number-node">
      <DynamicHandles nodeId={id} handles={data.handles} />
      <div className="node-header">Number</div>
      <div className="node-content">
        <input
          type="number"
          value={data.value as number || 0}
          onChange={onChange}
          className="nodrag"
        />
      </div>
    </div>
  );
}
