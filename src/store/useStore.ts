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
    isAltPressed: boolean;
    setAltPressed: (pressed: boolean) => void;
    theme: 'light' | 'dark';
    setTheme: (theme: 'light' | 'dark') => void;
};

// Initial setup nodes
const initialNodes: AppNode[] = [];

const useStore = create<AppState>()(
    persist(
        (set, get) => ({
            nodes: initialNodes,
            edges: [],
            implicitEdges: [],
            theme: 'dark',
            setTheme: (theme) => set({ theme }),

            setGraph: (nodes, edges) => {
                set({ nodes, edges, implicitEdges: [] });
            },

            isAltPressed: false,
            setAltPressed: (pressed) => set({ isAltPressed: pressed }),


    onNodesChange: (changes: NodeChange<AppNode>[]) => {
        set({
            nodes: applyNodeChanges(changes, get().nodes),
        });
        
        // Only run proximity physics if position or size changed (ignores selection changes)
        const needsProximity = changes.some(c => c.type === 'position' || c.type === 'dimensions');
        if (needsProximity) {
            get().checkProximity();
        }
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

        const handleResult = (res: string) => {
            const currentNodes = get().nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, value: res } } : n);
            set({ nodes: currentNodes });

            // Fire Trigger-Out
            const updatedNode = currentNodes.find(n => n.id === nodeId);
            updatedNode?.data.handles?.filter(h => h.type === 'trigger-out').forEach(h => get().triggerNode(nodeId, h.id));

            // Implicit connections
            get().implicitEdges.filter(e => e.source === nodeId).forEach(edge => get().executeNode(edge.target));

            // Explicit connections (but not triggers)
            get().edges.filter(e => e.source === nodeId && (!e.sourceHandle || !e.sourceHandle.startsWith('h-tr'))).forEach(edge => get().executeNode(edge.target));

            get().evaluateGraph();
        };

        const handleError = (err: string) => {
            set({ nodes: get().nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, value: err } } : n) });
            const updatedNode = get().nodes.find(n => n.id === nodeId);
            updatedNode?.data.handles?.filter(h => h.type === 'trigger-err').forEach(h => get().triggerNode(nodeId, h.id));
            get().implicitEdges.filter(e => e.source === nodeId).forEach(edge => get().executeNode(edge.target));
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
        const { nodes, implicitEdges: prevEdges } = get();
        const implicitEdges: { source: string, target: string }[] = [];
        const touchingStates: Record<string, { left: boolean, right: boolean, top: boolean, bottom: boolean }> = {};

        for (const n of nodes) {
            touchingStates[n.id] = { left: false, right: false, top: false, bottom: false };
        }

        for (let i = 0; i < nodes.length; i++) {
            const nodeA = nodes[i];
            if (!nodeA.measured) continue;
            const ax = nodeA.position.x;
            const ay = nodeA.position.y;
            const aw = nodeA.measured.width || 0;
            const ah = nodeA.measured.height || 0;

            for (let j = 0; j < nodes.length; j++) {
                if (i === j) continue;
                const nodeB = nodes[j];
                if (!nodeB.measured) continue;
                
                const bx = nodeB.position.x;
                const by = nodeB.position.y;

                // Horizontal check (A is Left of B)
                const distRightLeft = Math.abs((ax + aw) - bx);
                const distYMatch = Math.abs(ay - by);
                if (distRightLeft < 15 && distYMatch < 15) {
                    implicitEdges.push({ source: nodeA.id, target: nodeB.id });
                    touchingStates[nodeA.id].right = true;
                    touchingStates[nodeB.id].left = true;
                }

                // Vertical check (A is Top of B)
                const distBottomTop = Math.abs((ay + ah) - by);
                const distXMatch = Math.abs(ax - bx);
                if (distBottomTop < 15 && distXMatch < 15) {
                    implicitEdges.push({ source: nodeA.id, target: nodeB.id });
                    touchingStates[nodeA.id].bottom = true;
                    touchingStates[nodeB.id].top = true;
                }
            }
        }

        let nodesChanged = false;
        const newNodes = nodes.map(node => {
            const c = node.data.touchingEdges || { left: false, right: false, top: false, bottom: false };
            const n = touchingStates[node.id];
            if (c.left !== n.left || c.right !== n.right || c.top !== n.top || c.bottom !== n.bottom) {
                nodesChanged = true;
                return { ...node, data: { ...node.data, touchingEdges: n } };
            }
            return node;
        });

        let edgesChanged = implicitEdges.length !== prevEdges.length;
        if (!edgesChanged) {
            for (let i = 0; i < implicitEdges.length; i++) {
                if (implicitEdges[i].source !== prevEdges[i].source || implicitEdges[i].target !== prevEdges[i].target) {
                    edgesChanged = true; break;
                }
            }
        }

        if (edgesChanged || nodesChanged) {
            set({ implicitEdges, nodes: nodesChanged ? newNodes : nodes });
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
        const implicitInputsRaw = get().implicitEdges;
        let nextNodes = [...nodes];

        // 1. Build rapid-access maps for incoming edges
        const targetToExplicit = new Map<string, typeof edges>();
        const targetToImplicit = new Map<string, typeof implicitInputsRaw>();
        edges.forEach(e => {
            if (!targetToExplicit.has(e.target)) targetToExplicit.set(e.target, []);
            targetToExplicit.get(e.target)!.push(e);
        });
        implicitInputsRaw.forEach(e => {
            if (!targetToImplicit.has(e.target)) targetToImplicit.set(e.target, []);
            targetToImplicit.get(e.target)!.push(e);
        });

        for (let i = 0; i < 5; i++) {
            const tempNodes = nextNodes.map(node => {
                // Rapidly look up dependencies using Maps instead of filtering entire arrays
                const explicitEdges = targetToExplicit.get(node.id) || [];
                const implicitInputs = targetToImplicit.get(node.id) || [];

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
      }),
  }
)
);

useStore.getState().evaluateGraph();

export default useStore;
