import React, { useEffect, useRef } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import useStore, { type NodeData, type AppState } from '../store/useStore';
import { Icons } from '../components/Icons';
import 'mathlive';
import { NodeFrame } from '../components/NodeFrame';

export function SolveNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    const executeNode = useStore((state: AppState) => state.executeNode);
    const mfRef = useRef<any>(null);

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

    return (
        <NodeFrame
            id={id}
            data={data}
            selected={selected}
            icon={<Icons.Solve />}
            defaultLabel="Solve"
            className="solve-node"
            onManualRun={() => executeNode(id, true)}
            headerExtras={
                <span style={{ fontSize: '0.7rem', color: 'var(--text-sub)', display: 'flex', alignItems: 'center' }}>
                    for
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
                            fontFamily: 'inherit',
                            marginLeft: '4px'
                        }}
                    />
                </span>
            }
        >
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
            <style>{`
                .solve-node {
                    transition: box-shadow 0.2s, border-color 0.2s;
                }
                .solve-node.selected {
                    border-color: #ff7e5f !important;
                    box-shadow: 0 0 25px rgba(255, 126, 95, 0.3) !important;
                }
            `}</style>
        </NodeFrame>
    );
}
