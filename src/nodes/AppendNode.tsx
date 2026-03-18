import { NodeResizer, type NodeProps, type Node } from '@xyflow/react';
import useStore, { type NodeData, appendNodeHandles, insertNodeHandles } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';

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
                background: isAttached ? 'rgba(67, 233, 123, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                border: isAttached ? '1px solid #43e97b' : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
            }}
        >
            <NodeResizer isVisible={selected} minWidth={160} minHeight={32} />
            
            <div className="node-header" style={{ 
                padding: '4px 10px', 
                fontSize: '0.65rem', 
                background: isAttached ? 'rgba(67, 233, 123, 0.12)' : 'rgba(255, 255, 255, 0.05)',
                color: isAttached ? '#43e97b' : '#888',
                fontWeight: 'bold',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                minHeight: '28px',
                borderRadius: '8px 8px 0 0'
            }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button 
                        onClick={toggleMode}
                        style={{
                            background: 'rgba(255,255,255,0.1)',
                            border: 'none',
                            color: 'inherit',
                            fontSize: '0.6rem',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                        }}
                    >
                        {isInsert ? 'Mode: Insert' : 'Mode: Append'}
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
