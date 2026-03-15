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
    variant?: 'diff' | 'integ'; // For calculus nodes
    variable?: string; // For specifying differentiation/integration variable
    useExternalFormula?: boolean;
    formulaInput?: string; // Formula string received from an external connection
    outputs?: Record<string, string>; // Multi-output support (handleId -> value)
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
    { id: 'h-tr-in', type: 'trigger-in', position: 'top', offset: 50 },
    { id: 'h-tr-out', type: 'trigger-out', position: 'bottom', offset: 50 },
];

export const textNodeHandles: CustomHandle[] = [
    { id: 'h-in', type: 'input', position: 'left', offset: 50 }
];

// Initial setup nodes
const initialNodes: AppNode[] = [];

const useStore = create<AppState>((set, get) => ({
    nodes: initialNodes,
    edges: [],
    implicitEdges: [],

    onNodesChange: (changes: NodeChange<AppNode>[]) => {
        set({
            nodes: applyNodeChanges(changes, get().nodes),
        });
        get().checkProximity();
    },

    onEdgesChange: (changes: EdgeChange[]) => {
        set({
            edges: applyEdgeChanges(changes, get().edges),
        });
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
        if (node.type === 'numberNode' || node.type === 'functionNode' || node.type === 'calculateNode') {
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

        if (['addNode', 'calculateNode', 'toolNode', 'decimalNode', 'calculusNode'].includes(node.type || '')) {
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
        const PROXIMITY_THRESHOLD = 50;
        const implicitEdges: { source: string, target: string }[] = [];

        nodes.forEach(nodeA => {
            nodes.forEach(nodeB => {
                if (nodeA.id === nodeB.id) return;
                if (!nodeA.measured || !nodeB.measured) return;

                const ax = nodeA.position.x;
                const ay = nodeA.position.y;
                const aw = nodeA.measured.width || 0;

                const bx = nodeB.position.x;
                const by = nodeB.position.y;

                const distRightLeft = Math.abs((ax + aw) - bx);
                const distTopTop = Math.abs(ay - by);

                if (distRightLeft < PROXIMITY_THRESHOLD && distTopTop < 20) {
                    implicitEdges.push({ source: nodeA.id, target: nodeB.id });
                }
            });
        });

        const nodesWithTouching = nodes.map(node => {
            const isSource = implicitEdges.some(e => e.source === node.id);
            const isTarget = implicitEdges.some(e => e.target === node.id);
            return {
                ...node,
                data: {
                    ...node.data,
                    touchingEdges: {
                        right: isSource,
                        left: isTarget
                    }
                }
            };
        });

        if (JSON.stringify(implicitEdges) !== JSON.stringify(get().implicitEdges) ||
            JSON.stringify(nodesWithTouching.map(n => n.data.touchingEdges)) !== JSON.stringify(get().nodes.map(n => n.data.touchingEdges))) {
            set({ implicitEdges, nodes: nodesWithTouching });
        }
    },

    handleProximitySnap: (nodeId: string) => {
        const { nodes } = get();
        const aIndex = nodes.findIndex(n => n.id === nodeId);
        const a = nodes[aIndex];
        if (!a || !a.measured || a.measured.width === undefined || a.measured.height === undefined) return;

        let aLeft = a.position.x;
        let aTop = a.position.y;
        const SNAP_DIST = 40;
        const SNAP_Y_DIST = 10;
        let snapedX = false;
        let snapedY = false;

        for (let i = 0; i < nodes.length; i++) {
            const b = nodes[i];
            if (b.id === nodeId || !b.measured) continue;

            const bLeft = b.position.x;
            const bRight = b.position.x + (b.measured.width || 0);
            const bTop = b.position.y;

            if (Math.abs(aTop - bTop) < SNAP_Y_DIST || Math.abs(aLeft - bLeft) < SNAP_DIST) {
                if (Math.abs(aLeft + (a.measured.width || 0) - bLeft) < SNAP_DIST) {
                    aLeft = bLeft - a.measured.width;
                    snapedX = true;
                    if (Math.abs(aTop - bTop) < SNAP_Y_DIST) {
                        aTop = bTop;
                        snapedY = true;
                    }
                    break;
                }
                if (Math.abs(aLeft - bRight) < SNAP_DIST) {
                    aLeft = bRight;
                    snapedX = true;
                    if (Math.abs(aTop - bTop) < SNAP_Y_DIST) {
                        aTop = bTop;
                        snapedY = true;
                    }
                    break;
                }
            }
        }

        if (snapedX || snapedY) {
            set({
                nodes: get().nodes.map((n, idx) =>
                    idx === aIndex ? { ...n, position: { x: aLeft, y: aTop } } : n
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
                        ...implicitInputs.map(e => nextNodes.find(n => n.id === e.source)?.data?.value)
                    ];
                    const valIn = values.find(v => v !== undefined);

                    // Case for calculateNode external formula input
                    if (node.type === 'calculateNode') {
                        const formulaEdge = edges.find(e => e.target === node.id && e.targetHandle === 'h-fn-in');
                        let formulaVal = undefined;
                        if (formulaEdge) {
                            const source = nextNodes.find(n => n.id === formulaEdge.source);
                            if (source) {
                                formulaVal = (formulaEdge.sourceHandle && source.data.outputs?.[formulaEdge.sourceHandle]) ?? source.data.value;
                            }
                        }

                        let updated = false;
                        const dataPatch: Partial<NodeData> = {};

                        if (formulaVal !== undefined && formulaVal !== node.data.formulaInput) {
                            dataPatch.formulaInput = formulaVal;
                            updated = true;
                        }

                        // Also propagate data input to standard handles if not handled elsewhere
                        if (valIn !== undefined && valIn !== node.data.input) {
                            dataPatch.input = valIn;
                            updated = true;
                        }

                        return updated ? { ...node, data: { ...node.data, ...dataPatch } } : node;
                    }

                    if (node.type === 'decimalNode' || node.type === 'calculusNode') {
                        if (valIn !== node.data.input) {
                            return { ...node, data: { ...node.data, input: valIn as string | undefined } };
                        }
                    } else if (node.type === 'textNode') {
                        if (valIn !== undefined) {
                            const newText = `[[${valIn}]]`;
                            if (newText !== node.data.text) {
                                return { ...node, data: { ...node.data, text: newText } };
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
