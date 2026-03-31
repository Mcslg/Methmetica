import { getMathEngine, getMathSymbol } from '../MathEngine';
import type { StepNode, StepTreeResult } from './types';

interface RuleContext {
    variable: string;
    variableSymbol: any;
    annotate: (node: any) => StepNode;
    latex: (node: any) => string;
}

interface DiffRule {
    name: string;
    matches: (node: any, context: RuleContext) => boolean;
    apply: (node: any, context: RuleContext) => StepNode;
}

const trigMap: Record<string, string> = {
    Sin: '\\cos(ARG)',
    Cos: '-\\sin(ARG)',
    Tan: '\\sec^2(ARG)',
    Ln: '\\frac{1}{ARG}',
    Log: '\\frac{1}{ARG}',
    Exp: 'e^{ARG}',
    Sqrt: '\\frac{1}{2\\sqrt{ARG}}',
    Arcsin: '\\frac{1}{\\sqrt{1-(ARG)^2}}',
    Arccos: '\\frac{-1}{\\sqrt{1-(ARG)^2}}',
    Arctan: '\\frac{1}{1+(ARG)^2}',
};

const diffRules: DiffRule[] = [
    {
        name: 'symbol',
        matches: (node) => node?.symbol !== undefined,
        apply: (node, context) => {
            const sym = node.symbol;
            if (sym === context.variable) {
                return {
                    rule: 'symbol',
                    explanationKey: 'diff-symbol-self',
                    inputLatex: context.latex(node),
                    outputLatex: `\\frac{d}{d${context.variable}}(${context.variable}) = 1`,
                    children: []
                };
            }

            return {
                rule: 'symbol',
                explanationKey: 'diff-symbol-constant',
                inputLatex: context.latex(node),
                outputLatex: `\\frac{d}{d${context.variable}}\\left(${context.latex(node)}\\right) = 0`,
                children: []
            };
        }
    },
    {
        name: 'number',
        matches: (node) => node?.head === 'Number' || (node?.numericValue !== null && node?.numericValue !== undefined && !node?.symbol && !(node?.ops?.length)),
        apply: (node, context) => ({
            rule: 'number',
            explanationKey: 'diff-number-constant',
            inputLatex: context.latex(node),
            outputLatex: `\\frac{d}{d${context.variable}}\\left(${context.latex(node)}\\right) = 0`,
            children: []
        })
    },
    {
        name: 'sum',
        matches: (node) => node?.head === 'Add',
        apply: (node, context) => ({
            rule: 'sum',
            explanationKey: 'diff-sum',
            inputLatex: context.latex(node),
            outputLatex: `\\frac{d}{d${context.variable}}\\left(${context.latex(node)}\\right) = \\text{(逐項求導之和)}`,
            children: (node.ops ?? []).map((op: any) => context.annotate(op))
        })
    },
    {
        name: 'multiply',
        matches: (node) => node?.head === 'Multiply',
        apply: (node, context) => {
            const ops: any[] = node.ops ?? [];
            const consts = ops.filter((op: any) =>
                (op.numericValue !== null && op.numericValue !== undefined && !op.ops?.length) ||
                (op.symbol !== undefined && op.symbol !== context.variable)
            );
            const funcs = ops.filter((op: any) => !consts.includes(op));

            if (consts.length > 0 && funcs.length > 0) {
                const constantLatex = consts.map(context.latex).join(' \\cdot ');
                const functionLatex = funcs.map(context.latex).join(' \\cdot ');
                return {
                    rule: 'multiply-constant-multiple',
                    explanationKey: 'diff-constant-multiple',
                    inputLatex: context.latex(node),
                    outputLatex: `\\frac{d}{d${context.variable}}\\left(${context.latex(node)}\\right) = ${constantLatex} \\cdot \\frac{d}{d${context.variable}}\\left(${functionLatex}\\right)`,
                    children: funcs.map((op: any) => context.annotate(op)),
                    meta: { constantLatex }
                };
            }

            if (ops.length === 2) {
                const [u, v] = ops;
                return {
                    rule: 'multiply-product',
                    explanationKey: 'diff-product',
                    inputLatex: context.latex(node),
                    outputLatex: `\\frac{d}{d${context.variable}}\\left(${context.latex(u)} \\cdot ${context.latex(v)}\\right) = \\frac{d(${context.latex(u)})}{d${context.variable}} \\cdot ${context.latex(v)} + ${context.latex(u)} \\cdot \\frac{d(${context.latex(v)})}{d${context.variable}}`,
                    children: [context.annotate(u), context.annotate(v)]
                };
            }

            return {
                rule: 'multiply-many',
                explanationKey: 'diff-product-many',
                inputLatex: context.latex(node),
                outputLatex: `\\frac{d}{d${context.variable}}\\left(${context.latex(node)}\\right)`,
                children: []
            };
        }
    },
    {
        name: 'divide',
        matches: (node) => node?.head === 'Divide' && (node?.ops?.length ?? 0) === 2,
        apply: (node, context) => {
            const [u, v] = node.ops;
            return {
                rule: 'divide',
                explanationKey: 'diff-quotient',
                inputLatex: context.latex(node),
                outputLatex: `\\frac{d}{d${context.variable}}\\left(\\frac{${context.latex(u)}}{${context.latex(v)}}\\right) = \\frac{\\frac{d(${context.latex(u)})}{d${context.variable}} \\cdot ${context.latex(v)} - ${context.latex(u)} \\cdot \\frac{d(${context.latex(v)})}{d${context.variable}}}{\\left(${context.latex(v)}\\right)^2}`,
                children: [context.annotate(u), context.annotate(v)]
            };
        }
    },
    {
        name: 'power',
        matches: (node) => node?.head === 'Power' && (node?.ops?.length ?? 0) === 2,
        apply: (node, context) => {
            const [base, exp] = node.ops;
            const baseLatex = context.latex(base);
            const expVal: number | undefined = typeof exp.numericValue === 'number' ? exp.numericValue : undefined;

            if (base.symbol === context.variable && expVal !== undefined) {
                return {
                    rule: 'power-simple',
                    explanationKey: 'diff-power-simple',
                    inputLatex: context.latex(node),
                    outputLatex: `\\frac{d}{d${context.variable}}\\left(${context.latex(node)}\\right) = ${expVal}${context.variable}^{${expVal - 1}}`,
                    children: [],
                    meta: { exponent: expVal }
                };
            }

            if (expVal !== undefined) {
                return {
                    rule: 'power-chain',
                    explanationKey: 'diff-power-chain',
                    inputLatex: context.latex(node),
                    outputLatex: `\\frac{d}{d${context.variable}}\\left(${context.latex(node)}\\right) = ${expVal} \\cdot \\left(${baseLatex}\\right)^{${expVal - 1}} \\cdot \\frac{d(${baseLatex})}{d${context.variable}}`,
                    children: [context.annotate(base)],
                    meta: { exponent: expVal }
                };
            }

            return {
                rule: 'power-generic',
                explanationKey: 'diff-power-generic',
                inputLatex: context.latex(node),
                outputLatex: `\\frac{d}{d${context.variable}}\\left(${context.latex(node)}\\right) = ${context.latex(node)} \\cdot \\ln(${baseLatex})`,
                children: []
            };
        }
    },
    {
        name: 'basic-function',
        matches: (node) => Boolean(node?.head && trigMap[node.head] && (node?.ops?.length ?? 0) >= 1),
        apply: (node, context) => {
            const arg = node.ops[0];
            const argumentLatex = context.latex(arg);
            const outerForm = trigMap[node.head].replace(/ARG/g, argumentLatex);
            const children: StepNode[] = [];

            if (arg.symbol !== context.variable) {
                children.push({
                    rule: 'chain-inner',
                    explanationKey: 'diff-chain-inner',
                    inputLatex: `\\frac{d}{d${context.variable}}(${argumentLatex})`,
                    outputLatex: `\\frac{d}{d${context.variable}}(${argumentLatex})`,
                    children: [context.annotate(arg)],
                    meta: { argumentLatex }
                });
            }

            return {
                rule: 'basic-function',
                explanationKey: 'diff-basic-function',
                inputLatex: context.latex(node),
                outputLatex: `\\frac{d}{d${context.variable}}\\left(${context.latex(node)}\\right) = ${outerForm} \\cdot \\frac{d(${argumentLatex})}{d${context.variable}}`,
                children,
                meta: { functionName: node.head, argumentLatex }
            };
        }
    },
    {
        name: 'fallback',
        matches: () => true,
        apply: (node, context) => ({
            rule: 'fallback',
            explanationKey: 'diff-fallback',
            inputLatex: context.latex(node),
            outputLatex: `\\frac{d}{d${context.variable}}\\left(${context.latex(node)}\\right)`,
            children: []
        })
    }
];

