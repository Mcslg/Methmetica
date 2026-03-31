import { ComputeEngine } from "@cortex-js/compute-engine";

export function generateDiffSteps(formula, variable = 'x') {
    if (!formula) return null;
    
    const ce = new ComputeEngine();
    try {
        const expr = ce.parse(formula);
        const steps = [];

        function derive(node) {
            const json = node.json;
            const head = Array.isArray(json) ? json[0] : (typeof json === 'string' ? 'Symbol' : 'Number');

            // 1. Constant
            if (head === 'Number' || (head === 'Symbol' && json !== variable && json !== 'Pi' && json !== 'ExponentialE')) {
                steps.push({
                    label: `常數項 ${node.latex} 的導數為 0`,
                    latex: `\\frac{d}{d${variable}}(${node.latex}) = 0`
                });
                return ce.box(0);
            }

            // 2. Variable (x)
            if (head === 'Symbol' && json === variable) {
                steps.push({
                    label: `變數 ${variable} 對自己的導數為 1`,
                    latex: `\\frac{d}{d${variable}}(${variable}) = 1`
                });
                return ce.box(1);
            }

            // 3. Sum Rule (Add)
            if (head === 'Add') {
                steps.push({
                    label: `應用加法法則：分別對每一項求導`,
                    latex: `\\frac{d}{d${variable}}\\left(${node.latex}\\right) = \\sum \\frac{d}{d${variable}}\\text{(terms)}`
                });
                const ops = node.ops;
                const results = ops.map((op) => derive(op));
                return ce.box(['Add', ...results]).simplify();
            }

            // 4. Product / Constant Multiple Rule (Multiply)
            if (head === 'Multiply') {
                const ops = node.ops;
                const consts = ops.filter((op) => op.numericValue !== undefined || (op.json === 'Symbol' && op.json !== variable));
                const funcs = ops.filter((op) => !consts.includes(op));
                
                if (consts.length > 0 && funcs.length > 0) {
                    const constPart = consts.length === 1 ? consts[0] : ce.box(['Multiply', ...consts]);
                    const funcPart = funcs.length === 1 ? funcs[0] : ce.box(['Multiply', ...funcs]);
                    steps.push({
                        label: `應用係數法則：提出常數 ${constPart.latex}`,
                        latex: `\\frac{d}{d${variable}}\\left(${node.latex}\\right) = ${constPart.latex} \\cdot \\frac{d}{d${variable}}\\left(${funcPart.latex}\\right)`
                    });
                    const derivedFunc = derive(funcPart);
                    return ce.box(['Multiply', constPart, derivedFunc]).simplify();
                } else if (funcs.length === 2) {
                    // Product rule: d(uv) = u'v + uv'
                    const [u, v] = funcs;
                    steps.push({
                        label: `應用乘法法則 (Product Rule) 於 ${u.latex} \\cdot ${v.latex}`,
                        latex: `(uv)' = u'v + uv'`
                    });
                    const du = derive(u);
                    const dv = derive(v);
                    return ce.box(['Add', ['Multiply', du, v], ['Multiply', u, dv]]).simplify();
                }
            }

            // 5. Quotient Rule / Power Rule
            if (head === 'Divide') {
                const u = node.ops[0];
                const v = node.ops[1];
                steps.push({
                    label: `應用除法法則 (Quotient Rule)`,
                    latex: `\\left(\\frac{u}{v}\\right)' = \\frac{u'v - uv'}{v^2}`
                });
                const du = derive(u);
                const dv = derive(v);
                return ce.box(['Divide', ['Subtract', ['Multiply', du, v], ['Multiply', u, dv]], ['Power', v, 2]]).simplify();
            }

            if (head === 'Power') {
                const base = node.ops[0];
                const exp = node.ops[1];
                
                // Power rule: x^n
                if (base.json === variable && exp.numericValue !== undefined) {
                    const n = exp.numericValue;
                    steps.push({
                        label: `應用冪次法則 (Power Rule)`,
                        latex: `\\frac{d}{d${variable}}(${node.latex}) = ${n}${variable}^{${n - 1}}`
                    });
                    return ce.box(['Multiply', n, ['Power', variable, n - 1]]);
                }
                
                // Chain rule for power: f(x)^n
                if (exp.numericValue !== undefined) {
                    const n = exp.numericValue;
                    steps.push({
                        label: `應用外層冪次法則 (Chain Rule) 於 ${base.latex}^{${n}}`,
                        latex: `n \\cdot f(x)^{n-1} \\cdot f'(x)`
                    });
                    const innerDeriv = derive(base);
                    return ce.box(['Multiply', n, ['Power', base, n - 1], innerDeriv]).simplify();
                }
                
                // Exponential: a^x or e^x
                if (exp.json === variable) {
                    steps.push({
                        label: `指數函數微分`,
                        latex: `\\frac{d}{d${variable}}(${node.latex}) = ${node.latex} \\ln(${base.latex})`
                    });
                    return ce.box(['Multiply', node, ['Ln', base]]);
                }
            }

            // 6. Basic Trig and Transcendentals (Chain Rule compatible)
            const trigRules = {
                'Sin': ['Cos', 'cos'],
                'Cos': ['Negate', 'Sin', '-sin'],
                'Tan': ['Power', 'Sec', '2', 'sec^2'],
                'Ln': ['Divide', '1', 'x', '\\frac{1}{x}'],
                'Exp': ['Exp', 'e^x']
            };

            if (trigRules[head]) {
                const arg = node.ops[0];
                steps.push({
                    label: `應用基本微分公式：${head.toLowerCase()}`,
                    latex: `\\frac{d}{d${variable}}(${head.toLowerCase()}(${variable})) = ${trigRules[head][trigRules[head].length - 1]}`
                });
                
                let outerDeriv;
                if (head === 'Sin') outerDeriv = ce.box(['Cos', arg]);
                else if (head === 'Cos') outerDeriv = ce.box(['Negate', ['Sin', arg]]);
                else if (head === 'Tan') outerDeriv = ce.box(['Power', ['Cos', arg], -2]);
                else if (head === 'Ln') outerDeriv = ce.box(['Divide', 1, arg]);
                else if (head === 'Exp') outerDeriv = node;

                if (arg.json !== variable) {
                    steps.push({
                        label: `連鎖律 (Chain Rule)：乘上內部函數 ${arg.latex} 的導數`,
                        latex: `\\text{Outer}' \\cdot \\text{Inner}'`
                    });
                    const innerDeriv = derive(arg);
                    return ce.box(['Multiply', outerDeriv, innerDeriv]).simplify();
                }
                return outerDeriv;
            }

            throw new Error('Complex structure detected, need AI fallback: ' + head);
        }

        const finalResult = derive(expr).simplify();
        steps.push({
            label: `最終推導結果`,
            latex: `\\frac{d}{d${variable}}(${formula}) = ${finalResult.latex}`
        });

        return steps;
    } catch (e) {
        console.warn('Rule-based derivation failed:', e);
        return null; // Fallback to AI
    }
}
console.log(generateDiffSteps("x", "x"));
console.log(generateDiffSteps("x*2", "x"));
