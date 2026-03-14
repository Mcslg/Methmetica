import React, { useState, useCallback, useRef } from 'react';
import { Handle, Position } from '@xyflow/react';
import useStore, { type CustomHandle, type HandleType, type AppState } from '../store/useStore';

interface DynamicHandlesProps {
    nodeId: string;
    handles?: CustomHandle[];
}

export const DynamicHandles: React.FC<DynamicHandlesProps> = ({ nodeId, handles = [] }) => {
    const addHandle = useStore((state: AppState) => state.addHandle);
    const removeHandle = useStore((state: AppState) => state.removeHandle);
    const containerRef = useRef<HTMLDivElement>(null);

    const [menu, setMenu] = useState<{ pX: number, pY: number, side: 'top' | 'bottom' | 'left' | 'right', percent: number } | null>(null);

    const onEdgeContextMenu = useCallback((e: React.MouseEvent, side: 'top' | 'bottom' | 'left' | 'right') => {
        e.preventDefault();
        e.stopPropagation(); // Prevents ReactFlow's global onNodeContextMenu from firing
        if (!containerRef.current) return;

        // Calculate position via bounding rect, handling scale via percentages
        const rect = containerRef.current.getBoundingClientRect();
        const scaledX = e.clientX - rect.left;
        const scaledY = e.clientY - rect.top;
        const pX = (scaledX / rect.width) * 100;
        const pY = (scaledY / rect.height) * 100;

        let percent = (side === 'top' || side === 'bottom') ? pX : pY;

        // Use absolute percentage positions perfectly snapped to the specific edge
        let finalPx = pX;
        let finalPy = pY;

        if (side === 'top') finalPy = 0;
        if (side === 'bottom') finalPy = 100;
        if (side === 'left') finalPx = 0;
        if (side === 'right') finalPx = 100;

        setMenu({
            pX: finalPx,
            pY: finalPy,
            side,
            percent: Math.max(0, Math.min(100, percent))
        });
    }, []);

    const handleAdd = (type: HandleType) => {
        if (!menu) return;
        addHandle(nodeId, {
            id: `h-${Date.now()}`,
            type,
            position: menu.side,
            offset: menu.percent,
        });
        setMenu(null);
    };

    const onHandleClick = (e: React.MouseEvent, handleId: string) => {
        e.stopPropagation();
        removeHandle(nodeId, handleId);
    };

    const getPositionLiteral = (pos: string): Position => {
        switch (pos) {
            case 'top': return Position.Top;
            case 'bottom': return Position.Bottom;
            case 'left': return Position.Left;
            default: return Position.Right;
        }
    };

    // Logic to determine arrow icon and rotation based on flow direction
    const getIconContent = (type: HandleType) => {
        if (type === 'modify') return '×';
        if (type === 'trigger-in' || type === 'trigger-out' || type === 'trigger-err') return '▶';
        return '›'; // clean chevron for data input/output
    };

    const getRotation = (type: HandleType, side: string) => {
        if (type === 'modify') return 0;

        const isInput = (type === 'input' || type === 'trigger-in');

        if (isInput) {
            // Input points INTO the node
            if (side === 'left') return 0;
            if (side === 'top') return 90;
            if (side === 'right') return 180;
            if (side === 'bottom') return -90;
        } else {
            // Output points AWAY FROM the node
            if (side === 'left') return 180;
            if (side === 'top') return -90;
            if (side === 'right') return 0;
            if (side === 'bottom') return 90;
        }
        return 0;
    };

    const getShapeClass = (type: HandleType) => {
        if (['modify', 'input', 'output'].includes(type)) return 'handle-square';
        return 'handle-triangle-down'; // general shape class, overrides removed
    };

    const radialItems: { type: HandleType, label: string }[] = [
        { type: 'input', label: 'In' },
        { type: 'output', label: 'Out' },
        { type: 'modify', label: 'Mod' },
        { type: 'trigger-in', label: 'T.In' },
        { type: 'trigger-out', label: 'S.Out' },
        { type: 'trigger-err', label: 'E.Out' },
    ];

    return (
        <div
            ref={containerRef}
            className="dynamic-handles-overlay"
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}
        >
            {/* Edge Hitboxes for adding handles */}
            <div
                className="edge-hitbox edge-top"
                onContextMenu={(e) => onEdgeContextMenu(e, 'top')}
            />
            <div
                className="edge-hitbox edge-bottom"
                onContextMenu={(e) => onEdgeContextMenu(e, 'bottom')}
            />
            <div
                className="edge-hitbox edge-left"
                onContextMenu={(e) => onEdgeContextMenu(e, 'left')}
            />
            <div
                className="edge-hitbox edge-right"
                onContextMenu={(e) => onEdgeContextMenu(e, 'right')}
            />

            {handles.map((h) => (
                <Handle
                    key={h.id}
                    id={h.id}
                    type={h.type === 'input' || h.type === 'trigger-in' || h.type === 'modify' ? 'target' : 'source'}
                    position={getPositionLiteral(h.position)}
                    className={`${getShapeClass(h.type)} handle-${h.type}`}
                    style={{
                        [h.position === 'top' || h.position === 'bottom' ? 'left' : 'top']: `${h.offset}%`,
                    }}
                    onClick={(e) => onHandleClick(e, h.id)}
                >
                    <div style={{ transform: `rotate(${getRotation(h.type, h.position)}deg)`, display: 'flex' }}>
                        {getIconContent(h.type)}
                    </div>
                </Handle>
            ))}

            {menu && (
                <div
                    className="radial-menu-container"
                    style={{ left: `${menu.pX}%`, top: `${menu.pY}%` }}
                    onMouseLeave={() => setMenu(null)}
                >
                    <div className="radial-center" onClick={() => setMenu(null)}>✕</div>

                    {radialItems.map((item, i) => {
                        const angle = (i * 60 - 90) * (Math.PI / 180);
                        const radius = 45;
                        const itemX = Math.cos(angle) * radius;
                        const itemY = Math.sin(angle) * radius;

                        return (
                            <div
                                key={item.type}
                                className="radial-item"
                                style={{ transform: `translate(calc(-50% + ${itemX}px), calc(-50% + ${itemY}px))` }}
                                onClick={() => handleAdd(item.type)}
                                title={item.label}
                            >
                                <div style={{
                                    transform: `rotate(${getRotation(item.type, menu.side)}deg)`,
                                    color: `var(--handle-color)`
                                }}
                                    className={`handle-${item.type}`}
                                >
                                    {getIconContent(item.type)}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
