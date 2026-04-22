import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, useReactFlow, useUpdateNodeInternals } from '@xyflow/react';
import useStore, { type AppState, type CustomHandle, type HandleType } from '../store/useStore';

interface DynamicHandlesProps {
    nodeId: string;
    handles?: CustomHandle[];
    locked?: boolean;
    allowedTypes?: HandleType[];
    customDescriptions?: Partial<Record<string, string>>;
    touchingEdges?: { left?: boolean, right?: boolean, top?: boolean, bottom?: boolean };
}

type MenuActionType = HandleType | 'delete' | 'close';

type MenuItem = {
    type: MenuActionType;
    label: string;
    desc: string;
    icon: string;
    color: string;
    handleId?: string;
};

type MenuState = {
    pX: number;
    pY: number;
    side: 'top' | 'bottom' | 'left' | 'right';
    percent: number;
    screenX: number;
    screenY: number;
    activeIndex: number | null;
    items: MenuItem[];
};

const PANEL_ITEMS: Record<Exclude<MenuActionType, 'close'>, { label: string; desc: string; icon: string; color: string }> = {
    input: { label: '數據輸入', desc: '接收運算數據', icon: '●', color: '#2196F3' },
    output: { label: '數據輸出', desc: '傳遞運算結果', icon: '●', color: '#E91E63' },
    'gate-in': { label: 'Gate 控制', desc: '控制閘門開關 (1=開, 0=關)', icon: '⧁', color: '#4ade80' },
    scope: { label: '連通接口', desc: '節點間的變數環境互通', icon: '◎', color: '#888888' },
    delete: { label: '刪除組件', desc: '移除此零件', icon: '🗑', color: '#ff4757' }
};

