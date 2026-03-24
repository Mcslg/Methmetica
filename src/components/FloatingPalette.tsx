import React, { useRef, useState, useEffect } from 'react';
import useStore from '../store/useStore';
import { NodeLibrary } from './NodeLibrary';
import { Icons } from './Icons';

export const FloatingPalette: React.FC = () => {
    const { isPaletteFloating, setPaletteFloating, palettePosition, setPalettePosition } = useStore();
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const paletteRef = useRef<HTMLDivElement>(null);

    const onHeaderMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setDragOffset({
            x: e.clientX - palettePosition.x,
            y: e.clientY - palettePosition.y
        });
        e.preventDefault();
        e.stopPropagation();
    };

    const onMouseMove = (e: MouseEvent) => {
        if (!isDragging) return;
        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;
        
        // Clamping within window dimensions
        const maxX = window.innerWidth - (paletteRef.current?.offsetWidth || 200);
        const maxY = window.innerHeight - (paletteRef.current?.offsetHeight || 100);
        
        setPalettePosition({ 
            x: Math.max(0, Math.min(newX, maxX)), 
            y: Math.max(0, Math.min(newY, maxY)) 
        });
    };

    const onMouseUp = () => setIsDragging(false);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        } else {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [isDragging]);

    const onDragStart = (event: React.DragEvent, nodeType: string) => {
        event.dataTransfer.setData('application/reactflow', nodeType);
        event.dataTransfer.effectAllowed = 'move';
    };

    // FIX: Render after all hooks
    if (!isPaletteFloating) return null;

    return (
        <div 
            ref={paletteRef}
            className="floating-palette-container"
            style={{ 
                left: palettePosition.x, 
                top: palettePosition.y,
                cursor: isDragging ? 'grabbing' : 'default'
            }}
        >
            <div className="palette-header" onMouseDown={onHeaderMouseDown}>
                <div className="palette-title">
                    <Icons.Grid style={{ width: 14, height: 14, opacity: 0.6 }} />
                    <span>Toolkit</span>
                </div>
                <button className="dock-btn" onClick={() => setPaletteFloating(false)}>
                    <Icons.ExternalLink style={{ width: 14, height: 14, transform: 'rotate(180deg)' }} />
                </button>
            </div>
            
            <div className="palette-content">
                <NodeLibrary onDragStart={onDragStart} layout="float" />
            </div>

        </div>
    );
};
