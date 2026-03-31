import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icons } from './Icons';

interface SoundModePanelProps {
    currentMode: string;
    onSelect: (mode: string) => void;
    onClose: () => void;
    position: { x: number; y: number }; 
}

export const SoundModePanel: React.FC<SoundModePanelProps> = ({ currentMode, onSelect, onClose, position }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [selection, setSelection] = useState<string | null>(null);
    const selectionRef = useRef<string | null>(null);

    const items = [
        { id: 'sine', label: 'Sine', color: '#4facfe', start: 290, end: 358 },
        { id: 'square', label: 'Square', color: '#ffcc00', start: 2, end: 70 },
        { id: 'sawtooth', label: 'Saw', color: '#ff4757', start: 74, end: 142 },
        { id: 'triangle', label: 'Tri', color: '#4ade80', start: 146, end: 214 },
        { id: 'custom', label: 'Formula', color: '#a18cd1', start: 218, end: 286 },
    ];

    useEffect(() => {
        requestAnimationFrame(() => setIsVisible(true));
        
        const handleMove = (e: PointerEvent) => {
            const dx = e.clientX - position.x;
            const dy = e.clientY - position.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 40) {
                setSelection(null);
                selectionRef.current = null;
                return;
            }

            let angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
            if (angle < 0) angle += 360;

            const selected = items.find(item => {
                if (item.start > item.end) { // Wraps around 0
                    return angle >= item.start || angle < item.end;
                }
                return angle >= item.start && angle < item.end;
            });

            const nextId = selected ? selected.id : null;
            setSelection(nextId);
            selectionRef.current = nextId;
        };

        const handleUp = (e: PointerEvent) => {
            e.stopPropagation();
            if (selectionRef.current) {
                onSelect(selectionRef.current);
            }
            onClose();
        };

        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', handleUp, { once: true });
        return () => {
            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', handleUp);
        };
    }, [position, onSelect, onClose]);

    const center = 160;
    const outer = 140;
    const inner = 55;

    const polarToCartesian = (r: number, angle: number) => {
        const rad = (angle - 90) * (Math.PI / 180);
        return { x: center + r * Math.cos(rad), y: center + r * Math.sin(rad) };
    };

    return createPortal(
        <div 
            className="pie-menu-overlay"
            style={{
                position: 'fixed', inset: 0, zIndex: 999999, pointerEvents: 'auto',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.2)', backdropFilter: isVisible ? 'blur(4px)' : 'none',
                opacity: isVisible ? 1 : 0, transition: 'all 0.3s ease'
            }} 
            onContextMenu={(e) => e.preventDefault()}
        >
            <div 
                className="pie-menu-container" 
                style={{ 
                    position: 'absolute', left: position.x - 160, top: position.y - 160,
                    transform: `scale(${isVisible ? 1 : 0.8})`, transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    pointerEvents: 'none'
                }}
            >
                <svg className="pie-svg" viewBox="0 0 320 320">
                    {items.map((item) => {
                        const isActive = (selection || currentMode) === item.id;
                        const sOut = polarToCartesian(outer, item.end);
                        const eOut = polarToCartesian(outer, item.start);
                        const sIn = polarToCartesian(inner, item.end);
                        const eIn = polarToCartesian(inner, item.start);
                        
                        const d = [
                            "M", sOut.x, sOut.y,
                            "A", outer, outer, 0, 0, 0, eOut.x, eOut.y,
                            "L", eIn.x, eIn.y,
                            "A", inner, inner, 0, 0, 1, sIn.x, sIn.y,
                            "Z"
                        ].join(" ");
                        
                        const midAngle = (item.start + item.end) / 2;
                        const rad = (midAngle - 90) * (Math.PI / 180);
                        const tx = center + Math.cos(rad) * 90;
                        const ty = center + Math.sin(rad) * 90;

                        return (
                            <g key={item.id}>
                                <path 
                                    className={`pie-segment ${isActive ? 'active' : ''}`} 
                                    d={d} 
                                    style={{ '--item-color': item.color } as any} 
                                />
                                <g className="pie-label-group" transform={`translate(${tx}, ${ty})`}>
                                    {/* Small icon or text based on type */}
                                    <text 
                                        className="pie-item-label" 
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        style={{ 
                                            fill: 'var(--text-main)', 
                                            opacity: isActive ? 1 : 0.6, 
                                            fontSize: '10px', 
                                            fontWeight: (selection === item.id) ? 'bold' : 'normal',
                                            textShadow: '0 2px 4px rgba(0,0,0,0.5)'
                                        }}
                                    >
                                        {item.label}
                                    </text>
                                </g>
                            </g>
                        );
                    })}
                </svg>
                <div className="pie-menu-center-v2" style={{ color: 'var(--accent-bright)', fontSize: '1.2rem' }}>
                    <Icons.Sound style={{ margin: 0 }} />
                </div>
            </div>
        </div>,
        document.body
    );
};
