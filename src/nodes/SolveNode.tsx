import { useEffect, useRef } from 'react';
import { type NodeProps, type Node, NodeResizer } from '@xyflow/react';
import useStore, { type NodeData, type AppState } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';
import { Icons } from '../components/Icons';
import 'mathlive';

export function SolveNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    const executeNode = useStore((state: AppState) => state.executeNode);
    const mfRef = useRef<any>(null);

    const handleEject = (type: string) => {
        const slotNode = data.slots?.[type];
        if (!slotNode) return;
        
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
            const curWidth = parentNode.width ?? parentNode.measured?.width ?? 220;
            const curHeight = parentNode.height ?? parentNode.measured?.height ?? 160;
            
            useStore.setState({
                nodes: store.nodes.map(n => n.id === id ? {
                    ...n,
                    width: curWidth,
                    height: Math.max(80, curHeight - 40),
                    data: { ...n.data, slots: newSlots }
                } : n)
            });
        }
    };

    const handleManualRun = () => {
        executeNode(id, true);
    };

    const wrt = data.variable || 'x';

    // 1. Sync handles (Equation in, Solutions out, Trigger)
    useEffect(() => {
        const currentHandles = data.handles || [];
        const hasIn = currentHandles.some(h => h.id === 'h-in');
        const hasOut = currentHandles.some(h => h.type === 'output');
        if (!hasIn || !hasOut) {
            const nextHandles: any[] = [
                { id: 'h-in', type: 'input', position: 'left', offset: 50, label: 'eq' },
                { id: 'h-out', type: 'output', position: 'right', offset: 50 }
            ];
            updateNodeData(id, { handles: nextHandles });
        }
    }, [id, data.handles, updateNodeData]);

    // 2. Setup MathField for equation input
    useEffect(() => {
        const mf = mfRef.current;
        if (!mf) return;

        if (mf.value !== data.formula && data.formula !== undefined) {
            mf.value = data.formula;
        }

        const handleInput = (e: any) => {
            updateNodeData(id, { formula: e.target.value });
        };

        mf.addEventListener('input', handleInput);
        return () => mf.removeEventListener('input', handleInput);
    }, [id, data.formula, updateNodeData]);

    const augmentedHandles = [...(data.handles || [])];
    if (data.slots?.gateNode && !augmentedHandles.some(h => h.id === 'h-gate-in')) {
        augmentedHandles.push({ id: 'h-gate-in', type: 'gate-in', position: 'left', offset: 20, label: 'Gate' });
    }

    return (
        <div className="math-node op-node solve-node" style={{ 
            width: '100%', 
            height: '100%', 
            display: 'flex', 
            flexDirection: 'column', 
            overflow: 'visible',
        }}>
            <NodeResizer minWidth={160} minHeight={120} isVisible={selected} lineStyle={{ border: 'none' }} handleStyle={{ width: 8, height: 8, borderRadius: '50%', background: 'transparent', border: 'none' }} />
            <DynamicHandles
                nodeId={id}
                handles={augmentedHandles}
                locked={true}
                allowedTypes={['input', 'output']}
                customDescriptions={{
                    'h-in': '方程來源 (Equation LHS or LHS=RHS)',
                    'h-out': '方程解 (Solutions as sequence)'
                }}
            />
            
            <div className="node-header" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>
                        <Icons.Solve />
                        Solve for
                        <input 
                            defaultValue={wrt}
                            onBlur={(e) => updateNodeData(id, { variable: e.target.value })}
                            onKeyDown={(e) => e.key === 'Enter' && (e.target as any).blur()}
                            title="Variable to solve for"
                            style={{ 
                                width: '28px', 
                                background: 'var(--bg-input)', 
                                border: '1px solid var(--border-input)', 
                                borderRadius: '4px', 
                                textAlign: 'center', 
                                color: 'var(--text-main)', 
                                fontSize: '0.7rem',
                                outline: 'none',
                                fontWeight: 'bold',
                                fontFamily: 'inherit'
                            }}
                        />
                    </span>
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
                                    RUN 🔒
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

            <div className="node-content custom-scrollbar" style={{ 
                flexGrow: 1, 
                padding: '10px', 
                overflowY: 'auto', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '8px' 
            }}>
                <div style={{ fontSize: '0.6rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Equation</div>
                <math-field
                    ref={mfRef}
                    class="nodrag formula-input"
                    style={{ 
                        fontSize: '1rem', 
                        width: '100%', 
                        padding: '6px', 
                        borderRadius: '6px',
                        color: 'var(--text-main)'
                    }}
                >
                    {data.formula || ''}
                </math-field>

                {data.value && (
                    <div style={{
                        marginTop: 'auto',
                        padding: '8px',
                        background: 'rgba(255, 126, 95, 0.05)',
                        border: '1px solid rgba(255, 126, 95, 0.2)',
                        borderRadius: '6px',
                        fontSize: '0.95rem',
                        color: '#fff',
                        textAlign: 'center',
                        overflowX: 'auto',
                        whiteSpace: 'nowrap',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
                    }}>
                         <div style={{ fontSize: '0.55rem', color: '#ff7e5f', textTransform: 'uppercase', marginBottom: '4px', fontWeight: 700 }}>Solutions</div>
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
                .solve-node {
                    transition: box-shadow 0.2s, border-color 0.2s;
                }
                .solve-node.selected {
                    border-color: #ff7e5f !important;
                    box-shadow: 0 0 25px rgba(255, 126, 95, 0.3) !important;
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
