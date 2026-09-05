import type { Edge } from '@xyflow/react';
import type { AppNode, CustomHandle } from '../store/useStore';
import type {
  WorkflowSpec,
  WorkflowNodeSpec,
  WorkflowEdgeSpec,
  WorkflowPortSpec,
  WorkflowPortDataType,
} from '../types/workflowSpec';
import { nodeRegistry } from '../nodes/registry';
import type { CommunityNodeTemplate } from '../community/types';
import { getCommunityTemplateById, defaultCommunityTemplates } from '../community/catalog';
import { getTemplateHandles } from '../community/types';
import { normalizeLatexFormula, extractFormulaVariables } from './mathNormalizer';

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

  // 3. 搜尋社群公開節點範本
  const communityMatch = defaultCommunityTemplates.find(
    t => t.title.toLowerCase().includes(normKey) || t.id.toLowerCase() === normKey
  );
  if (communityMatch) {
    const handles = getTemplateHandles(communityMatch);
    return {
      id: communityMatch.id,
      name: communityMatch.title,
      description: communityMatch.summary,
      type: 'communityTemplateNode',
      inputs: handles.filter(h => h.type === 'input').map(h => ({
        id: h.id,
        name: h.label || h.id,
        dataType: 'any',
      })),
      outputs: handles.filter(h => h.type === 'output').map(h => ({
        id: h.id,
        name: h.label || h.id,
        dataType: 'any',
      })),
      source: 'community',
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

export { callGeminiGenerateWorkflow, callGeminiImplementDummyNode } from './aiClient';
export { normalizeLatexFormula, extractFormulaVariables } from './mathNormalizer';

/**
 * 將 AI 產出的宣告式 WorkflowSpec 轉換為畫布上的 AppNode[] 與 Edge[]
 */
export function convertSpecToCanvasGraph(
  spec: WorkflowSpec,
  originOffset: { x: number; y: number } = { x: 120, y: 120 },
  availableCommunityTemplates?: CommunityNodeTemplate[]
): {
  nodes: AppNode[];
  edges: Edge[];
} {
  const specNodeMap = new Map(spec.nodes.map(n => [n.id, n]));
  const typeOrder: Record<string, number> = {
    textNode: 1,
    sliderNode: 2,
    inputNode: 3,
    calculateNode: 4,
    codeNode: 5,
    communityTemplateNode: 6,
    dummyNode: 7,
    graphNode: 8,
    outputNode: 9,
  };

  const layers = computeNodeLayers(spec.nodes, spec.edges);
  const layerBuckets = new Map<number, string[]>();

  layers.forEach((layer, nodeId) => {
    const bucket = layerBuckets.get(layer) || [];
    bucket.push(nodeId);
    layerBuckets.set(layer, bucket);
  });

  // 依據三區功能優先權對各層節點垂直排序（說明區置頂，互動區居中，運算輸出在後）
  layerBuckets.forEach((bucket) => {
    bucket.sort((a, b) => {
      const typeA = specNodeMap.get(a)?.type || '';
      const typeB = specNodeMap.get(b)?.type || '';
      return (typeOrder[typeA] || 50) - (typeOrder[typeB] || 50);
    });
  });

  const maxLayerCount = Math.max(...Array.from(layerBuckets.values()).map(b => b.length), 1);
  const rowHeight = 220;
  const colWidth = 350;

  const templatesPool = availableCommunityTemplates && availableCommunityTemplates.length > 0
    ? availableCommunityTemplates
    : defaultCommunityTemplates;

  const nodes: AppNode[] = spec.nodes.map(nodeSpec => {
    const layer = layers.get(nodeSpec.id) || 0;
    const bucket = layerBuckets.get(layer) || [nodeSpec.id];
    const indexInLayer = bucket.indexOf(nodeSpec.id);

    // 垂直居中對齊：計算該層與最大高度的垂直差值，讓少節點的層級自然置中
    const layerHeight = bucket.length * rowHeight;
    const maxHeight = maxLayerCount * rowHeight;
    const verticalOffset = (maxHeight - layerHeight) / 2;

    const position = nodeSpec.position || {
      x: originOffset.x + layer * colWidth,
      y: originOffset.y + verticalOffset + indexInLayer * rowHeight,
    };

    const cfg = (nodeSpec.config || {}) as Record<string, unknown>;
    let extraData: Record<string, unknown> = {};
    let customStyle: React.CSSProperties | undefined = undefined;

    // 1. calculateNode 表層欄位與 Handles 預初始化
    if (nodeSpec.type === 'calculateNode') {
      const rawFormula = String(cfg.formula || cfg.formulaInput || '');
      const formula = normalizeLatexFormula(rawFormula);
      const vars = extractFormulaVariables(formula);
      const spacing = 100 / (vars.length + 1);
      const inputHandles: CustomHandle[] = vars.map((v, index) => ({
        id: `h-in-${v}`,
        type: 'input',
        position: 'left',
        offset: (index + 1) * spacing,
        label: v,
      }));
      const specialHandles: CustomHandle[] = cfg.useExternalFormula ? [
        { id: 'h-fn-in', type: 'input', position: 'left', offset: 15, label: 'f(x)' }
      ] : [];
      const outputHandle: CustomHandle = { id: 'h-out', type: 'output', position: 'right', offset: 50 };
      extraData = {
        formula,
        formulaInput: formula,
        handles: [...specialHandles, ...inputHandles, outputHandle],
        label: String(cfg.label || nodeSpec.name || 'Calculate'),
        nodeName: String(cfg.nodeName || cfg.label || nodeSpec.name || 'Calculate'),
      };
    }
    // 2. sliderNode 表層欄位與 Handles 預初始化
    else if (nodeSpec.type === 'sliderNode') {
      const nodeName = String(cfg.nodeName || cfg.label || nodeSpec.name || 'x');
      const value = String(cfg.value ?? 5);
      const min = Number(cfg.min ?? 0);
      const max = Number(cfg.max ?? 10);
      const step = Number(cfg.step ?? 1);
      extraData = {
        nodeName,
        label: String(cfg.label || nodeName),
        value,
        min,
        max,
        step,
        handles: [{ id: 'h-out', type: 'output', position: 'right', offset: 50, label: nodeName }],
        outputs: { 'h-out': value },
      };
    }
    // 3. graphNode 表層欄位與 Handles 預初始化
    else if (nodeSpec.type === 'graphNode') {
      const formula = String(cfg.formula || '');
      extraData = {
        formula,
        label: String(cfg.label || nodeSpec.name || 'Graph'),
        nodeName: String(cfg.label || nodeSpec.name || 'Graph'),
        handles: [{ id: 'h-fn-in', type: 'input', position: 'left', offset: 50, label: 'f(x)' }],
      };
    }
    // 4. textNode 表層欄位預初始化
    else if (nodeSpec.type === 'textNode') {
      const text = String(cfg.text || '');
      extraData = {
        text,
        label: String(cfg.label || nodeSpec.name || 'Notebook'),
        nodeName: String(cfg.label || nodeSpec.name || 'Notebook'),
        handles: [],
      };
    }
    // 5. inputNode 介面輸入節點
    else if (nodeSpec.type === 'inputNode') {
      const nodeName = String(cfg.nodeName || cfg.label || nodeSpec.name || 'input_1');
      const variant = (cfg.variant as WorkflowPortDataType) || 'real';
      const value = String(cfg.value ?? '');
      extraData = {
        nodeName,
        label: nodeName,
        variant,
        value,
        handles: [{ id: 'out', type: 'output', position: 'right', offset: 50, label: nodeName }],
        outputs: { out: value },
      };
    }
    // 6. outputNode 介面輸出節點
    else if (nodeSpec.type === 'outputNode') {
      const nodeName = String(cfg.nodeName || cfg.label || nodeSpec.name || 'output_1');
      const variant = (cfg.variant as WorkflowPortDataType) || 'real';
      extraData = {
        nodeName,
        label: nodeName,
        variant,
        handles: [{ id: 'in', type: 'input', position: 'left', offset: 50, label: nodeName }],
      };
    }
    // 7. codeNode 程式碼節點
    else if (nodeSpec.type === 'codeNode') {
      const code = String(cfg.code || 'return inputs.input;');
      extraData = {
        code,
        label: String(cfg.label || nodeSpec.name || 'Code'),
        nodeName: String(cfg.label || nodeSpec.name || 'Code'),
        handles: [
          { id: 'h-in', type: 'input', position: 'left', offset: 50, label: 'input' },
          { id: 'h-result', type: 'output', position: 'right', offset: 35, label: 'result' }
        ],
      };
    }
    // 8. communityTemplateNode 社群範本節點
    else if (nodeSpec.type === 'communityTemplateNode') {
      const templateId = typeof cfg.templateId === 'string' ? cfg.templateId : nodeSpec.id;
      const template = templatesPool.find(t => t.id === templateId) || getCommunityTemplateById(templateId);

      if (template) {
        const defaultFields = Object.fromEntries(
          template.fields.map(f => [f.id, f.defaultValue ?? ''])
        );
        const userFields = (cfg.templateFields && typeof cfg.templateFields === 'object')
          ? (cfg.templateFields as Record<string, string>)
          : {};
        const mergedFields = { ...defaultFields, ...userFields };

        // 將表層欄位文字同步回 builderBlocks，讓卡片即時顯示 AI 生成的文句
        const updatedBlocks = template.builderBlocks.map(block => {
          if (block.kind === 'text' || block.kind === 'math') {
            const matchingVal = mergedFields[block.id] ||
              (block.id === 'def-text' ? mergedFields.statement : undefined) ||
              (block.id === 'method-text' ? mergedFields.problem : undefined);
            if (matchingVal) {
              return { ...block, content: matchingVal, contentI18n: undefined };
            }
          }
          return block;
        });

        const updatedTemplate: CommunityNodeTemplate = {
          ...template,
          builderBlocks: updatedBlocks,
        };

        extraData = {
          templateId: template.id,
          templateDraft: updatedTemplate,
          templateFields: mergedFields,
          templateSummary: template.summary,
          templateBestAlgorithm: template.bestAlgorithm,
          templateAlternatives: template.alternativeAlgorithms,
          templateRelatedWorkflowIds: template.relatedWorkflowIds,
          sourceWorkflowId: template.sourceWorkflowId,
          sourceWorkflowVersionId: template.sourceWorkflowVersionId,
          sourceWorkflowSlug: template.sourceWorkflowSlug,
          handles: getTemplateHandles(template).map(handle => ({
            id: handle.id,
            type: handle.type,
            position: handle.position,
            offset: handle.offset,
            label: handle.label,
          })),
        };
        customStyle = {
          width: template.size.width,
          height: template.size.height,
        };
      }
    }

    return {
      id: nodeSpec.id,
      type: nodeSpec.type,
      position,
      style: customStyle,
      data: {
        label: (extraData.templateDraft as CommunityNodeTemplate | undefined)?.title || (cfg.label as string | undefined) || nodeSpec.name,
        nodeName: (extraData.templateDraft as CommunityNodeTemplate | undefined)?.title || (cfg.nodeName as string | undefined) || (cfg.label as string | undefined) || nodeSpec.name,
        description: nodeSpec.description,
        ...cfg,
        ...extraData,
        // 若為 dummyNode，帶入預期合約
        expectedInputs: Array.isArray(cfg.expectedInputs)
          ? (cfg.expectedInputs as Array<{ id?: string; name?: string }>).map((i, idx) => ({
              id: String(i.id || `in_${idx}`),
              name: String(i.name || i.id || `in_${idx}`),
              dataType: 'any' as const,
            }))
          : undefined,
        expectedOutputs: Array.isArray(cfg.expectedOutputs)
          ? (cfg.expectedOutputs as Array<{ id?: string; name?: string }>).map((o, idx) => ({
              id: String(o.id || `out_${idx}`),
              name: String(o.name || o.id || `out_${idx}`),
              dataType: 'any' as const,
            }))
          : undefined,
      },
    };
  });

  const nodeSpecMap = new Map(spec.nodes.map(n => [n.id, n]));

  const edges: Edge[] = spec.edges.map((edgeSpec, idx) => {
    const edgeId = edgeSpec.id || `edge-${edgeSpec.from}-${edgeSpec.to}-${idx}`;
    const fromNode = nodeSpecMap.get(edgeSpec.from);
    const toNode = nodeSpecMap.get(edgeSpec.to);

    let fromPort = edgeSpec.fromPort;
    let toPort = edgeSpec.toPort;

    // 來源端點正規化 (Source Handle Normalization)
    if (fromNode?.type === 'sliderNode' || fromNode?.type === 'calculateNode') {
      fromPort = 'h-out';
    } else if (fromNode?.type === 'inputNode') {
      if (!fromPort || fromPort === 'value') fromPort = 'out';
    } else if (fromNode?.type === 'codeNode') {
      if (!fromPort || fromPort === 'value' || fromPort === 'out') fromPort = 'h-result';
    }

    // 目標端點正規化 (Target Handle Normalization)
    if (toNode?.type === 'outputNode') {
      if (!toPort || toPort === 'value') toPort = 'in';
    } else if (toNode?.type === 'graphNode') {
      if (!toPort || toPort === 'value' || toPort === 'fn' || toPort === 'in') toPort = 'h-fn-in';
    } else if (toNode?.type === 'calculateNode') {
      if (!toPort || toPort === 'value' || toPort === 'in' || toPort === 'fn') {
        toPort = 'h-fn-in';
      } else if (!toPort.startsWith('h-in-') && toPort !== 'h-fn-in') {
        toPort = `h-in-${toPort}`;
      }
    } else if (toNode?.type === 'codeNode') {
      if (!toPort || toPort === 'value') toPort = 'h-in';
    }

    return {
      id: edgeId,
      source: edgeSpec.from,
      target: edgeSpec.to,
      sourceHandle: fromPort || 'value',
      targetHandle: toPort || 'value',
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
