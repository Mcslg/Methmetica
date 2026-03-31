import type { CalculusStep, StepNode } from './types';

function formatDiffLabel(node: StepNode, variable: string): string {
    switch (node.explanationKey) {
        case 'diff-symbol-self':
            return `變數 ${variable} 對自身求導為 1`;
        case 'diff-symbol-constant':
            return `常數 ${node.inputLatex} 的導數為 0`;
        case 'diff-number-constant':
            return '常數項的導數為 0';
        case 'diff-sum':
            return '加法法則：對每一項分別求導';
        case 'diff-constant-multiple':
            return `係數法則：提出常數 ${node.meta?.constantLatex ?? ''}`;
        case 'diff-product':
            return "乘法法則 (Product Rule)：(uv)' = u'v + uv'";
        case 'diff-product-many':
            return '多項乘積';
        case 'diff-quotient':
            return "除法法則 (Quotient Rule)：(u/v)' = (u'v − uv') / v²";
        case 'diff-power-simple':
            return `冪次法則 (Power Rule)：將次方 ${node.meta?.exponent ?? ''} 移到前面，次方減 1`;
        case 'diff-power-chain':
            return '廣義冪次法則 + 連鎖律';
        case 'diff-power-generic':
            return '指數函數微分';
        case 'diff-basic-function':
            return `基本微分公式：${String(node.meta?.functionName ?? '').toLowerCase()}(u)，其中 u = ${node.meta?.argumentLatex ?? ''}`;
        case 'diff-chain-inner':
            return `連鎖律：對內部 ${node.meta?.argumentLatex ?? ''} 求導`;
        case 'diff-fallback':
            return '複合結構，應用廣義連鎖律';
        case 'diff-final':
            return '最終結果';
        default:
            return `微分步驟：${variable}`;
    }
}

function formatLimitLabel(node: StepNode): string {
    switch (node.explanationKey) {
        case 'limit-start':
            return `求極限：x 趨近於 ${node.meta?.displayTarget ?? ''}`;
        case 'limit-direct-substitution':
            return '直接代入成功';
        case 'limit-lhopital':
            return `出現未定型 ${node.meta?.indeterminateForm ?? ''}，應用羅比達定理 (L'Hôpital's Rule)`;
        case 'limit-lhopital-derivatives':
            return `分子求導：${node.meta?.numeratorLatex ?? ''}，分母求導：${node.meta?.denominatorLatex ?? ''}`;
        case 'limit-lhopital-simplify':
            return '化簡後再計算極限';
        case 'limit-diverges':
            return '結果無界或發散';
        default:
            return '極限步驟';
    }
}

function flatten(node: StepNode, variable: string, variant: 'diff' | 'limit', steps: CalculusStep[]): void {
    const label = variant === 'diff' ? formatDiffLabel(node, variable) : formatLimitLabel(node);
    steps.push({
        label,
        latex: node.outputLatex ?? node.inputLatex
    });

    node.children.forEach((child) => flatten(child, variable, variant, steps));
}

export function formatStepTree(root: StepNode, variable: string, variant: 'diff' | 'limit'): CalculusStep[] {
    const steps: CalculusStep[] = [];
    flatten(root, variable, variant, steps);
    return steps;
}
