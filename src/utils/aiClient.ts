import type { WorkflowSpec, WorkflowNodeSpec, WorkflowEdgeSpec } from '../types/workflowSpec';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const GEMINI_FALLBACK_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
const STORAGE_KEY = 'methmatica_gemini_api_key';

export function getStoredApiKey(): string {
  if (typeof window === 'undefined') return '';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && stored.trim()) return stored.trim();
  const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
  if (typeof envKey === 'string' && envKey.trim()) return envKey.trim();
  return '';
}

export function setStoredApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  if (key.trim()) {
    localStorage.setItem(STORAGE_KEY, key.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

/**
 * 系統提示詞：向 LLM 注入 Methmetica 的節點合約與 WorkflowSpec 規範
 */
const SYSTEM_INSTRUCTION = `You are Methmetica AI, an expert mathematical workflow compiler.
Your task is to convert user's mathematical or algorithmic requests into a strictly valid, runnable Directed Acyclic Graph (DAG) specified in Methmetica WorkflowSpec (schemaVersion: 2).

### 1. AVAILABLE PRIMITIVE NODES:
- "inputNode": Sources an input variable or parameter.
  - Source handles: "out"
  - Config: { "label": "<varName>", "nodeName": "<varName>", "value": "<defaultVal>" }
- "outputNode": Sinks the final result to display.
  - Target handles: "in"
  - Config: { "label": "<resName>", "nodeName": "<resName>" }
- "calculateNode": Mathematical expression evaluator.
  - Target handles: "h-fn-in" (formula or primary input), or variable names like "x", "y", "a", "b", "c".
  - Source handles: "value" (or "out")
  - Config: { "label": "<desc>", "formulaInput": "<expression e.g. b^2 - 4*a*c>" }
- "sliderNode": Dynamic numeric slider controller.
  - Source handles: "out" (or "value")
  - Config: { "label": "<name>", "min": 0, "max": 100, "step": 1, "value": 10 }
- "graphNode": 2D function plotter.
  - Target handles: "h-fn-in"
  - Config: { "label": "函數圖表" }
- "textNode": Markdown note or annotation.
  - Config: { "label": "說明", "text": "Markdown content" }
- "codeNode": JavaScript/Python multi-line code executor.
  - Target handles: custom input names
  - Source handles: "h-result" or custom output names
  - Config: { "label": "Code", "code": "..." }
- "dummyNode": MUST be used when the user requires an algorithm/sub-procedure that does not exist in the primitives (e.g. "求質數表", "傅立葉變換", "矩陣求逆").
  - Config: {
      "label": "<Algorithm Name>",
      "description": "<Goal of this missing block>",
      "expectedInputs": [{ "id": "<id>", "name": "<name>" }],
      "expectedOutputs": [{ "id": "<id>", "name": "<name>" }]
    }

### 2. GRAPH RULES:
- The graph MUST be a valid DAG (Directed Acyclic Graph). NEVER create cycles.
- Signal flows strictly from left to right: Inputs/Sliders -> Calculations/Dummies -> Outputs/Graphs.
- All edge 'from' and 'to' must reference valid node ids defined in 'nodes'.
- 'fromPort' and 'toPort' must match valid handles (e.g. 'out', 'in', 'value', 'h-fn-in').

### 3. OUTPUT FORMAT:
You MUST reply ONLY with a single valid JSON object strictly matching this schema:
{
  "schemaVersion": 2,
  "id": "workflow-<timestamp>",
  "name": "<Clear Workflow Title>",
  "description": "<Concise summary of what this workflow computes>",
  "version": "1.0.0",
  "visibility": "private",
  "inputs": [{ "id": "<id>", "name": "<name>", "dataType": "real" }],
  "outputs": [{ "id": "<id>", "name": "<name>", "dataType": "real" }],
  "nodes": [
    {
      "id": "node-1",
      "type": "inputNode",
      "name": "...",
      "description": "...",
      "config": { ... }
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "from": "node-1",
      "fromPort": "out",
      "to": "node-2",
      "toPort": "h-fn-in"
    }
  ]
}
Do NOT wrap with markdown backticks or explanation. Just raw JSON.`;

/**
 * 嚴格驗證與修復中繼器：修復 Handle 不匹配、孤兒連線與環路
 */
export function sanitizeWorkflowSpec(raw: any): WorkflowSpec {
  if (!raw || typeof raw !== 'object') {
    throw new Error('LLM 回傳的資料不是有效的 JSON 物件');
  }

  const spec: WorkflowSpec = {
    schemaVersion: 2,
    id: typeof raw.id === 'string' ? raw.id : `workflow-${Date.now()}`,
    name: typeof raw.name === 'string' ? raw.name : 'AI 生成工作流',
    description: typeof raw.description === 'string' ? raw.description : '',
    version: '1.0.0',
    visibility: 'private',
    publishKind: 'workflow',
    inputs: Array.isArray(raw.inputs) ? raw.inputs : [],
    outputs: Array.isArray(raw.outputs) ? raw.outputs : [],
    nodes: [],
    edges: [],
  };

  const nodeMap = new Map<string, WorkflowNodeSpec>();

  if (Array.isArray(raw.nodes)) {
    raw.nodes.forEach((n: any, idx: number) => {
      if (!n || typeof n !== 'object') return;
      const id = String(n.id || `node-${idx + 1}`);
      const type = String(n.type || 'calculateNode');
      const validTypes = [
        'inputNode', 'outputNode', 'calculateNode', 'sliderNode',
        'graphNode', 'textNode', 'codeNode', 'dummyNode', 'compositeWorkflowNode'
      ];
      const safeType = validTypes.includes(type) ? type : 'calculateNode';

      const nodeSpec: WorkflowNodeSpec = {
        id,
        type: safeType,
        name: String(n.name || n.config?.label || id),
        description: n.description ? String(n.description) : undefined,
        config: typeof n.config === 'object' && n.config !== null ? n.config : {},
      };

      nodeMap.set(id, nodeSpec);
      spec.nodes.push(nodeSpec);
    });
  }

  if (spec.nodes.length === 0) {
    throw new Error('AI 未能產生任何有效的節點');
  }

  // 檢查連線合規性
  const sanitizedEdges: WorkflowEdgeSpec[] = [];
  const adjacency = new Map<string, string[]>();
  spec.nodes.forEach(n => adjacency.set(n.id, []));

  if (Array.isArray(raw.edges)) {
    raw.edges.forEach((e: any, idx: number) => {
      if (!e || typeof e !== 'object') return;
      const from = String(e.from);
      const to = String(e.to);

      if (!nodeMap.has(from) || !nodeMap.has(to) || from === to) return;

      adjacency.get(from)!.push(to);

      const fromNode = nodeMap.get(from)!;
      const toNode = nodeMap.get(to)!;

      // 自動修復合法 Handle
      let fromPort = e.fromPort;
      let toPort = e.toPort;

      if (fromNode.type === 'inputNode') fromPort = 'out';
      if (toNode.type === 'outputNode') toPort = 'in';
      if (fromNode.type === 'calculateNode' && !fromPort) fromPort = 'value';
      if (toNode.type === 'calculateNode' && !toPort) toPort = 'h-fn-in';

      sanitizedEdges.push({
        id: e.id || `edge-${from}-${to}-${idx}`,
        from,
        to,
        fromPort,
        toPort,
      });
    });
  }

  spec.edges = sanitizedEdges;
  return spec;
}

/**
 * 呼叫 Gemini API 生成工作流
 */
export async function callGeminiGenerateWorkflow(
  userPrompt: string,
  apiKeyOverride?: string
): Promise<WorkflowSpec> {
  const apiKey = (apiKeyOverride || getStoredApiKey()).trim();
  if (!apiKey) {
    throw new Error('未提供 Google Gemini API Key。請先在輸入視窗中填寫您的 API Key。');
  }

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }],
      },
    ],
    systemInstruction: {
      parts: [{ text: SYSTEM_INSTRUCTION }],
    },
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
    },
  };

  const executeRequest = async (endpointUrl: string) => {
    const url = `${endpointUrl}?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      let parsedMsg = errText;
      try {
        const errJson = JSON.parse(errText);
        parsedMsg = errJson.error?.message || errText;
      } catch {}
      throw new Error(`Gemini API 請求失敗 (${response.status}): ${parsedMsg}`);
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error('Gemini API 未回傳有效的內容');
    }

    let parsedSpec: any;
    try {
      parsedSpec = JSON.parse(candidateText.trim());
    } catch {
      const cleanJson = candidateText.replace(/^```json/m, '').replace(/```$/m, '').trim();
      parsedSpec = JSON.parse(cleanJson);
    }

    return sanitizeWorkflowSpec(parsedSpec);
  };

  try {
    return await executeRequest(GEMINI_API_URL);
  } catch (err) {
    console.warn('[AI] gemini-2.5-flash failed, trying fallback gemini-1.5-flash...', err);
    return await executeRequest(GEMINI_FALLBACK_URL);
  }
}

/**
 * 二次 Prompt：針對 Dummy 佔位節點生成具體實作的子工作流
 */
export async function callGeminiImplementDummyNode(
  dummyNode: {
    label: string;
    description?: string;
    expectedInputs?: Array<{ id: string; name: string }>;
    expectedOutputs?: Array<{ id: string; name: string }>;
  },
  apiKeyOverride?: string
): Promise<WorkflowSpec> {
  const inputsDesc = (dummyNode.expectedInputs || [])
    .map(i => `${i.name} (id: ${i.id})`)
    .join(', ') || '無特定輸入';
  const outputsDesc = (dummyNode.expectedOutputs || [])
    .map(o => `${o.name} (id: ${o.id})`)
    .join(', ') || '無特定輸出';

  const prompt = `請為以下佔位節點「${dummyNode.label}」實作具體的子工作流：
目標功能：${dummyNode.description || dummyNode.label}
必須滿足的對外接口：
- 輸入端點：${inputsDesc}（子工作流內部必須以對應名稱的 inputNode 承接，handle 為 'out'）
- 輸出端點：${outputsDesc}（子工作流內部必須將最終運算連線至對應名稱的 outputNode，handle 為 'in'）

請產生一個完整的子工作流（包含 inputNode, calculateNode 或 codeNode, outputNode），確保端點 id 完全對齊上述要求。`;

  return await callGeminiGenerateWorkflow(prompt, apiKeyOverride);
}
