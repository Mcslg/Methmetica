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
    value?: number;
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
        data: { value: 10, handles: dataNodeHandles },
    },
    {
        id: 'num2',
        type: 'numberNode',
        position: { x: 100, y: 350 },
        data: { value: 20, handles: dataNodeHandles },
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

        if (node.type === 'addNode' || node.type === 'toolNode') { // toolNode generalized
            const inputs = edges.filter(e => e.target === nodeId);
            const values = inputs.map(e => nodes.find(n => n.id === e.source)?.data?.value);
            const numericValues = values.filter((v): v is number => v !== undefined);

            let result: number | undefined = undefined;
            if (numericValues.length > 0) {
                result = numericValues.reduce((acc, curr) => acc + Number(curr), 0);
            }

            set({
                nodes: nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, value: result } } : n)
            });
        }

        // Propagate down to number nodes right after execution
        get().evaluateGraph();
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
                        return { ...node, data: { ...node.data, value: valIn as number | undefined } };
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
