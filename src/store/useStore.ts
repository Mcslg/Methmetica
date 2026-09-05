import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type Edge } from '@xyflow/react';
import { getNodeDefinition } from '../nodes/registry';
import { canPlugin, PluginRules, type ProxyableType } from '../config/pluginRegistry';
import { defaultCommunityTemplates } from '../community/catalog';
import { getTemplateHandles, getTemplateInternalHandles, getTemplateInterfaceSchema, type CommunityNodeTemplate, type TemplateHandleSpec, type TemplateViewOverrides, type WorkflowIcon, type WorkflowVisibility } from '../community/types';
import type { AppUser, AuthStatus } from '../integrations/supabase/types';
import type { MathValue } from '../types/mathTypes';
import type { WorkflowSpec, WorkflowPortSpec } from '../types/workflowSpec';
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
import { runCompiledArtifact, compileSubgraphWorkflow } from '../utils/workflowCompiler';
import { loadLocalDraft } from '../utils/localDraftService';

export const createGraphSignature = (nodes: AppNode[], edges: Edge[]) => {
    const essentialNodes = nodes.map(n => ({
        id: n.id,
        type: n.type,
        position: n.position,
        width: n.width,
        height: n.height,
        // 過濾掉與存檔無關的 UI 狀態和暫時性計算結果
        data: Object.fromEntries(
            Object.entries(n.data).filter(([key]) => !['error', 'inputSignature', 'status', 'touchingEdges', 'publishStatus'].includes(key))
        )
    }));

    const essentialEdges = edges.map(e => {
        const rest = { ...(e as Record<string, unknown>) };
        delete rest.selected;
        delete rest.type;
        return rest;
    });

    return JSON.stringify({ nodes: essentialNodes, edges: essentialEdges });
};

export type HandleType = 'input' | 'output' | 'gate-in' | 'scope';

export type CustomHandle = {
    id: string;
    type: HandleType;
    position: 'top' | 'bottom' | 'left' | 'right';
    offset: number; // percentage 0-100
    label?: string; // Optional label for variables
    lineIndex?: number; // For TextNode: which line this handle is pinned to
    description?: string;
    declaredType?: string;
};

export type BalanceOperation = {
    op: string;
    value: string;
    targetSide?: 'lhs' | 'rhs';
    factor?: string;
    result?: string;
};

export type TextNodePage = {
    id: string;
    label: string;
    text: string;
};

export type NodeComment = {
    id: string;
    body: string;
    kind?: 'comment' | 'question' | 'request' | 'issue';
    status?: 'open' | 'resolved';
    authorId?: string;
    authorName: string;
    createdAt: string;
    resolvedAt?: string;
    resolvedBy?: string;
};

