import type { Edge } from '@xyflow/react';
import type { AppNode } from '../store/useStore';
import type { BuiltWorkflowNode, TemplateInterfaceSchema } from '../community/types';
import type { MathValue } from '../types/mathTypes';
import { executeCodeNode } from '../nodes/CodeNode';

type WorkflowTestResult = {
  outputs: Record<string, string>;
  error?: string;
  trace: string[];
};

type BuildWorkflowNodeArgs = {
  sourceNodes: AppNode[];
  sourceEdges: Edge[];
  bridgeNodeId: string;
  interfaceSchema: TemplateInterfaceSchema;
};

const cloneNodes = (nodes: AppNode[]): AppNode[] => JSON.parse(JSON.stringify(nodes));

const updateNodeDataInMemory = (nodes: AppNode[], nodeId: string, patch: Partial<AppNode['data']>) => {
  const node = nodes.find(item => item.id === nodeId);
  if (!node) return;
  node.data = { ...node.data, ...patch };
};

const readSourceValue = (source: AppNode | undefined, sourceHandle?: string | null) => {
  if (!source) return undefined;
  return (sourceHandle && source.data.outputs?.[sourceHandle] !== undefined)
    ? source.data.outputs[sourceHandle]
    : source.data.value;
};

const readSourceTypedValue = (source: AppNode | undefined, sourceHandle?: string | null) => {
  if (!source || !sourceHandle) return undefined;
  return source.data.typedOutputs?.[sourceHandle];
};

const syncExplicitInputs = (nodes: AppNode[], edges: Edge[], targetId: string) => {
  const node = nodes.find(item => item.id === targetId);
  if (!node) return;

  const inputs: Record<string, string> = {};
  const typedInputs: Record<string, MathValue> = {};

  edges
    .filter(edge => edge.target === targetId)
    .forEach(edge => {
      const source = nodes.find(item => item.id === edge.source);
      const value = readSourceValue(source, edge.sourceHandle);
      const typedValue = readSourceTypedValue(source, edge.sourceHandle);

      if (value !== undefined && edge.targetHandle) {
        inputs[edge.targetHandle] = value;
      }

      if (typedValue && edge.targetHandle) {
        typedInputs[edge.targetHandle] = typedValue;
      }
    });

  node.data = {
    ...node.data,
    input: Object.values(inputs)[0],
    inputs,
    typedInputs,
  };
};

const createMemoryState = (nodes: AppNode[], edges: Edge[]) => {
  const globalVars: Record<string, string> = {};

  return {
    get nodes() {
      return nodes;
    },
    get edges() {
      return edges;
    },
    get globalVars() {
      return globalVars;
    },
    updateNodeData: (nodeId: string, patch: Partial<AppNode['data']>) => updateNodeDataInMemory(nodes, nodeId, patch),
    evaluateGraph: () => undefined,
    setGlobalVar: (name: string, value: string) => {
      globalVars[name] = value;
    },
  };
};

const collectReachableFrom = (startId: string, edges: Edge[]) => {
  const reachable = new Set<string>();
  const queue = [startId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    edges
      .filter(edge => edge.source === current)
      .forEach(edge => {
        if (!reachable.has(edge.target)) {
          reachable.add(edge.target);
          queue.push(edge.target);
        }
      });
  }

  return reachable;
};

const collectCanReach = (targetId: string, edges: Edge[]) => {
  const reachable = new Set<string>();
  const queue = [targetId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    edges
      .filter(edge => edge.target === current)
      .forEach(edge => {
        if (!reachable.has(edge.source)) {
          reachable.add(edge.source);
          queue.push(edge.source);
        }
      });
  }

  return reachable;
};

