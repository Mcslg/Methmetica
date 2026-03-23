import { type NodeProps, type Node, NodeResizer } from '@xyflow/react';
import { useEffect } from 'react';
import useStore, { type AppState, type NodeData } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';
import { Icons } from '../components/Icons';

export function CalculusNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    const executeNode = useStore((state: AppState) => state.executeNode);
    const variant = data.variant || 'diff'; // 'diff' or 'integ'
    const variable = data.variable || 'x';

    const handleEject = (type: string) => {
        const slotNode = data.slots?.[type];
        if (!slotNode) return;
        
        useStore.getState().addNode({
            ...slotNode,
            id: `${type}-${Date.now()}`,
            position: { x: slotNode.position.x, y: slotNode.position.y - 80 },
            selected: false
        });
        
        const newSlots = { ...data.slots };
        delete newSlots[type];

        // Update both data and dimensions (shrink -40px)
        const store = useStore.getState();
        const parentNode = store.nodes.find(n => n.id === id);
        if (parentNode) {
            const curWidth = parentNode.width ?? parentNode.measured?.width ?? 160;
            const curHeight = parentNode.height ?? parentNode.measured?.height ?? 100;
            
            useStore.setState({
                nodes: store.nodes.map(n => n.id === id ? {
                    ...n,
                    width: curWidth,
                    height: Math.max(60, curHeight - 40),
                    data: { ...n.data, slots: newSlots }
                } : n)
            });
        }
    };

    const handleManualRun = () => {
        executeNode(id, true);
    };

    const toggleVariant = () => {
        updateNodeData(id, { variant: variant === 'diff' ? 'integ' : 'diff' });
        // Execute after state updates (timeout ensures state is flushed)
        setTimeout(() => executeNode(id), 50);
    };

    const handleVariableChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVar = e.target.value.trim() || 'x';
        updateNodeData(id, { variable: newVar });
        // Execute immediately on letter change, handled by graph eval if connected, but let's force it here too
        setTimeout(() => executeNode(id), 50);
    };

    useEffect(() => {
        if (data.input !== undefined) {
            executeNode(id);
        }
    }, [data.input, id, executeNode]);


    const touchingClasses = data.touchingEdges
        ? Object.entries(data.touchingEdges)
            .filter(([_, touching]) => touching)
            .map(([edge]) => `edge-touch-${edge}`)
            .join(' ')
        : '';

    return (
        <div className={`math-node op-node calculus-node ${variant}-node ${touchingClasses}`} 
             style={{ 
                 width: '100%', 
                 height: '100%',
                 display: 'flex',
                 flexDirection: 'column',
                 overflow: 'visible',
                 boxSizing: 'border-box'
             }}>
            <NodeResizer minWidth={120} minHeight={50} isVisible={selected} lineStyle={{ border: 'none' }} handleStyle={{ width: 8, height: 8, borderRadius: '50%', background: 'transparent', border: 'none' }} />
            <DynamicHandles
                nodeId={id}
                handles={data.handles}
                allowedTypes={['input', 'output']}
                touchingEdges={data.touchingEdges}
            />
            <div className="node-header" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>
                        <Icons.Calculus />
                        {variant === 'diff' ? 'Differentiate (d/dx)' : 'Integrate (∫)'}
                    </span>
                </div>
                {/* Absorbed Slots Rendering */}
                {data.slots && Object.keys(data.slots).length > 0 && (
                    <div style={{ 
                        marginTop: '6px', 
                        display: 'flex', 
                        gap: '4px', 
                        paddingTop: '6px', 
                        borderTop: '1px solid rgba(255,255,255,0.1)' 
                    }}>
                        {data.slots.buttonNode && (
                            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255, 204, 0, 0.1)', border: '1px solid rgba(255, 204, 0, 0.3)', borderRadius: '4px', padding: '2px 4px' }}>
                                <button
                                    className="nodrag"
                                    onClick={handleManualRun}
                                    style={{ background: '#ffcc00', border: 'none', color: '#000', fontSize: '0.6rem', fontWeight: 800, padding: '2px 6px', borderRadius: '2px', cursor: 'pointer' }}
                                >
                                    RUN 🔒
                                </button>
                                <button className="nodrag eject-btn" onClick={() => handleEject('buttonNode')} title="Eject Button">⏏️</button>
                            </div>
                        )}
                        {data.slots.gateNode && (
                            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(74, 222, 128, 0.1)', border: '1px solid rgba(74, 222, 128, 0.3)', borderRadius: '4px', padding: '2px 4px' }}>
                                <span style={{ fontSize: '0.6em', color: '#4ade80', fontWeight: 'bold' }}>GATE</span>
                                <button className="nodrag eject-btn" onClick={() => handleEject('gateNode')} title="Eject Gate">⏏️</button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="calc-controls" style={{
                display: 'flex',
                gap: '8px',
                padding: '6px 12px',
                background: 'var(--bg-input)',
                borderTop: '1px solid var(--border-header)',
                fontSize: '0.65rem',
                alignItems: 'center',
                flexGrow: 1,
                justifyContent: 'center'
            }}>
                <button onClick={toggleVariant} className="variant-toggle" style={{ padding: '0px 6px' }} title={variant === 'diff' ? '切換為積分' : '切換為微分'}>
                    {variant === 'diff' ? '∫' : 'd/dx'}
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <span style={{ color: 'var(--text-sub)' }}>w.r.t</span>
                    <input
                        className="nodrag"
                        type="text"
                        value={variable}
                        onChange={handleVariableChange}
                        style={{
                            width: '20px',
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border-input)',
                            color: 'var(--text-main)',
                            borderRadius: '4px',
                            textAlign: 'center',
                            fontSize: '0.65rem',
                            padding: '1px',
                            fontFamily: 'inherit',
                            outline: 'none'
                        }}
                    />
                </div>
            </div>
            <style>{`
                .calculus-node {
                    min-width: 120px;
                }
                .diff-node {
                    border-top: 2px solid #ff4757 !important;
                }
                .integ-node {
                    border-top: 2px solid #1e90ff !important;
                }
                .variant-toggle {
                    background: var(--bg-input);
                    border: 1px solid var(--border-node);
                    color: var(--text-main);
                    border-radius: 4px;
                    padding: 1px 5px;
                    font-size: 0.65rem;
                    cursor: pointer;
                    transition: all 0.2s;
                    font-family: inherit;
                }
                .variant-toggle:hover {
                    background: var(--accent);
                    color: #fff;
                    border-color: var(--accent);
                }
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
        </div>
    );
}
