import React, { useState } from 'react';
import useStore from '../store/useStore';
import { buildNodeCatalog } from '../nodes/registry';
import { useLanguage } from '../contexts/LanguageContext';
import { getUpdateLabel, isRepairUpdate } from '../community/updateLabels';

interface NodeLibraryProps {
    onDragStart: (event: React.DragEvent, nodeType: string, templateId?: string) => void;
    layout?: 'sidebar' | 'float';
    showInterfaces?: boolean;
}

export const NodeLibrary: React.FC<NodeLibraryProps> = ({ onDragStart, layout = 'sidebar', showInterfaces = false }) => {
    const { t } = useLanguage();
    const communityTemplates = useStore(state => state.communityTemplates);
    const [isLibraryExpanded, setLibraryExpanded] = useState(false);
    const catalog = buildNodeCatalog(communityTemplates);
    const basicNodeTypes = ['textNode', 'driveImageNode', 'calculateNode', 'graphNode', 'sliderNode'];
    const visibleCatalog = catalog.filter(n => !n.hidden);
    const basicNodes = visibleCatalog.filter(n => basicNodeTypes.includes(n.type));
    const interfaceNodeTypes = ['inputNode', 'outputNode'];
    const interfaceNodes = visibleCatalog.filter(n => interfaceNodeTypes.includes(n.type));
    const otherNodes = visibleCatalog.filter(n => !basicNodeTypes.includes(n.type) && !interfaceNodeTypes.includes(n.type));

    return (
        <div className={`node-library-container ${layout}`}>
            <div className="node-library-grid">
                {basicNodes.map(node => (
                    <div
                        key={node.type}
                        className="library-item"
                        draggable
                        onDragStart={(e) => onDragStart(e, node.type)}
                        onClick={() => {
                            const event = new CustomEvent('add-node-at-center', { detail: { type: node.type } });
                            window.dispatchEvent(event);
                        }}
                        title={node.desc}
                    >
                        {node.icon}
                        <span>{node.label}</span>
                        {node.reviewStatus === 'unreviewed' && node.reviewWarning && (
                            <span className="library-review-badge">未驗證</span>
                        )}
                        {node.updateAvailable && isRepairUpdate(node.updateSeverity) && (
                            <span className={`library-review-badge update ${node.updateSeverity ?? 'feature'}`}>
                                {getUpdateLabel(node.updateSeverity)}
                            </span>
                        )}
                    </div>
                ))}
            </div>

            {showInterfaces && interfaceNodes.length > 0 && (
                <>
                    <div style={{ margin: '10px 0 6px', fontSize: '10px', fontWeight: 600, color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        工作流端點 (Interfaces)
                    </div>
                    <div className="node-library-grid">
                        {interfaceNodes.map(node => (
                            <div
                                key={node.type}
                                className="library-item"
                                draggable
                                onDragStart={(e) => onDragStart(e, node.type)}
                                onClick={() => {
                                    const event = new CustomEvent('add-node-at-center', { detail: { type: node.type } });
                                    window.dispatchEvent(event);
                                }}
                                title={node.desc}
                            >
                                {node.icon}
                                <span>{node.label}</span>
                            </div>
                        ))}
                    </div>
                </>
            )}
            
            {!isLibraryExpanded ? (
                <button 
                    className={`sidebar-btn more-btn ${layout === 'float' ? 'float-more' : ''}`} 
                    onClick={() => setLibraryExpanded(true)}
                >
                    {t('sidebar.show_more') || 'Show More...'}
                </button>
            ) : (
                <div className="node-library-grid more-nodes">
                    {otherNodes.map(node => (
                        <div
                            key={node.type}
                            className="library-item"
                            draggable
                            onDragStart={(e) => onDragStart(e, node.type)}
                            onClick={() => {
                                const event = new CustomEvent('add-node-at-center', { detail: { type: node.type } });
                                window.dispatchEvent(event);
                            }}
                            title={node.desc}
                        >
                            {node.icon}
                            <span>{node.label}</span>
                            {node.reviewStatus === 'unreviewed' && node.reviewWarning && (
                                <span className="library-review-badge">未驗證</span>
                            )}
                            {node.updateAvailable && isRepairUpdate(node.updateSeverity) && (
                                <span className={`library-review-badge update ${node.updateSeverity ?? 'feature'}`}>
                                    {getUpdateLabel(node.updateSeverity)}
                                </span>
                            )}
                        </div>
                    ))}
                    <button 
                        className="library-item collapse-btn" 
                        onClick={() => setLibraryExpanded(false)}
                    >
                        <span style={{ fontSize: '1rem' }}>↑</span>
                        <span>{t('sidebar.collapse') || 'Collapse'}</span>
                    </button>
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
                <button
                    onClick={() => {
                        window.dispatchEvent(new CustomEvent('open-ai-workflow-modal'));
                    }}
                    style={{
                        width: '100%',
                        background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.25) 0%, rgba(139, 92, 246, 0.25) 100%)',
                        border: '1px solid rgba(56, 189, 248, 0.5)',
                        borderRadius: '6px',
                        color: '#38bdf8',
                        padding: '7px 8px',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        transition: 'all 0.2s',
                        boxShadow: '0 2px 8px rgba(56, 189, 248, 0.15)',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(56, 189, 248, 0.4) 0%, rgba(139, 92, 246, 0.4) 100%)';
                        e.currentTarget.style.color = '#ffffff';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(56, 189, 248, 0.25) 0%, rgba(139, 92, 246, 0.25) 100%)';
                        e.currentTarget.style.color = '#38bdf8';
                    }}
                    title="開啟自然語言 AI 工作流生成器"
                >
                    <span>✨</span>
                    <span>AI 生成工作流 (Prompt)</span>
                </button>

                <button
                    onClick={() => {
                        window.dispatchEvent(new CustomEvent('load-ai-workflow-demo'));
                    }}
                    style={{
                        width: '100%',
                        background: 'rgba(30, 41, 59, 0.6)',
                        border: '1px solid rgba(148, 163, 184, 0.2)',
                        borderRadius: '6px',
                        color: '#94a3b8',
                        padding: '4px 8px',
                        fontSize: '10px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#e2e8f0';
                        e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#94a3b8';
                        e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.2)';
                    }}
                    title="載入靜態架構範例供快速驗證"
                >
                    <span>⚡ 載入架構演示 (Demo)</span>
                </button>
            </div>
        </div>
    );
};