const getExecutableCodeNodes = (nodes: AppNode[], edges: Edge[], bridgeNodeId: string) => {
  const reachableFromBridge = collectReachableFrom(bridgeNodeId, edges);
  const canReachBridge = collectCanReach(bridgeNodeId, edges);
  const executableIds = new Set(
    nodes
      .filter(node => node.type === 'codeNode' && reachableFromBridge.has(node.id) && canReachBridge.has(node.id))
      .map(node => node.id)
  );

  const inDegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  executableIds.forEach(id => {
    inDegree.set(id, 0);
    outgoing.set(id, []);
  });

  edges.forEach(edge => {
    if (!executableIds.has(edge.source) || !executableIds.has(edge.target)) return;
    outgoing.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  });

  const queue = Array.from(executableIds).filter(id => (inDegree.get(id) || 0) === 0);
  const orderedIds: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    orderedIds.push(current);

    outgoing.get(current)?.forEach(target => {
      const nextDegree = (inDegree.get(target) || 0) - 1;
      inDegree.set(target, nextDegree);
      if (nextDegree === 0) queue.push(target);
    });
  }

  if (orderedIds.length !== executableIds.size) {
    return { nodes: [] as AppNode[], error: '測試 runtime 目前不支援 CodeNode 循環依賴。' };
  }

  return {
    nodes: orderedIds
      .map(id => nodes.find(node => node.id === id))
      .filter((node): node is AppNode => Boolean(node)),
  };
};

export const buildWorkflowNode = ({
  sourceNodes,
  sourceEdges,
  bridgeNodeId,
  interfaceSchema,
}: BuildWorkflowNodeArgs): BuiltWorkflowNode => ({
  bridgeNodeId,
  interfaceSchema,
  nodes: cloneNodes(sourceNodes),
  edges: sourceEdges.map(edge => ({ ...edge })),
});

export const runBuiltWorkflowNode = async (
  builtNode: BuiltWorkflowNode,
  testInputs: Record<string, string>,
): Promise<WorkflowTestResult> => {
  const nodes = cloneNodes(builtNode.nodes);
  const edges = builtNode.edges.map(edge => ({ ...edge }));
  const bridgeNode = nodes.find(node => node.id === builtNode.bridgeNodeId);

  if (!bridgeNode) {
    return { outputs: {}, error: '找不到 template bridge node。請先建立 Builder Root。', trace: [] };
  }

  bridgeNode.data = {
    ...bridgeNode.data,
    outputs: {
      ...(bridgeNode.data.outputs || {}),
      ...Object.fromEntries(builtNode.interfaceSchema.inputs.map(port => [port.id, testInputs[port.id] || ''])),
    },
  };

  const executableCodeNodes = getExecutableCodeNodes(nodes, edges, builtNode.bridgeNodeId);

  if (executableCodeNodes.error) {
    return { outputs: {}, error: executableCodeNodes.error, trace: [] };
  }

  if (executableCodeNodes.nodes.length === 0) {
    return { outputs: {}, error: '目前測試 runtime 找不到 bridge 到 CodeNode 再回 bridge 的可執行路徑。', trace: [] };
  }

  const memoryState = createMemoryState(nodes, edges);
  const trace: string[] = [];

  for (const codeNode of executableCodeNodes.nodes) {
    syncExplicitInputs(nodes, edges, codeNode.id);
    trace.push(codeNode.data.label || codeNode.id);
    try {
      await executeCodeNode(nodes.find(node => node.id === codeNode.id)!, memoryState as any);
    } catch (error) {
      return {
        outputs: {},
        error: `CodeNode "${codeNode.data.label || codeNode.id}" 執行失敗：${error instanceof Error ? error.message : String(error)}`,
        trace,
      };
    }
  }

  syncExplicitInputs(nodes, edges, builtNode.bridgeNodeId);

  const finalBridge = nodes.find(node => node.id === builtNode.bridgeNodeId);
  const outputs = Object.fromEntries(
    builtNode.interfaceSchema.outputs.map(port => [port.id, finalBridge?.data.inputs?.[port.id] || ''])
  );

  return { outputs, trace };
};

export const runTemplateWorkflowTest = async (
  sourceNodes: AppNode[],
  sourceEdges: Edge[],
  bridgeNodeId: string,
  interfaceSchema: TemplateInterfaceSchema,
  testInputs: Record<string, string>,
): Promise<WorkflowTestResult> => runBuiltWorkflowNode(
  buildWorkflowNode({ sourceNodes, sourceEdges, bridgeNodeId, interfaceSchema }),
  testInputs,
);
