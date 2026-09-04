import type { Edge } from '@xyflow/react';
import type { AppNode } from '../store/useStore';
import type {
  WorkflowSpec,
  WorkflowNodeSpec,
  WorkflowEdgeSpec,
  WorkflowPortSpec,
} from '../types/workflowSpec';
import { nodeRegistry } from '../nodes/registry';

export interface CatalogSearchItem {
  id: string;
  name: string;
  description: string;
  type: string;
  inputs: WorkflowPortSpec[];
  outputs: WorkflowPortSpec[];
  source: 'builtin' | 'local' | 'community';
}

/**
 * 查庫函式：從內建節點庫與傳入的本地節點庫中搜尋符合名稱或關鍵字的節點
 */
export function queryNodeCatalog(
  keyword: string,
  localWorkflows: WorkflowSpec[] = []
): CatalogSearchItem | null {
  const normKey = keyword.trim().toLowerCase();

  // 1. 搜尋本地私有工作流 / 節點
  const localMatch = localWorkflows.find(
    w => w.name.toLowerCase().includes(normKey) || w.id.toLowerCase() === normKey
  );
  if (localMatch) {
    return {
      id: localMatch.id,
      name: localMatch.name,
      description: localMatch.description,
      type: 'compositeWorkflowNode',
      inputs: localMatch.inputs,
      outputs: localMatch.outputs,
      source: 'local',
    };
  }

  // 2. 搜尋內建標準原子節點
  const builtinMatch = nodeRegistry.find(
    n => n.type.toLowerCase().includes(normKey) || n.metadata.label.toLowerCase().includes(normKey)
  );
  if (builtinMatch) {
    return {
      id: builtinMatch.type,
      name: builtinMatch.metadata.label,
      description: builtinMatch.metadata.desc,
      type: builtinMatch.type,
      inputs: builtinMatch.defaultHandles.filter(h => h.type === 'input').map(h => ({
        id: h.id,
        name: h.label || h.id,
        dataType: 'any',
      })),
      outputs: builtinMatch.defaultHandles.filter(h => h.type === 'output').map(h => ({
        id: h.id,
        name: h.label || h.id,
        dataType: 'any',
      })),
      source: 'builtin',
    };
  }

  return null;
}

/**
 * 簡易 DAG 分層自動排版，避免 AI 產生的節點座標重疊
 */
function computeNodeLayers(
  nodes: WorkflowNodeSpec[],
  edges: WorkflowEdgeSpec[]
): Map<string, number> {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  nodes.forEach(n => {
    inDegree.set(n.id, 0);
    adjacency.set(n.id, []);
  });

  edges.forEach(e => {
    const targets = adjacency.get(e.from) || [];
    targets.push(e.to);
    adjacency.set(e.from, targets);
    inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
  });

  const layers = new Map<string, number>();
  const queue: Array<{ id: string; layer: number }> = [];

  nodes.forEach(n => {
    if ((inDegree.get(n.id) || 0) === 0) {
      queue.push({ id: n.id, layer: 0 });
      layers.set(n.id, 0);
    }
  });

  while (queue.length > 0) {
    const { id, layer } = queue.shift()!;
    const neighbors = adjacency.get(id) || [];
    neighbors.forEach(targetId => {
      const currentLayer = layers.get(targetId) || 0;
      const nextLayer = Math.max(currentLayer, layer + 1);
      layers.set(targetId, nextLayer);
      queue.push({ id: targetId, layer: nextLayer });
    });
  }

  // 處理可能的獨立節點或循環
  nodes.forEach(n => {
    if (!layers.has(n.id)) {
      layers.set(n.id, 0);
    }
  });

  return layers;
}

/**
 * 將 AI 產出的宣告式 WorkflowSpec 轉換為畫布上的 AppNode[] 與 Edge[]
 */
export function convertSpecToCanvasGraph(spec: WorkflowSpec): {
  nodes: AppNode[];
  edges: Edge[];
} {
  const layers = computeNodeLayers(spec.nodes, spec.edges);
  const layerBuckets = new Map<number, string[]>();

  layers.forEach((layer, nodeId) => {
    const bucket = layerBuckets.get(layer) || [];
    bucket.push(nodeId);
    layerBuckets.set(layer, bucket);
  });

  const nodes: AppNode[] = spec.nodes.map(nodeSpec => {
    const layer = layers.get(nodeSpec.id) || 0;
    const bucket = layerBuckets.get(layer) || [nodeSpec.id];
    const indexInLayer = bucket.indexOf(nodeSpec.id);

    // 自動計算排版座標
    const position = nodeSpec.position || {
      x: 100 + layer * 320,
      y: 100 + indexInLayer * 180,
    };

    return {
      id: nodeSpec.id,
      type: nodeSpec.type,
      position,
      data: {
        label: nodeSpec.name,
        nodeName: nodeSpec.name,
        description: nodeSpec.description,
        ...(nodeSpec.config || {}),
        // 若為 dummyNode，帶入預期合約
        expectedInputs: (nodeSpec.config as any)?.expectedInputs,
        expectedOutputs: (nodeSpec.config as any)?.expectedOutputs,
      },
    };
  });

  const edges: Edge[] = spec.edges.map((edgeSpec, idx) => {
    const edgeId = edgeSpec.id || `edge-${edgeSpec.from}-${edgeSpec.to}-${idx}`;
    return {
      id: edgeId,
      source: edgeSpec.from,
      target: edgeSpec.to,
      sourceHandle: edgeSpec.fromPort || 'value',
      targetHandle: edgeSpec.toPort || 'value',
    };
  });

  return { nodes, edges };
}

/**
 * 將 Dummy 節點遞迴展開為具體實作的子工作流節點 (CompositeWorkflowNode)
 */
export function expandDummyNodeWithSubgraph(
  currentNodes: AppNode[],
  currentEdges: Edge[],
  dummyNodeId: string,
  subgraphSpec: WorkflowSpec
): { nodes: AppNode[]; edges: Edge[] } {
  const dummyNode = currentNodes.find(n => n.id === dummyNodeId);
  if (!dummyNode) return { nodes: currentNodes, edges: currentEdges };

  // 替換 Dummy 節點為封裝之 CompositeWorkflowNode
  const replacementNode: AppNode = {
    ...dummyNode,
    type: 'compositeWorkflowNode',
    data: {
      ...dummyNode.data,
      label: subgraphSpec.name,
      description: subgraphSpec.description,
      workflowSpec: subgraphSpec,
      subgraphId: subgraphSpec.id,
    },
  };

  const nextNodes = currentNodes.map(n => (n.id === dummyNodeId ? replacementNode : n));

  return { nodes: nextNodes, edges: currentEdges };
}
