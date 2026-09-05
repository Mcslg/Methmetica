import type { Edge } from '@xyflow/react';
import type { AppNode, AppState, NodeData } from '../store/useStore';
import type { AppRole, AppUser } from '../integrations/supabase/types';
import type {
  CommunityNodeTemplate,
  TemplateControlPort,
  TemplateElementBinding,
  TemplateInterfaceSchema,
  TemplateViewOverrides,
} from '../community/types';
import { getTemplateInterfaceSchema } from '../community/types';
import { resolveTemplateViewOverridesFromBindings } from '../community/templateView';
import { executeCodeNode } from '../nodes/CodeNode';
import { evaluateMathExpression } from './statelessMathEvaluator';

export const WORKFLOW_ARTIFACT_VERSION = 'beta-ir-1';
export const WORKFLOW_COMPILER_VERSION = 'beta-compiler-1';
export const WORKFLOW_RUNTIME_VERSION = 'beta-runtime-1';

const SUPPORTED_NODE_TYPES = new Set([
  'textNode',
  'codeNode',
  'communityTemplateNode',
  'calculateNode',
  'inputNode',
  'outputNode',
]);
const DEFAULT_LIMITS = {
  maxExpandedNodes: 250,
  maxExecutionSteps: 500,
  maxArtifactBytes: 512_000,
};

export type CompileDiagnosticSeverity = 'error' | 'warning';

export type CompileDiagnostic = {
  severity: CompileDiagnosticSeverity;
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
  portId?: string;
  dependencyPath?: string[];
};

export type CompiledNodeSpec = {
  id: string;
  sourceNodeId: string;
  type: 'textNode' | 'codeNode' | 'communityTemplateNode' | 'bridge' | 'calculateNode' | 'inputNode' | 'outputNode';
  label?: string;
  tracePath: string[];
  data: Pick<NodeData, 'text' | 'value' | 'outputs' | 'code' | 'language' | 'handles' | 'formula' | 'formulaInput'>;
  artifact?: CompiledWorkflowArtifact;
  templateId?: string;
};

export type CompiledExecutionStep = {
  id: string;
  nodeId: string;
  type: CompiledNodeSpec['type'];
  tracePath: string[];
};

export type CompiledDependencyManifestEntry = {
  templateId: string;
  title: string;
  version: string;
  artifactVersion: string;
  compilerVersion: string;
  runtimeVersion: string;
};

export type CompiledDependencyManifest = {
  entries: CompiledDependencyManifestEntry[];
};

export type CompiledWorkflowArtifact = {
  artifactVersion: string;
  compilerVersion: string;
  runtimeVersion: string;
  entryBridgeId: string;
  builderNodeId?: string;
  interfaceSchema: TemplateInterfaceSchema;
  controlPorts?: TemplateControlPort[];
  elementBindings?: TemplateElementBinding[];
  nodes: CompiledNodeSpec[];
  edges: Edge[];
  executionPlan: CompiledExecutionStep[];
  dependencyManifest: CompiledDependencyManifest;
  permissions: {
    containsCodeNode: boolean;
    codeAuthorId?: string;
    codeAuthorRole?: AppRole;
  };
  limits: typeof DEFAULT_LIMITS;
};

export type CompileResult = {
  ok: boolean;
  artifact?: CompiledWorkflowArtifact;
  diagnostics: CompileDiagnostic[];
};

export type RuntimeExecutionResult = {
  outputs: Record<string, string>;
  templateViewOverrides?: TemplateViewOverrides;
  error?: string;
  trace: string[];
  diagnostics?: CompileDiagnostic[];
};

type CompileOptions = {
  author?: AppUser | null;
  authorRole?: AppRole;
  templates?: CommunityNodeTemplate[];
  limits?: Partial<typeof DEFAULT_LIMITS>;
  dependencyPath?: string[];
};

