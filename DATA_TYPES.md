# Methmatica Type System Draft

## Goal

This document defines a type system draft for Methmatica that is meant to be:

- hierarchical
- capability-based
- easy to filter in UI
- easy to validate in nodes
- gradual to adopt in the current codebase

The core idea is that a value is not only a type name.

A value should carry:

- its concrete type
- the mathematical families it belongs to
- the operations it supports
- its display and serialization metadata

## Why This Structure

If we only store type names like `integer` or `matrix`, node compatibility becomes too rigid.

Example:

- a sort node does not really need `integer`
- it needs values that are `ordered`

- an add node does not really need `real`
- it needs values that are `additive`

So Methmatica should support both:

- `type identity`
- `capability tags`

## Conceptual Model

Each value should eventually be described by 4 layers:

1. Concrete type
   - what the value directly is
   - examples: `integer`, `equation`, `matrix`

2. Family membership
   - which larger mathematical classes it belongs to
   - examples: `integer` belongs to `rational`, `real`, `complex`

3. Capabilities
   - what operations the value supports
   - examples: `ordered`, `additive`, `graphable`

4. Representation metadata
   - how the value should be displayed, serialized, or preserved
   - examples: exactness, LaTeX, unit, domain

## Proposed Data Shape

```ts
export type MathTypeId =
  | 'integer'
  | 'rational'
  | 'real'
  | 'complex'
  | 'boolean'
  | 'string'
  | 'symbol'
  | 'expression'
  | 'equation'
  | 'inequality'
  | 'list'
  | 'sequence'
  | 'vector'
  | 'matrix'
  | 'set'
  | 'interval'
  | 'function'
  | 'point'
  | 'error'
  | 'unknown';

export type MathCapability =
  | 'comparable'
  | 'ordered'
  | 'additive'
  | 'multiplicative'
  | 'divisible'
  | 'powerable'
  | 'negatable'
  | 'exact'
  | 'approximate'
  | 'iterable'
  | 'indexable'
  | 'sized'
  | 'graphable'
  | 'solvable'
  | 'differentiable'
  | 'integrable'
  | 'substitutable'
  | 'logical'
  | 'serializable'
  | 'renderable'
  | 'callable';

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
    sourceNodeId?: string;
    sourceHandleId?: string;
  };
};
```

## Category Catalog

These categories are mainly for organization and UI grouping.

| Category | Purpose | Example Types |
| --- | --- | --- |
| `numeric` | scalar numeric values | `integer`, `rational`, `real`, `complex` |
| `logical` | truth and conditions | `boolean`, `inequality` |
| `symbolic` | algebraic and symbolic forms | `symbol`, `expression`, `equation` |
| `collection` | multi-value containers | `list`, `sequence`, `vector`, `matrix`, `set`, `interval` |
| `functional` | mapping and formulas | `function` |
| `structural` | app-level or geometric data | `point`, `error`, `unknown`, `string` |

## Type Catalog

This is the first proposed catalog for concrete types.

### Numeric Types

| Type | Belongs To | Core Capabilities | Notes |
| --- | --- | --- | --- |
| `integer` | `rational`, `real`, `complex` | `comparable`, `ordered`, `additive`, `multiplicative`, `divisible`, `powerable`, `negatable`, `exact`, `serializable`, `renderable` | whole numbers |
| `rational` | `real`, `complex` | `comparable`, `ordered`, `additive`, `multiplicative`, `divisible`, `powerable`, `negatable`, `exact`, `serializable`, `renderable` | preserve numerator and denominator when possible |
| `real` | `complex` | `comparable`, `ordered`, `additive`, `multiplicative`, `divisible`, `powerable`, `negatable`, `approximate`, `serializable`, `renderable`, `graphable` | includes decimal approximations |
| `complex` | none | `additive`, `multiplicative`, `divisible`, `powerable`, `negatable`, `serializable`, `renderable` | not globally ordered |

### Logical Types

| Type | Belongs To | Core Capabilities | Notes |
| --- | --- | --- | --- |
| `boolean` | none | `logical`, `serializable`, `renderable` | true or false |
| `inequality` | none | `logical`, `solvable`, `renderable`, `substitutable` | relation like `x > 3` |

### Symbolic Types

| Type | Belongs To | Core Capabilities | Notes |
| --- | --- | --- | --- |
| `symbol` | `expression` | `substitutable`, `renderable`, `serializable` | atomic symbolic variable |
| `expression` | none | `substitutable`, `renderable`, `serializable`, `graphable`, `differentiable`, `integrable` | algebraic expression tree or source |
| `equation` | none | `solvable`, `renderable`, `serializable`, `substitutable` | relation of two expressions |

### Collection Types

