import { getMathEngine, getMathSymbol } from '../MathEngine';
import type { StepNode, StepTreeResult } from './types';

export function buildLimitStepTree(formula: string, limitPoint: string, variable: string = 'x'): StepTreeResult | null {
    if (!formula) return null;

    const ce = getMathEngine();
    const variableSymbol = getMathSymbol(variable);

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

        const exprHead = (expr as any).head;
        if (exprHead === 'Divide') {
            const exprOps: any[] = (expr as any).ops ?? [];
            const num = exprOps[0];
            const den = exprOps[1];

            if (num && den) {
                const numSub = ce.box(['Replace', num, ce.box(['Equal', variableSymbol, targetValue])]).evaluate();
                const denSub = ce.box(['Replace', den, ce.box(['Equal', variableSymbol, targetValue])]).evaluate();
                const numIsZero = (numSub as any).isZero || false;
                const denIsZero = (denSub as any).isZero || false;

                if ((numIsZero && denIsZero) || (!numSub.isFinite && !denSub.isFinite)) {
                    const dNum = ce.box(['D', num, variableSymbol]).evaluate();
                    const dDen = ce.box(['D', den, variableSymbol]).evaluate();
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