export type NodeData = {
    value?: string;
    code?: string;
    language?: string;
    error?: string;
    showCodeErrorOutput?: boolean;
    formula?: string; // For function nodes
    text?: string; // For text nodes
    pages?: TextNodePage[]; // For text node pagination
    activePageId?: string; // Currently selected page on text node
    handles?: CustomHandle[];
    input?: string; // For utility nodes to receive data
    touchingEdges?: { left?: boolean, right?: boolean, top?: boolean, bottom?: boolean };
    variant?: 'diff' | 'integ' | 'limit' | 'insert' | 'sine' | 'square' | 'sawtooth' | 'triangle' | 'custom';
    variable?: string; // For specifying differentiation/integration variable
    useExternalFormula?: boolean;
    formulaInput?: string; // Formula string received from an external connection
    outputs?: Record<string, string>; // Multi-output support (handleId -> value)
    typedOutputs?: Record<string, MathValue>; // Typed multi-output support (handleId -> MathValue)
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
    hideHeader?: boolean; // Hide the node header/chrome when the user wants a compact view
    parentId?: string; // ID of the container node that absorbed this node (for Option B Proxy)
    operations?: BalanceOperation[]; // For BalanceNode history
    currentFormula?: string; // For BalanceNode interim result
    inputSignature?: string; // A signature combining all incoming variable edge values to trigger calculation hooks
    inputs?: Record<string, string>; // Multi-input support (handleId -> value)
    manualInputs?: Record<string, string>; // User-entered fallback values for disconnected input handles
    typedInputs?: Record<string, MathValue>; // Typed multi-input support (handleId -> MathValue)
    limitPoint?: string; // For CalculusNode limit target (e.g. x -> a)
    description?: string; // For ProjectNode metadata
    tags?: string[]; // Shared workflow/tag metadata for builder root
    workflowIcon?: WorkflowIcon;
    ownerId?: string;
    authorName?: string;
    workflowSource?: 'local' | 'public' | 'drive' | 'draft';
    templateId?: string; // For reusable community template nodes
    templateDraft?: CommunityNodeTemplate;
    templateFields?: Record<string, string>;
    templateViewOverrides?: TemplateViewOverrides;
    templateSummary?: string;
    templateBestAlgorithm?: string;
    templateAlternatives?: string[];
    templateRelatedWorkflowIds?: string[];
    targetWorkflowId?: string;
    targetWorkflowTitle?: string;
    workflowSpec?: WorkflowSpec;
    subgraphId?: string;
    expectedInputs?: WorkflowPortSpec[];
    expectedOutputs?: WorkflowPortSpec[];
    callout?: string;
    builderDraft?: CommunityNodeTemplate;
    builderNode?: boolean;
    builderNodeId?: string;
    projectNodeId?: string;
    hasPublishedTemplate?: boolean;
    publishStatus?: string;
    linkedTemplateNodeId?: string;
    builderSourceId?: string;
    autoManagedTemplateNode?: boolean;
    readOnlyPreview?: boolean;
    supabaseWorkflowId?: string;
    workflowVersionId?: string;
    workflowVersion?: number;
    reviewStatus?: 'unreviewed' | 'approved';
    changeType?: 'edit' | 'feature' | 'fix' | 'hotfix';
    updatePolicy?: 'none' | 'manual' | 'auto';
    updateSummary?: string;
    warningMessage?: string;
    supersedesVersionId?: string;
    updateAvailable?: boolean;
    updateSeverity?: 'feature' | 'fix' | 'hotfix';
    updateMessage?: string;
    ignoredCommunityUpdateVersionId?: string;
    sourceWorkflowId?: string;
    sourceWorkflowVersionId?: string;
    sourceWorkflowSlug?: string;
    latestWorkflowVersionId?: string;
    latestWorkflowVersion?: number;
    reviewCount?: number;
    reviewRequired?: boolean;
    reviewWarning?: boolean;
    requiredContributorReviews?: number;
    requiredExpertReviews?: number;
    contributorReviewCount?: number;
    expertReviewCount?: number;
    extraContributorReviews?: number;
    extraExpertReviews?: number;
    reviewedByMe?: boolean;
    featured?: boolean;
    featuredAt?: string | null;
    curationScore?: number;
    coreProposalWorkflowId?: string;
    coreProposalBaseVersionId?: string;
    coreProposalSourceTitle?: string;
    coreProposalStatus?: 'draft' | 'submitted' | 'needs_changes' | 'approved' | 'merged' | 'rejected' | 'superseded';
     visibility?: WorkflowVisibility;
    autoRun?: boolean; // For nodes that can toggle automatic execution
    driveFileId?: string;
    driveFileName?: string;
    driveMimeType?: string;
    driveWebViewUrl?: string;
    driveThumbnailUrl?: string;
    nodeComments?: NodeComment[];
    // 自訂節點製造工作流草稿 ID（由 AI 實作 DummyNode 後自動生成並回填）
    draftId?: string;
    subgraphDraftId?: string;
};

const templateHandleToCustomHandle = (handle: TemplateHandleSpec): CustomHandle => ({
    id: handle.id,
    type: handle.type,
    position: handle.position,
    offset: handle.offset,
    label: handle.label,
});

const hydrateTemplateNodeHandles = (nodes: AppNode[]): AppNode[] => nodes.map((node) => {
    if (node.type !== 'communityTemplateNode') return node;
    const template = node.data.templateDraft;
    if (!template) return node;

    const templateHandles = node.data.autoManagedTemplateNode
        ? getTemplateInternalHandles(template).map(templateHandleToCustomHandle)
        : getTemplateHandles(template).map(templateHandleToCustomHandle);
    if (templateHandles.length === 0) return node;

    const existingHandles = node.data.handles || [];
    if (JSON.stringify(existingHandles) === JSON.stringify(templateHandles)) return node;
    return {
        ...node,
        data: {
            ...node.data,
            handles: templateHandles,
        },
    };
});

