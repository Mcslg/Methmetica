import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type Edge } from '@xyflow/react';
import { getNodeDefinition } from '../nodes/registry';
import { canMerge, MergeRules, type ProxyableType } from '../config/mergeRegistry';
import {
    type Connection,
    type EdgeChange,
    type Node,
    type NodeChange,
    addEdge,
    type OnNodesChange,
    type OnEdgesChange,
    type OnConnect,
    applyNodeChanges,
    applyEdgeChanges,
} from '@xyflow/react';
import { incrementEvalGraph } from '../components/DebugOverlay';

export type HandleType = 'input' | 'output' | 'gate-in';

export type CustomHandle = {
    id: string;
    type: HandleType;
    position: 'top' | 'bottom' | 'left' | 'right';
    offset: number; // percentage 0-100
    label?: string; // Optional label for variables
    lineIndex?: number; // For TextNode: which line this handle is pinned to
};

export type NodeData = {
    value?: string;
    formula?: string; // For function nodes
    text?: string; // For text nodes
    handles?: CustomHandle[];
    input?: string; // For utility nodes to receive data
    touchingEdges?: { left?: boolean, right?: boolean, top?: boolean, bottom?: boolean };
    variant?: 'diff' | 'integ' | 'insert'; // Added 'insert'
    variable?: string; // For specifying differentiation/integration variable
    useExternalFormula?: boolean;
    formulaInput?: string; // Formula string received from an external connection
    outputs?: Record<string, string>; // Multi-output support (handleId -> value)
    style?: { color?: string; fontSize?: number }; // Custom styles for node
    rangeDef?: string; // For rangeNode definition (e.g., '0..10')
    status?: string; // For progress reporting (e.g., 'ForEach' progress)
    min?: number; // For SliderNode
    max?: number; // For SliderNode
    step?: number; // For SliderNode
    nodeName?: string; // Custom name for variables (e.g., 'radius', 'x')
    slots?: Record<string, AppNode | string>; // Absorbed nodes (either whole node or ID string for Proxy)
    gateValue?: string; // Value representing gate pass/block state
    label?: string; // Custom title for the node header
    parentId?: string; // ID of the container node that absorbed this node (for Option B Proxy)
};

export type AppNode = Node<NodeData>;

export type AppState = {
    nodes: AppNode[];
    edges: Edge[];
    onNodesChange: OnNodesChange<AppNode>;
    onEdgesChange: OnEdgesChange<Edge>;
    onConnect: OnConnect;
    updateNodeData: (nodeId: string, data: NodeData) => void;
    addHandle: (nodeId: string, handle: CustomHandle) => void;
    removeHandle: (nodeId: string, handleId: string) => void;
    updateHandle: (nodeId: string, handleId: string, patch: Partial<CustomHandle>) => void;
    addNode: (node: AppNode) => void;
    removeNode: (nodeId: string) => void;
    executeNode: (nodeId: string, force?: boolean) => void;
    handleProximitySnap: (nodeId: string) => void;
    evaluateGraph: () => void;
    setGraph: (nodes: AppNode[], edges: Edge[]) => void;
    isAltPressed: boolean;
    setAltPressed: (pressed: boolean) => void;
    isCtrlPressed: boolean;
    setCtrlPressed: (pressed: boolean) => void;
    theme: 'light' | 'dark';
    setTheme: (theme: 'light' | 'dark') => void;
    isSidebarOpen: boolean;
    setSidebarOpen: (open: boolean) => void;
    isDeletingHover: boolean;
    setDeletingHover: (isHovering: boolean) => void;
    isPaletteFloating: boolean;
    setPaletteFloating: (floating: boolean) => void;
    palettePosition: { x: number; y: number };
    setPalettePosition: (pos: { x: number; y: number }) => void;
    setNodeHidden: (nodeId: string, hidden: boolean) => void;
    handleEject: (containerId: string, slotKey: string, flowPos: { x: number, y: number }) => void;
    
    // Ghost line during Command-Eject
    draggingEjectPos: { startX: number, startY: number, curX: number, curY: number } | null;
    setDraggingEjectPos: (pos: { startX: number, startY: number, curX: number, curY: number } | null) => void;

    // [NEW] Merge Hint during drag
    mergeHint: { targetId: string, slotKey: string, label: string, side: 'left' | 'right' | 'top' | 'bottom' } | null;
    updateMergeHint: (draggedNodeId: string, mousePos: { x: number, y: number } | null, side?: 'left' | 'right' | 'top' | 'bottom') => void;

    // [NEW] Node Resizing via Cmd+Scroll
    hoveredNodeId: string | null;
    setHoveredNodeId: (id: string | null) => void;
    updateNodeDimensions: (nodeId: string, deltaW: number, deltaH: number) => void;

    // [NEW] Global variables via $ prefix
    globalVars: Record<string, string>;
    setGlobalVar: (name: string, value: string) => void;
};

