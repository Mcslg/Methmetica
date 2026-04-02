import type { CommunityNodeTemplate, CommunityWorkflowCard, WorkflowBlueprint } from './types';

const publicWorkflowCards: CommunityWorkflowCard[] = [
  {
    id: 'workflow-cosine-law',
    slug: 'cosine-law',
    title: '餘弦定理工作流',
    summary: '從幾何觀察、公式建立到代入求邊，整理成可重用的解題路徑。',
    author: 'Methmatica Community',
    difficulty: '中階',
    visibility: 'public',
    tags: ['geometry', 'triangle', 'theorem', 'competitive'],
    updatedAt: '2026-04-02T00:00:00.000Z',
    featuredTemplateIds: ['definition-card', 'method-card', 'workflow-link'],
    nodeCount: 5,
    edgeCount: 5,
    seoTitle: '餘弦定理工作流 | 可引用的數學解題路徑',
    seoDescription: '展示餘弦定理的定義、推導、代入和延伸工作流，適合作為社群可維護的核心節點示例。',
  },
  {
    id: 'workflow-induction',
    slug: 'proof-by-induction',
    title: '數學歸納法模板',
    summary: '把歸納法拆成基底、假設與推論三個明確步驟，方便複用到不同題目。',
    author: 'Methmatica Community',
    difficulty: '中階',
    visibility: 'public',
    tags: ['proof', 'induction', 'template'],
    updatedAt: '2026-04-01T00:00:00.000Z',
    featuredTemplateIds: ['method-card', 'definition-card'],
    nodeCount: 4,
    edgeCount: 3,
    seoTitle: '數學歸納法工作流',
    seoDescription: '適合競賽與教學的歸納法解題骨架，能快速延伸成多個例題版本。',
  },
  {
    id: 'workflow-quadratic',
    slug: 'quadratic-equation',
    title: '二次方程式與判別式',
    summary: '從方程式、根的結構到判別式，整理成可被社群擴充的標準路徑。',
    author: 'Core Editorial',
    difficulty: '基礎',
    visibility: 'core',
    tags: ['algebra', 'quadratic', 'core'],
    updatedAt: '2026-04-02T00:00:00.000Z',
    featuredTemplateIds: ['definition-card', 'method-card'],
    nodeCount: 4,
    edgeCount: 4,
    seoTitle: '二次方程式核心工作流',
    seoDescription: '核心節點示例，展示標準公式、判別式與解題路徑的 canonical 版本。',
  },
];

