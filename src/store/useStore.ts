import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type Edge } from '@xyflow/react';
import { getNodeDefinition } from '../nodes/registry';
import { canMerge, MergeRules, type ProxyableType } from '../config/mergeRegistry';
import { defaultCommunityTemplates } from '../community/catalog';
import type { CommunityNodeTemplate, WorkflowVisibility } from '../community/types';
import type { AppUser, AuthStatus } from '../integrations/supabase/types';
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

export const createGraphSignature = (nodes: AppNode[], edges: Edge[]) =>
    JSON.stringify({ nodes, edges });

export type HandleType = 'input' | 'output' | 'gate-in';

export type CustomHandle = {
    id: string;
    type: HandleType;
    position: 'top' | 'bottom' | 'left' | 'right';
    offset: number; // percentage 0-100
    label?: string; // Optional label for variables
    lineIndex?: number; // For TextNode: which line this handle is pinned to
};

export type BalanceOperation = {
    op: string;
    value: string;
    targetSide?: 'lhs' | 'rhs';
    factor?: string;
    result?: string;
};

export type NodeData = {
    value?: string;
    formula?: string; // For function nodes
    text?: string; // For text nodes
    handles?: CustomHandle[];
    input?: string; // For utility nodes to receive data
    touchingEdges?: { left?: boolean, right?: boolean, top?: boolean, bottom?: boolean };
    variant?: 'diff' | 'integ' | 'limit' | 'insert' | 'sine' | 'square' | 'sawtooth' | 'triangle' | 'custom';
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
    operations?: BalanceOperation[]; // For BalanceNode history
    currentFormula?: string; // For BalanceNode interim result
    inputSignature?: string; // A signature combining all incoming variable edge values to trigger calculation hooks
    inputs?: Record<string, string>; // Multi-input support (handleId -> value)
    limitPoint?: string; // For CalculusNode limit target (e.g. x -> a)
    description?: string; // For ProjectNode metadata
    tags?: string[]; // Shared workflow/tag metadata for builder root
    templateId?: string; // For reusable community template nodes
    templateFields?: Record<string, string>;
    templateSummary?: string;
    templateBestAlgorithm?: string;
    templateAlternatives?: string[];
    templateRelatedWorkflowIds?: string[];
    targetWorkflowId?: string;
    targetWorkflowTitle?: string;
    callout?: string;
    builderDraft?: CommunityNodeTemplate;
    publishStatus?: string;
    supabaseWorkflowId?: string;
    visibility?: WorkflowVisibility;
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
    addNodes: (nodes: AppNode[]) => void;
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

    // [UNDO/REDO]
    undoStack: { nodes: AppNode[]; edges: Edge[]; globalVars: Record<string, string> }[];
    redoStack: { nodes: AppNode[]; edges: Edge[]; globalVars: Record<string, string> }[];
    lastSnapshotTime: number; // Internal timestamp
    takeSnapshot: (force?: boolean) => void;
    undo: () => void;
    redo: () => void;
    currentView: 'home' | 'editor';
    setCurrentView: (view: 'home' | 'editor') => void;

    // [CLOUD] Google Drive Integration
    user: AppUser | null;
    authStatus: AuthStatus;
    driveConnected: boolean;
    activeFileId: string | null;
    workflowList: any[];
    isLoadingWorkflows: boolean;
    communityTemplates: CommunityNodeTemplate[];
    savedGraphSignature: string;
    setUser: (user: AppUser | null) => void;
    setAuthStatus: (status: AuthStatus) => void;
    setDriveConnected: (connected: boolean) => void;
    setActiveFileId: (id: string | null) => void;
    setWorkflowList: (list: any[]) => void;
    setLoadingWorkflows: (loading: boolean) => void;
    setCommunityTemplates: (templates: CommunityNodeTemplate[]) => void;
    upsertCommunityTemplate: (template: CommunityNodeTemplate) => void;
    markCurrentGraphSaved: () => void;
};