| Type | Belongs To | Core Capabilities | Notes |
| --- | --- | --- | --- |
| `list` | none | `iterable`, `indexable`, `sized`, `serializable`, `renderable` | general ordered collection |
| `sequence` | `list` | `iterable`, `indexable`, `sized`, `serializable`, `renderable` | intended for generated progressions |
| `vector` | `list` | `iterable`, `indexable`, `sized`, `additive`, `multiplicative`, `serializable`, `renderable`, `graphable` | ordered numeric tuple |
| `matrix` | none | `indexable`, `sized`, `additive`, `multiplicative`, `serializable`, `renderable` | 2D numeric or symbolic grid |
| `set` | none | `iterable`, `sized`, `serializable`, `renderable` | unordered unique collection |
| `interval` | none | `comparable`, `serializable`, `renderable`, `graphable` | range on an ordered domain |

### Functional Types

| Type | Belongs To | Core Capabilities | Notes |
| --- | --- | --- | --- |
| `function` | none | `callable`, `graphable`, `renderable`, `serializable`, `substitutable` | symbolic or executable mapping |

### Structural Types

| Type | Belongs To | Core Capabilities | Notes |
| --- | --- | --- | --- |
| `string` | none | `serializable`, `renderable` | plain text, markdown text, labels |
| `point` | none | `serializable`, `renderable`, `graphable`, `indexable` | 2D or 3D coordinate |
| `error` | none | `serializable`, `renderable` | typed failure payload |
| `unknown` | none | `serializable` | temporary fallback when parsing is incomplete |

## Capability Catalog

This table defines the reusable operation tags.

| Capability | Meaning |
| --- | --- |
| `comparable` | values can be compared for equality or relative position under a valid rule |
| `ordered` | values have a meaningful global order like `<` and `>` |
| `additive` | values can be added and subtracted |
| `multiplicative` | values can be multiplied |
| `divisible` | values can be divided under normal math rules |
| `powerable` | exponentiation is supported |
| `negatable` | additive inverse exists |
| `exact` | exact representation can be preserved |
| `approximate` | approximate numeric representation is expected or acceptable |
| `iterable` | value can be traversed item by item |
| `indexable` | value supports positional access |
| `sized` | value has a known size or shape |
| `graphable` | value can be plotted or interpreted for visualization |
| `solvable` | value can be sent to a solver workflow |
| `differentiable` | symbolic or numeric derivative makes sense |
| `integrable` | symbolic or numeric integral makes sense |
| `substitutable` | variables or placeholders can be substituted into the value |
| `logical` | value participates in truth or condition evaluation |
| `serializable` | value can be stored, exported, or copied consistently |
| `renderable` | value has a stable UI or LaTeX representation |
| `callable` | value can be invoked with arguments |

## Membership Examples

These examples show why `belongsTo` matters.

### Integer

```ts
{
  id: 'integer',
  label: 'Integer',
  category: 'numeric',
  belongsTo: ['rational', 'real', 'complex'],
  capabilities: [
    'comparable',
    'ordered',
    'additive',
    'multiplicative',
    'divisible',
    'powerable',
    'negatable',
    'exact',
    'serializable',
    'renderable'
  ],
  convertibleTo: ['rational', 'real', 'complex', 'expression', 'string']
}
```

### Rational

```ts
{
  id: 'rational',
  label: 'Rational',
  category: 'numeric',
  belongsTo: ['real', 'complex'],
  capabilities: [
    'comparable',
    'ordered',
    'additive',
    'multiplicative',
    'divisible',
    'powerable',
    'negatable',
    'exact',
    'serializable',
    'renderable'
  ]
}
```

### Expression

```ts
{
  id: 'expression',
  label: 'Expression',
  category: 'symbolic',
  belongsTo: [],
  capabilities: [
    'substitutable',
    'renderable',
    'serializable',
    'graphable',
    'differentiable',
    'integrable'
  ],
  convertibleTo: ['string']
}
```

## Why Capabilities Are Useful

Node compatibility becomes much simpler if nodes can target capabilities, not only exact types.

Examples:

- `sort` node:
  - accepts any type with `ordered`

- `sum` node:
  - accepts values with `additive`
  - also accepts collections whose item type is `additive`

- `graph` node:
  - accepts values with `graphable`
  - likely `expression`, `function`, `point`, `vector`, `list`

- `differentiate` node:
  - accepts values with `differentiable`

This is more future-proof than hardcoding every allowed type combination.

## UI-Friendly Selection Format

To make this easy for future selectors, dropdowns, and handle validation, we can prepare a list like this:

```ts
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
    id: 'expression',
    label: 'Expression',
    category: 'symbolic',
    belongsTo: [],
    capabilities: ['substitutable', 'renderable', 'serializable', 'graphable', 'differentiable', 'integrable'],
    convertibleTo: ['string'],
    preferredDisplay: 'latex'
  }
];
```

This gives us several future UI options:

- select by category
- filter by capability
- search by type label
- show parent memberships
- show allowed conversions

## Node Compatibility Model

Instead of only writing:

- accepts `expression`

we should allow nodes to declare:

- accepted concrete types
- accepted families
- required capabilities

For example:

```ts
type NodeTypeConstraint = {
  acceptsTypes?: MathTypeId[];
  acceptsAnyOfFamilies?: MathTypeId[];
  requiresCapabilities?: MathCapability[];
  rejectsTypes?: MathTypeId[];
};
```

Examples:

```ts
const compareNodeInput: NodeTypeConstraint = {
  requiresCapabilities: ['ordered']
};

const graphNodeInput: NodeTypeConstraint = {
  acceptsTypes: ['expression', 'function', 'point', 'vector', 'list'],
  requiresCapabilities: ['graphable']
};

const solveNodeInput: NodeTypeConstraint = {
  acceptsTypes: ['equation', 'inequality', 'expression'],
  requiresCapabilities: ['solvable']
};
```

## Current Project Reality

Today most data still moves through plain strings:

- `data.value`
- `data.input`
- `data.outputs`
- `data.formula`
- `data.formulaInput`
- `globalVars`

So this document is a target architecture, not the current runtime truth.

## Current Node Mapping

This maps existing nodes to likely future typed outputs.

| Node | Current Reality | Likely Future Primary Type | Likely Capability Focus |
| --- | --- | --- | --- |
| `numberNode` | text or number-like string | `integer`, `rational`, or `real` | `ordered`, `additive` |
| `sliderNode` | numeric UI string | `real` | `ordered`, `graphable` |
| `rangeNode` | generated sequence string | `sequence` | `iterable`, `sized` |
| `calculateNode` | formula string with inputs | `expression` or numeric scalar | `substitutable`, `renderable` |
| `decimalNode` | fraction-to-float string | `real` | `approximate` |
| `calculusNode` | symbolic string | `expression` | `differentiable`, `integrable` |
| `solveNode` | equation string | `equation` plus solution list | `solvable` |
| `balanceNode` | equation and steps text | `equation` plus derivation record | `solvable`, `renderable` |
| `graphNode` | formula string and globals | `function`, `expression`, `point`, `list` | `graphable` |
| `soundNode` | formula plus scalar params | `function` with side-effect rendering | `callable` |
| `textNode` | markdown, math text, named outputs | `string`, `symbol`, `expression` | `serializable`, `renderable` |
| `appendNode` | string transport | `string` | `serializable` |
| `gateNode` | pass-through control | `unknown` plus control metadata | depends on payload |
| `forEachNode` | loop over sequence-like text | `sequence` or `list` | `iterable` |
| `codeNode` | dynamic JS object and strings | dynamic, eventually any `MathValue` | depends on returned payload |

## Suggested Selection Views

If we want this system to be easy to use in the editor later, the UI should be able to offer these views:

### View 1: By Category

- Numeric
- Symbolic
- Collection
- Functional
- Logical
- Structural

### View 2: By Capability

- Can compare
- Can add
- Can graph
- Can solve
- Can differentiate
- Can iterate

### View 3: By Family

Example for `integer`:

- belongs to Rational
- belongs to Real
- belongs to Complex

### View 4: By Conversion

Example:

- `integer -> rational`
- `rational -> real`
- `expression -> string`

## Suggested Conversion Rules

### Safe automatic conversions

- `integer -> rational`
- `integer -> real`
- `rational -> real`
- `symbol -> expression`
- `equation -> string` for display only

### Conditional conversions

- `expression -> real` only if evaluable
- `list<number> -> vector` only when target requires vector semantics
- `list<list<number>> -> matrix` only when shape is rectangular

### Avoid implicit conversions

- `list -> scalar`
- `equation -> real`
- `matrix -> list`
- `string -> expression` without explicit parsing

## Global Variables

Global variables should eventually use typed values too.

Current state:

```ts
type GlobalStore = Record<string, string>;
```

Target state:

```ts
type GlobalStore = Record<string, MathValue>;
```

That allows globals like:

- `$x` as `integer`
- `$ratio` as `rational`
- `$f` as `function`
- `$eq` as `equation`
- `$data` as `list`

## Suggested Next Files

If we start implementing this, the next practical artifacts should be:

1. `src/types/mathTypes.ts`
   - `MathTypeId`
   - `MathCapability`
   - `MathTypeDescriptor`
   - `MathValue`

2. `src/config/mathTypeCatalog.ts`
   - the actual catalog array

3. `src/utils/typeGuards.ts`
   - helpers like `hasCapability(value, 'graphable')`
   - helpers like `belongsToType(value, 'real')`

4. `src/utils/typeCompatibility.ts`
   - node input validation
   - conversion planning

## Recommendation

The best next step is not a full rewrite.

The best next step is:

- freeze this catalog shape
- create the TypeScript definitions
- encode a first catalog for 8 to 12 core types
- let nodes gradually opt into typed validation

That gives Methmatica a path toward a real mathematical type system while still fitting the current graph editor architecture.
