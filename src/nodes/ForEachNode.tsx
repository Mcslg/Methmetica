import { NodeResizer, type NodeProps, type Node } from '@xyflow/react';
import useStore, { type AppState, type NodeData } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';

export function ForEachNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    const nodes = useStore((state: AppState) => state.nodes);
    const implicitEdges = useStore((state: AppState) => state.implicitEdges);

    const targetNode = nodes.find(n => 
        implicitEdges.some(e => e.source === id && e.target === n.id)
    );
    const isAttached = !!targetNode;

    return (
        <div 
            className={`math-node for-each-node ${isAttached ? 'attached' : 'detached'}`}
            style={{
                width: '100%',
                height: '100%',
                overflow: 'visible',
                display: 'flex',
                flexDirection: 'column',
                boxSizing: 'border-box',
                padding: '0',
                background: isAttached ? 'rgba(108, 92, 231, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                border: isAttached ? '1px solid #6c5ce7' : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
            }}
        >
            <NodeResizer isVisible={selected} minWidth={150} minHeight={40} />
            
            <div className="node-header" style={{ 
                padding: '4px 10px', 
                fontSize: '0.65rem', 
                background: isAttached ? 'rgba(108, 92, 231, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                color: isAttached ? '#a29bfe' : '#888',
                fontWeight: 'bold',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                minHeight: '28px'
            }}>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span>⚡ FOR EACH</span>
                </div>
                {isAttached && <span style={{ fontSize: '0.5rem', opacity: 0.6 }}>LINKED</span>}
            </div>

            <div style={{ padding: '8px 12px', flexGrow: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: '0.7rem', color: '#fff', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {data.status || 'Ready / Standby'}
                </div>
                {isAttached && targetNode && (
                    <div style={{ fontSize: '0.6rem', color: '#888' }}>
                        Target: {targetNode.type?.replace('Node', '').toUpperCase()}
                    </div>
                )}
            </div>

            <DynamicHandles 
                nodeId={id} 
                handles={data.handles} 
                allowedTypes={['input', 'trigger-in', 'trigger-out']} 
                touchingEdges={data.touchingEdges}
            />
            
            <style>{`
                .for-each-node.attached { box-shadow: 0 0 15px rgba(108, 92, 231, 0.2); }
                .for-each-node.detached { border-style: dashed; }
            `}</style>
        </div>
    );
}
