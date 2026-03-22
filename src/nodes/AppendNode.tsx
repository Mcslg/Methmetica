import { NodeResizer, type NodeProps, type Node } from '@xyflow/react';
import useStore, { type NodeData, appendNodeHandles, insertNodeHandles } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';
import { Icons } from '../components/Icons';

export const AppendNode = ({ id, data, selected }: NodeProps<Node<NodeData>>) => {
    const nodes = useStore(state => state.nodes);
    const implicitEdges = useStore(state => state.implicitEdges);
    const updateNodeData = useStore(state => state.updateNodeData);

    const isInsert = data.variant === 'insert';

    // Find the neighbor TextNode we are attached to (output target)
    const getTargetTextNode = () => {
        const neighborIds = implicitEdges
            .filter(e => e.source === id)
            .map(e => e.target);
            
        return nodes.find(n => neighborIds.includes(n.id) && n.type === 'textNode');
    };

    const target = getTargetTextNode();
    const isAttached = !!target;

    const toggleMode = () => {
        const nextVariant = isInsert ? undefined : 'insert';
        const nextHandles = isInsert ? appendNodeHandles : insertNodeHandles;
        updateNodeData(id, { variant: nextVariant as any, handles: nextHandles });
    };

    return (
        <div 
            className={`math-node append-node ${isAttached ? 'attached' : 'detached'}`}
            style={{
                width: '100%',
                height: '100%',
                overflow: 'visible',
                display: 'flex',
                flexDirection: 'column',
                boxSizing: 'border-box',
                padding: '0',
                background: isAttached ? 'var(--bg-node)' : 'var(--bg-input)',
                border: isAttached ? '1px solid var(--accent-bright)' : '1px solid var(--border-node)',
                borderRadius: '12px',
            }}
        >
            <NodeResizer isVisible={selected} minWidth={160} minHeight={32} />
            
            <div className="node-header" style={{ 
                color: isAttached ? 'var(--accent-bright)' : 'var(--text-sub)',
            }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <Icons.Append />
                    <button 
                        onClick={toggleMode}
                        className="variant-toggle"
                        style={{
                            padding: '2px 6px',
                            cursor: 'pointer',
                        }}
                    >
                        {isInsert ? 'Insert' : 'Append'}
                    </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.5rem', opacity: 0.8 }}>{isAttached ? 'CONNECTED' : 'STANDBY'}</span>
                    <span>{isAttached ? '●' : '○'}</span>
                </div>
            </div>

            <DynamicHandles 
                nodeId={id} 
                handles={data.handles} 
                allowedTypes={['input', 'trigger-in']} 
                touchingEdges={data.touchingEdges}
            />

            <style>{`
                .append-node.attached { box-shadow: 0 0 15px rgba(67, 233, 123, 0.15); }
                .append-node.detached { border-style: dashed; }
            `}</style>
        </div>
    );
};
