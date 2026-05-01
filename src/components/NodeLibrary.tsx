import React, { useState } from 'react';
import useStore from '../store/useStore';
import { buildNodeCatalog } from '../nodes/registry';
import { useLanguage } from '../contexts/LanguageContext';

interface NodeLibraryProps {
    onDragStart: (event: React.DragEvent, nodeType: string, templateId?: string) => void;
    layout?: 'sidebar' | 'float';
}

export const NodeLibrary: React.FC<NodeLibraryProps> = ({ onDragStart, layout = 'sidebar' }) => {
    const { t } = useLanguage();
    const communityTemplates = useStore(state => state.communityTemplates);
    const [isLibraryExpanded, setLibraryExpanded] = useState(false);
    const catalog = buildNodeCatalog(communityTemplates);
    const basicNodeTypes = ['textNode', 'driveImageNode', 'calculateNode', 'graphNode', 'sliderNode'];
    const visibleCatalog = catalog.filter(n => !n.hidden);
    const basicNodes = visibleCatalog.filter(n => basicNodeTypes.includes(n.type));
    const otherNodes = visibleCatalog.filter(n => !basicNodeTypes.includes(n.type));

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
                    </div>
                ))}
            </div>
            
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

        </div>
    );
};
