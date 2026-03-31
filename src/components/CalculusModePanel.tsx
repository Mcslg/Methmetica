import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icons } from './Icons';
import { useLanguage } from '../contexts/LanguageContext';

interface CalculusModePanelProps {
    currentMode: 'diff' | 'integ' | 'limit';
    onSelect: (mode: 'diff' | 'integ' | 'limit') => void;
    onClose: () => void;
    position: { x: number; y: number }; // Screen absolute coordinates
}

export const CalculusModePanel: React.FC<CalculusModePanelProps> = ({ currentMode, onSelect, onClose, position }) => {
    const { t } = useLanguage();
    const [isVisible, setIsVisible] = useState(false);
    const [selection, setSelection] = useState<'diff' | 'integ' | 'limit' | null>(null);
    const selectionRef = useRef<'diff' | 'integ' | 'limit' | null>(null);

    useEffect(() => {
        requestAnimationFrame(() => setIsVisible(true));
        
        const handleMove = (e: PointerEvent) => {
            const dx = e.clientX - position.x;
            const dy = e.clientY - position.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 45) {
                setSelection(null);
                selectionRef.current = null;
                return;
            }

            // Calculate angle (0-360)
            let angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
            if (angle < 0) angle += 360;

            let current: 'diff' | 'integ' | 'limit' | null = null;
            if (angle >= 240 || angle < 0) current = 'diff';
            else if (angle >= 0 && angle < 120) current = 'integ';
            else if (angle >= 120 && angle < 240) current = 'limit';

            setSelection(current);
            selectionRef.current = current;
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

    const items = [
        { id: 'diff', icon: <Icons.Calculus size={24} />, label: t('nodes.calculus.diff'), color: '#ff4757', start: 242, end: 358 },
        { id: 'integ', icon: <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>∫</div>, label: t('nodes.calculus.integ'), color: '#1e90ff', start: 2, end: 118 },
        { id: 'limit', icon: <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>lim</div>, label: t('nodes.calculus.limit'), color: '#00f2fe', start: 122, end: 238 },
    ] as const;

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
                position: 'fixed',
                inset: 0,
                zIndex: 999999,
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.2)',
                backdropFilter: isVisible ? 'blur(4px)' : 'none',
                opacity: isVisible ? 1 : 0,
                transition: 'all 0.3s ease'
            }} 
            onContextMenu={(e) => e.preventDefault()}
        >
            <div 
                className="pie-menu-container" 
                style={{ 
                    position: 'absolute',
                    left: position.x - 160, 
                    top: position.y - 160,
                    transform: `scale(${isVisible ? 1 : 0.8})`,
                    transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    pointerEvents: 'none'
                }}
            >
                <svg className="pie-svg" viewBox="0 0 320 320" style={{ pointerEvents: 'none' }}>
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
                        const tx = center + Math.cos(rad) * 95;
                        const ty = center + Math.sin(rad) * 95;

                        return (
                            <g key={item.id}>
                                <path 
                                    className={`pie-segment ${isActive ? 'active' : ''}`} 
                                    d={d} 
                                    style={{ 
                                        '--item-color': item.color,
                                        opacity: selection ? (selection === item.id ? 1 : 1) : 1 // Logic same, but style classes handle it
                                    } as any} 
                                />
                                <g className="pie-label-group" transform={`translate(${tx}, ${ty})`}>
                                    <g transform="translate(-12, -35)" style={{ color: item.color }}>{item.icon}</g>
                                    <text 
                                        className="pie-item-label" 
                                        y="5" 
                                        style={{ 
                                            fill: 'var(--text-main)', 
                                            opacity: isActive ? 1 : 0.6, 
                                            fontSize: '11px', 
                                            fontWeight: (selection === item.id) ? 'bold' : 'normal'
                                        }}
                                    >
                                        {item.label}
                                    </text>
                                </g>
                            </g>
                        );
                    })}
                </svg>
                <div 
                    className="pie-menu-center-v2" 
                >
                    {selection ? (selection === 'diff' ? 'd' : selection === 'integ' ? '∫' : 'L') : (currentMode === 'diff' ? 'd' : currentMode === 'integ' ? '∫' : 'L')}
                </div>
            </div>
        </div>,
        document.body
    );
};
