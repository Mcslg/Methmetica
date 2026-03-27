import React, { useState, useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import useStore, { type AppState } from '../store/useStore';
import 'mathlive';

interface FormulaSidebarAreaProps {
    containerId: string;
    sidebarSid: string;
}

export const FormulaSidebarArea: React.FC<FormulaSidebarAreaProps> = ({ containerId, sidebarSid }) => {
    const textNode = useStore((state: AppState) => state.nodes.find(n => n.id === sidebarSid));
    const handleEject = useStore((state: AppState) => state.handleEject);
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    const isCtrlPressed = useStore((state: AppState) => state.isCtrlPressed);
    const setDraggingEjectPos = useStore((state: AppState) => state.setDraggingEjectPos);
    const { screenToFlowPosition } = useReactFlow();

    // Local state for the formulas list
    const [formulas, setFormulas] = useState<string[]>([]);

    useEffect(() => {
        if (!textNode?.data.text) {
            setFormulas(['']);
            return;
        }

        const rawText = textNode.data.text;
        let extracted: string[] = [];
        
        if (rawText.includes('$$')) {
            const matches = rawText.match(/\$\$(.*?)\$\$/g);
            if (matches) {
                extracted = matches.map(m => m.slice(2, -2).trim());
            }
        } else {
            extracted = rawText.trim().split('\n').filter(Boolean);
        }
        
        if (extracted.length === 0) extracted = [''];
        setFormulas(extracted);
    }, [textNode?.data.text]);

    const syncToTextNode = (newFormulas: string[]) => {
        const text = newFormulas.map(f => `$$${f}$$`).join('\n');
        updateNodeData(sidebarSid, { text });
    };

    const addFormula = () => {
        const next = [...formulas, ''];
        setFormulas(next);
        syncToTextNode(next);
    };

    const removeFormula = (index: number) => {
        const next = formulas.filter((_, i) => i !== index);
        const final = next.length === 0 ? [''] : next;
        setFormulas(final);
        syncToTextNode(final);
    };

    const updateFormula = (index: number, val: string) => {
        const next = [...formulas];
        next[index] = val;
        setFormulas(next);
        syncToTextNode(next);
    };

    const onPointerDown = (e: React.PointerEvent) => {
        if (isCtrlPressed) {
            e.stopPropagation();
            const startX = e.clientX;
            const startY = e.clientY;
            
            const onPointerMove = (moveE: PointerEvent) => {
                const dx = moveE.clientX - startX;
                const dy = moveE.clientY - startY;
                if (Math.sqrt(dx * dx + dy * dy) > 5) {
                    setDraggingEjectPos({ startX, startY, curX: moveE.clientX, curY: moveE.clientY });
                }
            };
            
            const onPointerUp = (upE: PointerEvent) => {
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);
                setDraggingEjectPos(null);
                
                const dx = upE.clientX - startX;
                const dy = upE.clientY - startY;
                if (Math.sqrt(dx * dx + dy * dy) > 5) {
                    const flowPos = screenToFlowPosition({ x: upE.clientX, y: upE.clientY });
                    handleEject(containerId, 'formulaSidebar', flowPos);
                }
            };
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp, { once: true });
        }
    };

    const theme = useStore((state: AppState) => state.theme);
    const isLight = theme === 'light';

    const containerNode = useStore((state: AppState) => state.nodes.find(n => n.id === containerId));
    const allSlots = containerNode?.data.slots || {};

    // Get all sliders merged into this node
    const sliders = Object.entries(allSlots)
        .filter(([_, sid]) => {
            const node = useStore.getState().nodes.find(n => n.id === sid);
            return node?.type === 'sliderNode';
        })
        .map(([key, sid]) => ({ key, sid: sid as string }));

    const colors = ['#4facfe', '#f43f5e', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

    return (
        <div 
            className="formula-sidebar nodrag"
            onPointerDown={onPointerDown}
            style={{
                width: '100%',
                height: '100%',
                background: 'var(--bg-input)',
                borderRight: '1px solid var(--border-header)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden', // Avoid double scrollbar
                padding: '12px 0 0 0',
                userSelect: 'none'
            }}
        >
            {/* 1. Header Expressions */}
            <div style={{ padding: '0 12px 12px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.7 }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.05em', color: 'var(--text-main)' }}>EXPRESSIONS</span>
                {isCtrlPressed && <span style={{ fontSize: '0.55rem', color: 'var(--accent-bright)' }}>[DRAG TO EJECT]</span>}
            </div>

            <div className="custom-scrollbar" style={{ flexGrow: 1, overflowY: 'auto' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {formulas.map((f, i) => (
                        <FormulaRow 
                            key={i} 
                            index={i} 
                            formula={f} 
                            isLight={isLight} 
                            color={colors[i % colors.length]} 
                            onUpdate={updateFormula}
                            onRemove={removeFormula}
                        />
                    ))}
                </div>

                <button 
                    onClick={addFormula}
                    className="add-formula-btn"
                    style={{
                        margin: '12px',
                        background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)',
                        border: isLight ? '1px dashed rgba(0,0,0,0.1)' : '1px dashed rgba(255,255,255,0.1)',
                        borderRadius: '6px', color: 'var(--text-sub)', padding: '8px', cursor: 'pointer',
                        fontSize: '0.7rem', fontWeight: 600, transition: 'all 0.2s', width: 'calc(100% - 24px)'
                    }}
                >
                    + Add expression
                </button>

                {/* 2. Sliders / Parameters Section */}
                {sliders.length > 0 && (
                    <div style={{ borderTop: isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.08)', marginTop: '8px', paddingTop: '16px' }}>
                        <div style={{ padding: '0 12px 8px 12px', opacity: 0.7 }}>
                            <span style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '0.05em' }}>SLIDERS</span>
                        </div>
                        {sliders.map(({ key, sid }) => {
                            const proxyNode = useStore.getState().nodes.find(n => n.id === sid);
                            if (!proxyNode) return null;

                            const handleSliderEject = (e: React.PointerEvent) => {
                                if (isCtrlPressed) {
                                    e.stopPropagation();
                                    const startX = e.clientX;
                                    const startY = e.clientY;
                                    const onMove = (me: PointerEvent) => setDraggingEjectPos({ startX, startY, curX: me.clientX, curY: me.clientY });
                                    const onUp = (ue: PointerEvent) => {
                                        window.removeEventListener('pointermove', onMove);
                                        window.removeEventListener('pointerup', onUp);
                                        setDraggingEjectPos(null);
                                        if (Math.abs(ue.clientX - startX) > 5 || Math.abs(ue.clientY - startY) > 5) {
                                            const flowPos = screenToFlowPosition({ x: ue.clientX, y: ue.clientY });
                                            handleEject(containerId, key, flowPos);
                                        }
                                    };
                                    window.addEventListener('pointermove', onMove);
                                    window.addEventListener('pointerup', onUp, { once: true });
                                }
                            };

                            return (
                                <div key={sid} onPointerDown={handleSliderEject} style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '6px', borderBottom: isLight ? '1px solid rgba(0,0,0,0.03)' : '1px solid rgba(255,255,255,0.03)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ 
                                                width: '18px', height: '18px', 
                                                background: 'var(--accent)', 
                                                borderRadius: '50%', 
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                                fontSize: '0.6rem', fontWeight: 800, color: 'white',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                            }}>
                                                {key}
                                            </div>
                                            <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-main)', opacity: 0.8 }}>{proxyNode.data.nodeName || key}</span>
                                        </div>
                                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent-bright)' }}>
                                            {Number(proxyNode.data.value).toFixed(2)}
                                        </div>
                                    </div>
                                    
                                    <div style={{ position: 'relative', width: '100%', padding: '4px 0' }}>
                                        <input
                                            type="range"
                                            className="nodrag premium-slider"
                                            min={proxyNode.data.min ?? -10}
                                            max={proxyNode.data.max ?? 10}
                                            step={proxyNode.data.step ?? 0.1}
                                            value={proxyNode.data.value || 0}
                                            onChange={(e) => updateNodeData(sid, { value: e.target.value })}
                                            style={{ 
                                                width: '100%', 
                                                accentColor: 'var(--accent-bright)', 
                                                height: '4px',
                                                background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
                                                borderRadius: '2px',
                                                cursor: 'pointer'
                                            }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.55rem', color: 'var(--text-sub)', opacity: 0.5 }}>
                                        <span>{proxyNode.data.min ?? -10}</span>
                                        <span>{proxyNode.data.max ?? 10}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <style>{`
                .formula-row:hover { background: ${isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)'}; }
                .formula-row:hover .formula-del-btn { color: #f43f5e !important; }
                .formula-input-flat::part(container) { padding: 0; }
                .formula-input-flat:focus-within { background: ${isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.02)'} !important; }
                .add-formula-btn:hover {
                    background: ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)'} !important;
                    color: var(--text-main) !important;
                    border-color: var(--accent) !important;
                }
            `}</style>
        </div>
    );
};

interface FormulaRowProps {
    index: number;
    formula: string;
    isLight: boolean;
    color: string;
    onUpdate: (idx: number, val: string) => void;
    onRemove: (idx: number) => void;
}

const FormulaRow: React.FC<FormulaRowProps> = ({ index, formula, isLight, color, onUpdate, onRemove }) => {
    const mfRef = useRef<any>(null);

    // [PERF] Isolated manual sync for formula rows
    useEffect(() => {
        const mf = mfRef.current;
        if (!mf) return;
        if (mf.value !== formula) {
            mf.value = formula;
        }
        
        const handleInput = (e: any) => {
            const nextVal = e.target.value;
            if (nextVal !== formula) {
                onUpdate(index, nextVal);
            }
        };
        
        mf.addEventListener('input', handleInput);
        return () => mf.removeEventListener('input', handleInput);
    }, [index, formula, onUpdate]);

    return (
        <div style={{ 
            position: 'relative', 
            padding: '8px 12px', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '10px',
            borderBottom: isLight ? '1px solid rgba(0,0,0,0.05)' : '1px solid rgba(255,255,255,0.03)',
            transition: 'background 0.2s'
        }} className="formula-row">
            <div style={{ 
                width: '4px', 
                height: '24px', 
                background: color, 
                borderRadius: '2px',
                flexShrink: 0 
            }} />
            
            <math-field
                ref={mfRef}
                class="nodrag formula-input-flat"
                style={{ 
                    fontSize: '0.9rem', 
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-main)',
                    flexGrow: 1,
                    padding: '4px 0',
                    outline: 'none'
                }}
            />

            <button 
                onClick={() => onRemove(index)}
                style={{
                    background: 'transparent', border: 'none', color: isLight ? 'rgba(0,0,0,0.2)' : '#444',
                    cursor: 'pointer', fontSize: '0.8rem', padding: '4px', display: 'flex'
                }}
                className="formula-del-btn"
            > ✕ </button>
        </div>
    );
};
