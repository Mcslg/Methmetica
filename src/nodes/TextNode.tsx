import React, { useState, useRef, useEffect, useCallback } from 'react';
import { type NodeProps, type Node, NodeResizer } from '@xyflow/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import TextareaAutosize from 'react-textarea-autosize';
import 'mathlive';
import useStore, { type AppState, type NodeData, type CustomHandle } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';

const LINE_Y_THRESHOLD = 6; // px

export function TextNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    const triggerNode = useStore((state: AppState) => state.triggerNode);
    const [isEditing, setIsEditing] = useState(false);
    const [mathInputOpen, setMathInputOpen] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const mathFieldRef = useRef<any>(null);
    const editingValueRef = useRef<string | null>(null);

    // Focus textarea when entering edit mode
    useEffect(() => {
        if (isEditing && textareaRef.current && !mathInputOpen) {
            textareaRef.current.focus();
        }
    }, [isEditing, mathInputOpen]);

    // ── DOM SCAN ──────────────────────────────────────────────────────────────
    const syncHandlesFromDOM = useCallback(() => {
        if (!contentRef.current || !containerRef.current || isEditing) return;

        const containerEl = containerRef.current;
        const contentEl = contentRef.current;
        const containerRect = containerEl.getBoundingClientRect();
        if (containerRect.height === 0) return;

        // TARGET: .data-pill-render (the actual rendered pills)
        const dataPills = Array.from(contentEl.querySelectorAll('.data-pill-render'));
        type LineGroup = { centerY: number; values: string[] };
        const lineGroups: LineGroup[] = [];

        dataPills.forEach(el => {
            const rect = el.getBoundingClientRect();
            const cy = rect.top + rect.height / 2;
            const val = el.getAttribute('data-value') || '';
            const existing = lineGroups.find(g => Math.abs(g.centerY - cy) < LINE_Y_THRESHOLD);
            if (existing) {
                existing.values.push(val);
            } else {
                lineGroups.push({ centerY: cy, values: [val] });
            }
        });

        lineGroups.sort((a, b) => a.centerY - b.centerY);
        const triggerEls = Array.from(contentEl.querySelectorAll('.trigger-btn'));

        const newHandles: CustomHandle[] = [];
        const newOutputs: Record<string, string> = {};

        lineGroups.forEach((group, idx) => {
            const hId = `h-auto-out-${idx}`;
            const value = group.values.length === 1 ? group.values[0] : JSON.stringify(group.values);
            const offset = Math.max(0, Math.min(100, ((group.centerY - containerRect.top) / containerRect.height) * 100));
            newHandles.push({ id: hId, type: 'output', position: 'right', offset });
            newOutputs[hId] = value;
        });

        triggerEls.forEach((el, idx) => {
            const rect = el.getBoundingClientRect();
            const cy = rect.top + rect.height / 2;
            const offset = Math.max(0, Math.min(100, ((cy - containerRect.top) / containerRect.height) * 100));
            newHandles.push({ id: `h-auto-tr-${idx}`, type: 'trigger-out', position: 'right', offset });
        });

        // PRESERVE MANUAL HANDLES: Keep handles that were not auto-generated (i.e., don't start with h-auto-)
        const manualHandles = (data.handles || []).filter(h => !h.id.startsWith('h-auto-'));
        const combinedHandles = [...manualHandles, ...newHandles];

        const roundOff = (h: CustomHandle) => ({ ...h, offset: Math.round(h.offset * 10) / 10 });
        const handlesChanged = JSON.stringify(combinedHandles.map(roundOff)) !== JSON.stringify((data.handles || []).map(roundOff));
        const outputsChanged = JSON.stringify(newOutputs) !== JSON.stringify(data.outputs || {});

        if (handlesChanged || outputsChanged) {
            updateNodeData(id, { handles: combinedHandles, outputs: newOutputs });
        }
    }, [isEditing, data.handles, data.outputs, id, updateNodeData]);

    useEffect(() => {
        if (isEditing) return;
        const timer = setTimeout(syncHandlesFromDOM, 100);
        return () => clearTimeout(timer);
    }, [data.text, isEditing, syncHandlesFromDOM]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const observer = new ResizeObserver(() => syncHandlesFromDOM());
        observer.observe(el);
        return () => observer.disconnect();
    }, [syncHandlesFromDOM]);

    // ── Handlers ─────────────────────────────────────────────────────────────
    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        updateNodeData(id, { text: e.target.value });
    };

    const insertMathOrData = (isPill: boolean = true) => {
        const latex = mathFieldRef.current?.value || '';
        if (!latex) {
            setMathInputOpen(false);
            editingValueRef.current = null;
            return;
        }

        const text = data.text || '';
        const textarea = textareaRef.current;

        if (editingValueRef.current !== null) {
            // Edit mode for an existing pill
            const oldVal = editingValueRef.current;
            const target = `[[${oldVal}]]`;
            const replacement = `[[${latex}]]`;
            updateNodeData(id, { text: text.replace(target, replacement) });
            editingValueRef.current = null;
        } else if (textarea) {
            // Insert new pill at cursor
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const wrap = isPill ? [`[[`, `]]`] : [`\``, `\``];
            const newText = text.substring(0, start) + wrap[0] + latex + wrap[1] + text.substring(end);
            updateNodeData(id, { text: newText });
        }
        setMathInputOpen(false);
    };

    const handleOpenMathForValue = (val: string) => {
        editingValueRef.current = val;
        setMathInputOpen(true);
        setTimeout(() => {
            if (mathFieldRef.current) {
                mathFieldRef.current.value = val;
                mathFieldRef.current.focus();
                // Try to select the content for easier replacement
                mathFieldRef.current.executeCommand(['selectAll']);
            }
        }, 100);
    };

    const handleBlur = (e: React.FocusEvent) => {
        if (e.relatedTarget && (e.relatedTarget as HTMLElement).closest('.math-popup')) return;
        setIsEditing(false);
    };

    const handleClick = (e: React.MouseEvent) => {
        if (isEditing) return;
        const target = e.target as HTMLElement;
        if (target.closest('input') || target.closest('button') || target.closest('a') || target.closest('.data-pill')) return;
        setIsEditing(true);
    };

    const handleCheckboxClick = useCallback((index: number, checked: boolean) => {
        const lines = (data.text || '').split('\n');
        let checkboxCount = 0;
        const newLines = lines.map(line => {
            if (/^\s*[*-]\s*\[[ xX]\]/.test(line)) {
                if (checkboxCount === index) {
                    checkboxCount++;
                    return checked ? line.replace(/\[[ ]\]/, '[x]') : line.replace(/\[[xX]\]/, '[ ]');
                }
                checkboxCount++;
            }
            return line;
        });
        updateNodeData(id, { text: newLines.join('\n') });
    }, [id, data.text, updateNodeData]);

    const applyFormatting = (prefix: string, suffix: string = '') => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = data.text || '';
        const selectedText = text.substring(start, end);
        const before = text.substring(0, start);
        const after = text.substring(end);

        updateNodeData(id, { text: before + prefix + selectedText + suffix + after });
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + prefix.length, end + prefix.length);
        }, 0);
    };

    const handleTriggerClick = (e: React.MouseEvent) => {
        const target = e.currentTarget as HTMLElement;
        const container = containerRef.current;
        if (!container) return;
        const targetRect = target.getBoundingClientRect();
        const cRect = container.getBoundingClientRect();
        const clickYPct = ((targetRect.top + targetRect.height / 2 - cRect.top) / cRect.height) * 100;
        const triggerHandles = (data.handles || []).filter(h => h.type === 'trigger-out');
        if (triggerHandles.length === 0) return;
        const closest = triggerHandles.reduce((prev, curr) => Math.abs(curr.offset - clickYPct) < Math.abs(prev.offset - clickYPct) ? curr : prev);
        triggerNode(id, closest.id);
    };

    // Pre-process text to turn [[val]] into a special markdown link [val](math) for consistency
    const processText = (txt: string) => {
        return txt.replace(/\[\[(.*?)\]\]/g, '[$1](math)');
    };

    const touchingClasses = data.touchingEdges ? Object.entries(data.touchingEdges).filter(([_, v]) => v).map(([k]) => `edge-touch-${k}`).join(' ') : '';

    return (
        <div
            id={`text-node-${id}`}
            ref={containerRef}
            className={`math-node text-node ${isEditing ? 'editing' : ''} ${touchingClasses}`}
            style={{
                minWidth: '150px', minHeight: '80px', width: '100%', height: '100%',
                cursor: isEditing ? 'text' : 'pointer',
                background: isEditing ? 'rgba(25, 25, 30, 0.95)' : 'rgba(15, 15, 20, 0.85)',
                border: isEditing ? '1px solid rgba(79, 172, 254, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                outline: 'none', transition: 'background 0.2s ease, border 0.2s ease',
                borderRadius: '8px', display: 'flex', flexDirection: 'column',
                boxShadow: isEditing ? '0 10px 40px rgba(0,0,0,0.6)' : 'none',
                textAlign: 'left', alignItems: 'stretch', position: 'relative'
            }}
            onMouseDown={(e) => { if (mathInputOpen || isEditing) e.stopPropagation(); }}
            onClick={handleClick}
        >
            <NodeResizer color="#4facfe" isVisible={selected} minWidth={150} minHeight={80} lineStyle={{ border: 'none' }} handleStyle={{ width: 8, height: 8, borderRadius: '50%', background: '#4facfe' }} />

            <div className="node-header" style={{ padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0, 0, 0, 0.3)', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.6, fontWeight: 700 }}>Note / Logic</span>
            </div>

            {isEditing && (
                <div className="text-toolbar nodrag" onMouseDown={e => e.preventDefault()} style={{ display: 'flex', gap: '4px', padding: '4px 8px', background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)', flexWrap: 'wrap' }}>
                    <button title="Bold" onClick={() => applyFormatting('**', '**')}>B</button>
                    <button title="H1" onClick={() => applyFormatting('# ')}>H1</button>
                    <button title="Bullet" onClick={() => applyFormatting('- ')}>•</button>
                    <button title="Add Data Pill" onClick={() => { 
                        setMathInputOpen(true);
                        setTimeout(() => mathFieldRef.current?.focus(), 100);
                    }} style={{ color: '#4facfe', fontWeight: 'bold' }}>[ x ](math)</button>
                    <button title="Trigger button" onClick={() => applyFormatting('[', '](trigger)')} style={{ color: '#ffcc00', fontWeight: 'bold' }}>[ ⚡ ](trig)</button>
                </div>
            )}

            {mathInputOpen && (
                <div className="math-popup nodrag" style={{ position: 'absolute', top: '70px', left: '10px', right: '10px', background: '#1a1a20', border: '1px solid #4facfe', borderRadius: '8px', padding: '12px', zIndex: 100, boxShadow: '0 10px 30px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '0.7rem', color: '#4facfe', fontWeight: 'bold' }}>Enter Formula/Value</div>
                    {/* @ts-ignore */}
                    <math-field ref={mathFieldRef} style={{ background: '#000', color: '#fff', padding: '8px', borderRadius: '4px', border: '1px solid #333' }}
                        onKeyDown={(e: any) => { if (e.key === 'Enter') insertMathOrData(true); }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button onClick={() => setMathInputOpen(false)} style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
                        <button onClick={() => insertMathOrData(true)} style={{ background: '#4facfe', border: 'none', color: '#000', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>Insert Math</button>
                    </div>
                </div>
            )}

            <div ref={contentRef} className="node-content" style={{ position: 'relative', flexGrow: 1, overflow: 'auto', display: 'block', padding: 0, textAlign: 'left' }}>
                {isEditing ? (
                    <TextareaAutosize ref={textareaRef} className="nodrag" value={data.text || ''} onChange={handleTextChange} onBlur={handleBlur} placeholder={"Input text here...\n[val](math) -> output\n[btn](trigger) -> button"}
                        style={{ width: '100%', background: 'transparent', color: '#fff', border: 'none', outline: 'none', padding: '12px', fontSize: '0.95rem', lineHeight: '1.6', resize: 'none', fontFamily: 'inherit', display: 'block' }}
                    />
                ) : (
                    <div className="markdown-body" style={{ padding: '12px', fontSize: '0.95rem', lineHeight: '1.6', color: '#eee', overflowWrap: 'break-word', minHeight: '40px', textAlign: 'left' }}>
                        {data.text ? (
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm, remarkBreaks]}
                                components={{
                                    input: ({ checked, ...props }) => {
                                        if (props.type === 'checkbox') {
                                            return <input type="checkbox" checked={checked} className="interactive-checkbox" style={{ cursor: 'pointer', marginRight: '8px' }}
                                                onChange={e => {
                                                    const el = document.getElementById(`text-node-${id}`);
                                                    if (!el) return;
                                                    const boxes = Array.from(el.querySelectorAll('.interactive-checkbox'));
                                                    handleCheckboxClick(boxes.indexOf(e.target as HTMLInputElement), e.target.checked);
                                                }}
                                            />;
                                        }
                                        return <input {...props} />;
                                    },
                                    a: ({ href, children, ...props }) => {
                                        if (href === 'trigger') {
                                            return <button className="nodrag trigger-btn" onClick={handleTriggerClick} style={{ background: 'rgba(184,134,11,0.2)', border: '1px solid #b8860b', color: '#ffcc00', padding: '2px 10px', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer', margin: '2px 4px', fontWeight: 'bold', verticalAlign: 'middle' }}>⚡ {children}</button>;
                                        }
                                        if (href === 'math') {
                                            const val = String(children);
                                            return (
                                                <span
                                                    className="data-pill-render"
                                                    {...({ 'data-value': val } as any)}
                                                    onClick={(e) => { e.stopPropagation(); handleOpenMathForValue(val); }}
                                                    style={{
                                                        display: 'inline-flex', alignItems: 'center',
                                                        background: 'rgba(79, 172, 254, 0.1)',
                                                        border: '1px solid rgba(79, 172, 254, 0.4)',
                                                        borderRadius: '12px',
                                                        padding: '0 8px',
                                                        margin: '0 2px',
                                                        color: '#7ecfff',
                                                        fontSize: '0.85em',
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                        boxShadow: '0 0 8px rgba(79, 172, 254, 0.1)',
                                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                                        verticalAlign: 'middle',
                                                        userSelect: 'none'
                                                    }}
                                                >
                                                    {val}
                                                </span>
                                            );
                                        }
                                        return <a href={href} {...props} target="_blank" rel="noopener noreferrer">{children}</a>;
                                    }
                                }}
                            >
                                {processText(data.text)}
                            </ReactMarkdown>
                        ) : (
                            <em style={{ color: '#444', userSelect: 'none' }}>Empty Logic Node.</em>
                        )}
                    </div>
                )}
            </div>

            <DynamicHandles nodeId={id} handles={data.handles} allowedTypes={['input', 'trigger-out', 'trigger-err']} touchingEdges={data.touchingEdges} />

            <style>{`
                .data-pill-render:hover {
                    background: rgba(79, 172, 254, 0.25) !important;
                    border-color: rgba(79, 172, 254, 0.8) !important;
                    box-shadow: 0 0 15px rgba(79, 172, 254, 0.3) !important;
                    transform: translateY(-1px);
                }
                .data-pill-render:active { transform: translateY(0px) scale(0.95); }
                .trigger-btn:hover { background: rgba(184,134,11,0.4) !important; box-shadow: 0 0 10px rgba(184,134,11,0.3); }
                .text-toolbar button { background: transparent; border: none; color: #ccc; cursor: pointer; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; transition: all 0.2s; }
                .text-toolbar button:hover { background: rgba(255,255,255,0.1); color: #fff; }
                math-field:focus-within { outline: 2px solid #4facfe; border-radius: 4px; }
            `}</style>
        </div>
    );
}
