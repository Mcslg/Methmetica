import { create } from 'zustand';
import { type Edge } from '@xyflow/react';
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
import { CalculationService } from '../utils/CalculationService';

export type HandleType = 'input' | 'output' | 'trigger-in' | 'trigger-out' | 'trigger-err';

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
    executeNode: (nodeId: string) => void;
    triggerNode: (nodeId: string, handleId: string) => void;
    checkProximity: () => void;
    handleProximitySnap: (nodeId: string) => void;
    implicitEdges: { source: string, target: string }[];
    evaluateGraph: () => void;
    setGraph: (nodes: AppNode[], edges: Edge[]) => void;
};

export const dataNodeHandles: CustomHandle[] = [
    { id: 'h-in', type: 'input', position: 'left', offset: 50 },
    { id: 'h-out', type: 'output', position: 'right', offset: 50 }
];

export const toolNodeHandles: CustomHandle[] = [
    { id: 'h-in', type: 'input', position: 'left', offset: 50 },
    { id: 'h-out', type: 'output', position: 'right', offset: 50 },
];

export const calculusNodeHandles: CustomHandle[] = [
    { id: 'h-in', type: 'input', position: 'left', offset: 50 },
    { id: 'h-out', type: 'output', position: 'right', offset: 50 },
];

export const textNodeHandles: CustomHandle[] = [
    { id: 'h-in', type: 'input', position: 'left', offset: 50 }
];

export const buttonNodeHandles: CustomHandle[] = [
    { id: 'h-tr-out', type: 'trigger-out', position: 'right', offset: 50 }
];

export const appendNodeHandles: CustomHandle[] = [
    { id: 'h-in', type: 'input', position: 'left', offset: 50 },
];

export const insertNodeHandles: CustomHandle[] = [
    { id: 'h-in', type: 'input', position: 'left', offset: 30, label: 'Value' },
    { id: 'h-index', type: 'input', position: 'left', offset: 70, label: 'Line index' },
];

export const gateNodeHandles: CustomHandle[] = [
    { id: 'h-in', type: 'input', position: 'top', offset: 50 },
    { id: 'h-tr-in', type: 'trigger-in', position: 'left', offset: 50 },
    { id: 'h-tr-out', type: 'trigger-out', position: 'right', offset: 50 },
];

export const rangeNodeHandles: CustomHandle[] = [
    { id: 'h-out', type: 'output', position: 'right', offset: 50 }
];

export const forEachNodeHandles: CustomHandle[] = [
    { id: 'h-tr-in', type: 'trigger-in', position: 'left', offset: 30 },
    { id: 'h-seq-in', type: 'input', position: 'left', offset: 70 },
    { id: 'h-tr-out', type: 'trigger-out', position: 'right', offset: 50 }
];

export const graphNodeHandles: CustomHandle[] = [
    { id: 'h-fn-in', type: 'input', position: 'left', offset: 50, label: 'f(x)' }
];

export const sliderNodeHandles: CustomHandle[] = [
    { id: 'h-out', type: 'output', position: 'right', offset: 50, label: 'val' }
];


// Initial setup nodes
const initialNodes: AppNode[] = [];

