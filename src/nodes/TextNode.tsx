import React, { useRef, useEffect, useCallback, useMemo, useState, memo } from 'react';
import { type NodeProps, type Node, NodeResizer, useUpdateNodeInternals, Handle, Position, useReactFlow } from '@xyflow/react';
import { createPortal } from 'react-dom';
import { EditorContent, useEditor, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { Markdown as TiptapMarkdown } from 'tiptap-markdown';
import { Underline } from '@tiptap/extension-underline';
import { Highlight } from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { TextAlign } from '@tiptap/extension-text-align';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Node as TiptapNode, mergeAttributes, type ExtendedRegExpMatchArray, type Range } from '@tiptap/core';
import { type EditorState } from '@tiptap/pm/state';
import katex from 'katex';
import 'katex/dist/katex.min.css';
// @ts-ignore
import nerdamer from 'nerdamer/all.min';
import { getMathEngine } from '../utils/MathEngine';
import useStore, { type AppState, type NodeData, type CustomHandle, type HandleType } from '../store/useStore';
import { useShallow } from 'zustand/react/shallow';
import { DynamicHandles } from './DynamicHandles';
import { Icons } from '../components/Icons';
import { MathInput } from '../components/MathInput';

import { countRender } from '../components/DebugOverlay';

// Helper for implicit multiplication
const LINE_Y_THRESHOLD = 12; // px

export const TextNodeContext = React.createContext<{
    nodeId: string;
    slots?: Record<string, any>;
    isHandleActive: (id: string) => boolean;
    toggleHandle: (id: string) => void;
    editMath: (val: string, pos?: { x: number, y: number }) => void;
    renameTrigger: (oldLabel: string, newLabel: string) => void;
    triggerSync: () => void;
    handleEject: (name: string, pos?: { x: number, y: number }) => void;
    inputs?: Record<string, string>;
}>({
    nodeId: '',
    isHandleActive: () => false,
    toggleHandle: () => { },
    editMath: () => { },
    renameTrigger: () => { },
    triggerSync: () => { },
    handleEject: () => { },
    inputs: {},
});

/**
 * SliderPill Extension
 * Matches [x:slider] and renders a mini-slider tied to a named slot
 */
const SliderPill = TiptapNode.create({
    name: 'sliderPill',
    group: 'inline',
    inline: true,
    atom: true,

    addAttributes() {
        return {
            name: {
                default: 'x',
                parseHTML: element => element.getAttribute('data-name'),
                renderHTML: attributes => ({ 'data-name': attributes.name })
            },
        };
    },

    parseHTML() {
        return [
            { tag: 'span[data-type="slider-pill"]' },
            {
                tag: 'slider-pill-md',
                getAttrs: dom => ({ name: (dom as HTMLElement).getAttribute('name') })
            }
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'slider-pill' })];
    },

    addNodeView() {
        return ReactNodeViewRenderer(({ node }: NodeViewProps) => {
            const name = node.attrs.name || 'x';
            const ctx = React.useContext(TextNodeContext);
            const sliderSource = ctx.slots?.[name];
            const globalVars = useStore(state => state.globalVars);

            const sliderId = typeof sliderSource === 'string' ? sliderSource : null;
            const legacySliderNode = typeof sliderSource === 'object' ? sliderSource : null;

            // [PERF] Extremely granular subscription.
            const nodeData = useStore(useShallow(state => {
                if (!sliderId) return null;
                const found = state.nodes.find(n => n.id === sliderId);
                if (!found) return null;
                return { value: found.data.value, min: found.data.min, max: found.data.max, step: found.data.step };
            }));

            // Resolve value: 1. From absorbed node, 2. From Global ($), 3. Null
            let finalValue = "0";
            let finalMin = 0;
            let finalMax = 100;
            let finalStep = 1;
            let exists = false;

            if (nodeData || legacySliderNode) {
                const data = nodeData || (legacySliderNode as any).data;
                finalValue = data.value || "0";
                finalMin = data.min ?? 0;
                finalMax = data.max ?? 100;
                finalStep = data.step ?? 1;
                exists = true;
            } else if (name.startsWith('$') && globalVars[name] !== undefined) {
                finalValue = globalVars[name];
                exists = true; 
            }
            
            const updateNodeData = useStore(state => state.updateNodeData);
            const setGlobalVar = useStore(state => state.setGlobalVar);

            if (!exists) return (
                <NodeViewWrapper as="span" style={{
                    display: 'inline-flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)',
                    color: 'var(--text-sub)', padding: '1px 6px', borderRadius: '4px', border: '1px dashed var(--border-node)',
                    fontSize: '0.65rem', verticalAlign: 'middle', cursor: 'help', opacity: 0.5
                }} title={`Slider '${name}' not found. Merge a Slider node or name it as global (e.g. $x).`}>
                    ? {name}
                </NodeViewWrapper>
            );

            const val = Number(finalValue);


            return (
                <NodeViewWrapper
                    as="span"
                    className="slider-pill-wrapper nodrag has-handle data-pill-render"
                    data-name={name}
                    data-value={val.toString()}
                    data-handle-id={`h-out-${name}`}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle',
                        background: 'var(--bg-card)', border: '1px solid var(--border-node)',
                        borderRadius: '6px', padding: '1px 6px', margin: '0 2px', userSelect: 'none'
                    }}
                >
                    <span style={{ fontSize: '0.65rem', color: 'var(--accent-bright)', fontWeight: 800 }}>{name}</span>
                    <input
                        type="range"
                        min={finalMin}
                        max={finalMax}
                        step={finalStep}
                        value={finalValue}
                        onChange={(e) => {
                                const nextVal = e.target.value;
                                if (name.startsWith('$')) {
                                    setGlobalVar(name, nextVal);
                                }
                                
                                const targetId = sliderId || (legacySliderNode as any)?.id;
                                if (targetId) {
                                    updateNodeData(targetId, { value: nextVal });
                                } else {
                                    const nextSlots = {
                                        ...ctx.slots,
                                        [name]: {
                                            ...(legacySliderNode as any),
                                            data: { ...(legacySliderNode as any).data, value: nextVal }
                                        }
                                    };
                                    updateNodeData(ctx.nodeId, { slots: nextSlots });
                            }
                        }}
                        onPointerDown={e => e.stopPropagation()}

                        style={{
                            width: '50px', height: '3px', appearance: 'none', background: 'var(--border-header)',
                            borderRadius: '2px', outline: 'none', cursor: 'pointer'
                        }}
                    />
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-sub)', minWidth: '18px', textAlign: 'right', cursor: 'pointer' }}
                        title="Ctrl+Drag to eject"
                        onPointerDown={(e) => {
                            if (useStore.getState().isCtrlPressed) {
                                e.stopPropagation();
                                const startX = e.clientX;
                                const startY = e.clientY;
                                const onMove = (me: PointerEvent) => {
                                    useStore.getState().setDraggingEjectPos({ startX, startY, curX: me.clientX, curY: me.clientY });
                                };
                                const onUp = (ue: PointerEvent) => {
                                    window.removeEventListener('pointermove', onMove);
                                    window.removeEventListener('pointerup', onUp);
                                    useStore.getState().setDraggingEjectPos(null);
                                    const dx = ue.clientX - startX;
                                    const dy = ue.clientY - startY;
                                    if (Math.sqrt(dx * dx + dy * dy) > 5) {
                                        ctx.handleEject(name, { x: ue.clientX, y: ue.clientY });
                                    }
                                };
                                window.addEventListener('pointermove', onMove);
                                window.addEventListener('pointerup', onUp, { once: true });
                            }
                        }}
                    >
                        {val.toFixed(1)}
                    </span>
                </NodeViewWrapper>
            );
        });
    },

    addInputRules() {
        return [
            {
                find: /\[([a-zA-Z\d\s]+):slider\]\s$/,
                handler: ({ state, range, match }: { state: any, range: any, match: any }) => {
                    const { tr } = state;
                    const name = match[1];
                    tr.replaceWith(range.from, range.to, this.type.create({ name }));
                },
            } as any,
        ];
    },
});

