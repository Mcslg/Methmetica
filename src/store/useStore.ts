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
};

export type NodeData = {
    value?: string;
    formula?: string; // For function nodes
    handles?: CustomHandle[];
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
    addNode: (node: AppNode) => void;
    removeNode: (nodeId: string) => void;
    executeNode: (nodeId: string) => void;
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

// Initial setup nodes
const initialNodes: AppNode[] = [
    {
        id: 'num1',
        type: 'numberNode',
        position: { x: 100, y: 100 },
        data: { value: '10', handles: dataNodeHandles },
    },
    {
        id: 'num2',
        type: 'numberNode',
        position: { x: 100, y: 350 },
        data: { value: '\\sqrt{2}', handles: dataNodeHandles },
    },
    {
        id: 'add1',
        type: 'addNode',
        position: { x: 500, y: 200 },
        data: { handles: toolNodeHandles },
    },
    {
        id: 'num3',
        type: 'numberNode',
        position: { x: 900, y: 200 },
        data: { handles: dataNodeHandles },
    },
];

const initialEdges: Edge[] = [
    { id: 'e1', source: 'num1', target: 'add1', sourceHandle: 'h-out', targetHandle: 'h-in' },
    { id: 'e2', source: 'num2', target: 'add1', sourceHandle: 'h-out', targetHandle: 'h-in' },
    { id: 'e3', source: 'add1', target: 'num3', sourceHandle: 'h-out', targetHandle: 'h-in' }, // Connected to a NumberNode acting as output
];

const useStore = create<AppState>((set, get) => ({
    nodes: initialNodes,
    edges: initialEdges,

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
        set({
            nodes: get().nodes.map((node) => {
                if (node.id === nodeId) {
                    return { ...node, data: { ...node.data, ...data } };
                }
                return node;
            }),
        });
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

        if (node.type === 'addNode' || node.type === 'functionNode' || node.type === 'toolNode') {
            const formula = node.data.formula || '';
            const inputs = edges.filter(e => e.target === nodeId);

            const handleResult = (res: string) => {
                let currentNodes = get().nodes;
                let currentEdges = get().edges;
                const toolNode = currentNodes.find(n => n.id === nodeId);

                currentNodes = currentNodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, value: res } } : n);

                // Auto-create output data node if no outgoing edge
                const outgoingEdges = currentEdges.filter(e => e.source === nodeId);
                if (outgoingEdges.length === 0 && toolNode) {
                    const newNodeId = `num-auto-${Date.now()}`;
                    const targetHandleId = `h-in-${Date.now()}`;

                    const newNode: AppNode = {
                        id: newNodeId,
                        type: 'numberNode',
                        position: { x: toolNode.position.x + 350, y: toolNode.position.y },
                        data: {
                            value: res, // Initialize with result
                            handles: [
                                { id: targetHandleId, type: 'input', position: 'left', offset: 50 },
                                { id: 'h-out', type: 'output', position: 'right', offset: 50 }
                            ]
                        }
                    };

                    currentNodes = [...currentNodes, newNode];

                    const sourceHandleId = toolNode.data.handles?.find((h: CustomHandle) => h.type === 'output')?.id || 'h-out';
                    currentEdges = [...currentEdges, {
                        id: `e-auto-${Date.now()}`,
                        source: nodeId,
                        target: newNodeId,
                        sourceHandle: sourceHandleId,
                        targetHandle: targetHandleId
                    }];
                }

                set({ nodes: currentNodes, edges: currentEdges });
                get().evaluateGraph();
            };

            try {
                // @ts-ignore
                import('nerdamer/all.min').then((nerdamer: any) => {
                    const ner = nerdamer.default || nerdamer;

                    if (node.type === 'addNode' && !formula) {
                        // Legacy AddNode behavior: just sum all inputs
                        const latexValues = inputs.map(e => nodes.find(n => n.id === e.source)?.data?.value).filter(v => !!v);
                        const sumExpr = latexValues.map(tex => ner.convertFromLaTeX(tex).toString()).join(' + ');
                        if (sumExpr) {
                            handleResult(ner(sumExpr).toTeX());
                        } else {
                            handleResult('?');
                        }
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
                            const edge = inputs.find(e => e.targetHandle === handle.id);
                            if (edge) {
                                const sourceValue = nodes.find(n => n.id === edge.source)?.data?.value;
                                if (sourceValue) {
                                    varMap[v] = ner.convertFromLaTeX(sourceValue).toString();
                                }
                            }
                        }
                    });

                    // 3. Evaluate with variables
                    const finalRes = solver.evaluate(varMap);
                    handleResult(finalRes.toTeX());
                });
            } catch (e) {
                console.error("Nerdamer Error", e);
                handleResult('\\text{Error}');
            }
        } else {
            // Propagate down to number nodes right after execution
            get().evaluateGraph();
        }
    },

    evaluateGraph: () => {
        const { nodes, edges } = get();
        let nextNodes = [...nodes];

        for (let i = 0; i < 5; i++) {
            const tempNodes = nextNodes.map(node => {
                if (node.type === 'numberNode') {
                    const inputs = edges.filter(e => e.target === node.id);
                    if (inputs.length > 0) {
                        const values = inputs.map(e => nextNodes.find(n => n.id === e.source)?.data?.value);
                        const valIn = values.find(v => v !== undefined);
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