// Initial setup nodes
const initialNodes: AppNode[] = [];

const useStore = create<AppState>()(
    persist(
        (set, get) => ({
            nodes: initialNodes,
            edges: [],
            theme: 'dark',
            setTheme: (theme) => set({ theme }),
            isSidebarOpen: true,
            setSidebarOpen: (isSidebarOpen) => set({ isSidebarOpen }),
            isDeletingHover: false,
            setDeletingHover: (isDeletingHover) => set({ isDeletingHover }),
            isPaletteFloating: false,
            setPaletteFloating: (isPaletteFloating) => set({ isPaletteFloating }),
            palettePosition: { x: 100, y: 100 },
            setPalettePosition: (palettePosition) => set({ palettePosition }),

            globalVars: {},
            setGlobalVar: (name: string, value: string) => {
                set((state) => ({
                    globalVars: { ...state.globalVars, [name]: value }
                }));
                // Evaluate graph so calculation nodes re-run immediately with the new global var
                get().evaluateGraph();
            },

            draggingEjectPos: null,
            setDraggingEjectPos: (pos) => set({ draggingEjectPos: pos }),

            hoveredNodeId: null,
            setHoveredNodeId: (id) => set({ hoveredNodeId: id }),

            updateNodeDimensions: (nodeId, deltaW, deltaH) => {
                const start = performance.now();
                const { nodes } = get();
                set({
                    nodes: nodes.map(n => {
                        if (n.id === nodeId) {
                            // Prioritize set width/height over measured ones to avoid "measured size" snap-back
                            const curW = n.width ?? (n.style?.width as number) ?? n.measured?.width ?? 200;
                            const curH = n.height ?? (n.style?.height as number) ?? n.measured?.height ?? 120;
                            
                            const nextW = Math.max(100, curW + deltaW);
                            const nextH = Math.max(60, curH + deltaH);

                            // Skip update if already same value (saves a re-render)
                            if (n.width === nextW && n.height === nextH) return n;

                            return {
                                ...n,
                                width: nextW,
                                height: nextH,
                                style: { ...n.style, width: nextW, height: nextH }
                            };
                        }
                        return n;
                    })
                });
                const end = performance.now();
                if (end - start > 10) console.warn(`[Performance] updateNodeDimensions for ${nodeId} took ${Math.round(end - start)}ms`);
            },

            mergeHint: null,
            updateMergeHint: (draggedNodeId, mousePos, forcedSide) => {
                if (!mousePos) {
                    set({ mergeHint: null });
                    return;
                }
                const { nodes } = get();
                const a = nodes.find(n => n.id === draggedNodeId);
                if (!a) return;

                let bestHint: AppState['mergeHint'] = null;

                for (const b of nodes) {
                    if (b.id === draggedNodeId || b.hidden || !b.type) continue;
                    if (!canMerge(a.type as string, b.type as string)) continue;

                    const bWidth = b.measured?.width || b.width || 200;
                    const bHeight = b.measured?.height || b.height || 100;
                    
                    const isOver = mousePos.x >= b.position.x - 30 && mousePos.x <= b.position.x + bWidth + 30 &&
                                   mousePos.y >= b.position.y - 30 && mousePos.y <= b.position.y + bHeight + 30;

                    if (isOver) {
                        const dxLeft = Math.max(0, Math.abs(mousePos.x - b.position.x));
                        const dyTop = Math.max(0, Math.abs(mousePos.y - b.position.y));
                        const slots = b.data.slots || {};

                        // Detect side if not forced
                        const side = forcedSide || (dyTop < 50 ? 'top' : dxLeft < 50 ? 'left' : 'right');

                        // Rule for LEFT Merges (Inputs/Sidebar)
                        if (side === 'left' && b.type === 'graphNode') {
                            if (a.type === 'textNode') {
                                if (!slots.formulaSidebar) {
                                    bestHint = { targetId: b.id, slotKey: 'formulaSidebar', label: '+ Formula Sidebar', side: 'left' };
                                }
                            } else if (a.type === 'sliderNode') {
                                const key = a.data.nodeName || 'a';
                                if (!slots[key]) {
                                    bestHint = { targetId: b.id, slotKey: key, label: `+ Parameter ${key}`, side: 'left' };
                                }
                            }
                        } 
                        // [FIX] Rule for TextNode Merges (Sliders, Buttons, Gates)
                        else if (b.type === 'textNode') {
                            if (a.type === 'sliderNode' || a.type === 'buttonNode' || a.type === 'gateNode') {
                                const key = a.data.nodeName || (a.type === 'sliderNode' ? 'x' : a.type === 'buttonNode' ? 'btn' : 'gate');
                                if (!slots[key]) {
                                    bestHint = { targetId: b.id, slotKey: key, label: `+ Embed ${a.type.replace('Node', '')} (${key})`, side: 'right' };
                                }
                            }
                        }
                        // Rule for RIGHT Merges (Results for nodes that aren't TextNodes)
                        else if (side === 'right' && (b.type === 'calculateNode' || b.type === 'solveNode')) {
                            if (a.type === 'textNode' && !slots.resultText) {
                                bestHint = { targetId: b.id, slotKey: 'resultText', label: '+ Result Display', side: 'right' };
                            } else if (a.type === 'sliderNode') {
                                const key = a.data.nodeName || 'x';
                                if (!slots[key]) {
                                    bestHint = { targetId: b.id, slotKey: key, label: `+ Variable ${key}`, side: 'right' };
                                }
                            }
                        } 
                        // Rule for TOP Merges (Comments)
                        else if (side === 'top') {
                            if (a.type === 'textNode' && !slots.comment) {
                                bestHint = { targetId: b.id, slotKey: 'comment', label: '+ Add Note', side: 'top' };
                            }
                        }
                        break; 
                    }
                }
                set({ mergeHint: bestHint });
            },

            setNodeHidden: (nodeId, hidden) => {
                set({
                    nodes: get().nodes.map(n => n.id === nodeId ? { ...n, hidden } : n)
                });
            },

            handleEject: (containerId, slotKey, flowPos) => {
                const state = get();
                const containerNode = state.nodes.find(n => n.id === containerId);
                if (!containerNode || !containerNode.data.slots) return;

                const proxyId = containerNode.data.slots[slotKey];
                if (typeof proxyId !== 'string') return;

                const sid = proxyId;

                // Phase 1: Unhide and reposition immediately
                const nodesAfterUnhide = state.nodes.map(n => {
                    if (n.id === sid) {
                        return { 
                            ...n, 
                            position: flowPos, 
                            hidden: false, 
                            selected: true
                        };
                    }
                    if (n.id === containerId) {
                        const newSlots = { ...n.data.slots };
                        delete newSlots[slotKey];
                        let newHeight = n.height;
                        if (n.type === 'calculateNode' || n.type === 'solveNode') {
                            const curHeight = n.height || n.measured?.height || 100;
                            const decr = (slotKey === 'gateNode') ? 55 : 45;
                            newHeight = Math.max(80, curHeight - decr);
                        }
                        return { ...n, height: newHeight, data: { ...n.data, slots: newSlots } };
                    }
                    return n;
                });

                const hOutId = `h-out-${slotKey}`;
                const hInId = `h-in-${slotKey}`;
                const edgesAfterReroute = state.edges.map(e => {
                    if (e.source === containerId && e.sourceHandle === hOutId) return { ...e, source: sid, sourceHandle: 'h-out' };
                    if (e.target === containerId && e.targetHandle === hInId) return { ...e, target: sid, targetHandle: 'h-in' };
                    if (e.target === containerId && e.targetHandle === 'h-gate-in' && slotKey === 'gateNode') return { ...e, target: sid, targetHandle: 'h-gate-in' };
                    return e;
                });

                set({ nodes: nodesAfterUnhide, edges: edgesAfterReroute });
                // [PERF] Defer so React batches the unhide render before recalculating
                requestAnimationFrame(() => get().evaluateGraph());
            },

            setGraph: (nodes, edges) => {
                set({ nodes, edges });
                // If it's a clear-all action (empty nodes and edges), we should clear globalVars too
                if (nodes.length === 0 && edges.length === 0) {
                    set({ globalVars: {} });
                }
            },

            isAltPressed: false,
            setAltPressed: (pressed) => set({ isAltPressed: pressed }),

            isCtrlPressed: false,
            setCtrlPressed: (pressed) => set({ isCtrlPressed: pressed }),


    onNodesChange: (changes: NodeChange<AppNode>[]) => {
        set({
            nodes: applyNodeChanges(changes, get().nodes),
        });
    },

    onEdgesChange: (changes: EdgeChange[]) => {
        const currentEdges = get().edges;
        const nextEdges = applyEdgeChanges(changes, currentEdges);

        const removedDataEdges = currentEdges.filter(e => 
            (!e.sourceHandle || !e.sourceHandle.startsWith('h-tr')) && 
            !nextEdges.some(ne => ne.id === e.id)
        );

        set({ edges: nextEdges });
        get().evaluateGraph();

        // Re-evaluate target nodes that lost an explicit data input
        removedDataEdges.forEach(e => {
            get().executeNode(e.target);
        });
    },

    onConnect: (connection: Connection) => {
        const newEdge = {
            ...connection,
            type: 'default',
            className: 'data-edge',
            style: {
                strokeWidth: 2,
                stroke: '#3d5a80'
            }
        };

        set({
            edges: addEdge(newEdge, get().edges),
        });
        get().evaluateGraph();
    },

    updateNodeData: (nodeId: string, dataPatch: Partial<NodeData>) => {
        const { nodes, edges } = get();
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;

        const nextData = { ...node.data, ...dataPatch };

        // If handles changed, we MUST cleanup orphaned edges to prevent ghost connections
        let nextEdges = edges;
        if (dataPatch.handles) {
            const nextHandleIds = new Set(dataPatch.handles.map(h => h.id));
            nextEdges = edges.filter(e => {
                if (e.source === nodeId && e.sourceHandle && !nextHandleIds.has(e.sourceHandle)) return false;
                if (e.target === nodeId && e.targetHandle && !nextHandleIds.has(e.targetHandle)) return false;
                return true;
            });
        }

        set({
            nodes: nodes.map((n) => (n.id === nodeId ? { ...n, data: nextData } : n)),
            edges: nextEdges
        });

        // Trigger execution for nodes that should auto-run on data change
        if (node.type === 'numberNode' || node.type === 'functionNode' || node.type === 'calculateNode' || node.type === 'gateNode' || node.type === 'rangeNode') {
            get().executeNode(nodeId);
        } else {
            get().evaluateGraph();
        }
    },

    addHandle: (nodeId: string, handle: CustomHandle) => {
        const { nodes } = get();
        set({
            nodes: nodes.map((n) =>
                n.id === nodeId
                    ? { ...n, data: { ...n.data, handles: [...(n.data.handles || []), handle] } }
                    : n
            ),
        });
    },

    removeHandle: (nodeId: string, handleId: string) => {
        const { nodes, edges } = get();
        set({
            nodes: nodes.map((n) =>
                n.id === nodeId
                    ? { ...n, data: { ...n.data, handles: n.data.handles?.filter(h => h.id !== handleId) } }
                    : n
            ),
            edges: edges.filter(e =>
                !(e.source === nodeId && e.sourceHandle === handleId) &&
                !(e.target === nodeId && e.targetHandle === handleId)
            )
        });
    },

    updateHandle: (nodeId: string, handleId: string, patch: Partial<CustomHandle>) => {
        const { nodes } = get();
        set({
            nodes: nodes.map((n) =>
                n.id === nodeId
                    ? {
                        ...n,
                        data: {
                            ...n.data,
                            handles: n.data.handles?.map(h => h.id === handleId ? { ...h, ...patch } : h)
                        }
                    }
                    : n
            ),
        });
    },

    addNode: (node: AppNode) => {
        set({
            nodes: [...get().nodes, node],
        });
    },

    removeNode: (nodeId: string) => {
        const { nodes, edges } = get();
        
        // 1. Identify direct children to be deleted along with the parent
        const nodesToRemove = new Set<string>();
        nodesToRemove.add(nodeId);
        nodes.forEach(n => {
            if (n.data?.parentId === nodeId) {
                nodesToRemove.add(n.id);
            }
        });

        // 2. Filter nodes and clean up slots in ANY remaining nodes (just in case)
        const cleanedNodes = nodes
            .filter(n => !nodesToRemove.has(n.id))
            .map(n => {
                if (n.data.slots) {
                    const newSlots = { ...n.data.slots };
                    let changed = false;
                    Object.keys(newSlots).forEach(key => {
                        if (nodesToRemove.has(newSlots[key] as string)) {
                            delete newSlots[key];
                            changed = true;
                        }
                    });
                    if (changed) return { ...n, data: { ...n.data, slots: newSlots } };
                }
                return n;
            });

        // 3. Filter edges
        const cleanedEdges = edges.filter(e => 
            !nodesToRemove.has(e.source) && !nodesToRemove.has(e.target)
        );

        set({
            nodes: cleanedNodes,
            edges: cleanedEdges
        });
        get().evaluateGraph();
    },

    executeNode: (nodeId: string, force?: boolean) => {
        const { nodes } = get();
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;

        if (!force && node.data.slots && Object.keys(node.data.slots).length > 0) {
            if (node.data.slots.buttonNode) return; // Locked by button
            if (node.data.slots.gateNode) {
                const gateVal = Number(node.data.gateValue || 0);
                if (gateVal === 0) return; // Blocked by gate
            }
        }

        const handleResult = (res: string) => {
            const currentNodes = get().nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, value: res } } : n);
            set({ nodes: currentNodes });

            // [NEW] Sync results to merged resultText slot if present
            if (node.data.slots?.resultText) {
                const textNodeId = typeof node.data.slots.resultText === 'string' 
                    ? node.data.slots.resultText 
                    : (node.data.slots.resultText as any).id;
                get().updateNodeData(textNodeId, { text: `RESULT: ${res}` });
            }

            get().evaluateGraph();
        };

        const handleError = (err: string) => {
            set({ nodes: get().nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, value: err } } : n) });
            get().evaluateGraph();
        };

        const def = getNodeDefinition(node.type || '');
        if (def && def.execute) {
            try {
                const result = def.execute(node, get());
                if (result instanceof Promise) {
                    result.then((res) => { if (res !== undefined) handleResult(res); }).catch(handleError);
                } else if (typeof result === 'string') {
                    handleResult(result);
                }
            } catch (e) {
                handleError(e instanceof Error ? e.message : String(e));
            }
        }
    },

    // checkProximity removed

    handleProximitySnap: (nodeId: string) => {
        const { nodes, mergeHint } = get();
        const a = nodes.find(n => n.id === nodeId);
        if (!a) { console.warn("Snap fail: A not found"); return; }

        if (mergeHint && mergeHint.targetId) {
            const b = nodes.find(n => n.id === mergeHint.targetId);
            if (b) {
                const rule = MergeRules[a.type as ProxyableType];
                if (!rule) { console.warn("Snap fail: No rule for", a.type); return; }

                const slotKey = mergeHint.slotKey;
                const currentSlots = b.data.slots || {};
                
                if (!currentSlots[slotKey]) {
                    console.log(`Merging ${a.id} into ${b.id} at ${slotKey}`);
                    const newSlots = { ...currentSlots, [slotKey]: a.id };
                    const curHeight = b.height || b.measured?.height || 100;
                    const nextHeight = (b.type === 'textNode') ? curHeight : curHeight + rule.heightIncrement;

                    set({
                        nodes: get().nodes.map(n => {
                            if (n.id === b.id) return { ...n, height: nextHeight, data: { ...n.data, slots: newSlots } };
                            if (n.id === a.id) return { ...n, hidden: true, selected: false, data: { ...n.data, parentId: b.id } };
                            return n;
                        }),
                        edges: get().edges.map(e => {
                            if (e.source === a.id) return { ...e, source: b.id, sourceHandle: `h-out-${slotKey}` };
                            if (e.target === a.id) {
                                const tHandle = (a.type === 'gateNode') ? 'h-gate-in' : `h-in-${slotKey}`;
                                return { ...e, target: b.id, targetHandle: tHandle };
                            }
                            return e;
                        }),
                        mergeHint: null 
                    });
                    // [PERF] Defer evaluateGraph so React can batch the structural render first.
                    // Without this, merge triggers ~50 re-renders. With this, it's ~2.
                    requestAnimationFrame(() => get().evaluateGraph());
                    return;
                } else {
                    console.warn(`Snap fail: Slot ${slotKey} occupied`);
                }
            } else {
                console.warn("Snap fail: B not found");
            }
        } else {
            console.log("Snap fail: No active hint");
        }
        
        set({ mergeHint: null });
    },

    evaluateGraph: () => {
        incrementEvalGraph();
        const { nodes, edges } = get();

        // 1. Build rapid-access maps for incoming edges
        const targetToExplicit = new Map<string, typeof edges>();
        edges.forEach(e => {
            if (!targetToExplicit.has(e.target)) targetToExplicit.set(e.target, []);
            targetToExplicit.get(e.target)!.push(e);
        });

        let nextNodes = nodes; // [PERF] Do not spread initially to retain reference if unchanged

        for (let i = 0; i < 5; i++) {
            let hasChanged = false;
            const tempNodes = nextNodes.map(node => {
                const explicitEdges = targetToExplicit.get(node.id) || [];
                let valIn: string | undefined = undefined;
                let gateValFromEdge: string | undefined = undefined;

                if (explicitEdges.length > 0) {
                    const values = explicitEdges.map(e => {
                        const source = nextNodes.find(n => n.id === e.source);
                        if (!source) return undefined;
                        if (e.sourceHandle && source.data.outputs?.[e.sourceHandle] !== undefined) {
                            return source.data.outputs[e.sourceHandle];
                        }
                        return source.data.value;
                    });
                    valIn = values.find(v => v !== undefined);

                    const gateEdge = explicitEdges.find(e => e.targetHandle === 'h-gate-in');
                    if (gateEdge) {
                        const source = nextNodes.find(n => n.id === gateEdge.source);
                        if (source) {
                            gateValFromEdge = (gateEdge.sourceHandle && source.data.outputs?.[gateEdge.sourceHandle]) ?? source.data.value;
                        }
                    }
                }

                // Create a data patch to avoid multiple shallow copies
                let updatedData = { ...node.data };
                let isUpdated = false;

                // 1. Process Gate Value
                if (gateValFromEdge !== undefined && gateValFromEdge !== node.data.gateValue) {
                    updatedData.gateValue = gateValFromEdge;
                    isUpdated = true;
                } else if (gateValFromEdge === undefined && node.data.gateValue !== undefined && node.data.slots?.gateNode) {
                    updatedData.gateValue = undefined;
                    isUpdated = true;
                }

                // 2. Process Formula Input (calculateNode & graphNode)
                if (node.type === 'calculateNode' || node.type === 'graphNode') {
                    const formulaEdges = edges.filter(e => e.target === node.id && e.targetHandle === 'h-fn-in');
                    let formulaVal: string | undefined = undefined;
                    
                    if (node.data.slots?.formulaSidebar) {
                        const sid = typeof node.data.slots.formulaSidebar === 'string' ? node.data.slots.formulaSidebar : (node.data.slots.formulaSidebar as any).id;
                        const sidebarNode = nextNodes.find(n => n.id === sid);
                        if (sidebarNode && sidebarNode.data.text) {
                            const rawText = sidebarNode.data.text;
                            if (rawText.includes('$$')) {
                                const mathMatches = rawText.match(/\$\$(.*?)\$\$/g);
                                if (mathMatches) {
                                    formulaVal = mathMatches.map(m => m.slice(2, -2).trim()).filter(Boolean).join(',');
                                }
                            } else {
                                formulaVal = rawText.trim().split('\n').filter(Boolean).join(',');
                            }
                        }
                    }

                    if (!formulaVal && formulaEdges.length > 0) {
                        if (node.type === 'graphNode') {
                            const formulaParts = formulaEdges.map(edge => {
                                const source = nextNodes.find(n => n.id === edge.source);
                                if (source) {
                                    return (edge.sourceHandle && source.data.outputs?.[edge.sourceHandle]) ?? source.data.value;
                                }
                                return undefined;
                            }).filter(v => v !== undefined);
                            formulaVal = formulaParts.join(',');
                        } else {
                            const edge = formulaEdges[0];
                            const source = nextNodes.find(n => n.id === edge.source);
                            if (source) {
                                formulaVal = (edge.sourceHandle && source.data.outputs?.[edge.sourceHandle]) ?? source.data.value;
                            }
                        }
                    }

                    if (formulaVal !== node.data.formulaInput) {
                        updatedData.formulaInput = formulaVal;
                        isUpdated = true;
                    }
                }

                // 3. Process Generic Input (Decimal, Calculus, etc.)
                if (node.type === 'decimalNode' || node.type === 'calculusNode' || node.type === 'gateNode') {
                    if (valIn !== node.data.input && node.type !== 'gateNode') {
                        updatedData.input = valIn;
                        isUpdated = true;
                    }
                    if (valIn !== node.data.value && node.type === 'gateNode') {
                        updatedData.value = valIn;
                        isUpdated = true;
                    }
                }

                // 4. Process Text Node Auto-Formatting
                if (node.type === 'textNode' && valIn !== undefined) {
                    let textToSet = String(valIn);
                    const isNumeric = !isNaN(Number(textToSet)) && textToSet.trim() !== '';
                    const isLaTeX = textToSet.includes('\\') || textToSet.includes('{');
                    const isSequence = textToSet.trim().startsWith('[') && textToSet.trim().endsWith(']');
                    
                    if ((isNumeric || isLaTeX || isSequence) && !(textToSet.startsWith('$$') && textToSet.endsWith('$$'))) {
                        textToSet = `$$${textToSet.trim()}$$`;
                    }
                    
                    if (textToSet !== node.data.text) {
                        updatedData.text = textToSet;
                        isUpdated = true;
                    }
                }

                if (isUpdated) hasChanged = true;
                return isUpdated ? { ...node, data: updatedData } : node;
            });

            if (!hasChanged) {
                break;
            }
            nextNodes = tempNodes;
        }

        if (nextNodes !== nodes) {
            set({ nodes: nextNodes });
        }
    },
  }),
  {
      name: 'methmetica-storage',
      partialize: (state: AppState) => ({
          nodes: state.nodes,
          edges: state.edges,
          theme: state.theme,
          isSidebarOpen: state.isSidebarOpen,
          globalVars: state.globalVars,
      }),
  }
)
);

useStore.getState().evaluateGraph();

export default useStore;
