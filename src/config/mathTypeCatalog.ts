import type { MathTypeDescriptor, MathTypeId, MathCapability } from '../types/mathTypes';

export const mathTypeCatalog: MathTypeDescriptor[] = [
  {
    id: 'integer',
    label: 'Integer',
    category: 'numeric',
    belongsTo: ['rational', 'real', 'complex'],
    capabilities: ['comparable', 'ordered', 'additive', 'multiplicative', 'divisible', 'powerable', 'negatable', 'exact', 'serializable', 'renderable'],
    convertibleTo: ['rational', 'real', 'complex', 'expression', 'string'],
    preferredDisplay: 'plain'
  },
  {
    id: 'rational',
    label: 'Rational',
    category: 'numeric',
    belongsTo: ['real', 'complex'],
    capabilities: ['comparable', 'ordered', 'additive', 'multiplicative', 'divisible', 'powerable', 'negatable', 'exact', 'serializable', 'renderable'],
    preferredDisplay: 'plain'
  },
  {
    id: 'real',
    label: 'Real',
    category: 'numeric',
    belongsTo: ['complex'],
    capabilities: ['comparable', 'ordered', 'additive', 'multiplicative', 'divisible', 'powerable', 'negatable', 'approximate', 'serializable', 'renderable', 'graphable'],
    preferredDisplay: 'plain'
  },
  {
    id: 'complex',
    label: 'Complex',
    category: 'numeric',
    belongsTo: [],
    capabilities: ['additive', 'multiplicative', 'divisible', 'powerable', 'negatable', 'serializable', 'renderable'],
    preferredDisplay: 'plain'
  },
  {
    id: 'boolean',
    label: 'Boolean',
    category: 'logical',
    belongsTo: [],
    capabilities: ['logical', 'serializable', 'renderable'],
    preferredDisplay: 'plain'
  },
  {
    id: 'inequality',
    label: 'Inequality',
    category: 'logical',
    belongsTo: [],
    capabilities: ['logical', 'solvable', 'renderable', 'substitutable'],
    preferredDisplay: 'latex'
  },
  {
    id: 'symbol',
    label: 'Symbol',
    category: 'symbolic',
    belongsTo: ['expression'],
    capabilities: ['substitutable', 'renderable', 'serializable'],
    preferredDisplay: 'latex'
  },
  {
    id: 'expression',
    label: 'Expression',
    category: 'symbolic',
    belongsTo: [],
    capabilities: ['substitutable', 'renderable', 'serializable', 'graphable', 'differentiable', 'integrable'],
    convertibleTo: ['string'],
    preferredDisplay: 'latex'
  },
  {
    id: 'equation',
    label: 'Equation',
    category: 'symbolic',
    belongsTo: [],
    capabilities: ['solvable', 'renderable', 'serializable', 'substitutable'],
    preferredDisplay: 'latex'
  },
  {
    id: 'list',
    label: 'List',
    category: 'collection',
    belongsTo: [],
    capabilities: ['iterable', 'indexable', 'sized', 'serializable', 'renderable'],
    preferredDisplay: 'json'
  },
  {
    id: 'sequence',
    label: 'Sequence',
    category: 'collection',
    belongsTo: ['list'],
    capabilities: ['iterable', 'indexable', 'sized', 'serializable', 'renderable'],
    preferredDisplay: 'json'
  },
  {
    id: 'vector',
    label: 'Vector',
    category: 'collection',
    belongsTo: ['list'],
    capabilities: ['iterable', 'indexable', 'sized', 'additive', 'multiplicative', 'serializable', 'renderable', 'graphable'],
    preferredDisplay: 'matrix'
  },
  {
    id: 'matrix',
    label: 'Matrix',
    category: 'collection',
    belongsTo: [],
    capabilities: ['indexable', 'sized', 'additive', 'multiplicative', 'serializable', 'renderable'],
    preferredDisplay: 'matrix'
  },
  {
    id: 'function',
    label: 'Function',
    category: 'functional',
    belongsTo: [],
    capabilities: ['callable', 'graphable', 'renderable', 'serializable', 'substitutable'],
    preferredDisplay: 'latex'
  },
  {
    id: 'string',
    label: 'String',
    category: 'structural',
    belongsTo: [],
    capabilities: ['serializable', 'renderable'],
    preferredDisplay: 'plain'
  },
  {
    id: 'any',
    label: 'Any Type',
    category: 'structural',
    belongsTo: [],
    capabilities: ['any'],
    preferredDisplay: 'plain'
  }
];

export const getTypesByCapability = (capability: MathCapability): MathTypeId[] => {
    if (capability === 'any') return ['any'];
    return mathTypeCatalog.filter(type => type.capabilities.includes(capability)).map(t => t.id);
};

export const getTypeById = (id: string): MathTypeDescriptor | undefined => {
    return mathTypeCatalog.find(t => t.id === id);
};

export const getAllCapabilities = (): MathCapability[] => {
    const caps = new Set<MathCapability>();
    mathTypeCatalog.forEach(t => t.capabilities.forEach(c => caps.add(c)));
    return Array.from(caps).sort();
};
