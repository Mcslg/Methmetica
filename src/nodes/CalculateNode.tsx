import { useEffect, useRef } from 'react';
import { type NodeProps, type Node, NodeResizer } from '@xyflow/react';
import useStore, { type NodeData, type AppState, type CustomHandle } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';
import { getMathEngine } from '../utils/MathEngine';
import { Icons } from '../components/Icons';
import 'mathlive';



export function CalculateNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    const executeNode = useStore((state: AppState) => state.executeNode);
    const edges = useStore((state: AppState) => state.edges);
    const mfRef = useRef<any>(null);

    const useExternalFormula = !!data.useExternalFormula;
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

    const isLocked = !!data.slots?.buttonNode;

    // Re-execute when external formula input changes, UNLESS locked
    useEffect(() => {
        if (useExternalFormula && data.formulaInput !== undefined) {
            if (!isLocked) {
                executeNode(id);
            }
        }
    }, [data.formulaInput, useExternalFormula, id, executeNode, isLocked]);

    const handleEject = (type: string) => {
        const slotNode = data.slots?.[type];
        if (!slotNode) return;
        
        // Restore to canvas slightly higher
        useStore.getState().addNode({
            ...slotNode,
            id: `${type}-${Date.now()}`,
            position: { x: slotNode.position.x, y: slotNode.position.y - 80 },
            selected: false
        });
        
        const newSlots = { ...data.slots };
        delete newSlots[type];
        
        // Update both data and dimensions (shrink -40px)
        const store = useStore.getState();
        const parentNode = store.nodes.find(n => n.id === id);
        if (parentNode) {
            const curWidth = parentNode.width ?? parentNode.measured?.width ?? 160;
            const curHeight = parentNode.height ?? parentNode.measured?.height ?? 100;
            
            useStore.setState({
                nodes: store.nodes.map(n => n.id === id ? {
                    ...n,
                    width: curWidth,
                    height: Math.max(60, curHeight - 40),
                    data: { ...n.data, slots: newSlots }
                } : n)
            });
        }
    };

    const handleManualRun = () => {
        executeNode(id);
    };


    const augmentedHandles = [...(data.handles || [])];
    if (data.slots?.gateNode && !augmentedHandles.some(h => h.id === 'h-gate-in')) {
        augmentedHandles.push({ id: 'h-gate-in', type: 'gate-in', position: 'left', offset: 20, label: 'Gate' });
    }

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
            <NodeResizer minWidth={160} minHeight={120} isVisible={selected} lineStyle={{ border: 'none' }} handleStyle={{ width: 8, height: 8, borderRadius: '50%', background: 'transparent', border: 'none' }} />
            <DynamicHandles
                nodeId={id}
                handles={augmentedHandles}
                locked={true}
                allowedTypes={['output']}
                touchingEdges={data.touchingEdges}
                customDescriptions={{
                    'h-fn-in': '外部公式輸入 (f(x) string)'
                }}
            />
            <div className="node-header" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ display: 'flex', alignItems: 'center' }}><Icons.Calculate /> Calculate</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
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
                    </div>
                </div>

                {/* Absorbed Slots Rendering */}
                {data.slots && Object.keys(data.slots).length > 0 && (
                    <div style={{ 
                        marginTop: '6px', 
                        display: 'flex', 
                        gap: '4px', 
                        paddingTop: '6px', 
                        borderTop: '1px solid rgba(255,255,255,0.1)' 
                    }}>
                        {data.slots.buttonNode && (
                            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255, 204, 0, 0.1)', border: '1px solid rgba(255, 204, 0, 0.3)', borderRadius: '4px', padding: '2px 4px' }}>
                                <button
                                    className="nodrag"
                                    onClick={handleManualRun}
                                    style={{ background: '#ffcc00', border: 'none', color: '#000', fontSize: '0.6rem', fontWeight: 800, padding: '2px 6px', borderRadius: '2px', cursor: 'pointer' }}
                                >
                                    <Icons.Trigger width={10} height={10} style={{ marginRight: 4 }} /> RUN
                                </button>
                                <button className="nodrag eject-btn" onClick={() => handleEject('buttonNode')} title="Eject Button">⏏️</button>
                            </div>
                        )}
                        {data.slots.gateNode && (
                            <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                background: Number(data.gateValue || 0) !== 0 ? 'rgba(74, 222, 128, 0.15)' : 'rgba(239, 68, 68, 0.1)', 
                                border: `1px solid ${Number(data.gateValue || 0) !== 0 ? 'rgba(74, 222, 128, 0.4)' : 'rgba(239, 68, 68, 0.3)'}`, 
                                borderRadius: '4px', 
                                padding: '2px 4px',
                                transition: 'all 0.2s'
                            }}>
                                <span style={{ fontSize: '0.6em', color: Number(data.gateValue || 0) !== 0 ? '#4ade80' : '#ef4444', fontWeight: 'bold' }}>
                                    GATE {Number(data.gateValue || 0) !== 0 ? '✓' : '✗'}
                                </span>
                                <button className="nodrag eject-btn" onClick={() => handleEject('gateNode')} title="Eject Gate">⏏️</button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="node-content custom-scrollbar" style={{ flexGrow: 1, padding: '4px 8px', overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: '4px' }}>

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
                        style={{ fontSize: '1rem', width: '100%', padding: '4px', borderRadius: '4px' }}
                    >
                        {data.formula || ''}
                    </math-field>
                )}

                {(!data.handles?.some(h => h.type === 'output') || !edges.some(e => e.source === id)) && data.value && (
                    <div style={{
                        marginTop: '4px',
                        padding: '6px',
                        background: 'rgba(74, 222, 128, 0.08)',
                        border: '1px solid rgba(74, 222, 128, 0.2)',
                        borderRadius: '6px',
                        fontSize: '1rem',
                        color: 'var(--text-main)',
                        textAlign: 'center',
                        overflowX: 'auto',
                        whiteSpace: 'nowrap'
                    }}>
                        <span dangerouslySetInnerHTML={{ 
                            __html: (() => {
                                let val = data.value;
                                if (val && val.startsWith('[') && val.endsWith(']')) {
                                    try {
                                        const parsed = JSON.parse(val);
                                        if (Array.isArray(parsed)) val = `[${parsed.join(', ')}]`;
                                    } catch {}
                                }
                                return window.katex?.renderToString(val, { throwOnError: false }) || val;
                            })()
                        }} />
                    </div>
                )}
            </div>
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
                .eject-btn {
                    background: transparent;
                    border: none;
                    cursor: pointer;
                    font-size: 0.7rem;
                    margin-left: 4px;
                    opacity: 0.6;
                    transition: opacity 0.2s;
                }
                .eject-btn:hover {
                    opacity: 1;
                }
            `}</style>
        </div>
    );
}
