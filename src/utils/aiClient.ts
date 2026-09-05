import type { WorkflowSpec, WorkflowNodeSpec, WorkflowEdgeSpec } from '../types/workflowSpec';
import type { CommunityNodeTemplate } from '../community/types';
import { defaultCommunityTemplates } from '../community/catalog';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent';
const GEMINI_FALLBACK_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent';
const STORAGE_KEY = 'methmatica_gemini_api_key';

export function getStoredApiKey(): string {
  if (typeof window === 'undefined') return '';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && stored.trim()) return stored.trim();
  const envKey = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_GEMINI_API_KEY;
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
 * 將社群節點目錄精簡格式化為 LLM 理解的 Schema
 */
export function formatCommunityCatalogForPrompt(templates: CommunityNodeTemplate[]): string {
  if (!templates || templates.length === 0) return '';

  const lines = templates.map(t => {
    const inPorts = (t.inputs || []).map(i => `"${i.id}" (${i.label || i.id})`).join(', ') || 'none';
    const outPorts = (t.outputs || []).map(o => `"${o.id}" (${o.label || o.id})`).join(', ') || 'none';

    return `- Template ID: "${t.id}"
  - Title: "${t.title}"
  - Category: "${t.category || 'Community'}"
  - Summary: "${t.summary || ''}"
  - Target Handles (Inputs): [${inPorts}]
  - Source Handles (Outputs): [${outPorts}]`;
  });

  return `### 3. EXISTING COMMUNITY NODE CATALOG (STRICT DEPENDENCY INVOCATION ONLY):
The catalog below lists published, pre-built community nodes.
STRICT INVOCATION POLICY:
- ONLY invoke a community node if the user's request explicitly matches its specific purpose and pre-packaged domain function.
- NEVER instantiate community nodes to invent or fake generic notes, definitions, or algorithms. For general explanations or notes, you MUST use "textNode".
- When invoking an existing community node, specify "type": "communityTemplateNode" and provide in "config":
  {
    "templateId": "<exact Template ID from catalog>",
    "label": "<title>"
  }
- Wire ONLY to its declared Target Handles (Inputs) and Source Handles (Outputs). Never hallucinate ports or overwrite internal structures.
- If no existing community node precisely fits the user's task, DO NOT use this section; construct the workflow using primitive nodes and textNode instead.

Registered Community Nodes:
${lines.join('\n\n')}`;
}

/**
 * 動態系統提示詞：向 LLM 注入 Methmetica 的原生節點、社群節點與 WorkflowSpec 規範
 */
