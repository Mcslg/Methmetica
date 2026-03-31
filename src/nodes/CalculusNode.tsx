import React, { useEffect, memo } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import useStore, { type AppState, type NodeData } from '../store/useStore';
import { useLanguage } from '../contexts/LanguageContext';
import { Icons } from '../components/Icons';
import { NodeFrame } from '../components/NodeFrame';
import { CalculusModePanel } from '../components/CalculusModePanel';

export const CalculusNode = memo(function CalculusNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    const { t } = useLanguage();
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    const executeNode = useStore((state: AppState) => state.executeNode);
    const variant = data.variant || 'diff';
    const variable = data.variable || 'x';
    const limitPoint = data.limitPoint ?? '';

    const [showPanel, setShowPanel] = React.useState(false);
    const [panelPosition, setPanelPosition] = React.useState({ x: 0, y: 0 });

    useEffect(() => {
        if (data.input !== undefined) {
            executeNode(id);
        }
    }, [data.input, id, executeNode, variable, variant, limitPoint]);

    return (
        <NodeFrame 
            id={id} 
            data={data} 
            selected={selected} 
            icon={<Icons.Calculus />} 
            defaultLabel={variant === 'diff' ? t('nodes.calculus.diff') : variant === 'integ' ? t('nodes.calculus.integ') : t('nodes.calculus.limit')}
            className={`calculus-node ${variant}-node`}
            contentStyle={{ padding: 0 }}
        >
            {showPanel && (
                <CalculusModePanel 
                    currentMode={variant as any} 
                    onSelect={(m) => updateNodeData(id, { variant: m })}
                    onClose={() => setShowPanel(false)}
                    position={panelPosition}
                />
            )}

            <div className="calc-controls" style={{
                display: 'flex',
                gap: '8px',
                padding: '8px 12px',
                background: 'rgba(255,255,255,0.03)',
                borderBottom: '1px solid var(--border-node)',
                fontSize: '0.65rem',
                alignItems: 'center',
                flexShrink: 0,
                justifyContent: 'center',
                minHeight: '36px'
            }}>
                <button 
                    onPointerDown={(e) => {
                        e.stopPropagation();
                        setPanelPosition({ x: e.clientX, y: e.clientY });
                        setShowPanel(true);
                    }}
                    className="variant-toggle nodrag"
                    style={{ 
                        padding: '2px 10px',
                        background: variant === 'diff' ? 'rgba(255, 71, 87, 0.1)' : variant === 'integ' ? 'rgba(30, 144, 255, 0.1)' : 'rgba(79, 172, 254, 0.1)',
                        border: `1px solid ${variant === 'diff' ? 'rgba(255, 71, 87, 0.3)' : variant === 'integ' ? 'rgba(30, 144, 255, 0.3)' : 'rgba(79, 172, 254, 0.4)'}`,
                        color: variant === 'diff' ? '#ff4757' : variant === 'integ' ? '#1e90ff' : 'var(--accent-bright)',
                        borderRadius: '12px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    {variant === 'diff' ? 'd/dx' : variant === 'integ' ? '∫ dx' : 'lim'}
                    <span style={{ fontSize: '0.5rem', opacity: 0.5 }}>▼</span>
                </button>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ color: 'var(--text-sub)', fontSize: '0.6rem', fontWeight: 600 }}>{t('nodes.calculus.variable')}</span>
                    <input
                        className="nodrag"
                        type="text"
                        value={variable}
                        onChange={(e) => updateNodeData(id, { variable: e.target.value.trim() || 'x' })}
                        style={{
                            width: '24px',
                            background: 'rgba(0,0,0,0.2)',
                            border: '1px solid var(--border-input)',
                            color: 'var(--text-main)',
                            borderRadius: '4px',
                            textAlign: 'center',
                            fontSize: '0.75rem',
                            padding: '1px 0',
                            fontFamily: 'monospace',
                            outline: 'none',
                            fontWeight: 'bold'
                        }}
                    />
                </div>

                {variant === 'limit' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '8px' }}>
                        <span style={{ color: 'var(--text-sub)', fontSize: '0.6rem', fontWeight: 600 }}>→</span>
                        <input
                            className="nodrag"
                            type="text"
                            value={limitPoint}
                            onChange={(e) => updateNodeData(id, { limitPoint: e.target.value })}
                            placeholder="∞"
                            style={{
                                width: '32px',
                                background: 'rgba(0,0,0,0.2)',
                                border: '1px solid var(--border-input)',
                                color: 'var(--accent-bright)',
                                borderRadius: '4px',
                                textAlign: 'center',
                                fontSize: '0.75rem',
                                padding: '1px 0',
                                fontFamily: 'monospace',
                                outline: 'none',
                                fontWeight: 'bold'
                            }}
                            title={t('nodes.calculus.approach') + ' (empty/inf for ∞)'}
                        />
                    </div>
                )}
            </div>

            <style>{`
                .calculus-node {
                    min-width: 200px;
                }
                .diff-node {
                    border-top: 2px solid #ff4757 !important;
                }
                .integ-node {
                    border-top: 2px solid #1e90ff !important;
                }
                .limit-node {
                    border-top: 2px solid var(--accent-bright) !important;
                }
                .variant-toggle:hover {
                    filter: brightness(1.2);
                    transform: scale(1.02);
                }
                .variant-toggle:active {
                    transform: scale(0.95);
                }
            `}</style>
        </NodeFrame>
    );
});