const normalizeBuilderBridgeGraph = (nodes: AppNode[], edges: Edge[]) => {
    const hydratedNodes = hydrateTemplateNodeHandles(nodes).map((node) => (
        node.type === 'projectNode' && (node.data.handles?.length ?? 0) > 0
            ? { ...node, data: { ...node.data, handles: [] } }
            : node
    ));

    const nodeById = new Map(hydratedNodes.map(node => [node.id, node]));
    const bridgeByProjectId = new Map<string, string>();
    hydratedNodes.forEach((node) => {
        if (node.type !== 'communityTemplateNode' || !node.data.builderSourceId || !node.data.autoManagedTemplateNode) return;
        bridgeByProjectId.set(node.data.builderSourceId, node.id);
    });

    const nextEdges = edges.map((edge) => {
        const sourceNode = nodeById.get(edge.source);
        const targetNode = nodeById.get(edge.target);
        const nextEdge = { ...edge };

        if ((sourceNode?.type === 'projectNode' || sourceNode?.type === 'nodeBuilderNode') && sourceNode.data.builderDraft) {
            const bridgeId = sourceNode.data.linkedTemplateNodeId || bridgeByProjectId.get(sourceNode.id);
            const schema = getTemplateInterfaceSchema(sourceNode.data.builderDraft);
            const inputHandleIds = new Set(schema.inputs.map(port => port.id));
            if (bridgeId && edge.sourceHandle && inputHandleIds.has(edge.sourceHandle)) {
                nextEdge.source = bridgeId;
            }
        }

        if ((targetNode?.type === 'projectNode' || targetNode?.type === 'nodeBuilderNode') && targetNode.data.builderDraft) {
            const bridgeId = targetNode.data.linkedTemplateNodeId || bridgeByProjectId.get(targetNode.id);
            const schema = getTemplateInterfaceSchema(targetNode.data.builderDraft);
            const outputHandleIds = new Set(schema.outputs.map(port => port.id));
            if (bridgeId && edge.targetHandle && outputHandleIds.has(edge.targetHandle)) {
                nextEdge.target = bridgeId;
            }
        }

        return nextEdge;
    });

    const validEdges = nextEdges.filter((edge) => {
        const sourceHandle = nodeById.get(edge.source)?.data.handles?.find(handle => handle.id === edge.sourceHandle);
        const targetHandle = nodeById.get(edge.target)?.data.handles?.find(handle => handle.id === edge.targetHandle);
        if (!sourceHandle || !targetHandle) return true;
        if (sourceHandle.type === 'scope' || targetHandle.type === 'scope') return true;
        return sourceHandle.type === 'output' && targetHandle.type === 'input';
    });

    return { nodes: hydratedNodes, edges: validEdges };
};

export type AppNode = Node<NodeData>;
export type WorkflowListItem = {
    id: string;
    name: string;
    modifiedTime: string;
    createdTime?: string;
    [key: string]: unknown;
};
type UpdateNodeDataOptions = {
    skipGraphEval?: boolean;
};

