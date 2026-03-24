/**
 * Merge Registry — Declarative Merge Rules Config
 *
 * Defines which node types can be absorbed ("proxyable") into which
 * container types ("containers"), and how they behave.
 *
 * To add a new proxy type:
 *   1. Check it's listed under `proxyableTypes`
 *   2. Add an entry to `mergeRules` listing which containers accept it
 *   3. Set `slotKey` and optional `heightIncrement`
 *
 * To add a new container type:
 *   1. Add it to `containerTypes`
 *   2. Add it to the `acceptedBy` list in applicable proxyable types
 */

export type ProxyableType = 'sliderNode' | 'buttonNode' | 'gateNode' | 'textNode';
export type ContainerType = 'textNode' | 'calculateNode' | 'solveNode' | 'graphNode' | 'calculusNode' | 'gateNode' | 'rangeNode';

export interface MergeRule {
    /** Which container types accept this proxyable type */
    acceptedBy: ContainerType[];
    /** Key used in the `slots` map, and for edge rerouting */
    getSlotKey: (nodeId: string, nodeName?: string) => string;
    /** Height to add to fixed-height containers (TextNode manages its own height) */
    heightIncrement: number;
}

/** 
 * The master registry of all proxyable → container relationships.
 * Keep this as the single source of truth.
 */
export const MergeRules: Record<ProxyableType, MergeRule> = {
    sliderNode: {
        acceptedBy: ['textNode', 'calculateNode', 'solveNode'],
        getSlotKey: (_id, name) => name || 'x',
        heightIncrement: 45,
    },
    buttonNode: {
        acceptedBy: ['textNode', 'calculateNode'],
        getSlotKey: () => 'buttonNode',
        heightIncrement: 45,
    },
    gateNode: {
        acceptedBy: ['textNode', 'calculateNode'],
        getSlotKey: () => 'gateNode',
        heightIncrement: 55,
    },
    textNode: {
        acceptedBy: ['calculateNode', 'solveNode', 'graphNode', 'calculusNode', 'gateNode', 'rangeNode'],
        getSlotKey: () => 'comment',
        heightIncrement: 0, // Visual height handled by CommentArea
    },
};

/** All proxyable node types */
export const proxyableTypes = Object.keys(MergeRules) as ProxyableType[];

/** All container node types */
export const containerTypes: ContainerType[] = ['textNode', 'calculateNode', 'solveNode', 'graphNode', 'calculusNode', 'gateNode', 'rangeNode'];

/**
 * Check if a node of `aType` can be absorbed into a node of `bType`.
 */
export function canMerge(aType: string, bType: string): boolean {
    const rule = MergeRules[aType as ProxyableType];
    if (!rule) return false;
    return rule.acceptedBy.includes(bType as ContainerType);
}

/**
 * Get the slot key for a proxyable node.
 */
export function getSlotKey(aType: string, nodeName?: string): string {
    const rule = MergeRules[aType as ProxyableType];
    if (!rule) return aType;
    return rule.getSlotKey('', nodeName);
}