// Initial setup nodes
const initialNodes: AppNode[] = [
    {
        id: 'project-root',
        type: 'projectNode',
        position: { x: -400, y: -200 },
        data: { label: 'My Amazing Workflow', description: '', tags: [], visibility: 'private' },
        deletable: false,
    }
];

const useStore = create<AppState>()(
    persist(
        (set, get) => ({
            nodes: initialNodes,
            edges: [],
            theme: 'dark',
            setTheme: (theme) => set({ theme }),
            currentView: 'editor', // Default to editor for now to not break existing flow
            setCurrentView: (currentView) => set({ currentView }),
            isSidebarOpen: true,

            // [CLOUD]
            user: null,
            authStatus: 'idle',
            driveConnected: false,
            activeFileId: null,
            workflowList: [],
            isLoadingWorkflows: false,
            communityTemplates: defaultCommunityTemplates,
            savedGraphSignature: createGraphSignature(initialNodes, []),
            setUser: (user) => set({ user }),
            setAuthStatus: (authStatus) => set({ authStatus }),
            setDriveConnected: (driveConnected) => set({ driveConnected }),
            setActiveFileId: (activeFileId) => set({ activeFileId }),
            setWorkflowList: (workflowList) => set({ workflowList }),
            setLoadingWorkflows: (isLoadingWorkflows) => set({ isLoadingWorkflows }),
            setCommunityTemplates: (communityTemplates) => set({ communityTemplates }),
            upsertCommunityTemplate: (template) => set((state) => {
                const next = state.communityTemplates.filter(item => item.id !== template.id);
                return { communityTemplates: [template, ...next] };
            }),
            markCurrentGraphSaved: () => {
                const { nodes, edges } = get();
                set({ savedGraphSignature: createGraphSignature(nodes, edges) });
            },

            setSidebarOpen: (isSidebarOpen) => set({ isSidebarOpen }),
            isDeletingHover: false,
            setDeletingHover: (isDeletingHover) => set({ isDeletingHover }),
            isPaletteFloating: false,
            setPaletteFloating: (isPaletteFloating) => set({ isPaletteFloating }),
            palettePosition: { x: 100, y: 100 },
            setPalettePosition: (palettePosition) => set({ palettePosition }),

            globalVars: {},
            setGlobalVar: (name: string, value: string) => {
                get().takeSnapshot(false); // Snapshot with cool-down BEFORE change
                set((state) => ({
                    globalVars: { ...state.globalVars, [name]: value }
                }));
                // Evaluate graph so calculation nodes re-run immediately with the new global var
                get().evaluateGraph();
            },

            undoStack: [],
            redoStack: [],
            lastSnapshotTime: 0,

            takeSnapshot: (force = true) => {
                const { nodes, edges, globalVars, undoStack, lastSnapshotTime } = get();
                const now = Date.now();

                // COOLDOWN: If not forced and it's been less than 1.5s since last snapshot, skip.
                // This prevents typing from creating 100 undo points.
                if (!force && (now - lastSnapshotTime < 1500)) {
                    return;
                }
                
                // Keep history limited (e.g., last 50 steps)
                const MAX_HISTORY = 50;
                
                // Only snapshot if something actually changed from the last version
                const last = undoStack[undoStack.length - 1];
                if (last && 
                    JSON.stringify(last.nodes) === JSON.stringify(nodes) && 
                    JSON.stringify(last.edges) === JSON.stringify(edges) &&
                    JSON.stringify(last.globalVars) === JSON.stringify(globalVars)) {
                    return;
                }

                set({
                    undoStack: [...undoStack.slice(-MAX_HISTORY + 1), {
                        // We deep copy to avoid reference issues
                        nodes: JSON.parse(JSON.stringify(nodes)),
                        edges: JSON.parse(JSON.stringify(edges)),
                        globalVars: { ...globalVars }
                    }],
                    redoStack: [], // Clear redo on new action
                    lastSnapshotTime: now
                });
            },

            undo: () => {
                const { nodes, edges, globalVars, undoStack, redoStack } = get();
                if (undoStack.length === 0) return;

                const prev = undoStack[undoStack.length - 1];
                const newUndo = undoStack.slice(0, -1);

                set({
                    nodes: prev.nodes,
                    edges: prev.edges,
                    globalVars: prev.globalVars,
                    undoStack: newUndo,
                    redoStack: [{ nodes, edges, globalVars }, ...redoStack].slice(0, 50)
                });
                get().evaluateGraph();
            },

            redo: () => {
                const { nodes, edges, globalVars, undoStack, redoStack } = get();
                if (redoStack.length === 0) return;

                const next = redoStack[0];
                const newRedo = redoStack.slice(1);

                set({
                    nodes: next.nodes,
                    edges: next.edges,
                    globalVars: next.globalVars,
                    undoStack: [...undoStack, { nodes, edges, globalVars }].slice(-50),
                    redoStack: newRedo
                });
                get().evaluateGraph();
            },

            draggingEjectPos: null,
            setDraggingEjectPos: (pos) => set({ draggingEjectPos: pos }),

            hoveredNodeId: null,
            setHoveredNodeId: (id) => set({ hoveredNodeId: id }),

            updateNodeDimensions: (nodeId, deltaW, deltaH) => {
                const start = performance.now();
                const { nodes } = get();
                get().takeSnapshot(false); // Snapshot with cool-down for resizing
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
                        const dyBottom = Math.max(0, Math.abs(mousePos.y - (b.position.y + bHeight)));
                        const slots = b.data.slots || {};

                        // Detect side if not forced
                        const side = forcedSide || (dyTop < 40 ? 'top' : dyBottom < 40 ? 'bottom' : dxLeft < 40 ? 'left' : 'right');

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
                        // [FIX] Rule for TextNode Merges (Sliders, Buttons, Gates, Calculators, Loggers)
                        else if (b.type === 'textNode') {
                            if (a.type === 'sliderNode' || a.type === 'buttonNode' || a.type === 'gateNode') {
                                const key = a.data.nodeName || (a.type === 'sliderNode' ? 'x' : a.type === 'buttonNode' ? 'btn' : 'gate');
                                if (!slots[key]) {
                                    bestHint = { targetId: b.id, slotKey: key, label: `+ Embed ${a.type.replace('Node', '')} (${key})`, side: side };
                                }
                            } else if (a.type === 'calculateNode' || a.type === 'balanceNode' || a.type === 'calculusNode') {
                                // For calculations, use the custom label or generic name
                                const key = a.data.label || a.data.nodeName || (a.type === 'calculateNode' ? 'Result' : a.type === 'balanceNode' ? 'Eq' : 'Steps');
                                if (!slots[key]) {
                                    bestHint = { targetId: b.id, slotKey: key, label: `+ Insert Result/Step (${key})`, side: side };
                                }
                            } else if (a.type === 'appendNode') {
                                if (!slots.appender) {
                                    bestHint = { targetId: b.id, slotKey: 'appender', label: '+ Add Appender (Log)', side: 'bottom' };
                                }
                            }
                        }
                        // Rule for RIGHT Merges (Results for nodes that aren't TextNodes)
                        else if (side === 'right' && (b.type === 'calculateNode' || b.type === 'solveNode' || b.type === 'balanceNode' || b.type === 'calculusNode')) {
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
                        // [NEW] Rule for BOTTOM Merges (Specifically for AppendNode or others)
                        else if (side === 'bottom') {
                            if (a.type === 'appendNode' && b.type === 'textNode' && !slots.appender) {
                                bestHint = { targetId: b.id, slotKey: 'appender', label: '+ Add Appender (Log)', side: 'bottom' };
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
                get().takeSnapshot(); // Snapshot BEFORE change
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
                        let newWidth = n.width;

                        if (n.type === 'calculateNode' || n.type === 'solveNode' || n.type === 'calculusNode') {
                            const curHeight = n.height || n.measured?.height || 100;
                            const decr = (slotKey === 'gateNode') ? 55 : 45;
                            newHeight = Math.max(80, curHeight - decr);
                        }

                        if (slotKey === 'formulaSidebar' && n.type === 'graphNode') {
                            const curWidth = n.width || n.measured?.width || 300;
                            newWidth = Math.max(300, curWidth - 220);
                        }

                        return { 
                            ...n, 
                            height: newHeight, 
                            width: newWidth,
                            style: { ...n.style, width: newWidth, height: newHeight },
                            data: { ...n.data, slots: newSlots } 
                        };
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
                if (nodes.length > 0 || edges.length > 0) {
                    get().takeSnapshot(); // Snapshot BEFORE clear-all or massive change
                }
                
                // Ensure project-root exists
                const hasRoot = nodes.some(n => n.type === 'projectNode');
                let finalNodes = nodes;
                
                if (!hasRoot && (nodes.length > 0 || edges.length > 0)) {
                    finalNodes = [
                        {
                            id: 'project-root',
                            type: 'projectNode',
                            position: { x: -100, y: -100 },
                            data: { label: 'My Amazing Workflow', description: '', tags: [], visibility: 'private' },
                            deletable: false,
                        },
                        ...nodes
                    ];
                } else if (nodes.length === 0 && edges.length === 0) {
                    // If it's a clear-all action, restore the root node
                    finalNodes = initialNodes;
                    set({ globalVars: {}, activeFileId: null });
                }

                set({ nodes: finalNodes, edges, savedGraphSignature: createGraphSignature(finalNodes, edges) });
                // Defer evaluation
                setTimeout(() => get().evaluateGraph(), 50);
            },

            isAltPressed: false,
            setAltPressed: (pressed) => set({ isAltPressed: pressed }),

            isCtrlPressed: false,
            setCtrlPressed: (pressed) => set({ isCtrlPressed: pressed }),


    onNodesChange: (changes: NodeChange<AppNode>[]) => {
        if (changes.some(c => c.type === 'remove')) {
            get().takeSnapshot(); // Snapshot BEFORE removal
        }
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
        get().takeSnapshot(); // Snapshot BEFORE connecting
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

        get().takeSnapshot(false); // Snapshot with COOLDOWN (not forced)
        const nextData = { ...node.data, ...dataPatch };

        let nextEdges = edges;
        if (dataPatch.handles) {
            const oldHandles = node.data.handles || [];
            const newHandles = dataPatch.handles;
            
            // Map old handles by type and position index for re-binding
            const oldInputHandles = oldHandles.filter(h => h.type === 'input');
            const oldOutputHandles = oldHandles.filter(h => h.type === 'output');
            const newInputHandles = newHandles.filter(h => h.type === 'input');
            const newOutputHandles = newHandles.filter(h => h.type === 'output');

            const nextHandleIds = new Set(newHandles.map(h => h.id));
            
            nextEdges = edges.map(e => {
                const isOurSource = e.source === nodeId;
                const isOurTarget = e.target === nodeId;

                if (isOurSource && e.sourceHandle && !nextHandleIds.has(e.sourceHandle)) {
                    // Source handle (output) went missing. Try to find a replacement at the same index.
                    const oldIdx = oldOutputHandles.findIndex(h => h.id === e.sourceHandle);
                    if (oldIdx !== -1 && newOutputHandles[oldIdx]) {
                        return { ...e, sourceHandle: newOutputHandles[oldIdx].id };
                    }
                }
                if (isOurTarget && e.targetHandle && !nextHandleIds.has(e.targetHandle)) {
                    // Target handle (input) went missing. Try to find a replacement at the same index.
                    const oldIdx = oldInputHandles.findIndex(h => h.id === e.targetHandle);
                    if (oldIdx !== -1 && newInputHandles[oldIdx]) {
                        return { ...e, targetHandle: newInputHandles[oldIdx].id };
                    }
                }
                return e;
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
        get().takeSnapshot(); // Snapshot BEFORE adding
        set({
            nodes: [...get().nodes, node],
        });
    },

    addNodes: (newNodes: AppNode[]) => {
        get().takeSnapshot(); // Snapshot BEFORE adding multiple
        set({
            nodes: [...get().nodes, ...newNodes],
        });
    },

    removeNode: (nodeId: string) => {
        get().takeSnapshot(); // Snapshot BEFORE removing
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
        get().takeSnapshot(); // Snapshot BEFORE snap
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
                    const curWidth = b.width || b.measured?.width || 200;
                    
                    let nextHeight = (b.type === 'textNode') ? curHeight : curHeight + rule.heightIncrement;
                    let nextWidth = curWidth;

                    // [NEW] Automatic widening for sidebars
                    if (slotKey === 'formulaSidebar' && b.type === 'graphNode') {
                        nextWidth += 220; 
                    }

                    set({
                        nodes: get().nodes.map(n => {
                            if (n.id === b.id) return { 
                                ...n, 
                                width: nextWidth, 
                                height: nextHeight, 
                                style: { ...n.style, width: nextWidth, height: nextHeight },
                                data: { ...n.data, slots: newSlots } 
                            };
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

        // 1. Build adjacency list and in-degrees (Kahn's Algorithm)
        const adj = new Map<string, string[]>();
        const inDegree = new Map<string, number>();
        const targetToExplicit = new Map<string, typeof edges>();

        nodes.forEach(n => {
            adj.set(n.id, []);
            inDegree.set(n.id, 0);
        });

        edges.forEach(e => {
            if (adj.has(e.source) && inDegree.has(e.target)) {
                adj.get(e.source)!.push(e.target);
                inDegree.set(e.target, inDegree.get(e.target)! + 1);
            }
            if (!targetToExplicit.has(e.target)) targetToExplicit.set(e.target, []);
            targetToExplicit.get(e.target)!.push(e);
        });

        // 2. Add implicit virtual edges for formulaSidebar parsing
        nodes.forEach(n => {
            if (n.data.slots?.formulaSidebar) {
                const sid = typeof n.data.slots.formulaSidebar === 'string' ? n.data.slots.formulaSidebar : (n.data.slots.formulaSidebar as any).id;
                if (adj.has(sid) && inDegree.has(n.id)) {
                    adj.get(sid)!.push(n.id);
                    inDegree.set(n.id, inDegree.get(n.id)! + 1);
                }
            }
        });

        // 3. Initialize processing queue with 0-in-degree nodes
        const queue: string[] = [];
        inDegree.forEach((deg, id) => {
            if (deg === 0) queue.push(id);
        });

        const nodeMap = new Map<string, typeof nodes[0]>();
        nodes.forEach(n => nodeMap.set(n.id, n));
        let hasChanged = false;
        let processedCount = 0;

        const processNode = (nodeId: string) => {
            const node = nodeMap.get(nodeId);
            if (!node) return;

            const explicitEdges = targetToExplicit.get(node.id) || [];
            let valIn: string | undefined = undefined;
            let gateValFromEdge: string | undefined = undefined;
            const collectedInputs: Record<string, string> = {};

            if (explicitEdges.length > 0) {
                explicitEdges.forEach(e => {
                    const source = nodeMap.get(e.source);
                    if (!source) return;
                    const val = (e.sourceHandle && source.data.outputs?.[e.sourceHandle] !== undefined)
                        ? source.data.outputs[e.sourceHandle]
                        : source.data.value;
                    
                    if (val !== undefined) {
                        if (e.targetHandle) {
                            collectedInputs[e.targetHandle] = val;
                        }
                        if (valIn === undefined) valIn = val; // First one is the generic input
                    }

                    if (e.targetHandle === 'h-gate-in') {
                        gateValFromEdge = val;
                    }
                });
            }

            let updatedData = { ...node.data };
            let isUpdated = false;

            // Sync inputs Record
            if (JSON.stringify(collectedInputs) !== JSON.stringify(node.data.inputs || {})) {
                updatedData.inputs = collectedInputs;
                isUpdated = true;
            }

            // Process Gate Value
            if (gateValFromEdge !== undefined && gateValFromEdge !== node.data.gateValue) {
                updatedData.gateValue = gateValFromEdge;
                isUpdated = true;
            } else if (gateValFromEdge === undefined && node.data.gateValue !== undefined && node.data.slots?.gateNode) {
                updatedData.gateValue = undefined;
                isUpdated = true;
            }

            // Process Formula Input
            if (node.type === 'calculateNode' || node.type === 'graphNode' || node.type === 'soundNode') {
                const formulaEdges = edges.filter(e => e.target === node.id && e.targetHandle === 'h-fn-in');
                let formulaVal: string | undefined = undefined;
                
                if (node.data.slots?.formulaSidebar) {
                    const sid = typeof node.data.slots.formulaSidebar === 'string' ? node.data.slots.formulaSidebar : (node.data.slots.formulaSidebar as any).id;
                    const sidebarNode = nodeMap.get(sid);
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
                            const source = nodeMap.get(edge.source);
                            if (source) {
                                return (edge.sourceHandle && source.data.outputs?.[edge.sourceHandle]) ?? source.data.value;
                            }
                            return undefined;
                        }).filter(v => v !== undefined);
                        formulaVal = formulaParts.join(',');
                    } else {
                        const edge = formulaEdges[0];
                        const source = nodeMap.get(edge.source);
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

            // Process Generic Input
            if (node.type === 'decimalNode' || node.type === 'calculusNode' || node.type === 'gateNode' || node.type === 'balanceNode') {
                if (valIn !== node.data.input && node.type !== 'gateNode') {
                    updatedData.input = valIn;
                    // For BalanceNode, if the root input changes, we reset the currentFormula to run through operations
                    if (node.type === 'balanceNode') {
                        // The executeNode will rebuild it, so we ensure it knows
                        updatedData.currentFormula = valIn;
                    }
                    isUpdated = true;
                }
                if (valIn !== node.data.value && node.type === 'gateNode') {
                    updatedData.value = valIn;
                    isUpdated = true;
                }
            }

            // Process Text Node (Only if generic input and NO specific handles are connected)
            const hasSpecificInputs = Object.keys(collectedInputs).length > 0;
            if (node.type === 'textNode' && valIn !== undefined && !hasSpecificInputs) {
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

            // Build input signature to trigger downstream recalculation reliably
            if (['calculateNode', 'solveNode', 'graphNode', 'balanceNode'].includes(node.type || '')) {
                const signature = explicitEdges.map(e => {
                    const source = nodeMap.get(e.source);
                    return `${e.targetHandle}=${(e.sourceHandle && source?.data.outputs?.[e.sourceHandle]) ?? source?.data.value}`;
                }).sort().join('|');

                if (signature !== node.data.inputSignature) {
                    updatedData.inputSignature = signature;
                    isUpdated = true;
                }
            }

            if (isUpdated) {
                hasChanged = true;
                nodeMap.set(node.id, { ...node, data: updatedData });
            }
        };

        // 4. Resolve dependencies topologically
        while (queue.length > 0) {
            const currentId = queue.shift()!;
            processedCount++;
            processNode(currentId);

            const neighbors = adj.get(currentId) || [];
            for (const neighborId of neighbors) {
                const newDeg = (inDegree.get(neighborId) || 1) - 1;
                inDegree.set(neighborId, newDeg);
                if (newDeg === 0) {
                    queue.push(neighborId);
                }
            }
        }

        // 5. Handle cycles dynamically as best-effort fallback
        if (processedCount < nodes.length) {
            nodes.forEach(n => {
                if ((inDegree.get(n.id) || 0) > 0) {
                    processNode(n.id);
                }
            });
        }

        if (hasChanged) {
            set({ nodes: nodes.map(n => nodeMap.get(n.id) || n) });
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
          currentView: state.currentView,
          user: state.user,
          authStatus: state.authStatus,
          driveConnected: state.driveConnected,
          activeFileId: state.activeFileId,
          communityTemplates: state.communityTemplates,
      }),
  }
)
);

useStore.getState().evaluateGraph();

export default useStore;
