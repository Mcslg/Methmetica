export type WorkflowVisibility = 'public' | 'private' | 'core';

export type TemplateFieldKind = 'text' | 'textarea' | 'number' | 'select' | 'link';

export type TemplateBuilderBlockKind = 'input' | 'output' | 'text' | 'toggle' | 'math';

export type TemplateDiscoveryMode = 'search-only' | 'library-and-search';

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
  data: Record<string, any>;
  style?: Record<string, any>;
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
