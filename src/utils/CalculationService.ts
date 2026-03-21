import { getMathEngine } from './MathEngine';
import { type AppNode } from '../store/useStore';
import { type Edge } from '@xyflow/react';
// @ts-ignore
import nerdamer from 'nerdamer/all.min';

interface MinimalEdge {
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
}

export interface ExecutionContext {
    nodes: AppNode[];
    edges: Edge[];
    implicitEdges: MinimalEdge[];
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
            default:
                throw new Error('Unknown node type');
        }
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

        const expr = ce.parse(inputVal);
        let result;
        if (variant === 'diff') {
            result = ce.box(['Derivative', expr, wrt]).evaluate();
        } else {
            result = ce.box(['Integrate', expr, wrt]).evaluate();
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
        const { nodes, edges, implicitEdges } = context;
        const formula = (node.data.useExternalFormula && node.data.formulaInput)
            ? node.data.formulaInput
            : node.data.formula;

        if (!formula) return '?';

        const ce = getMathEngine();
        const solver = ce.parse(formula);
        const variables = solver.symbols; // Get list of symbols
        const implicitInputs = implicitEdges.filter(e => e.target === node.id);

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
                // Implicit connection
                else if (handle.position === 'left') {
                    const implicitEdge = implicitInputs.find(e => e.target === node.id);
                    if (implicitEdge) {
                        const sourceNode = nodes.find(n => n.id === implicitEdge.source);
                        val = sourceNode?.data?.value;
                    }
                }
            } else if (variables.length === 1) {
                 // Fallback for single variable implicit
                 const implicitEdge = implicitInputs.find(e => e.target === node.id);
                 if (implicitEdge) {
                     const sourceNode = nodes.find(n => n.id === implicitEdge.source);
                     val = sourceNode?.data?.value;
                 }
            }

            // Fallback to globally defined variables from text nodes
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
