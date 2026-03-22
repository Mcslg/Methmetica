import { NodeResizer, type NodeProps, type Node } from '@xyflow/react';
import useStore, { type AppState, type NodeData } from '../store/useStore';
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
                padding: '0',
                border: '1px solid rgba(74, 222, 128, 0.25)',
            }}
        >
            <NodeResizer isVisible={selected} minWidth={150} minHeight={40} />
            
            <div className="node-header" style={{ color: 'var(--accent-bright)' }}>
                <span style={{ display: 'flex', alignItems: 'center' }}><Icons.Range /> Range</span>
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
