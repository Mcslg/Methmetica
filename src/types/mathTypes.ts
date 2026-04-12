export type MathTypeId =
  | 'integer' | 'rational' | 'real' | 'complex' | 'boolean' | 'string' | 'symbol'
  | 'expression' | 'equation' | 'inequality' | 'list' | 'sequence' | 'vector'
  | 'matrix' | 'set' | 'interval' | 'function' | 'point' | 'error' | 'unknown' | 'any';

export type MathCapability =
  | 'comparable' | 'ordered' | 'additive' | 'multiplicative' | 'divisible'
  | 'powerable' | 'negatable' | 'exact' | 'approximate' | 'iterable'
  | 'indexable' | 'sized' | 'graphable' | 'solvable' | 'differentiable'
  | 'integrable' | 'substitutable' | 'logical' | 'serializable' | 'renderable'
  | 'callable' | 'any';

export type MathTypeDescriptor = {
  id: MathTypeId;
  label: string;
  category: string;
  belongsTo: MathTypeId[];
  capabilities: MathCapability[];
  convertibleTo?: MathTypeId[];
  preferredDisplay?: 'plain' | 'latex' | 'json' | 'matrix';
  notes?: string;
};

export type MathValue = {
  type: MathTypeId;
  value: unknown;
  display?: string;
  latex?: string;
  text?: string;
  tags?: string[];
  meta?: {
    exact?: boolean;
    approximate?: boolean;
    unit?: string;
    domain?: string;
    shape?: number[];
    source?: string;
    name?: string;
    isGlobal?: boolean;
    parseStatus?: 'classified' | 'parsed' | 'fallback' | 'error';
    confidence?: number;
    sourceNodeId?: string;
    sourceHandleId?: string;
  };
};
