import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { type NodeProps, type Node, NodeResizer, useUpdateNodeInternals } from '@xyflow/react';
import { EditorContent, useEditor, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown as TiptapMarkdown } from 'tiptap-markdown';
import { Node as TiptapNode, mergeAttributes, type ExtendedRegExpMatchArray, type Range } from '@tiptap/core';
import { type EditorState } from '@tiptap/pm/state';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { getMathEngine } from '../utils/MathEngine';
import useStore, { type AppState, type NodeData, type CustomHandle, type HandleType } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';

const LINE_Y_THRESHOLD = 12; // px

export const TextNodeContext = React.createContext<{
    isHandleActive: (id: string) => boolean;
    toggleHandle: (id: string) => void;
    editMath: (val: string) => void;
    renameTrigger: (oldLabel: string, newLabel: string) => void;
}>({
    isHandleActive: () => false,
    toggleHandle: () => {},
    editMath: () => {},
    renameTrigger: () => {},
});

// ── CUSTOM TIPTAP EXTENSIONS ──────────────────────────────────────────────

/**
 * MathPill Extension
 * Matches $$...$$ and renders as a React component
 */
const MathPill = TiptapNode.create({
    name: 'mathPill',
    group: 'inline',
    inline: true,
    atom: true,

    addAttributes() {
        return {
            value: {
                default: '',
                parseHTML: element => element.getAttribute('data-value'),
                renderHTML: attributes => ({
                    'data-value': attributes.value,
                })
            },
            name: {
                default: '',
                parseHTML: element => element.getAttribute('data-name'),
                renderHTML: attributes => ({
                    'data-name': attributes.name,
                })
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'span[data-type="math-pill"]',
            },
            {
                tag: 'math-pill-md',
                getAttrs: dom => ({ 
                    value: (dom as HTMLElement).getAttribute('value'),
                    name: (dom as HTMLElement).getAttribute('name')
                })
            }
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'math-pill' }), 0];
    },

    addNodeView() {
        return ReactNodeViewRenderer(({ node, editor, getPos }: NodeViewProps) => {
            const val = node.attrs.value || '';
            const name = node.attrs.name || '';
            const ctx = React.useContext(TextNodeContext);
            const [localShowHandle, setLocalShowHandle] = useState(ctx.isHandleActive(`math-${val}`));
            const [isHovered, setIsHovered] = useState(false);

            useEffect(() => {
                setLocalShowHandle(ctx.isHandleActive(`math-${val}`));
            }, [ctx, val]);

            const html = useMemo(() => {
                try {
                    return katex.renderToString(val, { throwOnError: false, displayMode: false });
                } catch (e) {
                    return val;
                }
            }, [val]);

            const onRightClick = (e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                ctx.toggleHandle(`math-${val}`);
                setLocalShowHandle(!localShowHandle);
            };

            const handleMouseDown = async (e: React.MouseEvent) => {
                console.log('MathPill MouseDown:', { button: e.button, shift: e.shiftKey, alt: e.altKey });
                
                // Only handle Left Click
                if (e.button !== 0) return;

                if (e.shiftKey || e.altKey || e.metaKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    console.log('Evaluating mathpill with local context:', val);
                    try {
                        const ce = getMathEngine();
                        
                        // 1. Gather all named variables in the current TextNode content
                        const localVars: Record<string, any> = {};
                        editor.state.doc.descendants((node) => {
                            if (node.type.name === 'mathPill' && node.attrs.name && node.attrs.value) {
                                try {
                                    // Parse value as math
                                    localVars[node.attrs.name] = ce.parse(node.attrs.value).evaluate();
                                } catch (e) {}
                            }
                            return true;
                        });

                        // 2. Evaluate with gathered scope
                        ce.pushScope();
                        Object.entries(localVars).forEach(([k, v]) => ce.assign(k, v));
                        
                        const expr = ce.parse(val);
                        const result = expr.evaluate().latex;
                        
                        ce.popScope();
                        console.log('Evaluation success with scope:', { scope: localVars, result });
                        
                        if (typeof getPos === 'function') {
                            const pos = getPos();
                            if (typeof pos === 'number' && result !== val) {
                                editor.chain().focus().command(({ tr }) => {
                                    tr.setNodeMarkup(pos, undefined, { ...node.attrs, value: result });
                                    return true;
                                }).run();
                            }
                        }
                    } catch (err) {
                        console.error('Contextual Evaluation Error:', err);
                    }
                    return;
                }

                // If no modifier keys, open edit popup
                e.preventDefault();
                e.stopPropagation();
                ctx.editMath(val);
            };

            return (
                <NodeViewWrapper 
                    as="span" 
                    className={`data-pill-render ${localShowHandle ? 'has-handle' : ''}`}
                    data-value={val}
                    data-name={name}
                    data-show-handle={localShowHandle ? 'true' : 'false'}
                    onContextMenu={onRightClick}
                    onMouseDown={handleMouseDown}
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                    contentEditable={false}
                    style={{
                        display: 'inline-flex',
                        position: 'relative',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(79, 172, 254, 0.05)',
                        color: '#4facfe',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.9em',
                        cursor: 'pointer',
                        border: localShowHandle ? '1px solid #4facfe' : '1px solid rgba(79, 172, 254, 0.3)',
                        margin: name ? '10px 4px 4px 4px' : '0 4px',
                        userSelect: 'none',
                        minHeight: '1.4em',
                        transition: 'all 0.2s ease',
                        verticalAlign: 'middle',
                        top: '-1px',
                        boxShadow: localShowHandle ? '0 0 10px rgba(79, 172, 254, 0.3)' : 'none'
                    }}
                >
                    {name && (
                        <span style={{ 
                            position: 'absolute',
                            top: '-8px',
                            left: '8px',
                            fontSize: '0.6rem', 
                            color: 'rgba(255,255,255,0.5)', 
                            background: '#15151a', 
                            padding: '0 4px',
                            lineHeight: 1, 
                            fontWeight: 700,
                            letterSpacing: '0.05em',
                            textTransform: 'uppercase',
                            pointerEvents: 'none'
                        }}>
                            {name}
                        </span>
                    )}
                    <span dangerouslySetInnerHTML={{ __html: html }} style={{ pointerEvents: 'none', lineHeight: 1 }} />
                    
                    {isHovered && (
                        <div style={{
                            position: 'absolute',
                            bottom: '100%',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            marginBottom: '10px',
                            background: 'rgba(0,0,0,0.85)',
                            color: '#fff',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '0.65rem',
                            whiteSpace: 'nowrap',
                            pointerEvents: 'none',
                            zIndex: 100,
                            border: '1px solid rgba(255,255,255,0.1)',
                            boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                            backdropFilter: 'blur(4px)'
                        }}>
                            🖱️ Edit | ⇧/⌥+🖱️ Compute | Right-click: Handle
                        </div>
                    )}
                </NodeViewWrapper>
            );
        }, {
            stopEvent: () => true,
        });
    },

    addInputRules() {
        return [
            {
                find: /\$\$(.+)\$\$\s$/,
                handler: ({ state, range, match }: { state: EditorState, range: Range, match: ExtendedRegExpMatchArray }) => {
                    const { tr } = state;
                    const val = match[1];
                    if (val) {
                        tr.replaceWith(range.from, range.to, this.type.create({ value: val }));
                    }
                },
            } as any,
        ];
    },
});

