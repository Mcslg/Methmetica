import { useState } from 'react';
import { NodeResizer } from '@xyflow/react';
import useStore, { type AppState } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';
import { Icons } from '../components/Icons';

export const ButtonNode = ({ id, data, selected, className }: any) => {
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    const [isEditing, setIsEditing] = useState(false);

    const handlePush = () => {
        // Explicitly connected nodes
        useStore.getState().edges
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
            className={`math-node button-node ${touchingClasses} ${className || ''}`}
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

            <div className="node-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexGrow: 1, padding: '12px' }}>
                {isEditing ? (
                    <input
                        autoFocus
                        className="nodrag"
                        title="Rename button"
                        style={{
                            background: 'rgba(255, 204, 0, 0.1)',
                            border: '1px solid rgba(255, 204, 0, 0.5)',
                            color: 'var(--accent-bright)',
                            fontSize: '0.8rem',
                            fontWeight: '800',
                            width: `${Math.max((data.label || 'EXEC').length, 3) + 2}ch`,
                            minWidth: '50px',
                            padding: '4px 8px',
                            borderRadius: '8px',
                            outline: 'none',
                            cursor: 'text',
                            textAlign: 'center'
                        }}
                        value={data.label || 'EXEC'}
                        onChange={(e) => updateNodeData(id, { label: e.target.value })}
                        onBlur={(e) => {
                            setIsEditing(false);
                            if (e.target.value === '') updateNodeData(id, { label: 'EXEC' });
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') setIsEditing(false);
                            e.stopPropagation();
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                    />
                ) : (
                    <button 
                        onClick={(e) => {
                            if (e.shiftKey) {
                                setIsEditing(true);
                            } else {
                                handlePush();
                            }
                        }}
                        title="Click to run | Shift+Click to rename"
                        className="nodrag"
                        style={{
                            background: '#ffcc00',
                            border: 'none',
                            color: '#000',
                            fontWeight: '800',
                            padding: '6px 16px',
                            borderRadius: '20px',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 4px 12px rgba(255, 204, 0, 0.3)',
                            transition: 'all 0.1s',
                            fontFamily: 'inherit',
                            width: '100%',
                            justifyContent: 'center'
                        }}
                        onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
                        onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                    >
                        <Icons.Trigger />
                        {data.label || 'EXEC'}
                    </button>
                )}
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