export function buildDiffStepTree(formula: string, variable: string = 'x'): StepTreeResult | null {
    if (!formula) return null;

    const ce = getMathEngine();
    const variableSymbol = getMathSymbol(variable);

    try {
        const expr = ce.parse(formula);
        let depth = 0;

        const latex = (node: any): string => {
            try {
                return node?.latex ?? String(node);
            } catch {
                return '?';
            }
        };

        const annotate = (node: any): StepNode => {
            depth++;
            if (depth > 30 || !node) {
                depth--;
                return {
                    rule: 'fallback',
                    explanationKey: 'diff-fallback',
                    inputLatex: '?',
                    outputLatex: `\\frac{d}{d${variable}}(?)`,
                    children: []
                };
            }

            const context: RuleContext = {
                variable,
                variableSymbol,
                annotate,
                latex
            };

            const rule = diffRules.find((candidate) => candidate.matches(node, context)) ?? diffRules[diffRules.length - 1];
            const result = rule.apply(node, context);
            depth--;
            return result;
        };

        const root = annotate(expr);
        const finalLatex = ce.box(['D', expr, variableSymbol]).evaluate().latex;

        root.children.push({
            rule: 'final',
            explanationKey: 'diff-final',
            inputLatex: expr.latex,
            outputLatex: `\\frac{d}{d${variable}}\\left(${expr.latex}\\right) = ${finalLatex}`,
            children: []
        });

        return { root, finalLatex };
    } catch (e) {
        console.warn('buildDiffStepTree failed:', e);
        return null;
    }
}
