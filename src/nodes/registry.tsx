import React from 'react';
import { Icons } from '../components/Icons';
import { NumberNode } from './deprecated/NumberNode';
import { DecimalNode } from './deprecated/DecimalNode';
import { AppendNode, executeAppendNode } from './deprecated/AppendNode';
import { ButtonNode } from './deprecated/ButtonNode';
import { GateNode } from './deprecated/GateNode';
import { RangeNode, executeRangeNode } from './deprecated/RangeNode';
import { ForEachNode, executeForEachNode } from './deprecated/ForEachNode';
import { SliderNode } from './deprecated/SliderNode';
import { ProjectNode } from './ProjectNode';
import { CommunityTemplateNode } from './deprecated/CommunityTemplateNode';
import { WorkflowLinkNode } from './deprecated/WorkflowLinkNode';
import { CodeNode, executeCodeNode } from './CodeNode';
import { DriveImageNode, executeDriveImageNode } from './DriveImageNode';
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
    component: React.ComponentType<any>;
    metadata: NodeMetadata;
    defaultSize: { width: number; height: number };
    defaultHandles: CustomHandle[];
    execute?: (node: AppNode, state: AppState) => Promise<string | void> | string | void;
}

const LazyTextNode = React.lazy(() => import('./TextNode').then((mod) => ({ default: mod.TextNode })));
const LazyCalculateNode = React.lazy(() => import('./deprecated/CalculateNode').then((mod) => ({ default: mod.CalculateNode })));
const LazyCalculusNode = React.lazy(() => import('./deprecated/CalculusNode').then((mod) => ({ default: mod.CalculusNode })));
const LazyGraphNode = React.lazy(() => import('./deprecated/GraphNode').then((mod) => ({ default: mod.GraphNode })));
const LazyBalanceNode = React.lazy(() => import('./deprecated/BalanceNode').then((mod) => ({ default: mod.BalanceNode })));
const LazySolveNode = React.lazy(() => import('./deprecated/SolveNode').then((mod) => ({ default: mod.SolveNode })));
const LazySoundNode = React.lazy(() => import('./deprecated/SoundNode').then((mod) => ({ default: mod.SoundNode })));

const withNodeSuspense = (Component: React.LazyExoticComponent<React.ComponentType<any>>) => {
    const WrappedNode = (props: any) => (
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
        value: primaryOutput ? result.outputs[primaryOutput] ?? '' : JSON.stringify(result.outputs),
        status: result.error ? 'Runtime failed' : `Runtime ok${result.trace.length > 0 ? `: ${result.trace.join(' -> ')}` : ''}`,
    }, { skipGraphEval: true });
    state.evaluateGraph();
};

