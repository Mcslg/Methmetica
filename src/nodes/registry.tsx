/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import type { NodeProps } from '@xyflow/react';
import { Icons } from '../components/Icons';
import { NumberNode } from './deprecated/NumberNode';
import { DecimalNode } from './deprecated/DecimalNode';
import { AppendNode, executeAppendNode } from './deprecated/AppendNode';
import { ButtonNode } from './deprecated/ButtonNode';
import { GateNode } from './deprecated/GateNode';
import { RangeNode, executeRangeNode } from './deprecated/RangeNode';
import { ForEachNode, executeForEachNode } from './deprecated/ForEachNode';
import { SliderNode } from './SliderNode';
import { ProjectNode } from './ProjectNode';
import { NodeBuilderNode } from './NodeBuilderNode';
import { CommunityTemplateNode } from './CommunityTemplateNode';
import { WorkflowLinkNode } from './deprecated/WorkflowLinkNode';
import { CodeNode, executeCodeNode } from './CodeNode';
import { DriveImageNode, executeDriveImageNode } from './DriveImageNode';
import { InputNode } from './core/InputNode';
import { OutputNode } from './core/OutputNode';
import { DummyNode } from './core/DummyNode';
import { CompositeWorkflowNode } from './core/CompositeWorkflowNode';
import { getTemplateInterfaceSchema, type CommunityNodeTemplate } from '../community/types';
import { getCommunityTemplateById } from '../community/catalog';
import { runBuiltWorkflowNode } from '../utils/workflowTestRunner';
import { runCompiledArtifact } from '../utils/workflowCompiler';
import {
    dataNodeHandles,
    toolNodeHandles,
    textNodeHandles,
    calculusNodeHandles,
    buttonNodeHandles,
    appendNodeHandles,
    gateNodeHandles,
    rangeNodeHandles,
    forEachNodeHandles,
    graphNodeHandles,
    sliderNodeHandles,
    soundNodeHandles,
    codeNodeHandles
} from './handles';
import {
    type CustomHandle,
    type AppState,
    type AppNode
} from '../store/useStore';

export interface NodeMetadata {
    label: string;
    desc: string;
    category: string;
    icon: React.ReactNode;
    color: string;
    hidden?: boolean; // If true, hide from search menu
}

export interface NodeDefinition {
    type: string;
    component: React.ComponentType<NodeProps<AppNode>>;
    metadata: NodeMetadata;
    defaultSize: { width: number; height: number };
    defaultHandles: CustomHandle[];
    execute?: (node: AppNode, state: AppState) => Promise<string | void> | string | void;
}

const LazyTextNode = React.lazy(() => import('./TextNode').then((mod) => ({ default: mod.TextNode })));
const LazyCalculateNode = React.lazy(() => import('./CalculateNode').then((mod) => ({ default: mod.CalculateNode })));
const LazyCalculusNode = React.lazy(() => import('./deprecated/CalculusNode').then((mod) => ({ default: mod.CalculusNode })));
const LazyGraphNode = React.lazy(() => import('./GraphNode').then((mod) => ({ default: mod.GraphNode })));
const LazyBalanceNode = React.lazy(() => import('./deprecated/BalanceNode').then((mod) => ({ default: mod.BalanceNode })));
const LazySolveNode = React.lazy(() => import('./deprecated/SolveNode').then((mod) => ({ default: mod.SolveNode })));
const LazySoundNode = React.lazy(() => import('./deprecated/SoundNode').then((mod) => ({ default: mod.SoundNode })));

const withNodeSuspense = (Component: React.LazyExoticComponent<React.ComponentType<NodeProps<AppNode>>>): React.ComponentType<NodeProps<AppNode>> => {
    const WrappedNode = (props: NodeProps<AppNode>) => (
        <React.Suspense fallback={<div style={{ padding: 12, color: 'var(--text-sub)' }}>Loading node...</div>}>
            <Component {...props} />
        </React.Suspense>
    );

    return WrappedNode;
};

const mathExecute = async (node: AppNode, state: AppState) => {
    const { CalculationService } = await import('../utils/deprecated/CalculationService');
    return CalculationService.calculate(node, {
        nodes: state.nodes,
        edges: state.edges
    });
};

