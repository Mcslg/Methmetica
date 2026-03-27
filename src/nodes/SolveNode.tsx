import React, { useEffect, useRef, memo } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import useStore, { type NodeData, type AppState } from '../store/useStore';
import { Icons } from '../components/Icons';
import 'mathlive';
import { NodeFrame } from '../components/NodeFrame';

export const SolveNode = memo(function SolveNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    const executeNode = useStore((state: AppState) => state.executeNode);
    const mfRef = useRef<any>(null);
    const isSettingValueRef = useRef(false);

    // [PERF] Isolated store value to stop React from thrashing the web component
    const formulaInStore = useStore((state: AppState) => state.nodes.find(n => n.id === id)?.data.formula || '');

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

    const formulaInStoreRef = useRef(formulaInStore);

    // Ref sync without triggering effect loops
    useEffect(() => {
        formulaInStoreRef.current = formulaInStore;
    }, [formulaInStore]);

    // [PERF] Setup event listener once
    useEffect(() => {
        const mf = mfRef.current;
        if (!mf) return;

        const handleInput = (e: any) => {
            if (isSettingValueRef.current) return;
            const nextVal = e.target.value;
            if (nextVal !== formulaInStoreRef.current) {
                updateNodeData(id, { formula: nextVal });
            }
        };

        mf.addEventListener('input', handleInput);
        return () => mf.removeEventListener('input', handleInput);
    }, [id, updateNodeData]);

    // [PERF] Manual sync from store to web component
    useEffect(() => {
        const mf = mfRef.current;
        if (!mf) return;

        if (mf.value !== formulaInStore) {
            isSettingValueRef.current = true;
            mf.value = formulaInStore;
            isSettingValueRef.current = false;
        }
    }, [formulaInStore]);

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
            />

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
});