export function buildSystemInstruction(communityTemplates?: CommunityNodeTemplate[]): string {
  const templates = communityTemplates && communityTemplates.length > 0
    ? communityTemplates
    : defaultCommunityTemplates;

  const communitySection = formatCommunityCatalogForPrompt(templates);

  return `You are Methmetica AI, an expert mathematical workflow compiler.
Your task is to convert user's mathematical or algorithmic requests into a strictly valid, runnable Directed Acyclic Graph (DAG) specified in Methmetica WorkflowSpec (schemaVersion: 2).

### 1. THREE-ZONE ARCHITECTURAL PATTERN (MUST COMPLY):
Every generated workflow MUST be clearly structured into THREE DISTINCT FUNCTIONAL ZONES:
- 【1. 說明區 (Explanation & Knowledge Zone)】:
  - Purpose: Provide mathematical background, theorem statements, problem definitions, or operation instructions.
  - Primary Node:
    - "textNode": (MANDATORY for explanation) Use rich Markdown and LaTeX (e.g. "$$\\Delta = b^2 - 4ac$$") explaining the underlying theory.
    - NEVER instantiate fake community templates for explanation.
- 【2. 互動區 (Interactive Parameter Control Zone)】:
  - Purpose: Provide dynamic UI controllers allowing users to adjust variables in real-time.
  - Primary Nodes:
    - "sliderNode": For continuous or stepped numerical parameters (e.g. coefficients $a, b, c$; radius $r$; frequency $f$; angle $\\theta$). Always configure meaningful nodeName, min, max, step, and value.
- 【3. 節點輸入輸出定義區 (Computation, Interface & Result Zone)】:
  - Purpose: Execute symbolic calculations, define formal workflow I/O contracts, and visualize results.
  - Primary Nodes:
    - "inputNode" / "outputNode": Explicit workflow interface contract ports.
    - "calculateNode": Symbolic mathematical expression evaluations (formula).
    - "codeNode": Multi-step algorithmic logic.
    - "graphNode": 2D/3D visual curve plotting connected downstream.
    - "communityTemplateNode": ONLY if a pre-existing community node in the catalog directly performs this exact computation or procedure.
    - "dummyNode": For missing algorithmic sub-procedures needing recursive decomposition.

### 2. AVAILABLE PRIMITIVE NODES (AND THEIR SURFACE EDITABLE FIELDS):
Every node has surface fields that you MUST fill in "config":

- "calculateNode": Mathematical expression evaluator.
  - Surface Fields in config:
    - "formula": (string, REQUIRED) Standard LaTeX mathematical expression without outer $ delimiters (e.g. "b^2 - 4ac" or "b^2 - 4\\cdot a\\cdot c", "x^2 + 2x + 1", "\\sqrt{a^2 + b^2}", "A\\cdot \\sin(2\\pi f t)"). Avoid programming-style asterisks '*' for multiplication; use standard LaTeX concatenation or '\\cdot'.
    - "label": (string) Header title (e.g. "判別式計算").
  - Handles:
    - Target (Input) Handles: Automatically derived from variables in "formula" with format "h-in-<var>" (e.g. "h-in-a", "h-in-b", "h-in-c"). You may specify "toPort": "h-in-a" or simply "toPort": "a". NOTE: In standard mathematical expressions like "b^2 - 4ac", 'a' and 'c' are separate multiplied variables (4 * a * c); provide distinct sliderNodes for 'a' and 'c' and wire them to "h-in-a" and "h-in-c" respectively. Never treat "ac" as a single variable.
    - External Formula Target Handle: "h-fn-in" (used when formula itself is wired dynamically from upstream).
    - Source (Output) Handle: "h-out" (emits the evaluated result).
  - Config example: { "label": "判別式運算", "formula": "b^2 - 4ac" }

- "sliderNode": Dynamic numeric slider controller for parameters.
  - Surface Fields in config:
    - "nodeName": (string, REQUIRED) Variable symbol displayed on slider (e.g. "a", "b", "x", "radius").
    - "value": (number, REQUIRED) Default initial value (e.g. 5, 2.5).
    - "min": (number) Minimum slider limit (e.g. 0 or -10).
    - "max": (number) Maximum slider limit (e.g. 10 or 100).
    - "step": (number) Step increment (e.g. 1 or 0.1).
    - "label": (string) Optional title.
  - Handles:
    - Source (Output) Handle: "h-out" (emits the slider numeric value).
  - Config example: { "nodeName": "a", "value": 3, "min": 0, "max": 10, "step": 0.5, "label": "參數 a" }

- "graphNode": 2D/3D function plotter.
  - Surface Fields in config:
    - "formula": (string) Fallback or direct function to plot (e.g. "x^2 - 4", "\\sin(x)").
    - "label": (string) Graph title (e.g. "拋物線函數圖").
  - Handles:
    - Target (Input) Handle: "h-fn-in" (receives formula or value from upstream calculateNode).
  - Config example: { "label": "函數圖表", "formula": "x^2" }

- "textNode": Rich Markdown & LaTeX note card.
  - Surface Fields in config:
    - "text": (string, REQUIRED) Explanatory markdown or LaTeX notes for the user.
    - "label": (string) Card title (e.g. "步驟說明").
  - Handles: Target "h-in", Source "h-out" (optional).
  - Config example: { "label": "說明筆記", "text": "### 二次方程式判別式\\n若 $\\Delta > 0$，方程式有兩相異實根。" }

- "codeNode": JavaScript/Python multi-line execution script.
  - Surface Fields in config:
    - "code": (string, REQUIRED) The script code (e.g. "return inputs.a * inputs.b;").
    - "label": (string) Node title.
  - Handles: Target custom inputs, Source "h-result".
  - Config example: { "label": "自訂邏輯", "code": "return inputs.a * inputs.b;" }

- "inputNode": Sources an input variable or parameter for the whole workflow.
  - Surface Fields in config:
    - "nodeName": (string, REQUIRED) Parameter port name (e.g. "radius", "x").
    - "variant": (string) Data type: "real" | "integer" | "boolean" | "string" | "matrix" | "vector" | "latex".
    - "value": (string) Default initial value.
  - Handles: Source "out".
  - Config example: { "nodeName": "radius", "variant": "real", "value": "5" }

- "outputNode": Sinks the final result to display as the workflow output.
  - Surface Fields in config:
    - "nodeName": (string, REQUIRED) Result port name (e.g. "area", "discriminant").
    - "variant": (string) Data type.
  - Handles: Target "in".
  - Config example: { "nodeName": "area", "variant": "real" }

- "dummyNode": Used for modular encapsulation or sub-procedures.
  - TRIGGER CONDITIONS (CRITICAL):
    1. The user explicitly requests a modularized or separate sub-node (e.g. "另外做一個節點", "包裝成獨立節點", "將XX單獨做一個節點", "做成子工作流"). Even if the formula is simple enough for calculateNode (such as "餘弦定理請另外做一個節點" or "畢氏定理單獨封裝"), you MUST use "dummyNode" to represent that modular component so the system can automatically build its manufacturing subgraph.
    2. The user requires an algorithm/sub-procedure that does not exist in primitives or community nodes (e.g. "求質數表", "快速傅立葉變換(FFT)", "矩陣求逆").
  - Config: {
      "label": "<Algorithm/Node Name>",
      "description": "<Goal and mathematical context of this block>",
      "expectedInputs": [{ "id": "<id>", "name": "<name>" }],
      "expectedOutputs": [{ "id": "<id>", "name": "<name>" }]
    }

${communitySection ? communitySection + '\n\n' : ''}### ${communitySection ? '4' : '3'}. GRAPH & CONNECTION RULES:
- The graph MUST be a valid DAG (Directed Acyclic Graph). NEVER create cycles.
- Signal flows strictly from left to right: Explanation/Inputs/Sliders -> Calculations/Dummies/CommunityNodes -> Outputs/Graphs.
- All edge 'from' and 'to' must reference valid node ids defined in 'nodes'.
- Port Handle Rules:
  - From sliderNode: "fromPort": "h-out"
  - From calculateNode: "fromPort": "h-out"
  - From inputNode: "fromPort": "out"
  - To calculateNode: "toPort": "h-in-<var>" (e.g. "h-in-a", "h-in-b") or simply "<var>" (e.g. "a", "b"). Or "h-fn-in" for external function.
  - To graphNode: "toPort": "h-fn-in"
  - To outputNode: "toPort": "in"
  - Community nodes: use the declared handles in the template catalog (e.g. "in-context", "out-summary", "in-data", "out-method").

### ${communitySection ? '5' : '4'}. OUTPUT FORMAT:
You MUST reply ONLY with a single valid JSON object strictly matching this schema. The nodes array MUST embody the Three-Zone pattern:
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
      "id": "node-doc",
      "type": "textNode",
      "name": "定理說明",
      "description": "說明區：介紹數學定理背景與公式",
      "config": { "label": "定理說明", "text": "### 一元二次方程式判別式\\n對於 $ax^2 + bx + c = 0$，判別式為 $\\Delta = b^2 - 4ac$。\\n- $\\Delta > 0$: 兩相異實根\\n- $\\Delta = 0$: 兩重根\\n- $\\Delta < 0$: 兩共軛虛根" }
    },
    {
      "id": "node-slider-b",
      "type": "sliderNode",
      "name": "b",
      "description": "互動區：一次項係數 b",
      "config": { "nodeName": "b", "value": 4, "min": -10, "max": 10, "step": 0.5, "label": "係數 b" }
    },
    {
      "id": "node-slider-a",
      "type": "sliderNode",
      "name": "a",
      "description": "互動區：二次項係數 a",
      "config": { "nodeName": "a", "value": 1, "min": -10, "max": 10, "step": 0.5, "label": "係數 a" }
    },
    {
      "id": "node-slider-c",
      "type": "sliderNode",
      "name": "c",
      "description": "互動區：常數項係數 c",
      "config": { "nodeName": "c", "value": 2, "min": -10, "max": 10, "step": 0.5, "label": "係數 c" }
    },
    {
      "id": "node-calc-d",
      "type": "calculateNode",
      "name": "判別式計算",
      "description": "運算區：計算判別式",
      "config": { "formula": "b^2 - 4ac", "label": "判別式運算" }
    },
    {
      "id": "node-out-d",
      "type": "outputNode",
      "name": "discriminant",
      "description": "定義區：輸出最終判別式結果",
      "config": { "nodeName": "discriminant", "variant": "real", "label": "判別式結果" }
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "from": "node-slider-b",
      "fromPort": "h-out",
      "to": "node-calc-d",
      "toPort": "h-in-b"
    },
    {
      "id": "edge-2",
      "from": "node-slider-a",
      "fromPort": "h-out",
      "to": "node-calc-d",
      "toPort": "h-in-a"
    },
    {
      "id": "edge-3",
      "from": "node-slider-c",
      "fromPort": "h-out",
      "to": "node-calc-d",
      "toPort": "h-in-c"
    },
    {
      "id": "edge-4",
      "from": "node-calc-d",
      "fromPort": "h-out",
      "to": "node-out-d",
      "toPort": "in"
    }
  ]
}
Do NOT wrap with markdown backticks or explanation. Just raw JSON.`;
}

