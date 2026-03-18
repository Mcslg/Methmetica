import { type NodeProps, type Node, NodeResizer } from '@xyflow/react';
import { type NodeData } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';

export function GateNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    // We check if the gate is "open" based on the data.value (which is updated by evaluateGraph)
    const val = Number(data.value || 0);
    const isOpen = val !== 0;

    return (
        <div 
            className={`math-node gate-node ${isOpen ? 'open' : 'closed'}`}
            style={{
                minWidth: '120px',
                padding: '0',
                background: isOpen ? 'rgba(79, 172, 254, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                border: isOpen ? '1px solid #4facfe' : '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: isOpen ? '0 0 15px rgba(79, 172, 254, 0.2)' : 'none'
            }}
        >
            <NodeResizer isVisible={selected} minWidth={100} minHeight={32} />
            
            <div className="node-header" style={{ 
                padding: '4px 10px', 
                fontSize: '0.65rem', 
                color: isOpen ? '#4facfe' : '#888',
                fontWeight: 'bold',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                minHeight: '28px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.8rem' }}>{isOpen ? '🔓' : '🔒'}</span>
                    <span>GATE</span>
                </div>
                <div style={{ 
                    fontSize: '0.6rem', 
                    background: isOpen ? 'rgba(79, 172, 254, 0.2)' : 'rgba(0,0,0,0.2)',
                    padding: '1px 6px',
                    borderRadius: '4px'
                }}>
                    {isOpen ? 'PASS' : 'BLOCK'}
                </div>
            </div>

            <DynamicHandles 
                nodeId={id} 
                handles={data.handles} 
                allowedTypes={['input', 'trigger-in', 'trigger-out']} 
                touchingEdges={data.touchingEdges}
            />
        </div>
    );
}
