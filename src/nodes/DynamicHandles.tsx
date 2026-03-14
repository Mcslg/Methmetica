import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react';
import useStore, { type AppState, type CustomHandle, type HandleType } from '../store/useStore';

interface DynamicHandlesProps {
    nodeId: string;
    handles?: CustomHandle[];
    locked?: boolean;
}

export const DynamicHandles: React.FC<DynamicHandlesProps> = ({ nodeId, handles = [], locked = false }) => {
    const addHandle = useStore((state: AppState) => state.addHandle);
    const removeHandle = useStore((state: AppState) => state.removeHandle);
    const updateHandle = useStore((state: AppState) => state.updateHandle);
    const containerRef = useRef<HTMLDivElement>(null);
    const updateNodeInternals = useUpdateNodeInternals();

    // Trigger internal update whenever handles array changes meaningfully
    useEffect(() => {
        updateNodeInternals(nodeId);
    }, [nodeId, handles, updateNodeInternals]);
    const [menu, setMenu] = useState<{ pX: number, pY: number, side: 'top' | 'bottom' | 'left' | 'right', percent: number } | null>(null);
    const [movingHandle, setMovingHandle] = useState<{ id: string, side: string, offset: number } | null>(null);

    const onEdgeContextMenu = useCallback((e: React.MouseEvent, side: 'top' | 'bottom' | 'left' | 'right') => {
        e.preventDefault();
        e.stopPropagation();
        if (locked && (side === 'left' || side === 'right')) return; // Locked nodes handles are auto-managed

        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const pX = ((e.clientX - rect.left) / rect.width) * 100;
        const pY = ((e.clientY - rect.top) / rect.height) * 100;
        const percent = Math.max(0, Math.min(100, (side === 'top' || side === 'bottom') ? pX : pY));

        // Direct-Add UX for Left/Right
        if (side === 'left') {
            addHandle(nodeId, { id: `h-${Date.now()}`, type: 'input', position: 'left', offset: percent });
            return;
        }
        if (side === 'right') {
            addHandle(nodeId, { id: `h-${Date.now()}`, type: 'output', position: 'right', offset: percent });
            return;
        }

        // Panel Menu for Top/Bottom
        setMenu({ pX, pY, side, percent });
    }, [nodeId, locked, addHandle]);

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

    const onHandleContextMenu = (e: React.MouseEvent, handleId: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (locked) return; // Cannot delete locked handles
        removeHandle(nodeId, handleId);
    };

    const onHandleMouseDown = (e: React.MouseEvent, handle: CustomHandle) => {
        if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            e.stopPropagation();
            setMovingHandle({ id: handle.id, side: handle.position, offset: handle.offset });
        }
    };

    useEffect(() => {
        if (!movingHandle || !containerRef.current) return;

        const onMouseMove = (e: MouseEvent) => {
            const rect = containerRef.current!.getBoundingClientRect();
            const pX = ((e.clientX - rect.left) / rect.width) * 100;
            const pY = ((e.clientY - rect.top) / rect.height) * 100;

            // Determine which edge is closest to the mouse to allow crossing edges
            const dists = [
                { side: 'top', d: Math.abs(pY - 0), p: pX },
                { side: 'bottom', d: Math.abs(pY - 100), p: pX },
                { side: 'left', d: Math.abs(pX - 0), p: pY },
                { side: 'right', d: Math.abs(pX - 100), p: pY },
            ];
            const closest = dists.reduce((prev, curr) => prev.d < curr.d ? prev : curr);
            const clampedP = Math.max(0, Math.min(100, closest.p));

            setMovingHandle(prev => prev ? { ...prev, side: closest.side, offset: clampedP } : null);
            updateHandle(nodeId, movingHandle.id, { position: closest.side as any, offset: clampedP });
            updateNodeInternals(nodeId);
        };

        const onMouseUp = () => setMovingHandle(null);

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [movingHandle, nodeId, updateHandle]);

    const getPositionLiteral = (pos: string): Position => {
        switch (pos) {
            case 'top': return Position.Top;
            case 'bottom': return Position.Bottom;
            case 'left': return Position.Left;
            default: return Position.Right;
        }
    };

    const getIconContent = (type: HandleType) => {
        if (type === 'modify') return '×';
        if (type === 'trigger-in' || type === 'trigger-out' || type === 'trigger-err') return '▶';
        return '›';
    };

    const getRotation = (type: HandleType, side: string) => {
        if (type === 'modify') return 0;
        const isInput = (type === 'input' || type === 'trigger-in');
        if (isInput) {
            if (side === 'left') return 0;
            if (side === 'top') return 90;
            if (side === 'right') return 180;
            if (side === 'bottom') return -90;
        } else {
            if (side === 'left') return 180;
            if (side === 'top') return -90;
            if (side === 'right') return 0;
            if (side === 'bottom') return 90;
        }
        return 0;
    };

    const getShapeClass = (type: HandleType) => {
        if (['modify', 'input', 'output'].includes(type)) return 'handle-square';
        return 'handle-triangle-down';
    };

    const panelItems: { type: HandleType, label: string, desc: string }[] = [
        { type: 'trigger-in', label: 'Trigger In', desc: '觸發輸入' },
        { type: 'trigger-out', label: 'Success Out', desc: '成功觸發' },
        { type: 'trigger-err', label: 'Error Out', desc: '錯誤觸發' },
        { type: 'modify', label: 'Modify Param', desc: '參數調整' },
    ];

    return (
        <div
            ref={containerRef}
            className="dynamic-handles-overlay"
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}
        >
            <div className="edge-hitbox edge-top" onContextMenu={(e) => onEdgeContextMenu(e, 'top')} />
            <div className="edge-hitbox edge-bottom" onContextMenu={(e) => onEdgeContextMenu(e, 'bottom')} />
            <div className="edge-hitbox edge-left" onContextMenu={(e) => onEdgeContextMenu(e, 'left')} />
            <div className="edge-hitbox edge-right" onContextMenu={(e) => onEdgeContextMenu(e, 'right')} />

            {movingHandle && (
                <div className={`moving-guide ${movingHandle.side === 'top' || movingHandle.side === 'bottom' ? 'guide-vertical' : 'guide-horizontal'}`}
                    style={{
                        [movingHandle.side === 'top' || movingHandle.side === 'bottom' ? 'left' : 'top']: `${movingHandle.offset}%`,
                    }}
                />
            )}

            {handles.map((h) => (
                <Handle
                    key={h.id}
                    id={h.id}
                    type={h.type === 'input' || h.type === 'trigger-in' || h.type === 'modify' ? 'target' : 'source'}
                    position={getPositionLiteral(h.position)}
                    className={`${getShapeClass(h.type)} handle-${h.type} ${movingHandle?.id === h.id ? 'handle-moving' : ''}`}
                    style={{
                        [h.position === 'top' || h.position === 'bottom' ? 'left' : 'top']: `${h.offset}%`,
                    }}
                    onContextMenu={(e) => onHandleContextMenu(e, h.id)}
                    onMouseDown={(e) => onHandleMouseDown(e, h)}
                >
                    <div style={{ transform: `rotate(${getRotation(h.type, h.position)}deg)`, display: 'flex' }}>
                        {getIconContent(h.type)}
                    </div>
                    {h.label && (
                        <div className="handle-label" style={{
                            position: 'absolute',
                            [h.position === 'left' ? 'left' : h.position === 'right' ? 'right' : 'top']: '20px',
                            whiteSpace: 'nowrap',
                            fontSize: '0.6rem',
                            color: 'var(--handle-color)',
                            pointerEvents: 'none'
                        }}>
                            {h.label}
                        </div>
                    )}
                </Handle>
            ))}

            {menu && (
                <div
                    className="handle-panel"
                    style={{ left: `${menu.pX}%`, top: `${menu.pY}%`, transform: 'translate(-50%, -10px)' }}
                    onMouseLeave={() => setMenu(null)}
                >
                    <div className="handle-panel-header">
                        <span className="handle-panel-title">Add Extra Handle</span>
                        <span className="handle-panel-close" onClick={() => setMenu(null)}>×</span>
                    </div>
                    {panelItems.map((item) => (
                        <div key={item.type} className="handle-panel-item" onClick={() => handleAdd(item.type)}>
                            <div className={`handle-panel-icon handle-${item.type}`} style={{ transform: `rotate(${getRotation(item.type, menu.side)}deg)` }}>
                                {getIconContent(item.type)}
                            </div>
                            <div className="handle-panel-info">
                                <span className="handle-panel-label">{item.label}</span>
                                <span className="handle-panel-desc">{item.desc}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
