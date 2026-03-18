import { NodeResizer } from '@xyflow/react';
import useStore from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';

export const ButtonNode = ({ id, data, selected }: any) => {
    const triggerNode = useStore(state => state.triggerNode);
    const implicitEdges = useStore(state => state.implicitEdges);

    const handlePush = () => {
        // 1. Explicit trigger handles
        const outHandle = data.handles?.find((h: any) => h.type === 'trigger-out');
        if (outHandle) {
            triggerNode(id, outHandle.id);
        }

        // 2. Implicit triggers (snapped neighbors on the right/bottom)
        implicitEdges
            .filter(e => e.source === id)
            .forEach(e => {
                const neighborId = e.target;
                // We use executeNode directly for reactive-like execution
                useStore.getState().executeNode(neighborId);
            });
    };

    const touchingClasses = data.touchingEdges
        ? Object.entries(data.touchingEdges)
            .filter(([_, touching]) => touching)
            .map(([edge]) => `edge-touch-${edge}`)
            .join(' ')
        : '';

    return (
        <div 
            className={`math-node button-node ${touchingClasses}`}
            style={{
                width: '100%',
                height: '100%',
                overflow: 'visible',
                display: 'flex',
                flexDirection: 'column',
                boxSizing: 'border-box',
                background: 'rgba(255, 204, 0, 0.05)',
                border: '1px solid #ffcc00',
                borderRadius: '8px',
                padding: '0',
                boxShadow: '0 4px 12px rgba(255, 204, 0, 0.08)'
            }}
        >
            <NodeResizer minWidth={80} minHeight={40} isVisible={selected} lineStyle={{ border: 'none' }} handleStyle={{ width: 8, height: 8, borderRadius: '50%', background: '#ffcc00' }} />

            <div className="node-header" style={{ 
                padding: '2px 8px', 
                fontSize: '0.6rem', 
                background: 'rgba(255, 204, 0, 0.15)',
                borderBottom: 'none',
                color: '#ffcc00',
                fontWeight: 'bold',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '26px'
            }}>
                <button 
                    onClick={handlePush}
                    className="nodrag"
                    style={{
                        background: '#ffcc00',
                        border: 'none',
                        color: '#000',
                        fontWeight: 'bold',
                        padding: '2px 10px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.65rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                        transition: 'transform 0.1s'
                    }}
                    onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.92)'; }}
                    onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                >
                    <span style={{ fontSize: '0.8rem' }}>⚡</span>
                    EXEC
                </button>
            </div>

            <DynamicHandles 
                nodeId={id} 
                handles={data.handles} 
                allowedTypes={['trigger-out']} 
                touchingEdges={data.touchingEdges}
            />
            
            <style>{`
                .button-node:hover { box-shadow: 0 6px 20px rgba(255, 204, 0, 0.2); }
                .button-node button:hover { filter: brightness(1.1); }
            `}</style>
        </div>
    );
};
