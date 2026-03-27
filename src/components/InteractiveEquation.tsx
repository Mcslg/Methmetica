import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getMathEngine } from '../utils/MathEngine';
import 'mathlive';

interface InteractiveEquationProps {
    formula: string;
    onApplyOperation: (op: string, value: string) => void;
}

export const InteractiveEquation: React.FC<InteractiveEquationProps> = ({ formula, onApplyOperation }) => {
    const [dragState, setDragState] = useState<{
        term: any;
        mode: 'pending' | 'sideways' | 'downwards';
        startX: number;
        startY: number;
        curX: number;
        curY: number;
        moved: boolean;
    } | null>(null);

    // Parse formula into top-level terms
    const parsedData = useMemo(() => {
        if (!formula || !formula.includes('=')) return null;
        try {
            const ce = getMathEngine();
            const parts = formula.split('=');
            if (parts.length !== 2) return null;

            const parseSide = (str: string, side: 'LHS' | 'RHS') => {
                const expr = ce.parse(str);
                const terms: { id: string, latex: string, sign: '+' | '-', original: string, coefficient: string }[] = [];
                
                // If the top level is an Addition, extract terms
                const json = expr.json;
                const head = Array.isArray(json) ? json[0] : null;
                
                if (head === 'Add') {
                    const ops = (expr as any).ops || [];
                    ops.forEach((op: any, idx: number) => {
                        let opLatex = op.latex || op.toString();
                        let opSign: '+' | '-' = '+';
                        
                        const opJson = op.json;
                        const opHead = Array.isArray(opJson) ? opJson[0] : null;

                        // Handle subtract internally represented as adding negative
                        if (opHead === 'Multiply' && op.ops?.[0]?.numericValue === -1) {
                            opSign = '-';
                            // Strip the -1 from the latex
                            const positiveOp = ce.box(['Multiply', ...op.ops.slice(1)]);
                            opLatex = positiveOp.latex || positiveOp.toString();
                        } else if (opLatex.startsWith('-')) {
                            opSign = '-';
                            opLatex = opLatex.substring(1);
                        }

                        let coefficient = '1';
                        // Simple latex string coefficient extraction
                        const match = opLatex.trim().match(/^([\d.]+)(.*)$/);
                        if (match) {
                            coefficient = match[1];
                        } else if (opLatex === '-') {
                            coefficient = '-1';
                        }
                        
                        terms.push({ 
                            id: `${side}-${idx}`, 
                            latex: opLatex.trim(), 
                            sign: opSign,
                            original: op.latex || op.toString(),
                            coefficient
                        });
                    });
                } else {
                    // Single term
                    let latex = expr.latex || expr.toString();
                    let sign: '+' | '-' = '+';
                    if (latex.startsWith('-')) {
                        sign = '-';
                        latex = latex.substring(1);
                    }
                    let coefficient = '1';
                    const match = latex.trim().match(/^([\d.]+)(.*)$/);
                    if (match) coefficient = match[1];

                    terms.push({ id: `${side}-0`, latex, sign, original: expr.latex || expr.toString(), coefficient });
                }
                return terms;
            };

            return {
                lhs: parseSide(parts[0], 'LHS'),
                rhs: parseSide(parts[1], 'RHS')
            };
        } catch (e) {
            console.error('Interactive Parse Error', e);
            return null;
        }
    }, [formula]);

    if (!parsedData) return <div style={{ opacity: 0.5, fontSize: '0.8rem', padding: '12px' }}>Cannot parse interactively</div>;

    const handlePointerDown = (e: React.PointerEvent, term: any) => {
        e.stopPropagation();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setDragState({
            term,
            mode: 'pending',
            startX: e.clientX,
            startY: e.clientY,
            curX: e.clientX,
            curY: e.clientY,
            moved: false
        });
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!dragState) return;
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;

        let mode = dragState.mode;
        let moved = dragState.moved;

        if (mode === 'pending') {
            if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                moved = true;
                if (dy > Math.abs(dx)) {
                    mode = 'downwards';
                } else {
                    mode = 'sideways';
                }
            }
        }

        setDragState({
            ...dragState,
            curX: e.clientX,
            curY: e.clientY,
            mode,
            moved
        });
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (!dragState) return;
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);

        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;

        const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
        if (dropTarget && dropTarget.closest('.balance-op-input')) {
             onApplyOperation('+', dragState.term.original);
        } else if (dragState.mode === 'sideways' && Math.abs(dx) > 40) {
             const opType = dragState.term.sign === '+' ? '-' : '+';
             onApplyOperation(opType, dragState.term.original);
        } else if (dragState.mode === 'downwards' && dy > 40) {
             const val = dragState.term.coefficient && dragState.term.coefficient !== '1' ? dragState.term.coefficient : dragState.term.original;
             onApplyOperation('/', val);
        }

        setDragState(null);
    };

    const renderTerm = (term: any, side: 'LHS' | 'RHS', index: number) => {
        const isDragging = dragState?.term.id === term.id;
        
        return (
            <div key={term.id} style={{ display: 'flex', alignItems: 'center' }}>
                {(index > 0 || term.sign === '-') && (
                    <span style={{ margin: '0 6px', color: 'var(--text-sub)', fontSize: '1.1rem' }}>
                        {term.sign}
                    </span>
                )}
                <div 
                    className="draggable-math-term nodrag"
                    onPointerDown={(e) => handlePointerDown(e, term)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    style={{
                        padding: '4px 8px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid var(--border-node)',
                        borderRadius: '6px',
                        cursor: 'grab',
                        opacity: isDragging ? 0.3 : 1,
                        transition: 'opacity 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        touchAction: 'none'
                    }}
                >
                    <math-field read-only style={{ background: 'transparent', border: 'none', minHeight: 0, outline: 'none', fontSize: '1.2rem', padding: 0 }}>
                        {term.latex}
                    </math-field>
                </div>
            </div>
        );
    };

    return (
        <>
            <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                gap: '12px',
                padding: '16px 8px',
                background: 'var(--bg-input)',
                borderRadius: '8px',
                border: '1px solid var(--border-node)',
                minHeight: '60px',
                overflowX: 'auto'
            }}>
                <style>{`
                    .draggable-math-term:hover {
                        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                        border-color: var(--accent);
                        transform: translateY(-2px);
                    }
                    .draggable-math-term:active {
                        cursor: grabbing;
                        transform: scale(0.95);
                    }
                    .drop-zone {
                        display: flex;
                        align-items: center;
                        padding: 8px;
                        border-radius: 8px;
                        border: 1px dashed transparent;
                        transition: all 0.2s;
                        min-width: 40px;
                    }
                `}</style>
                
                <div className="drop-zone">
                    {parsedData.lhs.map((t, i) => renderTerm(t, 'LHS', i))}
                    {parsedData.lhs.length === 0 && <span style={{opacity: 0.3}}>0</span>}
                </div>

                <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--accent-bright)' }}>
                    =
                </div>

                <div className="drop-zone">
                    {parsedData.rhs.map((t, i) => renderTerm(t, 'RHS', i))}
                    {parsedData.rhs.length === 0 && <span style={{opacity: 0.3}}>0</span>}
                </div>
            </div>
            
            {/* Custom drag ghost via Portal to escape transform context */}
            {dragState?.moved && createPortal(
                <div style={{
                    position: 'fixed', 
                    left: 0,
                    top: 0,
                    transform: `translate(${dragState.curX}px, ${dragState.curY}px)`,
                    marginLeft: '-30px', // Center the ghost on cursor
                    marginTop: '-20px',
                    pointerEvents: 'none', 
                    zIndex: 999999,
                    background: dragState.mode === 'downwards' ? 'var(--accent-bright)' : 'var(--accent)',
                    color: 'white', 
                    padding: '6px 16px', 
                    borderRadius: '8px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    fontSize: '18px', 
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    whiteSpace: 'nowrap',
                    willChange: 'transform'
                }}>
                    {dragState.mode === 'downwards' ? (
                         <>
                            <span style={{opacity: 0.7}}>÷</span>
                            {dragState.term.coefficient && dragState.term.coefficient !== '1' 
                                ? dragState.term.coefficient 
                                : dragState.term.original}
                         </>
                    ) : (
                         <span>
                            {(dragState.term.sign === '-' ? '-' : '+') + dragState.term.latex}
                         </span>
                    )}
                </div>,
                document.body
            )}
        </>
    );
};
