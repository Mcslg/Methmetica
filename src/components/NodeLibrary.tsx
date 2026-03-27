import React, { useState } from 'react';
import { nodeLibrary } from '../nodes/registry';

interface NodeLibraryProps {
    onDragStart: (event: React.DragEvent, nodeType: string) => void;
    layout?: 'sidebar' | 'float';
}

export const NodeLibrary: React.FC<NodeLibraryProps> = ({ onDragStart, layout = 'sidebar' }) => {
    const [isLibraryExpanded, setLibraryExpanded] = useState(false);
    const basicNodeTypes = ['textNode', 'calculateNode', 'graphNode', 'sliderNode'];
    const basicNodes = nodeLibrary.filter(n => basicNodeTypes.includes(n.type));
    const otherNodes = nodeLibrary.filter(n => !basicNodeTypes.includes(n.type));

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
                    </div>
                ))}
            </div>
            
            {!isLibraryExpanded ? (
                <button 
                    className={`sidebar-btn more-btn ${layout === 'float' ? 'float-more' : ''}`} 
                    onClick={() => setLibraryExpanded(true)}
                >
                    Show More...
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
                        </div>
                    ))}
                    <button 
                        className="library-item collapse-btn" 
                        onClick={() => setLibraryExpanded(false)}
                    >
                        <span style={{ fontSize: '1rem' }}>↑</span>
                        <span>Collapse</span>
                    </button>
                </div>
            )}

        </div>
    );
};
