import { NodeResizer, type NodeProps, type Node } from '@xyflow/react';
import useStore, { type AppState, type NodeData } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';

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
                background: 'rgba(67, 233, 123, 0.05)',
                border: '1px solid rgba(67, 233, 123, 0.3)',
                borderRadius: '8px',
                transition: 'all 0.3s ease'
            }}
        >
            <NodeResizer isVisible={selected} minWidth={150} minHeight={40} />
            
            <div className="node-header" style={{ 
                padding: '4px 10px', 
                fontSize: '0.65rem', 
                background: 'rgba(67, 233, 123, 0.1)',
                color: '#43e97b',
                fontWeight: 'bold',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                minHeight: '28px'
            }}>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span>{'{n}'}</span>
                    <span>RANGE</span>
                </div>
            </div>

            <div style={{ padding: '8px 12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input 
                    type="text" 
                    value={start} 
                    onChange={handleStartChange}
                    className="nodrag"
                    style={{ width: '40px', background: 'rgba(0,0,0,0.2)', border: '1px solid #333', color: '#fff', fontSize: '0.8rem', textAlign: 'center', borderRadius: '4px' }}
                />
                <span style={{ color: '#888', fontSize: '0.8rem' }}>..</span>
                <input 
                    type="text" 
                    value={end} 
                    onChange={handleEndChange}
                    className="nodrag"
                    style={{ width: '40px', background: 'rgba(0,0,0,0.2)', border: '1px solid #333', color: '#fff', fontSize: '0.8rem', textAlign: 'center', borderRadius: '4px' }}
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
