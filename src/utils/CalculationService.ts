import { getMathEngine, getMathSymbol } from './MathEngine';
import useStore, { type AppNode } from '../store/useStore';
import { type Edge } from '@xyflow/react';
// @ts-ignore
import nerdamer from 'nerdamer/all.min';

export interface ExecutionContext {
    nodes: AppNode[];
    edges: Edge[];
}

export class CalculationService {
    static async calculate(node: AppNode, context: ExecutionContext): Promise<string> {
        const type = node.type || '';

        switch (type) {
            case 'decimalNode':
                return this.executeDecimal(node);
            case 'calculusNode':
                return this.executeCalculus(node);
            case 'calculateNode':
            case 'solveNode':
            case 'functionNode':
            case 'addNode':
            case 'toolNode':
            case 'graphNode':
                return this.executeFunction(node, context);
            case 'balanceNode':
                return this.executeBalance(node);
            default:
                throw new Error('Unknown node type');
        }
    }

    private static executeBalance(node: AppNode): string {
        const inputEq = node.data.input || '';
        if (!inputEq || !inputEq.includes('=')) return inputEq;

        const ce = getMathEngine();
        const parts = inputEq.split('=');
        if (parts.length !== 2) return inputEq;

        let [lhs, rhs] = parts;
        
        const ops = node.data.operations || [];
        for (const op of ops) {
            let funcName = '';
            if (op.op === '+') funcName = 'Add';
            if (op.op === '-') funcName = 'Subtract';
            if (op.op === '*') funcName = 'Multiply';
            if (op.op === '/') funcName = 'Divide';

            if (funcName) {
                ce.pushScope();
                // Find all symbols in the current sides and "unassign" them locally
                // to prevent global variable substitution during balance operations.
                try {
                    const lFull = ce.parse(lhs);
                    const rFull = ce.parse(rhs);
                    const allSymbols = new Set([...lFull.symbols, ...rFull.symbols]);
                    allSymbols.forEach(s => {
                        ce.assign(s, ce.parse(s)); // Force it to be itself (a symbol)
                    });

                    const lExpr = ce.box([funcName, lFull, ce.parse(op.value)]).simplify();
                    const rExpr = ce.box([funcName, rFull, ce.parse(op.value)]).simplify();
                    lhs = lExpr.latex || lExpr.toString();
                    rhs = rExpr.latex || rExpr.toString();
                } catch (e) {
                    console.error('Balance error', e);
                }
                ce.popScope();
            } else if (op.op === '(' && op.value) {
                const wrap = (s: string) => {
                    const escapeRegex = (value: string) => value.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                    const regex = new RegExp(escapeRegex(op.value).replace(/\s+/g, '\\s*'));
                    const match = s.match(regex);
                    if (!match || match.index === undefined) return s;

                    const before = s.slice(0, match.index);
                    const targetLatex = `\\left( ${op.value} \\right)`;
                    return `${before}${targetLatex}${s.slice(match.index + match[0].length)}`;
                };

                if (op.targetSide === 'lhs') lhs = wrap(lhs);
                else if (op.targetSide === 'rhs') rhs = wrap(rhs);
                else {
                    lhs = wrap(lhs);
                    rhs = wrap(rhs);
                }
            } else if (op.op === 'factor' && op.value && op.factor && op.result) {
                const factorize = (s: string) => {
                    const escapeRegex = (value: string) => value.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                    const regex = new RegExp(escapeRegex(op.value).replace(/\s+/g, '\\s*'));
                    const match = s.match(regex);
                    if (!match || match.index === undefined) return s;

                    const replacement = op.factor === '-1'
                        ? `-\\left(${op.result}\\right)`
                        : `${op.factor}\\left(${op.result}\\right)`;

                    return `${s.slice(0, match.index)}${replacement}${s.slice(match.index + match[0].length)}`;
                };

                if (op.targetSide === 'lhs') lhs = factorize(lhs);
                else if (op.targetSide === 'rhs') rhs = factorize(rhs);
                else {
                    lhs = factorize(lhs);
                    rhs = factorize(rhs);
                }
            } else if (op.op === 'expand' && op.value && op.result) {
                const expand = (s: string) => {
                    const escapeRegex = (value: string) => value.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                    const regex = new RegExp(escapeRegex(op.value).replace(/\s+/g, '\\s*'));
                    const match = s.match(regex);
                    if (!match || match.index === undefined) return s;

                    return `${s.slice(0, match.index)}${op.result}${s.slice(match.index + match[0].length)}`;
                };

                if (op.targetSide === 'lhs') lhs = expand(lhs);
                else if (op.targetSide === 'rhs') rhs = expand(rhs);
                else {
                    lhs = expand(lhs);
                    rhs = expand(rhs);
                }
            } else if (op.op === 'simplify' && op.value && op.result) {
                const simplifySelection = (s: string) => {
                    const escapeRegex = (value: string) => value.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                    const regex = new RegExp(escapeRegex(op.value).replace(/\s+/g, '\\s*'));
                    const match = s.match(regex);
                    if (!match || match.index === undefined) return s;

                    return `${s.slice(0, match.index)}${op.result}${s.slice(match.index + match[0].length)}`;
                };

                if (op.targetSide === 'lhs') lhs = simplifySelection(lhs);
                else if (op.targetSide === 'rhs') rhs = simplifySelection(rhs);
                else {
                    lhs = simplifySelection(lhs);
                    rhs = simplifySelection(rhs);
                }
            }
        }

        const res = `${lhs}=${rhs}`;
        
        // Synchronize the computed result to the currentFormula state, but avoid immediate re-render loops.
        if (node.data.currentFormula !== res) {
            setTimeout(() => {
                useStore.getState().updateNodeData(node.id, { currentFormula: res });
            }, 0);
        }

        return res;
    }