export type AppState = {
    nodes: AppNode[];
    edges: Edge[];
    onNodesChange: OnNodesChange<AppNode>;
    onEdgesChange: OnEdgesChange<Edge>;
    onConnect: OnConnect;
    toggleWirelessEdge: (edgeId: string) => void;
    updateNodeData: (nodeId: string, data: NodeData, options?: UpdateNodeDataOptions) => void;
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
    setGraphWithSavedBaseline: (nodes: AppNode[], edges: Edge[], savedNodes: AppNode[], savedEdges: Edge[]) => void;
    isAltPressed: boolean;
    setAltPressed: (pressed: boolean) => void;
    isCtrlPressed: boolean;
    setCtrlPressed: (pressed: boolean) => void;
    theme: 'light' | 'dark';
    setTheme: (theme: 'light' | 'dark') => void;
    sliceEdges: (start: { x: number, y: number }, end: { x: number, y: number }) => void;
    heldConnection: { nodeId: string, handleId: string, handleType: 'source' | 'target' } | null;
    setHeldConnection: (conn: AppState['heldConnection']) => void;
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

    // [NEW] Plugin hint during drag
    pluginHint: { targetId: string, slotKey: string, label: string, side: 'left' | 'right' | 'top' | 'bottom' } | null;
    updatePluginHint: (draggedNodeId: string, mousePos: { x: number, y: number } | null, side?: 'left' | 'right' | 'top' | 'bottom') => void;

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
    templateTesterProjectNodeId: string | null;
    openTemplateTester: (projectNodeId: string) => void;
    closeTemplateTester: () => void;

    // [CLOUD] Google Drive Integration
    user: AppUser | null;
    authStatus: AuthStatus;
    driveConnected: boolean;
    activeFileId: string | null;
    workflowList: WorkflowListItem[];
    isLoadingWorkflows: boolean;
    communityTemplates: CommunityNodeTemplate[];
    savedGraphSignature: string;
    setUser: (user: AppUser | null) => void;
    setAuthStatus: (status: AuthStatus) => void;
    setDriveConnected: (connected: boolean) => void;
    setActiveFileId: (id: string | null) => void;
    setWorkflowList: (list: WorkflowListItem[]) => void;
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

const hasCommunityRuntimePlan = (node: AppNode, state: AppState) => {
    if (node.type !== 'communityTemplateNode') return false;
    const template =
        (node.data.templateDraft as CommunityNodeTemplate | undefined) ??
        state.communityTemplates.find(item => item.id === node.data.templateId);
    return Boolean(template?.compiledArtifact || template?.runtimePlan);
};

const isBuilderBridgeNode = (node?: AppNode) => (
    node?.type === 'communityTemplateNode' &&
    Boolean(node.data?.builderSourceId) &&
    Boolean(node.data?.autoManagedTemplateNode)
);

const wouldCreateGraphCycle = (nodes: AppNode[], edges: Edge[], connection: Connection) => {
    const { source, target } = connection;
    if (!source || !target) return false;
    if (source === target) return true;

    const sourceNode = nodes.find(node => node.id === source);
    const targetNode = nodes.find(node => node.id === target);
    if (isBuilderBridgeNode(sourceNode) || isBuilderBridgeNode(targetNode)) {
        return false;
    }

    const outgoing = new Map<string, string[]>();
    edges.forEach(edge => {
        if (!edge.source || !edge.target) return;
        const targets = outgoing.get(edge.source) ?? [];
        targets.push(edge.target);
        outgoing.set(edge.source, targets);
    });

    const visited = new Set<string>();
    const queue = [target];

    while (queue.length > 0) {
        const current = queue.shift()!;
        if (current === source) return true;
        if (visited.has(current)) continue;
        visited.add(current);
        queue.push(...(outgoing.get(current) ?? []));
    }

    return false;
};

const useStore = create<AppState>()(
    persist(
        (set, get) => ({
            nodes: initialNodes,
            edges: [],
            theme: 'dark',
            setTheme: (theme) => set({ theme }),
            currentView: 'editor', // Default to editor for now to not break existing flow
            setCurrentView: (currentView) => set({ currentView }),
            templateTesterProjectNodeId: null,
            openTemplateTester: (templateTesterProjectNodeId) => set({ templateTesterProjectNodeId }),
            closeTemplateTester: () => set({ templateTesterProjectNodeId: null }),
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

            sliceEdges: (start, end) => {
                const { edges, nodes } = get();
                const edgesToRemove: string[] = [];

                // Helper: Line-Line intersection
                type Point2D = { x: number; y: number };
                const intersect = (p1: Point2D, p2: Point2D, p3: Point2D, p4: Point2D) => {
                    const det = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
                    if (det === 0) return false;
                    const lambda = ((p4.y - p3.y) * (p4.x - p1.x) + (p3.x - p4.x) * (p4.y - p1.y)) / det;
                    const gamma = ((p1.y - p2.y) * (p4.x - p1.x) + (p2.x - p1.x) * (p4.y - p1.y)) / det;
                    return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
                };

                // Simple Bézier sampler
                const getBezierPoint = (t: number, p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D) => {
                    const cx = 3 * (p1.x - p0.x);
                    const bx = 3 * (p2.x - p1.x) - cx;
                    const ax = p3.x - p0.x - cx - bx;
                    const cy = 3 * (p1.y - p0.y);
                    const by = 3 * (p2.y - p1.y) - cy;
                    const ay = p3.y - p0.y - cy - by;
                    const x = (ax * Math.pow(t, 3)) + (bx * Math.pow(t, 2)) + (cx * t) + p0.x;
                    const y = (ay * Math.pow(t, 3)) + (by * Math.pow(t, 2)) + (cy * t) + p0.y;
                    return { x, y };
                };

                edges.forEach(edge => {
                    const sourceNode = nodes.find(n => n.id === edge.source);
                    const targetNode = nodes.find(n => n.id === edge.target);
                    if (!sourceNode || !targetNode) return;

                    // Approximation of React Flow's edge paths
                    // We'll use 10 samples to check for intersection
                    const p0 = { 
                        x: sourceNode.position.x + (sourceNode.measured?.width ?? 200) / 2, 
                        y: sourceNode.position.y + (sourceNode.measured?.height ?? 100) / 2 
                    };
                    const p3 = { 
                        x: targetNode.position.x + (targetNode.measured?.width ?? 200) / 2, 
                        y: targetNode.position.y + (targetNode.measured?.height ?? 100) / 2 
                    };
                    
                    // For better accuracy, we should use handle positions, but even center-to-center bounding box helps.
                    // React Flow's default Bézier usually has control points offset horizontally or vertically.
                    const dx = Math.abs(p3.x - p0.x);
                    const p1 = { x: p0.x + dx / 2, y: p0.y };
                    const p2 = { x: p3.x - dx / 2, y: p3.y };

                    let prevPoint = p0;
                    for (let i = 1; i <= 10; i++) {
                        const currPoint = getBezierPoint(i / 10, p0, p1, p2, p3);
                        if (intersect(start, end, prevPoint, currPoint)) {
                            edgesToRemove.push(edge.id);
                            break;
                        }
                        prevPoint = currPoint;
                    }
                });

                if (edgesToRemove.length > 0) {
                    get().takeSnapshot();
                    
                    // [RECONNECT] Store the last sliced edge's source to 'hand-held'
                    const lastEdge = edges.find(e => e.id === edgesToRemove[edgesToRemove.length - 1]);
                    if (lastEdge) {
                        set({ 
                            heldConnection: { 
                                nodeId: lastEdge.source, 
                                handleId: lastEdge.sourceHandle || 'h-out', 
                                handleType: 'source' 
                            } 
                        });
                    }

                    set({ edges: edges.filter(e => !edgesToRemove.includes(e.id)) });
                    get().evaluateGraph();
                }
            },

            heldConnection: null,
            setHeldConnection: (heldConnection) => set({ heldConnection }),

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

            pluginHint: null,
            updatePluginHint: (draggedNodeId, mousePos, forcedSide) => {
                if (!mousePos) {
                    set({ pluginHint: null });
                    return;
                }
                const { nodes } = get();
                const a = nodes.find(n => n.id === draggedNodeId);
                if (!a) return;

                let bestHint: AppState['pluginHint'] = null;

                for (const b of nodes) {
                    if (b.id === draggedNodeId || b.hidden || !b.type) continue;
                    if (!canPlugin(a.type as string, b.type as string)) continue;

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

                        // Rule for left-side plugin slots (inputs/sidebar)
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
                        // [FIX] Rule for TextNode plugin slots (sliders, buttons, gates, calculators, loggers)
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
                        // Rule for right-side plugin slots (results for non-TextNodes)
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
                        // Rule for top-side plugin slots (comments)
                        else if (side === 'top') {
                            if (a.type === 'textNode' && !slots.comment) {
                                bestHint = { targetId: b.id, slotKey: 'comment', label: '+ Add Note', side: 'top' };
                            }
                        }
                        // [NEW] Rule for bottom-side plugin slots
                        else if (side === 'bottom') {
                            if (a.type === 'appendNode' && b.type === 'textNode' && !slots.appender) {
                                bestHint = { targetId: b.id, slotKey: 'appender', label: '+ Add Appender (Log)', side: 'bottom' };
                            }
                        }
                        break; 
                    }
                }
                set({ pluginHint: bestHint });
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

                const normalizedGraph = normalizeBuilderBridgeGraph(finalNodes, edges);

                set({
                    nodes: normalizedGraph.nodes,
                    edges: normalizedGraph.edges,
                    savedGraphSignature: createGraphSignature(normalizedGraph.nodes, normalizedGraph.edges),
                });
                // Defer evaluation
                setTimeout(() => get().evaluateGraph(), 50);
            },

            setGraphWithSavedBaseline: (nodes, edges, savedNodes, savedEdges) => {
                const normalizedGraph = normalizeBuilderBridgeGraph(nodes, edges);
                const normalizedSavedGraph = normalizeBuilderBridgeGraph(savedNodes, savedEdges);
                set({
                    nodes: normalizedGraph.nodes,
                    edges: normalizedGraph.edges,
                    savedGraphSignature: createGraphSignature(normalizedSavedGraph.nodes, normalizedSavedGraph.edges),
                });
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
        const { nodes, edges } = get();

        if (wouldCreateGraphCycle(nodes, edges, connection)) {
            const message = 'Workflow graph 目前不支援循環依賴。請用 CodeNode 或未來的迭代節點處理迴圈。';
            console.warn(message, connection);
            if (typeof window !== 'undefined') {
                window.alert(message);
            }
            return;
        }

        get().takeSnapshot(); // Snapshot BEFORE connecting
        const sourceNode = nodes.find(n => n.id === connection.source);
        const targetNode = nodes.find(n => n.id === connection.target);
        const sourceHandle = sourceNode?.data.handles?.find(h => h.id === connection.sourceHandle);
        const targetHandle = targetNode?.data.handles?.find(h => h.id === connection.targetHandle);
        const isScopeEdge = sourceHandle?.type === 'scope' || targetHandle?.type === 'scope';
        if (!isScopeEdge && sourceHandle && targetHandle && (sourceHandle.type !== 'output' || targetHandle.type !== 'input')) {
            console.warn('Invalid handle direction. Connect outputs to inputs.', connection);
            return;
        }
        const newEdge = {
            ...connection,
            type: 'default',
            className: isScopeEdge ? 'scope-edge' : 'data-edge',
            style: {
                strokeWidth: 2,
                stroke: isScopeEdge ? '#8a8a8a' : '#3d5a80'
            }
        };

        set({
            edges: addEdge(newEdge, get().edges),
        });
        get().evaluateGraph();
    },

    toggleWirelessEdge: (edgeId: string) => {
        get().takeSnapshot();
        const currentEdges = get().edges;
        const nextEdges = currentEdges.map((edge) => {
            if (edge.id !== edgeId) return edge;

            const classes = new Set((edge.className || '').split(/\s+/).filter(Boolean));
            const isWireless = classes.has('wireless-edge');
            if (isWireless) {
                classes.delete('wireless-edge');
            } else {
                classes.add('wireless-edge');
            }
            if (!classes.has('data-edge') && !classes.has('scope-edge')) {
                classes.add('data-edge');
            }

            const isScope = classes.has('scope-edge');
            const nextStroke = isWireless ? (isScope ? '#8a8a8a' : '#3d5a80') : '#9ca3af';

            return {
                ...edge,
                className: Array.from(classes).join(' '),
                style: {
                    ...(edge.style || {}),
                    strokeWidth: 2,
                    stroke: nextStroke,
                    strokeDasharray: isWireless ? undefined : '6 4',
                },
            };
        });
        set({ edges: nextEdges });
    },

    updateNodeData: (nodeId: string, dataPatch: Partial<NodeData>, options?: UpdateNodeDataOptions) => {
        const { nodes, edges } = get();
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;

        get().takeSnapshot(false); // Snapshot with COOLDOWN (not forced)
        let normalizedPatch = { ...dataPatch };

        if (node.type === 'textNode' && (
            normalizedPatch.text !== undefined ||
            normalizedPatch.pages !== undefined ||
            normalizedPatch.activePageId !== undefined
        )) {
            const existingPages = (normalizedPatch.pages ?? node.data.pages)?.map((page) => ({ ...page })) || [];
            const fallbackPage: TextNodePage = {
                id: node.data.activePageId || 'page-1',
                label: 'Page 1',
                text: node.data.text || ''
            };
            const pages = existingPages.length > 0 ? existingPages : [fallbackPage];
            const requestedActivePageId = normalizedPatch.activePageId ?? node.data.activePageId ?? pages[0].id;
            const activePageId = pages.some((page) => page.id === requestedActivePageId) ? requestedActivePageId : pages[0].id;

            if (normalizedPatch.text !== undefined) {
                const nextText = normalizedPatch.text ?? '';
                const activeIndex = pages.findIndex((page) => page.id === activePageId);
                if (activeIndex >= 0) {
                    pages[activeIndex] = { ...pages[activeIndex], text: nextText };
                }
            }

            const activePage = pages.find((page) => page.id === activePageId) || pages[0];
            normalizedPatch = {
                ...normalizedPatch,
                pages,
                activePageId,
                text: activePage.text || ''
            };
        }

        const nextData = { ...node.data, ...normalizedPatch };
        const dataChanged = Object.keys(normalizedPatch).some((key) => nextData[key as keyof NodeData] !== node.data[key as keyof NodeData]);

        let nextEdges = edges;
        if (normalizedPatch.handles) {
            const oldHandles = node.data.handles || [];
            const newHandles = normalizedPatch.handles;
            
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

        if (!dataChanged && nextEdges === edges) {
            return;
        }

        set({
            nodes: nodes.map((n) => (n.id === nodeId ? { ...n, data: nextData } : n)),
            edges: nextEdges
        });

        if (options?.skipGraphEval) {
            return;
        }

        // Trigger execution for nodes that should auto-run on data change
        const isExecutionTrigger = 
            normalizedPatch.code !== undefined || 
            normalizedPatch.input !== undefined || 
            normalizedPatch.inputs !== undefined || 
            normalizedPatch.formula !== undefined ||
            normalizedPatch.rangeDef !== undefined;

        if (isExecutionTrigger) {
            if (
                node.type === 'numberNode' || 
                node.type === 'functionNode' || 
                node.type === 'calculateNode' || 
                node.type === 'gateNode' || 
                node.type === 'rangeNode' ||
                (node.type === 'communityTemplateNode' && hasCommunityRuntimePlan({ ...node, data: nextData }, get())) ||
                (node.type === 'codeNode' && nextData.autoRun)
            ) {
                get().executeNode(nodeId);
            } else {
                get().evaluateGraph();
            }
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

            // [NEW] Sync results to plugged resultText slot if present
            if (node.data.slots?.resultText) {
                const textNodeId = typeof node.data.slots.resultText === 'string' 
                    ? node.data.slots.resultText 
                    : node.data.slots.resultText.id;
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
        const { nodes, pluginHint } = get();
        const a = nodes.find(n => n.id === nodeId);
        if (!a) { console.warn("Snap fail: A not found"); return; }

        if (pluginHint && pluginHint.targetId) {
            const b = nodes.find(n => n.id === pluginHint.targetId);
            if (b) {
                const rule = PluginRules[a.type as ProxyableType];
                if (!rule) { console.warn("Snap fail: No rule for", a.type); return; }

                const slotKey = pluginHint.slotKey;
                const currentSlots = b.data.slots || {};
                
                if (!currentSlots[slotKey]) {
                    console.log(`Plugging ${a.id} into ${b.id} at ${slotKey}`);
                    const newSlots = { ...currentSlots, [slotKey]: a.id };
                    const curHeight = b.height || b.measured?.height || 100;
                    const curWidth = b.width || b.measured?.width || 200;
                    
                    const nextHeight = (b.type === 'textNode') ? curHeight : curHeight + rule.heightIncrement;
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
                        pluginHint: null 
                    });
                    // [PERF] Defer evaluateGraph so React can batch the structural render first.
                    // Without this, plugging in triggers ~50 re-renders. With this, it's ~2.
                    requestAnimationFrame(() => get().evaluateGraph());
                    return;
                } else {
                    console.warn(`Snap fail: Slot ${slotKey} occupied`);
                }
            } else {
                console.warn("Snap fail: B not found");
            }
        } else {
            return;
        }
        
        set({ pluginHint: null });
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
                const sid = typeof n.data.slots.formulaSidebar === 'string' ? n.data.slots.formulaSidebar : n.data.slots.formulaSidebar.id;
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
        const autoExecutableCommunityNodeIds = new Set<string>();

        const processNode = (nodeId: string) => {
            const node = nodeMap.get(nodeId);
            if (!node) return;

            const explicitEdges = targetToExplicit.get(node.id) || [];
            let valIn: string | undefined = undefined;
            let gateValFromEdge: string | undefined = undefined;
            const collectedInputs: Record<string, string> = {};
            const collectedTypedInputs: Record<string, MathValue> = {};

            if (explicitEdges.length > 0) {
                explicitEdges.forEach(e => {
                    const source = nodeMap.get(e.source);
                    if (!source) return;
                    const val = (e.sourceHandle && source.data.outputs?.[e.sourceHandle] !== undefined)
                        ? source.data.outputs[e.sourceHandle]
                        : source.data.value;
                    const typedVal = e.sourceHandle
                        ? source.data.typedOutputs?.[e.sourceHandle]
                        : undefined;
                    
                    if (val !== undefined) {
                        if (e.targetHandle) {
                            collectedInputs[e.targetHandle] = val;
                        }
                        if (valIn === undefined) valIn = val; // First one is the generic input
                    }

                    if (typedVal && e.targetHandle) {
                        collectedTypedInputs[e.targetHandle] = typedVal;
                    }

                    if (e.targetHandle === 'h-gate-in') {
                        gateValFromEdge = val;
                    }
                });
            }

            const connectedTargetHandles = new Set(
                explicitEdges
                    .map(e => e.targetHandle)
                    .filter((handleId): handleId is string => Boolean(handleId))
            );
            Object.entries(node.data.manualInputs || {}).forEach(([handleId, manualValue]) => {
                if (connectedTargetHandles.has(handleId)) return;
                const handle = node.data.handles?.find(h => h.id === handleId);
                if (handle && handle.type !== 'input' && handle.type !== 'gate-in') return;

                collectedInputs[handleId] = manualValue;
                if (valIn === undefined) valIn = manualValue;
                if (handleId === 'h-gate-in') {
                    gateValFromEdge = manualValue;
                }
            });

            const updatedData = { ...node.data };
            let isUpdated = false;

            // Sync inputs Record
            if (JSON.stringify(collectedInputs) !== JSON.stringify(node.data.inputs || {})) {
                updatedData.inputs = collectedInputs;
                isUpdated = true;
            }

            if (JSON.stringify(collectedTypedInputs) !== JSON.stringify(node.data.typedInputs || {})) {
                updatedData.typedInputs = collectedTypedInputs;
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
                    const sid = typeof node.data.slots.formulaSidebar === 'string' ? node.data.slots.formulaSidebar : node.data.slots.formulaSidebar.id;
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

                if (!formulaVal && collectedInputs['h-fn-in'] !== undefined) {
                    formulaVal = collectedInputs['h-fn-in'];
                }

                if (formulaVal !== node.data.formulaInput) {
                    updatedData.formulaInput = formulaVal;
                    isUpdated = true;
                }
            }

            // Process Generic Input
            if (node.type === 'decimalNode' || node.type === 'calculusNode' || node.type === 'gateNode' || node.type === 'balanceNode' || node.type === 'codeNode' || node.type === 'outputNode') {
                if (valIn !== node.data.input && node.type !== 'gateNode') {
                    updatedData.input = valIn;
                    // For BalanceNode, if the root input changes, we reset the currentFormula to run through operations
                    if (node.type === 'balanceNode') {
                        // The executeNode will rebuild it, so we ensure it knows
                        updatedData.currentFormula = valIn;
                    }
                    isUpdated = true;
                }
                if (node.type === 'outputNode' && valIn !== undefined && valIn !== node.data.value) {
                    updatedData.value = valIn;
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

            // Process Composite Workflow Node (子工作流無狀態求值)
            if (node.type === 'compositeWorkflowNode') {
                const draftId = (node.data.draftId || node.data.subgraphDraftId) as string | undefined;
                let subgraphGraph: { nodes: AppNode[]; edges: Edge[] } | null = null;

                if (draftId) {
                    const draft = loadLocalDraft(draftId);
                    if (draft && draft.nodes) {
                        subgraphGraph = { nodes: draft.nodes, edges: draft.edges || [] };
                    }
                }

                if (subgraphGraph && subgraphGraph.nodes.length > 0) {
                    // 輸入端點比對映射：外部輸入 handle -> 子圖 inputNode ID
                    const runtimeInputs: Record<string, string> = {};
                    Object.entries(collectedInputs).forEach(([key, val]) => {
                        runtimeInputs[key] = val;
                    });

                    // 編譯並執行子圖
                    const compileResult = compileSubgraphWorkflow(subgraphGraph);
                    if (!compileResult.ok || !compileResult.artifact) {
                        const errorMsg = compileResult.diagnostics.map(d => d.message).join('；');
                        if (updatedData.error !== errorMsg) {
                            updatedData.error = errorMsg;
                            isUpdated = true;
                        }
                    } else {
                        // 執行求值 (若無非同步 codeNode，其求值皆同步在 Promise 微任務中立即返回)
                        runCompiledArtifact(compileResult.artifact, runtimeInputs).then(result => {
                            if (result.error) {
                                get().updateNodeData(node.id, { error: result.error }, { skipGraphEval: true });
                            } else {
                                const currentOutputs = node.data.outputs || {};
                                if (JSON.stringify(currentOutputs) !== JSON.stringify(result.outputs)) {
                                    get().updateNodeData(node.id, {
                                        outputs: result.outputs,
                                        value: Object.values(result.outputs)[0] || '',
                                        error: undefined,
                                    });
                                }
                            }
                        }).catch(err => {
                            get().updateNodeData(node.id, {
                                error: err instanceof Error ? err.message : String(err),
                            }, { skipGraphEval: true });
                        });
                    }
                }
            }

            // Build input signature to trigger downstream recalculation reliably
            if (['calculateNode', 'solveNode', 'graphNode', 'balanceNode', 'codeNode', 'compositeWorkflowNode'].includes(node.type || '')) {
                const signature = Object.keys(collectedInputs)
                    .sort()
                    .map(handleId => `${handleId}=${collectedInputs[handleId]}|typed=${JSON.stringify(collectedTypedInputs[handleId] ?? '')}`)
                    .join('|');

                if (signature !== node.data.inputSignature) {
                    updatedData.inputSignature = signature;
                    isUpdated = true;
                }
            }

            if (isUpdated) {
                hasChanged = true;
                const updatedNode = { ...node, data: updatedData };
                nodeMap.set(node.id, updatedNode);
                if (hasCommunityRuntimePlan(updatedNode, get())) {
                    autoExecutableCommunityNodeIds.add(node.id);
                }
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
            autoExecutableCommunityNodeIds.forEach(id => get().executeNode(id));
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
