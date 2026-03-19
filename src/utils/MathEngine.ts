import { ComputeEngine } from '@cortex-js/compute-engine';

// Singleton instance for global math evaluation
const ce = new ComputeEngine();

export const getMathEngine = () => {
    return ce;
};
