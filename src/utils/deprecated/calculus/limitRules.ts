import { getMathEngine, getMathSymbol } from '../../MathEngine';
import type { StepNode, StepTreeResult } from './types';

type LimitExpressionNode = {
    head?: string;
    ops?: LimitExpressionNode[];
    latex?: string;
    isFinite?: boolean;
    isZero?: boolean;
};

export function buildLimitStepTree(formula: string, limitPoint: string, variable: string = 'x'): StepTreeResult | null {
    if (!formula) return null;

    const ce = getMathEngine();
    const variableSymbol = getMathSymbol(variable);
    type BoxInput = NonNullable<ReturnType<typeof ce.parse>>;

    try {
        let lp = String(limitPoint).trim().toLowerCase();
        if (lp === '' || lp === 'inf' || lp === 'infinity' || lp === '∞' || lp === '\\infty') lp = 'Infinity';
        else if (lp === '-inf' || lp === '-infinity' || lp === '-∞' || lp === '-\\infty') lp = '-Infinity';

        const expr = ce.parse(formula);
        const targetValue = ce.parse(lp === 'Infinity' ? '\\infty' : lp === '-Infinity' ? '-\\infty' : lp);
        const lpDisplay = lp === 'Infinity' ? '\\infty' : lp === '-Infinity' ? '-\\infty' : lp;
        const displayTarget = lp === 'Infinity' ? '∞' : lp === '-Infinity' ? '-∞' : lp;

        const root: StepNode = {
            rule: 'limit-start',
            explanationKey: 'limit-start',
            inputLatex: `\\lim_{${variable} \\to ${lpDisplay}} ${expr.latex}`,
            outputLatex: `\\lim_{${variable} \\to ${lpDisplay}} ${expr.latex}`,
            children: [],
            meta: { displayTarget }
        };

        const sub = ce.box(['Replace', expr, ce.box(['Equal', variableSymbol, targetValue])]).evaluate();
        if (sub.isFinite) {
            root.children.push({
                rule: 'limit-direct-substitution',
                explanationKey: 'limit-direct-substitution',
                inputLatex: root.inputLatex,
                outputLatex: `= ${sub.latex}`,
                children: []
            });
            return { root, finalLatex: sub.latex };
        }

        const exprNode = expr as LimitExpressionNode;
        const exprHead = exprNode.head;
        if (exprHead === 'Divide') {
            const exprOps: LimitExpressionNode[] = exprNode.ops ?? [];
            const num = exprOps[0];
            const den = exprOps[1];

            if (num && den) {
                const numExpr = num as BoxInput;
                const denExpr = den as BoxInput;
                const numSub = ce.box(['Replace', numExpr, ce.box(['Equal', variableSymbol, targetValue])]).evaluate();
                const denSub = ce.box(['Replace', denExpr, ce.box(['Equal', variableSymbol, targetValue])]).evaluate();
                const numIsZero = (numSub as LimitExpressionNode).isZero || false;
                const denIsZero = (denSub as LimitExpressionNode).isZero || false;

                if ((numIsZero && denIsZero) || (!numSub.isFinite && !denSub.isFinite)) {
                    const dNum = ce.box(['D', numExpr, variableSymbol]).evaluate();
                    const dDen = ce.box(['D', denExpr, variableSymbol]).evaluate();
                    const ratio = ce.box(['Divide', dNum, dDen]).simplify();
                    root.children.push({
                        rule: 'limit-lhopital',
                        explanationKey: 'limit-lhopital',
                        inputLatex: root.inputLatex,
                        outputLatex: '\\lim \\frac{f(x)}{g(x)} = \\lim \\frac{f\'(x)}{g\'(x)}',
                        children: [
                            {
                                rule: 'limit-lhopital-derivatives',
                                explanationKey: 'limit-lhopital-derivatives',
                                inputLatex: root.inputLatex,
                                outputLatex: `\\lim_{${variable} \\to ${lpDisplay}} \\frac{${dNum.latex}}{${dDen.latex}}`,
                                children: [],
                                meta: { numeratorLatex: dNum.latex, denominatorLatex: dDen.latex }
                            },
                            {
                                rule: 'limit-lhopital-simplify',
                                explanationKey: 'limit-lhopital-simplify',
                                inputLatex: root.inputLatex,
                                outputLatex: `\\lim_{${variable} \\to ${lpDisplay}} ${ratio.latex}`,
                                children: []
                            }
                        ],
                        meta: { indeterminateForm: numIsZero ? '0/0' : '∞/∞' }
                    });
                    return { root, finalLatex: ratio.latex };
                }
            }
        }

        root.children.push({
            rule: 'limit-diverges',
            explanationKey: 'limit-diverges',
            inputLatex: root.inputLatex,
            outputLatex: '= \\pm\\infty \\text{ (or Undefined)}',
            children: []
        });
        return { root };
    } catch (e) {
        console.warn('buildLimitStepTree failed:', e);
        return null;
    }
}