/**
 * 嚴格驗證與修復中繼器：修復 Handle 不匹配、孤兒連線與環路
 */
export function sanitizeWorkflowSpec(raw: unknown): WorkflowSpec {
  if (!raw || typeof raw !== 'object') {
    throw new Error('LLM 回傳的資料不是有效的 JSON 物件');
  }

  const rawObj = raw as Record<string, unknown>;

  const spec: WorkflowSpec = {
    schemaVersion: 2,
    id: typeof rawObj.id === 'string' ? rawObj.id : `workflow-${Date.now()}`,
    name: typeof rawObj.name === 'string' ? rawObj.name : 'AI 生成工作流',
    description: typeof rawObj.description === 'string' ? rawObj.description : '',
    version: '1.0.0',
    visibility: 'private',
    publishKind: 'workflow',
    inputs: Array.isArray(rawObj.inputs) ? (rawObj.inputs as WorkflowSpec['inputs']) : [],
    outputs: Array.isArray(rawObj.outputs) ? (rawObj.outputs as WorkflowSpec['outputs']) : [],
    nodes: [],
    edges: [],
  };

  const nodeMap = new Map<string, WorkflowNodeSpec>();

  if (Array.isArray(rawObj.nodes)) {
    rawObj.nodes.forEach((nItem: unknown, idx: number) => {
      if (!nItem || typeof nItem !== 'object') return;
      const n = nItem as Record<string, unknown>;
      const id = String(n.id || `node-${idx + 1}`);
      const type = String(n.type || 'calculateNode');
      const validTypes = [
        'inputNode', 'outputNode', 'calculateNode', 'sliderNode',
        'graphNode', 'textNode', 'codeNode', 'dummyNode', 'compositeWorkflowNode',
        'communityTemplateNode'
      ];
      const safeType = validTypes.includes(type) ? type : 'calculateNode';
      const configObj = (n.config && typeof n.config === 'object') ? (n.config as Record<string, unknown>) : {};

      const nodeSpec: WorkflowNodeSpec = {
        id,
        type: safeType,
        name: String(n.name || configObj.label || id),
        description: n.description ? String(n.description) : undefined,
        config: configObj,
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

  if (Array.isArray(rawObj.edges)) {
    rawObj.edges.forEach((eItem: unknown, idx: number) => {
      if (!eItem || typeof eItem !== 'object') return;
      const e = eItem as Record<string, unknown>;
      const from = String(e.from);
      const to = String(e.to);

      if (!nodeMap.has(from) || !nodeMap.has(to) || from === to) return;

      adjacency.get(from)!.push(to);

      const fromNode = nodeMap.get(from)!;
      const toNode = nodeMap.get(to)!;

      // 自動修復與正規化合法 Handle
      let fromPort = typeof e.fromPort === 'string' ? e.fromPort : undefined;
      let toPort = typeof e.toPort === 'string' ? e.toPort : undefined;

      // 來源端點正規化 (Source Handle Normalization)
      if (fromNode.type === 'sliderNode') {
        fromPort = 'h-out';
      } else if (fromNode.type === 'calculateNode') {
        fromPort = 'h-out';
      } else if (fromNode.type === 'inputNode') {
        if (!fromPort || fromPort === 'value') fromPort = 'out';
      } else if (fromNode.type === 'codeNode') {
        if (!fromPort || fromPort === 'value' || fromPort === 'out') fromPort = 'h-result';
      }

      // 目標端點正規化 (Target Handle Normalization)
      if (toNode.type === 'outputNode') {
        if (!toPort || toPort === 'value') toPort = 'in';
      } else if (toNode.type === 'graphNode') {
        if (!toPort || toPort === 'value' || toPort === 'fn' || toPort === 'in') toPort = 'h-fn-in';
      } else if (toNode.type === 'calculateNode') {
        if (!toPort || toPort === 'value' || toPort === 'in' || toPort === 'fn') {
          toPort = 'h-fn-in';
        } else if (!toPort.startsWith('h-in-') && toPort !== 'h-fn-in') {
          toPort = `h-in-${toPort}`;
        }
      } else if (toNode.type === 'codeNode') {
        if (!toPort || toPort === 'value') toPort = 'h-in';
      }

      sanitizedEdges.push({
        id: typeof e.id === 'string' ? e.id : `edge-${from}-${to}-${idx}`,
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
  apiKeyOverride?: string,
  availableCommunityTemplates?: CommunityNodeTemplate[]
): Promise<WorkflowSpec> {
  const apiKey = (apiKeyOverride || getStoredApiKey()).trim();
  if (!apiKey) {
    throw new Error('未提供 Google Gemini API Key。請先在輸入視窗中填寫您的 API Key。');
  }

  const systemPrompt = buildSystemInstruction(availableCommunityTemplates);

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }],
      },
    ],
    systemInstruction: {
      parts: [{ text: systemPrompt }],
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
      } catch {
        // ignore parse error
      }
      throw new Error(`Gemini API 請求失敗 (${response.status}): ${parsedMsg}`);
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error('Gemini API 未回傳有效的內容');
    }

    let parsedSpec: unknown;
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
    console.warn('[AI] gemini-3.6-flash failed, trying fallback gemini-3.5-flash...', err);
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
  apiKeyOverride?: string,
  availableCommunityTemplates?: CommunityNodeTemplate[]
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

請產生一個完整的子工作流，務必包含：
1. 一個 "textNode"（筆記說明節點），詳細說明此演算法的數學原理、步驟流程與公式推導，方便使用者閱讀與維護。
2. 對應的 "inputNode" 接收輸入參數。
3. 具體的運算節點（如 "calculateNode" 符號公式或 "codeNode" 演算法腳本）。
4. 對應的 "outputNode" 匯出最終結果。
確保所有端點 id 與連線完全正確。`;

  return await callGeminiGenerateWorkflow(prompt, apiKeyOverride, availableCommunityTemplates);
}
