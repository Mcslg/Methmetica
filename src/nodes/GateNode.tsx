import { type NodeProps, type Node, NodeResizer } from '@xyflow/react';
import { type AppState, type AppNode, type NodeData } from '../store/useStore';
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
            <NodeResizer minWidth={120} minHeight={110} isVisible={selected} lineStyle={{ border: 'none' }} handleStyle={{ width: 8, height: 8, borderRadius: '50%', background: 'transparent', border: 'none' }} />
            
            <div className="node-header" style={{ color: isOpen ? 'var(--accent-bright)' : 'var(--text-sub)' }}>
                <span>
                    <Icons.Gate />
                    Gate
                </span>
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

export const executeGateNode = (node: AppNode, state: AppState): void => {
    const val = Number(node.data.value || 0);
    if (val !== 0) {
        // Fire all trigger-out handles
        node.data.handles?.filter(h => h.type === 'trigger-out').forEach(h => state.triggerNode(node.id, h.id));
    }
};