/**
 * ButtonPill Extension
 * Inline trigger proxy
 */
const ButtonPill = TiptapNode.create({
    name: 'buttonPill',
    group: 'inline',
    inline: true,
    atom: true,
    addAttributes() { return { name: { default: 'buttonNode' } }; },
    parseHTML() { return [{ tag: 'span[data-type="button-pill"]' }, { tag: 'button-pill-md' }]; },
    renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'button-pill' })]; },
    addNodeView() {
        return ReactNodeViewRenderer(({ node }: NodeViewProps) => {
            const name = node.attrs.name || 'buttonNode';
            const ctx = React.useContext(TextNodeContext);
            const source = ctx.slots?.[name];
            const sid = typeof source === 'string' ? source : null;
            // [PERF] Granular subscription for button/trigger
            const exists = useStore(state => sid ? state.nodes.some(n => n.id === sid) : false);

            if (!exists && !source) return <NodeViewWrapper as="span" style={{ opacity: 0.5 }}>[trigger]</NodeViewWrapper>;

            return (
                <NodeViewWrapper as="span" className="trigger-pill-wrapper has-handle"
                    data-name={name} data-handle-id={`h-out-${name}`}
                    style={{ display: 'inline-flex', verticalAlign: 'middle', margin: '0 4px' }}>
                    <button
                        onPointerDown={e => {
                            if (useStore.getState().isCtrlPressed) {
                                e.stopPropagation();
                                const startX = e.clientX;
                                const startY = e.clientY;
                                const onMove = (me: PointerEvent) => {
                                    useStore.getState().setDraggingEjectPos({ startX, startY, curX: me.clientX, curY: me.clientY });
                                };
                                const onUp = (ue: PointerEvent) => {
                                    window.removeEventListener('pointermove', onMove);
                                    window.removeEventListener('pointerup', onUp);
                                    useStore.getState().setDraggingEjectPos(null);
                                    const dx = ue.clientX - startX;
                                    const dy = ue.clientY - startY;
                                    if (Math.sqrt(dx * dx + dy * dy) > 5) {
                                        ctx.handleEject(name, { x: ue.clientX, y: ue.clientY });
                                    }
                                };
                                window.addEventListener('pointermove', onMove);
                                window.addEventListener('pointerup', onUp, { once: true });
                            } else {
                                e.stopPropagation();
                            }
                        }}
                        onClick={() => {
                            const targetId = sid || (source as any)?.id;
                            if (targetId) {
                                useStore.getState().edges.filter(e => e.source === targetId).forEach(e => {
                                    useStore.getState().executeNode(e.target);
                                });
                            }
                        }}

                        style={{
                            background: '#ffcc00', border: 'none', borderRadius: '12px', color: '#000',
                            fontSize: '0.6rem', fontWeight: 800, padding: '2px 8px', cursor: 'pointer'
                        }}
                    >
                        TRIGGER
                    </button>
                </NodeViewWrapper>
            );
        });
    },
    addInputRules() {
        return [{
            find: /\[trigger\]\s$/,
            handler: ({ state, range }: any) => {
                state.tr.replaceWith(range.from, range.to, this.type.create({ name: 'buttonNode' }));
            }
        } as any];
    }
});

/**
 * GatePill Extension
 * Inline gate toggle proxy
 */
