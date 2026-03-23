import { NodeResizer } from '@xyflow/react';
import useStore from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';
import { Icons } from '../components/Icons';

export const ButtonNode = ({ id, data, selected }: any) => {
    const implicitEdges = useStore(state => state.implicitEdges);

    const handlePush = () => {
        // Explicitly connected nodes
        useStore.getState().edges
            .filter(e => e.source === id)
            .forEach(e => {
                useStore.getState().executeNode(e.target);
            });

        // Implicit triggers (snapped neighbors on the right/bottom)
        implicitEdges
            .filter(e => e.source === id)
            .forEach(e => {
                useStore.getState().executeNode(e.target);
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
                    <Icons.Trigger />
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
                    <Icons.Trigger />
                    EXEC
                </button>
            </div>

            <DynamicHandles 
                nodeId={id} 
                handles={data.handles} 
                allowedTypes={[]} 
                touchingEdges={data.touchingEdges}
            />
            
            <style>{`
                .button-node:hover { box-shadow: 0 6px 20px rgba(255, 204, 0, 0.2); }
                .button-node button:hover { filter: brightness(1.1); }
            `}</style>
        </div>
    );
};
