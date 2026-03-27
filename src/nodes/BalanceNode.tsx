import { useEffect, memo, useRef, useState } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import useStore, { type NodeData, type AppState } from '../store/useStore';
import { Icons } from '../components/Icons';
import { NodeFrame } from '../components/NodeFrame';
import { MathInput } from '../components/MathInput';
import { InteractiveEquation } from '../components/InteractiveEquation';
import { useLanguage } from '../contexts/LanguageContext';

export const BalanceNode = memo(function BalanceNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    const { t } = useLanguage();
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    const executeNode = useStore((state: AppState) => state.executeNode);
    const opValRef = useRef<HTMLInputElement>(null);
    const [inputGesture, setInputGesture] = useState<{ startY: number, curY: number } | null>(null);

    // Initial setup for handles
    useEffect(() => {
        const currentHandles = data.handles || [];
        const hasIn = currentHandles.some(h => h.id === 'h-in');
        const hasOut = currentHandles.some(h => h.type === 'output');
        if (!hasIn || !hasOut) {
            updateNodeData(id, { 
                handles: [
                    { id: 'h-in', type: 'input', position: 'left', offset: 50, label: 'eq' },
                    { id: 'h-out', type: 'output', position: 'right', offset: 50 }
                ] 
            });
        }
    }, [id, data.handles, updateNodeData]);

    useEffect(() => {
        executeNode(id);
    }, [data.inputSignature, id, executeNode]);

    const operations = data.operations || [];
    // If no formula is inputted, fallback to the connected input
    const currentFormula = data.currentFormula ?? data.input ?? '';

    // Step 1: Just record the operation to the history list without complex evaluation yet
    const addOperation = (op: string) => {
        let val = opValRef.current?.value || '0';
        // Basic normalization
        val = val.trim();
        if (!val) val = '0';
        
        const newOps = [...operations, { op, value: val }];
        updateNodeData(id, { operations: newOps });
        executeNode(id);
        
        // Clear input
        if (opValRef.current) opValRef.current.value = '';
    };

    const removeOperation = (idx: number) => {
        const newOps = [...operations];
        newOps.splice(idx, 1);
        updateNodeData(id, { operations: newOps });
        executeNode(id);
    }

    const getOpLabel = (op: string, val: string) => {
        const labels: Record<string, string> = {
            '+': t('nodes.balance.labels.add'),
            '-': t('nodes.balance.labels.sub'),
            '*': t('nodes.balance.labels.mul'),
            '/': t('nodes.balance.labels.div')
        };
        return `${labels[op] || op} ${val} ${t('nodes.balance.labels.to_both')}`;
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            const val = e.currentTarget.value.trim();
            if (val) addOperation('+');
        }
    };

    const handleInputPointerDown = (e: React.PointerEvent) => {
        // e.stopPropagation(); is omitted to allow input focusing
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setInputGesture({ startY: e.clientY, curY: e.clientY });
    };
    
    const handleInputPointerMove = (e: React.PointerEvent) => {
        if (!inputGesture) return;
        setInputGesture({ ...inputGesture, curY: e.clientY });
        
        // If it starts looking like a swipe, blur the input to stop keyboard/selection
        if (Math.abs(e.clientY - inputGesture.startY) > 10) {
            opValRef.current?.blur();
        }
    };

    const handleInputPointerUp = (e: React.PointerEvent) => {
        if (inputGesture) {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            if ((e.clientY - inputGesture.startY) > 30) {
                // Dragged down!
                const val = opValRef.current?.value || '';
                if (val.trim()) {
                    addOperation('/');
                    if (opValRef.current) opValRef.current.value = '';
                }
            }
        }
        setInputGesture(null);
    };

    const handleOpDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const dropVal = e.dataTransfer.getData('text/plain');
        if (dropVal) {
            // Drop onto input means Add
            const prevVal = opValRef.current?.value;
            if (opValRef.current) opValRef.current.value = dropVal;
            addOperation('+');
            if (opValRef.current) opValRef.current.value = prevVal || '';
        }
    };
    
    return (
        <NodeFrame
            id={id}
            data={data}
            selected={selected}
            icon={<Icons.Balance />}
            defaultLabel={t('nodes.balance.title')}
            className="balance-node"
        >
            <div style={{ padding: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-sub)', textTransform: 'uppercase' }}>
                    {t('nodes.balance.original')}
                </div>
                <div style={{ 
                    borderRadius: '6px',
                    justifyContent: 'center',
                    display: 'flex',
                    minHeight: '20px'
                }}>
                    <MathInput 
                        value={data.input || ''} 
                        onChange={(v) => updateNodeData(id, { input: v })} 
                        className="nodrag formula-input"
                    />
                </div>
                
                {operations.length > 0 && !!data.slots?.resultText && (
                    <div style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '4px',
                        background: 'var(--bg-node-dim)',
                        padding: '6px',
                        borderRadius: '6px',
                        marginTop: '4px',
                        border: '1px solid var(--border-node)',
                        maxHeight: '120px',
                        overflowY: 'auto'
                    }}>
                        {operations.map((op: any, i: number) => (
                            <div key={i} style={{ 
                                display: 'flex', 
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                fontSize: '0.75rem', 
                                padding: '4px 8px',
                                background: 'var(--bg-node)',
                                border: '1px solid var(--border-node)',
                                borderRadius: '4px',
                                color: 'var(--text-main)',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                            }}>
                                <span style={{ fontWeight: 500 }}>{getOpLabel(op.op, op.value)}</span>
                                <span 
                                    onClick={() => removeOperation(i)} 
                                    style={{
                                        cursor: 'pointer', 
                                        color: 'var(--text-sub)',
                                        marginLeft: '8px',
                                        fontSize: '0.9rem',
                                        opacity: 0.6
                                    }}
                                    onMouseOver={(e) => (e.currentTarget.style.color = '#ff4757')}
                                    onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-sub)')}
                                >
                                    ×
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                <div style={{ fontSize: '0.65rem', color: 'var(--text-sub)', textTransform: 'uppercase', marginTop: '4px' }}>
                    {t('nodes.balance.operations')}
                </div>
                
                <div 
                    style={{ 
                        position: 'relative', 
                        display: 'flex', 
                        alignItems: 'center',
                        touchAction: 'none'
                    }}
                    onPointerDown={handleInputPointerDown}
                    onPointerMove={handleInputPointerMove}
                    onPointerUp={handleInputPointerUp}
                    onPointerCancel={handleInputPointerUp}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                    onDrop={handleOpDrop}
                    className="balance-op-input nodrag"
                >
                    <input 
                        ref={opValRef}
                        type="text" 
                        onKeyDown={handleKeyDown}
                        placeholder={t('nodes.balance.placeholder')}
                        style={{ 
                            flex: 1, 
                            background: 'var(--bg-input)', 
                            border: '1px solid var(--border-node)', 
                            color: 'var(--text-main)',
                            borderRadius: '4px',
                            padding: '6px 10px',
                            fontSize: '0.85rem',
                            outline: 'none',
                            textAlign: 'center',
                            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)'
                        }}
                    />
                    
                    {inputGesture && (inputGesture.curY - inputGesture.startY) > 10 && (
                        <div style={{
                            position: 'absolute',
                            left: 0, right: 0, bottom: '-20px',
                            display: 'flex', justifyContent: 'center',
                            pointerEvents: 'none',
                            opacity: Math.min(1, (inputGesture.curY - inputGesture.startY) / 30)
                        }}>
                             <span style={{color: 'var(--accent)', fontWeight: 'bold', fontSize: '1.2rem'}}>÷</span>
                        </div>
                    )}
                </div>


                <div style={{ fontSize: '0.65rem', color: 'var(--text-sub)', textTransform: 'uppercase', marginTop: '4px' }}>
                    {t('nodes.balance.interactive')}
                </div>
                <InteractiveEquation 
                    formula={currentFormula} 
                    onApplyOperation={(op, val) => {
                        const newOps = [...operations, { op, value: val }];
                        updateNodeData(id, { operations: newOps });
                        executeNode(id);
                    }} 
                />

                <div style={{ fontSize: '0.65rem', color: 'var(--text-sub)', textTransform: 'uppercase', marginTop: '4px' }}>
                    {t('nodes.balance.current')}
                </div>
                <MathInput 
                    value={currentFormula} 
                    onChange={(v) => updateNodeData(id, { currentFormula: v })} 
                    className="nodrag formula-input"
                />
            </div>

            <style>{`
                .balance-node .op-btn {
                    background: var(--bg-input);
                    border: 1px solid var(--border-node);
                    color: var(--text-main);
                    border-radius: 4px;
                    cursor: pointer;
                    width: 26px;
                    height: 26px;
                    display: flex;
                    align-items: center;
                    justifyContent: center;
                    font-weight: bold;
                    transition: all 0.2s;
                }
                .balance-node .op-btn:hover {
                    background: var(--accent);
                    color: white;
                    border-color: var(--accent);
                }
            `}</style>
        </NodeFrame>
    );
});