/**
 * TriggerButton Extension
 */
const TriggerButton = TiptapNode.create({
    name: 'triggerButton',
    group: 'inline',
    inline: true,
    atom: true,

    addAttributes() {
        return {
            label: {
                default: 'Trigger',
                parseHTML: element => element.getAttribute('data-label'),
                renderHTML: attributes => ({
                    'data-label': attributes.label,
                })
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'button[data-type="trigger-btn"]',
            },
            {
                tag: 'trigger-btn-md',
                getAttrs: dom => ({ label: (dom as HTMLElement).getAttribute('label') })
            }
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['button', mergeAttributes(HTMLAttributes, { 'data-type': 'trigger-btn' }), 0];
    },

    addNodeView() {
        return ReactNodeViewRenderer(({ node }: NodeViewProps) => {
            const label = node.attrs.label || 'Trigger';
            const ctx = React.useContext(TextNodeContext);
            const [localShowHandle, setLocalShowHandle] = useState(ctx.isHandleActive(`trig-${label}`));
            const [isEditing, setIsEditing] = useState(false);
            const [editVal, setEditVal] = useState(label);

            useEffect(() => {
                setLocalShowHandle(ctx.isHandleActive(`trig-${label}`));
            }, [ctx, label]);

            const onRightClick = (e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                ctx.toggleHandle(`trig-${label}`);
                setLocalShowHandle(!localShowHandle);
            };

            const onClick = (e: React.MouseEvent) => {
                if (isEditing) return;
                e.preventDefault();
                e.stopPropagation();
                const btn = e.currentTarget as HTMLElement;
                const handleId = btn.getAttribute('data-handle-id');
                if (handleId) {
                    const event = new CustomEvent('node-trigger', { detail: { handleId } });
                    btn.dispatchEvent(event);
                }
            };

            const onDoubleClick = (e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                setEditVal(label);
                setIsEditing(true);
            };

            const handleKeyDown = (e: React.KeyboardEvent) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    finishEditing();
                } else if (e.key === 'Escape') {
                    setIsEditing(false);
                }
            };

            const finishEditing = () => {
                setIsEditing(false);
                if (editVal.trim() && editVal !== label) {
                    ctx.renameTrigger(label, editVal.trim());
                }
            };

            return (
                <NodeViewWrapper 
                    as="span" 
                    className={`trigger-btn ${localShowHandle ? 'has-handle' : ''}`}
                    data-label={label}
                    data-show-handle={localShowHandle ? 'true' : 'false'}
                    onContextMenu={onRightClick}
                    onClick={onClick}
                    onDoubleClick={onDoubleClick}
                    contentEditable={false}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        background: 'rgba(184,134,11,0.15)',
                        border: localShowHandle ? '1px solid #ffcc00' : '1px solid rgba(184,134,11,0.4)',
                        color: '#ffcc00',
                        padding: isEditing ? '0px 8px' : '2px 12px',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        cursor: isEditing ? 'text' : 'pointer',
                        margin: '2px 6px',
                        fontWeight: 700,
                        verticalAlign: 'baseline',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        transition: 'all 0.2s ease',
                        boxShadow: localShowHandle ? '0 0 10px rgba(255, 204, 0, 0.2)' : 'none'
                    }}
                >
                    <span style={{ marginRight: '4px', fontSize: '0.9em', pointerEvents: 'none' }}>⚡</span>
                    {isEditing ? (
                        <input 
                            autoFocus
                            value={editVal}
                            onChange={e => setEditVal(e.target.value)}
                            onBlur={finishEditing}
                            onKeyDown={handleKeyDown}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#ffcc00',
                                width: `${Math.max(editVal.length, 3)}ch`,
                                outline: 'none',
                                fontFamily: 'inherit',
                                fontSize: 'inherit',
                                fontWeight: 'inherit',
                                textTransform: 'inherit'
                            }}
                        />
                    ) : (
                        <span style={{ pointerEvents: 'none' }}>{label}</span>
                    )}
                </NodeViewWrapper>
            );
        });
    },

    addInputRules() {
        return [
            {
                find: /\[(.+)\]\(trigger\)\s$/,
                handler: ({ state, range, match }: { state: EditorState, range: Range, match: ExtendedRegExpMatchArray }) => {
                    const { tr } = state;
                    const label = match[1];
                    if (label) {
                        tr.replaceWith(range.from, range.to, this.type.create({ label }));
                    }
                },
            } as any,
        ];
    },
});

