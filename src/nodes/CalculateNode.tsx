import { useEffect, memo } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import useStore, { type NodeData, type AppState, type CustomHandle } from '../store/useStore';
import { getMathEngine } from '../utils/MathEngine';
import { Icons } from '../components/Icons';
import 'mathlive';
import { NodeFrame } from '../components/NodeFrame';
import { MathInput } from '../components/MathInput';

export const CalculateNode = memo(function CalculateNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    const executeNode = useStore((state: AppState) => state.executeNode);

    const useExternalFormula = !!data.useExternalFormula;
    // [PERF] Only subscribe to the specific formula string we need.
    const formulaInStore = useStore((state: AppState) => state.nodes.find(n => n.id === id)?.data.formula || '');
    // The formula we actually parse for handles
    const formulaToParse = useExternalFormula ? (data.formulaInput || '') : (data.formula || '');

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

    // Sync nerdamer variables to handles
    useEffect(() => {
        const syncHandles = async () => {
            const currentHandles = data.handles || [];

            // 1. Determine formula-based variable handles
            let newInputHandles: CustomHandle[] = [];
            if (formulaToParse) {
                try {
                    const ce = getMathEngine();
                    const expr = ce.parse(formulaToParse);
                    const variables = expr.unknowns ? [...expr.unknowns] : []; // e.g. ['x', 'y']

                    const globalVarsSet = new Set(globalVarsString ? globalVarsString.split(',') : []);
                    const tempVariables = variables.filter((v: string) => !globalVarsSet.has(v));

                    newInputHandles = tempVariables.map((v: string, index: number) => {
                        const existing = currentHandles.find((h: any) => h.label === v || h.id === `h-in-${v}`);
                        if (existing) return existing;

                        const spacing = 100 / (tempVariables.length + 1);
                        return {
                            id: `h-in-${v}`,
                            type: 'input',
                            position: 'left',
                            offset: (index + 1) * spacing,
                            label: v
                        } as any;
                    });
                } catch (e) {
                    // Formula might be incomplete
                }
            } else if (!useExternalFormula) {
                // If no formula and not external, ensure a default input exists
                const hasDefaultIn = currentHandles.some(h => h.id === 'h-in');
                if (!hasDefaultIn) {
                    newInputHandles = [{ id: 'h-in', type: 'input', position: 'left', offset: 50 }];
                } else {
                    newInputHandles = [currentHandles.find(h => h.id === 'h-in')!];
                }
            }

            // 2. Add special handle for external formula if enabled
            const specialHandles: CustomHandle[] = [];
            if (useExternalFormula) {
                specialHandles.push({ id: 'h-fn-in', type: 'input', position: 'left', offset: 15, label: 'f(x)' } as any);
            }

            // 3. Keep output and other non-variable input handles
            const outputHandle = currentHandles.find(h => h.type === 'output') || { id: 'h-out', type: 'output', position: 'right', offset: 50 };
            const triggerHandles = currentHandles.filter(h => h.type.startsWith('trigger'));

            const nextHandles = [...specialHandles, ...newInputHandles, ...triggerHandles, outputHandle];

            // 4. Update if changed (JSON.stringify is a quick way to compare simple handle objects)
            if (JSON.stringify(nextHandles) !== JSON.stringify(currentHandles)) {
                updateNodeData(id, { handles: nextHandles });
            }
        };

        syncHandles();
    }, [id, formulaToParse, useExternalFormula, updateNodeData, globalVarsString]);

    const isLocked = !!data.slots?.buttonNode;

    // Re-execute when external formula input changes, UNLESS locked
    useEffect(() => {
        if (useExternalFormula && data.formulaInput !== undefined) {
            if (!isLocked) {
                executeNode(id);
            }
        }
    }, [data.formulaInput, useExternalFormula, id, executeNode, isLocked]);

    return (
        <NodeFrame
            id={id}
            data={data}
            selected={selected}
            icon={<Icons.Calculate />}
            defaultLabel="Calculate"
            className="calculate-node"
            headerExtras={
                <button
                    onClick={() => updateNodeData(id, { useExternalFormula: !useExternalFormula })}
                    className="variant-toggle"
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
                    {data.formulaInput || 'Wait for input...'}
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

