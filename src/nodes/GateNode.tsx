import { type NodeProps, type Node, NodeResizer } from '@xyflow/react';
import { type NodeData } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';
import { Icons } from '../components/Icons';

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
                border: isOpen ? '1px solid rgba(74, 222, 128, 0.4)' : '1px solid var(--border-node)',
                boxShadow: isOpen ? '0 0 15px rgba(74, 222, 128, 0.1)' : 'none'
            }}
        >
            <NodeResizer isVisible={selected} minWidth={100} minHeight={32} />
            
            <div className="node-header" style={{ color: isOpen ? 'var(--accent-bright)' : 'var(--text-sub)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Icons.Gate />
                    <span>Gate</span>
                </div>
                <div style={{ 
                    fontSize: '0.55rem', 
                    background: isOpen ? 'var(--accent)' : 'var(--bg-input)',
                    color: isOpen ? '#fff' : 'inherit',
                    padding: '2px 6px',
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
