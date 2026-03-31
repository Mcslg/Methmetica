import React from 'react';
import { NodeResizer, useReactFlow } from '@xyflow/react';
import useStore, { type AppState } from '../store/useStore';
import { DynamicHandles } from '../nodes/DynamicHandles';
import { CommentArea } from './CommentArea';
import { ResultArea } from './ResultArea';
import { CalculusStepsArea } from './CalculusStepsArea';
import { Icons } from './Icons';

interface NodeFrameProps {
    id: string;
    data: any;
    selected?: boolean;
    icon: React.ReactNode;
    defaultLabel: string;
    children: React.ReactNode;
    minWidth?: number;
    minHeight?: number;
    className?: string; // 例：'calculate-node'
    headerExtras?: React.ReactNode; // 例：EXT 切換按鈕
    style?: React.CSSProperties;
    contentStyle?: React.CSSProperties; // Add this
    allowedHandleTypes?: ('input' | 'output')[];
    customHandleDescriptions?: Record<string, string>;
    onManualRun?: () => void; // 若節點需要特定的手動執行邏輯
}

export const NodeFrame: React.FC<NodeFrameProps> = ({
    id, data, selected, icon, defaultLabel, children,
    minWidth = 160, minHeight = 120, className = '',
    headerExtras, style, contentStyle = {}, allowedHandleTypes = ['input', 'output'],
    customHandleDescriptions, onManualRun
}) => {
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    const executeNode = useStore((state: AppState) => state.executeNode);
    const globalHandleEject = useStore((state: AppState) => state.handleEject);
    const setDraggingEjectPos = useStore((state: AppState) => state.setDraggingEjectPos);
    const screenToFlowPosition = useReactFlow().screenToFlowPosition;

    const buttonSid = typeof data.slots?.buttonNode === 'string' ? data.slots.buttonNode : null;
    const gateSid = typeof data.slots?.gateNode === 'string' ? data.slots.gateNode : null;
    const realButtonNode = useStore(state => buttonSid ? state.nodes.find(n => n.id === buttonSid) : null);
    const realGateNode = useStore(state => gateSid ? state.nodes.find(n => n.id === gateSid) : null);

    // no longer need isCtrlPressed as we fetch it lazily

    const handleGenericEject = (slotKey: string, clientPos: { x: number, y: number }) => {
        const flowPos = screenToFlowPosition({ x: clientPos.x, y: clientPos.y });
        globalHandleEject(id, slotKey, flowPos);
    };

    const runTrigger = () => {
        if (onManualRun) {
            onManualRun();
        } else if (realButtonNode) {
            useStore.getState().edges
                .filter(e => e.source === realButtonNode.id)
                .forEach(e => useStore.getState().executeNode(e.target));
        } else {
            executeNode(id);
        }
    };

    const slotKeys = Object.keys(data.slots || {});
    const augmentedHandles = (data.handles || [])
        .filter((h: any) => {
            // 1. Hide handles that match merged slots (generic)
            if (h.type === 'target' || h.type === 'input') {
                if (h.label && slotKeys.includes(h.label)) return false;
            }
            // 2. Hide f(x) input if formula sidebar is active
            if (h.id === 'h-fn-in' && slotKeys.includes('formulaSidebar')) return false;
            
            return true;
        });

    if (data.slots?.gateNode && !augmentedHandles.some((h: any) => h.id === 'h-gate-in')) {
        augmentedHandles.push({ id: 'h-gate-in', type: 'gate-in', position: 'left', offset: 20, label: 'Gate' });
    }

    const touchingClasses = data.touchingEdges
        ? Object.entries(data.touchingEdges)
            .filter(([_, touching]) => touching)
            .map(([edge]) => `edge-touch-${edge}`)
            .join(' ')
        : '';

    return (
        <div 
            className={`math-node op-node ${className} ${touchingClasses}`}
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'visible',
                boxSizing: 'border-box',
                ...style
            }}>
            <NodeResizer 
                minWidth={minWidth} 
                minHeight={minHeight} 
                isVisible={selected} 
                lineStyle={{ border: 'none' }} 
                handleStyle={{ 
                    width: 28, 
                    height: 28, 
                    borderRadius: '50%', 
                    background: 'transparent', 
                    border: 'none',
                    margin: -14,
                    zIndex: 1000
                }}
                handleClassName="resize-handle-v2"
            />

            {data.slots?.comment && (
                <CommentArea containerId={id} commentSid={data.slots.comment as string} />
            )}
            
            {data.slots?.resultText && (
                <ResultArea containerId={id} targetSid={data.slots.resultText as string} />
            )}

            {data.slots?.stepsArea && (
                <CalculusStepsArea containerId={id} />
            )}

            <DynamicHandles
                nodeId={id}
                handles={augmentedHandles}
                locked={true}
                allowedTypes={allowedHandleTypes}
                touchingEdges={data.touchingEdges}
                customDescriptions={customHandleDescriptions}
            />

            <div className="node-header" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', flexGrow: 1, gap: '4px' }}>
                        {icon}
                        <input
                            title="Rename node"
                            className="nodrag"
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'inherit',
                                fontSize: 'inherit',
                                fontWeight: 'inherit',
                                width: `${Math.max((data.label || defaultLabel).length + 1, 3)}ch`,
                                minWidth: '40px',
                                maxWidth: '180px',
                                padding: '0',
                                margin: '0',
                                outline: 'none',
                                cursor: 'text'
                            }}
                            value={data.label || defaultLabel}
                            onChange={(e) => updateNodeData(id, { label: e.target.value })}
                            onFocus={(e) => {
                                if (e.target.value === defaultLabel) {
                                    updateNodeData(id, { label: '' });
                                }
                            }}
                            onBlur={(e) => {
                                if (e.target.value === '') {
                                    updateNodeData(id, { label: defaultLabel });
                                }
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                        />
                    </div>
                    {headerExtras && (
                        <div style={{ display: 'flex', gap: '4px' }}>
                            {headerExtras}
                        </div>
                    )}
                </div>

                {/* Absorbed Slots Rendering */}
                {data.slots && Object.keys(data.slots).length > 0 && (
                    <div style={{
                        marginTop: '6px',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '4px',
                        paddingTop: '6px',
                        borderTop: '1px solid rgba(255,255,255,0.1)'
                    }}>
                        {/* Dynamic Slider Slots */}
                        {Object.entries(data.slots).map(([slotKey, sid]) => {
                            const proxyNode = useStore.getState().nodes.find(n => n.id === sid);
                            if (!proxyNode) return null;

                            // Shared Ejection logic
                            const handleEject = (e: React.PointerEvent) => {
                                e.stopPropagation();
                                if (useStore.getState().isCtrlPressed) {
                                    const startX = e.clientX;
                                    const startY = e.clientY;
                                    const onMove = (me: PointerEvent) => {
                                        setDraggingEjectPos({ startX, startY, curX: me.clientX, curY: me.clientY });
                                    };
                                    const onUp = (ue: PointerEvent) => {
                                        window.removeEventListener('pointermove', onMove);
                                        window.removeEventListener('pointerup', onUp);
                                        setDraggingEjectPos(null);
                                        const dx = ue.clientX - startX;
                                        const dy = ue.clientY - startY;
                                        if (Math.sqrt(dx * dx + dy * dy) > 5) {
                                            handleGenericEject(slotKey, { x: ue.clientX, y: ue.clientY });
                                        }
                                    };
                                    window.addEventListener('pointermove', onMove);
                                    window.addEventListener('pointerup', onUp, { once: true });
                                }
                            };

                            // Render Slider (only if NOT in a sidebar-capable node or if specifically allowed)
                            if (proxyNode.type === 'sliderNode') {
                                // If this node has a formulaSidebar, we skip rendering sliders in the header 
                                // because they will be rendered in the sidebar for a better UX.
                                if (slotKeys.includes('formulaSidebar')) return null;

                                return (
                                    <div
                                        key={slotKey}
                                        className="nodrag"
                                        onPointerDown={handleEject}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            background: 'rgba(255, 255, 255, 0.05)',
                                            border: '1px solid rgba(255, 255, 255, 0.1)',
                                            borderRadius: '4px',
                                            padding: '2px 8px',
                                            gap: '6px',
                                            cursor: useStore.getState().isCtrlPressed ? 'grab' : 'default'
                                        }}
                                    >
                                        <span style={{ fontSize: '0.6rem', fontWeight: 'bold', color: 'var(--text-main)', opacity: 0.8, userSelect: 'none' }}>{slotKey}</span>
                                        <input
                                            type="range"
                                            className="nodrag"
                                            min={proxyNode.data.min ?? 0}
                                            max={proxyNode.data.max ?? 100}
                                            step={proxyNode.data.step ?? 1}
                                            value={proxyNode.data.value || 0}
                                            onChange={(e) => {
                                                const newVal = e.target.value;
                                                updateNodeData(sid as string, { value: newVal });
                                                if (!data.slots?.buttonNode) {
                                                    executeNode(id);
                                                }
                                            }}
                                            title={`Ctrl+Drag to eject ${slotKey} slider`}
                                            style={{ width: '50px', height: '4px', accentColor: 'var(--accent)' }}
                                        />
                                        <span style={{ fontSize: '0.6rem', color: 'var(--text-sub)', minWidth: '16px', textAlign: 'right', userSelect: 'none' }}>{proxyNode.data.value || 0}</span>
                                    </div>
                                );
                            }

                             return null;

                            return null;
                        })}

                        {data.slots.buttonNode && (
                            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255, 204, 0, 0.1)', border: '1px solid rgba(255, 204, 0, 0.3)', borderRadius: '4px', padding: '2px 4px' }}>
                                <button
                                    className="nodrag"
                                    onClick={runTrigger}
                                    onPointerDown={(e) => {
                                        e.stopPropagation();
                                        if (useStore.getState().isCtrlPressed) {
                                            const startX = e.clientX;
                                            const startY = e.clientY;
                                            const onMove = (me: PointerEvent) => {
                                                setDraggingEjectPos({ startX, startY, curX: me.clientX, curY: me.clientY });
                                            };
                                            const onUp = (ue: PointerEvent) => {
                                                window.removeEventListener('pointermove', onMove);
                                                window.removeEventListener('pointerup', onUp);
                                                setDraggingEjectPos(null);
                                                const dx = ue.clientX - startX;
                                                const dy = ue.clientY - startY;
                                                if (Math.sqrt(dx * dx + dy * dy) > 5) {
                                                    handleGenericEject('buttonNode', { x: ue.clientX, y: ue.clientY });
                                                }
                                            };
                                            window.addEventListener('pointermove', onMove);
                                            window.addEventListener('pointerup', onUp, { once: true });
                                        }
                                    }}
                                    style={{ background: '#ffcc00', border: 'none', color: '#000', fontSize: '0.6rem', fontWeight: 800, padding: '2px 6px', borderRadius: '2px', cursor: 'pointer' }}
                                    title="Click to run | Ctrl+Drag to eject"
                                >
                                    <Icons.Trigger width={10} height={10} style={{ marginRight: 4 }} /> RUN
                                </button>
                            </div>
                        )}
                        {data.slots.gateNode && (
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    background: (realGateNode ? Number(realGateNode.data.value) : 0) !== 0 ? 'rgba(74, 222, 128, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                                    border: `1px solid ${(realGateNode ? Number(realGateNode.data.value) : 0) !== 0 ? 'rgba(74, 222, 128, 0.4)' : 'rgba(239, 68, 68, 0.3)'}`,
                                    borderRadius: '4px',
                                    padding: '2px 4px',
                                    transition: 'all 0.2s',
                                    cursor: 'pointer',
                                    userSelect: 'none'
                                }}
                                className="nodrag"
                                onClick={() => {
                                    if (realGateNode) {
                                        const isOpen = Number(realGateNode.data.value) !== 0;
                                        updateNodeData(realGateNode.id, { value: isOpen ? '0' : '1' });
                                    }
                                }}
                                onPointerDown={(e) => {
                                    e.stopPropagation();
                                    if (useStore.getState().isCtrlPressed) {
                                        const startX = e.clientX;
                                        const startY = e.clientY;
                                        const onMove = (me: PointerEvent) => {
                                            setDraggingEjectPos({ startX, startY, curX: me.clientX, curY: me.clientY });
                                        };
                                        const onUp = (ue: PointerEvent) => {
                                            window.removeEventListener('pointermove', onMove);
                                            window.removeEventListener('pointerup', onUp);
                                            setDraggingEjectPos(null);
                                            const dx = ue.clientX - startX;
                                            const dy = ue.clientY - startY;
                                            if (Math.sqrt(dx * dx + dy * dy) > 5) {
                                                handleGenericEject('gateNode', { x: ue.clientX, y: ue.clientY });
                                            }
                                        };
                                        window.addEventListener('pointermove', onMove);
                                        window.addEventListener('pointerup', onUp, { once: true });
                                    }
                                }}
                                title="Click to toggle | Ctrl+Drag to eject"
                            >
                                <span style={{ fontSize: '0.6em', color: (realGateNode ? Number(realGateNode.data.value) : 0) !== 0 ? '#4ade80' : '#ef4444', fontWeight: 'bold' }}>
                                    GATE {(realGateNode ? Number(realGateNode.data.value) : 0) !== 0 ? '✓' : '✗'}
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>


            <div className="node-content custom-scrollbar" style={{
                flexGrow: 1,
                padding: '4px 8px',
                overflowY: 'auto',
                overflowX: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                ...contentStyle // Merge custom style
            }}>
                {children}
            </div>
            <style>{`
                .eject-btn {
                    background: transparent;
                    border: none;
                    cursor: pointer;
                    font-size: 0.7rem;
                    margin-left: 4px;
                    opacity: 0.6;
                    transition: opacity 0.2s;
                }
                .eject-btn:hover {
                    opacity: 1;
                }
            `}</style>
            <style>{`
                .resize-handle-v2 {
                    background: transparent !important;
                    border: none !important;
                }
                .math-node.selected .resize-handle-v2::after {
                    content: "";
                    position: absolute;
                    width: 6px;
                    height: 6px;
                    background: var(--accent);
                    border-radius: 50%;
                    box-shadow: 0 0 8px var(--accent);
                    opacity: 0.6;
                    pointer-events: none;
                    transition: all 0.2s ease;
                }
                /* Top-left handle inward */
                .react-flow__node-resizer__handle--top-left::after { left: 40%; top: 40%; }
                /* Top-right handle inward */
                .react-flow__node-resizer__handle--top-right::after { left: 60%; top: 40%; }
                /* Bottom-left handle inward */
                .react-flow__node-resizer__handle--bottom-left::after { left: 40%; top: 60%; }
                /* Bottom-right handle inward */
                .react-flow__node-resizer__handle--bottom-right::after { left: 60%; top: 60%; }

                /* Hide side handles (top, bottom, left, right) */
                .react-flow__node-resizer__handle--top,
                .react-flow__node-resizer__handle--bottom,
                .react-flow__node-resizer__handle--left,
                .react-flow__node-resizer__handle--right {
                    display: none !important;
                }

                .resize-handle-v2:hover::after {
                    opacity: 1 !important;
                    transform: scale(1.6);
                }
            `}</style>
        </div>
    );
};
