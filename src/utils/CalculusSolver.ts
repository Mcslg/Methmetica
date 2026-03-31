import { formatStepTree } from './calculus/formatter';
import { buildDiffStepTree } from './calculus/diffRules';
import { buildLimitStepTree } from './calculus/limitRules';

export type { CalculusStep, StepNode, StepTreeResult } from './calculus/types';

export function generateDiffSteps(formula: string, variable: string = 'x') {
    const tree = buildDiffStepTree(formula, variable);
    return tree ? formatStepTree(tree.root, variable, 'diff') : null;
}

export function generateLimitSteps(formula: string, limitPoint: string, variable: string = 'x') {
    const tree = buildLimitStepTree(formula, limitPoint, variable);
    return tree ? formatStepTree(tree.root, variable, 'limit') : null;
}
