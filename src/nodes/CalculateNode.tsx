import { useEffect, memo } from 'react';
import { type NodeProps, type Node, useUpdateNodeInternals } from '@xyflow/react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import useStore, { type NodeData, type AppState, type CustomHandle } from '../store/useStore';
import { normalizeLatexFormula, extractFormulaVariables } from '../utils/mathNormalizer';
import { Icons } from '../components/Icons';
import { NodeFrame } from '../components/NodeFrame';
import { MathInput } from '../components/MathInput';

export const CalculateNode = memo(function CalculateNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    const executeNode = useStore((state: AppState) => state.executeNode);
    const updateNodeInternals = useUpdateNodeInternals();

    const useExternalFormula = !!data.useExternalFormula;
    // [PERF] Only subscribe to the specific formula string we need.
    const formulaInStore = useStore((state: AppState) => state.nodes.find(n => n.id === id)?.data.formula || '');
    // The formula we actually parse for handles
    const formulaToParse = useExternalFormula ? (data.formulaInput || '') : (data.formula || '');
    const cleanFormulaToParse = normalizeLatexFormula(formulaToParse || '');

    // Get any variable that is already named in a textNode so we don't spawn a handle for it
    const globalVarsString = useStore((state: AppState) => {
        const vars = new Set<string>();
        state.nodes.filter(n => n.type === 'textNode').forEach(tn => {
            if (tn.data.handles) {
                tn.data.handles.forEach(h => {
                    if (h.label) vars.add(h.label);
                });
            }
        });
        return Array.from(vars).sort().join(',');
    });

    // Sync variables to handles
    useEffect(() => {
        const syncHandles = async () => {
            const currentHandles = data.handles || [];

            // 1. Determine formula-based variable handles
            let newInputHandles: CustomHandle[] = [];
            if (cleanFormulaToParse) {
                try {
                    const variables = extractFormulaVariables(cleanFormulaToParse);

                    const globalVarsSet = new Set(globalVarsString ? globalVarsString.split(',') : []);
                    const tempVariables = variables.filter((v: string) => !globalVarsSet.has(v));

                    // If we have variables, update. If we have NO variables but we ARE typing (formula exists), 
                    // we might want to keep the old ones to avoid flickering, but ONLY if we haven't successfully parsed a non-variable formula.
                    if (tempVariables.length === 0 && /[a-zA-Z]/.test(cleanFormulaToParse)) {
                        newInputHandles = currentHandles.filter(h => h.type === 'input');
                    } else {
                        newInputHandles = tempVariables.map((v: string, index: number) => {
                            const existing = currentHandles.find((h: CustomHandle) => h.label === v || h.id === `h-in-${v}`);
                            if (existing) return existing;

                            const spacing = 100 / (tempVariables.length + 1);
                            return {
                                id: `h-in-${v}`,
                                type: 'input',
                                position: 'left',
                                offset: (index + 1) * spacing,
                                label: v
                            } as CustomHandle;
                        });
                    }
                } catch {
                    // Formula might be incomplete mid-typing.
                    // IMPORTANT: Keep existing input handles so connections don't break!
                    newInputHandles = currentHandles.filter(h => h.type === 'input');
                }
            }
            // else: if !cleanFormulaToParse, newInputHandles is [], removing the default circle.

            // 2. Add special handle for external formula if enabled
            const specialHandles: CustomHandle[] = [];
            if (useExternalFormula) {
                specialHandles.push({ id: 'h-fn-in', type: 'input', position: 'left', offset: 15, label: 'f(x)' });
            }

            // 3. Keep output and other non-variable input handles
            const outputHandle = currentHandles.find(h => h.type === 'output') || { id: 'h-out', type: 'output', position: 'right', offset: 50 };
            const triggerHandles = currentHandles.filter(h => h.type.startsWith('trigger'));

            const nextHandles = [...specialHandles, ...newInputHandles, ...triggerHandles, outputHandle];

            // 4. Update if changed (JSON.stringify is a quick way to compare simple handle objects)
            if (JSON.stringify(nextHandles) !== JSON.stringify(currentHandles)) {
                updateNodeData(id, { handles: nextHandles });
                // Notify React Flow to re-render handles immediately
                updateNodeInternals(id);
            }
        };

        syncHandles();
    }, [id, cleanFormulaToParse, useExternalFormula, updateNodeData, globalVarsString, data.handles, updateNodeInternals]);

    const isLocked = !!data.slots?.buttonNode;

    // Re-execute when external formula input OR upstream variables change, UNLESS locked
    useEffect(() => {
        if (!isLocked) {
            if (useExternalFormula && data.formulaInput === undefined) return;
            executeNode(id);
        }
    }, [data.formulaInput, data.inputSignature, useExternalFormula, id, executeNode, isLocked, cleanFormulaToParse]);

    return (
        <NodeFrame
            id={id}
            data={data}
            selected={selected}
            icon={<Icons.Calculate />}
            defaultLabel="數學運算"
            className="calculate-node"
            headerExtras={
                <button
                    onClick={() => updateNodeData(id, { useExternalFormula: !useExternalFormula })}
                    className="variant-toggle"
                    title="切換外部公式輸入 (EXT)"
                    style={{ 
                        fontSize: '0.5rem', 
                        padding: '2px 4px', 
                        background: useExternalFormula ? 'var(--accent)' : 'transparent',
                        color: useExternalFormula ? '#fff' : 'inherit'
                    }}
                >
                    EXT
                </button>
            }
            allowedHandleTypes={['output']}
            customHandleDescriptions={{
                'h-fn-in': '外部公式輸入 (f(x) string)'
            }}
            onManualRun={() => executeNode(id)}
        >
            {useExternalFormula ? (
                <div style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.05)',
                    padding: '8px',
                    borderRadius: '4px',
                    fontSize: '0.9rem',
                    color: data.formulaInput ? '#fff' : '#444',
                    minHeight: '34px',
                    border: '1px dashed rgba(255,255,255,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    {data.formulaInput ? (
                        <span dangerouslySetInnerHTML={{
                            __html: (() => {
                                try {
                                    const clean = normalizeLatexFormula(data.formulaInput);
                                    return katex.renderToString(clean, { throwOnError: false, displayMode: false });
                                } catch {
                                    return data.formulaInput;
                                }
                            })()
                        }} />
                    ) : (
                        '等待輸入中...'
                    )}
                </div>
            ) : (
                !data.slots?.formulaSidebar && (
                    <MathInput
                        value={formulaInStore}
                        onChange={(val) => updateNodeData(id, { formula: val })}
                        className="nodrag formula-input"
                    />
                )
            )}

            {/* 即時計算結果預覽 (LaTeX) */}
            {data.value !== undefined && data.value !== '' && data.value !== '?' && (
                <div 
                    className="calculate-result-preview" 
                    title="計算結果 (LaTeX)"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: '6px',
                        marginTop: '6px',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: 'rgba(56, 189, 248, 0.08)',
                        border: '1px solid rgba(56, 189, 248, 0.2)',
                        fontSize: '0.9rem',
                        color: 'var(--accent-bright, #38bdf8)'
                    }}
                >
                    <span style={{ fontSize: '0.75rem', opacity: 0.7, color: 'var(--text-sub, #94a3b8)' }}>=</span>
                    <span 
                        dangerouslySetInnerHTML={{
                            __html: (() => {
                                try {
                                    const str = String(data.value);
                                    const clean = str
                                        .replace(/^(\$\$?)|(\$\$?)$/g, '')
                                        .replace(/^\\\(|\\\)$/g, '')
                                        .trim();
                                    return katex.renderToString(clean, { throwOnError: false, displayMode: false });
                                } catch {
                                    return String(data.value);
                                }
                            })()
                        }} 
                    />
                </div>
            )}

            <style>{`
                .variant-toggle {
                    background: var(--bg-input);
                    border: 1px solid var(--border-node);
                    color: var(--text-main);
                    border-radius: 4px;
                    cursor: pointer;
                    transition: all 0.2s;
                    font-family: inherit;
                }
                .variant-toggle:hover {
                    background: var(--accent);
                    color: #fff;
                    border-color: var(--accent);
                }
            `}</style>
        </NodeFrame>
    );
});