const useStore = create<AppState>((set, get) => ({
    nodes: initialNodes,
    edges: [],
    implicitEdges: [],

    setGraph: (nodes, edges) => {
        set({ nodes, edges, implicitEdges: [] });
    },

    onNodesChange: (changes: NodeChange<AppNode>[]) => {
        set({
            nodes: applyNodeChanges(changes, get().nodes),
        });
        get().checkProximity();
    },

    onEdgesChange: (changes: EdgeChange[]) => {
        const currentEdges = get().edges;
        const nextEdges = applyEdgeChanges(changes, currentEdges);
        
        // Check for removed edges to cleanup trigger-in handles
        changes.forEach(change => {
            if (change.type === 'remove') {
                const edge = currentEdges.find(e => e.id === change.id);
                if (edge && edge.targetHandle) {
                    const targetNode = get().nodes.find(n => n.id === edge.target);
                    const handle = targetNode?.data.handles?.find(h => h.id === edge.targetHandle);
                    
                    if (handle?.type === 'trigger-in') {
                        // If no other edge is using this handle in the NEXT state, remove it
                        const isStillUsed = nextEdges.some(e => e.target === edge.target && e.targetHandle === edge.targetHandle);
                        if (!isStillUsed) {
                            // Defer handle removal to avoid React Flow update conflicts during onEdgesChange
                            setTimeout(() => get().removeHandle(edge.target, edge.targetHandle!), 0);
                        }
                    }
                }
            }
        });

        set({ edges: nextEdges });
        get().evaluateGraph();
    },

    onConnect: (connection: Connection) => {
        const { nodes } = get();
        const sourceNode = nodes.find(n => n.id === connection.source);
        const sourceHandle = sourceNode?.data.handles?.find(h => h.id === connection.sourceHandle);

        const isTrigger = sourceHandle?.type.startsWith('trigger');

        const newEdge = {
            ...connection,
            type: 'default',
            animated: isTrigger,
            className: isTrigger ? 'trigger-edge' : 'data-edge',
            style: {
                strokeWidth: 2,
                stroke: isTrigger ? '#b8860b' : '#3d5a80'
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
        set({
            nodes: get().nodes.filter(n => n.id !== nodeId),
            edges: get().edges.filter(e => e.source !== nodeId && e.target !== nodeId)
        });
        get().evaluateGraph();
    },

    executeNode: (nodeId: string) => {
        const { nodes } = get();
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;

        if (['addNode', 'calculateNode', 'toolNode', 'decimalNode', 'calculusNode', 'appendNode', 'gateNode', 'rangeNode', 'forEachNode'].includes(node.type || '')) {
            if (node.type === 'forEachNode') {
                const seqVal = node.data.input || '[]';
                let seq: any[] = [];
                try {
                    seq = JSON.parse(seqVal);
                    if (!Array.isArray(seq)) seq = [seqVal];
                } catch {
                    seq = [seqVal];
                }

                if (seq.length === 0) return;

                // Find neighbor (prioritize magnetic/implicit connection on right or bottom)
                const implicitNeighbor = get().implicitEdges.find(e => e.source === nodeId)?.target;
                const explicitNeighbor = get().edges.find(e => e.source === nodeId)?.target;
                const neighborId = implicitNeighbor || explicitNeighbor;
                
                if (!neighborId) {
                    get().updateNodeData(nodeId, { status: 'Error: No Target' });
                    return;
                }

                const runLoop = async () => {
                    for (let i = 0; i < seq.length; i++) {
                        const item = seq[i];
                        // Update its own value so connected nodes can read it (like CalculateNode)
                        get().updateNodeData(nodeId, { 
                            status: `Item ${i+1}/${seq.length}`,
                            value: String(item)
                        });
                        
                        // Also update the target's explicit input (like Calculus or Decimal node)
                        get().updateNodeData(neighborId, { input: String(item) });
                        await new Promise(r => setTimeout(r, 100));
                        get().executeNode(neighborId);
                        await new Promise(r => setTimeout(r, 50));
                    }
                    get().updateNodeData(nodeId, { status: 'Done' });
                    node.data.handles?.filter(h => h.type === 'trigger-out').forEach(h => get().triggerNode(nodeId, h.id));
                };
                runLoop();
                return;
            }
            if (node.type === 'rangeNode') {
                const inputs = (node.data.rangeDef || '0..10').split('..');
                const start = parseInt(inputs[0] || '0');
                const end = parseInt(inputs[1] || '10');
                const range = [];
                // Safety cap to prevent browser hang
                const count = Math.min(Math.abs(end - start) + 1, 1000);
                const step = start <= end ? 1 : -1;
                for(let i = 0; i < count; i++) {
                    range.push(start + (i * step));
                }
                const res = JSON.stringify(range);
                
                set({ nodes: get().nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, value: res } } : n) });
                node.data.handles?.filter(h => h.type === 'trigger-out').forEach(h => get().triggerNode(nodeId, h.id));
                get().evaluateGraph();
                return;
            }
            if (node.type === 'gateNode') {
                const val = Number(node.data.value || 0);
                if (val !== 0) {
                    // Fire all trigger-out handles
                    node.data.handles?.filter(h => h.type === 'trigger-out').forEach(h => get().triggerNode(nodeId, h.id));
                }
                return;
            }
            if (node.type === 'appendNode') {
                const explicitEdges = get().edges.filter(e => e.target === nodeId);
                const implicitInputs = get().implicitEdges.filter(e => e.target === nodeId);
                
                const values = [
                    ...explicitEdges.map(e => {
                        const source = nodes.find(n => n.id === e.source);
                        return (e.sourceHandle && source?.data.outputs?.[e.sourceHandle]) ?? source?.data.value;
                    }),
                    ...implicitInputs.map(e => nodes.find(n => n.id === e.source)?.data?.value)
                ].filter(v => v !== undefined);
                
                const val = values[0];
                if (val !== undefined && val !== '') {
                    // Find all implicit neighbors
                    const neighbors = get().implicitEdges
                        .filter(e => e.source === nodeId || e.target === nodeId)
                        .map(e => e.source === nodeId ? e.target : e.source);
                    
                    // Specifically find the textNode among neighbors
                    const targetNode = nodes.find(n => neighbors.includes(n.id) && n.type === 'textNode');
                    
                        if (targetNode?.type === 'textNode') {
                            const oldText = targetNode.data.text || '';
                            let lines = oldText.split('\n');
                            let appendix = String(val);
                            
                            // Detect if it's a number, formula, or already wrapped
                            const isNumeric = !isNaN(Number(appendix)) && appendix.trim() !== '';
                            const isLaTeX = appendix.includes('\\') || appendix.includes('{');
                            const alreadyWrapped = (appendix.startsWith('$$') && appendix.endsWith('$$')) || (appendix.startsWith('[[') && appendix.endsWith(']]'));

                            
                            if ((isNumeric || isLaTeX) && !alreadyWrapped) {
                                appendix = `$$${appendix.trim()}$$`;
                            }


                            if (node.data.variant === 'insert') {
                                // Find line index input
                                const indexEdge = get().edges.find(e => e.target === nodeId && e.targetHandle === 'h-index');
                                let lineIndex = 0;
                                if (indexEdge) {
                                    const source = nodes.find(n => n.id === indexEdge.source);
                                    lineIndex = Number((indexEdge.sourceHandle && source?.data.outputs?.[indexEdge.sourceHandle]) ?? source?.data.value ?? 0);
                                } else {
                                    // Try implicit index if any (though usually explicit is better for index)
                                    const implicitIndex = get().implicitEdges.find(e => e.target === nodeId);
                                    if (implicitIndex) {
                                        const source = nodes.find(n => n.id === implicitIndex.source);
                                        lineIndex = Number(source?.data.value || 0);
                                    }
                                }
                                
                                // Clean up lines: if all empty, reset
                                if (lines.length === 1 && lines[0] === '') lines = [];
                                
                                // Insert at index
                                const idx = Math.max(0, Math.min(lines.length, Math.floor(lineIndex)));
                                lines.splice(idx, 0, appendix);
                                get().updateNodeData(targetNode.id, { text: lines.join('\n') });
                            } else {
                                // Default Append mode
                                get().updateNodeData(targetNode.id, { text: oldText + (oldText ? '\n' : '') + appendix });
                            }
                        }
                    // Update our own display value
                    set({ nodes: get().nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, value: val } } : n) });
                }
                return;
            }

            const handleResult = (res: string) => {
                const currentNodes = get().nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, value: res } } : n);
                set({ nodes: currentNodes });

                // Fire Trigger-Out
                const updatedNode = currentNodes.find(n => n.id === nodeId);
                updatedNode?.data.handles?.filter(h => h.type === 'trigger-out').forEach(h => get().triggerNode(nodeId, h.id));

                // Implicit connections
                get().implicitEdges.filter(e => e.source === nodeId).forEach(edge => get().executeNode(edge.target));

                get().evaluateGraph();
            };

            const handleError = (err: string) => {
                set({ nodes: get().nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, value: err } } : n) });
                const updatedNode = get().nodes.find(n => n.id === nodeId);
                updatedNode?.data.handles?.filter(h => h.type === 'trigger-err').forEach(h => get().triggerNode(nodeId, h.id));
                get().implicitEdges.filter(e => e.source === nodeId).forEach(edge => get().executeNode(edge.target));
            };

            CalculationService.calculate(node, {
                nodes: get().nodes,
                edges: get().edges,
                implicitEdges: get().implicitEdges
            })
                .then(handleResult)
                .catch((e) => {
                    handleError(e?.message || String(e));
                });
        }
    },

    triggerNode: (nodeId: string, handleId: string) => {
        const { edges, nodes } = get();
        edges
            .filter(e => e.source === nodeId && e.sourceHandle === handleId)
            .forEach(e => {
                const targetNode = nodes.find(n => n.id === e.target);
                const targetHandle = targetNode?.data.handles?.find(h => h.id === e.targetHandle);
                // Fire if connecting to a trigger-in or plain input handle (by type, not ID)
                if (targetHandle?.type === 'trigger-in' || targetHandle?.type === 'input'
                    || e.targetHandle?.startsWith('h-tr-in') || e.targetHandle === 'h-in') {
                    get().executeNode(e.target);
                }
            });
    },

    checkProximity: () => {
        const { nodes } = get();
        const implicitEdges: { source: string, target: string }[] = [];
        const touchingStates: Record<string, { left: boolean, right: boolean, top: boolean, bottom: boolean }> = {};

        nodes.forEach(nodeA => {
            if (!touchingStates[nodeA.id]) touchingStates[nodeA.id] = { left: false, right: false, top: false, bottom: false };
            
            nodes.forEach(nodeB => {
                if (nodeA.id === nodeB.id) return;
                if (!nodeA.measured || !nodeB.measured) return;

                const ax = nodeA.position.x;
                const ay = nodeA.position.y;
                const aw = nodeA.measured.width || 0;
                const ah = nodeA.measured.height || 0;

                const bx = nodeB.position.x;
                const by = nodeB.position.y;

                // Horizontal check (A is Left of B)
                const distRightLeft = Math.abs((ax + aw) - bx);
                const distYMatch = Math.abs(ay - by);
                if (distRightLeft < 15 && distYMatch < 15) {
                    implicitEdges.push({ source: nodeA.id, target: nodeB.id });
                    touchingStates[nodeA.id].right = true;
                }

                // Vertical check (A is Top of B)
                const distBottomTop = Math.abs((ay + ah) - by);
                const distXMatch = Math.abs(ax - bx);
                if (distBottomTop < 15 && distXMatch < 15) {
                    implicitEdges.push({ source: nodeA.id, target: nodeB.id });
                    touchingStates[nodeA.id].bottom = true;
                }
                
                // Opposite states (B receiving from A)
                if (distRightLeft < 15 && distYMatch < 15) {
                    if (!touchingStates[nodeB.id]) touchingStates[nodeB.id] = { left: false, right: false, top: false, bottom: false };
                    touchingStates[nodeB.id].left = true;
                }
                if (distBottomTop < 15 && distXMatch < 15) {
                    if (!touchingStates[nodeB.id]) touchingStates[nodeB.id] = { left: false, right: false, top: false, bottom: false };
                    touchingStates[nodeB.id].top = true;
                }
            });
        });

        const nodesWithTouching = nodes.map(node => ({
            ...node,
            data: {
                ...node.data,
                touchingEdges: touchingStates[node.id] || { left: false, right: false, top: false, bottom: false }
            }
        }));

        if (JSON.stringify(implicitEdges) !== JSON.stringify(get().implicitEdges) ||
            JSON.stringify(nodesWithTouching.map(n => n.data.touchingEdges)) !== JSON.stringify(get().nodes.map(n => n.data.touchingEdges))) {
            set({ implicitEdges, nodes: nodesWithTouching });
        }
    },

    handleProximitySnap: (nodeId: string) => {
        const { nodes } = get();
        const aIndex = nodes.findIndex(n => n.id === nodeId);
        const a = nodes[aIndex];
        if (!a || !a.measured) return;

        const aWidth = a.measured.width || 0;
        const aHeight = a.measured.height || 0;
        let aLeft = a.position.x;
        let aTop = a.position.y;
        const SNAP_DIST = 45;
        let snaped = false;

        for (const b of nodes) {
            if (b.id === nodeId || !b.measured) continue;

            const bLeft = b.position.x;
            const bTop = b.position.y;
            const bWidth = b.measured.width || 0;
            const bHeight = b.measured.height || 0;

            // 1. Horizontal Snapping (Left-Right)
            if (Math.abs(aTop - bTop) < SNAP_DIST) {
                // A Right to B Left
                if (Math.abs((aLeft + aWidth) - bLeft) < SNAP_DIST) {
                    aLeft = bLeft - aWidth;
                    aTop = bTop;
                    snaped = true;
                    break;
                }
                // A Left to B Right
                if (Math.abs(aLeft - (bLeft + bWidth)) < SNAP_DIST) {
                    aLeft = bLeft + bWidth;
                    aTop = bTop;
                    snaped = true;
                    break;
                }
            }

            // 2. Vertical Snapping (Top-Bottom)
            if (Math.abs(aLeft - bLeft) < SNAP_DIST) {
                // A Bottom to B Top
                if (Math.abs((aTop + aHeight) - bTop) < SNAP_DIST) {
                    aTop = bTop - aHeight;
                    aLeft = bLeft;
                    snaped = true;
                    break;
                }
                // A Top to B Bottom
                if (Math.abs(aTop - (bTop + bHeight)) < SNAP_DIST) {
                    aTop = bTop + bHeight;
                    aLeft = bLeft;
                    snaped = true;
                    break;
                }
            }
        }

        if (snaped) {
            set({
                nodes: get().nodes.map((n) =>
                    n.id === nodeId ? { ...n, position: { x: aLeft, y: aTop } } : n
                )
            });
        }
        get().checkProximity();
    },

    evaluateGraph: () => {
        const { nodes, edges } = get();
        let nextNodes = [...nodes];

        for (let i = 0; i < 5; i++) {
            const tempNodes = nextNodes.map(node => {
                // Collect all inputs pointing to this node
                const explicitEdges = edges.filter(e => e.target === node.id);
                const implicitInputs = get().implicitEdges.filter(e => e.target === node.id);

                if (explicitEdges.length > 0 || implicitInputs.length > 0) {
                    const values = [
                        ...explicitEdges.map(e => {
                            const source = nextNodes.find(n => n.id === e.source);
                            if (!source) return undefined;
                            if (e.sourceHandle && source.data.outputs?.[e.sourceHandle] !== undefined) {
                                return source.data.outputs[e.sourceHandle];
                            }
                            return source.data.value;
                        }),
                        ...implicitInputs
                            .filter(e => {
                                // For textNodes, don't allow appendNodes to trigger reactive replacement
                                if (node.type === 'textNode') {
                                    const source = nextNodes.find(n => n.id === e.source);
                                    return source?.type !== 'appendNode';
                                }
                                return true;
                            })
                            .map(e => nextNodes.find(n => n.id === e.source)?.data?.value)
                    ];
                    const valIn = values.find(v => v !== undefined);

                    // Case for calculateNode & graphNode external formula input
                    if (node.type === 'calculateNode' || node.type === 'graphNode') {
                        const formulaEdges = edges.filter(e => e.target === node.id && e.targetHandle === 'h-fn-in');
                        let formulaVal: string | undefined = undefined;
                        
                        if (formulaEdges.length > 0) {
                            if (node.type === 'graphNode') {
                                // For graphNode, collect multiple formulas and join with commas
                                const formulaParts = formulaEdges.map(edge => {
                                    const source = nextNodes.find(n => n.id === edge.source);
                                    if (source) {
                                        return (edge.sourceHandle && source.data.outputs?.[edge.sourceHandle]) ?? source.data.value;
                                    }
                                    return undefined;
                                }).filter(v => v !== undefined);
                                formulaVal = formulaParts.join(',');
                            } else {
                                // For calculateNode, pick the first one
                                const edge = formulaEdges[0];
                                const source = nextNodes.find(n => n.id === edge.source);
                                if (source) {
                                    formulaVal = (edge.sourceHandle && source.data.outputs?.[edge.sourceHandle]) ?? source.data.value;
                                }
                            }
                        }

                        // Magnetic snapping (implicit edges) also feeds formula for graphNode
                        if (node.type === 'graphNode' && formulaVal === undefined) {
                            const implicitSources = implicitInputs
                                .map(e => nextNodes.find(n => n.id === e.source))
                                .filter(Boolean);
                            if (implicitSources.length > 0) {
                                const parts: string[] = [];
                                implicitSources.forEach(src => {
                                    if (!src) return;
                                    if (src.type === 'textNode' && src.data.outputs) {
                                        // TextNode: collect all math pill values from outputs
                                        const pillVals = Object.values(src.data.outputs).filter(v => v && v !== '');
                                        parts.push(...(pillVals as string[]));
                                    } else if (src.data.value) {
                                        parts.push(src.data.value);
                                    }
                                });
                                if (parts.length > 0) formulaVal = parts.join(',');
                            }
                        }

                        let updated = false;
                        const dataPatch: Partial<NodeData> = {};

                        if (formulaVal !== undefined && formulaVal !== node.data.formulaInput) {
                            dataPatch.formulaInput = formulaVal;
                            updated = true;
                        }
                        // Clear formulaInput when nothing is connected anymore
                        if (formulaVal === undefined && node.data.formulaInput !== undefined &&
                            formulaEdges.length === 0 && implicitInputs.length === 0) {
                            dataPatch.formulaInput = undefined;
                            updated = true;
                        }

                        return updated ? { ...node, data: { ...node.data, ...dataPatch } } : node;
                    }

                    if (node.type === 'decimalNode' || node.type === 'calculusNode' || node.type === 'gateNode') {
                        if (valIn !== node.data.input && node.type !== 'gateNode') {
                            return { ...node, data: { ...node.data, input: valIn as string | undefined } };
                        }
                        if (valIn !== node.data.value && node.type === 'gateNode') {
                            return { ...node, data: { ...node.data, value: valIn as string | undefined } };
                        }
                    } else if (node.type === 'textNode') {
                        if (valIn !== undefined) {
                            let textToSet = String(valIn);
                            const isNumeric = !isNaN(Number(textToSet)) && textToSet.trim() !== '';
                            const isLaTeX = textToSet.includes('\\') || textToSet.includes('{');
                            const isSequence = textToSet.trim().startsWith('[') && textToSet.trim().endsWith(']');
                            
                            if ((isNumeric || isLaTeX || isSequence) && !(textToSet.startsWith('$$') && textToSet.endsWith('$$'))) {
                                textToSet = `$$${textToSet.trim()}$$`;
                            }


                            
                            if (textToSet !== node.data.text) {
                                return { ...node, data: { ...node.data, text: textToSet } };
                            }
                        }
                    }
                }
                return node;
            });

            if (JSON.stringify(tempNodes) === JSON.stringify(nextNodes)) {
                break;
            }
            nextNodes = tempNodes;
        }

        set({ nodes: nextNodes });
    },


}));

useStore.getState().evaluateGraph();

export default useStore;
