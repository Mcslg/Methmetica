import { create } from 'zustand';
import {
    type Connection,
    type Edge,
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

export type HandleType = 'modify' | 'input' | 'output' | 'trigger-in' | 'trigger-out' | 'trigger-err';

export type CustomHandle = {
    id: string;
    type: HandleType;
    position: 'top' | 'bottom' | 'left' | 'right';
    offset: number; // percentage 0-100
    label?: string; // Optional label for variables
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
    { id: 'h-in', type: 'input', position: 'left', offset: 50 },
    { id: 'h-out', type: 'output', position: 'right', offset: 50 }
];

// Initial setup nodes
const initialNodes: AppNode[] = [
    {
        id: 'num1',
        type: 'numberNode',
        position: { x: 100, y: 100 },
        data: { value: '10', handles: [...dataNodeHandles] },
    },
    {
        id: 'num2',
        type: 'numberNode',
        position: { x: 100, y: 350 },
        data: { value: '\\sqrt{2}', handles: [...dataNodeHandles] },
    },
    {
        id: 'fn1',
        type: 'functionNode',
        position: { x: 500, y: 200 },
        data: {
            formula: 'x + y',
            handles: [
                { id: 'h-in-x', type: 'input', position: 'left', offset: 33, label: 'x' },
                { id: 'h-in-y', type: 'input', position: 'left', offset: 66, label: 'y' },
                { id: 'h-out', type: 'output', position: 'right', offset: 50 }
            ]
        },
    }
];

const initialEdges: Edge[] = [
    { id: 'e1', source: 'num1', target: 'fn1', sourceHandle: 'h-out', targetHandle: 'h-in-x' },
    { id: 'e2', source: 'num2', target: 'fn1', sourceHandle: 'h-out', targetHandle: 'h-in-y' },
];

const useStore = create<AppState>((set, get) => ({
    nodes: initialNodes,
    edges: initialEdges,
    implicitEdges: [],

    onNodesChange: (changes: NodeChange<AppNode>[]) => {
        set({
            nodes: applyNodeChanges(changes, get().nodes),
        });
    },

    onEdgesChange: (changes: EdgeChange<Edge>[]) => {
        set({
            edges: applyEdgeChanges(changes, get().edges),
        });
        get().evaluateGraph();
    },

    onConnect: (connection: Connection) => {
        set({
            edges: addEdge(connection, get().edges),
        });
        get().evaluateGraph();
    },

    updateNodeData: (nodeId: string, data: NodeData) => {
        const node = get().nodes.find(n => n.id === nodeId);
        const oldValue = node?.data.value;

        set({
            nodes: get().nodes.map((node) => {
                if (node.id === nodeId) {
                    return { ...node, data: { ...node.data, ...data } };
                }
                return node;
            }),
        });

        // Trigger logic: If value changed, fire triggers
        if (data.value !== undefined && data.value !== oldValue) {
            const newNode = get().nodes.find(n => n.id === nodeId);
            // 1. Explicit trigger-out handles
            const triggerOutHandles = newNode?.data.handles?.filter(h => h.type === 'trigger-out') || [];
            triggerOutHandles.forEach(h => get().triggerNode(nodeId, h.id));

            // 2. Implicit triggers for auto-connected nodes (snapped)
            const implicitOuts = get().implicitEdges.filter(e => e.source === nodeId);
            implicitOuts.forEach(edge => {
                get().executeNode(edge.target);
            });
        }

        get().evaluateGraph();
    },

    addHandle: (nodeId: string, handle: CustomHandle) => {
        set({
            nodes: get().nodes.map((node) => {
                if (node.id === nodeId) {
                    const handles = node.data.handles || [];
                    return { ...node, data: { ...node.data, handles: [...handles, handle] } };
                }
                return node;
            }),
        });
    },

    removeHandle: (nodeId: string, handleId: string) => {
        set({
            nodes: get().nodes.map((node) => {
                if (node.id === nodeId) {
                    const handles = node.data.handles || [];
                    return { ...node, data: { ...node.data, handles: handles.filter(h => h.id !== handleId) } };
                }
                return node;
            }),
        });
    },

    updateHandle: (nodeId: string, handleId: string, patch: Partial<CustomHandle>) => {
        set({
            nodes: get().nodes.map((node) => {
                if (node.id === nodeId) {
                    const handles = node.data.handles || [];
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            handles: handles.map(h => (h.id === handleId ? { ...h, ...patch } : h))
                        }
                    };
                }
                return node;
            }),
        });
    },

    addNode: (node: AppNode) => {
        set({ nodes: [...get().nodes, node] });
    },

    removeNode: (nodeId: string) => {
        set({
            nodes: get().nodes.filter(n => n.id !== nodeId),
            edges: get().edges.filter(e => e.source !== nodeId && e.target !== nodeId)
        });
        get().evaluateGraph();
    },

    executeNode: (nodeId: string) => {
        const { nodes, edges } = get();
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;

        if (['addNode', 'functionNode', 'toolNode', 'decimalNode', 'calculusNode'].includes(node.type || '')) {
            const formula = node.data.formula || '';
            const implicitInputs = get().implicitEdges.filter(e => e.target === nodeId);

            const handleResult = (res: string) => {
                const currentNodes = get().nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, value: res } } : n);

                set({ nodes: currentNodes });

                // Fire Trigger-Out
                const updatedNode = currentNodes.find(n => n.id === nodeId);
                // 1. Explicit handles
                const triggerOutHandles = updatedNode?.data.handles?.filter(h => h.type === 'trigger-out') || [];
                triggerOutHandles.forEach(h => get().triggerNode(nodeId, h.id));

                // 2. Implicit connections
                const implicitOuts = get().implicitEdges.filter(e => e.source === nodeId);
                implicitOuts.forEach(edge => {
                    get().executeNode(edge.target);
                });

                get().evaluateGraph();
            };

            const handleError = (err: string) => {
                set({
                    nodes: get().nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, value: err } } : n)
                });
                // Fire Trigger-Err
                const updatedNode = get().nodes.find(n => n.id === nodeId);
                // 1. Explicit handles
                const triggerErrHandles = updatedNode?.data.handles?.filter(h => h.type === 'trigger-err') || [];
                triggerErrHandles.forEach(h => get().triggerNode(nodeId, h.id));

                // 2. Implicit connections (Errors also propagate current but maybe to the same next node)
                const implicitOuts = get().implicitEdges.filter(e => e.source === nodeId);
                implicitOuts.forEach(edge => {
                    get().executeNode(edge.target);
                });
            };

            // Specialized logic for DecimalNode
            if (node.type === 'decimalNode') {
                const inputVal = node.data.input || node.data.value;
                if (inputVal) {
                    try {
                        let clean = inputVal.replace(/\\/g, '');
                        if (clean.includes('frac')) {
                            const matches = clean.match(/frac\{(\d+)\}\{(\d+)\}/);
                            if (matches && matches.length === 3) {
                                const numerator = parseInt(matches[1]);
                                const denominator = parseInt(matches[2]);
                                if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
                                    handleResult((numerator / denominator).toString());
                                    return;
                                }
                            }
                        }
                        const num = parseFloat(clean);
                        if (!isNaN(num)) {
                            handleResult(num.toString());
                        } else {
                            handleResult(inputVal); // Fallback
                        }
                    } catch (e) {
                        handleError('\\text{Error}');
                    }
                } else {
                    handleResult('--');
                }
                return;
            }

            // Specialized logic for CalculusNode
            if (node.type === 'calculusNode') {
                const inputVal = node.data.input || node.data.value;
                const variant = node.data.variant || 'diff';
                if (inputVal) {
                    try {
                        // @ts-ignore
                        import('nerdamer/all.min').then((nerdamer: any) => {
                            const ner = nerdamer.default || nerdamer;
                            try {
                                const expr = ner.convertFromLaTeX(inputVal);
                                const wrt = node.data.variable || 'x';
                                let result;
                                if (variant === 'diff') {
                                    result = ner.diff(expr, wrt);
                                } else {
                                    result = ner.integrate(expr, wrt);
                                }
                                handleResult(result.toTeX());
                            } catch (e) {
                                handleError('\\text{Calc Error}');
                            }
                        });
                    } catch (e) {
                        handleError('\\text{Load Error}');
                    }
                }
                return;
            }

            try {
                // @ts-ignore
                import('nerdamer/all.min').then((nerdamer: any) => {
                    const ner = nerdamer.default || nerdamer;

                    if (!formula) {
                        handleResult('?');
                        return;
                    }

                    // FunctionNode behavior: map handles to variables
                    // 1. Convert LaTeX formula to nerdamer expressions
                    const solver = ner.convertFromLaTeX(formula);
                    const variables = solver.variables(); // ['x', 'y']

                    // 2. Map current connected handles to these variables
                    const varMap: Record<string, string> = {};
                    variables.forEach((v: string) => {
                        // Find the handle that has this variable name as ID or label
                        const handle = node.data.handles?.find((h: any) => h.label === v || h.id === `h-in-${v}`);
                        if (handle) {
                            // Check explicit edges first
                            const edge = edges.find(e => e.target === nodeId && e.targetHandle === handle.id);
                            if (edge) {
                                const sourceId = edge.source;
                                const sourceNode = nodes.find(n => n.id === sourceId);
                                const sourceValue = sourceNode?.data?.value;
                                if (sourceValue !== undefined && sourceValue !== null && sourceValue.trim() !== '') {
                                    varMap[v] = ner.convertFromLaTeX(sourceValue).toString();
                                }
                            }
                            // Check implicit edges if handle is on the left
                            else if (handle.position === 'left') {
                                const implicitEdge = implicitInputs.find(e => e.target === nodeId);
                                if (implicitEdge) {
                                    const sourceNode = nodes.find(n => n.id === implicitEdge.source);
                                    const sourceValue = sourceNode?.data?.value;
                                    if (sourceValue !== undefined && sourceValue !== null && sourceValue.trim() !== '') {
                                        varMap[v] = ner.convertFromLaTeX(sourceValue).toString();
                                    }
                                }
                            }
                        }
                    });

                    // 3. Evaluate with variables
                    const finalRes = solver.evaluate(varMap);
                    handleResult(finalRes.toTeX());
                }).catch(e => {
                    console.error("Nerdamer Load Error", e);
                    handleError('\\text{Error}');
                });
            } catch (e) {
                console.error("Nerdamer Execution Error", e);
                handleError('\\text{Error}');
            }
        } else {
            // Propagate down to number nodes right after execution
            get().evaluateGraph();
        }
    },

    triggerNode: (nodeId: string, handleId: string) => {
        const { edges, implicitEdges } = get();
        // Find all connections from this handle
        const outgoingCurrents = edges.filter(e => e.source === nodeId && e.sourceHandle === handleId);

        outgoingCurrents.forEach(edge => {
            const targetNodeId = edge.target;
            const targetHandleId = edge.targetHandle;

            const targetNode = get().nodes.find(n => n.id === targetNodeId);
            const targetHandle = targetNode?.data.handles?.find(h => h.id === targetHandleId);

            // If target handle is a trigger-in, execute the node
            if (targetHandle?.type === 'trigger-in') {
                get().executeNode(targetNodeId);
            }
        });

        // Implicit triggers for auto-connected nodes on the right
        // This logic is now centralized here.
        if (handleId.includes('trigger-out') || handleId.includes('trigger-err')) {
            const implicitOuts = implicitEdges.filter(e => e.source === nodeId);
            implicitOuts.forEach(edge => {
                get().executeNode(edge.target);
            });
        }
    },

    checkProximity: () => {
        const SNAP_DIST = 20;
        const { nodes } = get();
        const implicitEdges: { source: string, target: string }[] = [];

        let nextNodes = nodes.map(n => ({
            ...n,
            data: { ...n.data, touchingEdges: { top: false, bottom: false, left: false, right: false } }
        }));

        for (let i = 0; i < nextNodes.length; i++) {
            for (let j = i + 1; j < nextNodes.length; j++) {
                const a = nextNodes[i];
                const b = nextNodes[j];

                if (!a.measured?.width || !b.measured?.width) continue;

                const aLeft = a.position.x;
                const aRight = a.position.x + a.measured.width;
                const aTop = a.position.y;
                const aBottom = a.position.y + a.measured.height!;

                const bLeft = b.position.x;
                const bRight = b.position.x + b.measured.width;
                const bTop = b.position.y;
                const bBottom = b.position.y + b.measured.height!;

                const yOverlap = aBottom > bTop && aTop < bBottom;

                if (yOverlap) {
                    if (Math.abs(aRight - bLeft) < SNAP_DIST) {
                        implicitEdges.push({ source: a.id, target: b.id });
                        a.data.touchingEdges!.right = true;
                        b.data.touchingEdges!.left = true;
                    } else if (Math.abs(bRight - aLeft) < SNAP_DIST) {
                        implicitEdges.push({ source: b.id, target: a.id });
                        b.data.touchingEdges!.right = true;
                        a.data.touchingEdges!.left = true;
                    }
                }
            }
        }

        // Deep equality check for minimal rendering overhead
        if (JSON.stringify(implicitEdges) !== JSON.stringify(get().implicitEdges) ||
            JSON.stringify(nextNodes.map(n => n.data.touchingEdges)) !== JSON.stringify(get().nodes.map(n => n.data.touchingEdges))) {
            set({ nodes: nextNodes, implicitEdges });
            get().evaluateGraph();
        }
    },

    handleProximitySnap: (nodeId: string) => {
        const SNAP_DIST = 20;
        const SNAP_Y_DIST = 15; // Vertical snapping leniency
        const { nodes } = get();
        const aIndex = nodes.findIndex(n => n.id === nodeId);
        if (aIndex === -1) return;

        let a = nodes[aIndex];
        if (!a.measured?.width) {
            get().checkProximity();
            return;
        }

        let aLeft = a.position.x;
        let aRight = a.position.x + a.measured.width;
        let aTop = a.position.y;
        let aBottom = a.position.y + a.measured.height!;
        let snapedX = false;
        let snapedY = false;

        for (const b of nodes) {
            if (a.id === b.id || !b.measured?.width) continue;

            const bLeft = b.position.x;
            const bRight = b.position.x + b.measured.width;
            const bTop = b.position.y;
            const bBottom = b.position.y + b.measured.height!;

            const yOverlap = aBottom > bTop && aTop < bBottom;
            if (yOverlap) {
                if (Math.abs(aRight - bLeft) < SNAP_DIST) {
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

        // Finalize proximity detection sweep
        get().checkProximity();
    },

    evaluateGraph: () => {
        const { nodes, edges } = get();
        let nextNodes = [...nodes];

        for (let i = 0; i < 5; i++) {
            const tempNodes = nextNodes.map(node => {
                if (node.type === 'numberNode' || node.type === 'decimalNode' || node.type === 'calculusNode') {
                    const explicitEdges = edges.filter(e => e.target === node.id);
                    const implicitInputs = get().implicitEdges.filter(e => e.target === node.id);

                    if (explicitEdges.length > 0 || implicitInputs.length > 0) {
                        const values = [
                            ...explicitEdges.map(e => nextNodes.find(n => n.id === e.source)?.data?.value),
                            ...implicitInputs.map(e => nextNodes.find(n => n.id === e.source)?.data?.value)
                        ];
                        const valIn = values.find(v => v !== undefined);
                        // decimalNode and calculusNode use 'input' to receive incoming data, numberNode uses 'value'
                        if (node.type === 'decimalNode' || node.type === 'calculusNode') {
                            return { ...node, data: { ...node.data, input: valIn as string | undefined } };
                        }
                        return { ...node, data: { ...node.data, value: valIn as string | undefined } };
                    }
                    return node;
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

// Run initial evaluation
useStore.getState().evaluateGraph();

export default useStore;
