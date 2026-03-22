import { useEffect, useRef } from 'react';
import { type NodeProps, type Node, NodeResizer } from '@xyflow/react';
import useStore, { type NodeData, type AppState } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';
import { Icons } from '../components/Icons';
import 'mathlive';

export function SolveNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    const mfRef = useRef<any>(null);

    const wrt = data.variable || 'x';

    // 1. Sync handles (Equation in, Solutions out, Trigger)
    useEffect(() => {
        const currentHandles = data.handles || [];
        const hasIn = currentHandles.some(h => h.id === 'h-in');
        const hasOut = currentHandles.some(h => h.type === 'output');
        const hasTrigger = currentHandles.some(h => h.type === 'trigger-in');

        if (!hasIn || !hasOut || !hasTrigger) {
            const nextHandles: any[] = [
                { id: 'h-in', type: 'input', position: 'left', offset: 50, label: 'eq' },
                { id: 'h-tr-in', type: 'trigger-in', position: 'top', offset: 50 },
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

    return (
        <div className="math-node op-node solve-node" style={{ 
            width: '100%', 
            height: '100%', 
            display: 'flex', 
            flexDirection: 'column', 
            boxSizing: 'border-box', 
            overflow: 'visible',
            borderRadius: '12px',
        border: '1px solid rgba(255, 126, 95, 0.25)'
        }}>
            <NodeResizer minWidth={160} minHeight={120} isVisible={selected} lineStyle={{ border: 'none' }} handleStyle={{ width: 8, height: 8, borderRadius: '50%', background: '#ff7e5f' }} />
            <DynamicHandles
                nodeId={id}
                handles={data.handles}
                locked={true}
                allowedTypes={['input', 'output', 'trigger-in']}
                customDescriptions={{
                    'h-in': '方程來源 (Equation LHS or LHS=RHS)',
                    'h-out': '方程解 (Solutions as sequence)',
                    'h-tr-in': '觸發求解程式'
                }}
            />
            
            <div className="node-header" style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Icons.Solve />
                    <span>Solve for</span>
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
                </div>
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
            `}</style>
        </div>
    );
}