const defaultNodeTemplates: CommunityNodeTemplate[] = [
  {
    id: 'definition-card',
    title: 'Definition Card',
    summary: '核心定義與前置知識卡，適合放在工作流起點。',
    category: 'Core',
    slug: 'definition-card',
    version: '1.0.0',
    source: 'core',
    visibility: 'core',
    discovery: 'search-only',
    accent: '#4ade80',
    size: { width: 300, height: 240 },
    tags: ['definition', 'core', 'knowledge'],
    fields: [
      { id: 'statement', label: '核心陳述', kind: 'textarea', placeholder: '輸入這個節點要解釋的定義。', defaultValue: '根據核心定義：' },
      { id: 'prerequisite', label: '前置知識', kind: 'text', placeholder: '例如：三角形、向量、代數恆等式' },
      { id: 'notes', label: '教學筆記', kind: 'textarea', placeholder: '補上直觀解釋與常見誤區。' },
    ],
    inputs: [
      { id: 'in-context', label: '上下文', position: 'left', type: 'input', offset: 42 },
    ],
    outputs: [
      { id: 'out-summary', label: '摘要', position: 'right', type: 'output', offset: 42 },
    ],
    bestAlgorithm: '先給出正式定義，再補直觀圖像與一個最小例子。',
    alternativeAlgorithms: ['以反例描述邊界條件', '用題目情境反推定義'],
    tutorialSteps: ['先說這個定義解決什麼問題。', '補上條件與例外。', '連到例題或相鄰節點。'],
    relatedWorkflowIds: ['workflow-quadratic'],
    builderBlocks: [
      { id: 'def-input', kind: 'input', label: 'context', placeholder: '上游概念' },
      { id: 'def-text', kind: 'text', label: '根據核心定義：', content: '在這裡放正式敘述與前置知識。' },
      { id: 'def-output', kind: 'output', label: 'summary' },
    ],
  },
  {
    id: 'method-card',
    title: 'Method Card',
    summary: '把最優算法與替代解法收斂成可重用模板。',
    category: 'Strategy',
    slug: 'method-card',
    version: '1.0.0',
    source: 'community',
    visibility: 'public',
    discovery: 'search-only',
    accent: '#60a5fa',
    size: { width: 320, height: 260 },
    tags: ['algorithm', 'method', 'solution'],
    fields: [
      { id: 'problem', label: '問題描述', kind: 'textarea', placeholder: '把題目或目標寫清楚。' },
      { id: 'bestStep', label: '最佳步驟', kind: 'textarea', placeholder: '寫下最優算法的骨架。' },
      { id: 'alternatives', label: '替代方法', kind: 'textarea', placeholder: '列出其他可用方法。' },
    ],
    inputs: [
      { id: 'in-data', label: '題目資料', position: 'left', type: 'input', offset: 40 },
    ],
    outputs: [
      { id: 'out-method', label: '方法摘要', position: 'right', type: 'output', offset: 40 },
    ],
    bestAlgorithm: '先做關鍵轉換，再挑最短路徑完成代入。',
    alternativeAlgorithms: ['代數法', '幾何法', '反推法'],
    tutorialSteps: ['先描述觀察。', '再列出主方法。', '最後補替代法。'],
    relatedWorkflowIds: ['workflow-cosine-law'],
    builderBlocks: [
      { id: 'method-input', kind: 'input', label: 'problem', placeholder: '題目資料' },
      { id: 'method-text', kind: 'text', label: '方法摘要', content: '這裡說明主方法與步驟。' },
      { id: 'method-toggle', kind: 'toggle', label: '切換替代方法', content: '顯示替代策略或註解。' },
      { id: 'method-output', kind: 'output', label: 'method' },
    ],
  },
  {
    id: 'workflow-link',
    title: 'Workflow Link',
    summary: '連到另一條工作流，適合做引用與延伸。',
    category: 'Navigation',
    slug: 'workflow-link',
    version: '1.0.0',
    source: 'core',
    visibility: 'public',
    discovery: 'search-only',
    accent: '#f59e0b',
    size: { width: 280, height: 180 },
    tags: ['link', 'navigation', 'workflow'],
    fields: [
      { id: 'targetWorkflowId', label: '目標工作流 ID', kind: 'text', placeholder: 'workflow-cosine-law' },
      { id: 'targetWorkflowTitle', label: '顯示標題', kind: 'text', placeholder: '餘弦定理工作流' },
      { id: 'callout', label: '說明', kind: 'textarea', placeholder: '描述這個連結為什麼重要。' },
    ],
    inputs: [
      { id: 'in-link', label: '來源', position: 'left', type: 'input', offset: 40 },
    ],
    outputs: [
      { id: 'out-link', label: '跳轉', position: 'right', type: 'output', offset: 40 },
    ],
    bestAlgorithm: '把它當成工作流超連結，維持原地教學與深層延伸的切換點。',
    alternativeAlgorithms: ['作為註腳節點', '作為參考資料卡片'],
    tutorialSteps: ['填入目標工作流。', '補上為什麼要跳轉。', '在工作流中引用它。'],
    relatedWorkflowIds: ['workflow-cosine-law', 'workflow-induction'],
    builderBlocks: [
      { id: 'link-input', kind: 'input', label: 'from', placeholder: '來源節點' },
      { id: 'link-text', kind: 'text', label: '工作流連結', content: '描述為何需要跳轉。' },
      { id: 'link-output', kind: 'output', label: 'jump' },
    ],
  },
];

