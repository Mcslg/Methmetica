import React, { useEffect } from 'react';
import { NodeResizer } from '@xyflow/react';
import useStore, { type AppState } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';
import { Icons } from '../components/Icons';

export function SliderNode({ id, data, selected, className }: any) {
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    const executeNode = useStore((state: AppState) => state.executeNode);

    const name = data.nodeName || 'x';
    const min = data.min !== undefined ? Number(data.min) : 0;
    const max = data.max !== undefined ? Number(data.max) : 10;
    const step = data.step !== undefined ? Number(data.step) : 0.1;
    const value = data.value !== undefined ? Number(data.value) : 5;

    useEffect(() => {
        // Ensure initial output is set
        if (data.outputs?.['h-out'] === undefined) {
             updateNodeData(id, { 
                 value: String(value),
                 nodeName: name,
                 outputs: { 'h-out': String(value) }
             });
        }
    }, [id, value, name, data.outputs, updateNodeData]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVal = Number(e.target.value);
        updateNodeData(id, { 
            value: String(newVal),
            outputs: { 'h-out': String(newVal) }
        });
        executeNode(id);
    };

    const handleSettingsChange = (field: string, val: string) => {
        if (field === 'nodeName') {
            updateNodeData(id, { nodeName: val });
            return;
        }
        const numVal = Number(val);
        if (isNaN(numVal)) return;
        updateNodeData(id, { [field]: numVal });
    };

    return (
        <div className={`math-node op-node slider-node ${className || ''}`} 
             style={{ 
                 width: '100%', 
                 height: '100%', 
                 display: 'flex', 
                 flexDirection: 'column',
                 overflow: 'visible',
                 boxSizing: 'border-box'
             }}>
            <NodeResizer minWidth={180} minHeight={110} isVisible={selected} lineStyle={{ border: 'none' }} handleStyle={{ width: 8, height: 8, borderRadius: '50%', background: 'transparent', border: 'none' }} />
            <DynamicHandles
                nodeId={id}
                handles={data.handles || [{ id: 'h-out', type: 'output', position: 'right', offset: 50, label: name }]}
                locked={true}
                allowedTypes={['output']}
            />
            
            <div className="node-header" style={{ padding: '4px 8px', minHeight: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', flexGrow: 1, gap: '4px' }}>
                    <Icons.Slider />
                    <input
                        title="Rename variable"
                        className="nodrag"
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--accent-bright)',
                            fontSize: '0.65rem',
                            fontWeight: 'bold',
                            width: '40px',
                            minWidth: '20px',
                            padding: '0',
                            margin: '0',
                            outline: 'none',
                            cursor: 'text'
                        }}
                        value={name}
                        onChange={(e) => handleSettingsChange('nodeName', e.target.value)}
                        onMouseDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        placeholder="x"
                    />
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--accent-bright)', fontWeight: 'bold' }}>
                    {value.toFixed(step < 1 ? String(step).split('.')[1]?.length || 1 : 0)}
                </span>
            </div>

            <div className="node-content" style={{ flexGrow: 1, padding: '8px 8px 4px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>

                {/* Slider Component */}
                <div style={{ padding: '0px', display: 'flex', alignItems: 'center' }}>
                    <input 
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={value}
                        onChange={handleChange}
                        className="nodrag premium-slider"
                        style={{ width: '100%', cursor: 'pointer', margin: 0, padding: 0 }}
                    />
                </div>
                
                {/* Range settings Row */}
                <div className="slider-settings-row" style={{ display: 'flex', gap: '4px', fontSize: '0.45rem', color: 'var(--text-sub)', marginTop: '-1px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <label style={{ fontSize: '0.38rem', opacity: 0.3, marginBottom: '0px', letterSpacing: '0.05em' }}>MIN</label>
                        <input type="text" defaultValue={min} onBlur={(e) => handleSettingsChange('min', e.target.value)} className="nodrag settings-input" style={{ fontSize: '0.5rem', padding: '0 2px', height: '12px' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <label style={{ fontSize: '0.38rem', opacity: 0.3, marginBottom: '0px', letterSpacing: '0.05em' }}>MAX</label>
                        <input type="text" defaultValue={max} onBlur={(e) => handleSettingsChange('max', e.target.value)} className="nodrag settings-input" style={{ fontSize: '0.5rem', padding: '0 2px', height: '12px' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <label style={{ fontSize: '0.38rem', opacity: 0.3, marginBottom: '0px', letterSpacing: '0.05em' }}>STEP</label>
                        <input type="text" defaultValue={step} onBlur={(e) => handleSettingsChange('step', e.target.value)} className="nodrag settings-input" style={{ fontSize: '0.5rem', padding: '0 2px', height: '12px' }} />
                    </div>
                </div>
            </div>

            <style>{`
                .premium-slider {
                    -webkit-appearance: none;
                    height: 4px;
                    background: linear-gradient(to right, var(--accent-bright) 0%, var(--border-node) 0%); /* Dynamic fill would be nice, but simple for now */
                    background: var(--border-node);
                    border-radius: 2px;
                    outline: none;
                }
                .premium-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    width: 12px;
                    height: 12px;
                    background: var(--accent-bright);
                    border: 2px solid #fff;
                    border-radius: 50%;
                    cursor: pointer;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                    transition: transform 0.1s, box-shadow 0.1s;
                }
                .premium-slider::-webkit-slider-thumb:hover {
                    transform: scale(1.1);
                    box-shadow: 0 4px 10px rgba(0,0,0,0.3);
                }
                .settings-input {
                    background: var(--bg-input);
                    border: 1px solid var(--border-input);
                    color: var(--text-main);
                    padding: 2px 4px;
                    border-radius: 4px;
                    width: 100%;
                    font-size: 0.65rem;
                    outline: none;
                    text-align: center;
                }
                .settings-input:focus {
                    border-color: var(--accent-sub);
                }
                .name-pill-input::placeholder {
                    color: var(--accent-sub);
                    opacity: 0.5;
                }
            `}</style>
        </div>
    );
}