    private static executeDecimal(node: AppNode): string {
        const inputVal = node.data.input || node.data.value;
        if (!inputVal) return '--';

        let clean = inputVal.replace(/\\/g, '');
        if (clean.includes('frac')) {
            const matches = clean.match(/frac\{(\d+)\}\{(\d+)\}/);
            if (matches && matches.length === 3) {
                const numerator = parseInt(matches[1]);
                const denominator = parseInt(matches[2]);
                if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
                    return (numerator / denominator).toString();
                }
            }
        }
        const num = parseFloat(clean);
        return !isNaN(num) ? num.toString() : inputVal;
    }

    private static async executeCalculus(node: AppNode): Promise<string> {
        const inputVal = node.data.input || node.data.value;
        if (!inputVal) throw new Error('No input');

        const ce = getMathEngine();
        const variant = node.data.variant || 'diff';
        const wrt = node.data.variable || 'x';
        const wrtSymbol = getMathSymbol(wrt);

        const expr = ce.parse(inputVal);
        let result;
        if (variant === 'diff') {
            result = ce.box(['D', expr, wrtSymbol]).evaluate();
        } else if (variant === 'integ') {
            result = ce.box(['Integrate', expr, wrtSymbol]).evaluate();
        } else if (variant === 'limit') {
            const limitPoint = node.data.limitPoint !== undefined ? node.data.limitPoint : '';
            
            // Clean up limit point input
            let lp = String(limitPoint).trim().toLowerCase();
            // Map inf keywords to nerdamer's Infinity token
            if (lp === '' || lp === 'inf' || lp === 'infinity' || lp === '∞' || lp === '\\infty') {
                lp = 'Infinity';
            } else if (lp === '-inf' || lp === '-infinity' || lp === '-∞' || lp === '-\\infty') {
                lp = '-Infinity';
            }

            // Helper: convert LaTeX to nerdamer-friendly string
            const latexToNerdamer = (s: string): string =>
                s.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
                 .replace(/\\left\(/g, '(').replace(/\\right\)/g, ')')
                 .replace(/\\sin/g, 'sin').replace(/\\cos/g, 'cos')
                 .replace(/\\tan/g, 'tan').replace(/\\ln/g, 'log')
                 .replace(/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)')
                 .replace(/\\cdot/g, '*')
                 .replace(/\{/g, '(').replace(/\}/g, ')')
                 .replace(/\\/g, '')
                 .trim();

            // Helper: numerical two-sided limit approximation
            const numericalLimit = (exprStr: string, varName: string, target: string): string | null => {
                try {
                    const a = target === 'Infinity' ? 1e12 : target === '-Infinity' ? -1e12 : parseFloat(target);
                    if (isNaN(a)) return null;
                    const epsilon = Math.abs(a) > 1 ? Math.abs(a) * 1e-7 : 1e-7;
                    const evalAt = (v: number): number => {
                        const expr2 = ce.parse(exprStr);
                        const sub = ce.box(['Replace', expr2, ce.box(['Equal', getMathSymbol(varName), v])]).evaluate();
                        return Number(sub.valueOf());
                    };
                    const l1 = evalAt(a - epsilon);
                    const l2 = evalAt(a + epsilon);
                    if (!isFinite(l1) && !isFinite(l2)) return l1 > 0 ? '\\infty' : '-\\infty';
                    if (Math.abs(l1 - l2) < 1e-6) {
                        const val = (l1 + l2) / 2;
                        return Number.isInteger(val) ? String(val) : val.toPrecision(6);
                    }
                    return null; // Limit does not exist
                } catch { return null; }
            };

            // Attempt 1: nerdamer symbolic
            try {
                const exprStr = latexToNerdamer(inputVal);
                const limitResult = nerdamer(`limit(${exprStr}, ${wrt}, ${lp})`);
                return limitResult.toTeX();
            } catch (e) {
                if (e instanceof RangeError) {
                    console.warn('nerdamer limit stack overflow, falling back to numerical');
                } else {
                    console.error('nerdamer limit error', e);
                }
            }

            // Attempt 2: numerical approximation
            {
                const numResult = numericalLimit(inputVal, wrt, lp);
                if (numResult !== null) return numResult;
            }

            // Attempt 3: CE direct substitution (for finite, continuous points)
            {
                const targetValue = ce.parse(lp === 'Infinity' ? '\\infty' : lp);
                result = ce.box(['Replace', expr, ce.box(['Equal', wrtSymbol, targetValue])]).evaluate();
            }
        } else {
            result = ce.box(['D', expr, wrtSymbol]).evaluate();
        }
        return result.latex;
    }

    private static parseSequence(val: string): any[] | null {
        if (!val) return null;
        const s = val.trim();
        if (!s.startsWith('[') || !s.endsWith(']')) return null;
        try {
            // Try strict JSON first
            const parsed = JSON.parse(s);
            if (Array.isArray(parsed)) return parsed;
        } catch {
            // Fallback for LaTeX-style [1, 2, 3] or [x, y, z]
            const content = s.slice(1, -1);
            if (!content) return [];
            // Basic comma split, handle nested brackets if needed (though keeping it simple for now)
            return content.split(',').map(item => item.trim());
        }
        return null;
    }

    private static async executeFunction(node: AppNode, context: ExecutionContext): Promise<string> {
        const { nodes, edges } = context;
        const formula = (node.data.useExternalFormula && node.data.formulaInput)
            ? node.data.formulaInput
            : node.data.formula;

        if (!formula) return '?';

        const ce = getMathEngine();
        const solver = ce.parse(formula);
        const variables = solver.symbols; // Get list of symbols

        const sequenceVars: Record<string, any[]> = {};
        const staticVars: Record<string, any> = {};
        let maxSeqLength = 0;

        // Build global variable lookup from named text node outputs
        const globalVars: Record<string, string> = {};
        nodes.filter(n => n.type === 'textNode').forEach(tn => {
            if (tn.data.handles && tn.data.outputs) {
                tn.data.handles.forEach(h => {
                    if (h.label && tn.data.outputs![h.id] !== undefined) {
                        globalVars[h.label] = tn.data.outputs![h.id];
                    }
                });
            }
        });
        variables.forEach((v: string) => {
            const handle = node.data.handles?.find((h: any) => h.label === v || h.id === `h-in-${v}`);
            let val: string | undefined;

            if (handle) {
                // Explicit connection
                const edge = edges.find(e => e.target === node.id && e.targetHandle === handle.id);
                if (edge) {
                    const sourceNode = nodes.find(n => n.id === edge.source);
                    val = sourceNode?.data?.value;
                    if (edge.sourceHandle && sourceNode?.data.outputs?.[edge.sourceHandle] !== undefined) {
                        val = sourceNode.data.outputs[edge.sourceHandle];
                    }
                }
            }

            // [NEW] Check if variable is provided by an absorbed slot (e.g. a merged Slider)
            if (!val || val.trim() === '') {
                const slotSid = node.data.slots?.[v];
                if (typeof slotSid === 'string') {
                    const absorbedNode = nodes.find(n => n.id === slotSid);
                    if (absorbedNode && absorbedNode.data.value !== undefined) {
                        val = String(absorbedNode.data.value);
                    }
                }
            }

            // [NEW] Global Variable Store Resolution
            if (!val || val.trim() === '') {
                const globalVarsStore = useStore.getState().globalVars;
                if (v.startsWith('$') && globalVarsStore[v] !== undefined) {
                    val = globalVarsStore[v];
                }
            }

            // Fallback to globally defined variables from text nodes (old behavior)
            if ((!val || val.trim() === '') && globalVars[v] !== undefined) {
                val = globalVars[v];
            }

            if (val && val.trim() !== '') {
                const seq = this.parseSequence(val);
                if (seq) {
                    sequenceVars[v] = seq;
                    maxSeqLength = Math.max(maxSeqLength, seq.length);
                } else {
                    staticVars[v] = ce.parse(val);
                }
            }
        });

        if (maxSeqLength > 0) {
            // Map the formula over the sequence(s)
            const results = [];
            for (let i = 0; i < maxSeqLength; i++) {
                ce.pushScope();
                // Assign static variables
                Object.entries(staticVars).forEach(([k, val]) => ce.assign(k, val));
                // Assign sequence variables (cycle if lengths differ)
                Object.entries(sequenceVars).forEach(([k, seq]) => {
                    const item = seq[i % seq.length];
                    ce.assign(k, ce.parse(String(item)));
                });

                try {
                    const res = solver.evaluate();
                    results.push(res.latex);
                } catch {
                    results.push('?');
                }
                ce.popScope();
            }
            
            return JSON.stringify(results);
        }

        // Standard single evaluation
        ce.pushScope();
        Object.entries(staticVars).forEach(([k, val]) => ce.assign(k, val));
        
        let finalRes;
        if (node.type === 'solveNode') {
            const wrt = node.data.variable || 'x';
            let formattedEq = formula;
            // Substitute numeric static variables so nerdamer can solve precisely
            Object.entries(staticVars).forEach(([k, val]) => {
                const v = val.numericValue !== undefined ? val.numericValue : val.value;
                if (v !== undefined) {
                    formattedEq = formattedEq.replace(new RegExp(`\\b${k}\\b`, 'g'), `(${v})`);
                }
            });

            try {
                // Determine if equations are a list (comma separated or JSON)
                let eqs: any = formattedEq;
                if (typeof formattedEq === 'string') {
                   if (formattedEq.trim().startsWith('[') && formattedEq.trim().endsWith(']')) {
                        try { eqs = JSON.parse(formattedEq); } catch {}
                   } else if (formattedEq.includes(',') || formattedEq.includes(';')) {
                        eqs = formattedEq.split(/[;,]/).map(e => e.trim());
                   }
                }

                // Determine target variable(s)
                let vars: any = wrt;
                if (typeof wrt === 'string') {
                    if (wrt.includes(',')) {
                        vars = wrt.split(',').map(v => v.trim());
                    } else if (wrt.trim().startsWith('[') && wrt.trim().endsWith(']')) {
                        try { vars = JSON.parse(wrt); } catch {}
                    }
                }

                const cleanResult = (nerdamer as any).solveEquations(eqs, vars);
                const list = Array.isArray(cleanResult) ? cleanResult.map((sol: any) => {
                    if (Array.isArray(sol) && sol.length === 2 && typeof sol[0] === 'string') {
                        return `${sol[0]}=${(nerdamer as any)(sol[1]).toTeX()}`;
                    }
                    return (nerdamer as any)(sol).toTeX();
                }) : [(nerdamer as any)(cleanResult).toTeX()];

                finalRes = JSON.stringify(list);
            } catch (e) {
                console.error('Nerdamer solve error:', e);
                finalRes = `["Error"]`;
            }
        } else {
            finalRes = solver.evaluate().latex;
        }
        
        ce.popScope();
        return finalRes;
    }
}