const blueprintByWorkflowId: Record<string, WorkflowBlueprint> = {
  'workflow-cosine-law': {
    card: publicWorkflowCards[0],
    nodes: [
      {
        id: 'cos-root',
        type: 'projectNode',
        position: { x: -360, y: -160 },
        data: {
          label: '餘弦定理',
          description: '一條從幾何圖像走到代入公式的社群工作流。',
        },
        deletable: false,
      },
      {
        id: 'cos-note',
        type: 'textNode',
        position: { x: -40, y: -180 },
        data: {
          label: '觀察',
          text: '先觀察三角形的兩邊與夾角，判斷可否建立完整方程式。',
        },
        style: { width: 280, height: 160 },
      },
      {
        id: 'cos-formula',
        type: 'calculateNode',
        position: { x: 260, y: -140 },
        data: {
          label: '最優算法',
          formulaInput: 'c^2=a^2+b^2-2ab\\cos C',
        },
        style: { width: 240, height: 90 },
      },
      {
        id: 'cos-method',
        type: 'balanceNode',
        position: { x: 260, y: 10 },
        data: {
          label: '多方法比較',
          currentFormula: 'c^2=a^2+b^2-2ab\\cos C',
          operations: [],
        },
        style: { width: 280, height: 220 },
      },
      {
        id: 'cos-link',
        type: 'textNode',
        position: { x: 0, y: 170 },
        data: {
          label: '延伸',
          text: '如果還不熟，可以跳到「正弦定理」或「三角形面積公式」工作流。',
        },
        style: { width: 340, height: 140 },
      },
    ],
    edges: [
      { id: 'cos-e1', source: 'cos-root', target: 'cos-note' },
      { id: 'cos-e2', source: 'cos-note', target: 'cos-formula' },
      { id: 'cos-e3', source: 'cos-formula', target: 'cos-method' },
      { id: 'cos-e4', source: 'cos-method', target: 'cos-link' },
      { id: 'cos-e5', source: 'cos-link', target: 'cos-root' },
    ],
  },
  'workflow-induction': {
    card: publicWorkflowCards[1],
    nodes: [
      {
        id: 'ind-root',
        type: 'projectNode',
        position: { x: -340, y: -120 },
        data: {
          label: '數學歸納法',
          description: '用基底、假設與推論三步驟建立可重複的證明框架。',
        },
        deletable: false,
      },
      {
        id: 'ind-base',
        type: 'textNode',
        position: { x: -20, y: -150 },
        data: { label: '基底', text: '先驗證 n=1 或題目指定的起點。' },
        style: { width: 250, height: 140 },
      },
      {
        id: 'ind-hyp',
        type: 'textNode',
        position: { x: 260, y: -150 },
        data: { label: '歸納假設', text: '假設 n=k 成立，準備推到 n=k+1。' },
        style: { width: 270, height: 140 },
      },
      {
        id: 'ind-step',
        type: 'solveNode',
        position: { x: 260, y: 40 },
        data: { label: '推論', input: 'k+1' },
        style: { width: 230, height: 160 },
      },
    ],
    edges: [
      { id: 'ind-e1', source: 'ind-root', target: 'ind-base' },
      { id: 'ind-e2', source: 'ind-base', target: 'ind-hyp' },
      { id: 'ind-e3', source: 'ind-hyp', target: 'ind-step' },
    ],
  },
  'workflow-quadratic': {
    card: publicWorkflowCards[2],
    nodes: [
      {
        id: 'quad-root',
        type: 'projectNode',
        position: { x: -320, y: -140 },
        data: {
          label: '二次方程式',
          description: '從公式到判別式的一條標準核心工作流。',
        },
        deletable: false,
      },
      {
        id: 'quad-def',
        type: 'textNode',
        position: { x: 0, y: -160 },
        data: {
          label: '定義',
          text: 'ax^2 + bx + c = 0，且 a ≠ 0。',
        },
        style: { width: 240, height: 140 },
      },
      {
        id: 'quad-det',
        type: 'calculateNode',
        position: { x: 260, y: -160 },
        data: {
          label: '判別式',
          formulaInput: 'b^2 - 4ac',
        },
        style: { width: 220, height: 90 },
      },
      {
        id: 'quad-sol',
        type: 'balanceNode',
        position: { x: 260, y: 20 },
        data: {
          label: '解的結構',
          currentFormula: 'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}',
          operations: [],
        },
        style: { width: 300, height: 220 },
      },
    ],
    edges: [
      { id: 'quad-e1', source: 'quad-root', target: 'quad-def' },
      { id: 'quad-e2', source: 'quad-def', target: 'quad-det' },
      { id: 'quad-e3', source: 'quad-det', target: 'quad-sol' },
      { id: 'quad-e4', source: 'quad-sol', target: 'quad-root' },
    ],
  },
};

export const defaultCommunityTemplates = defaultNodeTemplates;

export const publicCommunityWorkflows = publicWorkflowCards;

export function getCommunityWorkflowBlueprint(workflowId: string) {
  return blueprintByWorkflowId[workflowId] ?? null;
}

export function getCommunityWorkflowBySlug(slug: string) {
  return publicWorkflowCards.find(w => w.slug === slug) ?? null;
}

export function getCommunityTemplateById(templateId: string) {
  return defaultNodeTemplates.find(t => t.id === templateId) ?? null;
}
