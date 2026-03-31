import { useEffect, useRef, useState, memo, useCallback } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import useStore, { type AppState, type NodeData } from '../store/useStore';
import { Icons } from '../components/Icons';
import { NodeFrame } from '../components/NodeFrame';
import { SoundModePanel } from '../components/SoundModePanel';
import { getMathEngine } from '../utils/MathEngine';

export const SoundNode = memo(function SoundNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    const [isPlaying, setIsPlaying] = useState(false);
    const [showPanel, setShowPanel] = useState(false);
    const [panelPos, setPanelPos] = useState({ x: 0, y: 0 });
    
    const waveform = data.variant || 'sine';
    const displayFormula = data.formulaInput || data.formula || '\\sin(x)';

    const audioCtxRef = useRef<AudioContext | null>(null);
    const oscRef = useRef<OscillatorNode | null>(null);
    const gainRef = useRef<GainNode | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const customSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const customBufferRef = useRef<AudioBuffer | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    // Audio frequency / volume values
    const currentFreq = parseFloat(data.inputs?.['h-freq'] || data.value || '440');
    const currentVol = parseFloat(data.inputs?.['h-vol'] || '0.5');

    const updateCustomBuffer = useCallback(() => {
        if (!audioCtxRef.current) return;
        const ctx = audioCtxRef.current;
        const ce = getMathEngine();
        
        // Sample 2048 points for one cycle
        const size = 2048;
        const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
        const channelData = buffer.getChannelData(0);
        
        try {
            const expr = ce.parse(displayFormula);
            for (let i = 0; i < size; i++) {
                // x goes from 0 to 2*PI
                const x = (i / size) * 2 * Math.PI;
                ce.assign('x', x);
                const val = Number(expr.evaluate().valueOf());
                channelData[i] = isNaN(val) ? 0 : Math.max(-1, Math.min(1, val));
            }
        } catch (e) {
            console.error('Formula evaluation failed', e);
        }
        
        customBufferRef.current = buffer;
        
        // If playing custom mode, we need to restart/update source. 
        // Actually, easiest to just update playbackRate if context allows, 
        // but replacing the buffer requires a new source node.
    }, [displayFormula]);

    const stopCustomSource = () => {
        if (customSourceRef.current) {
            try { customSourceRef.current.stop(); } catch {}
            customSourceRef.current.disconnect();
            customSourceRef.current = null;
        }
    };

    const startCustomSource = () => {
        if (!audioCtxRef.current || !customBufferRef.current || !gainRef.current) return;
        stopCustomSource();
        
        const source = audioCtxRef.current.createBufferSource();
        source.buffer = customBufferRef.current;
        source.loop = true;
        
        // Calculate playbackRate: fundamental freq / (sampleRate/size)
        const baseFreq = audioCtxRef.current.sampleRate / customBufferRef.current.length;
        source.playbackRate.value = currentFreq / baseFreq;
        
        source.connect(gainRef.current);
        source.start();
        customSourceRef.current = source;
    };

    const updateAudioParams = useCallback(() => {
        if (!audioCtxRef.current || !gainRef.current) return;
        const ctx = audioCtxRef.current;

        // Volume
        const safeVol = isPlaying ? Math.max(0, Math.min(1, currentVol)) : 0;
        gainRef.current.gain.setTargetAtTime(safeVol, ctx.currentTime, 0.05);

        // Frequency/PlaybackRate
        if (waveform === 'custom') {
            if (!customSourceRef.current && isPlaying) {
                startCustomSource();
            } else if (customSourceRef.current) {
                const baseFreq = ctx.sampleRate / (customBufferRef.current?.length || 2048);
                customSourceRef.current.playbackRate.setTargetAtTime(currentFreq / baseFreq, ctx.currentTime, 0.05);
            }
        } else {
            stopCustomSource();
            if (oscRef.current) {
                oscRef.current.frequency.setTargetAtTime(currentFreq, ctx.currentTime, 0.05);
            }
        }
    }, [isPlaying, currentFreq, currentVol, waveform]);

    useEffect(() => {
        updateAudioParams();
    }, [updateAudioParams]);

    useEffect(() => {
        if (waveform === 'custom') updateCustomBuffer();
    }, [waveform, displayFormula, updateCustomBuffer]);

    const initAudio = () => {
        if (audioCtxRef.current) return;
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();
        audioCtxRef.current = ctx;

        const gain = ctx.createGain();
        const analyser = ctx.createAnalyser();
        gain.gain.setValueAtTime(0, ctx.currentTime);
        analyser.fftSize = 256;

        gain.connect(analyser);
        analyser.connect(ctx.destination);
        
        gainRef.current = gain;
        analyserRef.current = analyser;

        if (waveform !== 'custom') {
            const osc = ctx.createOscillator();
            osc.type = waveform as OscillatorType;
            osc.connect(gain);
            osc.start();
            oscRef.current = osc;
        } else {
            updateCustomBuffer();
            if (isPlaying) startCustomSource();
        }

        startVisualizer();
    };

    const handleModeSelect = (mode: string) => {
        updateNodeData(id, { variant: mode as any });
        if (audioCtxRef.current) {
            if (mode === 'custom') {
                if (oscRef.current) {
                    oscRef.current.stop();
                    oscRef.current.disconnect();
                    oscRef.current = null;
                }
                updateCustomBuffer();
                if (isPlaying) startCustomSource();
            } else {
                stopCustomSource();
                if (!oscRef.current) {
                    const osc = audioCtxRef.current.createOscillator();
                    osc.connect(gainRef.current!);
                    osc.start();
                    oscRef.current = osc;
                }
                oscRef.current.type = mode as OscillatorType;
            }
        }
    };

    const togglePlayback = async () => {
        if (!audioCtxRef.current) initAudio();
        if (audioCtxRef.current?.state === 'suspended') await audioCtxRef.current.resume();
        setIsPlaying(!isPlaying);
    };

    const startVisualizer = () => {
        if (!canvasRef.current || !analyserRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const analyser = analyserRef.current;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const draw = () => {
            animationFrameRef.current = requestAnimationFrame(draw);
            analyser.getByteTimeDomainData(dataArray);
            if (!ctx) return;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#4ade80';
            ctx.beginPath();

            const step = canvas.width / dataArray.length;
            for (let i = 0; i < dataArray.length; i++) {
                const y = (dataArray[i] / 128.0) * (canvas.height / 2);
                if (i === 0) ctx.moveTo(i * step, y);
                else ctx.lineTo(i * step, y);
            }
            ctx.stroke();
        };
        draw();
    };

    useEffect(() => {
        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            if (audioCtxRef.current) audioCtxRef.current.close();
        };
    }, []);

    return (
        <NodeFrame 
            id={id} data={data} selected={selected} 
            icon={<Icons.Sound />} defaultLabel="Sound" 
            className="sound-node"
        >
            {showPanel && (
                <SoundModePanel 
                    currentMode={waveform} 
                    onSelect={handleModeSelect} 
                    onClose={() => setShowPanel(false)} 
                    position={panelPos} 
                />
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '4px' }}>
                <canvas ref={canvasRef} width={200} height={60} style={{ width: '100%', height: '60px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px' }} />
                
                <div style={{ display: 'flex', gap: '4px' }}>
                    <button 
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            setPanelPos({ x: e.clientX, y: e.clientY });
                            setShowPanel(true);
                        }}
                        className="nodrag sound-mode-btn"
                    >
                        {waveform.toUpperCase()} ▾
                    </button>
                    <button 
                        onClick={togglePlayback} 
                        className={`nodrag play-btn ${isPlaying ? 'playing' : ''}`}
                    >
                        {isPlaying ? 'STOP' : 'PLAY'}
                    </button>
                </div>

                {waveform === 'custom' && (
                    <div className="custom-formula-input" style={{ opacity: data.formulaInput ? 0.7 : 1 }}>
                        <span style={{ fontSize: '0.6rem', color: '#a18cd1', fontWeight: 'bold' }}>f(x) =</span>
                        <input 
                            className="nodrag"
                            value={displayFormula} 
                            onChange={(e) => updateNodeData(id, { formula: e.target.value })}
                            readOnly={!!data.formulaInput}
                            placeholder="sin(x)"
                            title={data.formulaInput ? "Using external formula input" : ""}
                        />
                    </div>
                )}

                <div className="sound-stats">
                    <span>{currentFreq.toFixed(1)} Hz</span>
                    <span>{(currentVol * 100).toFixed(0)}%</span>
                </div>
            </div>

            <style>{`
                .sound-node { border-top: 2px solid #4ade80 !important; min-width: 180px; }
                .sound-mode-btn {
                    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
                    color: var(--text-main); font-size: 0.65rem; font-weight: bold;
                    padding: 4px 8px; borderRadius: 4px; cursor: pointer; flex: 1;
                }
                .play-btn {
                    background: rgba(74, 222, 128, 0.2); border: 1px solid #4ade80;
                    color: #4ade80; font-size: 0.7rem; font-weight: bold;
                    padding: 4px 12px; borderRadius: 4px; cursor: pointer;
                }
                .play-btn.playing { background: rgba(255, 71, 87, 0.2); border-color: #ff4757; color: #ff4757; }
                .sound-stats { display: flex; justifyContent: space-between; font-size: 0.6rem; color: var(--text-sub); opacity: 0.6; }
                .custom-formula-input {
                    display: flex; gap: 4px; align-items: center; background: rgba(0,0,0,0.2);
                    padding: 2px 8px; border-radius: 4px; border: 1px solid rgba(161, 140, 209, 0.3);
                }
                .custom-formula-input input {
                    background: transparent; border: none; color: #a18cd1; font-family: monospace;
                    font-size: 0.75rem; outline: none; width: 100%;
                }
            `}</style>
        </NodeFrame>
    );
});
