import React, { useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import useStore, { type AppState } from '../store/useStore';
import { Icons } from './Icons';

interface CommentAreaProps {
    containerId: string;
    commentSid: string; 
}

// 從 Tiptap JSON 提取純文字
const getTextFromJSON = (jsonStr: string): string => {
    try {
        const obj = JSON.parse(jsonStr);
        if (obj.type === 'doc') {
            const extract = (node: any): string => {
                if (node.type === 'text') return node.text || '';
                if (node.type === 'paragraph') return node.content ? node.content.map(extract).join('') + '\n' : '\n';
                if (node.content) return node.content.map(extract).join('');
                return '';
            };
            return extract(obj).trim();
        }
        return jsonStr; 
    } catch {
        return jsonStr; // 避免已經是純文字的情況
    }
};

// 將純文字包裝回單純的 Tiptap JSON 格式
const wrapTextToJSON = (text: string): string => {
    const defaultDoc = {
        type: "doc",
        content: [
            {
                type: "paragraph",
                content: text ? [{ type: "text", text }] : []
            }
        ]
    };
    return JSON.stringify(defaultDoc);
};

export const CommentArea: React.FC<CommentAreaProps> = ({ containerId, commentSid }) => {
    const textNode = useStore((state: AppState) => state.nodes.find(n => n.id === commentSid));
    const handleEject = useStore((state: AppState) => state.handleEject);
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    const isCtrlPressed = useStore((state: AppState) => state.isCtrlPressed);
    const setDraggingEjectPos = useStore((state: AppState) => state.setDraggingEjectPos);
    const { screenToFlowPosition } = useReactFlow();
    
    const [isEditing, setIsEditing] = useState(false);

    if (!textNode) return null;

    let previewText = getTextFromJSON(textNode.data.text || '');

    const onPointerDown = (e: React.PointerEvent) => {
        if (!isEditing && isCtrlPressed) {
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
                setDraggingEjectPos(null); // Clear ghost line
                
                const dx = upE.clientX - startX;
                const dy = upE.clientY - startY;
                if (Math.sqrt(dx * dx + dy * dy) > 5) {
                    const flowPos = screenToFlowPosition({ x: upE.clientX, y: upE.clientY });
                    handleEject(containerId, 'comment', flowPos);
                }
            };
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp, { once: true });
        }
    };

    return (
        <div 
            className="nodrag comment-area"
            onPointerDown={onPointerDown}
            onDoubleClick={(e) => { 
                e.stopPropagation(); 
                setIsEditing(true); 
            }}
            title={isEditing ? '' : "Double-click to edit | Ctrl+Drag to eject"}
            style={{
                background: 'rgba(255,255,255,0.03)',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                padding: '6px 10px',
                fontSize: '0.75rem',
                color: 'var(--text-sub)',
                display: 'flex',
                alignItems: isEditing ? 'center' : 'flex-start',
                gap: '8px',
                minHeight: '24px',
                cursor: isCtrlPressed ? 'grab' : (isEditing ? 'text' : 'pointer'),
                userSelect: isEditing ? 'auto' : 'none',
                transition: 'background 0.2s'
            }}
        >
            <Icons.Text width={12} height={12} style={{ marginTop: isEditing ? '0' : '2px', opacity: 0.5, flexShrink: 0 }} />
            <div style={{ 
                flexGrow: 1, 
                fontStyle: isEditing ? 'normal' : 'italic', 
                lineHeight: 1.4,
                overflow: isEditing ? 'visible' : 'hidden',
                display: isEditing ? 'block' : '-webkit-box',
                WebkitLineClamp: isEditing ? 'unset' : 3,
                WebkitBoxOrient: 'vertical',
                wordBreak: 'break-word'
            }}>
                {isEditing ? (
                    <input 
                        className="nodrag"
                        autoFocus
                        defaultValue={previewText}
                        onBlur={(e) => {
                            setIsEditing(false);
                            if (e.target.value !== previewText) {
                                updateNodeData(commentSid, { text: wrapTextToJSON(e.target.value) });
                            }
                        }}
                        onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') {
                                (e.target as any).blur();
                            }
                        }}
                        style={{
                            background: 'rgba(0,0,0,0.2)',
                            border: '1px solid rgba(255,165,0,0.5)', // Orange highlight border
                            color: 'var(--text-main)',
                            fontSize: 'inherit',
                            fontFamily: 'inherit',
                            width: '95%',
                            outline: 'none',
                            borderRadius: '4px',
                            padding: '4px',
                            margin: '-4px'
                        }}
                    />
                ) : (
                    previewText ? (
                        <>{previewText.length > 100 ? previewText.substring(0, 100) + '...' : previewText}</>
                    ) : (
                        <span style={{ opacity: 0.3 }}>Empty comment...</span>
                    )
                )}
            </div>
        </div>
    );
};
