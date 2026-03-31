import { ComputeEngine } from '@cortex-js/compute-engine';

// Singleton instance for global math evaluation
const ce = new ComputeEngine();

export const getMathEngine = () => {
    return ce;
};

export const getMathSymbol = (variable: string = 'x') => {
    const normalized = variable.trim() || 'x';
    return ce.parse(normalized);
};
