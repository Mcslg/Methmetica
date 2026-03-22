import React, { useEffect } from 'react';
import { type NodeProps, type Node, NodeResizer } from '@xyflow/react';
import useStore, { type NodeData, type AppState } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';
import { Icons } from '../components/Icons';

export function SliderNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    const executeNode = useStore((state: AppState) => state.executeNode);

    const min = data.min !== undefined ? Number(data.min) : 0;
    const max = data.max !== undefined ? Number(data.max) : 10;
    const step = data.step !== undefined ? Number(data.step) : 0.1;
    const value = data.value !== undefined ? Number(data.value) : 5;

    useEffect(() => {
        // Ensure initial output is set
        if (data.outputs?.['h-out'] === undefined) {
             updateNodeData(id, { 
                 value: String(value),
                 outputs: { 'h-out': String(value) }
             });
        }
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVal = Number(e.target.value);
        updateNodeData(id, { 
            value: String(newVal),
            outputs: { 'h-out': String(newVal) }
        });
        executeNode(id);
    };

    const handleSettingsChange = (field: string, val: string) => {
        const numVal = Number(val);
        if (isNaN(numVal)) return;
        updateNodeData(id, { [field]: numVal });
    };

    return (
        <div className="math-node op-node slider-node" 
             style={{ 
                 width: '100%', 
                 height: '100%', 
                 display: 'flex', 
                 flexDirection: 'column',
                 overflow: 'visible',
                 boxSizing: 'border-box'
             }}>
            <NodeResizer minWidth={180} minHeight={100} isVisible={selected} lineStyle={{ border: 'none' }} handleStyle={{ width: 8, height: 8, borderRadius: '50%', background: '#4facfe' }} />
            <DynamicHandles
                nodeId={id}
                handles={data.handles || [{ id: 'h-out', type: 'output', position: 'right', offset: 50, label: 'val' }]}
                locked={true}
                allowedTypes={['output']}
            />
            <div className="node-header">
                <span style={{ display: 'flex', alignItems: 'center' }}><Icons.Slider /> Slider</span>
                <span style={{ fontSize: '0.9rem', color: 'var(--accent-bright)', fontWeight: 'bold' }}>{value.toFixed(2)}</span>
            </div>

            <div className="node-content" style={{ flexGrow: 1, padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input 
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={handleChange}
                    className="nodrag"
                    style={{ width: '100%', cursor: 'pointer' }}
                />
                
                <div style={{ display: 'flex', gap: '4px', fontSize: '0.6rem', color: '#666' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <label>MIN</label>
                        <input 
                            type="text" 
                            defaultValue={String(min)} 
                            onBlur={(e) => handleSettingsChange('min', e.target.value)}
                            className="nodrag"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)', padding: '2px 4px', borderRadius: '4px', width: '100%', fontFamily: 'inherit', fontSize: '0.7rem', outline: 'none' }}
                        />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <label>MAX</label>
                        <input 
                            type="text" 
                            defaultValue={String(max)} 
                            onBlur={(e) => handleSettingsChange('max', e.target.value)}
                            className="nodrag"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)', padding: '2px 4px', borderRadius: '4px', width: '100%', fontFamily: 'inherit', fontSize: '0.7rem', outline: 'none' }}
                        />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <label>STEP</label>
                        <input 
                            type="text" 
                            defaultValue={String(step)} 
                            onBlur={(e) => handleSettingsChange('step', e.target.value)}
                            className="nodrag"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)', padding: '2px 4px', borderRadius: '4px', width: '100%', fontFamily: 'inherit', fontSize: '0.7rem', outline: 'none' }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
