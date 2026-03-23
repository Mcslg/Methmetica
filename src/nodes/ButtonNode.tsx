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
                border: '1px solid var(--border-node)',
                borderRadius: '16px',
                boxShadow: 'var(--node-shadow)'
            }}
        >
            <NodeResizer minWidth={80} minHeight={40} isVisible={selected} lineStyle={{ border: 'none' }} handleStyle={{ width: 8, height: 8, borderRadius: '50%', background: 'transparent', border: 'none' }} />

            <div className="node-header">
                <span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M13 10V2L4 14h7v8l9-12h-7z" />
                    </svg>
                </span>
                <button 
                    onClick={handlePush}
                    className="nodrag"
                    style={{
                        background: '#ffcc00',
                        border: 'none',
                        color: '#000',
                        fontWeight: '800',
                        padding: '4px 12px',
                        borderRadius: '20px',
                        cursor: 'pointer',
                        fontSize: '0.7rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 8px rgba(255, 204, 0, 0.3)',
                        transition: 'all 0.1s',
                        fontFamily: 'inherit'
                    }}
                    onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.94)'; }}
                    onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                    </svg>
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
