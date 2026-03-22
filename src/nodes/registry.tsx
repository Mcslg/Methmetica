import React from 'react';
import { Icons } from '../components/Icons';
import { NumberNode } from './NumberNode';
import { CalculateNode } from './CalculateNode';
import { TextNode } from './TextNode';
import { DecimalNode } from './DecimalNode';
import { CalculusNode } from './CalculusNode';
import { AppendNode } from './AppendNode';
import { ButtonNode } from './ButtonNode';
import { GateNode } from './GateNode';
import { RangeNode } from './RangeNode';
import { ForEachNode } from './ForEachNode';
import { GraphNode } from './GraphNode';
import { SliderNode } from './SliderNode';
import { SolveNode } from './SolveNode';
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
    type CustomHandle
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
}

export const nodeRegistry: NodeDefinition[] = [
    {
        type: 'textNode',
        component: TextNode,
        metadata: { label: 'Notebook', desc: 'Markdown & text processing', category: 'Logic', icon: <Icons.Text />, color: 'var(--accent-bright)' },
        defaultSize: { width: 300, height: 180 },
        defaultHandles: textNodeHandles
    },
    {
        type: 'calculateNode',
        component: CalculateNode,
        metadata: { label: 'Math Calc', desc: 'Symbolic math expressions', category: 'Math', icon: <Icons.Calculate />, color: 'var(--accent-bright)' },
        defaultSize: { width: 160, height: 75 },
        defaultHandles: toolNodeHandles
    },
    {
        type: 'decimalNode',
        component: DecimalNode,
        metadata: { label: 'Decimal', desc: 'Fraction to float', category: 'Utils', icon: <Icons.Decimal />, color: 'var(--accent-bright)' },
        defaultSize: { width: 200, height: 120 },
        defaultHandles: toolNodeHandles
    },
    {
        type: 'calculusNode',
        component: CalculusNode,
        metadata: { label: 'Calculus', desc: 'Derivatives & Integrals', category: 'Math', icon: <Icons.Calculus />, color: 'var(--accent-bright)' },
        defaultSize: { width: 160, height: 75 },
        defaultHandles: calculusNodeHandles
    },
    {
        type: 'appendNode',
        component: AppendNode,
        metadata: { label: 'Logger', desc: 'Append to TextNode', category: 'Logic', icon: <Icons.Append />, color: 'var(--accent-bright)' },
        defaultSize: { width: 200, height: 120 },
        defaultHandles: appendNodeHandles
    },
    {
        type: 'buttonNode',
        component: ButtonNode,
        metadata: { label: 'Trigger', desc: 'Signal trigger', category: 'Logic', icon: <Icons.Calculate />, color: 'var(--accent-bright)' },
        defaultSize: { width: 120, height: 46 },
        defaultHandles: buttonNodeHandles
    },
    {
        type: 'gateNode',
        component: GateNode,
        metadata: { label: 'Gate', desc: 'Pass/Block trigger', category: 'Logic', icon: <Icons.Gate />, color: 'var(--accent-bright)' },
        defaultSize: { width: 180, height: 110 },
        defaultHandles: gateNodeHandles
    },
    {
        type: 'rangeNode',
        component: RangeNode,
        metadata: { label: 'Range', desc: 'Number sequence', category: 'Math', icon: <Icons.Range />, color: 'var(--accent-bright)' },
        defaultSize: { width: 180, height: 110 },
        defaultHandles: rangeNodeHandles
    },
    {
        type: 'forEachNode',
        component: ForEachNode,
        metadata: { label: 'ForEach', desc: 'Loop neighbor nodes', category: 'Logic', icon: <Icons.ForEach />, color: 'var(--accent-bright)' },
        defaultSize: { width: 180, height: 110 },
        defaultHandles: forEachNodeHandles
    },
    {
        type: 'graphNode',
        component: GraphNode,
        metadata: { label: 'Graph', desc: 'Plot 2D dynamic functions', category: 'Math', icon: <Icons.Graph />, color: 'var(--accent-bright)' },
        defaultSize: { width: 300, height: 260 },
        defaultHandles: graphNodeHandles
    },
    {
        type: 'sliderNode',
        component: SliderNode,
        metadata: { label: 'Slider', desc: 'Value slider', category: 'Input', icon: <Icons.Slider />, color: 'var(--accent-bright)' },
        defaultSize: { width: 180, height: 110 },
        defaultHandles: sliderNodeHandles
    },
    {
        type: 'solveNode',
        component: SolveNode,
        metadata: { label: 'Solver', desc: 'Equation solver', category: 'Math', icon: <Icons.Solve />, color: 'var(--accent-bright)' },
        defaultSize: { width: 220, height: 160 },
        defaultHandles: [{ id: 'h-in', type: 'input', position: 'left', offset: 50, label: 'eq' }, { id: 'h-out', type: 'output', position: 'right', offset: 50 }]
    },
    {
        type: 'numberNode',
        component: NumberNode,
        metadata: { label: 'Number', desc: 'Constant value', category: 'Math', icon: <Icons.Calculate />, color: 'var(--accent-bright)', hidden: true },
        defaultSize: { width: 120, height: 80 },
        defaultHandles: dataNodeHandles
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
