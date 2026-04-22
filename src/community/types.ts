import type { Edge } from '@xyflow/react';
import type { CSSProperties } from 'react';
import type { AppNode } from '../store/useStore';
import type { LocalizedText } from './localizedText';

export type WorkflowVisibility = 'public' | 'private' | 'core';

export type TemplateFieldKind = 'text' | 'textarea' | 'number' | 'select' | 'link';

export type TemplateBuilderBlockKind = 'input' | 'output' | 'text' | 'toggle' | 'math';

export type TemplateDiscoveryMode = 'search-only' | 'library-and-search';
export type TemplatePortSource = 'static' | 'derived';
export type TemplatePortValueKind = 'value' | 'trigger' | 'gate' | 'object' | 'formula-variable';
export type TemplatePortDerivation = 'builderBlocks' | 'formulaVariables' | 'runtime';
export type TemplateElementProp = 'content' | 'visible' | 'open' | 'value';
export type TemplateElementBindingSource = 'project-input' | 'runtime-output' | 'local-state';

export type TemplateBuilderBlock = {
  id: string;
  kind: TemplateBuilderBlockKind;
  label: string;
  labelI18n?: LocalizedText;
  content?: string;
  contentI18n?: LocalizedText;
  placeholder?: string;
  placeholderI18n?: LocalizedText;
};

export type TemplateFieldSpec = {
  id: string;
  label: string;
  labelI18n?: LocalizedText;
  kind: TemplateFieldKind;
  placeholder?: string;
  placeholderI18n?: LocalizedText;
  defaultValue?: string;
  defaultValueI18n?: LocalizedText;
  help?: string;
  helpI18n?: LocalizedText;
  required?: boolean;
  options?: string[];
};

export type TemplateHandleSpec = {
  id: string;
  label: string;
  labelI18n?: LocalizedText;
  position: 'top' | 'bottom' | 'left' | 'right';
  type: 'input' | 'output';
  offset: number;
};

export type TemplatePortSpec = TemplateHandleSpec & {
  source: TemplatePortSource;
  valueKind: TemplatePortValueKind;
  required?: boolean;
  description?: string;
  descriptionI18n?: LocalizedText;
  derivesFrom?: TemplatePortDerivation;
  typeConstraint?: string; // 'type:${MathTypeId}' or 'cap:${MathCapability}'
};

export type TemplateInterfaceSchema = {
  inputs: TemplatePortSpec[];
  outputs: TemplatePortSpec[];
};

export type TemplateControlPort = {
  id: string;
  label: string;
  labelI18n?: LocalizedText;
  valueKind: TemplatePortValueKind;
  defaultValue?: unknown;
};

export type TemplateElementBinding = {
  id: string;
  blockId: string;
  prop: TemplateElementProp;
  source: TemplateElementBindingSource;
  portId: string;
};

export type TemplateViewOverrides = Record<string, Partial<Record<TemplateElementProp, unknown>>>;

export type CommunityNodeTemplate = {
  id: string;
  title: string;
  titleI18n?: LocalizedText;
  summary: string;
  summaryI18n?: LocalizedText;
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
  controlPorts?: TemplateControlPort[];
  elementBindings?: TemplateElementBinding[];
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
  viewCount?: number;
  likeCount?: number;
  bookmarkCount?: number;
  forkCount?: number;
  liked?: boolean;
  bookmarked?: boolean;
  forked?: boolean;
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
  meta?: {
    workflowId?: string;
    workflowVersionId?: string;
    workflowVersion?: number;
    ownerId?: string;
    authorName?: string;
  };
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
  labelI18n: port.labelI18n,
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
