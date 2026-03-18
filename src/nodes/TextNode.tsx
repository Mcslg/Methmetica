import React, { useState, useRef, useEffect, useCallback } from 'react';
import { type NodeProps, type Node, NodeResizer, useUpdateNodeInternals } from '@xyflow/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import 'mathlive';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import useStore, { type AppState, type NodeData, type CustomHandle, type HandleType } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';

const LINE_Y_THRESHOLD = 12; // px - Increased to better group elements on same line

export function TextNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    const triggerNode = useStore((state: AppState) => state.triggerNode);
    const updateNodeInternals = useUpdateNodeInternals();
    const [isEditing, setIsEditing] = useState(false);
    const [mathInputOpen, setMathInputOpen] = useState(false);
    const [expandedPills, setExpandedPills] = useState<Set<string>>(new Set());
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

        // TARGET: Data pills, trigger buttons, and checkboxes
        const interactiveEls = Array.from(contentEl.querySelectorAll('.data-pill-render, .trigger-btn, .interactive-checkbox'));
        type LineGroup = { centerY: number; elements: Element[] };
        const lineGroups: LineGroup[] = [];
 
        interactiveEls.forEach(el => {
            const rect = el.getBoundingClientRect();
            const cy = rect.top + rect.height / 2;
            const existing = lineGroups.find(g => Math.abs(g.centerY - cy) < LINE_Y_THRESHOLD);
            if (existing) {
                existing.elements.push(el);
            } else {
                lineGroups.push({ centerY: cy, elements: [el] });
            }
        });
 
        lineGroups.sort((a, b) => a.centerY - b.centerY);
 
        const newHandles: CustomHandle[] = [];
        const newOutputs: Record<string, string> = {};
 
        lineGroups.forEach((group, groupIdx) => {
            // Within each line, sort elements from left to right (by X)
            group.elements.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);

            const totalInGroup = group.elements.length;
            const STAGGER_GAP = 12; // px
 
            group.elements.forEach((el, subIdx) => {
                const isDataPill = el.classList.contains('data-pill-render');
                const isTriggerBtn = el.classList.contains('trigger-btn');
                const isCheckbox = el.classList.contains('interactive-checkbox');
                
                const hType: HandleType = isTriggerBtn ? 'trigger-out' : 'output';
                const hPrefix = isTriggerBtn ? 'tr' : 'out';
                const hId = `h-auto-${hPrefix}-${groupIdx}-${subIdx}`;
                
                // Calculate staggered Y position relative to the line center
                const staggerOffset = (subIdx - (totalInGroup - 1) / 2) * STAGGER_GAP;
                const staggeredY = group.centerY + staggerOffset;
                
                const offset = Math.max(0, Math.min(100, ((staggeredY - containerRect.top) / containerRect.height) * 100));
                
                newHandles.push({ id: hId, type: hType, position: 'right', offset });
                
                if (isDataPill) {
                    const val = el.getAttribute('data-value') || '';
                    newOutputs[hId] = val;
                } else if (isCheckbox) {
                    const val = (el as HTMLInputElement).checked ? '1' : '0';
                    newOutputs[hId] = val;
                }
 
                // Tag the DOM element for direct mapping
                el.setAttribute('data-handle-id', hId);
            });
        });

        // PRESERVE MANUAL HANDLES: Keep handles that were not auto-generated (i.e., don't start with h-auto-)
        const manualHandles = (data.handles || []).filter((h: CustomHandle) => !h.id.startsWith('h-auto-'));
        const combinedHandles = [...manualHandles, ...newHandles];

        const roundOff = (h: CustomHandle) => ({ ...h, offset: Math.round(h.offset * 10) / 10 });
        const currentHandleSummary = JSON.stringify((data.handles || []).map(roundOff));
        const newHandleSummary = JSON.stringify(combinedHandles.map(roundOff));

        if (currentHandleSummary !== newHandleSummary || JSON.stringify(newOutputs) !== JSON.stringify(data.outputs || {})) {
            updateNodeData(id, { handles: combinedHandles, outputs: newOutputs });
        }
        // Let React Flow know the internal handle geometry/size has changed
        updateNodeInternals(id);
    }, [isEditing, data.handles, data.outputs, id, updateNodeData, updateNodeInternals]);


    useEffect(() => {
        if (isEditing) return;
        const timer = setTimeout(syncHandlesFromDOM, 100);
        return () => clearTimeout(timer);
    }, [data.text, data.style, expandedPills, isEditing, syncHandlesFromDOM]);

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

    const handleOpenMathForValue = (val: string, handleId?: string) => {
        editingValueRef.current = val;
        setMathInputOpen(true);
        
        // Optional: logical use of handleId would go here (e.g. highlighting)
        if (handleId) {
            console.log(`Editing pill associated with handle: ${handleId}`);
        }

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
        const newLines = lines.map((line: string) => {
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






    const handleKeyDown = () => {
        // Standard behavior
    };



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
        const handleId = target.getAttribute('data-handle-id');
        
        if (handleId) {
            triggerNode(id, handleId);
            return;
        }

        // Fallback: search by Y proximity if attribute not found
        const container = containerRef.current;
        if (!container) return;
        const targetRect = target.getBoundingClientRect();
        const cRect = container.getBoundingClientRect();
        const clickYPct = ((targetRect.top + targetRect.height / 2 - cRect.top) / cRect.height) * 100;
        const triggerHandles = (data.handles || []).filter((h: CustomHandle) => h.type === 'trigger-out');
        if (triggerHandles.length === 0) return;
        const closest = triggerHandles.reduce((prev: CustomHandle, curr: CustomHandle) => 
            Math.abs(curr.offset - clickYPct) < Math.abs(prev.offset - clickYPct) ? curr : prev
        );
        triggerNode(id, closest.id);
    };

    // Pre-process text to turn [[val]] into a special markdown link [val](math) for consistency
    const processText = (txt: string) => {
        return txt.replace(/\[\[(.*?)\]\]/g, '[$1](math)');
    };


    return (
        <div
            id={`text-node-${id}`}
            ref={containerRef}
            className={`math-node text-node ${isEditing ? 'editing' : ''}`}
            style={{
                minWidth: '150px', minHeight: '80px', width: '100%', height: '100%',
                cursor: isEditing ? 'text' : 'pointer',
                background: isEditing ? 'rgba(25, 25, 30, 0.95)' : 'rgba(15, 15, 20, 0.85)',
                border: isEditing ? '1px solid rgba(79, 172, 254, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                outline: 'none', transition: 'background 0.2s ease, border 0.2s ease',
                borderRadius: '8px', display: 'flex', flexDirection: 'column',
                justifyContent: 'flex-start',
                boxShadow: isEditing ? '0 10px 40px rgba(0,0,0,0.6)' : 'none',
                textAlign: 'left', alignItems: 'stretch', position: 'relative',
                overflow: 'visible'
            }}
            onMouseDown={(e) => { if (mathInputOpen || isEditing) e.stopPropagation(); }}
            onClick={handleClick}
        >
            <NodeResizer color="#4facfe" isVisible={selected} minWidth={150} minHeight={80} lineStyle={{ border: 'none' }} handleStyle={{ width: 8, height: 8, borderRadius: '50%', background: '#4facfe' }} />

            {isEditing && (
                <div className="text-toolbar nodrag" onMouseDown={e => e.preventDefault()} 
                    style={{ 
                        position: 'absolute',
                        bottom: 'calc(100% + 8px)',
                        left: 0,
                        right: 0,
                        display: 'flex', 
                        gap: '4px', 
                        padding: '6px 8px', 
                        background: 'rgba(25, 25, 30, 0.95)', 
                        border: '1px solid rgba(79, 172, 254, 0.3)',
                        borderRadius: '6px',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.4)',
                        flexWrap: 'wrap',
                        zIndex: 1000
                    }}>
                    <button title="Bold" onClick={() => applyFormatting('**', '**')}>B</button>
                    <button title="H1" onClick={() => applyFormatting('# ')}>H1</button>
                    <button title="Bullet" onClick={() => applyFormatting('- ')}>•</button>
                    <button title="Checkbox" onClick={() => applyFormatting('- [ ] ')}>☑</button>
                    <button title="Add Data Pill" onClick={() => { 
                        setMathInputOpen(true);
                        setTimeout(() => mathFieldRef.current?.focus(), 100);
                    }} style={{ color: '#4facfe', fontWeight: 'bold' }}>[ x ](math)</button>
                    <button title="Trigger button" onClick={() => applyFormatting('[', '](trigger)')} style={{ color: '#ffcc00', fontWeight: 'bold' }}>[ ⚡ ](trig)</button>

                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '8px', alignItems: 'center' }}>
                        {['#ffffff', '#ff7eb9', '#7afcff', '#4facfe', '#43e97b', '#ffcc33'].map(col => (
                            <div 
                                key={col} 
                                onClick={() => updateNodeData(id, { style: { ...(data.style || {}), color: col } })}
                                style={{ 
                                    width: 12, 
                                    height: 12, 
                                    borderRadius: '50%', 
                                    background: col, 
                                    cursor: 'pointer', 
                                    border: (data.style?.color || '#ffffff') === col ? '1px solid #fff' : '1px solid transparent',
                                    boxShadow: (data.style?.color || '#ffffff') === col ? `0 0 5px ${col}` : 'none'
                                }} 
                            />
                        ))}
                        <button 
                            title="Font Size" 
                            onClick={() => {
                                const sizes = [0.8, 1, 1.25, 1.5];
                                const cur = data.style?.fontSize || 1;
                                const nextIndex = (sizes.indexOf(cur) + 1) % sizes.length;
                                updateNodeData(id, { style: { ...(data.style || {}), fontSize: sizes[nextIndex] } });
                            }} 
                            style={{ fontSize: '0.65rem', padding: '2px 6px', marginLeft: '4px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer' }}
                        >
                            {data.style?.fontSize ? `${data.style.fontSize}x` : '1x'}
                        </button>
                    </div>
                </div>
            )}

            {mathInputOpen && (
                <div className="math-popup nodrag" style={{ position: 'absolute', top: 'calc(100% + 8px)', left: '10px', right: '10px', background: '#1a1a20', border: '1px solid #4facfe', borderRadius: '8px', padding: '12px', zIndex: 1100, boxShadow: '0 10px 30px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
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

            <div className="node-header" style={{ padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0, 0, 0, 0.3)', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.6, fontWeight: 700 }}>Note / Logic</span>
            </div>

            <div ref={contentRef} className="node-content custom-scrollbar" style={{ 
                position: 'relative', 
                flexGrow: 1, 
                overflowY: 'auto', 
                overflowX: 'hidden',
                display: 'block', 
                padding: '0px', 
                textAlign: 'left'
            }}>
                {isEditing ? (
                    <textarea 
                        ref={textareaRef} 
                        className="nodrag" 
                        value={data.text || ''} 
                        onChange={handleTextChange} 
                        onBlur={handleBlur} 
                        onKeyDown={handleKeyDown}
                        placeholder={""}
                        autoFocus
                        style={{
                            width: '100%', height: '100%',
                            background: 'transparent',
                            color: data.style?.color || '#fff',
                            fontSize: `${(data.style?.fontSize || 1) * 0.9}rem`,
                            border: 'none', resize: 'none',
                            padding: '12px',
                            fontFamily: 'inherit',
                            outline: 'none',
                            lineHeight: '1.6'
                        }}
                    />
                ) : (
                    <div className="markdown-render" style={{ 
                        padding: '12px', 
                        fontSize: `${data.style?.fontSize || 1}rem`, 
                        color: data.style?.color || '#cbd5e1',
                        lineHeight: '1.6' 
                    }}>
                        {data.text ? (
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm, remarkBreaks]}
                                components={{
                                    input: ({ checked, ...props }) => {
                                        if (props.type === 'checkbox') {
                                            return <input type="checkbox" checked={checked} className="interactive-checkbox" 
                                                style={{ 
                                                    cursor: 'pointer', 
                                                    marginRight: '8px',
                                                    verticalAlign: 'middle',
                                                    position: 'relative',
                                                    top: '-1px'
                                                }}
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
                                            const val = String(children).trim(); // Added trim here
                                            let isSequence = false;
                                            let items: any[] = [];
                                            try {
                                                if (val.startsWith('[') && val.endsWith(']')) {
                                                    const parsed = JSON.parse(val);
                                                    if (Array.isArray(parsed)) {
                                                        isSequence = true;
                                                        items = parsed;
                                                    }
                                                }
                                            } catch (e) { /* Not a sequence */ }

                                            // We use a simplified ID for state tracking based on the value content
                                            // Ideally we'd have a stable ID, but content works for now
                                            const pillId = val; 
                                            const isExpanded = expandedPills.has(pillId);

                                            const toggleExpand = (e: React.MouseEvent) => {
                                                e.stopPropagation();
                                                const next = new Set(expandedPills);
                                                if (next.has(pillId)) next.delete(pillId);
                                                else next.add(pillId);
                                                setExpandedPills(next);
                                                
                                                // Trigger handle sync and Node layout update immediately after render
                                                setTimeout(() => {
                                                    updateNodeInternals(id);
                                                    syncHandlesFromDOM();
                                                }, 20); 
                                            };

                                            if (isSequence && isExpanded) {
                                                return (
                                                    <div className="sequence-pill expanded" style={{ display: 'block', margin: '8px 0', border: '1px solid rgba(79, 172, 254, 0.3)', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', overflow: 'hidden' }}>
                                                        <div onClick={toggleExpand} style={{ padding: '4px 10px', background: 'rgba(79, 172, 254, 0.1)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.65rem' }}>
                                                            <span style={{ color: '#4facfe', fontWeight: 'bold' }}>{'{'} LIST {'}'}</span>
                                                            <span style={{ opacity: 0.6 }}>{items.length} items</span>
                                                        </div>
                                                        <div style={{ padding: '4px' }}>
                                                            {items.map((it, idx) => (
                                                                <div key={idx} className="data-pill-render" {...({ 'data-value': String(it) } as any)}
                                                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '2px 8px', fontSize: '0.8em', borderBottom: idx === items.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.05)' }}>
                                                                    <span style={{ opacity: 0.4, fontSize: '0.6rem', width: '12px' }}>{idx}</span>
                                                                    <span dangerouslySetInnerHTML={{ __html: katex.renderToString(String(it), { throwOnError: false }) }} />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            return (
                                                <span
                                                    className={`data-pill-render ${isSequence ? 'sequence-p' : ''}`}
                                                    {...({ 'data-value': val } as any)}
                                                    onClick={(e) => { 
                                                        e.stopPropagation(); 
                                                        if (isSequence) {
                                                            toggleExpand(e);
                                                        } else {
                                                            const hid = (e.currentTarget as HTMLElement).getAttribute('data-handle-id') || undefined;
                                                            handleOpenMathForValue(val, hid); 
                                                        }
                                                    }}
                                                    style={{
                                                        display: 'inline-flex', alignItems: 'center',
                                                        background: isSequence ? 'rgba(79, 172, 254, 0.08)' : 'rgba(79, 172, 254, 0.1)',
                                                        color: '#4facfe',
                                                        padding: '0px 8px',
                                                        borderRadius: isSequence ? '12px' : '4px',
                                                        fontSize: '0.85em',
                                                        fontFamily: 'monospace',
                                                        cursor: 'pointer',
                                                        border: isSequence ? '1px dashed rgba(79, 172, 254, 0.4)' : '1px solid rgba(79, 172, 254, 0.3)',
                                                        margin: '0 2px',
                                                        userSelect: 'none',
                                                        minHeight: '1.2em',
                                                        maxWidth: isSequence ? '180px' : 'none',
                                                        overflow: 'hidden',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    {isSequence && <span style={{ marginRight: '4px', opacity: 0.7 }}>{'{'}</span>}
                                                    {isSequence ? (
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <span dangerouslySetInnerHTML={{ __html: katex.renderToString(String(items[0]), { throwOnError: false }) }} />
                                                            {items.length > 1 && (
                                                                <>
                                                                    <span style={{ opacity: 0.4 }}>...</span>
                                                                    <span dangerouslySetInnerHTML={{ __html: katex.renderToString(String(items[items.length - 1]), { throwOnError: false }) }} />
                                                                    <span style={{ opacity: 0.5, fontSize: '0.65rem', marginLeft: '2px' }}>({items.length})</span>
                                                                </>
                                                            )}
                                                        </span>
                                                    ) : (
                                                        <span dangerouslySetInnerHTML={{ 
                                                            __html: katex.renderToString(val, { throwOnError: false }) 
                                                        }} />
                                                    )}
                                                    {isSequence && <span style={{ marginLeft: '4px', opacity: 0.7 }}>{'}'}</span>}
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
                            null
                        )}
                    </div>
                )}
            </div>

            <DynamicHandles nodeId={id} handles={data.handles} allowedTypes={['input']} touchingEdges={data.touchingEdges} />

            <style>{`
                .sequence-p {
                    border-style: dashed !important;
                    position: relative;
                }
                .sequence-pill.expanded {
                    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                }
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
                
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 2px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.2);
                }
            `}</style>
        </div>
    );
}

