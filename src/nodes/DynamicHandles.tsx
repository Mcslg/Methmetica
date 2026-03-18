import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react';
import useStore, { type AppState, type CustomHandle, type HandleType } from '../store/useStore';

interface DynamicHandlesProps {
    nodeId: string;
    handles?: CustomHandle[];
    locked?: boolean;
    allowedTypes?: HandleType[];
    customDescriptions?: Partial<Record<string, string>>;
    touchingEdges?: { left?: boolean, right?: boolean, top?: boolean, bottom?: boolean };
}

export const DynamicHandles: React.FC<DynamicHandlesProps> = ({
    nodeId,
    handles = [],
    locked = false,
    allowedTypes = [],
    customDescriptions = {},
    touchingEdges = {}
}) => {
    const addHandle = useStore((state: AppState) => state.addHandle);
    const removeHandle = useStore((state: AppState) => state.removeHandle);
    const updateHandle = useStore((state: AppState) => state.updateHandle);
    const containerRef = useRef<HTMLDivElement>(null);
    const updateNodeInternals = useUpdateNodeInternals();


    // Trigger internal update whenever handles array changes meaningfully
    useEffect(() => {
        updateNodeInternals(nodeId);
    }, [nodeId, handles, updateNodeInternals]);
    const [menu, setMenu] = useState<{ pX: number, pY: number, side: 'top' | 'bottom' | 'left' | 'right', percent: number, screenX: number, screenY: number, items: { type: HandleType | 'delete' | 'close', label: string, icon: string, color: string }[] } | null>(null);
    const [movingHandle, setMovingHandle] = useState<{ id: string, side: string, offset: number } | null>(null);
    const [cmdPressed, setCmdPressed] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey) setCmdPressed(true);
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (!e.metaKey && !e.ctrlKey) setCmdPressed(false);
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    const panelItems: Record<string, { label: string, desc: string, icon: string, color: string }> = {
        'input': { label: '數據輸入', desc: '接收運算數據', icon: '●', color: '#2196F3' },
        'output': { label: '數據輸出', desc: '傳遞運算結果', icon: '●', color: '#E91E63' },
        'trigger-in': { label: '電流輸入', desc: '觸發執行信號', icon: '▶', color: '#FFEB3B' },
        'trigger-out': { label: '電流輸出', desc: '執行成功信號', icon: '▶', color: '#4CAF50' },
        'trigger-err': { label: '錯誤偵測', desc: '異常報警信號', icon: '▶', color: '#F44336' },
        'delete': { label: '刪除組件', desc: '移除此零件', icon: '🗑', color: '#ff4757' }
    };

    const onEdgeContextMenu = useCallback((e: React.MouseEvent, side: 'top' | 'bottom' | 'left' | 'right') => {
        e.preventDefault();
        e.stopPropagation();
        if (locked && (side === 'left' || side === 'right')) return;

        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const pX = ((e.clientX - rect.left) / rect.width) * 100;
        const pY = ((e.clientY - rect.top) / rect.height) * 100;
        const percent = Math.max(0, Math.min(100, (side === 'top' || side === 'bottom') ? pX : pY));
        const typesToShow = allowedTypes.filter(t => panelItems[t]);
        if (typesToShow.length === 0) return;

        const items = typesToShow.map(type => ({
            ...panelItems[type],
            type,
            desc: customDescriptions[type] || panelItems[type].desc
        }));

        if (items.length === 1) {
            addHandle(nodeId, {
                id: `h-${Date.now()}`,
                type: items[0].type as HandleType,
                position: side,
                offset: percent,
            });
            return;
        }

        setMenu({ pX, pY, side, percent, screenX: e.clientX, screenY: e.clientY, items } as any);
    }, [nodeId, locked, allowedTypes, customDescriptions, addHandle]);

    const handleAction = (type: string, handleId?: string) => {
        if (type === 'delete' && handleId) {
            removeHandle(nodeId, handleId);
        } else if (menu && type !== 'close') {
            addHandle(nodeId, {
                id: `h-${Date.now()}`,
                type: type as HandleType,
                position: menu.side,
                offset: menu.percent,
            });
        }
        setMenu(null);
    };

    const onHandleContextMenu = (e: React.MouseEvent, handle: CustomHandle) => {
        e.preventDefault();
        e.stopPropagation();
        if (locked) return;
        
        const items = [
            { ...panelItems['delete'], type: 'delete', handleId: handle.id } as any
        ];

        if (items.length === 1) {
            removeHandle(nodeId, handle.id);
            return;
        }

        setMenu({
            pX: 0, pY: 0,
            side: handle.position,
            percent: handle.offset,
            screenX: e.clientX,
            screenY: e.clientY,
            items
        });
    };

    const PieMenu = ({ menu, onAction }: { menu: any, onAction: (type: string, handleId?: string) => void }) => {
        const size = 320;
        const center = size / 2;
        const outerRadius = 140;
        const innerRadius = 55;
        const itemCount = menu.items.length;
        const anglePerItem = 360 / itemCount;

        const describeArc = (startAngle: number, endAngle: number): string => {
            const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
                const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
                return {
                    x: centerX + (radius * Math.cos(angleInRadians)),
                    y: centerY + (radius * Math.sin(angleInRadians))
                };
            };

            // If it's a full circle or near-full, draw two semi-arcs to avoid SVG arc limitations
            const diff = endAngle - startAngle;
            if (diff >= 359.9) {
                const mid = startAngle + diff / 2;
                return describeArc(startAngle, mid) + " " + describeArc(mid, endAngle);
            }

            const startOuter = polarToCartesian(center, center, outerRadius, endAngle);
            const endOuter = polarToCartesian(center, center, outerRadius, startAngle);
            const startInner = polarToCartesian(center, center, innerRadius, endAngle);
            const endInner = polarToCartesian(center, center, innerRadius, startAngle);

            const largeArcFlag = diff <= 180 ? "0" : "1";

            return [
                "M", startOuter.x, startOuter.y,
                "A", outerRadius, outerRadius, 0, largeArcFlag, 0, endOuter.x, endOuter.y,
                "L", endInner.x, endInner.y,
                "A", innerRadius, innerRadius, 0, largeArcFlag, 1, startInner.x, startInner.y,
                "Z"
            ].join(" ");
        };

        return (
            <>
                <div className="pie-menu-overlay" onClick={() => onAction('close')} />
                <div className="pie-menu-container" style={{ left: menu.screenX - center, top: menu.screenY - center }}>
                    <svg className="pie-svg" viewBox={`0 0 ${size} ${size}`}>
                        {menu.items.map((item: any, i: number) => {
                            const startAngle = i * anglePerItem;
                            const endAngle = (i + 1) * anglePerItem;
                            const midAngle = startAngle + anglePerItem / 2;
                            const textRadius = (outerRadius + innerRadius) / 2;
                            
                            const radian = (midAngle - 90) * Math.PI / 180;
                            const tx = center + Math.cos(radian) * textRadius;
                            const ty = center + Math.sin(radian) * textRadius;

                            return (
                                <g key={item.type}>
                                    <path
                                        className="pie-segment"
                                        d={describeArc(startAngle, endAngle)}
                                        style={{ '--item-color': item.color } as any}
                                        onClick={() => onAction(item.type, item.handleId)}
                                    />
                                    <g className="pie-label-group" transform={`translate(${tx}, ${ty})`}>
                                        <text className="pie-item-icon" y="-15" style={{ '--item-color': item.color } as any}>
                                            {item.icon}
                                        </text>
                                        <text className="pie-item-label" y="5">{item.label}</text>
                                        <text className="pie-item-desc" y="20">{item.desc}</text>
                                    </g>
                                </g>
                            );
                        })}
                    </svg>
                    <div className="pie-menu-center-v2" onClick={() => onAction('close')}>×</div>
                </div>
            </>
        );
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
        if (type === 'trigger-in' || type === 'trigger-out' || type === 'trigger-err') return '▶';
        return '●';
    };

    const getRotation = (type: HandleType, side: string) => {
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
        if (['input', 'output'].includes(type)) return 'handle-square';
        return 'handle-triangle-down';
    };

    const canAddAny = allowedTypes.length > 0;

    return (
        <div
            ref={containerRef}
            className="dynamic-handles-overlay"
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: menu ? 1002 : 10 }}
        >
            {canAddAny && (
                <>
                    <div className="edge-hitbox edge-top" onContextMenu={(e) => onEdgeContextMenu(e, 'top')} />
                    <div className="edge-hitbox edge-bottom" onContextMenu={(e) => onEdgeContextMenu(e, 'bottom')} />
                    <div className="edge-hitbox edge-left" onContextMenu={(e) => onEdgeContextMenu(e, 'left')} />
                    <div className="edge-hitbox edge-right" onContextMenu={(e) => onEdgeContextMenu(e, 'right')} />
                </>
            )}

            {movingHandle && (
                <div className={`moving-guide ${movingHandle.side === 'top' || movingHandle.side === 'bottom' ? 'guide-vertical' : 'guide-horizontal'}`}
                    style={{
                        [movingHandle.side === 'top' || movingHandle.side === 'bottom' ? 'left' : 'top']: `${movingHandle.offset}%`,
                    }}
                />
            )}

            {handles.map((h) => {
                // Hide input handles on the left if connected on the left
                if (h.type === 'input' && h.position === 'left' && touchingEdges.left) return null;
                // Hide output handles on the right if connected on the right
                if (h.type === 'output' && h.position === 'right' && touchingEdges.right) return null;

                return (
                    <Handle
                        key={h.id}
                        id={h.id}
                        type={h.type === 'input' || h.type === 'trigger-in' ? 'target' : 'source'}
                        position={getPositionLiteral(h.position)}
                        isConnectable={!cmdPressed}
                        className={`${getShapeClass(h.type)} handle-${h.type} ${movingHandle?.id === h.id ? 'handle-moving' : ''}`}
                        style={{
                            [h.position === 'top' || h.position === 'bottom' ? 'left' : 'top']: `${h.offset}%`,
                        }}
                        onContextMenu={(e) => onHandleContextMenu(e, h)}
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
                );
            })}

            {menu && createPortal(
                <PieMenu menu={menu} onAction={handleAction} />,
                document.body
            )}
        </div>
    );
};