const executeCommunityTemplateNode = async (node: AppNode, state: AppState) => {
    const template =
        (node.data.templateDraft as CommunityNodeTemplate | undefined) ??
        state.communityTemplates.find(item => item.id === node.data.templateId) ??
        getCommunityTemplateById(node.data.templateId || '') as CommunityNodeTemplate | undefined;

    if (!template) {
        state.updateNodeData(node.id, {
            error: '找不到這個 published node template。',
            outputs: {},
        }, { skipGraphEval: true });
        state.evaluateGraph();
        return;
    }

    if (!template.compiledArtifact && !template.runtimePlan) {
        state.updateNodeData(node.id, {
            error: '這個 published node 還沒有 Beta artifact。請從 Builder 重新 Publish 一次。',
            outputs: {},
        }, { skipGraphEval: true });
        state.evaluateGraph();
        return;
    }

    const interfaceSchema = getTemplateInterfaceSchema(template);
    const runtimeInputs = Object.fromEntries(
        interfaceSchema.inputs.map(port => [port.id, node.data.inputs?.[port.id] ?? ''])
    );
    const result = template.compiledArtifact
        ? await runCompiledArtifact(template.compiledArtifact, runtimeInputs)
        : await runBuiltWorkflowNode(template.runtimePlan!, runtimeInputs);
    const primaryOutput = interfaceSchema.outputs[0]?.id;

    state.updateNodeData(node.id, {
        error: result.error,
        outputs: result.outputs,
        templateViewOverrides: result.templateViewOverrides,
        value: primaryOutput ? result.outputs[primaryOutput] ?? '' : JSON.stringify(result.outputs),
        status: result.error ? 'Runtime failed' : `Runtime ok${result.trace.length > 0 ? `: ${result.trace.join(' -> ')}` : ''}`,
    }, { skipGraphEval: true });
    state.evaluateGraph();
};