export const nodeRegistry: NodeDefinition[] = [
    {
        type: 'textNode',
        component: withNodeSuspense(LazyTextNode),
        metadata: { label: 'Notebook', desc: 'Markdown & text processing', category: 'Logic', icon: <Icons.Text />, color: 'var(--accent-bright)' },
        defaultSize: { width: 300, height: 180 },
        defaultHandles: textNodeHandles
    },
    {
        type: 'calculateNode',
        component: withNodeSuspense(LazyCalculateNode),
        metadata: { label: 'Math Calc', desc: 'Symbolic math expressions', category: 'Math', icon: <Icons.Calculate />, color: 'var(--accent-bright)', hidden: true },
        defaultSize: { width: 160, height: 75 },
        defaultHandles: toolNodeHandles,
        execute: mathExecute
    },
    {
        type: 'decimalNode',
        component: DecimalNode,
        metadata: { label: 'Decimal', desc: 'Fraction to float', category: 'Utils', icon: <Icons.Decimal />, color: 'var(--accent-bright)', hidden: true },
        defaultSize: { width: 200, height: 120 },
        defaultHandles: toolNodeHandles,
        execute: mathExecute
    },
    {
        type: 'calculusNode',
        component: withNodeSuspense(LazyCalculusNode),
        metadata: { label: 'Calculus', desc: 'Derivatives & Integrals', category: 'Math', icon: <Icons.Calculus />, color: 'var(--accent-bright)', hidden: true },
        defaultSize: { width: 220, height: 80 },
        defaultHandles: calculusNodeHandles,
        execute: mathExecute
    },
    {
        type: 'appendNode',
        component: AppendNode,
        metadata: { label: 'Logger', desc: 'Append to TextNode', category: 'Logic', icon: <Icons.Append />, color: 'var(--accent-bright)', hidden: true },
        defaultSize: { width: 200, height: 120 },
        defaultHandles: appendNodeHandles,
        execute: executeAppendNode
    },
    {
        type: 'buttonNode',
        component: ButtonNode,
        metadata: { label: 'Trigger', desc: 'Signal trigger', category: 'Logic', icon: <Icons.Trigger />, color: 'var(--accent-bright)', hidden: true },
        defaultSize: { width: 120, height: 46 },
        defaultHandles: buttonNodeHandles
    },
    {
        type: 'gateNode',
        component: GateNode,
        metadata: { label: 'Gate', desc: 'Pass/Block trigger', category: 'Logic', icon: <Icons.Gate />, color: 'var(--accent-bright)', hidden: true },
        defaultSize: { width: 180, height: 110 },
        defaultHandles: gateNodeHandles
    },
    {
        type: 'rangeNode',
        component: RangeNode,
        metadata: { label: 'Range', desc: 'Number sequence', category: 'Math', icon: <Icons.Range />, color: 'var(--accent-bright)', hidden: true },
        defaultSize: { width: 180, height: 110 },
        defaultHandles: rangeNodeHandles,
        execute: executeRangeNode
    },
    {
        type: 'forEachNode',
        component: ForEachNode,
        metadata: { label: 'ForEach', desc: 'Loop neighbor nodes', category: 'Logic', icon: <Icons.ForEach />, color: 'var(--accent-bright)', hidden: true },
        defaultSize: { width: 180, height: 110 },
        defaultHandles: forEachNodeHandles,
        execute: executeForEachNode
    },
    {
        type: 'graphNode',
        component: withNodeSuspense(LazyGraphNode),
        metadata: { label: 'Graph', desc: 'Plot 2D dynamic functions', category: 'Math', icon: <Icons.Graph />, color: 'var(--accent-bright)', hidden: true },
        defaultSize: { width: 300, height: 260 },
        defaultHandles: graphNodeHandles,
        execute: mathExecute
    },
    {
        type: 'sliderNode',
        component: SliderNode,
        metadata: { label: 'Slider', desc: 'Value slider', category: 'Input', icon: <Icons.Slider />, color: 'var(--accent-bright)', hidden: true },
        defaultSize: { width: 180, height: 110 },
        defaultHandles: sliderNodeHandles
    },
    {
        type: 'solveNode',
        component: withNodeSuspense(LazySolveNode),
        metadata: { label: 'Solver', desc: 'Equation solver', category: 'Math', icon: <Icons.Solve />, color: 'var(--accent-bright)', hidden: true },
        defaultSize: { width: 220, height: 160 },
        defaultHandles: [{ id: 'h-in', type: 'input', position: 'left', offset: 50, label: 'eq' }, { id: 'h-out', type: 'output', position: 'right', offset: 50 }],
        execute: mathExecute
    },
    {
        type: 'balanceNode',
        component: withNodeSuspense(LazyBalanceNode),
        metadata: { label: 'Balance', desc: 'Step-by-step equivalence', category: 'Math', icon: <Icons.Balance />, color: 'var(--accent-bright)', hidden: true },
        defaultSize: { width: 240, height: 300 },
        defaultHandles: [{ id: 'h-in', type: 'input', position: 'left', offset: 50, label: 'eq' }, { id: 'h-out', type: 'output', position: 'right', offset: 50 }],
        execute: mathExecute
    },
    {
        type: 'soundNode',
        component: withNodeSuspense(LazySoundNode),
        metadata: { label: 'Sound', desc: 'Synthesize sound from math', category: 'Output', icon: <Icons.Sound />, color: '#4ade80', hidden: true },
        defaultSize: { width: 220, height: 160 },
        defaultHandles: soundNodeHandles
    },
    {
        type: 'codeNode',
        component: CodeNode,
        metadata: { label: 'Code', desc: 'Run custom JavaScript logic', category: 'Logic', icon: <Icons.Code />, color: '#38bdf8' },
        defaultSize: { width: 280, height: 240 },
        defaultHandles: codeNodeHandles,
        execute: executeCodeNode
    },
    {
        type: 'driveImageNode',
        component: DriveImageNode,
        metadata: { label: 'Drive Image', desc: 'Use a private Google Drive image', category: 'Media', icon: <Icons.Image />, color: '#22c55e' },
        defaultSize: { width: 280, height: 280 },
        defaultHandles: [],
        execute: executeDriveImageNode
    },
    {
        type: 'numberNode',
        component: NumberNode,
        metadata: { label: 'Number', desc: 'Constant value', category: 'Math', icon: <Icons.Number />, color: 'var(--accent-bright)', hidden: true },
        defaultSize: { width: 120, height: 80 },
        defaultHandles: dataNodeHandles
    },
    {
        type: 'projectNode',
        component: ProjectNode,
        metadata: { label: 'Project Metadata', desc: 'Root node for project Info', category: 'System', icon: <Icons.Calculate />, color: 'var(--accent-bright)', hidden: true },
        defaultSize: { width: 300, height: 80 },
        defaultHandles: []
    },
    {
        type: 'workflowLinkNode',
        component: WorkflowLinkNode,
        metadata: { label: 'Workflow Link', desc: 'Open another workflow', category: 'Community', icon: <Icons.ExternalLink />, color: '#f59e0b', hidden: true },
        defaultSize: { width: 280, height: 180 },
        defaultHandles: [
            { id: 'h-in', type: 'input', position: 'left', offset: 42, label: 'ref' },
            { id: 'h-out', type: 'output', position: 'right', offset: 42, label: 'jump' },
        ]
    },
    {
        type: 'communityTemplateNode',
        component: CommunityTemplateNode,
        metadata: { label: 'Community Block', desc: 'Reusable template node', category: 'Community', icon: <Icons.Grid />, color: '#60a5fa', hidden: true },
        defaultSize: { width: 320, height: 240 },
        defaultHandles: [
            { id: 'h-in', type: 'input', position: 'left', offset: 42, label: 'in' },
            { id: 'h-out', type: 'output', position: 'right', offset: 42, label: 'out' },
        ],
        execute: executeCommunityTemplateNode
    }
];

export const nodeTypes = nodeRegistry.reduce((acc, def) => {
    acc[def.type] = def.component;
    return acc;
}, {} as Record<string, React.ComponentType<any>>);

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
