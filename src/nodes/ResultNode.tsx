import { type NodeProps, type Node } from '@xyflow/react';
import { type NodeData } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';

export function ResultNode({ id, data }: NodeProps<Node<NodeData>>) {
    return (
        <div className="math-node result-node">
            <DynamicHandles nodeId={id} handles={data.handles} />
            <div className="node-header">Result</div>
            <div className="node-content">
                <div className="result-value">
                    {data.value !== undefined ? String(data.value) : '--'}
                </div>
            </div>
        </div>
    );
}
