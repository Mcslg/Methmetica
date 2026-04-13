import type { Edge } from '@xyflow/react';
import type { CSSProperties } from 'react';
import type { AppNode } from '../store/useStore';

export type WorkflowVisibility = 'public' | 'private' | 'core';

export type TemplateFieldKind = 'text' | 'textarea' | 'number' | 'select' | 'link';

export type TemplateBuilderBlockKind = 'input' | 'output' | 'text' | 'toggle' | 'math';

export type TemplateDiscoveryMode = 'search-only' | 'library-and-search';
export type TemplatePortSource = 'static' | 'derived';
export type TemplatePortValueKind = 'value' | 'trigger' | 'gate' | 'object' | 'formula-variable';
export type TemplatePortDerivation = 'builderBlocks' | 'formulaVariables' | 'runtime';

export type TemplateBuilderBlock = {
  id: string;
  kind: TemplateBuilderBlockKind;
  label: string;
  content?: string;
  placeholder?: string;
};

export type TemplateFieldSpec = {
  id: string;
  label: string;
  kind: TemplateFieldKind;
  placeholder?: string;
  defaultValue?: string;
  help?: string;
  required?: boolean;
  options?: string[];
};

export type TemplateHandleSpec = {
  id: string;
  label: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  type: 'input' | 'output';
  offset: number;
};

export type TemplatePortSpec = TemplateHandleSpec & {
  source: TemplatePortSource;
  valueKind: TemplatePortValueKind;
  required?: boolean;
  description?: string;
  derivesFrom?: TemplatePortDerivation;
  typeConstraint?: string; // 'type:${MathTypeId}' or 'cap:${MathCapability}'
};

export type TemplateInterfaceSchema = {
  inputs: TemplatePortSpec[];
  outputs: TemplatePortSpec[];
};

export type CommunityNodeTemplate = {
  id: string;
  title: string;
  summary: string;
  category: string;
  slug: string;
  version: string;
  source: 'core' | 'community';
  visibility: WorkflowVisibility;
  discovery: TemplateDiscoveryMode;
  accent: string;
  size: {
    width: number;
    height: number;
  };
  tags: string[];
  interfaceSchema?: TemplateInterfaceSchema;
  interfaceSchemaText?: string;
  runtimePlan?: BuiltWorkflowNode;
  fields: TemplateFieldSpec[];
  inputs: TemplateHandleSpec[];
  outputs: TemplateHandleSpec[];
  bestAlgorithm: string;
  alternativeAlgorithms: string[];
  tutorialSteps: string[];
  relatedWorkflowIds: string[];
  builderBlocks: TemplateBuilderBlock[];
};

export type CommunityWorkflowCard = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  author: string;
  difficulty: string;
  visibility: WorkflowVisibility;
  tags: string[];
  updatedAt: string;
  featuredTemplateIds: string[];
  nodeCount: number;
  edgeCount: number;
  seoTitle: string;
  seoDescription: string;
};

export type WorkflowGraphNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  style?: CSSProperties;
  width?: number;
  height?: number;
  hidden?: boolean;
  deletable?: boolean;
};

export type WorkflowGraphEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
};

export type WorkflowBlueprint = {
  card: CommunityWorkflowCard;
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
};

export type BuiltWorkflowNode = {
  bridgeNodeId: string;
  interfaceSchema: TemplateInterfaceSchema;
  nodes: AppNode[];
  edges: Edge[];
};

export const clonePortSpec = (port: TemplatePortSpec): TemplatePortSpec => ({ ...port });

export const cloneInterfaceSchema = (schema?: TemplateInterfaceSchema): TemplateInterfaceSchema | undefined => (
  schema ? {
    inputs: schema.inputs.map(clonePortSpec),
    outputs: schema.outputs.map(clonePortSpec),
  } : undefined
);

export const portToHandleSpec = (port: TemplatePortSpec): TemplateHandleSpec => ({
  id: port.id,
  label: port.label,
  position: port.position,
  type: port.type,
  offset: port.offset,
});

export const getTemplateInterfaceSchema = (template: CommunityNodeTemplate): TemplateInterfaceSchema => (
  template.interfaceSchema ?? {
    inputs: template.inputs.map(handle => ({
      ...handle,
      source: 'static',
      valueKind: 'value',
    })),
    outputs: template.outputs.map(handle => ({
      ...handle,
      source: 'static',
      valueKind: 'value',
    })),
  }
);

export const getTemplateHandles = (template: CommunityNodeTemplate): TemplateHandleSpec[] => {
  const schema = getTemplateInterfaceSchema(template);
  return [
    ...schema.inputs.map(portToHandleSpec),
    ...schema.outputs.map(portToHandleSpec),
  ];
};

export const getTemplateInternalHandles = (template: CommunityNodeTemplate): TemplateHandleSpec[] => {
  const schema = getTemplateInterfaceSchema(template);
  return [
    ...schema.inputs.map(port => ({
      id: port.id,
      label: port.label,
      position: 'right' as const,
      type: 'output' as const,
      offset: port.offset,
    })),
    ...schema.outputs.map(port => ({
      id: port.id,
      label: port.label,
      position: 'left' as const,
      type: 'input' as const,
      offset: port.offset,
    })),
  ];
};
