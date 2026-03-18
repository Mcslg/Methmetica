import { getMathEngine } from './MathEngine';
import { type AppNode } from '../store/useStore';
import { type Edge } from '@xyflow/react';

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
            case 'functionNode':
            case 'addNode':
            case 'toolNode':
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

        const ner = await getMathEngine();
        const variant = node.data.variant || 'diff';
        const wrt = node.data.variable || 'x';

        const expr = ner.convertFromLaTeX(inputVal);
        let result;
        if (variant === 'diff') {
            result = ner.diff(expr, wrt);
        } else {
            result = ner.integrate(expr, wrt);
        }
        return result.toTeX();
    }

    private static async executeFunction(node: AppNode, context: ExecutionContext): Promise<string> {
        const { nodes, edges, implicitEdges } = context;
        const formula = (node.data.useExternalFormula && node.data.formulaInput)
            ? node.data.formulaInput
            : node.data.formula;

        if (!formula) return '?';

        const ner = await getMathEngine();
        const solver = ner.convertFromLaTeX(formula);
        const variables = solver.variables();
        const implicitInputs = implicitEdges.filter(e => e.target === node.id);

        let isSequence = false;
        let sequenceKey = '';
        let sequenceItems: any[] = [];
        const varMap: Record<string, string> = {};

        variables.forEach((v: string) => {
            const handle = node.data.handles?.find((h: any) => h.label === v || h.id === `h-in-${v}`);
            if (handle) {
                let val: string | undefined;

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

                if (val && val.trim() !== '') {
                    // Check if value is a JSON array (sequence)
                    try {
                        const parsed = JSON.parse(val);
                        if (Array.isArray(parsed) && !isSequence) {
                            isSequence = true;
                            sequenceKey = v;
                            sequenceItems = parsed;
                            return;
                        }
                    } catch (e) { /* Not JSON */ }
                    
                    try {
                        varMap[v] = ner.convertFromLaTeX(val).toString();
                    } catch {
                        varMap[v] = val; // fallback for raw numbers
                    }
                }
            } else if (variables.length === 1 && handle === undefined) {
                 // Fallback: If no handle matches but there's an implicit connection and only 1 variable
                 const implicitEdge = implicitInputs.find(e => e.target === node.id);
                 if (implicitEdge) {
                     const sourceNode = nodes.find(n => n.id === implicitEdge.source);
                     const val = sourceNode?.data?.value;
                     if (val && val.trim() !== '') {
                         try {
                              const parsed = JSON.parse(val);
                              if (Array.isArray(parsed) && !isSequence) {
                                  isSequence = true;
                                  sequenceKey = v;
                                  sequenceItems = parsed;
                                  return;
                              }
                         } catch (e) { }
                         try {
                             varMap[v] = ner.convertFromLaTeX(val).toString();
                         } catch {
                             varMap[v] = val;
                         }
                     }
                 }
            }
        });

        if (isSequence) {
            // Map the formula over the sequence
            const results = sequenceItems.map(item => {
                const currentVarMap = { ...varMap, [sequenceKey]: String(item) };
                try {
                    const res = solver.evaluate(currentVarMap);
                    // Extract numeric value if possible to keep array clean
                    const raw = typeof res?.valueOf === 'function' ? res.valueOf() : res;
                    return typeof raw === 'number' ? Number(raw.toFixed(4)) : res.toTeX();
                } catch {
                    return null;
                }
            }).filter(res => res !== null);
            
            return JSON.stringify(results);
        }

        return solver.evaluate(varMap).toTeX();
    }
}
