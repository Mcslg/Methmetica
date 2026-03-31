import React from 'react';
import { useReactFlow } from '@xyflow/react';
import useStore, { type AppState } from '../store/useStore';
import { Icons } from './Icons';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface ResultAreaProps {
    containerId: string;
    targetSid: string; 
}

export const ResultArea: React.FC<ResultAreaProps> = ({ containerId, targetSid: _targetSid }) => {
    const parentNode = useStore((state: AppState) => state.nodes.find(n => n.id === containerId));
    const handleEject = useStore((state: AppState) => state.handleEject);
    const isCtrlPressed = useStore((state: AppState) => state.isCtrlPressed);
    const setDraggingEjectPos = useStore((state: AppState) => state.setDraggingEjectPos);
    const { screenToFlowPosition } = useReactFlow();
    
    if (!parentNode) return null;

    const resultValue = parentNode.data.value || '0';

    const onPointerDown = (e: React.PointerEvent) => {
        if (isCtrlPressed) {
            e.stopPropagation();
            const startX = e.clientX;
            const startY = e.clientY;
            
            const onPointerMove = (moveE: PointerEvent) => {
                const dx = moveE.clientX - startX;
                const dy = moveE.clientY - startY;
                if (Math.sqrt(dx * dx + dy * dy) > 5) {
                    setDraggingEjectPos({ startX, startY, curX: moveE.clientX, curY: moveE.clientY });
                }
            };
            
            const onPointerUp = (upE: PointerEvent) => {
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);
                setDraggingEjectPos(null); 
                
                const dx = upE.clientX - startX;
                const dy = upE.clientY - startY;
                if (Math.sqrt(dx * dx + dy * dy) > 5) {
                    const flowPos = screenToFlowPosition({ x: upE.clientX, y: upE.clientY });
                    handleEject(containerId, 'resultText', flowPos);
                }
            };
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp, { once: true });
        }
    };

    return (
        <div 
            className="nodrag result-area"
            onPointerDown={onPointerDown}
            style={{
                position: 'absolute',
                left: 'calc(100% + 12px)',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'var(--bg-node)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(79, 172, 254, 0.4)',
                borderRadius: '12px',
                padding: '8px 14px',
                color: 'var(--text-main)',
                fontSize: '0.85rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                whiteSpace: 'nowrap',
                boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
                cursor: isCtrlPressed ? 'grab' : 'default',
                animation: 'result-slide-in 0.3s ease-out',
                zIndex: 10
            }}
            title="Result Display Area | Ctrl+Drag to eject"
        >
            <Icons.Text width={12} height={12} style={{ color: '#4facfe', opacity: 0.8 }} />
            <span style={{ opacity: 0.6, fontSize: '0.7rem', letterSpacing: '0.05em', marginRight: '4px' }}>RESULT:</span>
            <div 
                className="result-katex"
                dangerouslySetInnerHTML={{ __html: katex.renderToString(String(resultValue), { throwOnError: false }) }}
                style={{ 
                    color: 'var(--accent-bright)', 
                    fontSize: '1.2rem',
                    lineHeight: 1,
                    display: 'flex',
                    alignItems: 'center'
                }}
            />

            <style>{`
                @keyframes result-slide-in {
                    from { opacity: 0; transform: translateY(-50%) translateX(-10px); }
                    to { opacity: 1; transform: translateY(-50%) translateX(0); }
                }
                .result-area::before {
                    content: "";
                    position: absolute;
                    left: -12px;
                    top: 50%;
                    transform: translateY(-50%);
                    border-top: 6px solid transparent;
                    border-bottom: 6px solid transparent;
                    border-right: 6px solid rgba(79, 172, 254, 0.4);
                }
            `}</style>
        </div>
    );
};
