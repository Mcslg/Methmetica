import React, { useState, useRef, useEffect, useCallback } from 'react';
import { type NodeProps, type Node, NodeResizer } from '@xyflow/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import TextareaAutosize from 'react-textarea-autosize';
import useStore, { type AppState, type NodeData } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';

export function TextNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    const [isEditing, setIsEditing] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Focus textarea when entering edit mode
    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.focus();
        }
    }, [isEditing]);

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        updateNodeData(id, { text: e.target.value });
    };

    const handleBlur = () => {
        setIsEditing(false);
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        // Prevent double clicking checkboxes or links from entering edit mode
        if ((e.target as HTMLElement).closest('input') || (e.target as HTMLElement).closest('a')) {
            return;
        }
        setIsEditing(true);
    };

    // Interactive Checkbox Logic
    const handleCheckboxClick = useCallback((index: number, checked: boolean) => {
        const lines = (data.text || '').split('\n');
        let checkboxCount = 0;

        const newLines = lines.map(line => {
            // Look for [ ] or [x] at the start of a list item
            if (/^\s*[*-]\s*\[[ xX]\]/.test(line)) {
                if (checkboxCount === index) {
                    checkboxCount++;
                    return checked
                        ? line.replace(/\[[ ]\]/, '[x]')
                        : line.replace(/\[[xX]\]/, '[ ]');
                }
                checkboxCount++;
            }
            return line;
        });

        updateNodeData(id, { text: newLines.join('\n') });
    }, [id, data.text, updateNodeData]);

    // Markdown Helper Functions
    const applyFormatting = (prefix: string, suffix: string = '') => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = data.text || '';
        const selectedText = text.substring(start, end);

        const before = text.substring(0, start);
        const after = text.substring(end);

        // If it's a line-based prefix (like # or - )
        if (suffix === '' && (prefix.includes('\n') || prefix.startsWith('#') || prefix.startsWith('-'))) {
            const lines = text.split('\n');
            // Find which lines are selected
            let currentCharCount = 0;
            const newLines = lines.map(line => {
                const lineStart = currentCharCount;
                const lineEnd = currentCharCount + line.length;
                currentCharCount += line.length + 1; // +1 for \n

                if (lineEnd >= start && lineStart <= end) {
                    return prefix + line;
                }
                return line;
            });
            updateNodeData(id, { text: newLines.join('\n') });
        } else {
            const newText = before + prefix + selectedText + suffix + after;
            updateNodeData(id, { text: newText });

            // Restore focus and selection
            setTimeout(() => {
                textarea.focus();
                textarea.setSelectionRange(start + prefix.length, end + prefix.length);
            }, 0);
        }
    };

    const touchingClasses = data.touchingEdges
        ? Object.entries(data.touchingEdges)
            .filter(([_, touching]) => touching)
            .map(([edge]) => `edge-touch-${edge}`)
            .join(' ')
        : '';

    return (
        <div
            id={`text-node-${id}`}
            className={`math-node text-node ${isEditing ? 'editing' : ''} ${touchingClasses}`}
            style={{
                minWidth: '150px',
                minHeight: '80px',
                width: '100%',
                height: '100%',
                cursor: isEditing ? 'text' : 'pointer',
                background: isEditing ? 'rgba(25, 25, 30, 0.95)' : 'rgba(15, 15, 20, 0.85)',
                border: isEditing ? '1px solid rgba(79, 172, 254, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                transition: 'background 0.2s ease, border 0.2s ease',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: isEditing ? '0 10px 40px rgba(0,0,0,0.6)' : 'none',
                textAlign: 'left',
                alignItems: 'stretch'
            }}
            onDoubleClick={handleDoubleClick}
        >
            <NodeResizer
                color="#4facfe"
                isVisible={selected}
                minWidth={150}
                minHeight={80}
                handleStyle={{ width: 8, height: 8, borderRadius: '50%' }}
            />



            <div className="node-header" style={{
                padding: '6px 12px',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                background: 'rgba(0, 0, 0, 0.3)',
                flexShrink: 0,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <span style={{
                    fontSize: '0.6rem',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    opacity: 0.6,
                    fontWeight: 700
                }}>Text</span>

                {isEditing && (
                    <div className="toolbar-hint" style={{ fontSize: '0.5rem', opacity: 0.4 }}>
                        Editing...
                    </div>
                )}
            </div>

            {/* Toolbar Area - Only show when editing */}
            {isEditing && (
                <div
                    className="text-toolbar nodrag"
                    onMouseDown={(e) => e.preventDefault()} // Prevent blur when clicking toolbar
                    style={{
                        display: 'flex',
                        gap: '4px',
                        padding: '4px 8px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                        flexWrap: 'wrap'
                    }}
                >
                    <button title="Bold" onClick={() => applyFormatting('**', '**')}>B</button>
                    <button title="Italic" onClick={() => applyFormatting('*', '*')}>I</button>
                    <button title="H1" onClick={() => applyFormatting('# ')}>H1</button>
                    <button title="H2" onClick={() => applyFormatting('## ')}>H2</button>
                    <button title="Bullet List" onClick={() => applyFormatting('- ')}>•</button>
                    <button title="Checklist" onClick={() => applyFormatting('- [ ] ')}>☑</button>
                    <button title="Code" onClick={() => applyFormatting('`', '`')}>{'<>'}</button>
                    <style>{`
                .text-toolbar button {
                    background: transparent;
                    border: none;
                    color: #ccc;
                    cursor: pointer;
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-size: 0.75rem;
                    font-weight: bold;
                    transition: all 0.2s;
                    min-width: 24px;
                }
                .text-toolbar button:hover {
                    background: rgba(255, 255, 255, 0.1);
                    color: #fff;
                    transform: translateY(-1px);
                }
            `}</style>
                </div>
            )}

            <div className="node-content" style={{
                position: 'relative',
                flexGrow: 1,
                overflow: 'auto',
                display: 'block',
                padding: 0,
                textAlign: 'left',
                justifyContent: 'flex-start',
                alignItems: 'flex-start'
            }}>
                {isEditing ? (
                    <TextareaAutosize
                        ref={textareaRef}
                        className="nodrag"
                        value={data.text || ''}
                        onChange={handleTextChange}
                        onBlur={handleBlur}
                        placeholder="Type markdown / tasks here..."
                        style={{
                            width: '100%',
                            background: 'transparent',
                            color: '#fff',
                            border: 'none',
                            outline: 'none',
                            padding: '12px',
                            fontSize: '0.95rem',
                            lineHeight: '1.6',
                            resize: 'none',
                            fontFamily: 'inherit',
                            display: 'block'
                        }}
                    />
                ) : (
                    <div
                        className="markdown-body"
                        style={{
                            padding: '12px',
                            fontSize: '0.95rem',
                            lineHeight: '1.6',
                            color: '#eee',
                            overflowWrap: 'break-word',
                            minHeight: '40px',
                            textAlign: 'left'
                        }}
                    >
                        {data.text ? (
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm, remarkBreaks]}
                                components={{
                                    input: ({ checked, ...props }) => {
                                        if (props.type === 'checkbox') {
                                            return (
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    className="interactive-checkbox"
                                                    style={{ cursor: 'pointer', marginRight: '8px' }}
                                                    onChange={(e) => {
                                                        const container = document.getElementById(`text-node-${id}`);
                                                        if (!container) return;
                                                        const checkboxes = Array.from(container.querySelectorAll('.interactive-checkbox'));
                                                        const index = checkboxes.indexOf(e.target as HTMLInputElement);
                                                        handleCheckboxClick(index, e.target.checked);
                                                    }}
                                                />
                                            );
                                        }
                                        return <input {...props} />;
                                    }
                                }}
                            >
                                {data.text}
                            </ReactMarkdown>
                        ) : (
                            <em style={{ color: '#444', userSelect: 'none' }}>Double click to add text...</em>
                        )}
                    </div>
                )}
            </div>
            <DynamicHandles nodeId={id} handles={data.handles} allowedTypes={[]} />
        </div>
    );
}