const makeBridgeTemplate = (
  spec: CompiledNodeSpec,
  interfaceSchema: TemplateInterfaceSchema,
): CommunityNodeTemplate => ({
  id: spec.templateId || spec.id,
  title: spec.label || spec.id,
  summary: '',
  category: '',
  slug: spec.templateId || spec.id,
  version: '',
  source: 'community',
  visibility: 'public',
  discovery: 'search-only',
  accent: '',
  size: { width: 0, height: 0 },
  tags: [],
  interfaceSchema,
  fields: [],
  inputs: [],
  outputs: [],
  bestAlgorithm: '',
  alternativeAlgorithms: [],
  tutorialSteps: [],
  relatedWorkflowIds: [],
  builderBlocks: [],
});

const cloneJson = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const byteSize = (value: unknown) => new Blob([JSON.stringify(value)]).size;

const getNodeLabel = (node: AppNode) => node.data.label || node.id;

const readSourceValue = (
  valuesByNode: Map<string, { outputs: Record<string, string>; value?: string }>,
  sourceId: string,
  sourceHandle?: string | null,
) => {
  const source = valuesByNode.get(sourceId);
  if (!source) return undefined;
  if (sourceHandle && source.outputs[sourceHandle] !== undefined) return source.outputs[sourceHandle];
  return source.value;
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

const topologicalOrder = (nodes: AppNode[], edges: Edge[], ids: Set<string>) => {
  const inDegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  ids.forEach(id => {
    inDegree.set(id, 0);
    outgoing.set(id, []);
  });

  edges.forEach(edge => {
    if (!ids.has(edge.source) || !ids.has(edge.target)) return;
    outgoing.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  });

  const queue = Array.from(ids).filter(id => (inDegree.get(id) || 0) === 0);
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

  if (orderedIds.length !== ids.size) return null;
  return orderedIds
    .map(id => nodes.find(node => node.id === id))
    .filter((node): node is AppNode => Boolean(node));
};

const mergeDependencies = (target: Map<string, CompiledDependencyManifestEntry>, artifact: CompiledWorkflowArtifact) => {
  artifact.dependencyManifest.entries.forEach(entry => target.set(entry.templateId, entry));
};

const findTemplate = (
  node: AppNode,
  templates: CommunityNodeTemplate[],
): CommunityNodeTemplate | undefined => (
  templates.find(template => template.id === node.data.templateId && template.compiledArtifact) ??
  ((node.data.templateDraft as CommunityNodeTemplate | undefined)?.compiledArtifact
    ? node.data.templateDraft as CommunityNodeTemplate
    : undefined) ??
  templates.find(template => template.id === node.data.templateId) ??
  (node.data.templateDraft as CommunityNodeTemplate | undefined)
);

export const compileWorkflowToArtifact = (
  sourceGraph: {
    nodes: AppNode[];
    edges: Edge[];
    bridgeNodeId: string;
    builderNodeId?: string;
    interfaceSchema: TemplateInterfaceSchema;
    controlPorts?: TemplateControlPort[];
    elementBindings?: TemplateElementBinding[];
  },
  options: CompileOptions = {},
): CompileResult => {
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  const diagnostics: CompileDiagnostic[] = [];
  const dependencyPath = options.dependencyPath ?? ['Root'];
  const authorRole = options.authorRole ?? options.author?.role ?? 'user';
  const templates = options.templates ?? [];
  const nodeById = new Map(sourceGraph.nodes.map(node => [node.id, node]));
  const bridgeNode = nodeById.get(sourceGraph.bridgeNodeId);

  if (!bridgeNode) {
    return {
      ok: false,
      diagnostics: [{
        severity: 'error',
        code: 'missing_bridge',
        message: '找不到 Builder bridge node，無法編譯 artifact。',
        nodeId: sourceGraph.bridgeNodeId,
        dependencyPath,
      }],
    };
  }

  const reachableFromBridge = collectReachableFrom(sourceGraph.bridgeNodeId, sourceGraph.edges);
  const terminalIds = [sourceGraph.bridgeNodeId, sourceGraph.builderNodeId].filter(Boolean) as string[];
  const canReachTerminal = new Set<string>();
  terminalIds.forEach(targetId => {
    collectCanReach(targetId, sourceGraph.edges).forEach(nodeId => canReachTerminal.add(nodeId));
  });
  const executableIds = new Set(
    sourceGraph.nodes
      .filter(node => node.id !== sourceGraph.bridgeNodeId && node.id !== sourceGraph.builderNodeId && reachableFromBridge.has(node.id) && canReachTerminal.has(node.id))
      .map(node => node.id)
  );

  const orderedNodes = topologicalOrder(sourceGraph.nodes, sourceGraph.edges, executableIds);
  if (!orderedNodes) {
    diagnostics.push({
      severity: 'error',
      code: 'cycle_in_graph',
      message: '工作流執行路徑存在循環依賴，Beta artifact 目前無法發布。',
      dependencyPath,
    });
  }

  const containsCodeNode = sourceGraph.nodes.some(node => executableIds.has(node.id) && node.type === 'codeNode');
  if (containsCodeNode && authorRole !== 'admin') {
    diagnostics.push({
      severity: 'error',
      code: 'admin_required_for_code',
      message: '只有 admin 可發布含 CodeNode 的節點。',
      dependencyPath,
    });
  }

  const dependencyManifest = new Map<string, CompiledDependencyManifestEntry>();
  const compiledNodes: CompiledNodeSpec[] = [{
    id: sourceGraph.bridgeNodeId,
    sourceNodeId: sourceGraph.bridgeNodeId,
    type: 'bridge',
    label: getNodeLabel(bridgeNode),
    tracePath: dependencyPath,
    data: {
      outputs: {},
      handles: bridgeNode.data.handles,
    },
  }];

  (orderedNodes ?? []).forEach(node => {
    if (!SUPPORTED_NODE_TYPES.has(node.type || '')) {
      diagnostics.push({
        severity: 'error',
        code: 'unsupported_node_type',
        message: `Beta artifact 只支援 textNode、codeNode、communityTemplateNode，目前不支援 ${node.type}。`,
        nodeId: node.id,
        dependencyPath,
      });
      return;
    }

    const tracePath = [...dependencyPath, getNodeLabel(node)];
    const baseData = {
      text: node.data.text,
      value: node.data.value,
      outputs: node.data.outputs,
      code: node.data.code,
      language: node.data.language,
      handles: node.data.handles,
      formula: node.data.formula,
      formulaInput: node.data.formulaInput,
    };

    if (node.type === 'calculateNode' && !node.data.formula && !node.data.formulaInput) {
      diagnostics.push({
        severity: 'error',
        code: 'missing_formula',
        message: `節點 "${getNodeLabel(node)}" 缺少算式，無法編譯。`,
        nodeId: node.id,
        dependencyPath: tracePath,
      });
    }

    if (node.type === 'communityTemplateNode') {
      const template = findTemplate(node, templates);
      const nestedArtifact = template?.compiledArtifact;

      if (!template) {
        diagnostics.push({
          severity: 'error',
          code: 'missing_community_template',
          message: '找不到這個 community node 的 template，無法固定依賴。',
          nodeId: node.id,
          dependencyPath: tracePath,
        });
        return;
      }

      if (dependencyPath.includes(template.id)) {
        diagnostics.push({
          severity: 'error',
          code: 'community_dependency_cycle',
          message: `偵測到 community node 循環依賴：${[...dependencyPath, template.id].join(' > ')}`,
          nodeId: node.id,
          dependencyPath: [...dependencyPath, template.id],
        });
        return;
      }

      if (!nestedArtifact) {
        diagnostics.push({
          severity: 'error',
          code: 'missing_community_artifact',
          message: `「${template.title}」還沒有 Beta artifact，請先重新發布該 community node。`,
          nodeId: node.id,
          dependencyPath: tracePath,
        });
        return;
      }

      dependencyManifest.set(template.id, {
        templateId: template.id,
        title: template.title,
        version: template.version,
        artifactVersion: nestedArtifact.artifactVersion,
        compilerVersion: nestedArtifact.compilerVersion,
        runtimeVersion: nestedArtifact.runtimeVersion,
      });
      mergeDependencies(dependencyManifest, nestedArtifact);

      compiledNodes.push({
        id: node.id,
        sourceNodeId: node.id,
        type: 'communityTemplateNode',
        label: getNodeLabel(node),
        tracePath,
        data: baseData,
        artifact: cloneJson(nestedArtifact),
        templateId: template.id,
      });
      return;
    }

    compiledNodes.push({
      id: node.id,
      sourceNodeId: node.id,
      type: node.type as 'textNode' | 'codeNode' | 'calculateNode' | 'inputNode' | 'outputNode',
      label: getNodeLabel(node),
      tracePath,
      data: baseData,
    });
  });

  const executionPlan = (orderedNodes ?? [])
    .filter(node => compiledNodes.some(compiledNode => compiledNode.id === node.id))
    .map((node): CompiledExecutionStep => ({
      id: `step-${node.id}`,
      nodeId: node.id,
      type: node.type as CompiledExecutionStep['type'],
      tracePath: compiledNodes.find(compiledNode => compiledNode.id === node.id)?.tracePath ?? dependencyPath,
    }));

  const expandedNodeCount = compiledNodes.reduce((count, node) => count + 1 + (node.artifact?.nodes.length ?? 0), 0);
  const expandedStepCount = executionPlan.reduce((count, step) => {
    const node = compiledNodes.find(item => item.id === step.nodeId);
    return count + 1 + (node?.artifact?.executionPlan.length ?? 0);
  }, 0);

  if (expandedNodeCount > limits.maxExpandedNodes) {
    diagnostics.push({
      severity: 'error',
      code: 'artifact_node_limit',
      message: `展開後節點數 ${expandedNodeCount} 超過 Beta 上限 ${limits.maxExpandedNodes}。`,
      dependencyPath,
    });
  }

  if (expandedStepCount > limits.maxExecutionSteps) {
    diagnostics.push({
      severity: 'error',
      code: 'artifact_step_limit',
      message: `展開後執行步驟 ${expandedStepCount} 超過 Beta 上限 ${limits.maxExecutionSteps}。`,
      dependencyPath,
    });
  }

  const artifact: CompiledWorkflowArtifact = {
    artifactVersion: WORKFLOW_ARTIFACT_VERSION,
    compilerVersion: WORKFLOW_COMPILER_VERSION,
    runtimeVersion: WORKFLOW_RUNTIME_VERSION,
    entryBridgeId: sourceGraph.bridgeNodeId,
    builderNodeId: sourceGraph.builderNodeId,
    interfaceSchema: cloneJson(sourceGraph.interfaceSchema),
    controlPorts: cloneJson(sourceGraph.controlPorts || []),
    elementBindings: cloneJson(sourceGraph.elementBindings || []),
    nodes: compiledNodes,
    edges: sourceGraph.edges.map(edge => ({ ...edge })),
    executionPlan,
    dependencyManifest: {
      entries: Array.from(dependencyManifest.values()),
    },
    permissions: {
      containsCodeNode,
      codeAuthorId: containsCodeNode ? options.author?.id : undefined,
      codeAuthorRole: containsCodeNode ? authorRole : undefined,
    },
    limits,
  };

  if (byteSize(artifact) > limits.maxArtifactBytes) {
    diagnostics.push({
      severity: 'error',
      code: 'artifact_size_limit',
      message: `artifact 大小超過 Beta 上限 ${limits.maxArtifactBytes} bytes。`,
      dependencyPath,
    });
  }

  return {
    ok: diagnostics.every(diagnostic => diagnostic.severity !== 'error'),
    artifact,
    diagnostics,
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
    updateNodeData: (nodeId: string, patch: Partial<NodeData>) => {
      const node = nodes.find(item => item.id === nodeId);
      if (!node) return;
      node.data = { ...node.data, ...patch };
    },
    evaluateGraph: () => undefined,
    setGlobalVar: (name: string, value: string) => {
      globalVars[name] = value;
    },
  };
};

const buildRuntimeNode = (spec: CompiledNodeSpec, inputs: Record<string, string>): AppNode => ({
  id: spec.id,
  type: spec.type === 'bridge' ? 'communityTemplateNode' : spec.type,
  position: { x: 0, y: 0 },
  data: {
    ...spec.data,
    label: spec.label,
    inputs,
    input: Object.values(inputs)[0],
  },
} as AppNode);

export const runCompiledArtifact = async (
  artifact: CompiledWorkflowArtifact,
  inputs: Record<string, string>,
): Promise<RuntimeExecutionResult> => {
  const nodeSpecs = new Map(artifact.nodes.map(node => [node.id, node]));
  const trace: string[] = [];
  const valuesByNode = new Map<string, { outputs: Record<string, string>; value?: string }>();
  const bridgeOutputs = Object.fromEntries(
    artifact.interfaceSchema.inputs.map(port => [port.id, inputs[port.id] || ''])
  );

  valuesByNode.set(artifact.entryBridgeId, {
    outputs: bridgeOutputs,
    value: Object.values(bridgeOutputs)[0],
  });

  for (const step of artifact.executionPlan) {
    const spec = nodeSpecs.get(step.nodeId);
    if (!spec) {
      return { outputs: {}, error: `Runtime 找不到 step node：${step.nodeId}`, trace };
    }

    const stepInputs: Record<string, string> = {};
    artifact.edges
      .filter(edge => edge.target === spec.id)
      .forEach(edge => {
        const value = readSourceValue(valuesByNode, edge.source, edge.sourceHandle);
        if (value !== undefined && edge.targetHandle) {
          stepInputs[edge.targetHandle] = value;
        }
      });

    trace.push(spec.tracePath.join(' > '));

    if (spec.type === 'textNode') {
      const outputValue = spec.data.value ?? spec.data.text ?? Object.values(stepInputs)[0] ?? '';
      valuesByNode.set(spec.id, {
        outputs: {
          ...(spec.data.outputs || {}),
          'h-out': outputValue,
        },
        value: outputValue,
      });
      continue;
    }

    if (spec.type === 'communityTemplateNode') {
      if (!spec.artifact) {
        return { outputs: {}, error: `Community step 缺少內聯 artifact：${spec.label || spec.id}`, trace };
      }
      const result = await runCompiledArtifact(spec.artifact, stepInputs);
      if (result.error) {
        return {
          outputs: {},
          error: result.error,
          trace: [...trace, ...result.trace],
        };
      }
      const primaryOutput = getTemplateInterfaceSchema(makeBridgeTemplate(spec, spec.artifact.interfaceSchema)).outputs[0]?.id;
      valuesByNode.set(spec.id, {
        outputs: result.outputs,
        value: primaryOutput ? result.outputs[primaryOutput] : Object.values(result.outputs)[0],
      });
      continue;
    }

    if (spec.type === 'codeNode') {
      const runtimeNode = buildRuntimeNode(spec, stepInputs);
      const runtimeNodes = [runtimeNode];
      const memoryState = createMemoryState(runtimeNodes, []);

      try {
        await executeCodeNode(runtimeNode, memoryState as unknown as AppState);
      } catch (error) {
        return {
          outputs: {},
          error: `CodeNode "${spec.label || spec.id}" 執行失敗：${error instanceof Error ? error.message : String(error)}`,
          trace,
        };
      }

      if (runtimeNode.data.error) {
        return {
          outputs: {},
          error: `CodeNode "${spec.label || spec.id}" 執行失敗：${runtimeNode.data.error}`,
          trace,
        };
      }

      valuesByNode.set(spec.id, {
        outputs: runtimeNode.data.outputs || {},
        value: runtimeNode.data.value,
      });
      continue;
    }

    if (spec.type === 'calculateNode') {
      const rawFormula = spec.data.formulaInput || spec.data.formula || '';
      try {
        const computed = evaluateMathExpression(rawFormula, stepInputs);
        valuesByNode.set(spec.id, {
          outputs: {
            'h-out': computed,
          },
          value: computed,
        });
      } catch (calcError) {
        return {
          outputs: {},
          error: `CalculateNode "${spec.label || spec.id}" 計算失敗：${calcError instanceof Error ? calcError.message : String(calcError)}`,
          trace,
        };
      }
      continue;
    }

    if (spec.type === 'inputNode') {
      // 優先取直接傳入的 input，若無則取上游連線或節點預設值
      const assignedValue = inputs[spec.id] ?? inputs[spec.label || ''] ?? Object.values(stepInputs)[0] ?? spec.data.value ?? '';
      valuesByNode.set(spec.id, {
        outputs: {
          out: String(assignedValue),
          'h-out': String(assignedValue),
        },
        value: String(assignedValue),
      });
      continue;
    }

    if (spec.type === 'outputNode') {
      const incomingValue = Object.values(stepInputs)[0] ?? spec.data.value ?? '';
      valuesByNode.set(spec.id, {
        outputs: {
          'h-out': String(incomingValue),
        },
        value: String(incomingValue),
      });
      continue;
    }
  }

  // 匯總輸出：若有 entryBridgeId（傳統模式），優先從連到 Bridge 的 edge 收集
  const finalInputs: Record<string, string> = {};
  if (artifact.entryBridgeId && artifact.entryBridgeId !== 'subgraph-io-bridge') {
    artifact.edges
      .filter(edge => edge.target === artifact.entryBridgeId)
      .forEach(edge => {
        const value = readSourceValue(valuesByNode, edge.source, edge.sourceHandle);
        if (value !== undefined && edge.targetHandle) {
          finalInputs[edge.targetHandle] = value;
        }
      });
  }

  // 子圖模式：直接從各 outputNode 節點收集數值
  artifact.interfaceSchema.outputs.forEach(port => {
    if (finalInputs[port.id] !== undefined) return;
    const targetNode = artifact.nodes.find(n => n.id === port.id || n.label === port.label);
    if (targetNode) {
      const val = valuesByNode.get(targetNode.id)?.value;
      if (val !== undefined) {
        finalInputs[port.id] = val;
      }
    }
  });

  const outputs = Object.fromEntries(
    artifact.interfaceSchema.outputs.map(port => [port.id, finalInputs[port.id] || ''])
  );
  const controlValues = Object.fromEntries(
    (artifact.controlPorts || []).map(port => {
      const edgeValue = artifact.builderNodeId
        ? artifact.edges
            .filter(edge => edge.target === artifact.builderNodeId && edge.targetHandle === port.id)
            .map(edge => readSourceValue(valuesByNode, edge.source, edge.sourceHandle))
            .find(value => value !== undefined)
        : undefined;
      return [port.id, edgeValue ?? ''];
    })
  );
  const templateViewOverrides = resolveTemplateViewOverridesFromBindings(artifact.elementBindings, controlValues);

  return { outputs, templateViewOverrides, trace };
};

export const formatCompileDiagnostics = (diagnostics: CompileDiagnostic[]) => (
  diagnostics.map(diagnostic => diagnostic.message).join('；')
);

/**
 * 將標準子工作流圖（由 inputNode 輸入、outputNode 輸出，且可能含有 calculateNode/textNode/codeNode 等）
 * 編譯為可供無狀態 Runtime 執行的 CompiledWorkflowArtifact。
 */
export const compileSubgraphWorkflow = (
  graph: {
    nodes: AppNode[];
    edges: Edge[];
    inputs?: Array<{ id: string; name: string }>;
    outputs?: Array<{ id: string; name: string }>;
  },
  options: CompileOptions = {}
): CompileResult => {
  const diagnostics: CompileDiagnostic[] = [];
  const dependencyPath = options.dependencyPath ?? ['Subgraph'];
  const limits = { ...DEFAULT_LIMITS, ...options.limits };

  // 1. 識別輸入端點與輸出端點
  const inputNodes = graph.nodes.filter(n => n.type === 'inputNode');
  const outputNodes = graph.nodes.filter(n => n.type === 'outputNode');

  const interfaceSchema: TemplateInterfaceSchema = {
    inputs: (graph.inputs || inputNodes.map(n => ({ id: n.id, name: n.data?.label || n.id }))).map(i => ({
      id: i.id,
      label: i.name,
      type: 'input' as const,
      position: 'left' as const,
      offset: 50,
      source: 'static' as const,
      valueKind: 'value' as const,
    })),
    outputs: (graph.outputs || outputNodes.map(n => ({ id: n.id, name: n.data?.label || n.id }))).map(o => ({
      id: o.id,
      label: o.name,
      type: 'output' as const,
      position: 'right' as const,
      offset: 50,
      source: 'static' as const,
      valueKind: 'value' as const,
    })),
  };

  // 2. 檢查不支援的節點型別並報錯
  graph.nodes.forEach(n => {
    if (n.type === 'projectNode') return; // projectNode 僅為詮釋資料，不參與運算
    if (!SUPPORTED_NODE_TYPES.has(n.type || '')) {
      diagnostics.push({
        severity: 'error',
        code: 'unsupported_node_type',
        message: `子工作流包含不支援的節點型別 "${n.type || 'unknown'}" (節點: ${getNodeLabel(n)})。`,
        nodeId: n.id,
        dependencyPath,
      });
    }
  });

  // 3. 拓撲排序
  const executableNodes = graph.nodes.filter(n => n.type !== 'projectNode');
  const executableIds = new Set(executableNodes.map(n => n.id));
  const orderedNodes = topologicalOrder(executableNodes, graph.edges, executableIds);

  if (!orderedNodes) {
    diagnostics.push({
      severity: 'error',
      code: 'cycle_in_graph',
      message: '子工作流內部存在循環依賴，無法完成求值編譯。',
      dependencyPath,
    });
  }

  if (diagnostics.some(d => d.severity === 'error')) {
    return { ok: false, diagnostics };
  }

  const compiledNodes: CompiledNodeSpec[] = [];
  (orderedNodes ?? []).forEach(node => {
    const tracePath = [...dependencyPath, getNodeLabel(node)];
    const baseData = {
      text: node.data.text,
      value: node.data.value,
      outputs: node.data.outputs,
      code: node.data.code,
      language: node.data.language,
      handles: node.data.handles,
      formula: node.data.formula,
      formulaInput: node.data.formulaInput,
    };

    if (node.type === 'calculateNode' && !node.data.formula && !node.data.formulaInput) {
      diagnostics.push({
        severity: 'error',
        code: 'missing_formula',
        message: `數學運算節點 "${getNodeLabel(node)}" 未設定算式。`,
        nodeId: node.id,
        dependencyPath: tracePath,
      });
    }

    compiledNodes.push({
      id: node.id,
      sourceNodeId: node.id,
      type: node.type as CompiledNodeSpec['type'],
      label: getNodeLabel(node),
      tracePath,
      data: baseData,
    });
  });

  const executionPlan = (orderedNodes ?? []).map((node): CompiledExecutionStep => ({
    id: `step-${node.id}`,
    nodeId: node.id,
    type: node.type as CompiledExecutionStep['type'],
    tracePath: [...dependencyPath, getNodeLabel(node)],
  }));

  const artifact: CompiledWorkflowArtifact = {
    artifactVersion: WORKFLOW_ARTIFACT_VERSION,
    compilerVersion: WORKFLOW_COMPILER_VERSION,
    runtimeVersion: WORKFLOW_RUNTIME_VERSION,
    entryBridgeId: 'subgraph-io-bridge',
    interfaceSchema,
    nodes: compiledNodes,
    edges: graph.edges.map(e => ({ ...e })),
    executionPlan,
    dependencyManifest: { entries: [] },
    permissions: {
      containsCodeNode: graph.nodes.some(n => n.type === 'codeNode'),
    },
    limits,
  };

  return {
    ok: diagnostics.every(d => d.severity !== 'error'),
    artifact,
    diagnostics,
  };
};

/**
 * 將子工作流規格直接編譯並產出可供重複調用的無狀態非同步執行函式：
 * (inputs: Record<string, string>) => Promise<Record<string, string>>
 */
export const buildWorkflowFunction = (
  graph: {
    nodes: AppNode[];
    edges: Edge[];
    inputs?: Array<{ id: string; name: string }>;
    outputs?: Array<{ id: string; name: string }>;
  }
) => {
  const compileResult = compileSubgraphWorkflow(graph);
  if (!compileResult.ok || !compileResult.artifact) {
    const errorMsg = formatCompileDiagnostics(compileResult.diagnostics);
    throw new Error(`子工作流編譯失敗：${errorMsg}`);
  }

  const artifact = compileResult.artifact;

  return async (runtimeInputs: Record<string, string>): Promise<Record<string, string>> => {
    const runResult = await runCompiledArtifact(artifact, runtimeInputs);
    if (runResult.error) {
      throw new Error(runResult.error);
    }
    return runResult.outputs;
  };
};

