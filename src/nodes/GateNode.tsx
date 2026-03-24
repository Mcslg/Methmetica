import { NodeResizer } from '@xyflow/react';
import useStore, { type AppState } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';
import { Icons } from '../components/Icons';

export function GateNode({ id, data, selected, className }: any) {
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    // We check if the gate is "open" based on the data.value (which is updated by evaluateGraph)
    const val = Number(data.value || 0);
    const isOpen = val !== 0;

    return (
        <div 
            className={`math-node gate-node ${isOpen ? 'open' : 'closed'} ${className || ''}`}
            style={{
                minWidth: '120px',
                padding: '0',
                border: isOpen ? '1px solid rgba(74, 222, 128, 0.4)' : '1px solid var(--border-node)',
                boxShadow: isOpen ? '0 0 15px rgba(74, 222, 128, 0.1)' : 'none'
            }}
        >
            <NodeResizer minWidth={120} minHeight={110} isVisible={selected} lineStyle={{ border: 'none' }} handleStyle={{ width: 8, height: 8, borderRadius: '50%', background: 'transparent', border: 'none' }} />
            
            <div className="node-header" style={{ color: isOpen ? 'var(--accent-bright)' : 'var(--text-sub)' }}>
                <div style={{ display: 'flex', alignItems: 'center', flexGrow: 1, gap: '4px' }}>
                    <Icons.Gate />
                    <input
                        title="Rename node"
                        className="nodrag"
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'inherit',
                            fontSize: 'inherit',
                            fontWeight: 'inherit',
                            width: '100%',
                            padding: '0',
                            margin: '0',
                            outline: 'none',
                            cursor: 'text'
                        }}
                        value={data.label || 'Gate'}
                        onChange={(e) => updateNodeData(id, { label: e.target.value })}
                        onFocus={(e) => {
                            if (e.target.value === 'Gate') {
                                updateNodeData(id, { label: '' });
                            }
                        }}
                        onBlur={(e) => {
                            if (e.target.value === '') {
                                updateNodeData(id, { label: 'Gate' });
                            }
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                    />
                </div>
                <div style={{ 
                    fontSize: '0.55rem', 
                    background: isOpen ? 'var(--accent)' : 'var(--bg-input)',
                    color: isOpen ? '#fff' : 'inherit',
                    padding: '2px 6px',
                    borderRadius: '4px'
                }}>
                    {isOpen ? 'PASS' : 'BLOCK'}
                </div>
            </div>

            <DynamicHandles 
                nodeId={id} 
                handles={data.handles} 
                allowedTypes={['input']} 
                touchingEdges={data.touchingEdges}
            />
        </div>
    );
}


