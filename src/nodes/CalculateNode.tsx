import { useEffect, useRef } from 'react';
import { type NodeProps, type Node, NodeResizer } from '@xyflow/react';
import useStore, { type NodeData, type AppState, type CustomHandle } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';
import { getMathEngine } from '../utils/MathEngine';
import 'mathlive';

declare global {
    namespace JSX {
        interface IntrinsicElements {
            'math-field': any;
        }
    }
}

export function CalculateNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    const executeNode = useStore((state: AppState) => state.executeNode);
    const edges = useStore((state: AppState) => state.edges);
    const mfRef = useRef<any>(null);

    const useExternalFormula = !!data.useExternalFormula;
    // The formula we actually parse for handles
    const formulaToParse = useExternalFormula ? (data.formulaInput || '') : (data.formula || '');

    // Sync nerdamer variables to handles
    useEffect(() => {
        const syncHandles = async () => {
            const currentHandles = data.handles || [];

            // 1. Determine formula-based variable handles
            let newInputHandles: CustomHandle[] = [];
            if (formulaToParse) {
                try {
                    const ner = await getMathEngine();
                    const solver = ner.convertFromLaTeX(formulaToParse);
                    const variables = solver.variables(); // e.g. ['x', 'y']

                    newInputHandles = variables.map((v: string, index: number) => {
                        const existing = currentHandles.find((h: any) => h.label === v || h.id === `h-in-${v}`);
                        if (existing) return existing;

                        const spacing = 100 / (variables.length + 1);
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
    }, [id, formulaToParse, useExternalFormula, updateNodeData]);

    // Setup MathField for formula input
    useEffect(() => {
        const mf = mfRef.current;
        if (!mf || useExternalFormula) return;

        if (mf.value !== data.formula && data.formula !== undefined) {
            mf.value = data.formula;
        }

        const handleInput = (e: any) => {
            updateNodeData(id, { formula: e.target.value });
        };

        mf.addEventListener('input', handleInput);
        return () => mf.removeEventListener('input', handleInput);
    }, [id, data.formula, useExternalFormula, updateNodeData]);

    // Re-execute when external formula input changes
    useEffect(() => {
        if (useExternalFormula && data.formulaInput !== undefined) {
            executeNode(id);
        }
    }, [data.formulaInput, useExternalFormula, id, executeNode]);


    const touchingClasses = data.touchingEdges
        ? Object.entries(data.touchingEdges)
            .filter(([_, touching]) => touching)
            .map(([edge]) => `edge-touch-${edge}`)
            .join(' ')
        : '';

    return (
        <div className={`math-node op-node calculate-node ${touchingClasses}`} 
             style={{ 
                 width: '100%', 
                 height: '100%', 
                 display: 'flex', 
                 flexDirection: 'column',
                 overflow: 'visible',
                 boxSizing: 'border-box'
             }}>
            <NodeResizer minWidth={160} minHeight={120} isVisible={selected} lineStyle={{ border: 'none' }} handleStyle={{ width: 8, height: 8, borderRadius: '50%', background: '#4facfe' }} />
            <DynamicHandles
                nodeId={id}
                handles={data.handles}
                locked={true}
                allowedTypes={['output', 'trigger-in', 'trigger-out', 'trigger-err']}
                touchingEdges={data.touchingEdges}
                customDescriptions={{
                    'trigger-in': '接收電流時自動執行運算',
                    'trigger-out': '運算成功後發出電流',
                    'trigger-err': '公式出錯或無效時發出電流',
                    'h-fn-in': '外部公式輸入 (f(x) string)'
                }}
            />
            <div className="node-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Calculate</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                        onClick={() => updateNodeData(id, { useExternalFormula: !useExternalFormula })}
                        className="variant-toggle"
                        style={{ fontSize: '0.5rem', padding: '2px 4px', background: useExternalFormula ? 'rgba(79, 172, 254, 0.3)' : 'transparent' }}
                    >
                        EXT
                    </button>
                </div>
            </div>

            <div className="node-content custom-scrollbar" style={{ flexGrow: 1, padding: '10px', overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className="formula-label" style={{ fontSize: '0.6rem', color: '#666', width: '100%', textAlign: 'left' }}>
                    {useExternalFormula ? 'EXTERNAL FORMULA:' : 'FORMULA:'}
                </div>

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
                    <math-field
                        ref={mfRef}
                        class="nodrag formula-input"
                        style={{ fontSize: '1rem', width: '100%', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '4px' }}
                    >
                        {data.formula || ''}
                    </math-field>
                )}

                {(!data.handles?.some(h => h.type === 'output') || !edges.some(e => e.source === id)) && data.value && (
                    <div style={{
                        marginTop: '4px',
                        padding: '6px',
                        background: 'rgba(79, 172, 254, 0.1)',
                        border: '1px solid rgba(79, 172, 254, 0.3)',
                        borderRadius: '4px',
                        fontSize: '1rem',
                        color: '#fff',
                        textAlign: 'center',
                        overflowX: 'auto',
                        whiteSpace: 'nowrap'
                    }}>
                        <span dangerouslySetInnerHTML={{ __html: window.katex?.renderToString(data.value, { throwOnError: false }) || data.value }} />
                    </div>
                )}
            </div>
            <style>{`
                .variant-toggle {
                    background: rgba(255,255,255,0.1);
                    border: 1px solid rgba(255,255,255,0.2);
                    color: #ccc;
                    border-radius: 4px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .variant-toggle:hover {
                    background: rgba(255,255,255,0.2);
                    color: #fff;
                }
            `}</style>
        </div>
    );
}
