import React from 'react';
import useStore, { type AppState } from '../store/useStore';
import { Icons } from './Icons';

interface CommentAreaProps {
    containerId: string;
    commentSid: string; // The ID of the textNode stored in slots.comment
}

export const CommentArea: React.FC<CommentAreaProps> = ({ containerId, commentSid }) => {
    const textNode = useStore((state: AppState) => state.nodes.find(n => n.id === commentSid));
    const handleEject = useStore((state: AppState) => state.handleEject);
    const isCtrlPressed = useStore((state: AppState) => state.isCtrlPressed);

    if (!textNode) return null;

    // Extract a plain text preview or just use the raw text if it's small
    let previewText = textNode.data.text || '';
    // Strip KaTeX delimiters for the simple preview if needed, or just show it
    const cleanText = previewText.replace(/^\$\$/, '').replace(/\$\$$/, '').substring(0, 100);

    const onPointerDown = (e: React.PointerEvent) => {
        if (isCtrlPressed) {
            e.stopPropagation();
            const startX = e.clientX;
            const startY = e.clientY;
            
            const onPointerUp = (upE: PointerEvent) => {
                window.removeEventListener('pointerup', onPointerUp);
                const dx = upE.clientX - startX;
                const dy = upE.clientY - startY;
                if (Math.sqrt(dx * dx + dy * dy) > 5) {
                    handleEject(containerId, 'comment', { x: upE.clientX, y: upE.clientY });
                }
            };
            window.addEventListener('pointerup', onPointerUp, { once: true });
        }
    };

    return (
        <div 
            className="nodrag comment-area"
            onPointerDown={onPointerDown}
            title="Comment | Ctrl+Drag to eject"
            style={{
                background: 'rgba(255,255,255,0.03)',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                padding: '6px 10px',
                fontSize: '0.75rem',
                color: 'var(--text-sub)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                minHeight: '24px',
                cursor: isCtrlPressed ? 'grab' : 'default',
                userSelect: 'none',
                transition: 'background 0.2s'
            }}
        >
            <Icons.Text width={12} height={12} style={{ marginTop: '2px', opacity: 0.5, flexShrink: 0 }} />
            <div style={{ 
                flexGrow: 1, 
                fontStyle: 'italic', 
                lineHeight: 1.4,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                wordBreak: 'break-word'
            }}>
                {cleanText || <span style={{ opacity: 0.3 }}>Empty comment</span>}
                {previewText.length > 100 && '...'}
            </div>
        </div>
    );
};
