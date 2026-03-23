import { NodeResizer, type NodeProps, type Node } from '@xyflow/react';
import useStore, { type AppState, type AppNode, type NodeData } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';
import { Icons } from '../components/Icons';

export function RangeNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);

    const inputs = (data.rangeDef || '0..10').split('..');
    const start = inputs[0] || '0';
    const end = inputs[1] || '10';

    const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        updateNodeData(id, { rangeDef: `${e.target.value}..${end}` });
    };

    const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        updateNodeData(id, { rangeDef: `${start}..${e.target.value}` });
    };

    return (
        <div 
            className="math-node range-node"
            style={{
                minWidth: '150px',
            }}
        >
            <NodeResizer minWidth={150} minHeight={40} isVisible={selected} lineStyle={{ border: 'none' }} handleStyle={{ width: 8, height: 8, borderRadius: '50%', background: 'transparent', border: 'none' }} />
            
            <div className="node-header">
                <span><Icons.Range /> Range</span>
            </div>

            <div style={{ padding: '8px 12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input 
                    type="text" 
                    value={start} 
                    onChange={handleStartChange}
                    className="nodrag"
                    style={{ width: '40px', background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)', fontSize: '0.8rem', textAlign: 'center', borderRadius: '4px', fontFamily: 'inherit', outline: 'none', padding: '2px 4px' }}
                />
                <span style={{ color: '#888', fontSize: '0.8rem' }}>..</span>
                <input 
                    type="text" 
                    value={end} 
                    onChange={handleEndChange}
                    className="nodrag"
                    style={{ width: '40px', background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)', fontSize: '0.8rem', textAlign: 'center', borderRadius: '4px', fontFamily: 'inherit', outline: 'none', padding: '2px 4px' }}
                />
            </div>

            <DynamicHandles 
                nodeId={id} 
                handles={data.handles} 
                allowedTypes={['output', 'trigger-out']} 
                touchingEdges={data.touchingEdges}
            />
        </div>
    );
}

export const executeRangeNode = (node: AppNode, state: AppState): void => {
    const inputs = (node.data.rangeDef || '0..10').split('..');
    const start = parseInt(inputs[0] || '0');
    const end = parseInt(inputs[1] || '10');
    const range = [];
    // Safety cap to prevent browser hang
    const count = Math.min(Math.abs(end - start) + 1, 1000);
    const step = start <= end ? 1 : -1;
    for (let i = 0; i < count; i++) {
        range.push(start + (i * step));
    }
    const res = JSON.stringify(range);

    state.updateNodeData(node.id, { value: res });
    node.data.handles?.filter(h => h.type === 'trigger-out').forEach(h => state.triggerNode(node.id, h.id));
    state.evaluateGraph();
};
