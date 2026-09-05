export type WorkflowPortDataType = 
  | 'real' 
  | 'integer' 
  | 'boolean' 
  | 'string' 
  | 'matrix' 
  | 'vector' 
  | 'latex' 
  | 'svg' 
  | 'any'
  | `[${string}]`; // 陣列型別，如 [real]

export interface WorkflowPortSpec {
  id: string; // 內部 Handle ID 或 Port 鍵名，例如 "x", "radius"
  name: string; // 顯示名稱
  dataType: WorkflowPortDataType;
  defaultValue?: unknown;
  description?: string;
  required?: boolean;
}

// 宣告式 UI 元件規格 (4 種標準元件)
export type WorkflowUIComponentSpec = 
  | {
      type: 'slider';
      id: string;
      label?: string;
      bindInput: string; // 綁定的內部 InputNode id 或 port 名稱
      min: number;
      max: number;
      step?: number;
      defaultValue?: number;
    }
  | {
      type: 'latexInput';
      id: string;
      label?: string;
      bindInput: string; // 綁定的內部 InputNode id
      defaultValue?: string;
      placeholder?: string;
    }
  | {
      type: 'svgPicture';
      id: string;
      label?: string;
      bindOutput: string; // 綁定的內部 OutputNode id 或運算結果鍵
      width?: number;
      height?: number;
      viewBox?: string;
    }
  | {
      type: 'text';
      id: string;
      content: string;
      isMarkdown?: boolean;
    };

// 工作流內的單一節點規格
export interface WorkflowNodeSpec {
  id: string;
  type: string; // 'input' | 'output' | 'dummy' | 'math' | 'code' | 'textNode' | 'sliderNode' | 自訂 workflow id
  name: string;
  description?: string;
  config?: Record<string, unknown>;
  position?: { x: number; y: number };
}

// 連線規格
export interface WorkflowEdgeSpec {
  id?: string;
  from: string; // 來源節點 ID
  fromPort?: string; // 來源輸出 Port (若單一輸出可省略)
  to: string; // 目標節點 ID
  toPort?: string; // 目標輸入 Port
}

// 頂層 AI 原生工作流規格 (schemaVersion: 2)
export interface WorkflowSpec {
  schemaVersion: 2;
  id: string;
  name: string;
  description: string;
  version: string;
  author?: {
    id?: string;
    name: string;
  };
  tags?: string[];
  visibility?: 'private' | 'public' | 'core';
  publishKind?: 'workflow' | 'node'; // 作為獨立工作流還是自訂節點

  // 對外介面合約（由內部的 input/output 節點推導，或 AI 聲明）
  inputs: WorkflowPortSpec[];
  outputs: WorkflowPortSpec[];

  // 內部拓撲架構
  nodes: WorkflowNodeSpec[];
  edges: WorkflowEdgeSpec[];

  // 節點本體的宣告式互動卡片
  ui?: WorkflowUIComponentSpec[];
}

/**
 * 依據工作流內部的節點陣列，自動推導對外的介面合約 (Inputs & Outputs)
 */
export function deriveInterfaceFromNodes(nodes: Array<{ id: string; type?: string; data?: Record<string, unknown> }>): {
  inputs: WorkflowPortSpec[];
  outputs: WorkflowPortSpec[];
} {
  const inputs: WorkflowPortSpec[] = [];
  const outputs: WorkflowPortSpec[] = [];

  nodes.forEach(node => {
    if (node.type === 'inputNode' || node.type === 'input') {
      const portName = String(node.data?.portName || node.data?.label || node.id);
      inputs.push({
        id: node.id,
        name: portName,
        dataType: (node.data?.dataType as WorkflowPortDataType) || 'real',
        defaultValue: node.data?.defaultValue ?? node.data?.value,
        description: String(node.data?.description || ''),
        required: typeof node.data?.required === 'boolean' ? node.data.required : true,
      });
    } else if (node.type === 'outputNode' || node.type === 'output') {
      const portName = String(node.data?.portName || node.data?.label || node.id);
      outputs.push({
        id: node.id,
        name: portName,
        dataType: (node.data?.dataType as WorkflowPortDataType) || 'real',
        description: String(node.data?.description || ''),
      });
    }
  });

  return { inputs, outputs };
}
