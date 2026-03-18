import React, { useEffect, useRef, useState, useCallback } from 'react';
import { type NodeProps, type Node, NodeResizer } from '@xyflow/react';
import useStore, { type NodeData, type AppState } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';
import { getMathEngine } from '../utils/MathEngine';
import 'mathlive';

declare global {
    namespace JSX {
        interface IntrinsicElements {
            'math-field': any;
        }
    }
}

export function GraphNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    
    // Refs
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const mfRef = useRef<any>(null);
    const engineRef = useRef<any>(null);

    // States
    const [isShiftPressed, setIsShiftPressed] = useState(false);
    const [criticalPoints, setCriticalPoints] = useState<any[]>([]);
    const [engineReady, setEngineReady] = useState(false);
    const [view, setView] = useState({ x: 0, y: 0, scale: 40 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const useExternalFormula = !!data.useExternalFormula;
    const formulaToParse = useExternalFormula ? (data.formulaInput || '') : (data.formula || '');

    // 1. Shift Key Listener
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Shift') setIsShiftPressed(e.type === 'keydown');
        };
        window.addEventListener('keydown', handleKey);
        window.addEventListener('keyup', handleKey);
        return () => {
            window.removeEventListener('keydown', handleKey);
            window.removeEventListener('keyup', handleKey);
        };
    }, []);

    // 2. Load Math Engine
    useEffect(() => {
        getMathEngine().then((eng) => {
            engineRef.current = eng;
            setEngineReady(true);
        });
    }, []);

    // 3. Find critical points using numerical scanning (reliable, view-aware)
    useEffect(() => {
        if (!engineReady || !formulaToParse) {
            setCriticalPoints([]);
            return;
        }

        const findPoints = () => {
            try {
                const nerd = engineRef.current;
                const formulas = formulaToParse.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean);
                const points: any[] = [];

                // Scan range: use a fixed wide range
                const xMin = -20, xMax = 20, steps = 2000;
                const dx = (xMax - xMin) / steps;

                // Build numeric functions
                const fns: (((x: number) => number) | null)[] = formulas.map((f: string) => {
                    try {
                        const expr = nerd.convertFromLaTeX(f);
                        const vars = expr.variables();
                        if (vars.length > 1) return null;
                        const v = vars[0] || 'x';
                        return expr.buildFunction([v]);
                    } catch(e) { return null; }
                });

                // 1. Roots & Extrema per function
                const EPS = 1e-6;
                const DEDUP_DIST = 0.08; // Cross-type dedup: merge any points at same x,y
                const dedupe = (newPt: any, existing: any[]) =>
                    existing.some(p => Math.abs(p.x - newPt.x) < DEDUP_DIST && Math.abs(p.y - newPt.y) < DEDUP_DIST);

                fns.forEach((fn, idx) => {
                    if (!fn) return;
                    const safe = (x: number) => { try { const v = Number(fn(x)); return isFinite(v) ? v : NaN; } catch(e) { return NaN; } };

                    let prevY = safe(xMin);
                    let prevSlope = NaN;

                    for (let i = 1; i <= steps; i++) {
                        const x = xMin + i * dx;
                        const xPrev = x - dx;
                        const y = safe(x);
                        if (isNaN(y) || isNaN(prevY)) { prevY = y; prevSlope = NaN; continue; }

                        // Root: sign cross OR exact zero
                        if (prevY * y < 0) {
                            const xRoot = xPrev - prevY * (dx / (y - prevY));
                            const pt = { x: xRoot, y: 0, label: '', type: 'root', colorIdx: idx };
                            if (!dedupe(pt, points)) points.push(pt);
                        } else if (Math.abs(y) < EPS) {
                            const pt = { x, y: 0, label: '', type: 'root', colorIdx: idx };
                            if (!dedupe(pt, points)) points.push(pt);
                        }

                        // Extrema: slope direction change
                        const slope = y - prevY;
                        if (!isNaN(prevSlope) && prevSlope * slope < 0) {
                            const xEx = xPrev;
                            const yEx = safe(xEx);
                            if (!isNaN(yEx)) {
                                const pt = { x: xEx, y: yEx, label: '', type: 'extrema', colorIdx: idx };
                                if (!dedupe(pt, points)) points.push(pt);
                            }
                        }
                        prevY = y;
                        prevSlope = slope;
                    }
                });

                // 2. Intersections between pairs
                for (let i = 0; i < fns.length; i++) {
                    for (let j = i + 1; j < fns.length; j++) {
                        const fi = fns[i]; const fj = fns[j];
                        if (!fi || !fj) continue;
                        const safeI = (x: number) => { try { return Number(fi(x)); } catch(e) { return NaN; } };
                        const safeJ = (x: number) => { try { return Number(fj(x)); } catch(e) { return NaN; } };
                        
                        let prevDiff = safeI(xMin) - safeJ(xMin);
                        for (let k = 1; k <= steps; k++) {
                            const x = xMin + k * dx;
                            const diff = safeI(x) - safeJ(x);

                            // Sign cross OR exact zero→ both indicate intersection
                            if (!isNaN(prevDiff) && !isNaN(diff)) {
                                let xInt: number | null = null;
                                if (prevDiff * diff < 0) {
                                    // Linear interpolation for sign change
                                    xInt = (x - dx) - prevDiff * (dx / (diff - prevDiff));
                                } else if (Math.abs(diff) < EPS) {
                                    xInt = x;
                                }

                                if (xInt !== null) {
                                    const yRes = safeI(xInt);
                                    if (!isNaN(yRes)) {
                                        const pt = { x: xInt, y: yRes, label: '', type: 'intersection', colorIdx: i };
                                        if (!dedupe(pt, points)) points.push(pt);
                                    }
                                }
                            }
                            prevDiff = diff;
                        }
                    }
                }

                console.log('[Graph] Found points:', points.length);
                setCriticalPoints(points);
            } catch(e) {
                console.error('[Graph] findPoints error:', e);
            }
        };

        const timer = setTimeout(findPoints, 200);
        return () => clearTimeout(timer);

    }, [formulaToParse, engineReady, view]);

    // 4. Core Plotting Logic
    const drawGraph = useCallback(() => {
        const canvas = canvasRef.current;
        const nerd = engineRef.current;
        if (!canvas || !nerd) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const clientWidth  = canvas.clientWidth  || canvas.parentElement?.clientWidth  || 0;
        const clientHeight = canvas.clientHeight || canvas.parentElement?.clientHeight || 0;
        if (clientWidth === 0 || clientHeight === 0) return;

        canvas.width = clientWidth * dpr;
        canvas.height = clientHeight * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, clientWidth, clientHeight);

        const cx = clientWidth / 2 - view.x;
        const cy = clientHeight / 2 - view.y;
        const scale = view.scale;
        const colors = ['#4facfe', '#f43f5e', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

        // Grid & Axes
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const leftUnits = Math.floor(-cx / scale);
        const rightUnits = Math.ceil((clientWidth - cx) / scale);
        for (let i = leftUnits; i <= rightUnits; i++) {
            ctx.moveTo(cx + i * scale, 0); ctx.lineTo(cx + i * scale, clientHeight);
        }
        const topUnits = Math.floor(-cy / scale);
        const bottomUnits = Math.ceil((clientHeight - cy) / scale);
        for (let i = topUnits; i <= bottomUnits; i++) {
            ctx.moveTo(0, cy + i * scale); ctx.lineTo(clientWidth, cy + i * scale);
        }
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (cy >= 0 && cy <= clientHeight) { ctx.moveTo(0, cy); ctx.lineTo(clientWidth, cy); }
        if (cx >= 0 && cx <= clientWidth)  { ctx.moveTo(cx, 0); ctx.lineTo(cx, clientHeight); }
        ctx.stroke();

        if (!formulaToParse) return;

        const formulas = formulaToParse.split(/[,;]/).map(s => s.trim()).filter(Boolean);

        const drawArrowhead = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, size: number) => {
            const angle = Math.atan2(toY - fromY, toX - fromX);
            ctx.beginPath();
            ctx.moveTo(toX, toY);
            ctx.lineTo(toX - size * Math.cos(angle - Math.PI / 6), toY - size * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(toX - size * Math.cos(angle + Math.PI / 6), toY - size * Math.sin(angle + Math.PI / 6));
            ctx.closePath();
            ctx.fill();
        };

        formulas.forEach((formula, index) => {
            try {
                const expression = nerd.convertFromLaTeX(formula);
                const symbol = expression.symbol;

                // Constant Vector [vx, vy]
                if (symbol.elements && symbol.elements.length >= 2) {
                    const vx = Number(symbol.elements[0].evaluate().toString());
                    const vy = Number(symbol.elements[1].evaluate().toString());
                    if (!isNaN(vx) && !isNaN(vy)) {
                        const color = colors[index % colors.length];
                        ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 3;
                        const endX = cx + vx * scale; const endY = cy - vy * scale;
                        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(endX, endY); ctx.stroke();
                        drawArrowhead(ctx, cx, cy, endX, endY, 12);
                    }
                    return;
                }

                // Normal Function
                const vars = expression.variables();
                if (vars.length > 1) return;
                const mainVar = vars[0] || 'x';
                const f = expression.buildFunction([mainVar]);

                ctx.strokeStyle = colors[index % colors.length];
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                let firstPoint = true;
                for (let px = 0; px <= clientWidth; px += 1) {
                    const mathX = (px - cx) / scale;
                    try {
                        const mathY = Number(f(mathX));
                        if (!isFinite(mathY) || Math.abs(mathY) > 1e6) { firstPoint = true; continue; }
                        const py = cy - mathY * scale;
                        if (firstPoint) { ctx.moveTo(px, py); firstPoint = false; }
                        else { ctx.lineTo(px, py); }
                    } catch { firstPoint = true; }
                }
                ctx.stroke();
            } catch (e) {}
        });

        // 5. Draw Critical Points with labels
        criticalPoints.forEach((p) => {
            const px = cx + p.x * scale;
            const py = cy - p.y * scale;
            if (px < 0 || px > clientWidth || py < 0 || py > clientHeight) return;

            const color = colors[p.colorIdx % colors.length];
            ctx.fillStyle = color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

            ctx.font = 'bold 10px Outfit'; ctx.fillStyle = '#fff';
            ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4;
            
            let labelText = '';
            if (isShiftPressed) {
                labelText = p.label.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1/$2)')
                                 .replace(/\\sqrt\{([^}]*)\}/g, '√$1')
                                 .replace(/\\pi/g, 'π').replace(/[{}]/g, '');
            } else {
                labelText = `(${p.x.toFixed(2)}, ${p.y.toFixed(2)})`;
            }
            ctx.fillText(labelText, px + 8, py - 8);
            ctx.shadowBlur = 0;
        });

    }, [view, formulaToParse, engineReady, criticalPoints, isShiftPressed]);

    // Cleanup & Lifecycle
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas?.parentElement) return;
        const ro = new ResizeObserver(() => { drawGraph(); });
        ro.observe(canvas.parentElement);
        return () => ro.disconnect();
    }, [drawGraph]);

    useEffect(() => { drawGraph(); }, [drawGraph]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const onWheelNative = (e: WheelEvent) => {
            e.preventDefault(); e.stopPropagation();
            const delta = Math.exp(-e.deltaY * 0.0015);
            setView(v => {
                const newScale = Math.max(1, Math.min(v.scale * delta, 2000));
                if (newScale === v.scale) return v;
                const rect = el.getBoundingClientRect();
                const mouseX = e.clientX - rect.left; const mouseY = e.clientY - rect.top;
                const mathX = (mouseX - (rect.width/2 - v.x)) / v.scale;
                const mathY = ((rect.height/2 - v.y) - mouseY) / v.scale;
                return {
                    scale: newScale,
                    x: (rect.width/2) - mouseX + (mathX * newScale),
                    y: (rect.height/2) - mouseY - (mathY * newScale)
                };
            });
        };
        el.addEventListener('wheel', onWheelNative, { passive: false });
        return () => el.removeEventListener('wheel', onWheelNative);
    }, []);

    const handlePointerDown = (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        setIsDragging(true); setDragStart({ x: e.clientX, y: e.clientY });
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStart.x; const dy = e.clientY - dragStart.y;
        setView(v => ({ ...v, x: v.x - dx, y: v.y - dy }));
        setDragStart({ x: e.clientX, y: e.clientY });
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        setIsDragging(false); (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    };

    return (
        <div className="math-node op-node graph-node" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'visible', boxSizing: 'border-box' }}>
            <NodeResizer minWidth={250} minHeight={200} isVisible={selected} lineStyle={{ border: 'none' }} handleStyle={{ width: 8, height: 8, borderRadius: '50%', background: '#4facfe' }} />
            <DynamicHandles nodeId={id} handles={data.handles} locked={true} allowedTypes={['input', 'output']} />
            
            <div className="nowheel" style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflow: 'hidden', borderRadius: 'inherit' }}>
            <div className="node-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.4)', zIndex: 2 }}>
                <span>Graph Plotter</span>
                <button onClick={() => updateNodeData(id, { useExternalFormula: !useExternalFormula })} className="variant-toggle" style={{ fontSize: '0.5rem', padding: '2px 4px', background: useExternalFormula ? 'rgba(79, 172, 254, 0.3)' : 'transparent' }}>EXT</button>
            </div>

            <div style={{ padding: '8px', background: 'rgba(0,0,0,0.3)', zIndex: 2 }}>
                {useExternalFormula ? (
                    <div style={{ width: '100%', background: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '4px', fontSize: '0.9rem', color: data.formulaInput ? '#fff' : '#444', minHeight: '28px', border: '1px dashed rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {data.formulaInput || 'Wait for f(x)...'}
                    </div>
                ) : (
                    <math-field ref={mfRef} class="nodrag formula-input" style={{ fontSize: '1rem', width: '100%', background: 'rgba(0,0,0,0.2)', padding: '2px', borderRadius: '4px' }}>
                        {data.formula || ''}
                    </math-field>
                )}
            </div>

            <div ref={containerRef} className="nodrag nowheel" style={{ flexGrow: 1, position: 'relative', cursor: isDragging ? 'grabbing' : 'grab' }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}>
                <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
                <div style={{ position: 'absolute', bottom: 4, right: 8, fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)', pointerEvents: 'none', textAlign: 'right' }}>
                    Scale: {view.scale.toFixed(1)}x <br />
                    Pan: {(view.x / view.scale).toFixed(1)}, {(-view.y / view.scale).toFixed(1)}
                </div>
                <div className="graph-controls" style={{ position: 'absolute', top: 8, right: 8, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <button onClick={() => setView(v => ({...v, scale: Math.max(1, v.scale * 1.2)}))}>+</button>
                    <button onClick={() => setView(v => ({...v, scale: Math.max(1, v.scale / 1.2)}))}>−</button>
                    <button onClick={() => setView({x:0, y:0, scale:40})} style={{ fontSize: '0.5rem', padding: '2px 4px' }}>RESET</button>
                </div>
            </div>
            
            <style>{`
                .graph-controls button { width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; border-radius: 4px; cursor: pointer; font-size: 0.8rem; }
                .graph-controls button:hover { background: rgba(255,255,255,0.2); }
                .variant-toggle { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #ccc; border-radius: 4px; cursor: pointer; transition: all 0.2s; }
                .variant-toggle:hover { background: rgba(255,255,255,0.2); color: #fff; }
            `}</style>
            </div>{/* end inner overflow wrapper */}
        </div>
    );
}