export const nodeRegistry: NodeDefinition[] = [
    {
        type: 'textNode',
        component: withNodeSuspense(LazyTextNode),
        metadata: { label: '筆記 (Notebook)', desc: 'Markdown 與文字處理', category: 'Logic', icon: <Icons.Text />, color: 'var(--accent-bright)' },
        defaultSize: { width: 300, height: 180 },
        defaultHandles: textNodeHandles
    },
    {
        type: 'calculateNode',
        component: withNodeSuspense(LazyCalculateNode),
        metadata: { label: '數學運算 (Calculate)', desc: '符號運算與公式解析', category: 'Math', icon: <Icons.Calculate />, color: 'var(--accent-bright)', hidden: true },
        defaultSize: { width: 170, height: 85 },
        defaultHandles: toolNodeHandles,
        execute: mathExecute
    },
    {
        type: 'decimalNode',
        component: DecimalNode,
        metadata: { label: '小數轉換 (Decimal)', desc: '分數轉浮點小數', category: 'Utils', icon: <Icons.Decimal />, color: 'var(--accent-bright)', hidden: true },
        defaultSize: { width: 200, height: 120 },
        defaultHandles: toolNodeHandles,
        execute: mathExecute
    },
    {
        type: 'calculusNode',
        component: withNodeSuspense(LazyCalculusNode),
        metadata: { label: '微積分 (Calculus)', desc: '導數與積分運算', category: 'Math', icon: <Icons.Calculus />, color: 'var(--accent-bright)', hidden: true },
        defaultSize: { width: 220, height: 80 },
        defaultHandles: calculusNodeHandles,
        execute: mathExecute
    },
    {
        type: 'appendNode',
        component: AppendNode,
        metadata: { label: '日誌附加 (Logger)', desc: '附加文字至筆記節點', category: 'Logic', icon: <Icons.Append />, color: 'var(--accent-bright)', hidden: true },
        defaultSize: { width: 200, height: 120 },
        defaultHandles: appendNodeHandles,
        execute: executeAppendNode
    },
    {
        type: 'buttonNode',
        component: ButtonNode,
        metadata: { label: '觸發器 (Trigger)', desc: '訊號脈衝觸發', category: 'Logic', icon: <Icons.Trigger />, color: 'var(--accent-bright)', hidden: true },
        defaultSize: { width: 120, height: 46 },
        defaultHandles: buttonNodeHandles
    },
    {
        type: 'gateNode',
        component: GateNode,
        metadata: { label: '閘門 (Gate)', desc: '條件通斷訊號閘門', category: 'Logic', icon: <Icons.Gate />, color: 'var(--accent-bright)', hidden: true },
        defaultSize: { width: 180, height: 110 },
        defaultHandles: gateNodeHandles
    },
    {
        type: 'rangeNode',
        component: RangeNode,
        metadata: { label: '數列生成 (Range)', desc: '等差數列生成器', category: 'Math', icon: <Icons.Range />, color: 'var(--accent-bright)', hidden: true },
        defaultSize: { width: 180, height: 110 },
        defaultHandles: rangeNodeHandles,
        execute: executeRangeNode
    },
    {
        type: 'forEachNode',
        component: ForEachNode,
        metadata: { label: '迴圈迭代 (ForEach)', desc: '依序遍歷相鄰節點', category: 'Logic', icon: <Icons.ForEach />, color: 'var(--accent-bright)', hidden: true },
        defaultSize: { width: 180, height: 110 },
        defaultHandles: forEachNodeHandles,
        execute: executeForEachNode
    },
    {
        type: 'graphNode',
        component: withNodeSuspense(LazyGraphNode),
        metadata: { label: '函數圖表 (Graph)', desc: '動態二維函數繪圖', category: 'Math', icon: <Icons.Graph />, color: 'var(--accent-bright)', hidden: true },
        defaultSize: { width: 300, height: 260 },
        defaultHandles: graphNodeHandles,
        execute: mathExecute
    },
    {
        type: 'sliderNode',
        component: SliderNode,
        metadata: { label: '數值滑桿 (Slider)', desc: '可互動數值滑桿', category: 'Input', icon: <Icons.Slider />, color: 'var(--accent-bright)', hidden: true },
        defaultSize: { width: 180, height: 110 },
        defaultHandles: sliderNodeHandles
    },
    {
        type: 'solveNode',
        component: withNodeSuspense(LazySolveNode),
        metadata: { label: '方程式求解 (Solver)', desc: '代數方程式求解器', category: 'Math', icon: <Icons.Solve />, color: 'var(--accent-bright)', hidden: true },
        defaultSize: { width: 220, height: 160 },
        defaultHandles: [{ id: 'h-in', type: 'input', position: 'left', offset: 50, label: 'eq' }, { id: 'h-out', type: 'output', position: 'right', offset: 50 }],
        execute: mathExecute
    },
    {
        type: 'balanceNode',
        component: withNodeSuspense(LazyBalanceNode),
        metadata: { label: '天平解析 (Balance)', desc: '逐步等式等價推導', category: 'Math', icon: <Icons.Balance />, color: 'var(--accent-bright)', hidden: true },
        defaultSize: { width: 240, height: 300 },
        defaultHandles: [{ id: 'h-in', type: 'input', position: 'left', offset: 50, label: 'eq' }, { id: 'h-out', type: 'output', position: 'right', offset: 50 }],
        execute: mathExecute
    },
    {
        type: 'soundNode',
        component: withNodeSuspense(LazySoundNode),
        metadata: { label: '聲音合成 (Sound)', desc: '由數學波形合成音效', category: 'Output', icon: <Icons.Sound />, color: '#4ade80', hidden: true },
        defaultSize: { width: 220, height: 160 },
        defaultHandles: soundNodeHandles
    },
    {
        type: 'codeNode',
        component: CodeNode,
        metadata: { label: '程式腳本 (Code)', desc: '執行自訂 JavaScript 邏輯', category: 'Logic', icon: <Icons.Code />, color: '#38bdf8' },
        defaultSize: { width: 280, height: 240 },
        defaultHandles: codeNodeHandles,
        execute: executeCodeNode
    },
    {
        type: 'driveImageNode',
        component: DriveImageNode,
        metadata: { label: '雲端圖片 (Drive Image)', desc: '載入雲端硬碟圖片', category: 'Media', icon: <Icons.Image />, color: '#22c55e' },
        defaultSize: { width: 280, height: 280 },
        defaultHandles: [],
        execute: executeDriveImageNode
    },
    {
        type: 'numberNode',
        component: NumberNode,
        metadata: { label: '數值常數 (Number)', desc: '常數數值輸入', category: 'Math', icon: <Icons.Number />, color: 'var(--accent-bright)', hidden: true },
        defaultSize: { width: 120, height: 80 },
        defaultHandles: dataNodeHandles
    },
    {
        type: 'projectNode',
        component: ProjectNode,
        metadata: { label: '專案設定 (Project)', desc: '工作流專案資訊根節點', category: 'System', icon: <Icons.Calculate />, color: 'var(--accent-bright)', hidden: true },
        defaultSize: { width: 300, height: 80 },
        defaultHandles: []
    },
    {
        type: 'nodeBuilderNode',
        component: NodeBuilderNode,
        metadata: { label: '節點製造器 (Builder)', desc: '封裝與建置自訂社群節點', category: 'Community', icon: <Icons.Package />, color: '#38bdf8', hidden: true },
        defaultSize: { width: 900, height: 720 },
        defaultHandles: []
    },
    {
        type: 'workflowLinkNode',
        component: WorkflowLinkNode,
        metadata: { label: '工作流連結 (Link)', desc: '跳轉至其他工作流', category: 'Community', icon: <Icons.ExternalLink />, color: '#f59e0b', hidden: true },
        defaultSize: { width: 280, height: 180 },
        defaultHandles: [
            { id: 'h-in', type: 'input', position: 'left', offset: 42, label: 'ref' },
            { id: 'h-out', type: 'output', position: 'right', offset: 42, label: 'jump' },
        ]
    },
    {
        type: 'communityTemplateNode',
        component: CommunityTemplateNode,
        metadata: { label: '社群元件 (Community)', desc: '可複用之社群節點模板', category: 'Community', icon: <Icons.Grid />, color: '#60a5fa', hidden: true },
        defaultSize: { width: 320, height: 240 },
        defaultHandles: [
            { id: 'h-in', type: 'input', position: 'left', offset: 42, label: 'in' },
            { id: 'h-out', type: 'output', position: 'right', offset: 42, label: 'out' },
        ],
        execute: executeCommunityTemplateNode
    },
    {
        type: 'inputNode',
        component: InputNode,
        metadata: { label: '端點輸入 (Interface In)', desc: '子工作流外部資料輸入端點', category: 'Interface', icon: <Icons.Trigger />, color: '#38bdf8' },
        defaultSize: { width: 200, height: 130 },
        defaultHandles: [{ id: 'out', type: 'output', position: 'right', offset: 50, label: 'out' }],
        execute: (node, state) => {
            const val = node.data?.value ?? '';
            state.updateNodeData(node.id, { outputs: { out: String(val) } });
        }
    },
    {
        type: 'outputNode',
        component: OutputNode,
        metadata: { label: '端點輸出 (Interface Out)', desc: '子工作流運算結果輸出端點', category: 'Interface', icon: <Icons.Result />, color: '#f59e0b' },
        defaultSize: { width: 200, height: 130 },
        defaultHandles: [{ id: 'in', type: 'input', position: 'left', offset: 50, label: 'in' }],
        execute: (node, state) => {
            const incomingVal = node.data?.input ?? node.data?.inputs?.in ?? '';
            state.updateNodeData(node.id, { value: String(incomingVal) });
        }
    },
    {
        type: 'dummyNode',
        component: DummyNode,
        metadata: { label: '待實作節點 (Dummy)', desc: 'AI 或使用者未實作之佔位節點', category: 'Logic', icon: <Icons.Code />, color: '#ec4899' },
        defaultSize: { width: 240, height: 160 },
        defaultHandles: [
            { id: 'in', type: 'input', position: 'left', offset: 50, label: 'in' },
            { id: 'out', type: 'output', position: 'right', offset: 50, label: 'out' },
        ]
    },
    {
        type: 'compositeWorkflowNode',
        component: CompositeWorkflowNode,
        metadata: { label: '複合工作流 (Composite)', desc: '封裝之子工作流節點', category: 'Workflow', icon: <Icons.Package />, color: '#38bdf8' },
        defaultSize: { width: 280, height: 220 },
        defaultHandles: [
            { id: 'in', type: 'input', position: 'left', offset: 50, label: 'in' },
            { id: 'out', type: 'output', position: 'right', offset: 50, label: 'out' },
        ]
    }
];

