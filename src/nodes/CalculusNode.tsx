import { type NodeProps, type Node, NodeResizer } from '@xyflow/react';
import { useEffect } from 'react';
import useStore, { type AppState, type NodeData } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';

export function CalculusNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    const executeNode = useStore((state: AppState) => state.executeNode);
    const variant = data.variant || 'diff'; // 'diff' or 'integ'
    const variable = data.variable || 'x';

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
            <NodeResizer minWidth={120} minHeight={80} isVisible={selected} lineStyle={{ border: 'none' }} handleStyle={{ width: 8, height: 8, borderRadius: '50%', background: variant === 'diff' ? '#ff4757' : '#1e90ff' }} />
            <DynamicHandles
                nodeId={id}
                handles={data.handles}
                allowedTypes={['input', 'output', 'trigger-in', 'trigger-out', 'trigger-err']}
                touchingEdges={data.touchingEdges}
                customDescriptions={{
                    'trigger-in': variant === 'diff' ? '接收電流時執行微分' : '接收電流時執行積分',
                    'trigger-out': '運算成功後發出電流',
                    'trigger-err': '計算出錯時發出電流'
                }}
            />
            <div className="node-header" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <span>{variant === 'diff' ? 'Differentiate' : 'Integrate'}</span>
            </div>

            <div className="calc-controls" style={{
                display: 'flex',
                gap: '8px',
                padding: '6px 15px',
                background: 'rgba(0,0,0,0.3)',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                fontSize: '0.7rem',
                alignItems: 'center'
            }}>
                <button onClick={toggleVariant} className="variant-toggle" title={variant === 'diff' ? '切換為積分' : '切換為微分'}>
                    {variant === 'diff' ? '∫' : 'd/dx'}
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ color: '#888' }}>w.r.t</span>
                    <input
                        className="nodrag"
                        type="text"
                        value={variable}
                        onChange={handleVariableChange}
                        style={{
                            width: '24px',
                            background: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            color: '#fff',
                            borderRadius: '3px',
                            textAlign: 'center',
                            fontSize: '0.7rem',
                            padding: '1px 0'
                        }}
                    />
                </div>
            </div>

            <div className="node-content custom-scrollbar" style={{ flexGrow: 1, padding: '10px', overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: '4px' }}>
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
                    background: rgba(255,255,255,0.1);
                    border: 1px solid rgba(255,255,255,0.2);
                    color: #ccc;
                    border-radius: 4px;
                    padding: 1px 5px;
                    font-size: 0.65rem;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .variant-toggle:hover {
                    background: rgba(255,255,255,0.2);
                    color: #fff;
                }
            `}</style>
        </div>
    );
}
