import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type Edge } from '@xyflow/react';
import { getNodeDefinition } from '../nodes/registry';
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
    slots?: Record<string, AppNode>; // Absorbed nodes like gate or button
    gateValue?: string; // Value representing gate pass/block state
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

            setGraph: (nodes, edges) => {
                set({ nodes, edges });
            },

            isAltPressed: false,
            setAltPressed: (pressed) => set({ isAltPressed: pressed }),


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
        set({
            nodes: get().nodes.filter(n => n.id !== nodeId),
            edges: get().edges.filter(e => e.source !== nodeId && e.target !== nodeId)
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

            // implicit and explicit connections are handled by evaluateGraph
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
        const { nodes } = get();
        const aIndex = nodes.findIndex(n => n.id === nodeId);
        const a = nodes[aIndex];
        if (!a) return;

        // --- Node Absorption Check ---
        if (a.type === 'buttonNode' || a.type === 'gateNode' || a.type === 'sliderNode') {
            const aWidth = a.measured?.width || a.width || 120;
            const aHeight = a.measured?.height || a.height || 46;
            const aCenterX = a.position.x + aWidth / 2;
            const aCenterY = a.position.y + aHeight / 2;

            for (const b of nodes) {
                if (b.id === nodeId) continue;
                
                const bWidth = b.measured?.width || b.width || 200;
                const bHeight = b.measured?.height || b.height || 100;
                const bX = b.position.x;
                const bY = b.position.y;

                // Allowed absorber nodes
                if (b.type === 'calculateNode' || b.type === 'solveNode' || b.type === 'calculusNode' || b.type === 'graphNode' || b.type === 'textNode') {
                    // textNode can only absorb sliderNode
                    if (b.type === 'textNode' && a.type !== 'sliderNode') continue;
                    
                    // Comprehensive 'Is Over' check: covers the entire node area + small buffer around top
                    const isInsideB = aCenterX >= bX - 10 && aCenterX <= bX + bWidth + 10 &&
                                    aCenterY >= bY - 30 && aCenterY <= bY + bHeight + 10;

                    if (isInsideB) {
                        const currentSlots = b.data.slots || {};
                        // When absorbing a slider, we pack its essential data
                        let aData = a;
                        if (a.type === 'sliderNode') {
                            aData = {
                                ...a,
                                data: {
                                    ...a.data,
                                    min: a.data.min ?? 0,
                                    max: a.data.max ?? 10,
                                    step: a.data.step ?? 0.1,
                                    value: String(a.data.value ?? 5)
                                }
                            } as AppNode;
                        }
                        const newSlots = { ...currentSlots, [a.type]: aData };
                        
                        // Increase height of absorber node (+40px for sliders/buttons, +55px for gates if needed)
                        const heightInc = (a.type === 'gateNode') ? 55 : 40;
                        set({
                            nodes: get().nodes.map(n => {
                                if (n.id === b.id) {
                                    const curHeight = n.height ?? n.measured?.height ?? 100;
                                    const curWidth = n.width ?? n.measured?.width ?? 160;
                                    return {
                                        ...n,
                                        width: curWidth,
                                        height: curHeight + heightInc,
                                        data: { ...n.data, slots: newSlots }
                                    };
                                }
                                return n;
                            })
                        });
                        
                        // Remove node a
                        setTimeout(() => get().removeNode(a.id), 0);
                        return; // Stop snapping
                    }
                }
            }
        }
        // --- End Absorption ---
    },

    evaluateGraph: () => {
        const { nodes, edges } = get();
        let nextNodes = [...nodes];

        // 1. Build rapid-access maps for incoming edges
        const targetToExplicit = new Map<string, typeof edges>();
        edges.forEach(e => {
            if (!targetToExplicit.has(e.target)) targetToExplicit.set(e.target, []);
            targetToExplicit.get(e.target)!.push(e);
        });

        for (let i = 0; i < 5; i++) {
            const tempNodes = nextNodes.map(node => {
                // Rapidly look up dependencies using Maps instead of filtering entire arrays
                const explicitEdges = targetToExplicit.get(node.id) || [];

                if (explicitEdges.length > 0) {
                    const values = [
                        ...explicitEdges.map(e => {
                            const source = nextNodes.find(n => n.id === e.source);
                            if (!source) return undefined;
                            if (e.sourceHandle && source.data.outputs?.[e.sourceHandle] !== undefined) {
                                return source.data.outputs[e.sourceHandle];
                            }
                            return source.data.value;
                        })
                    ];
                    const valIn = values.find(v => v !== undefined);

                    // --- [NEW] Global Gate Input Mapping ---
                    const gateEdge = explicitEdges.find(e => e.targetHandle === 'h-gate-in');
                    let gateValFromEdge: string | undefined = undefined;
                    if (gateEdge) {
                        const source = nextNodes.find(n => n.id === gateEdge.source);
                        if (source) {
                            gateValFromEdge = (gateEdge.sourceHandle && source.data.outputs?.[gateEdge.sourceHandle]) ?? source.data.value;
                        }
                    }

                    if (gateValFromEdge !== undefined && gateValFromEdge !== node.data.gateValue) {
                        return { ...node, data: { ...node.data, gateValue: gateValFromEdge } };
                    }
                    if (gateValFromEdge === undefined && node.data.gateValue !== undefined && node.data.slots?.gateNode) {
                         // Clear gateValue if no longer connected but gate slot exists
                         return { ...node, data: { ...node.data, gateValue: undefined } };
                    }
                    // --- END Gate Mapping ---

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

                        let updated = false;
                        const dataPatch: Partial<NodeData> = {};

                        if (formulaVal !== undefined && formulaVal !== node.data.formulaInput) {
                            dataPatch.formulaInput = formulaVal;
                            updated = true;
                        }
                        // Clear formulaInput when nothing provides a formula anymore
                        if (formulaVal === undefined && node.data.formulaInput !== undefined) {
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
  }),
  {
      name: 'methmetica-storage',
      partialize: (state: AppState) => ({
          nodes: state.nodes,
          edges: state.edges,
          theme: state.theme,
          isSidebarOpen: state.isSidebarOpen,
      }),
  }
)
);

useStore.getState().evaluateGraph();

export default useStore;