// ── MAIN COMPONENT ────────────────────────────────────────────────────────

export function TextNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    const triggerNode = useStore((state: AppState) => state.triggerNode);
    const updateNodeInternals = useUpdateNodeInternals();
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    const [mathInputOpen, setMathInputOpen] = useState(false);
    const mathFieldRef = useRef<any>(null);
    const mathNameInputRef = useRef<HTMLInputElement>(null);
    const editingValueRef = useRef<string | null>(null);
    const editingNameRef = useRef<string | null>(null);

    // Track which handles are toggled visible. Store in component state so it doesn't get wiped by Markdown.
    // Try to restore from outputs so handles don't disappear on reload.
    const [activeHandles, setActiveHandles] = useState<Set<string>>(new Set(data.outputs ? Object.values(data.outputs).map(v => `math-${v}`) : []));

    const toggleHandle = useCallback((handleKey: string) => {
        setActiveHandles(prev => {
            const next = new Set(prev);
            if (next.has(handleKey)) next.delete(handleKey);
            else next.add(handleKey);
            return next;
        });
    }, []);

    const isHandleActive = useCallback((handleKey: string) => {
        return activeHandles.has(handleKey);
    }, [activeHandles]);

    // ── TIPTAP EDITOR SETUP ──────────────────────────────────────────────
    const parseMarkdownToCustomNodes = (md: string) => {
        return md
            .replace(/\$\$(.*?)\$\$/g, '<math-pill-md value="$1"></math-pill-md>')
            .replace(/\[(.*?)\]\(trigger\)/g, '<trigger-btn-md label="$1"></trigger-btn-md>');
    };


    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                codeBlock: false,
                code: false,
            }),
            TiptapMarkdown.configure({
                html: true,
                tightLists: true,
                linkify: false,
            }),
            MathPill,
            TriggerButton,
        ],
        content: (() => {
            const t = data.text || '';
            if (t.startsWith('{')) {
                try {
                    return JSON.parse(t);
                } catch { return t; }
            }
            return parseMarkdownToCustomNodes(t);
        })(),
        onUpdate: ({ editor }) => {
            // Use JSON for lossless storage of custom nodes
            const json = editor.getJSON();
            updateNodeData(id, { text: JSON.stringify(json) });
        },
        editorProps: {
            handleKeyDown: (view, event) => {
                if (event.key === '$') {
                    const { state } = view;
                    const { selection } = state;
                    // Look back 1 character to see if we just typed $
                    const before = state.doc.textBetween(Math.max(0, selection.from - 1), selection.from);
                    if (before === '$') {
                        // Delete the precious $ and open math mode
                        view.dispatch(state.tr.delete(selection.from - 1, selection.from));
                        editingValueRef.current = null;
                        editingNameRef.current = null;
                        setMathInputOpen(true);
                        setTimeout(() => mathFieldRef.current?.focus(), 100);
                        return true;
                    }
                }
                return false;
            }
        },
        editable: true,
        injectCSS: false,
    });

    const editMath = useCallback((val: string) => {
        // Find if this node has a name
        let currentName = '';
        editor?.state.doc.descendants((node) => {
            if (node.type.name === 'mathPill' && node.attrs.value === val) {
                currentName = node.attrs.name || '';
                return false;
            }
        });

        editingValueRef.current = val;
        editingNameRef.current = currentName;
        setMathInputOpen(true);
        setTimeout(() => {
            if (mathFieldRef.current) {
                mathFieldRef.current.value = val;
                mathFieldRef.current.focus();
                mathFieldRef.current.executeCommand(['selectAll']);
            }
            if (mathNameInputRef.current) mathNameInputRef.current.value = currentName;
        }, 100);
    }, [editor]);

    const renameTrigger = useCallback((oldLabel: string, newLabel: string) => {
        if (newLabel && newLabel.trim() !== '' && newLabel !== oldLabel && editor) {
            let foundPos = -1;
            let attrs: any = null;
            editor.state.doc.descendants((node, pos) => {
                if (node.type.name === 'triggerButton' && node.attrs.label === oldLabel) {
                    foundPos = pos;
                    attrs = node.attrs;
                    return false; // Stop descending
                }
            });

            if (foundPos !== -1) {
                editor.commands.command(({ tr }) => {
                    tr.setNodeMarkup(foundPos, undefined, { ...attrs, label: newLabel });
                    return true;
                });

                if (activeHandles.has(`trig-${oldLabel}`)) {
                    setActiveHandles(prev => {
                        const next = new Set(prev);
                        next.delete(`trig-${oldLabel}`);
                        next.add(`trig-${newLabel}`);
                        return next;
                    });
                }
            }
        }
    }, [editor, activeHandles]);

    // Sync external changes
    useEffect(() => {
        if (!editor) return;
        const t = data.text || '';
        if (editor.isFocused) return;
        // Compare current JSON to stored JSON
        const currentJson = JSON.stringify(editor.getJSON());
        if (currentJson !== t) {
            if (t.startsWith('{')) {
                try {
                    editor.commands.setContent(JSON.parse(t), undefined);
                } catch { /* ignore */ }
            } else {
                editor.commands.setContent(parseMarkdownToCustomNodes(t), undefined);
            }
        }
    }, [data.text, editor]);

    // Force handles sync when they're toggled
    useEffect(() => {
        const timer = setTimeout(syncHandlesFromDOM, 20);
        return () => clearTimeout(timer);
    }, [activeHandles]);


    // ── HANDLE SYNC LOGIC ──────────────────────────────────────────────────
    const syncHandlesFromDOM = useCallback(() => {
        if (!contentRef.current || !containerRef.current) return;
        const containerRect = containerRef.current.getBoundingClientRect();
        if (containerRect.height === 0) return;

        const interactiveEls = Array.from(contentRef.current.querySelectorAll('.has-handle'));
        type LineGroup = { centerY: number; elements: Element[] };
        const lineGroups: LineGroup[] = [];

        interactiveEls.forEach(el => {
            const rect = el.getBoundingClientRect();
            const cy = rect.top + rect.height / 2;
            const existing = lineGroups.find(g => Math.abs(g.centerY - cy) < LINE_Y_THRESHOLD);
            if (existing) existing.elements.push(el);
            else lineGroups.push({ centerY: cy, elements: [el] });
        });

        lineGroups.sort((a, b) => a.centerY - b.centerY);
        const newHandles: CustomHandle[] = [];
        const newOutputs: Record<string, string> = {};

        lineGroups.forEach((group, groupIdx) => {
            group.elements.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
            const totalInGroup = group.elements.length;
            const STAGGER_GAP = 12;

            group.elements.forEach((el, subIdx) => {
                const isDataPill = el.classList.contains('data-pill-render');
                const isTriggerBtn = el.classList.contains('trigger-btn');
                const name = el.getAttribute('data-name');
                const label = el.getAttribute('data-label');
                const hType: HandleType = isTriggerBtn ? 'trigger-out' : 'output';
                const hPrefix = isTriggerBtn ? 'tr' : 'out';
                
                // Use variable name or trigger label if available for the handle ID
                const identifier = (isDataPill && name) ? name : (isTriggerBtn && label) ? label : `${groupIdx}-${subIdx}`;
                const hId = `h-auto-${hPrefix}-${identifier}`;
                
                const staggerOffset = (subIdx - (totalInGroup - 1) / 2) * STAGGER_GAP;
                const offset = Math.max(0, Math.min(100, ((group.centerY + staggerOffset - containerRect.top) / containerRect.height) * 100));
                
                newHandles.push({ id: hId, type: hType, position: 'right', offset, label: (isDataPill && name) ? name : undefined });
                if (isDataPill) newOutputs[hId] = el.getAttribute('data-value') || '';
                el.setAttribute('data-handle-id', hId);
            });
        });

        const manualHandles = (data.handles || []).filter((h: CustomHandle) => !h.id.startsWith('h-auto-'));
        const combinedHandles = [...manualHandles, ...newHandles];
        const roundOff = (h: CustomHandle) => ({ ...h, offset: Math.round(h.offset * 10) / 10 });
        const currentHandleSummary = JSON.stringify((data.handles || []).map(roundOff));
        const newHandleSummary = JSON.stringify(combinedHandles.map(roundOff));

        if (currentHandleSummary !== newHandleSummary || JSON.stringify(newOutputs) !== JSON.stringify(data.outputs || {})) {
            updateNodeData(id, { handles: combinedHandles, outputs: newOutputs });
        }
        updateNodeInternals(id);
    }, [data.handles, id, updateNodeData, updateNodeInternals]);

    useEffect(() => {
        const timer = setTimeout(syncHandlesFromDOM, 50);
        return () => clearTimeout(timer);
    }, [data.text, syncHandlesFromDOM]);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver(() => syncHandlesFromDOM());
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [syncHandlesFromDOM]);

    useEffect(() => {
        const el = contentRef.current;
        if (!el) return;
        const handler = (e: any) => {
            const handleId = e.detail.handleId;
            if (handleId) triggerNode(id, handleId);
        };
        el.addEventListener('node-trigger', handler);
        return () => el.removeEventListener('node-trigger', handler);
    }, [id, triggerNode]);

    // Toolbar application
    const insertMathOrData = () => {
        const latex = mathFieldRef.current?.value || '';
        const name = mathNameInputRef.current?.value || '';
        if (!latex) {
            setMathInputOpen(false);
            editingValueRef.current = null;
            editingNameRef.current = null;
            return;
        }

        if (editor) {
            if (editingValueRef.current !== null) {
                let foundPos = -1;
                let attrs: any = null;
                editor.state.doc.descendants((node, pos) => {
                    // Try to match both value and name to be more specific, or just value if that's what we have
                    if (node.type.name === 'mathPill' && 
                        node.attrs.value === editingValueRef.current && 
                        (editingNameRef.current === null || node.attrs.name === editingNameRef.current)) {
                        foundPos = pos;
                        attrs = node.attrs;
                        return false;
                    }
                });

                if (foundPos !== -1) {
                    editor.commands.command(({ tr }) => {
                        tr.setNodeMarkup(foundPos, undefined, { ...attrs, value: latex, name });
                        return true;
                    });
                    
                    // Handle cleanup and rotation for activeHandles if needed
                    const oldKey = `math-${editingValueRef.current}`;
                    const newKey = `math-${latex}`;
                    if (activeHandles.has(oldKey)) {
                        setActiveHandles(prev => {
                            const next = new Set(prev);
                            next.delete(oldKey);
                            next.add(newKey);
                            return next;
                        });
                    }
                }
            } else {
                // Insert new directly as a mathPill node and add a trailing space
                if (editor) {
                    editor.chain()
                        .insertContent({ type: 'mathPill', attrs: { value: latex, name } })
                        .insertContent(' ')
                        .focus()
                        .run();
                }
            }
        }
        setMathInputOpen(false);
        editingValueRef.current = null;
        editingNameRef.current = null;
    };

    const applyFormatting = (cmd: 'bold' | 'heading' | 'bulletList') => {
        if (!editor) return;
        editor.chain().focus();
        if (cmd === 'bold') editor.chain().toggleBold().run();
        if (cmd === 'heading') editor.chain().toggleHeading({ level: 1 }).run();
        if (cmd === 'bulletList') editor.chain().toggleBulletList().run();
    };

    return (
        <TextNodeContext.Provider value={{ isHandleActive, toggleHandle, editMath, renameTrigger }}>
        <div
            id={`text-node-${id}`}
            ref={containerRef}
            className={`math-node text-node ${selected ? 'selected' : ''}`}
            onClick={(e) => {
                // Ignore clicks that are inside the toolbar or popup
                if ((e.target as Element).closest('.text-toolbar') || (e.target as Element).closest('.math-popup')) {
                    return;
                }
                if (editor && !editor.isFocused && !mathInputOpen) {
                    editor.commands.focus('end');
                }
            }}
            style={{
                minWidth: '150px', minHeight: '80px', width: '100%', height: '100%',
                background: 'rgba(15, 15, 20, 0.85)',
                border: '1px solid rgba(255, 255, 255, 0.1)', // Removed blue selection border
                borderRadius: '8px', display: 'flex', flexDirection: 'column',
                position: 'relative', overflow: 'visible',
                cursor: 'text' // Show text cursor anywhere in the node
            }}
            onMouseDown={(e) => { if (mathInputOpen) e.stopPropagation(); }}
        >
            <NodeResizer color="transparent" isVisible={selected} minWidth={150} minHeight={80} lineStyle={{ border: 'none' }} handleStyle={{ width: 8, height: 8, borderRadius: '50%', background: 'transparent', border: 'none' }} />

            <div className="node-header" style={{ padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0, 0, 0, 0.3)', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.6, fontWeight: 700 }}>Note / Logic</span>
            </div>

            {(selected || editor?.isFocused) && (
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
                    <button title="Bold" onClick={() => applyFormatting('bold')}>B</button>
                    <button title="H1" onClick={() => applyFormatting('heading')}>H1</button>
                    <button title="Bullet" onClick={() => applyFormatting('bulletList')}>•</button>
                    <button title="Add Data Pill" onClick={() => { 
                        editingValueRef.current = null;
                        setMathInputOpen(true);
                        setTimeout(() => mathFieldRef.current?.focus(), 100);
                    }} style={{ color: '#4facfe', fontWeight: 'bold' }}>$$ math $$</button>
                    <button title="Trigger button" onClick={() => {
                        // Count existing triggerButton nodes directly in the doc
                        let count = 0;
                        editor?.state.doc.descendants(node => {
                            if (node.type.name === 'triggerButton') count++;
                        });
                        const defaultLabel = `Trigger ${count + 1}`;
                        editor?.chain().insertContent({ type: 'triggerButton', attrs: { label: defaultLabel } }).insertContent(' ').focus().run();
                    }} style={{ color: '#ffcc00', fontWeight: 'bold' }}>[ ⚡ ](trig)</button>

                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '8px', alignItems: 'center' }}>
                        {['#ffffff', '#ff7eb9', '#7afcff', '#4facfe', '#43e97b', '#ffcc33'].map(col => (
                            <div 
                                key={col} 
                                onClick={() => updateNodeData(id, { style: { ...(data.style || {}), color: col } })}
                                style={{ 
                                    width: 12, height: 12, borderRadius: '50%', background: col, cursor: 'pointer', 
                                    border: (data.style?.color || '#ffffff') === col ? '1px solid #fff' : '1px solid transparent',
                                    boxShadow: (data.style?.color || '#ffffff') === col ? `0 0 5px ${col}` : 'none'
                                }} 
                            />
                        ))}
                    </div>
                </div>
            )}

            {mathInputOpen && (
                <div className="math-popup nodrag" style={{ 
                    position: 'absolute', 
                    top: 'calc(100% + 8px)', 
                    left: '10px', 
                    right: '10px', 
                    background: 'rgba(26, 26, 32, 0.95)', 
                    backdropFilter: 'blur(20px)',
                    border: '1px solid #4facfe', 
                    borderRadius: '8px', 
                    padding: '16px', 
                    zIndex: 1100, 
                    boxShadow: '0 10px 40px rgba(0,0,0,0.6)', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '12px' 
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ fontSize: '0.65rem', color: '#888', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Variable Name (Optional)</div>
                        <input 
                            ref={mathNameInputRef}
                            type="text" 
                            placeholder="e.g. mass, price, x_0..." 
                            style={{ 
                                background: '#000', 
                                border: '1px solid #333', 
                                color: '#4facfe', 
                                padding: '6px 10px', 
                                borderRadius: '4px', 
                                outline: 'none',
                                fontSize: '0.85rem'
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter') mathFieldRef.current?.focus(); }}
                        />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ fontSize: '0.65rem', color: '#4facfe', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Formula / Value</div>
                        {/* @ts-ignore */}
                        <math-field ref={mathFieldRef} style={{ background: '#000', color: '#fff', padding: '8px', borderRadius: '4px', border: '1px solid #333', fontSize: '1.1rem' }}
                            onKeyDown={(e: any) => { if (e.key === 'Enter') { e.preventDefault(); insertMathOrData(); } }}
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
                        <button onClick={() => setMathInputOpen(false)} style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: '0.8rem', padding: '4px 8px' }}>Cancel</button>
                        <button onClick={() => insertMathOrData()} style={{ background: '#4facfe', border: 'none', color: '#000', padding: '6px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}>Save Math Pill</button>
                    </div>
                </div>
            )}

            <div ref={contentRef} className="node-content custom-scrollbar nodrag" style={{ 
                position: 'relative', flexGrow: 1, overflowY: 'auto', padding: '0px'
            }}>
                <EditorContent 
                    editor={editor} 
                    className="tiptap-editor-container nodrag"
                    style={{
                        padding: '12px',
                        fontSize: `${data.style?.fontSize || 1}rem`,
                        color: data.style?.color || '#cbd5e1',
                        lineHeight: '1.6',
                        outline: 'none',
                        minHeight: '60px'
                    }}
                />
            </div>

            <DynamicHandles nodeId={id} handles={data.handles} allowedTypes={['input']} touchingEdges={data.touchingEdges} />

            <style>{`
                .tiptap-editor-container .ProseMirror { outline: none; }
                .tiptap-editor-container .ProseMirror p { margin-bottom: 0.5em; }
                .tiptap-editor-container .ProseMirror p:last-child { margin-bottom: 0; }
                .data-pill-render:hover, .trigger-btn:hover {
                    filter: brightness(1.2);
                    box-shadow: 0 0 10px rgba(79, 172, 254, 0.2);
                }
                .has-handle {
                    box-shadow: 0 0 0 1px rgba(79, 172, 254, 0.5) !important;
                }
                .text-toolbar button { background: transparent; border: none; color: #ccc; cursor: pointer; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; transition: all 0.2s; }
                .text-toolbar button:hover { background: rgba(255,255,255,0.1); color: #fff; }
                math-field:focus-within { outline: 2px solid #4facfe; border-radius: 4px; }
            `}</style>
        </div>
        </TextNodeContext.Provider>
    );
}
