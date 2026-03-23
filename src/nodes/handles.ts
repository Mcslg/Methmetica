import { type CustomHandle } from '../store/useStore';

export const dataNodeHandles: CustomHandle[] = [
    { id: 'h-in', type: 'input', position: 'left', offset: 50 },
    { id: 'h-out', type: 'output', position: 'right', offset: 50 }
];

export const toolNodeHandles: CustomHandle[] = [
    { id: 'h-in', type: 'input', position: 'left', offset: 50 },
    { id: 'h-out', type: 'output', position: 'right', offset: 50 },
];

export const calculusNodeHandles: CustomHandle[] = [
    { id: 'h-in', type: 'input', position: 'left', offset: 50 },
    { id: 'h-out', type: 'output', position: 'right', offset: 50 },
];

export const textNodeHandles: CustomHandle[] = [];

export const buttonNodeHandles: CustomHandle[] = [
    { id: 'h-tr-out', type: 'trigger-out', position: 'right', offset: 50 }
];

export const appendNodeHandles: CustomHandle[] = [
    { id: 'h-in', type: 'input', position: 'left', offset: 50 },
];

export const insertNodeHandles: CustomHandle[] = [
    { id: 'h-in', type: 'input', position: 'left', offset: 30, label: 'Value' },
    { id: 'h-index', type: 'input', position: 'left', offset: 70, label: 'Line index' },
];

export const gateNodeHandles: CustomHandle[] = [
    { id: 'h-in', type: 'input', position: 'top', offset: 50 },
    { id: 'h-tr-in', type: 'trigger-in', position: 'left', offset: 50 },
    { id: 'h-tr-out', type: 'trigger-out', position: 'right', offset: 50 },
];

export const rangeNodeHandles: CustomHandle[] = [
    { id: 'h-out', type: 'output', position: 'right', offset: 50 }
];

export const forEachNodeHandles: CustomHandle[] = [
    { id: 'h-tr-in', type: 'trigger-in', position: 'left', offset: 30 },
    { id: 'h-seq-in', type: 'input', position: 'left', offset: 70 },
    { id: 'h-tr-out', type: 'trigger-out', position: 'right', offset: 50 }
];

export const graphNodeHandles: CustomHandle[] = [
    { id: 'h-fn-in', type: 'input', position: 'left', offset: 50, label: 'f(x)' }
];

export const sliderNodeHandles: CustomHandle[] = [
    { id: 'h-out', type: 'output', position: 'right', offset: 50, label: 'val' }
];
