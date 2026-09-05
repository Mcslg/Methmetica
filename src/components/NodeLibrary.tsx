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
                    {t('sidebar.show_more') || '顯示更多...'}
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
                        <span>{t('sidebar.collapse') || '收合'}</span>
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
                        background: 'var(--ai-bg, rgba(74, 222, 128, 0.08))',
                        border: '1px solid var(--ai-border, rgba(74, 222, 128, 0.3))',
                        borderRadius: '6px',
                        color: 'var(--ai-text, #4ade80)',
                        padding: '7px 8px',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--ai-border-hover, rgba(74, 222, 128, 0.6))';
                        e.currentTarget.style.background = 'var(--ai-bg, rgba(74, 222, 128, 0.15))';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--ai-border, rgba(74, 222, 128, 0.3))';
                        e.currentTarget.style.background = 'var(--ai-bg, rgba(74, 222, 128, 0.08))';
                    }}
                    title="開啟自然語言 AI 工作流生成器"
                >
                    <span>✨</span>
                    <span>AI 生成工作流</span>
                </button>

                <button
                    onClick={() => {
                        window.dispatchEvent(new CustomEvent('load-ai-workflow-demo'));
                    }}
                    style={{
                        width: '100%',
                        background: 'var(--bg-input, rgba(0, 0, 0, 0.2))',
                        border: '1px solid var(--border-node, rgba(255, 255, 255, 0.1))',
                        borderRadius: '6px',
                        color: 'var(--text-sub, #94a3b8)',
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
                        e.currentTarget.style.color = 'var(--text-main, #e2e8f0)';
                        e.currentTarget.style.borderColor = 'var(--border-input, rgba(255, 255, 255, 0.25))';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--text-sub, #94a3b8)';
                        e.currentTarget.style.borderColor = 'var(--border-node, rgba(255, 255, 255, 0.1))';
                    }}
                    title="載入靜態架構範例供快速驗證"
                >
                    <span>⚡ 載入架構演示</span>
                </button>
            </div>
        </div>
    );
};
