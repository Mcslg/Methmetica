import { type NodeProps, type Node } from '@xyflow/react';
import { type NodeData } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';

export function ResultNode({ id, data }: NodeProps<Node<NodeData>>) {
    const touchingClasses = data.touchingEdges
        ? Object.entries(data.touchingEdges)
            .filter(([_, touching]) => touching)
            .map(([edge]) => `edge-touch-${edge}`)
            .join(' ')
        : '';

    return (
        <div className={`math-node result-node ${touchingClasses}`}>
            <DynamicHandles
                nodeId={id}
                handles={data.handles}
                allowedTypes={['input', 'output', 'trigger-out']}
                touchingEdges={data.touchingEdges}
            />
            <div className="node-header">Result</div>
            <div className="node-content">
                <div className="result-value">
                    {data.value !== undefined ? String(data.value) : '--'}
                </div>
            </div>
        </div>
    );
}
