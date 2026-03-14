import { type NodeProps, type Node } from '@xyflow/react';
import useStore, { type NodeData, type AppState } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';

export function AddNode({ id, data }: NodeProps<Node<NodeData>>) {
    const executeNode = useStore((state: AppState) => state.executeNode);

    return (
        <div className="math-node op-node">
            <DynamicHandles nodeId={id} handles={data.handles} />
            <div className="node-header">
                Add
                <button
                    onClick={() => executeNode(id)}
                    style={{ float: 'right', cursor: 'pointer', background: '#333', border: 'none', color: '#fff', borderRadius: '2px', padding: '2px 5px', fontSize: '8px' }}
                >
                    EXEC
                </button>
            </div>
            <div className="node-content">
                <span style={{ fontSize: '1.2rem', color: '#00f2fe' }}>{data.value !== undefined ? data.value : '?'}</span>
            </div>
        </div>
    );
}
