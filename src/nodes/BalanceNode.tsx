import { useEffect, memo, useRef, useState } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import useStore, { type NodeData, type AppState, type BalanceOperation } from '../store/useStore';
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
    // Gesture state for the global op input (swipe down = divide)
    const [gesture, setGesture] = useState<{ startY: number; curY: number } | null>(null);

    // Initial handles
    useEffect(() => {
        const current = data.handles || [];
        const hasIn = current.some((h: any) => h.id === 'h-in');
        const hasOut = current.some((h: any) => h.type === 'output');
        if (!hasIn || !hasOut) {
            updateNodeData(id, {
                handles: [
                    { id: 'h-in', type: 'input', position: 'left', offset: 50, label: 'eq' },
                    { id: 'h-out', type: 'output', position: 'right', offset: 50 },
                ],
            });
        }
    }, [id, data.handles, updateNodeData]);

    useEffect(() => {
        executeNode(id);
    }, [data.inputSignature, data.input, id, executeNode]);

    const operations: BalanceOperation[] = data.operations || [];
    const currentFormula = data.currentFormula ?? data.input ?? '';

    const appendOperation = (nextOp: BalanceOperation) => {
        const newOps = [...operations, nextOp];
        updateNodeData(id, { operations: newOps });
        executeNode(id);
    };

    const applyOp = (op: string) => {
        const val = opValRef.current?.value?.trim();
        if (!val) return;
        appendOperation({ op, value: val });
        if (opValRef.current) opValRef.current.value = '';
    };

    const removeOperation = (idx: number) => {
        const newOps = [...operations];
        newOps.splice(idx, 1);
        updateNodeData(id, { operations: newOps });
        executeNode(id);
    };

    const clearOperations = () => {
        updateNodeData(id, { operations: [] });
        executeNode(id);
    };

    // Swipe-down gesture on input = divide both sides
    const handleGestureDown = (e: React.PointerEvent) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setGesture({ startY: e.clientY, curY: e.clientY });
    };
    const handleGestureMove = (e: React.PointerEvent) => {
        if (!gesture) return;
        setGesture({ ...gesture, curY: e.clientY });
        if (Math.abs(e.clientY - gesture.startY) > 10) opValRef.current?.blur();
    };
    const handleGestureUp = (e: React.PointerEvent) => {
        if (gesture) {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            if (e.clientY - gesture.startY > 30) applyOp('/');
        }
        setGesture(null);
    };

    const swipeDelta = gesture ? gesture.curY - gesture.startY : 0;
    const showDivHint = swipeDelta > 10;

    const getOperationBadge = (op: BalanceOperation) => {
        if (op.op === 'factor') return 'ƒ';
        if (op.op === 'expand') return '⤢';
        if (op.op === 'simplify') return '≈';
        if (op.op === '(') return '( )';
        if (op.op === '*') return '×';
        if (op.op === '/') return '÷';
        return op.op;
    };

    const getOperationLabel = (op: BalanceOperation) => {
        if (op.op === 'factor') return op.factor ? `Factor out ${op.factor}` : 'Factor';
        if (op.op === 'expand') return 'Expand';
        if (op.op === 'simplify') return 'Simplify';
        if (op.op === '(') return 'Group';
        if (op.op === '+') return `Add ${op.value}`;
        if (op.op === '-') return `Subtract ${op.value}`;
        if (op.op === '*') return `Multiply by ${op.value}`;
        if (op.op === '/') return `Divide by ${op.value}`;
        return op.op;
    };

    const getOperationPreview = (op: BalanceOperation) => {
        if (op.op === 'factor' && op.factor && op.result) return `${op.factor}(${op.result})`;
        if ((op.op === 'expand' || op.op === 'simplify') && op.result) return op.result;
        if (op.op === '(') return `(${op.value})`;
        return op.value;
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '2px' }}>

                {/* ── Original equation input ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span className="bn-section-label">{t('nodes.balance.original')}</span>
                    <MathInput
                        value={data.input || ''}
                        onChange={(v) => updateNodeData(id, { input: v })}
                        className="nodrag formula-input"
                    />
                </div>

                {/* ── Interactive equation stage ── */}
                <InteractiveEquation
                    formula={currentFormula}
                    onApplyOperation={(op, val, meta) => {
                        appendOperation({ op, value: val, ...meta });
                    }}
                />

                {/* ── Global operations: apply to BOTH sides ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <span className="bn-section-label">{t('nodes.balance.operations')}</span>
                    <div className="bn-global-ops nodrag">
                        {/* Value input with swipe-down = divide */}
                        <div
                            className="bn-op-input-wrap"
                            onPointerDown={handleGestureDown}
                            onPointerMove={handleGestureMove}
                            onPointerUp={handleGestureUp}
                            onPointerCancel={handleGestureUp}
                            style={{ touchAction: 'none', position: 'relative', flex: 1 }}
                        >
                            <input
                                ref={opValRef}
                                type="text"
                                placeholder={t('nodes.balance.placeholder')}
                                className="bn-op-input"
                                onKeyDown={(e) => e.key === 'Enter' && applyOp('+')}
                            />
                            {showDivHint && (
                                <div className="bn-swipe-hint" style={{
                                    opacity: Math.min(1, swipeDelta / 35)
                                }}>÷</div>
                            )}
                        </div>
                        {/* Op buttons */}
                        <div className="bn-op-btns">
                            {(['+', '-', '×', '÷'] as const).map((sym) => {
                                const op = sym === '×' ? '*' : sym === '÷' ? '/' : sym;
                                const color = sym === '+' ? '#4ade80' : sym === '-' ? '#ff7855' : sym === '×' ? '#4facfe' : '#f9a826';
                                return (
                                    <button
                                        key={sym}
                                        className="bn-op-btn"
                                        style={{ '--btn-color': color } as any}
                                        onClick={() => applyOp(op)}
                                        title={`${sym} both sides`}
                                    >{sym}</button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* ── Current result — always shown ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span className="bn-section-label">{t('nodes.balance.current')}</span>
                    <MathInput
                        value={currentFormula}
                        onChange={(v) => updateNodeData(id, { currentFormula: v })}
                        className={`nodrag formula-input${operations.length > 0 ? ' bn-result-field' : ''}`}
                    />
                </div>

                {/* ── Operations history ── */}
                {operations.length > 0 && (
                    <div className="bn-history" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className="bn-section-label">History</span>
                            <span 
                                className="bn-clear-btn"
                                onClick={clearOperations}
                                title="Clear operation history"
                            >
                                Clear All
                            </span>
                        </div>
                        <div className="bn-history-list">
                            {operations.map((op, i) => (
                                <div key={i} className="bn-step">
                                    <span className={`bn-step-badge bn-op-${op.op}`}>
                                        {getOperationBadge(op)}
                                    </span>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flex: 1, minWidth: 0 }}>
                                        <span className="bn-step-title">
                                            {getOperationLabel(op)}
                                        </span>
                                        <span className="bn-step-desc">
                                            {getOperationPreview(op)}
                                        </span>
                                    </div>
                                    <span className="bn-step-remove" onClick={() => removeOperation(i)}>×</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                .balance-node .bn-section-label {
                    font-size: 0.6rem;
                    font-weight: 700;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    color: rgba(255,255,255,0.25);
                    user-select: none;
                }
                [data-theme='light'] .balance-node .bn-section-label {
                    color: rgba(14,47,11,0.35);
                }

                /* Global ops row */
                .balance-node .bn-global-ops {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .balance-node .bn-op-input-wrap {
                    flex: 1;
                }
                .balance-node .bn-op-input {
                    width: 100%;
                    box-sizing: border-box;
                    background: rgba(0,0,0,0.25);
                    border: 1px solid rgba(255,255,255,0.1);
                    color: var(--text-main);
                    border-radius: 8px;
                    padding: 6px 10px;
                    font-size: 0.85rem;
                    font-family: inherit;
                    outline: none;
                    text-align: center;
                    transition: border-color 0.15s;
                }
                .balance-node .bn-op-input:focus {
                    border-color: rgba(255,255,255,0.25);
                }
                [data-theme='light'] .balance-node .bn-op-input {
                    background: rgba(14,47,11,0.05);
                    border-color: rgba(14,47,11,0.15);
                    color: var(--text-main);
                }
                /* Swipe-down divide hint */
                .balance-node .bn-swipe-hint {
                    position: absolute;
                    left: 50%;
                    bottom: -18px;
                    transform: translateX(-50%);
                    font-size: 1.1rem;
                    font-weight: bold;
                    color: #f9a826;
                    pointer-events: none;
                }
                /* Op buttons */
                .balance-node .bn-op-btns {
                    display: flex;
                    gap: 3px;
                }
                .balance-node .bn-op-btn {
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(255,255,255,0.04);
                    border: 1px solid rgba(255,255,255,0.1);
                    color: rgba(255,255,255,0.55);
                    border-radius: 7px;
                    cursor: pointer;
                    font-size: 0.9rem;
                    font-weight: 700;
                    transition: all 0.14s;
                    font-family: inherit;
                }
                .balance-node .bn-op-btn:hover {
                    background: color-mix(in srgb, var(--btn-color) 18%, transparent);
                    border-color: color-mix(in srgb, var(--btn-color) 50%, transparent);
                    color: var(--btn-color);
                }
                [data-theme='light'] .balance-node .bn-op-btn {
                    background: rgba(14,47,11,0.04);
                    border-color: rgba(14,47,11,0.12);
                    color: rgba(14,47,11,0.5);
                }

                /* History list (TextNode merged only) */
                .balance-node .bn-history {
                    display: flex;
                    flex-direction: column;
                    gap: 3px;
                    max-height: 110px;
                    overflow-y: auto;
                }
                .balance-node .bn-step {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 3px 8px 3px 5px;
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.06);
                    border-radius: 7px;
                    transition: background 0.15s;
                }
                .balance-node .bn-step:hover { background: rgba(255,255,255,0.06); }
                [data-theme='light'] .balance-node .bn-step {
                    background: rgba(14,47,11,0.03);
                    border-color: rgba(14,47,11,0.08);
                }
                .balance-node .bn-step-badge {
                    font-size: 0.75rem;
                    font-weight: 800;
                    min-width: 20px;
                    height: 20px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 5px;
                    flex-shrink: 0;
                }
                .balance-node .bn-op-\\+ { background: rgba(74,222,128,0.15); color: #4ade80; }
                .balance-node .bn-op-\\- { background: rgba(255,100,80,0.15); color: #ff7855; }
                .balance-node .bn-op-\\* { background: rgba(79,172,254,0.15); color: #4facfe; }
                .balance-node .bn-op-\\/ { background: rgba(249,168,38,0.15); color: #f9a826; }
                .balance-node .bn-op-\\( { background: rgba(200,150,255,0.15); color: #c896ff; }
                [data-theme='light'] .balance-node .bn-op-\\+ { background: rgba(14,120,50,0.12); color: #0e7832; }
                [data-theme='light'] .balance-node .bn-op-\\- { background: rgba(180,30,10,0.1); color: #b41e0a; }
                [data-theme='light'] .balance-node .bn-op-\\* { background: rgba(10,80,180,0.1); color: #0a50b4; }
                [data-theme='light'] .balance-node .bn-op-\\/ { background: rgba(160,90,0,0.1); color: #a05a00; }
                [data-theme='light'] .balance-node .bn-op-\\( { background: rgba(120,0,200,0.1); color: #7800c8; }
                .balance-node .bn-step-remove {
                    cursor: pointer;
                    font-size: 1rem;
                    opacity: 0.25;
                    transition: opacity 0.15s, color 0.15s;
                    margin-left: auto;
                    flex-shrink: 0;
                    user-select: none;
                }
                .balance-node .bn-step-remove:hover { opacity: 1; color: #ff4757; }

                /* Text classes for steps */
                .balance-node .bn-step-title {
                    font-size: 0.72rem;
                    font-weight: 700;
                    color: rgba(255,255,255,0.82);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .balance-node .bn-step-desc {
                    font-size: 0.68rem;
                    color: rgba(255,255,255,0.5);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                [data-theme='light'] .balance-node .bn-step-title {
                    color: rgba(14,47,11,0.85);
                }
                [data-theme='light'] .balance-node .bn-step-desc {
                    color: rgba(14,47,11,0.55);
                }

                .balance-node .bn-clear-btn {
                    font-size: 0.65rem;
                    color: rgba(255,255,255,0.4);
                    cursor: pointer;
                    padding: 2px 4px;
                    border-radius: 4px;
                    transition: color 0.15s, background 0.15s;
                }
                .balance-node .bn-clear-btn:hover {
                    color: #ff7855;
                    background: rgba(255,120,85,0.1);
                }
                [data-theme='light'] .balance-node .bn-clear-btn {
                    color: rgba(14,47,11,0.4);
                }
                [data-theme='light'] .balance-node .bn-clear-btn:hover {
                    color: #ff3c00;
                    background: rgba(255,60,0,0.08);
                }

                /* Result formula highlight */
                .balance-node .bn-result-field {
                    border-color: rgba(74,222,128,0.3) !important;
                    box-shadow: 0 0 0 1px rgba(74,222,128,0.08) !important;
                }
                [data-theme='light'] .balance-node .bn-result-field {
                    border-color: rgba(14,47,11,0.3) !important;
                    box-shadow: none !important;
                }
            `}</style>
        </NodeFrame>
    );
});
