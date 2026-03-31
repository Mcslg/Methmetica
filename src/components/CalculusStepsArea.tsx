import React, { useEffect, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import useStore, { type AppState } from '../store/useStore';
import { useLanguage } from '../contexts/LanguageContext';
import { Icons } from './Icons';
import { generateDiffSteps, generateLimitSteps, type CalculusStep } from '../utils/CalculusSolver';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface CalculusStepsAreaProps {
    containerId: string;
}

export const CalculusStepsArea: React.FC<CalculusStepsAreaProps> = ({ containerId }) => {
    const { t } = useLanguage();
    const parentNode = useStore((state: AppState) => state.nodes.find(n => n.id === containerId));
    const handleEject = useStore((state: AppState) => state.handleEject);
    const isCtrlPressed = useStore((state: AppState) => state.isCtrlPressed);
    const setDraggingEjectPos = useStore((state: AppState) => state.setDraggingEjectPos);
    const { screenToFlowPosition } = useReactFlow();

    // Steps state
    const [steps, setSteps] = useState<CalculusStep[] | null>(null);
    const [isThinking, setIsThinking] = useState(false);

    const formula = parentNode?.data.input || parentNode?.data.formula || '';
    const variable = parentNode?.data.variable || 'x';
    const limitPoint = parentNode?.data.limitPoint ?? '';

    useEffect(() => {
        if (!formula) {
            setSteps(null);
            return;
        }

        const variant = parentNode?.data.variant || 'diff';
        let ruleSteps = null;

        if (variant === 'diff') {
            ruleSteps = generateDiffSteps(formula, variable);
        } else if (variant === 'limit') {
            ruleSteps = generateLimitSteps(formula, limitPoint, variable);
        }
        
        if (ruleSteps) {
            setSteps(ruleSteps);
        } else {
            setSteps(null);
        }
    }, [formula, variable, parentNode?.data.variant, limitPoint]);

    const handleSolveWithAi = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsThinking(true);
        
        // [SIMULATION] Later we can connect to Gemini/OpenAI here.
        setTimeout(() => {
            setSteps([
                { label: 'AI 分析：這是一個複合函數，需應用連鎖律 (Chain Rule)', latex: `\\text{AI Analysis: Chain Rule Required}` },
                { label: '微分外部函數與內部函數的乘積...', latex: `\\frac{dy}{dx} = \\frac{dy}{du} \\cdot \\frac{du}{dx}` },
                { label: '最終建議（模擬 AI 回應）：', latex: `\\text{Result depends on complex expansion.}` }
            ]);
            setIsThinking(false);
        }, 1500);
    };

    const onPointerDown = (e: React.PointerEvent) => {
        if (isCtrlPressed) {
            e.stopPropagation();
            const startX = e.clientX;
            const startY = e.clientY;
            
            const onPointerMove = (moveE: PointerEvent) => {
                setDraggingEjectPos({ startX, startY, curX: moveE.clientX, curY: moveE.clientY });
            };
            
            const onPointerUp = (upE: PointerEvent) => {
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);
                setDraggingEjectPos(null); 
                
                if (Math.sqrt(Math.pow(upE.clientX - startX, 2) + Math.pow(upE.clientY - startY, 2)) > 5) {
                    const flowPos = screenToFlowPosition({ x: upE.clientX, y: upE.clientY });
                    handleEject(containerId, 'stepsArea', flowPos);
                }
            };
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp, { once: true });
        }
    };

    if (!parentNode) return null;

    return (
        <div 
            className="nodrag calculus-steps-area"
            onPointerDown={onPointerDown}
            style={{
                position: 'absolute',
                top: 'calc(100% + 12px)',
                left: '0',
                width: '100%',
                background: 'var(--bg-node-dim)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                padding: '12px',
                color: 'var(--text-main)',
                fontSize: '0.8rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                cursor: isCtrlPressed ? 'grab' : 'default',
                animation: 'steps-slide-in 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                zIndex: 10,
                minWidth: '240px'
            }}
            title="Calculus Steps Area | Ctrl+Drag to eject"
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-sub)', fontWeight: 800, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Icons.Calculus size={12} />
                    {t('nodes.calculus.steps')}
                </div>
                {isCtrlPressed && <span style={{ fontSize: '0.55rem', color: 'var(--accent-bright)' }}>{t('nodes.calculus.ejectable')}</span>}
            </div>

            <div className="custom-scrollbar" style={{ maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                {steps ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {steps.map((step, i) => (
                            <div key={i} className="step-item" style={{ animation: `step-in 0.3s forwards ${i * 0.05}s`, opacity: 0 }}>
                                <div style={{ color: 'var(--text-sub)', marginBottom: '4px', fontSize: '0.7rem' }}>• {step.label}</div>
                                <div 
                                    className="step-latex"
                                    dangerouslySetInnerHTML={{ __html: katex.renderToString(step.latex, { throwOnError: false }) }}
                                    style={{ paddingLeft: '8px', color: 'var(--accent-bright)' }}
                                />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ 
                        padding: '20px 0',
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        gap: '12px',
                        opacity: 0.6
                    }}>
                        <Icons.Calculus size={24} style={{ opacity: 0.3 }} />
                        <div style={{ fontSize: '0.75rem', textAlign: 'center' }}>{t('nodes.calculus.no_rule').split('|').join('<br/>')}</div>
                        <button 
                            onClick={handleSolveWithAi} 
                            disabled={isThinking}
                            style={{
                                background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                                color: '#000',
                                border: 'none',
                                padding: '6px 14px',
                                borderRadius: '16px',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                boxShadow: '0 4px 15px rgba(79, 172, 254, 0.4)',
                                transition: 'all 0.2s'
                            }}
                            className="premium-btn"
                        >
                            {isThinking ? t('nodes.calculus.thinking') : t('nodes.calculus.solve_ai')}
                        </button>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes steps-slide-in {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes step-in {
                    from { opacity: 0; transform: translateY(5px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .calculus-steps-area::before {
                    content: "";
                    position: absolute;
                    top: -12px;
                    left: 20px;
                    border-left: 8px solid transparent;
                    border-right: 8px solid transparent;
                    border-bottom: 8px solid rgba(255, 255, 255, 0.1);
                }
                .premium-btn:hover:not(:disabled) {
                    transform: translateY(-1px);
                    box-shadow: 0 6px 20px rgba(79, 172, 254, 0.6);
                    filter: brightness(1.1);
                }
                .premium-btn:active:not(:disabled) {
                    transform: translateY(0);
                }
            `}</style>
        </div>
    );
};