const PieMenu: React.FC<{ menu: MenuState; onAction: (type: MenuActionType, handleId?: string) => void }> = ({ menu, onAction }) => {
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

        const diff = endAngle - startAngle;
        if (diff >= 359.9) {
            const mid = startAngle + diff / 2;
            return `${describeArc(startAngle, mid)} ${describeArc(mid, endAngle)}`;
        }

        const startOuter = polarToCartesian(center, center, outerRadius, endAngle);
        const endOuter = polarToCartesian(center, center, outerRadius, startAngle);
        const startInner = polarToCartesian(center, center, innerRadius, endAngle);
        const endInner = polarToCartesian(center, center, innerRadius, startAngle);
        const largeArcFlag = diff <= 180 ? '0' : '1';

        return [
            'M', startOuter.x, startOuter.y,
            'A', outerRadius, outerRadius, 0, largeArcFlag, 0, endOuter.x, endOuter.y,
            'L', endInner.x, endInner.y,
            'A', innerRadius, innerRadius, 0, largeArcFlag, 1, startInner.x, startInner.y,
            'Z'
        ].join(' ');
    };

    return (
        <>
            <div className="pie-menu-overlay" onClick={() => onAction('close')} />
            <div className="pie-menu-container" style={{ left: menu.screenX - center, top: menu.screenY - center }}>
                <svg className="pie-svg" viewBox={`0 0 ${size} ${size}`}>
                    {menu.items.map((item, i) => {
                        const startAngle = i * anglePerItem;
                        const endAngle = (i + 1) * anglePerItem;
                        const midAngle = startAngle + anglePerItem / 2;
                        const textRadius = (outerRadius + innerRadius) / 2;

                        const radian = (midAngle - 90) * Math.PI / 180;
                        const tx = center + Math.cos(radian) * textRadius;
                        const ty = center + Math.sin(radian) * textRadius;
                        const itemStyle = { ['--item-color' as string]: item.color } as React.CSSProperties;

                        return (
                            <g key={i}>
                                <path
                                    className={`pie-segment ${menu.activeIndex === i ? 'active' : ''}`}
                                    d={describeArc(startAngle, endAngle)}
                                    style={itemStyle}
                                    onClick={() => onAction(item.type, item.handleId)}
                                />
                                <g className="pie-label-group" transform={`translate(${tx}, ${ty})`}>
                                    <text className="pie-item-icon" y="-15" style={itemStyle}>
                                        {item.icon}
                                    </text>
                                    <text className="pie-item-label" y="5" style={{ fill: 'var(--text-main)', opacity: menu.activeIndex === i ? 1 : 0.6 }}>{item.label}</text>
                                    <text className="pie-item-desc" y="20" style={{ fill: 'var(--text-main)', opacity: 0.4 }}>{item.desc}</text>
                                </g>
                            </g>
                        );
                    })}
                </svg>
                <div className="pie-menu-center-v2" onClick={() => onAction('close')}>x</div>
            </div>
        </>
    );
};

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
    const edges = useStore((state: AppState) => state.edges);
    const nodes = useStore((state: AppState) => state.nodes);
    const containerRef = useRef<HTMLDivElement>(null);
    const updateNodeInternals = useUpdateNodeInternals();
    const { setCenter } = useReactFlow();


    // Trigger internal update whenever handles array changes meaningfully
    useEffect(() => {
        updateNodeInternals(nodeId);
    }, [nodeId, handles, updateNodeInternals]);

    // Auto-remove disconnected scope target handles (h-drop-scope-*)
    // Only watches edges (not handles) to avoid race with onConnectEnd that adds handle THEN edge.
    useEffect(() => {
        const currentHandles = handles;
        if (!currentHandles) return;
        currentHandles.forEach(h => {
            if (!h.id.startsWith('h-drop-scope')) return;
            const isConnected = edges.some(e =>
                (e.target === nodeId && e.targetHandle === h.id) ||
                (e.source === nodeId && e.sourceHandle === h.id)
            );
            if (!isConnected) removeHandle(nodeId, h.id);
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [edges, nodeId, removeHandle]);

    const [menu, setMenu] = useState<MenuState | null>(null);
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

    const onEdgeContextMenu = useCallback((e: React.MouseEvent, side: 'top' | 'bottom' | 'left' | 'right') => {
        e.preventDefault();
        e.stopPropagation();
        if (locked && (side === 'left' || side === 'right')) return;

        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const pX = ((e.clientX - rect.left) / rect.width) * 100;
        const pY = ((e.clientY - rect.top) / rect.height) * 100;
        const percent = Math.max(0, Math.min(100, (side === 'top' || side === 'bottom') ? pX : pY));
        const typesToShow = allowedTypes.filter((t) => PANEL_ITEMS[t]);
        if (typesToShow.length === 0) return;

        const items: MenuItem[] = typesToShow.map((type) => ({
            ...PANEL_ITEMS[type],
            type,
            desc: customDescriptions[type] || PANEL_ITEMS[type].desc
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

        setMenu({ pX, pY, side, percent, screenX: e.clientX, screenY: e.clientY, activeIndex: null, items });
    }, [nodeId, locked, allowedTypes, customDescriptions, addHandle]);

    const onEdgeMouseDown = useCallback((e: React.MouseEvent, side: 'top' | 'bottom' | 'left' | 'right') => {
        if (e.button === 2) {
            onEdgeContextMenu(e, side);
        }
    }, [onEdgeContextMenu]);

    useEffect(() => {
        if (!menu) return;

        const handleGlobalMouseMove = (e: MouseEvent) => {
            const dx = e.clientX - menu.screenX;
            const dy = e.clientY - menu.screenY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 40) {
                setMenu(prev => prev ? { ...prev, activeIndex: null } : null);
                return;
            }

            // Calculate angle in degrees (0 is up, clockwise)
            let angle = Math.atan2(dx, -dy) * 180 / Math.PI;
            if (angle < 0) angle += 360;

            const itemCount = menu.items.length;
            const anglePerItem = 360 / itemCount;
            const index = Math.floor(angle / anglePerItem);
            
            setMenu(prev => prev ? { ...prev, activeIndex: index } : null);
        };

        const handleGlobalMouseUp = (e: MouseEvent) => {
            if (e.button === 2) {
                // If we have an active index, execute it
                setMenu(current => {
                    if (current && current.activeIndex !== null) {
                        const item = current.items[current.activeIndex];
                        // We need a way to call handleAction from here. 
                        // But menu is about to be cleared.
                        // We'll handle it via a ref or a side effect.
                        // Actually, I can just call the action here directly.
                        if (item.type === 'delete' && item.handleId) {
                            removeHandle(nodeId, item.handleId);
                        } else if (item.type !== 'close') {
                            addHandle(nodeId, {
                                id: `h-${Date.now()}`,
                                type: item.type as HandleType,
                                position: current.side,
                                offset: current.percent,
                            });
                        }
                    }
                    return null;
                });
            }
        };

        window.addEventListener('mousemove', handleGlobalMouseMove);
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [menu, nodeId, addHandle, removeHandle]);

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
        
        const items: MenuItem[] = [{ ...PANEL_ITEMS.delete, type: 'delete', handleId: handle.id }];

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
            activeIndex: null,
            items
        });
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
            const dists: { side: 'top' | 'bottom' | 'left' | 'right'; d: number; p: number }[] = [
                { side: 'top', d: Math.abs(pY - 0), p: pX },
                { side: 'bottom', d: Math.abs(pY - 100), p: pX },
                { side: 'left', d: Math.abs(pX - 0), p: pY },
                { side: 'right', d: Math.abs(pX - 100), p: pY },
            ];
            const closest = dists.reduce((prev, curr) => prev.d < curr.d ? prev : curr);
            const clampedP = Math.max(0, Math.min(100, closest.p));

            setMovingHandle(prev => prev ? { ...prev, side: closest.side, offset: clampedP } : null);
            updateHandle(nodeId, movingHandle.id, { position: closest.side, offset: clampedP });
            updateNodeInternals(nodeId);
        };

        const onMouseUp = () => setMovingHandle(null);

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [movingHandle, nodeId, updateHandle, updateNodeInternals]);

    const getPositionLiteral = (pos: string): Position => {
        switch (pos) {
            case 'top': return Position.Top;
            case 'bottom': return Position.Bottom;
            case 'left': return Position.Left;
            default: return Position.Right;
        }
    };

    const getRotation = (type: HandleType, side: string) => {
        const isInput = (type === 'input');
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
        if (['input', 'output', 'scope'].includes(type)) return 'handle-square';
        return 'handle-triangle-down';
    };

    const canAddAny = allowedTypes.length > 0;
    const getWirelessPeerNodeId = useCallback((handleId: string, role: 'source' | 'target'): string | null => {
        const wirelessEdge = edges.find((edge) => {
            if (!edge.className?.includes('wireless-edge')) return false;
            if (role === 'source') {
                return edge.source === nodeId && edge.sourceHandle === handleId;
            }
            return edge.target === nodeId && edge.targetHandle === handleId;
        });
        if (!wirelessEdge) return null;
        return role === 'source' ? wirelessEdge.target : wirelessEdge.source;
    }, [edges, nodeId]);

    const focusPeerNode = useCallback((peerNodeId: string) => {
        const peer = nodes.find((node) => node.id === peerNodeId);
        if (!peer) return;
        const width = peer.measured?.width ?? peer.width ?? 220;
        const height = peer.measured?.height ?? peer.height ?? 120;
        setCenter(peer.position.x + width / 2, peer.position.y + height / 2, { duration: 320 });
    }, [nodes, setCenter]);


    return (
        <div
            ref={containerRef}
            className="dynamic-handles-overlay"
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: menu ? 1002 : 10 }}
        >
            {canAddAny && (
                <>
                    <div className="edge-hitbox edge-top" onMouseDown={(e) => onEdgeMouseDown(e, 'top')} onContextMenu={(e) => e.preventDefault()} />
                    <div className="edge-hitbox edge-bottom" onMouseDown={(e) => onEdgeMouseDown(e, 'bottom')} onContextMenu={(e) => e.preventDefault()} />
                    <div className="edge-hitbox edge-left" onMouseDown={(e) => onEdgeMouseDown(e, 'left')} onContextMenu={(e) => e.preventDefault()} />
                    <div className="edge-hitbox edge-right" onMouseDown={(e) => onEdgeMouseDown(e, 'right')} onContextMenu={(e) => e.preventDefault()} />
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
                if (h.type === 'scope') {
                    // h-drop-scope-* = auto-created receivers (target); h-scope-* = manually created emitters (source)
                    const isScopeTarget = h.id.startsWith('h-drop-scope');
                    const scopeRole = isScopeTarget ? 'target' : 'source';
                    const wirelessPeerNodeId = getWirelessPeerNodeId(h.id, scopeRole);
                    const wirelessClass = wirelessPeerNodeId ? 'wireless-endpoint' : '';
                    return (
                        <Handle
                            key={h.id}
                            id={h.id}
                            type={isScopeTarget ? 'target' : 'source'}
                            position={getPositionLiteral(h.position)}
                            isConnectable={!cmdPressed}
                            className={`${getShapeClass(h.type)} handle-${h.type} ${wirelessClass} ${movingHandle?.id === h.id ? 'handle-moving' : ''}`}
                            style={{ [h.position === 'top' || h.position === 'bottom' ? 'left' : 'top']: `${h.offset}%` }}
                            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onHandleContextMenu(e, h); }}
                            onMouseDown={(e) => onHandleMouseDown(e, h)}
                            onMouseEnter={(e) => {
                                const rect = (e.target as HTMLElement).getBoundingClientRect();
                                window.dispatchEvent(new CustomEvent('setTooltip', {
                                    detail: {
                                        x: rect.x + 15,
                                        y: rect.y - 40,
                                        text: (
                                            <div style={{ textAlign: 'left' }}>
                                                <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>SCOPE PIN</div>
                                                <div style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{h.label || '連通接口'}</div>
                                                <div style={{ fontSize: '0.7rem', opacity: 0.8, marginTop: 4 }}>
                                                    {isScopeTarget ? '接收：外部變數環境' : '輸出：本節點變數環境'}
                                                </div>
                                                {wirelessPeerNodeId && (
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--accent)', marginTop: 2 }}>點擊跳至對端節點</div>
                                                )}
                                            </div>
                                        )
                                    }
                                }));
                            }}
                            onMouseLeave={() => {
                                window.dispatchEvent(new CustomEvent('setTooltip', { detail: null }));
                            }}
                            onClick={(e) => {
                                if (!wirelessPeerNodeId) return;
                                e.stopPropagation();
                                focusPeerNode(wirelessPeerNodeId);
                            }}
                        >
                            {!isScopeTarget && <div style={{ display: 'flex' }}>◎</div>}
                        </Handle>
                    );
                }

                return (
                    (() => {
                        const wirelessPeerNodeId = getWirelessPeerNodeId(h.id, (h.type === 'input' || h.type === 'gate-in') ? 'target' : 'source');
                        const wirelessClass = wirelessPeerNodeId ? 'wireless-endpoint' : '';
                        return (
                    <Handle
                        key={h.id}
                        id={h.id}
                        type={(h.type === 'input' || h.type === 'gate-in') ? 'target' : 'source'}
                        position={getPositionLiteral(h.position)}
                        isConnectable={!cmdPressed}
                        className={`${getShapeClass(h.type)} handle-${h.type} ${wirelessClass} ${movingHandle?.id === h.id ? 'handle-moving' : ''}`}
                        style={{
                            [h.position === 'top' || h.position === 'bottom' ? 'left' : 'top']: `${h.offset}%`,
                        }}
                        onContextMenu={(e) => e.preventDefault()}
                        onMouseEnter={(e) => {
                            const desc = h.description || customDescriptions[h.id] || PANEL_ITEMS[h.type]?.desc || 'Any generic data';
                            const inferredType = h.declaredType ? `Type: ${h.declaredType}` : (h.type === 'input' ? 'Receives: Auto-casted' : h.type === 'output' ? 'Emits: Result Data' : 'Gate Trigger');
                            const rect = (e.target as HTMLElement).getBoundingClientRect();
                            window.dispatchEvent(new CustomEvent('setTooltip', {
                                detail: {
                                    x: rect.x + 15,
                                    y: rect.y - 40,
                                    text: (
                                        <div style={{ textAlign: 'left' }}>
                                            <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>{h.type.toUpperCase()} PIN</div>
                                            <div style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{h.label || h.id}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--accent)', marginTop: 2 }}>{inferredType}</div>
                                            <div style={{ fontSize: '0.7rem', opacity: 0.8, marginTop: 4 }}>{desc}</div>
                                        </div>
                                    )
                                }
                            }));
                        }}
                        onMouseLeave={() => {
                            window.dispatchEvent(new CustomEvent('setTooltip', { detail: null }));
                        }}
                        onMouseDown={(e: React.MouseEvent) => {
                            if (e.button === 2) {
                                onHandleContextMenu(e, h);
                            } else {
                                onHandleMouseDown(e, h);
                            }
                        }}
                        onClick={(e) => {
                            if (!wirelessPeerNodeId) return;
                            e.stopPropagation();
                            focusPeerNode(wirelessPeerNodeId);
                        }}
                    >
                        <div style={{ transform: `rotate(${getRotation(h.type, h.position)}deg)`, display: 'flex' }}>
                            {h.type === 'gate-in' ? '⧁' : '●'}
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
                    })()
                );
            })}

            {menu && createPortal(
                <PieMenu menu={menu} onAction={handleAction} />,
                document.body
            )}
        </div>
    );
};