const GatePill = TiptapNode.create({
    name: 'gatePill',
    group: 'inline',
    inline: true,
    atom: true,
    addAttributes() { return { name: { default: 'gateNode' } }; },
    parseHTML() { return [{ tag: 'span[data-type="gate-pill"]' }, { tag: 'gate-pill-md' }]; },
    renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'gate-pill' })]; },
    addNodeView() {
        return ReactNodeViewRenderer(({ node }: NodeViewProps) => {
            const name = node.attrs.name || 'gateNode';
            const ctx = React.useContext(TextNodeContext);
            const source = ctx.slots?.[name];
            const updateNodeData = useStore(state => state.updateNodeData);
            const sid = typeof source === 'string' ? source : null;
            // [PERF] Granular subscription for gate value
            const gateValue = useStore(state => {
                const targetId = sid || (source as any)?.id;
                if (!targetId) return null;
                return state.nodes.find(n => n.id === targetId)?.data.value;
            });

            if (gateValue === null && !source) return <NodeViewWrapper as="span" style={{ opacity: 0.5 }}>[gate]</NodeViewWrapper>;

            const isOpen = gateValue === '1';

            return (
                <NodeViewWrapper as="span" className="gate-pill-wrapper has-handle"
                    data-name={name} data-handle-id={`h-out-${name}`}
                    style={{ display: 'inline-flex', verticalAlign: 'middle', margin: '0 4px' }}>
                    <div
                        onPointerDown={(e) => {
                            if (useStore.getState().isCtrlPressed) {
                                e.stopPropagation();
                                const startX = e.clientX;
                                const startY = e.clientY;
                                const onMove = (me: PointerEvent) => {
                                    useStore.getState().setDraggingEjectPos({ startX, startY, curX: me.clientX, curY: me.clientY });
                                };
                                const onUp = (ue: PointerEvent) => {
                                    window.removeEventListener('pointermove', onMove);
                                    window.removeEventListener('pointerup', onUp);
                                    useStore.getState().setDraggingEjectPos(null);
                                    const dx = ue.clientX - startX;
                                    const dy = ue.clientY - startY;
                                    if (Math.sqrt(dx * dx + dy * dy) > 5) {
                                        ctx.handleEject(name, { x: ue.clientX, y: ue.clientY });
                                    }
                                };
                                window.addEventListener('pointermove', onMove);
                                window.addEventListener('pointerup', onUp, { once: true });
                            } else {
                                e.stopPropagation();
                            }
                        }}
                        onClick={() => {
                            const targetId = sid || (source as any)?.id;
                            if (targetId) {
                                updateNodeData(targetId, { value: isOpen ? '0' : '1' });
                            }
                        }}

                        style={{
                            background: isOpen ? '#43e97b' : '#ff4757', border: 'none', borderRadius: '4px', color: '#000',
                            fontSize: '0.6rem', fontWeight: 800, padding: '2px 6px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '4px'
                        }}
                    >
                        <span style={{ fontSize: '0.8rem' }}>{isOpen ? '⧁' : '⧀'}</span>
                        {isOpen ? 'OPEN' : 'CLOSE'}
                    </div>
                </NodeViewWrapper>
            );
        });
    },
    addInputRules() {
        return [{
            find: /\[gate\]\s$/,
            handler: ({ state, range }: any) => {
                state.tr.replaceWith(range.from, range.to, this.type.create({ name: 'gateNode' }));
            }
        } as any];
    }
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
        return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'math-pill' })];
    },

    addNodeView() {
        return ReactNodeViewRenderer(({ node, editor, getPos }: NodeViewProps) => {
            const val = node.attrs.value || '';
            const name = node.attrs.name || '';
            const ctx = React.useContext(TextNodeContext);

            // [PERF] Only subscribe to what this specific pill actually needs.
            // edges removed: now using granular isConnected selector below.
            const isCtrlPressed = useStore(state => state.isCtrlPressed);
            const globalVars = useStore(state => state.globalVars);
            const setGlobalVar = useStore(state => state.setGlobalVar);
            const theme = useStore(state => state.theme);

            const isGlobal = name.startsWith('$');

            // Generate stable IDs
            const safeVal = val.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
            const outHandleId = name ? `h-auto-out-${name}` : `h-auto-out-math-${safeVal}`;
            const inHandleId = name ? `h-auto-in-${name}` : `h-auto-in-math-${safeVal}`;
            
            const [localShowHandle, setLocalShowHandle] = useState(ctx.isHandleActive(`math-${val}`));

            // [PERF] Only re-render when THIS pill's connectivity changes, not all edges.
            const isConnectedOut = useStore(state =>
                state.edges.some(e => e.source === ctx.nodeId && e.sourceHandle === outHandleId)
            );
            const isConnectedIn = useStore(state =>
                state.edges.some(e => e.target === ctx.nodeId && e.targetHandle === inHandleId)
            );
            
            // Check for incoming value from graph evaluation
            const remoteVal = ctx.inputs?.[inHandleId];
            const hasRemoteVal = remoteVal !== undefined;

            const effectiveShowHandle = localShowHandle || isConnectedOut || isConnectedIn;

            // Trigger sync ONLY when connectivity changes, not on every render
            const prevConnectedVal = useRef(isConnectedOut || isConnectedIn);
            useEffect(() => {
                const con = isConnectedOut || isConnectedIn;
                if (prevConnectedVal.current !== con) {
                    prevConnectedVal.current = con;
                    ctx.triggerSync();
                }
            }, [isConnectedOut, isConnectedIn, ctx]);

            const [isHovered, setIsHovered] = useState(false);
            const pillRef = useRef<HTMLSpanElement>(null);
            const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

            useEffect(() => {
                let rafId: number;
                const update = () => {
                    if (isHovered && pillRef.current) {
                        const rect = pillRef.current.getBoundingClientRect();
                        setCoords({ top: rect.top, left: rect.left, width: rect.width });
                        rafId = requestAnimationFrame(update);
                    }
                };
                if (isHovered) update();
                return () => cancelAnimationFrame(rafId);
            }, [isHovered]);

            const [isExpanded, setIsExpanded] = useState(false);

            useEffect(() => {
                setLocalShowHandle(ctx.isHandleActive(`math-${val}`));
            }, [ctx, val]);

            const evaluatedVal = useMemo(() => {
                if (!isCtrlPressed) return null;
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

                    // Inject slider variables from slots
                    if (ctx.slots) {
                        for (const slotKey in ctx.slots) {
                            const absorbedNode: any = ctx.slots[slotKey];
                            if (absorbedNode.type === 'sliderNode') {
                                try {
                                    const sliderVal = absorbedNode.data.value || 0;
                                    const varName = absorbedNode.data.nodeName || slotKey;
                                    localVars[varName] = ce.parse(String(sliderVal)).evaluate();
                                } catch (e) { }
                            }
                        }
                    }

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
            }, [val, isCtrlPressed, editor, globalVars]); // Global vars might affect solve

            // [NEW] Local state for reactive syncing of global variables
            const [localVal, setLocalVal] = useState(val);

            useEffect(() => {
                if (isGlobal) {
                    const globalVal = globalVars[name];
                    if (globalVal !== undefined && globalVal !== localVal) {
                        setLocalVal(globalVal);
                        // Also proactively update the Tiptap document to keep it in sync, without moving focus
                        const currentPos = typeof getPos === 'function' ? getPos() : null;
                        if (typeof currentPos === 'number' && !editor.isDestroyed) {
                            // Using a timeout to prevent flushSync errors during render
                            setTimeout(() => {
                                editor.commands.command(({ tr }) => {
                                    tr.setNodeMarkup(currentPos, undefined, { ...node.attrs, value: globalVal });
                                    return true;
                                });
                            }, 0);
                        }
                    }
                } else if (val !== localVal) {
                    setLocalVal(val);
                }
            }, [globalVars, name, isGlobal, val, editor, getPos, localVal]);

            const finalBaseVal = hasRemoteVal ? remoteVal : localVal;
            const displayVal = useMemo(() => (isCtrlPressed && evaluatedVal !== null) ? evaluatedVal : finalBaseVal, [isCtrlPressed, evaluatedVal, finalBaseVal]);

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

            // Right-click: open editor
            const onRightClick = (e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                ctx.editMath(localVal, { x: e.clientX, y: e.clientY });
            };

            // Ctrl/Cmd+Click: split pill into multiple pills
            const handleMouseDown = async (e: React.MouseEvent) => {
                if (e.button !== 0) return;
                if (!(e.shiftKey || e.ctrlKey || e.metaKey)) return;

                e.preventDefault();
                e.stopPropagation();

                const currentPos = typeof getPos === 'function' ? getPos() : null;
                if (typeof currentPos !== 'number') return;

                const rawVal = evaluatedVal || localVal;

                if (e.altKey) {
                    let equations: string[] = [];
                    const normalizedStr = rawVal
                        .replace(/\\left\[/g, '[').replace(/\\right\]/g, ']')
                        .replace(/\\lbrack/g, '[').replace(/\\rbrack/g, ']')
                        .replace(/\\lbrace/g, '').replace(/\\rbrace/g, '')
                        .replace(/\\left\{/g, '').replace(/\\right\./g, '')
                        .replace(/\\\{/g, '').replace(/\\\}/g, '')
                        .replace(/[\[\]"]/g, '')
                        .trim();

                    if ((normalizedStr.includes('=') || normalizedStr.includes(':')) && normalizedStr.includes(',')) {
                        equations = normalizedStr.split(',').map((eq: string) => eq.trim()).filter(Boolean);
                    } else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
                        try {
                            const parsed = JSON.parse(rawVal);
                            if (Array.isArray(parsed)) equations = parsed.map(String);
                        } catch (err) { }
                    }

                    if (equations.length >= 2) {
                        editor.chain().focus().command(({ tr }) => {
                            tr.delete(currentPos, currentPos + 1);
                            let insertionPos = currentPos;
                            equations.forEach((eqn, idx) => {
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
                                insertionPos += 1;
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

                if (rawVal !== localVal) {
                    editor.chain().focus().command(({ tr }) => {
                        tr.setNodeMarkup(currentPos, undefined, { ...node.attrs, value: rawVal });
                        return true;
                    }).run();

                    if (isGlobal) {
                        setGlobalVar(name, rawVal);
                    }
                }
            };

            const handleCopy = (e: React.ClipboardEvent) => {
                e.clipboardData.setData('text/plain', displayVal);
                e.preventDefault();
                e.stopPropagation();
            };

            return (
                <NodeViewWrapper
                    as="span"
                    className={`data-pill-render ${effectiveShowHandle ? 'has-handle' : ''} ${isCtrlPressed ? 'ctrl-preview' : ''}`}
                    data-value={localVal}
                    data-name={name}
                    data-handle-out={outHandleId}
                    data-handle-in={inHandleId}
                    data-show-handle={effectiveShowHandle ? 'true' : 'false'}
                    onContextMenu={onRightClick}
                    onPointerDown={handleMouseDown}
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
                        background: isGlobal ? 'rgba(255, 204, 0, 0.15)' : (isConnectedIn ? 'rgba(180, 100, 255, 0.1)' : (isCtrlPressed ? 'rgba(67, 233, 123, 0.1)' : 'rgba(79, 172, 254, 0.05)')),
                        color: isGlobal ? '#ffcc00' : (isConnectedIn ? '#b464ff' : (isCtrlPressed ? '#43e97b' : '#4facfe')),
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.9em',
                        cursor: 'pointer',
                        border: localShowHandle
                            ? (isGlobal ? '1px solid #ffcc00' : (isConnectedIn ? '1px solid #b464ff' : (isCtrlPressed ? '1px solid #43e97b' : '1px solid #4facfe')))
                            : (isGlobal ? '1px solid rgba(255, 204, 0, 0.5)' : (isConnectedIn ? '1px solid rgba(180, 100, 255, 0.4)' : (isCtrlPressed ? '1px solid rgba(67, 233, 123, 0.4)' : '1px solid rgba(79, 172, 254, 0.3)'))),
                        margin: name ? '10px 4px 4px 4px' : '0 4px',
                        userSelect: 'text',
                        minHeight: '1.4em',
                        transition: 'all 0.2s ease',
                        verticalAlign: 'middle',
                        top: '-1px',
                        boxShadow: localShowHandle ? (isGlobal ? '0 0 10px rgba(255, 204, 0, 0.4)' : (isConnectedIn ? '0 0 10px rgba(180, 100, 255, 0.3)' : (isCtrlPressed ? '0 0 10px rgba(67, 233, 123, 0.3)' : '0 0 10px rgba(79, 172, 254, 0.3)'))) : 'none',
                        zIndex: isCtrlPressed ? 10 : 1
                    }}
                >
                    {name && (
                        <span style={{
                            position: 'absolute',
                            top: '-8px',
                            left: '8px',
                            fontSize: '0.6rem',
                            color: isGlobal ? '#ffcc00' : (isCtrlPressed ? '#43e97b' : (theme === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(14, 47, 11, 0.6)')),
                            background: 'var(--bg-node)',
                            padding: '0 4px',
                            lineHeight: 1,
                            fontWeight: 700,
                            letterSpacing: '0.05em',
                            pointerEvents: 'none',
                            opacity: isGlobal ? 1 : 0.8
                        }}>
                            {name}
                        </span>
                    )}

                    {!effectiveShowHandle && (
                        <>
                            {/* Output Handle (Right Half) */}
                            <Handle
                                type="source"
                                position={Position.Right}
                                id={outHandleId}
                                style={{
                                    width: '50%', height: '100%', top: 0, right: 0, position: 'absolute',
                                    transform: 'none', background: 'transparent', border: 'none', opacity: 0, zIndex: 5, cursor: 'crosshair'
                                }}
                            />
                            {/* Input Handle (Left Half) */}
                            <Handle
                                type="target"
                                position={Position.Left}
                                id={inHandleId}
                                style={{
                                    width: '50%', height: '100%', top: 0, left: 0, position: 'absolute',
                                    transform: 'none', background: 'transparent', border: 'none', opacity: 0, zIndex: 6, cursor: 'crosshair'
                                }}
                            />
                        </>
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
                                background: isCtrlPressed ? 'rgba(67, 233, 123, 0.15)' : 'rgba(255,255,255,0.08)',
                                borderRadius: '4px',
                                padding: '1px 5px',
                                fontSize: '0.6rem',
                                color: isCtrlPressed ? '#43e97b' : 'rgba(255,255,255,0.4)',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                border: '1px solid rgba(255,255,255,0.05)',
                                fontWeight: 700,
                                userSelect: 'none'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = isCtrlPressed ? 'rgba(67, 233, 123, 0.15)' : 'rgba(255,255,255,0.08)'}
                        >
                            {isExpanded ? 'Collapse' : `${sequenceData.length} items`}
                        </span>
                    )}

                    {isHovered && !isCtrlPressed && coords.width > 0 && createPortal(
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
                            <span style={{ color: '#4facfe' }}>🖱️ Drag</span>: Connect | <span style={{ color: '#43e97b' }}>Ctrl+🖱️</span>: Compute | <span style={{ color: '#ffcc33' }}>Right-click</span>: Edit
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

const _TextNode = function TextNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    countRender('TextNode');
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    const updateNodeInternals = useUpdateNodeInternals();
    const { screenToFlowPosition } = useReactFlow();
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    const [mathInputOpen, setMathInputOpen] = useState(false);
    const [popupPos, setPopupPos] = useState<{ x: number, y: number } | null>(null);
    const mathFieldRef = useRef<any>(null);
    const mathNameInputRef = useRef<HTMLInputElement>(null);
    const editingValueRef = useRef<string | null>(null);
    const editingNameRef = useRef<string | null>(null);

    // [NEW] Global variables suggestion state
    const globalVars = useStore((state: AppState) => state.globalVars);
    const [suggestionsOpen, setSuggestionsOpen] = useState(false);
    const [suggestionList, setSuggestionList] = useState<string[]>([]);
    const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);

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
            .replace(/\[(.*?):slider\]/g, '<slider-pill-md name="$1"></slider-pill-md>')
            .replace(/\[trigger\]/g, '<button-pill-md name="buttonNode"></button-pill-md>')
            .replace(/\[gate\]/g, '<gate-pill-md name="gateNode"></gate-pill-md>');
    };


    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                codeBlock: {},
                code: {},
            }),
            TiptapMarkdown.configure({
                html: true,
                tightLists: true,
                linkify: false,
            }),
            Underline,
            TextStyle,
            Color,
            Highlight.configure({ multicolor: true }),
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            TaskList,
            TaskItem.configure({ nested: true }),
            Placeholder.configure({
                placeholder: "Type '/' for commands or start typing...",
            }),
            MathPill,
            SliderPill,
            ButtonPill,
            GatePill,
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

    const renameTrigger = useCallback((_oldLabel: string, _newLabel: string) => { }, []);

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

    // --- [NEW] Auto-Insert logic for absorbed sliders ---
    useEffect(() => {
        if (!editor || !data.slots || editor.isFocused) return;

        const content = editor.getText() + editor.getHTML();
        const state = useStore.getState();

        Object.entries(data.slots).forEach(([name, nodeSource]) => {
            let type: string | null = null;

            if (typeof nodeSource === 'string') {
                const realNode = state.nodes.find(n => n.id === nodeSource);
                type = realNode?.type || null;
            } else if (typeof nodeSource === 'object') {
                type = (nodeSource as any).type || null;
            }

            if (!type) return;

            if (type === 'sliderNode' && !content.includes(`name="${name}"`)) {
                setTimeout(() => { if (editor && !editor.isDestroyed) editor.commands.insertContent(`<p><slider-pill-md name="${name}"></slider-pill-md></p>`); }, 0);
            } else if (type === 'buttonNode' && !content.includes('button-pill-md')) {
                setTimeout(() => { if (editor && !editor.isDestroyed) editor.commands.insertContent(`<p><button-pill-md name="${name}"></button-pill-md></p>`); }, 0);
            } else if (type === 'gateNode' && !content.includes('gate-pill-md')) {
                setTimeout(() => { if (editor && !editor.isDestroyed) editor.commands.insertContent(`<p><gate-pill-md name="${name}"></gate-pill-md></p>`); }, 0);
            }
        });
    }, [data.slots, editor]);

    // --- Eject Logic: Called when inline slider drag completes ---
    const globalHandleEject = useStore((state: AppState) => state.handleEject);

    const handleEject = useCallback((name: string, pos?: { x: number, y: number }) => {
        if (!pos || !editor) return;
        const startTime = performance.now();
        const flowPos = screenToFlowPosition({ x: pos.x, y: pos.y });

        // Phase 1: Atomic Global Eject (Unhide, repos, animate, reroute)
        globalHandleEject(id, name, flowPos);

        // Phase 2: Tiptap cleanup
        setTimeout(() => {
            if (editor && !editor.isDestroyed) {
                editor.commands.command(({ tr, state }) => {
                    let deleted = false;
                    state.doc.descendants((node, pos) => {
                        if (node.attrs.name === name) {
                            tr.delete(pos, pos + node.nodeSize);
                            deleted = true;
                            return false;
                        }
                    });
                    return deleted;
                });
            }
            const totalTime = performance.now() - startTime;
            console.log(`🚀 [Eject Generic] Total: ${totalTime.toFixed(2)}ms (via globalHandleEject)`);
        }, 16);
    }, [id, editor, globalHandleEject, screenToFlowPosition]);



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
                const isMathPill = el.classList.contains('data-pill-render');
                const name = el.getAttribute('data-name');
                
                const staggerOffset = (subIdx - (totalInGroup - 1) / 2) * STAGGER_GAP;
                const offset = Math.max(0, Math.min(100, ((group.centerY + staggerOffset - containerRect.top) / containerRect.height) * 100));

                if (isMathPill) {
                    const outId = el.getAttribute('data-handle-out') || `h-auto-out-${name || `${groupIdx}-${subIdx}`}`;
                    const inId = el.getAttribute('data-handle-in') || `h-auto-in-${name || `${groupIdx}-${subIdx}`}`;
                    
                    if (!newHandles.some(h => h.id === outId)) {
                        newHandles.push({ id: outId, type: 'output', position: 'right', offset, label: name || undefined });
                    }
                    if (!newHandles.some(h => h.id === inId)) {
                        newHandles.push({ id: inId, type: 'input', position: 'left', offset, label: name || undefined });
                    }
                    
                    if (!newOutputs[outId]) {
                        let outVal = el.getAttribute('data-value') || '';
                        if (outVal.trim() === '\\top') outVal = '1';
                        if (outVal.trim() === '\\bot') outVal = '0';
                        newOutputs[outId] = outVal;
                    }
                } else {
                    const customHandleId = el.getAttribute('data-handle-id');
                    const hType: HandleType = 'output';
                    const hId = customHandleId || `h-auto-out-${name || `${groupIdx}-${subIdx}`}`;

                    if (!newHandles.some(h => h.id === hId)) {
                        newHandles.push({ id: hId, type: hType, position: 'right', offset, label: name || undefined });
                    }

                    if (!newOutputs[hId]) {
                        let outVal = el.getAttribute('data-value') || '';
                        newOutputs[hId] = outVal;
                    }
                    el.setAttribute('data-handle-id', hId);
                }
            });
        });

        const manualHandles = (data.handles || []).filter((h: CustomHandle) => !h.id.startsWith('h-auto-'));

        // Final Merge with strict ID uniqueness
        const finalHandles = [...manualHandles];
        newHandles.forEach(nh => {
            if (!finalHandles.some(h => h.id === nh.id)) {
                finalHandles.push(nh);
            }
        });

        const roundOff = (h: CustomHandle) => ({ ...h, offset: Math.round(h.offset * 10) / 10 });
        const currentHandleSummary = JSON.stringify((data.handles || []).map(roundOff));
        const newHandleSummary = JSON.stringify(finalHandles.map(roundOff));

        if (currentHandleSummary !== newHandleSummary || JSON.stringify(newOutputs) !== JSON.stringify(data.outputs || {})) {
            updateNodeData(id, { handles: finalHandles, outputs: newOutputs });
        }
        updateNodeInternals(id);
    }, [data.handles, id, updateNodeData, updateNodeInternals]);

    const triggerSync = useCallback(() => {
        setTimeout(syncHandlesFromDOM, 10);
    }, [syncHandlesFromDOM]);

    useEffect(() => {
        const timer = setTimeout(syncHandlesFromDOM, 50);
        return () => clearTimeout(timer);
    }, [data.text, syncHandlesFromDOM]);

    // [PERF] Stable ref so ResizeObserver is not recreated on every render.
    const syncHandlesFromDOMRef = useRef(syncHandlesFromDOM);
    useEffect(() => { syncHandlesFromDOMRef.current = syncHandlesFromDOM; }, [syncHandlesFromDOM]);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver(() => syncHandlesFromDOMRef.current());
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []); // ← Created once, stable for component lifetime


    // Toolbar application
    const setGlobalVar = useStore((state: AppState) => state.setGlobalVar);

    const insertMathOrData = () => {
        const latex = mathFieldRef.current?.value || '';
        const name = mathNameInputRef.current?.value || '';
        if (!latex) {
            setMathInputOpen(false);
            editingValueRef.current = null;
            editingNameRef.current = null;
            return;
        }

        // Sync to global store if name is $-prefixed
        if (name.startsWith('$')) {
            setGlobalVar(name, latex);
        }

        if (editor) {
            if (editingValueRef.current !== null) {
                let foundPos = -1;
                let attrs: any = null;
                editor.state.doc.descendants((node, pos) => {
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
                if (editor) {
                    editor.chain()
                        .focus()
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


    const contextValue = useMemo(() => ({
        nodeId: id,
        slots: data.slots,
        isHandleActive,
        toggleHandle,
        editMath,
        renameTrigger,
        triggerSync,
        handleEject,
        inputs: data.inputs
    }), [id, data.slots, isHandleActive, toggleHandle, editMath, renameTrigger, triggerSync, handleEject, data.inputs]);

    return (
        <TextNodeContext.Provider value={contextValue}>
            <div
                id={`text-node-${id}`}
                ref={containerRef}
                className={`math-node text-node ${selected ? 'selected' : ''}`}
                onClick={(e) => {
                    // Ignore clicks that are inside the toolbar, popup, or the node header
                    const target = e.target as Element;
                    if (target.closest('.text-toolbar') || target.closest('.math-popup') || target.closest('.node-header')) {
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
                    <div style={{ display: 'flex', alignItems: 'center', flexGrow: 1, gap: '4px' }}>
                        <Icons.Text />
                        <input
                            title="Rename node"
                            className="nodrag"
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'inherit',
                                fontSize: 'inherit',
                                fontWeight: 'inherit',
                                width: '50%',
                                padding: '0',
                                margin: '0',
                                outline: 'none',
                                cursor: 'text'
                            }}
                            value={data.label || 'Text'}
                            onChange={(e) => updateNodeData(id, { label: e.target.value })}
                            onFocus={(e) => {
                                if (e.target.value === 'Text') {
                                    updateNodeData(id, { label: '' });
                                }
                            }}
                            onBlur={(e) => {
                                if (e.target.value === '') {
                                    updateNodeData(id, { label: 'Text' });
                                }
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                        />
                    </div>
                </div>



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
                            <MathInput
                                id="math-popup-field"
                                ref={mathFieldRef}
                                value={mathFieldRef.current?.value || ''}
                                onChange={() => {
                                    // MathInput handles its own state synchronization with the underlying web component
                                }}
                                onKeyDown={(e: any) => {
                                    if (e.key === ':' || e.key === ';') {
                                        e.preventDefault();
                                        mathNameInputRef.current?.focus();
                                    }
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        insertMathOrData();
                                    }
                                }}
                                style={{
                                    background: '#000', color: '#fff', padding: '6px 8px', borderRadius: '4px', border: '1px solid #333', fontSize: '1rem',
                                    transition: 'border-color 0.2s'
                                }}
                            />

                        </div>


                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px', position: 'relative' }}>
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
                                        minWidth: 0,
                                        transition: 'border-color 0.2s'
                                    }}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        const isGlobalName = val.startsWith('$');

                                        // Gold border on name field
                                        e.target.style.borderColor = isGlobalName ? '#ffcc00' : '#333';
                                        e.target.style.color = isGlobalName ? '#ffcc00' : '#4facfe';

                                        // Gold border on formula field
                                        const mf = document.getElementById('math-popup-field') as HTMLElement | null;
                                        if (mf) mf.style.border = isGlobalName ? '1px solid #ffcc00' : '1px solid #333';

                                        // Auto-fill formula from store if name is global and formula is empty
                                        if (isGlobalName && globalVars[val] && mathFieldRef.current && !mathFieldRef.current.value) {
                                            mathFieldRef.current.value = globalVars[val];
                                        }

                                        // Suggestion list
                                        if (isGlobalName) {
                                            const matches = Object.keys(globalVars).filter(k => k.startsWith(val) && k !== val);
                                            setSuggestionList(matches);
                                            setSuggestionsOpen(matches.length > 0);
                                            setSelectedSuggestionIndex(0);
                                        } else {
                                            setSuggestionsOpen(false);
                                        }
                                    }}
                                    onKeyDownCapture={(e) => {
                                        if (suggestionsOpen) {
                                            if (e.key === 'ArrowDown') {
                                                e.preventDefault();
                                                setSelectedSuggestionIndex(prev => (prev + 1) % suggestionList.length);
                                                return;
                                            }
                                            if (e.key === 'ArrowUp') {
                                                e.preventDefault();
                                                setSelectedSuggestionIndex(prev => (prev - 1 + suggestionList.length) % suggestionList.length);
                                                return;
                                            }
                                            if (e.key === 'Tab') {
                                                e.preventDefault();
                                                const selected = suggestionList[selectedSuggestionIndex];
                                                if (selected && mathNameInputRef.current) {
                                                    mathNameInputRef.current.value = selected;
                                                    // Also auto-fill formula
                                                    if (mathFieldRef.current && !mathFieldRef.current.value && globalVars[selected]) {
                                                        mathFieldRef.current.value = globalVars[selected];
                                                    }
                                                    setSuggestionsOpen(false);
                                                }
                                                return;
                                            }
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                const selected = suggestionList[selectedSuggestionIndex];
                                                if (selected && mathNameInputRef.current) {
                                                    mathNameInputRef.current.value = selected;
                                                    if (mathFieldRef.current && !mathFieldRef.current.value && globalVars[selected]) {
                                                        mathFieldRef.current.value = globalVars[selected];
                                                    }
                                                    setSuggestionsOpen(false);
                                                } else {
                                                    insertMathOrData();
                                                }
                                                return;
                                            }
                                            if (e.key === 'Escape') {
                                                setSuggestionsOpen(false);
                                                e.stopPropagation();
                                                return;
                                            }
                                        }

                                        if (e.key === 'Enter' && !suggestionsOpen) {
                                            e.preventDefault();
                                            insertMathOrData();
                                        }
                                    }}
                                />
                            </div>

                            {suggestionsOpen && suggestionList.length > 0 && (
                                <div style={{
                                    position: 'absolute',
                                    bottom: '100%',
                                    left: '40px',
                                    width: '150px',
                                    background: '#1a1a20',
                                    border: '1px solid #4facfe',
                                    borderRadius: '6px',
                                    padding: '4px',
                                    boxShadow: '0 -4px 15px rgba(0,0,0,0.5)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '2px',
                                    zIndex: 2100,
                                    marginBottom: '8px'
                                }}>
                                    <div style={{ fontSize: '0.6rem', color: '#888', padding: '2px 4px' }}>Global Variables</div>
                                    {suggestionList.map((sug, idx) => (
                                        <div
                                            key={sug}
                                            style={{
                                                padding: '4px 8px',
                                                fontSize: '0.75rem',
                                                color: '#ffcc00',
                                                background: idx === selectedSuggestionIndex ? 'rgba(255,204,0,0.2)' : 'transparent',
                                                borderRadius: '4px',
                                                cursor: 'pointer'
                                            }}
                                            onClick={() => {
                                                if (mathNameInputRef.current) {
                                                    mathNameInputRef.current.value = sug;
                                                    setSuggestionsOpen(false);
                                                    mathNameInputRef.current.focus();
                                                }
                                            }}
                                            onMouseEnter={() => setSelectedSuggestionIndex(idx)}
                                        >
                                            {sug}
                                        </div>
                                    ))}
                                </div>
                            )}

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
                    {editor && (
                        <BubbleMenu
                            className="tiptap-bubble-menu nodrag"
                            editor={editor}
                            style={{
                                display: 'flex', background: 'var(--bg-node)', padding: '6px',
                                borderRadius: '8px', border: '1px solid var(--border-node)',
                                boxShadow: '0 8px 16px rgba(0,0,0,0.5)', gap: '4px', zIndex: 9999
                            }}
                        >
                            <button
                                title="Bold (Cmd+B)"
                                onClick={() => editor.chain().focus().toggleBold().run()}
                                className={`tiptap-menu-btn ${editor.isActive('bold') ? 'is-active' : ''}`}
                                style={{ fontWeight: 'bold' }}>B</button>
                            <button
                                title="Italic (Cmd+I)"
                                onClick={() => editor.chain().focus().toggleItalic().run()}
                                className={`tiptap-menu-btn ${editor.isActive('italic') ? 'is-active' : ''}`}
                                style={{ fontStyle: 'italic' }}>I</button>
                            <button
                                title="Underline (Cmd+U)"
                                onClick={() => editor.chain().focus().toggleUnderline().run()}
                                className={`tiptap-menu-btn ${editor.isActive('underline') ? 'is-active' : ''}`}
                                style={{ textDecoration: 'underline' }}>U</button>
                            <button
                                title="Strikethrough (Cmd+Shift+X)"
                                onClick={() => editor.chain().focus().toggleStrike().run()}
                                className={`tiptap-menu-btn ${editor.isActive('strike') ? 'is-active' : ''}`}
                                style={{ textDecoration: 'line-through' }}>S</button>
                            <button
                                title="Inline Code (Cmd+E)"
                                onClick={() => editor.chain().focus().toggleCode().run()}
                                className={`tiptap-menu-btn ${editor.isActive('code') ? 'is-active' : ''}`}
                                style={{ fontFamily: 'monospace' }}>{'<>'}</button>
                            <div style={{ width: '1px', background: 'var(--border-node)', height: '20px', alignSelf: 'center', margin: '0 4px' }} />
                            
                            <label className="tiptap-menu-btn" title="Text Color" style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '4px' }}>
                                <input
                                    type="color"
                                    onInput={(event) => editor.chain().focus().setColor((event.target as HTMLInputElement).value).run()}
                                    value={editor.getAttributes('textStyle').color || '#ffffff'}
                                    style={{ width: '16px', height: '16px', padding: '0', border: 'none', background: 'transparent', cursor: 'pointer' }}
                                />
                            </label>

                            <button
                                title="Highlight Background (Yellow)"
                                onClick={() => editor.chain().focus().toggleHighlight({ color: '#ffcc00' }).run()}
                                className={`tiptap-menu-btn ${editor.isActive('highlight', { color: '#ffcc00' }) ? 'is-active' : ''}`}
                                style={{ color: '#ffcc00', fontWeight: 'bold' }}
                            >
                                H
                            </button>
                        </BubbleMenu>
                    )}
                    {editor && (
                        <FloatingMenu
                            className="tiptap-floating-menu nodrag"
                            editor={editor}
                            style={{ display: 'flex', gap: '4px', background: 'transparent', zIndex: 9999 }}
                        >
                            <button title="Heading 1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className="tiptap-menu-btn float-btn">H1</button>
                            <button title="Heading 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className="tiptap-menu-btn float-btn">H2</button>
                            <button title="Bullet List" onClick={() => editor.chain().focus().toggleBulletList().run()} className="tiptap-menu-btn float-btn">• List</button>
                            <button title="Task List" onClick={() => editor.chain().focus().toggleTaskList().run()} className="tiptap-menu-btn float-btn">☑ Task</button>
                        </FloatingMenu>
                    )}
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

                {/* Absorbed Sliders logic is now automated into the editor content via useEffect */}

                <style>{`
                .tiny-dashboard-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    width: 10px;
                    height: 10px;
                    background: var(--accent-bright);
                    border-radius: 50%;
                    cursor: pointer;
                }
                .inline-insert-btn:hover {
                    background: var(--accent-bright) !important;
                    color: #fff !important;
                }
            `}</style>

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
                .ctrl-preview {
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
                .tiptap-menu-btn {
                    background: transparent;
                    border: none;
                    color: var(--text-main);
                    cursor: pointer;
                    border-radius: 4px;
                    padding: 4px 8px;
                    font-size: 0.85rem;
                    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                }
                .tiptap-menu-btn:hover {
                    background: rgba(255, 255, 255, 0.1);
                }
                .tiptap-menu-btn.is-active {
                    background: var(--focus-bg, rgba(79, 172, 254, 0.3));
                    color: #fff;
                    box-shadow: inset 0 0 0 1px rgba(79, 172, 254, 0.5);
                }
                .tiptap-menu-btn.float-btn {
                    background: var(--bg-card);
                    border: 1px solid var(--border-node);
                    font-size: 0.75rem;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.3);
                }
                .tiptap-menu-btn.float-btn:hover {
                    border-color: rgba(79, 172, 254, 0.5);
                    background: var(--bg-node);
                    transform: translateY(-1px);
                }
                math-field:focus-within { outline: 2px solid #4facfe; border-radius: 4px; }
            `}</style>
            </div>
        </TextNodeContext.Provider>
    );
}

export const TextNode = memo(_TextNode);
