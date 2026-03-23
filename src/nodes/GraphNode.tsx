import React, { useEffect, useRef, useState, useCallback } from 'react';
import { type NodeProps, type Node, NodeResizer } from '@xyflow/react';
import useStore, { type NodeData, type AppState } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';
import { getMathEngine } from '../utils/MathEngine';
import { Icons } from '../components/Icons';
import 'mathlive';



export function GraphNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);

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
            const curWidth = parentNode.width ?? parentNode.measured?.width ?? 300;
            const curHeight = parentNode.height ?? parentNode.measured?.height ?? 260;
            
            useStore.setState({
                nodes: store.nodes.map(n => n.id === id ? {
                    ...n,
                    width: curWidth,
                    height: Math.max(200, curHeight - 40),
                    data: { ...n.data, slots: newSlots }
                } : n)
            });
        }
    };

    // Refs
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const mfRef = useRef<any>(null);

    // States
    const [isShiftPressed, setIsShiftPressed] = useState(false);
    const [criticalPoints, setCriticalPoints] = useState<any[]>([]);
    const [view, setView] = useState({ x: 0, y: 0, scale: 40 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    // The formula we actually parse: prefer external (magnetic/connected), fallback to manual
    const formulaInput = data.formulaInput;
    const manualFormula = data.formula || '';
    // If we have formulaInput (from magnetic/connected node), always use it
    const formulaToParse = formulaInput || manualFormula;
    const isReceivingExternal = !!formulaInput;

    // Touching edges (magnetic snapping visual feedback)
    const touchingEdges = data.touchingEdges || {};
    const touchingClasses = Object.entries(touchingEdges)
        .filter(([, touching]) => touching)
        .map(([edge]) => `edge-touch-${edge}`)
        .join(' ');

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

    // 2. Sync MathField with stored formula
    useEffect(() => {
        const mf = mfRef.current;
        if (!mf || isReceivingExternal) return;
        if (mf.value !== manualFormula) {
            mf.value = manualFormula;
        }
        const handleInput = (e: any) => updateNodeData(id, { formula: e.target.value });
        mf.addEventListener('input', handleInput);
        return () => mf.removeEventListener('input', handleInput);
    }, [id, manualFormula, isReceivingExternal, updateNodeData]);

    // 3. Evaluate function numerically - two-tier approach
    const evalFn = useCallback((formula: string): ((x: number) => number) | null => {
        try {
            const ce = getMathEngine();
            let expr: any = ce.parse(formula);
            // Unwrap equation: y = x^2 → x^2
            if (expr.head === 'Equal') expr = expr.op2;

            // Tier 1: compile().run() — CortexJS v0.55 API
            try {
                const compiled: any = expr.compile?.();
                if (compiled && typeof compiled.run === 'function') {
                    const t1 = compiled.run({ x: 0 });
                    const t2 = compiled.run({ x: 2 });
                    // Verify it's actually using x (t1 !== t2 for non-constant functions)
                    if (typeof t1 === 'number' && typeof t2 === 'number' && t1 !== t2) {
                        return (x: number) => {
                            const v = compiled.run({ x });
                            return typeof v === 'number' ? v : Number(v);
                        };
                    }
                    // Accept constants too (horizontal lines)
                    if (typeof t1 === 'number' && isFinite(t1)) {
                        return (_x: number) => t1;
                    }
                }
            } catch (e) {}
        } catch (e) {}

        // Tier 2: pure JS eval with full LaTeX → JS conversion
        try {
            let jsExpr = formula
                .replace(/\\cdot\s*/g, '*').replace(/\\times\s*/g, '*')
                .replace(/\\sin\s*/g, 'Math.sin').replace(/\\cos\s*/g, 'Math.cos')
                .replace(/\\tan\s*/g, 'Math.tan').replace(/\\ln\s*/g, 'Math.log')
                .replace(/\\log\s*/g, 'Math.log10').replace(/\\exp\s*/g, 'Math.exp')
                .replace(/\\sqrt\{([^}]+)\}/g, 'Math.sqrt($1)')
                .replace(/\\pi/g, 'Math.PI').replace(/\\e\b/g, 'Math.E')
                .replace(/\^/g, '**')
                .replace(/[{}\\]/g, '');

            // Implicit multiplication: 2x → 2*x, 2( → 2*(, )x → )*x, )( → )*(
            jsExpr = jsExpr
                .replace(/(\d)\s*(x\b)/g, '$1*$2')                // 2x → 2*x
                .replace(/(\d)\s*(Math\.)/g, '$1*$2')              // 2Math.sin → 2*Math.sin
                .replace(/\)\s*\(/g, ')*(')                        // (a)(b) → (a)*(b)
                .replace(/(\d)\s*\(/g, '$1*(')                     // 2(x+1) → 2*(x+1)
                .replace(/\)\s*(x\b)/g, ')*$1');                   // )x → )*x

            // eslint-disable-next-line no-new-func
            const fn = new Function('x', `'use strict'; try { return +(${jsExpr}); } catch(e) { return NaN; }`);
            // Validate: test at two different x values
            const r1 = fn(0), r2 = fn(1);
            if (typeof r1 === 'number' || typeof r2 === 'number') {
                return fn as (x: number) => number;
            }
        } catch (e) {}

        console.warn('[Graph] Could not build evaluator for formula:', formula);
        return null;
    }, []);

    // 4. Core Plotting
    const drawGraph = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

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

        // Grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
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

        // Axes
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (cy >= 0 && cy <= clientHeight) { ctx.moveTo(0, cy); ctx.lineTo(clientWidth, cy); }
        if (cx >= 0 && cx <= clientWidth)  { ctx.moveTo(cx, 0); ctx.lineTo(cx, clientHeight); }
        ctx.stroke();

        // Axis tick labels
        ctx.font = '9px var(--font-main), sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.textAlign = 'center';
        for (let i = leftUnits; i <= rightUnits; i++) {
            if (i === 0) continue;
            const px = cx + i * scale;
            ctx.fillText(String(i), px, Math.min(cy + 12, clientHeight - 4));
        }
        ctx.textAlign = 'right';
        for (let i = topUnits; i <= bottomUnits; i++) {
            if (i === 0) continue;
            const py = cy + i * scale;
            ctx.fillText(String(-i), Math.max(cx - 4, 20), py + 3);
        }

        if (!formulaToParse) {
            // Draw placeholder
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.font = '12px var(--font-main), sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Enter a formula above', clientWidth / 2, clientHeight / 2);
            return;
        }

        const formulas = formulaToParse.split(/[,;]/).map(s => s.trim()).filter(Boolean);

        formulas.forEach((formula, index) => {
            const fn = evalFn(formula);
            if (!fn) {
                console.warn('[Graph] Could not compile formula:', formula);
                return;
            }

            ctx.strokeStyle = colors[index % colors.length];
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            let firstPoint = true;
            for (let px = 0; px <= clientWidth; px += 0.75) {
                const mathX = (px - cx) / scale;
                try {
                    const mathY = fn(mathX);
                    if (!isFinite(mathY) || isNaN(mathY) || Math.abs(mathY) > 1e8) { firstPoint = true; continue; }
                    const py = cy - mathY * scale;
                    if (firstPoint) { ctx.moveTo(px, py); firstPoint = false; }
                    else { ctx.lineTo(px, py); }
                } catch { firstPoint = true; }
            }
            ctx.stroke();
        });

        // Critical Points
        criticalPoints.forEach((p) => {
            const px = cx + p.x * scale;
            const py = cy - p.y * scale;
            if (px < 0 || px > clientWidth || py < 0 || py > clientHeight) return;

            const color = colors[p.colorIdx % colors.length];
            ctx.fillStyle = color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

            ctx.font = 'bold 10px Outfit, sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
            ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 4;
            const labelText = (isShiftPressed && p.label)
                ? p.label.replace(/\\sqrt\{([^}]*)\}/g, '√$1').replace(/\\pi/g, 'π').replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1/$2)').replace(/[{}\\]/g, '')
                : `(${p.x.toFixed(2)}, ${p.y.toFixed(2)})`;
            ctx.fillText(labelText, px + 8, py - 8);
            ctx.shadowBlur = 0;
        });

    }, [view, formulaToParse, criticalPoints, isShiftPressed, evalFn]);

    // 5. Find Critical Points (numerical scan + symbolic label via CortexJS)
    useEffect(() => {
        if (!formulaToParse) { setCriticalPoints([]); return; }

        const findPoints = async () => {
            try {
                const ce = getMathEngine();
                const formulas = formulaToParse.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean);
                const points: any[] = [];
                const xMin = -20, xMax = 20, steps = 800;
                const dx = (xMax - xMin) / steps;
                const DEDUP_DIST = 0.1;
                const dedupe = (pt: any, existing: any[]) =>
                    existing.some(p => Math.abs(p.x - pt.x) < DEDUP_DIST && Math.abs(p.y - pt.y) < DEDUP_DIST);

                // Pre-solve symbolic roots for each formula
                const ceAny = ce as any;
                const symbolicRoots: string[][] = formulas.map((formula) => {
                    try {
                        let expr: any = ce.parse(formula);
                        if (expr.head === 'Equal') expr = expr.op2;
                        const solutions = ceAny.solve?.(expr, 'x');
                        if (solutions && solutions.length > 0) {
                            return solutions.map((s: any) => s.latex ?? s.toString());
                        }
                    } catch (e) {}
                    return [];
                });

                const compiledFns = formulas.map((f, idx) => {
                    const fn = evalFn(f);
                    return fn ? { fn, colorIdx: idx, formulaIdx: idx } : null;
                }).filter(Boolean) as { fn: (x: number) => number, colorIdx: number, formulaIdx: number }[];

                compiledFns.forEach(({ fn, colorIdx, formulaIdx }) => {
                    const symRoots = symbolicRoots[formulaIdx] || [];
                    let prevY = fn(xMin), prevSlope = NaN;

                    for (let i = 1; i <= steps; i++) {
                        const x = xMin + i * dx;
                        const y = fn(x);
                        if (!isFinite(y) || isNaN(y)) { prevY = y; prevSlope = NaN; continue; }

                        if (isFinite(prevY) && prevY * y <= 0 && Math.abs(y - prevY) < 5) {
                            const xRoot = x - dx * (y / ((y - prevY) || 1));

                            // Try to match with a symbolic root
                            let symbolicLabel = '';
                            for (const symLatex of symRoots) {
                                try {
                                    const numVal = ce.parse(symLatex).N().valueOf();
                                    if (typeof numVal === 'number' && Math.abs(numVal - xRoot) < 0.05) {
                                        // Clean up LaTeX for display
                                        const clean = symLatex
                                            .replace(/\\sqrt\{([^}]*)\}/g, '√$1')
                                            .replace(/\\pi/g, 'π')
                                            .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1/$2)')
                                            .replace(/[{}\\]/g, '');
                                        symbolicLabel = `(${clean}, 0)`;
                                        break;
                                    }
                                } catch (e) {}
                            }

                            const pt = {
                                x: xRoot, y: 0,
                                // symbolicLabel is shown with Shift; decimalLabel otherwise
                                label: symbolicLabel || `(${xRoot.toFixed(4)}, 0)`,
                                hasSymbol: !!symbolicLabel,
                                type: 'root', colorIdx
                            };
                            if (!dedupe(pt, points)) points.push(pt);
                        }

                        const slope = y - prevY;
                        if (isFinite(prevSlope) && prevSlope * slope < 0) {
                            const xEx = x - dx;
                            const yEx = fn(xEx);
                            const pt = {
                                x: xEx, y: yEx,
                                label: `(${xEx.toFixed(3)}, ${yEx.toFixed(3)})`,
                                hasSymbol: false,
                                type: 'extrema', colorIdx
                            };
                            if (!dedupe(pt, points)) points.push(pt);
                        }
                        prevY = y; prevSlope = slope;
                    }
                });

                // Intersections
                for (let i = 0; i < compiledFns.length; i++) {
                    for (let j = i + 1; j < compiledFns.length; j++) {
                        const fi = compiledFns[i].fn, fj = compiledFns[j].fn;
                        let prevDiff = fi(xMin) - fj(xMin);
                        for (let k = 1; k <= steps; k++) {
                            const x = xMin + k * dx;
                            const diff = fi(x) - fj(x);
                            if (isFinite(prevDiff) && isFinite(diff) && prevDiff * diff <= 0) {
                                const xInt = x - dx * (diff / ((diff - prevDiff) || 1));
                                const yInt = fi(xInt);
                                const pt = {
                                    x: xInt, y: yInt,
                                    label: `(${xInt.toFixed(3)}, ${yInt.toFixed(3)})`,
                                    hasSymbol: false,
                                    type: 'intersection', colorIdx: compiledFns[i].colorIdx
                                };
                                if (!dedupe(pt, points)) points.push(pt);
                            }
                            prevDiff = diff;
                        }
                    }
                }

                setCriticalPoints(points);
            } catch (e) {
                console.error('[Graph] findPoints error:', e);
            }
        };

        const timer = setTimeout(findPoints, 300);
        return () => clearTimeout(timer);
    }, [formulaToParse, evalFn]);

    // 6. Lifecycle
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas?.parentElement) return;
        const ro = new ResizeObserver(() => drawGraph());
        ro.observe(canvas.parentElement);
        return () => ro.disconnect();
    }, [drawGraph]);

    useEffect(() => { drawGraph(); }, [drawGraph]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault(); e.stopPropagation();
            const delta = Math.exp(-e.deltaY * 0.0015);
            setView(v => {
                const newScale = Math.max(1, Math.min(v.scale * delta, 2000));
                if (newScale === v.scale) return v;
                const rect = el.getBoundingClientRect();
                const mouseX = e.clientX - rect.left, mouseY = e.clientY - rect.top;
                const mathX = (mouseX - (rect.width / 2 - v.x)) / v.scale;
                const mathY = ((rect.height / 2 - v.y) - mouseY) / v.scale;
                return { scale: newScale, x: rect.width / 2 - mouseX + mathX * newScale, y: rect.height / 2 - mouseY - mathY * newScale };
            });
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, []);

    const handlePointerDown = (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        setIsDragging(true); setDragStart({ x: e.clientX, y: e.clientY });
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };
    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging) return;
        setView(v => ({ ...v, x: v.x - (e.clientX - dragStart.x), y: v.y - (e.clientY - dragStart.y) }));
        setDragStart({ x: e.clientX, y: e.clientY });
    };
    const handlePointerUp = (e: React.PointerEvent) => {
        setIsDragging(false); (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    };

    return (
        <div
            className={`math-node op-node graph-node ${touchingClasses}`}
            style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'visible', boxSizing: 'border-box' }}
        >
            <NodeResizer minWidth={250} minHeight={200} isVisible={selected} lineStyle={{ border: 'none' }} handleStyle={{ width: 8, height: 8, borderRadius: '50%', background: 'transparent', border: 'none' }} />
            <DynamicHandles
                nodeId={id}
                handles={data.handles}
                locked={true}
                allowedTypes={['input', 'output']}
                touchingEdges={data.touchingEdges}
            />

            <div className="nowheel" style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflow: 'hidden', borderRadius: 'inherit' }}>
                <div className="node-header" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>
                            <Icons.Graph />
                            Graph {isReceivingExternal && <span style={{ fontSize: '0.55rem', color: 'var(--accent-bright)', marginLeft: 4 }}>● EXT</span>}
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
                                        onClick={() => { /* Triggered graph draw could go here if manual lock was enabled */ }}
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

                {/* Formula input — only show manual editor when NOT receiving external */}
                {!isReceivingExternal && (
                    <div style={{ padding: '6px 8px', background: 'var(--bg-input)', borderBottom: '1px solid var(--border-header)', zIndex: 2 }}>
                        <math-field
                            ref={mfRef}
                            class="nodrag formula-input"
                            style={{ fontSize: '1rem', width: '100%', padding: '2px', borderRadius: '4px' }}
                        >
                            {manualFormula}
                        </math-field>
                    </div>
                )}

                {/* Show received formula when in external mode */}
                {isReceivingExternal && (
                    <div style={{ padding: '6px 8px', background: 'var(--bg-input)', borderBottom: '1px solid var(--border-header)', zIndex: 2 }}>
                        <div style={{
                            width: '100%', background: 'var(--accent-light)', padding: '4px 8px',
                            borderRadius: '4px', fontSize: '0.85rem', color: 'var(--accent-bright)',
                            minHeight: '28px', border: '1px solid var(--border-node)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            {formulaInput}
                        </div>
                    </div>
                )}

                <div ref={containerRef} className="nodrag nowheel"
                    style={{ flexGrow: 1, position: 'relative', cursor: isDragging ? 'grabbing' : 'crosshair' }}
                    onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}
                >
                    <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
                    <div style={{ position: 'absolute', bottom: 4, right: 8, fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', pointerEvents: 'none', textAlign: 'right', lineHeight: 1.4 }}>
                        x{view.scale.toFixed(0)} · ({(view.x / view.scale * -1).toFixed(1)}, {(view.y / view.scale).toFixed(1)})
                        {isShiftPressed && <div style={{ color: '#f59e0b' }}>⇧ Symbolic</div>}
                    </div>
                    <div className="graph-controls" style={{ position: 'absolute', top: 8, right: 8, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <button onClick={() => setView(v => ({ ...v, scale: Math.max(1, v.scale * 1.3) }))}>+</button>
                        <button onClick={() => setView(v => ({ ...v, scale: Math.max(1, v.scale / 1.3) }))}>−</button>
                        <button onClick={() => setView({ x: 0, y: 0, scale: 40 })} style={{ fontSize: '0.5rem', padding: '2px 4px' }}>⌂</button>
                    </div>
                </div>
            </div>

            <style>{`
                .graph-controls button { width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; border-radius: 4px; cursor: pointer; font-size: 0.8rem; }
                .graph-controls button:hover { background: rgba(255,255,255,0.2); }
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