export const nodeTypes = nodeRegistry.reduce((acc, def) => {
    acc[def.type] = def.component;
    return acc;
}, {} as Record<string, React.ComponentType<NodeProps<AppNode>>>);

export const getNodeDefinition = (type: string) => nodeRegistry.find(n => n.type === type);

// For drawing menus, we can expose just the visible library items
export const nodeLibrary = nodeRegistry
    .filter(n => !n.metadata.hidden)
    .map(n => ({
        type: n.type,
        ...n.metadata
    }));

export type CatalogEntry = {
    type: string;
    templateId?: string;
    label: string;
    desc: string;
    category: string;
    icon: React.ReactNode;
    color: string;
    hidden?: boolean;
    reviewStatus?: CommunityNodeTemplate['reviewStatus'];
    reviewWarning?: boolean;
    updateAvailable?: boolean;
    updateSeverity?: CommunityNodeTemplate['updateSeverity'];
    updateMessage?: string;
};

export const buildNodeCatalog = (customTemplates: CommunityNodeTemplate[]): CatalogEntry[] => {
    const communityEntries: CatalogEntry[] = customTemplates.map(template => ({
        type: 'communityTemplateNode',
        templateId: template.id,
        label: template.title,
        desc: template.summary,
        category: template.source === 'core' ? 'Core' : 'Community',
        icon: <Icons.Grid />,
        color: template.accent,
        hidden: template.discovery === 'library-and-search' ? false : true,
        reviewStatus: template.reviewStatus,
        reviewWarning: template.reviewWarning,
        updateAvailable: template.updateAvailable,
        updateSeverity: template.updateSeverity,
        updateMessage: template.updateMessage,
    }));

    return [
        ...nodeLibrary.map(item => ({ ...item, hidden: false } as CatalogEntry)),
        ...communityEntries,
    ];
};
