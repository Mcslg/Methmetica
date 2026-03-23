import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { type NodeProps, type Node, NodeResizer, useUpdateNodeInternals } from '@xyflow/react';
import { createPortal } from 'react-dom';
import { EditorContent, useEditor, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown as TiptapMarkdown } from 'tiptap-markdown';
import { Node as TiptapNode, mergeAttributes, type ExtendedRegExpMatchArray, type Range } from '@tiptap/core';
import { type EditorState } from '@tiptap/pm/state';
import katex from 'katex';
import 'katex/dist/katex.min.css';
// @ts-ignore
import nerdamer from 'nerdamer/all.min';
import { getMathEngine } from '../utils/MathEngine';
import useStore, { type AppState, type NodeData, type CustomHandle, type HandleType } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';
import { Icons } from '../components/Icons';

const LINE_Y_THRESHOLD = 12; // px

export const TextNodeContext = React.createContext<{
    isHandleActive: (id: string) => boolean;
    toggleHandle: (id: string) => void;
    editMath: (val: string, pos?: { x: number, y: number }) => void;
    renameTrigger: (oldLabel: string, newLabel: string) => void;
}>({
    isHandleActive: () => false,
    toggleHandle: () => { },
    editMath: () => { },
    renameTrigger: () => { },
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
            const isAltPressed = useStore(state => state.isAltPressed);
            const [localShowHandle, setLocalShowHandle] = useState(ctx.isHandleActive(`math-${val}`));
            const [isHovered, setIsHovered] = useState(false);
            const pillRef = useRef<HTMLSpanElement>(null);
            const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
            const [mouseDownPos, setMouseDownPos] = useState({ x: 0, y: 0 });

            useEffect(() => {
                let rafId: number;
                const update = () => {
                    if (isHovered && pillRef.current) {
                        const rect = pillRef.current.getBoundingClientRect();
                        setCoords({ top: rect.top, left: rect.left, width: rect.width });
                        rafId = requestAnimationFrame(update);
                    }
                };
                if (isHovered) {
                    update();
                }
                return () => cancelAnimationFrame(rafId);
            }, [isHovered]);

            const [isExpanded, setIsExpanded] = useState(false);

            useEffect(() => {
                setLocalShowHandle(ctx.isHandleActive(`math-${val}`));
            }, [ctx, val]);

            const evaluatedVal = useMemo(() => {
                if (!isAltPressed) return null;
                try {
                    const ce = getMathEngine();
                    const localVars: Record<string, any> = {};
                    editor.state.doc.descendants((node) => {
                        if (node.type.name === 'mathPill' && node.attrs.name && node.attrs.value) {
                            try {
                                localVars[node.attrs.name] = ce.parse(node.attrs.value).evaluate();
                            } catch (e) { }
                        }
                        return true;
                    });

                    ce.pushScope();
                    Object.entries(localVars).forEach(([k, v]) => ce.assign(k, v));

                    let result;
                    // Check for solve pattern: "x? x^2=4" or "(x,y)? x+y=10, x-y=2"
                    const solveMatch = val.match(/^([a-zA-Z\d\\,()\s]+)\?\s*(.*)$/);
                    if (solveMatch) {
                        try {
                            const targetVar = solveMatch[1].replace(/[\\\(\)\s]/g, ''); // Clean LaTeX, parentheses and spaces
                            let equation = solveMatch[2];

                            // Substitute known variables
                            Object.entries(localVars).forEach(([k, v]) => {
                                if (k !== targetVar) {
                                    const valToSub = v.numericValue !== undefined ? v.numericValue : (v.value || 0);
                                    equation = equation.replace(new RegExp(`\\b${k}\\b`, 'g'), `(${valToSub})`);
                                }
                            });

                            // Let nerdamer solve it
                            let eqs: any = equation;
                            if (equation.includes(',') || equation.includes(';')) {
                                eqs = equation.split(/[;,]/).map((e: string) => e.trim());
                            }

                            let vars: any = targetVar;
                            if (targetVar.includes(',')) {
                                vars = targetVar.split(',').map((v: string) => v.trim());
                            }

                            const cleanResult = (nerdamer as any).solveEquations(eqs, vars);
                            const list = Array.isArray(cleanResult) ? cleanResult.map((sol: any) => {
                                if (Array.isArray(sol) && sol.length === 2 && typeof sol[0] === 'string') {
                                    return `${sol[0]}=${(nerdamer as any)(sol[1]).toTeX()}`;
                                }
                                return (nerdamer as any)(sol).toTeX();
                            }) : [(nerdamer as any)(cleanResult).toTeX()];
                            result = JSON.stringify(list);
                        } catch (err) {
                            console.error('Nerdamer solve error:', err);
                            result = `["Error"]`;
                        }
                    } else {
                        const expr = ce.parse(val);
                        result = expr.evaluate().latex;
                    }

                    ce.popScope();
                    return result;
                } catch (e) {
                    console.error('Eval error:', e);
                    return null;
                }
            }, [val, isAltPressed, editor]);

            const displayVal = useMemo(() => (isAltPressed && evaluatedVal !== null) ? evaluatedVal : val, [isAltPressed, evaluatedVal, val]);

            const sequenceData = useMemo(() => {
                let s = String(displayVal).trim();

                // Use global regex to clean common LaTeX markers
                const normalized = s
                    .replace(/\\left\[/g, '[')
                    .replace(/\\right\]/g, ']')
                    .replace(/\\lbrack/g, '[')
                    .replace(/\\rbrack/g, ']')
                    .replace(/\\\{/g, '[')
                    .replace(/\\\}/g, ']')
                    // Final pass to trim and match standard brackets
                    .trim();

                if (normalized.startsWith('[') && normalized.endsWith(']')) {
                    try {
                        const parsed = JSON.parse(normalized);
                        if (Array.isArray(parsed)) return parsed;
                    } catch {
                        const content = normalized.slice(1, -1);
                        if (!content.trim()) return [];
                        // Join and split by comma, cleaning up any residual backslashes
                        return content.split(',').map(item => item.trim().replace(/\\/g, ''));
                    }
                }
                return null;
            }, [displayVal]);

            const html = useMemo(() => {
                let textToRender = displayVal;

                // Simultaneous Equations / Vertical Stack Handling
                // If it starts with { (raw or LaTeX), we treat it as a cases block
                const trimmed = textToRender.trim();
                const openers = ['{', '\\{', '\\left\\{', '\\left\\lbrace'];
                const closers = ['}', '\\}', '\\right.', '\\right\\}', '\\right\\rbrace'];

                let isStacked = false;
                let content = trimmed;

                for (const opener of openers) {
                    if (trimmed.startsWith(opener)) {
                        isStacked = true;
                        content = content.slice(opener.length);
                        break;
                    }
                }

                if (isStacked) {
                    for (const closer of closers) {
                        if (content.endsWith(closer)) {
                            content = content.slice(0, -closer.length);
                            break;
                        }
                    }

                    // Split equations by comma and join with \\ for LaTeX cases
                    const equations = content.split(',').map((eq: string) => eq.trim()).filter(Boolean);
                    if (equations.length > 1) {
                        textToRender = `\\begin{cases} ${equations.join(' \\\\ ')} \\end{cases}`;
                    }
                } else if (sequenceData) {
                    if (!isExpanded && sequenceData.length > 4) {
                        const first3 = sequenceData.slice(0, 3).join(', ');
                        textToRender = `[${first3}, \\dots, ${sequenceData[sequenceData.length - 1]}]`;
                    } else {
                        textToRender = `[${sequenceData.join(', ')}]`;
                    }
                }

                try {
                    return katex.renderToString(textToRender, {
                        throwOnError: false,
                        displayMode: false,
                        output: 'html' // Disable MathML to stop double-selection logic in browsers
                    });
                } catch (e) {
                    return textToRender;
                }
            }, [displayVal, sequenceData, isExpanded]);

            const onRightClick = (e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                ctx.toggleHandle(`math-${val}`);
                setLocalShowHandle(!localShowHandle);
            };

            const handleMouseDown = async (e: React.MouseEvent) => {
                // Only handle Left Click
                if (e.button !== 0) return;

                if (e.shiftKey || e.altKey || e.metaKey) {
                    e.preventDefault();
                    e.stopPropagation();

                    const currentPos = typeof getPos === 'function' ? getPos() : null;
                    if (typeof currentPos !== 'number') return;

                    const rawVal = evaluatedVal || val;

                    // Alt+Click Split Logic: x=3, y=5 or ["x=3","y=5"]
                    if (e.altKey) {
                        let equations: string[] = [];
                        // Clean LaTeX bracket markers before splitting
                        const normalizedStr = rawVal
                            .replace(/\\left\[/g, '[').replace(/\\right\]/g, ']')
                            .replace(/\\lbrack/g, '[').replace(/\\rbrack/g, ']')
                            .replace(/\\lbrace/g, '').replace(/\\rbrace/g, '')
                            .replace(/\\left\{/g, '').replace(/\\right\./g, '')
                            .replace(/\\\{/g, '').replace(/\\\}/g, '')
                            .replace(/[\[\]"]/g, '')
                            .trim();

                        if ((normalizedStr.includes('=') || normalizedStr.includes(':')) && normalizedStr.includes(',')) {
                            // Split by comma BUT handle splitting only top-level commas if needed
                            equations = normalizedStr.split(',').map((eq: string) => eq.trim()).filter(Boolean);
                        } else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
                            try {
                                const parsed = JSON.parse(rawVal);
                                if (Array.isArray(parsed)) equations = parsed.map(String);
                            } catch (err) { }
                        }

                        if (equations.length >= 2) {
                            // SPLIT!
                            editor.chain().focus().command(({ tr }) => {
                                // Delete current pill
                                tr.delete(currentPos, currentPos + 1);

                                let insertionPos = currentPos;
                                equations.forEach((eqn, idx) => {
                                    // Match x=3 or x:3
                                    const match = eqn.match(/^([a-zA-Z\d\\_]+)[:=](.*)$/);
                                    let nodeToInsert;
                                    if (match) {
                                        nodeToInsert = editor.schema.nodes.mathPill.create({
                                            name: match[1].trim(),
                                            value: match[2].trim()
                                        });
                                    } else {
                                        nodeToInsert = editor.schema.nodes.mathPill.create({ value: eqn });
                                    }

                                    tr.insert(insertionPos, nodeToInsert);
                                    insertionPos += 1; // Move past the newly inserted node

                                    if (idx < equations.length - 1) {
                                        tr.insertText(' ', insertionPos);
                                        insertionPos += 1;
                                    }
                                });
                                return true;
                            }).run();
                            return;
                        }
                    }

                    // Fallback to simple replacement
                    if (rawVal !== val) {
                        editor.chain().focus().command(({ tr }) => {
                            tr.setNodeMarkup(currentPos, undefined, { ...node.attrs, value: rawVal });
                            return true;
                        }).run();
                    }
                    return;
                }

                // Record mouse down position to distinguish click vs drag
                setMouseDownPos({ x: e.clientX, y: e.clientY });
                // Allow selection by NOT calling preventDefault() here when no modifiers are present
            };

            const handleMouseUp = (e: React.MouseEvent) => {
                if (e.button !== 0 || e.shiftKey || e.altKey || e.metaKey) return;

                // Check if user is trying to select text by measuring drag distance
                const dragDist = Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y);
                if (dragDist > 5) {
                    return; // Likely a drag selection, don't open editor
                }

                e.preventDefault();
                e.stopPropagation();
                ctx.editMath(val, { x: e.clientX, y: e.clientY });
            };

            const handleCopy = (e: React.ClipboardEvent) => {
                const textToCopy = displayVal;
                e.clipboardData.setData('text/plain', textToCopy);
                e.preventDefault();
                e.stopPropagation(); // Stop propagation to parent (Tiptap)
            };

            return (
                <NodeViewWrapper
                    as="span"
                    className={`data-pill-render ${localShowHandle ? 'has-handle' : ''} ${isAltPressed ? 'alt-preview' : ''}`}
                    data-value={val}
                    data-name={name}
                    data-show-handle={localShowHandle ? 'true' : 'false'}
                    onContextMenu={onRightClick}
                    onMouseDown={handleMouseDown}
                    onMouseUp={handleMouseUp}
                    onCopy={handleCopy}
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                    ref={pillRef}
                    contentEditable={false}
                    style={{
                        display: 'inline-flex',
                        position: 'relative',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: isAltPressed ? 'rgba(67, 233, 123, 0.1)' : 'rgba(79, 172, 254, 0.05)',
                        color: isAltPressed ? '#43e97b' : '#4facfe',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.9em',
                        cursor: 'pointer',
                        border: localShowHandle ? (isAltPressed ? '1px solid #43e97b' : '1px solid #4facfe') : (isAltPressed ? '1px solid rgba(67, 233, 123, 0.4)' : '1px solid rgba(79, 172, 254, 0.3)'),
                        margin: name ? '10px 4px 4px 4px' : '0 4px',
                        userSelect: 'text',
                        minHeight: '1.4em',
                        transition: 'all 0.2s ease',
                        verticalAlign: 'middle',
                        top: '-1px',
                        boxShadow: localShowHandle ? (isAltPressed ? '0 0 10px rgba(67, 233, 123, 0.3)' : '0 0 10px rgba(79, 172, 254, 0.3)') : 'none',
                        zIndex: isAltPressed ? 10 : 1
                    }}
                >
                    {name && (
                        <span style={{
                            position: 'absolute',
                            top: '-8px',
                            left: '8px',
                            fontSize: '0.6rem',
                            color: isAltPressed ? '#43e97b' : 'rgba(255,255,255,0.5)',
                            background: '#15151a',
                            padding: '0 4px',
                            lineHeight: 1,
                            fontWeight: 700,
                            letterSpacing: '0.05em',
                            pointerEvents: 'none',
                            opacity: isAltPressed ? 0.8 : 1
                        }}>
                            {name}
                        </span>
                    )}

                    <span style={{
                        position: 'absolute',
                        color: 'transparent',
                        opacity: 1, // Visible to show selection background
                        zIndex: 0,
                        pointerEvents: 'auto',
                        userSelect: 'text',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        {displayVal}
                    </span>

                    <span
                        dangerouslySetInnerHTML={{ __html: html }}
                        style={{
                            pointerEvents: 'none',
                            userSelect: 'none', // Strictly unselectable so text is never mixed
                            lineHeight: 1,
                            zIndex: 1,
                            position: 'relative'
                        }}
                    />

                    {sequenceData && sequenceData.length > 4 && (
                        <span
                            onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
                            style={{
                                marginLeft: '8px',
                                background: isAltPressed ? 'rgba(67, 233, 123, 0.15)' : 'rgba(255,255,255,0.08)',
                                borderRadius: '4px',
                                padding: '1px 5px',
                                fontSize: '0.6rem',
                                color: isAltPressed ? '#43e97b' : 'rgba(255,255,255,0.4)',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                border: '1px solid rgba(255,255,255,0.05)',
                                fontWeight: 700,
                                userSelect: 'none'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = isAltPressed ? 'rgba(67, 233, 123, 0.15)' : 'rgba(255,255,255,0.08)'}
                        >
                            {isExpanded ? 'Collapse' : `${sequenceData.length} items`}
                        </span>
                    )}

                    {isHovered && !isAltPressed && coords.width > 0 && createPortal(
                        <div className="nodrag" style={{
                            position: 'fixed',
                            top: coords.top - 10,
                            left: coords.left + coords.width / 2,
                            transform: 'translateX(-50%) translateY(-100%)',
                            background: 'rgba(20, 20, 25, 0.95)',
                            backdropFilter: 'blur(12px)',
                            color: '#fff',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '0.65rem',
                            whiteSpace: 'nowrap',
                            pointerEvents: 'none',
                            zIndex: 999999,
                            border: '1px solid rgba(79, 172, 254, 0.4)',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                            fontWeight: 600,
                            letterSpacing: '0.02em',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <span style={{ color: '#4facfe' }}>🖱️</span> Edit | <span style={{ color: '#43e97b' }}>⌥+🖱️</span> Compute | <span style={{ color: '#ffcc33' }}>Right-click</span>: Handle
                        </div>,
                        document.body
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



// ── MAIN COMPONENT ────────────────────────────────────────────────────────

export function TextNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    const updateNodeInternals = useUpdateNodeInternals();
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    const [mathInputOpen, setMathInputOpen] = useState(false);
    const [popupPos, setPopupPos] = useState<{ x: number, y: number } | null>(null);
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
            .replace(/\$\$(.*?)\$\$/g, '<math-pill-md value="$1"></math-pill-md>');
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

                        // Calculate position near caret
                        try {
                            const coords = view.coordsAtPos(selection.from - 1);
                            setPopupPos({ x: coords.left, y: coords.bottom + 10 });
                        } catch (e) {
                            const rect = containerRef.current?.getBoundingClientRect();
                            if (rect) setPopupPos({ x: rect.left + 20, y: rect.top + 50 });
                        }

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

    const editMath = useCallback((val: string, pos?: { x: number, y: number }) => {
        // Find if this node has a name
        let currentName = '';
        if (val) {
            editor?.state.doc.descendants((node) => {
                if (node.type.name === 'mathPill' && node.attrs.value === val) {
                    currentName = node.attrs.name || '';
                    return false;
                }
            });
            editingValueRef.current = val;
            editingNameRef.current = currentName;
        } else {
            editingValueRef.current = null;
            editingNameRef.current = null;
        }

        if (pos) {
            setPopupPos({ x: pos.x, y: pos.y + 15 });
        } else if (editor) {
            try {
                const { from } = editor.state.selection;
                const coords = editor.view.coordsAtPos(from);
                setPopupPos({ x: coords.left, y: coords.bottom + 10 });
            } catch (e) {
                const rect = containerRef.current?.getBoundingClientRect();
                if (rect) setPopupPos({ x: rect.left + 20, y: rect.top + 50 });
            }
        }

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

    const renameTrigger = useCallback((_oldLabel: string, _newLabel: string) => {}, []);

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
                const name = el.getAttribute('data-name');
                const hType: HandleType = 'output';
                const hPrefix = 'out';

                // Use variable name or trigger label if available for the handle ID
                const identifier = (isDataPill && name) ? name : `${groupIdx}-${subIdx}`;
                const hId = `h-auto-${hPrefix}-${identifier}`;

                const staggerOffset = (subIdx - (totalInGroup - 1) / 2) * STAGGER_GAP;
                const offset = Math.max(0, Math.min(100, ((group.centerY + staggerOffset - containerRect.top) / containerRect.height) * 100));

                newHandles.push({ id: hId, type: hType, position: 'right', offset, label: (isDataPill && name) ? name : undefined });
                if (isDataPill) {
                    let outVal = el.getAttribute('data-value') || '';
                    if (outVal.trim() === '\\top') outVal = '1';
                    if (outVal.trim() === '\\bot') outVal = '0';
                    newOutputs[hId] = outVal;
                }
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
                        .focus() // Ensure focus before insertion
                        .insertContent({ type: 'mathPill', attrs: { value: latex, name } })
                        .insertContent(' ')
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
                    position: 'relative', overflow: 'visible',
                    cursor: 'text'
                }}
                onMouseDown={(e) => { if (mathInputOpen) e.stopPropagation(); }}
            >
                <NodeResizer color="transparent" isVisible={selected} minWidth={150} minHeight={80} lineStyle={{ border: 'none' }} handleStyle={{ width: 8, height: 8, borderRadius: '50%', background: 'transparent', border: 'none' }} />

                <div className="node-header">
                    <span><Icons.Text /> Text</span>
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
                            background: 'var(--bg-node)',
                            border: '1px solid var(--border-node)',
                            borderRadius: '10px',
                            boxShadow: 'var(--node-shadow)',
                            flexWrap: 'wrap',
                            zIndex: 1000
                        }}>
                        <button title="Bold" onClick={() => applyFormatting('bold')}>B</button>
                        <button title="H1" onClick={() => applyFormatting('heading')}>H1</button>
                        <button title="Bullet" onClick={() => applyFormatting('bulletList')}>•</button>
                        <button title="Add Data Pill" onClick={() => {
                            editMath('');
                        }} style={{ color: '#4facfe', fontWeight: 'bold' }}>$$ math $$</button>

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

                {mathInputOpen && popupPos && createPortal(
                    <div className="math-popup nodrag" style={{
                        position: 'fixed',
                        left: popupPos.x,
                        top: popupPos.y,
                        width: '320px',
                        background: 'rgba(26, 26, 32, 0.98)',
                        backdropFilter: 'blur(20px)',
                        border: '1px solid #4facfe',
                        borderRadius: '10px',
                        padding: '12px',
                        zIndex: 2000,
                        boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 15px rgba(79, 172, 254, 0.2)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        animation: 'popup-appear 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ fontSize: '0.6rem', color: '#4facfe', textTransform: 'uppercase', fontWeight: 700 }}>Formula</div>
                            {/* @ts-ignore */}
                            <math-field ref={mathFieldRef} style={{ background: '#000', color: '#fff', padding: '6px 8px', borderRadius: '4px', border: '1px solid #333', fontSize: '1rem' }}
                                onKeyDownCapture={(e: any) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        insertMathOrData();
                                    }
                                    if (e.key === ':') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setTimeout(() => mathNameInputRef.current?.focus(), 10);
                                    }
                                    if (e.key === 'Escape') {
                                        setMathInputOpen(false);
                                    }
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px' }}>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '0.65rem', color: '#888', fontWeight: 700 }}>NAME</span>
                                <input
                                    ref={mathNameInputRef}
                                    type="text"
                                    placeholder="?"
                                    style={{
                                        background: '#000',
                                        border: '1px solid #333',
                                        color: '#4facfe',
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        outline: 'none',
                                        fontSize: '0.75rem',
                                        flex: 1,
                                        minWidth: 0
                                    }}
                                    onKeyDownCapture={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            insertMathOrData();
                                        }
                                    }}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => setMathInputOpen(false)} style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600 }}>Cancel</button>
                                <button onClick={() => insertMathOrData()} style={{ background: '#4facfe', border: 'none', color: '#000', padding: '5px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 800 }}>Save</button>
                            </div>
                        </div>
                    </div>,
                    document.body
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
                            color: data.style?.color || 'var(--text-main)',
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
                .alt-preview {
                    animation: pulse-green 2s infinite;
                }
                @keyframes pulse-green {
                    0% { box-shadow: 0 0 5px rgba(67, 233, 123, 0.2); }
                    50% { box-shadow: 0 0 15px rgba(67, 233, 123, 0.5); }
                    100% { box-shadow: 0 0 5px rgba(67, 233, 123, 0.2); }
                }
                @keyframes popup-appear {
                    from { transform: scale(0.95); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
                .text-toolbar button { background: transparent; border: none; color: #ccc; cursor: pointer; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; transition: all 0.2s; }
                .text-toolbar button:hover { background: rgba(255,255,255,0.1); color: #fff; }
                math-field:focus-within { outline: 2px solid #4facfe; border-radius: 4px; }
            `}</style>
            </div>
        </TextNodeContext.Provider>
    );
}
