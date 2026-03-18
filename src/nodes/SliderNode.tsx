import React, { useEffect, useRef } from 'react';
import { type NodeProps, type Node, NodeResizer } from '@xyflow/react';
import useStore, { type NodeData, type AppState } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';

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
                 value: value,
                 outputs: { 'h-out': value }
             });
        }
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVal = Number(e.target.value);
        updateNodeData(id, { 
            value: newVal,
            outputs: { 'h-out': newVal }
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
                <span>Slider</span>
                <span style={{ fontSize: '0.8rem', color: '#4facfe', fontWeight: 'bold' }}>{value.toFixed(2)}</span>
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
                            defaultValue={min} 
                            onBlur={(e) => handleSettingsChange('min', e.target.value)}
                            className="nodrag"
                            style={{ background: 'rgba(0,0,0,0.2)', border: 'none', color: '#ccc', padding: '2px', borderRadius: '2px' }}
                        />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <label>MAX</label>
                        <input 
                            type="text" 
                            defaultValue={max} 
                            onBlur={(e) => handleSettingsChange('max', e.target.value)}
                            className="nodrag"
                            style={{ background: 'rgba(0,0,0,0.2)', border: 'none', color: '#ccc', padding: '2px', borderRadius: '2px' }}
                        />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <label>STEP</label>
                        <input 
                            type="text" 
                            defaultValue={step} 
                            onBlur={(e) => handleSettingsChange('step', e.target.value)}
                            className="nodrag"
                            style={{ background: 'rgba(0,0,0,0.2)', border: 'none', color: '#ccc', padding: '2px', borderRadius: '2px' }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
