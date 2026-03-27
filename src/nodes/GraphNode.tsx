import React, { useEffect, useRef, useState, useCallback, memo } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import { useShallow } from 'zustand/react/shallow';
import useStore, { type NodeData, type AppState } from '../store/useStore';
import { getMathEngine } from '../utils/MathEngine';
import { Icons } from '../components/Icons';
import 'mathlive';
import { NodeFrame } from '../components/NodeFrame';
import { FormulaSidebarArea } from '../components/FormulaSidebarArea';
import { countRender } from '../components/DebugOverlay';

export const GraphNode = memo(function GraphNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    countRender('GraphNode');
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    const theme = useStore((state: AppState) => state.theme);
    const globalVars = useStore((state: AppState) => state.globalVars);

    // Refs
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const mfRef = useRef<any>(null);
    const isSettingValueRef = useRef(false);

    // [PERF] Isolated store value to stop React from thrashing the web component
    const formulaInStore = useStore((state: AppState) => state.nodes.find(n => n.id === id)?.data.formula || '');

    // Optimized selector: only re-render if the SPECIFIC nodes we are tracking change
    const mergedSliderSids = React.useMemo(() => {
        if (!data.slots) return [];
        return Object.values(data.slots).filter(s => typeof s === 'string') as string[];
    }, [data.slots]);

    const mergedSliderNodesStr = useStore((state: AppState) => {
        if (mergedSliderSids.length === 0) return '';
        return mergedSliderSids.map(sid => {
            const n = state.nodes.find(node => node.id === sid);
            return n ? `${n.id}::${n.data.value}::${n.data.nodeName || ''}` : '';
        }).join('|');
    });

    // States
    const [isShiftPressed, setIsShiftPressed] = useState(false);
    const [criticalPoints, setCriticalPoints] = useState<any[]>([]);
    const [view, setView] = useState({ x: 0, y: 0, scale: 40 });
    const [view3D, setView3D] = useState({ rotX: Math.PI / 6, rotZ: Math.PI / 4 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const formulaInput = data.formulaInput;
    const manualFormula = data.formula || '';
    const formulaToParse = formulaInput || manualFormula;
    const isReceivingExternal = !!formulaInput;

    const touchingEdges = data.touchingEdges || {};
    const touchingClasses = Object.entries(touchingEdges)
        .filter(([, touching]) => touching)
        .map(([edge]) => `edge-touch-${edge}`)
        .join(' ');

    // Auto-detect 3D mode: only trigger if the formula explicitly contains BOTH x and y as *variables*
    // (not just as parts of function names like 'exp'), or starts with 'z='
    const is3D = React.useMemo(() => {
        if (!formulaToParse) return false;
        const first = formulaToParse.split(/[,;]/)[0].trim();
        // Explicit z= form
        if (/^z\s*=/.test(first)) return true;
        // Strip LaTeX commands to avoid false positives from \exp, \max, \cdot, etc.
        const stripped = first
            .replace(/\\[a-zA-Z]+/g, ' ')  // remove LaTeX commands
            .replace(/[\^{}|_]/g, ' ');
        // Now check if both 'x' and 'y' appear as standalone variable tokens
        const hasX = /(?<![a-zA-Z])x(?![a-zA-Z])/.test(stripped);
        const hasY = /(?<![a-zA-Z])y(?![a-zA-Z])/.test(stripped);
        // Only go 3D if explicitly a function of both x and y (not y=f(x))
        if (hasX && hasY && !/^\s*y\s*=/.test(first)) return true;
        return false;
    }, [formulaToParse]);

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

    const formulaInStoreRef = useRef(formulaInStore);

    // Ref sync without triggering effect loops
    useEffect(() => {
        formulaInStoreRef.current = formulaInStore;
    }, [formulaInStore]);

    // [PERF] Setup event listener once
    useEffect(() => {
        const mf = mfRef.current;
        if (!mf || isReceivingExternal) return;

        const handleInput = (e: any) => {
            if (isSettingValueRef.current) return;
            const nextVal = e.target.value;
            if (nextVal !== formulaInStoreRef.current) {
                updateNodeData(id, { formula: nextVal });
            }
        };

        mf.addEventListener('input', handleInput);
        return () => mf.removeEventListener('input', handleInput);
    }, [id, isReceivingExternal, updateNodeData]);

    // [PERF] Manual sync from store to web component
    useEffect(() => {
        const mf = mfRef.current;
        if (!mf || isReceivingExternal) return;

        if (mf.value !== formulaInStore) {
            isSettingValueRef.current = true;
            mf.value = formulaInStore;
            isSettingValueRef.current = false;
        }
    }, [formulaInStore, isReceivingExternal]);

    const getMergedParams = useCallback(() => {
        const params: Record<string, number> = {};
        if (data.slots && mergedSliderNodesStr) {
            const nodeStrs = mergedSliderNodesStr.split('|').filter(Boolean);
            Object.entries(data.slots).forEach(([key, sid]) => {
                if (typeof sid === 'string') {
                    const foundInfo = nodeStrs.find(str => str.startsWith(`${sid}::`));
                    if (foundInfo) {
                        const [, valueStr] = foundInfo.split('::');
                        params[key] = Number(valueStr) || 0;
                    }
                }
            });
        }
        return params;
    }, [data.slots, mergedSliderNodesStr]);

    const evalFn = useCallback((formula: string): ((x: number) => number) | null => {
        try {
            const ce = getMathEngine();
            let expr: any = ce.parse(formula);
            if (expr.head === 'Equal') expr = expr.op2;

            const mergedParams = getMergedParams();
            const combinedVars = { ...globalVars, ...mergedParams };

            try {
                const compiled: any = expr.compile?.();
                if (compiled && typeof compiled.run === 'function') {
                    const ctx: any = { x: 1, ...combinedVars };
                    Object.keys(ctx).forEach(k => { if (k !== 'x') ctx[k] = Number(ctx[k]) || 0; });
                    const testVal = compiled.run(ctx);
                    if (typeof testVal === 'number' && !isNaN(testVal)) {
                        return (x: number) => {
                            const v = compiled.run({ ...ctx, x });
                            return typeof v === 'number' ? v : Number(v);
                        };
                    }
                }
            } catch (e) { }
        } catch (e) { }

        try {
            const mergedParams = getMergedParams();
            const combinedVars: Record<string, number> = { ...mergedParams };
            Object.keys(globalVars).forEach(k => { combinedVars[k] = Number(globalVars[k]) || 0; });

            let jsExpr = formula
                .replace(/\\cdot\s*/g, '*').replace(/\\times\s*/g, '*')
                .replace(/\\sin\s*/g, 'Math.sin').replace(/\\cos\s*/g, 'Math.cos')
                .replace(/\\tan\s*/g, 'Math.tan').replace(/\\ln\s*/g, 'Math.log')
                .replace(/\\log\s*/g, 'Math.log10').replace(/\\exp\s*/g, 'Math.exp')
                .replace(/\\sqrt\{([^}]+)\}/g, 'Math.sqrt($1)')
                .replace(/\\pi/g, 'Math.PI').replace(/\\e\b/g, 'Math.E')
                .replace(/\^/g, '**')
                .replace(/[{}\\]/g, '');

            const varNames = Object.keys(combinedVars).sort((a,b) => b.length - a.length);
            const varValues = varNames.map(name => combinedVars[name]);

            // Robust implicit multiplication for variables
            varNames.forEach(name => {
              // number + variable (e.g. 5a -> 5*a)
              jsExpr = jsExpr.replace(new RegExp(`(\\d)\\s*(${name})`, 'g'), '$1*$2');
              // variable + x (e.g. ax -> a*x)
              jsExpr = jsExpr.replace(new RegExp(`(${name})\\s*(x\\b)`, 'g'), '$1*$2');
              // x + variable (e.g. xa -> x*a)
              jsExpr = jsExpr.replace(new RegExp(`(x\\b)\\s*(${name})`, 'g'), '$1*$2');
              // variable + number (e.g. a5 -> a*5)
              jsExpr = jsExpr.replace(new RegExp(`(${name})\\s*(\\d)`, 'g'), '$1*$2');
              // variable + variable (e.g. ab -> a*b) - but only if not a known math function
              varNames.forEach(name2 => {
                 if (name !== name2) {
                   jsExpr = jsExpr.replace(new RegExp(`(${name})\\s*(${name2})`, 'g'), '$1*$2');
                 }
              });
            });

            jsExpr = jsExpr
                .replace(/(\d)\s*(x\b)/g, '$1*$2')
                .replace(/(\d)\s*(Math\.)/g, '$1*$2')
                .replace(/\)\s*\(/g, ')*(')
                .replace(/(\d)\s*\(/g, '$1*(')
                .replace(/\)\s*(x\b)/g, ')*$1');

            // eslint-disable-next-line no-new-func
            const fn = new Function('x', ...varNames, `'use strict'; try { return +(${jsExpr}); } catch(e) { return NaN; }`);
            const r = fn(1, ...varValues);
            if (typeof r === 'number') return (x: number) => fn(x, ...varValues);
        } catch (e) { }
        return null;
    }, [globalVars, getMergedParams]);

    const evalFn3D = useCallback((formula: string): ((x: number, y: number) => number) | null => {
        // Strip leading "z =" if present
        const stripped = formula.replace(/^z\s*=\s*/, '').trim();

        const mergedParams = getMergedParams();
        const combinedVars: Record<string, number> = {};
        Object.keys(globalVars).forEach(k => { combinedVars[k] = Number(globalVars[k]) || 0; });
        Object.entries(mergedParams).forEach(([k, v]) => { combinedVars[k] = v; });

        // --- Tier 1: CortexJS compile (works well with plain math, e.g. x^2+y^2) ---
        try {
            const ce = getMathEngine();
            let expr: any = ce.parse(stripped);
            if (expr.head === 'Equal') expr = expr.op2;
            const compiled: any = expr.compile?.();
            if (compiled && typeof compiled.run === 'function') {
                const baseCtx: any = { ...combinedVars };
                const t = compiled.run({ ...baseCtx, x: 1, y: 2 });
                if (typeof t === 'number' && isFinite(t) && !isNaN(t)) {
                    return (x: number, y: number) => {
                        const v = compiled.run({ ...baseCtx, x, y });
                        return typeof v === 'number' ? v : Number(v);
                    };
                }
            }
        } catch (e) { }

        // --- Tier 2: JS eval (handles LaTeX-adjacent input) ---
        try {
            let jsExpr = stripped
                .replace(/\\cdot\s*/g, '*').replace(/\\times\s*/g, '*')
                .replace(/\\sin\b\s*/g, 'Math.sin').replace(/\\cos\b\s*/g, 'Math.cos')
                .replace(/\\tan\b\s*/g, 'Math.tan').replace(/\\ln\b\s*/g, 'Math.log')
                .replace(/\\log\b\s*/g, 'Math.log10').replace(/\\exp\b\s*/g, 'Math.exp')
                .replace(/\\sqrt\{([^}]+)\}/g, 'Math.sqrt($1)')
                .replace(/\\pi\b/g, 'Math.PI').replace(/\\e\b/g, 'Math.E')
                .replace(/\^/g, '**')
                .replace(/[{}\\]/g, '')
                // Handle implicit multiplication for x*y forms
                .replace(/(?<=[xy])\s*(?=[xy])/g, '*')  // xy -> x*y
                .replace(/(\d)\s*([xy])\b/g, '$1*$2')   // 2x -> 2*x, 2y -> 2*y
                .replace(/([xy])\s*(\d)/g, '$1*$2')      // x2 -> x*2
                .replace(/(\d)\s*(Math\.)/g, '$1*$2')
                .replace(/\)\s*\(/g, ')*(')
                .replace(/(\d)\s*\(/g, '$1*(');

            // Inject custom variables
            const varNames = Object.keys(combinedVars).sort((a, b) => b.length - a.length);
            const varValues = varNames.map(n => combinedVars[n]);

            // eslint-disable-next-line no-new-func
            const fn = new Function('x', 'y', ...varNames,
                `'use strict'; try { return +(${jsExpr}); } catch(e) { return NaN; }`);
            const r = fn(1, 2, ...varValues);
            if (typeof r === 'number' && isFinite(r)) {
                return (x: number, y: number) => fn(x, y, ...varValues);
            }
        } catch (e) { }

        return null;
    }, [globalVars, getMergedParams]);

    const drawGraph = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const clientWidth = canvas.clientWidth || canvas.parentElement?.clientWidth || 0;
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
        const isLight = theme === 'light';
        const gridColor = isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)';
        const axisColor = isLight ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.4)';
        const tooltipColor = isLight ? 'rgba(0,0,0,0.8)' : '#fff';
        const shadowColor = isLight ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.9)';

        if (is3D) {
            // --- 3D Rendering ---
            // Use canvas center (independent of 2D pan)
            const ox = clientWidth / 2;
            const oy = clientHeight / 2;
            const s = view.scale; // reuse scale for zoom

            // Rotation angles: rotZ=azimuth, rotX=elevation
            const az = view3D.rotZ;
            const el = view3D.rotX;

            // Classic 3D→2D projection:
            // X points right/left (azimuth), Y points depth (into screen), Z points up
            const project = (px: number, py: number, pz: number) => {
                // Rotate around Z axis (azimuth)
                const rx = px * Math.cos(az) - py * Math.sin(az);
                const ry = px * Math.sin(az) + py * Math.cos(az);
                // Rotate around X axis (elevation)
                const rz = -ry * Math.sin(el) + pz * Math.cos(el);
                const depth = ry * Math.cos(el) + pz * Math.sin(el);
                return { sx: ox + rx * s, sy: oy - rz * s, depth };
            };

            // Draw axis lines (from origin outward)
            const AXIS_LEN = 8;
            const drawAxis3D = (dx: number, dy: number, dz: number, color: string, label: string) => {
                const o = project(0, 0, 0);
                const t = project(dx * AXIS_LEN, dy * AXIS_LEN, dz * AXIS_LEN);
                ctx.beginPath();
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.setLineDash([]);
                ctx.moveTo(o.sx, o.sy);
                ctx.lineTo(t.sx, t.sy);
                ctx.stroke();
                // Negative dashed half
                const tn = project(-dx * AXIS_LEN * 0.4, -dy * AXIS_LEN * 0.4, -dz * AXIS_LEN * 0.4);
                ctx.beginPath();
                ctx.setLineDash([3, 4]);
                ctx.moveTo(o.sx, o.sy);
                ctx.lineTo(tn.sx, tn.sy);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = color;
                ctx.font = 'bold 11px Outfit, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(label, t.sx, t.sy - 6);
            };
            drawAxis3D(1, 0, 0, '#f43f5e', 'X');
            drawAxis3D(0, 1, 0, '#10b981', 'Y');
            drawAxis3D(0, 0, 1, '#4facfe', 'Z');

            const fn = evalFn3D(formulaToParse.split(/[,;]/)[0]);
            if (fn) {
                const range = 6, steps = 32;
                const step = (range * 2) / steps;

                // Find z-range for color mapping
                let zMin = Infinity, zMax = -Infinity;
                const grid: { sx: number; sy: number; depth: number; z: number; valid: boolean }[][] = [];

                for (let i = 0; i <= steps; i++) {
                    const row: typeof grid[0] = [];
                    const gx = -range + i * step;
                    for (let j = 0; j <= steps; j++) {
                        const gy = -range + j * step;
                        const gz = fn(gx, gy);
                        if (isFinite(gz) && !isNaN(gz) && Math.abs(gz) < 1e6) {
                            const proj = project(gx, gy, gz);
                            row.push({ ...proj, z: gz, valid: true });
                            if (gz < zMin) zMin = gz;
                            if (gz > zMax) zMax = gz;
                        } else {
                            row.push({ sx: 0, sy: 0, depth: 0, z: 0, valid: false });
                        }
                    }
                    grid.push(row);
                }

                const zRange = zMax - zMin || 1;

                // Collect quads with depth
                const quads: { p: typeof grid[0]; depth: number; zAvg: number }[] = [];
                for (let i = 0; i < steps; i++) {
                    for (let j = 0; j < steps; j++) {
                        const pts = [grid[i][j], grid[i+1][j], grid[i+1][j+1], grid[i][j+1]];
                        if (pts.every(p => p.valid)) {
                            const depth = pts.reduce((s, p) => s + p.depth, 0) / 4;
                            const zAvg = pts.reduce((s, p) => s + p.z, 0) / 4;
                            quads.push({ p: pts, depth, zAvg });
                        }
                    }
                }

                // Painter's sort (back to front)
                quads.sort((a, b) => b.depth - a.depth);

                for (const q of quads) {
                    const t = Math.max(0, Math.min(1, (q.zAvg - zMin) / zRange));
                    // Blue → Cyan → Green → Yellow → Red heat map
                    let r: number, g: number, b: number;
                    if (t < 0.25) {
                        const u = t / 0.25;
                        r = 0; g = Math.round(u * 200); b = 255;
                    } else if (t < 0.5) {
                        const u = (t - 0.25) / 0.25;
                        r = 0; g = Math.round(200 + u * 55); b = Math.round(255 * (1 - u));
                    } else if (t < 0.75) {
                        const u = (t - 0.5) / 0.25;
                        r = Math.round(u * 255); g = 255; b = 0;
                    } else {
                        const u = (t - 0.75) / 0.25;
                        r = 255; g = Math.round(255 * (1 - u)); b = 0;
                    }

                    const [p1, p2, p3, p4] = q.p;
                    ctx.beginPath();
                    ctx.moveTo(p1.sx, p1.sy);
                    ctx.lineTo(p2.sx, p2.sy);
                    ctx.lineTo(p3.sx, p3.sy);
                    ctx.lineTo(p4.sx, p4.sy);
                    ctx.closePath();
                    ctx.fillStyle = `rgba(${r},${g},${b},0.82)`;
                    ctx.fill();
                    ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)';
                    ctx.lineWidth = 0.6;
                    ctx.stroke();
                }
            } else {
                // No plot: show hint
                ctx.fillStyle = isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)';
                ctx.font = '12px var(--font-main), sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('Enter a formula with x and y', ox, oy);
            }

            // Label badge
            ctx.setLineDash([]);
            ctx.fillStyle = isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)';
            ctx.font = 'bold 11px var(--font-main), sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText('3D  ⟳ drag to rotate', 10, 18);
            return;
        }

        // Grid (2D)
        ctx.strokeStyle = gridColor; ctx.lineWidth = 1; ctx.beginPath();
        const leftUnits = Math.floor(-cx / scale), rightUnits = Math.ceil((clientWidth - cx) / scale);
        for (let i = leftUnits; i <= rightUnits; i++) { ctx.moveTo(cx + i * scale, 0); ctx.lineTo(cx + i * scale, clientHeight); }
        const topUnits = Math.floor(-cy / scale), bottomUnits = Math.ceil((clientHeight - cy) / scale);
        for (let i = topUnits; i <= bottomUnits; i++) { ctx.moveTo(0, cy + i * scale); ctx.lineTo(clientWidth, cy + i * scale); }
        ctx.stroke();

        // Axes
        ctx.strokeStyle = axisColor; ctx.lineWidth = 1.5; ctx.beginPath();
        if (cy >= 0 && cy <= clientHeight) { ctx.moveTo(0, cy); ctx.lineTo(clientWidth, cy); }
        if (cx >= 0 && cx <= clientWidth) { ctx.moveTo(cx, 0); ctx.lineTo(cx, clientHeight); }
        ctx.stroke();

        // Axis tick labels
        ctx.font = '9px var(--font-main), sans-serif'; ctx.fillStyle = axisColor; ctx.textAlign = 'center';
        for (let i = leftUnits; i <= rightUnits; i++) {
            if (i === 0) continue;
            ctx.fillText(String(i), cx + i * scale, Math.min(cy + 12, clientHeight - 4));
        }
        ctx.textAlign = 'right';
        for (let i = topUnits; i <= bottomUnits; i++) {
            if (i === 0) continue;
            ctx.fillText(String(-i), Math.max(cx - 4, 20), cy + i * scale + 3);
        }

        const formulas = formulaToParse.split(/[,;]/).map(s => s.trim()).filter(Boolean);
        formulas.forEach((formula, index) => {
            const fn = evalFn(formula);
            if (!fn) return;
            ctx.strokeStyle = colors[index % colors.length]; ctx.lineWidth = 2.5; ctx.beginPath();
            let firstPoint = true;
            for (let px = 0; px <= clientWidth; px += 0.75) {
                const mathX = (px - cx) / scale;
                try {
                    const mathY = fn(mathX);
                    if (!isFinite(mathY) || isNaN(mathY) || Math.abs(mathY) > 1e8) { firstPoint = true; continue; }
                    const py = cy - mathY * scale;
                    if (firstPoint) { ctx.moveTo(px, py); firstPoint = false; }
                    else ctx.lineTo(px, py);
                } catch { firstPoint = true; }
            }
            ctx.stroke();
        });

        criticalPoints.forEach((p) => {
            const px = cx + p.x * scale, py = cy - p.y * scale;
            if (px < 0 || px > clientWidth || py < 0 || py > clientHeight) return;
            const color = colors[p.colorIdx % colors.length];
            ctx.fillStyle = color; ctx.strokeStyle = isLight ? '#000' : '#fff'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.font = 'bold 10px Outfit, sans-serif'; ctx.fillStyle = tooltipColor; ctx.textAlign = 'left';
            ctx.shadowColor = shadowColor; ctx.shadowBlur = 4;
            const labelText = (isShiftPressed && p.label) ? p.label : `(${p.x.toFixed(2)}, ${p.y.toFixed(2)})`;
            ctx.fillText(labelText, px + 8, py - 8); ctx.shadowBlur = 0;
        });
    }, [view, view3D, is3D, formulaToParse, criticalPoints, isShiftPressed, evalFn, evalFn3D, theme]);

    useEffect(() => {
        if (!formulaToParse || is3D) { setCriticalPoints([]); return; }
        const findPoints = async () => {
            try {
                const formulas = formulaToParse.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean);
                const points: any[] = [];
                const xMin = -20, xMax = 20, steps = 800, dx = (xMax - xMin) / steps;
                const DEDUP_DIST = 0.1;
                const dedupe = (pt: any, existing: any[]) => existing.some(p => Math.abs(p.x - pt.x) < DEDUP_DIST && Math.abs(p.y - pt.y) < DEDUP_DIST);

                formulas.forEach((f, idx) => {
                    const fn = evalFn(f);
                    if (!fn) return;
                    let prevY = fn(xMin), prevSlope = NaN;
                    for (let i = 1; i <= steps; i++) {
                        const x = xMin + i * dx, y = fn(x);
                        if (!isFinite(y) || isNaN(y)) { prevY = y; prevSlope = NaN; continue; }
                        if (isFinite(prevY) && prevY * y <= 0 && Math.abs(y - prevY) < 5) {
                            const xRoot = x - dx * (y / ((y - prevY) || 1));
                            const pt = { x: xRoot, y: 0, label: `(${xRoot.toFixed(4)}, 0)`, colorIdx: idx };
                            if (!dedupe(pt, points)) points.push(pt);
                        }
                        const slope = y - prevY;
                        if (isFinite(prevSlope) && prevSlope * slope < 0) {
                            const xEx = x - dx, yEx = fn(xEx);
                            const pt = { x: xEx, y: yEx, label: `(${xEx.toFixed(3)}, ${yEx.toFixed(3)})`, colorIdx: idx };
                            if (!dedupe(pt, points)) points.push(pt);
                        }
                        prevY = y; prevSlope = slope;
                    }
                });
                setCriticalPoints(points);
            } catch (e) { }
        };
        const timer = setTimeout(findPoints, 300);
        return () => clearTimeout(timer);
    }, [formulaToParse, evalFn, is3D]);

    // [PERF] Use a stable ref so ResizeObserver is created only ONCE.
    // Without this, every drawGraph change (triggered by slider/formula/theme) recreates the observer.
    const drawGraphRef = useRef(drawGraph);
    useEffect(() => { drawGraphRef.current = drawGraph; }, [drawGraph]);

    useEffect(() => {
        const ro = new ResizeObserver(() => drawGraphRef.current());
        if (containerRef.current) ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []); // ← Empty deps: observer is created once and lives with the component

    useEffect(() => {
        drawGraph();
    }, [drawGraph, view, theme, is3D, view3D, formulaToParse, globalVars]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const handleWheel = (e: WheelEvent) => {
            e.preventDefault(); e.stopPropagation();
            if (e.ctrlKey || e.metaKey) {
                const delta = e.deltaY > 0 ? 0.9 : 1.1;
                setView(v => ({ ...v, scale: Math.max(1, Math.min(v.scale * delta, 2000)) }));
            } else {
                setView(v => ({ ...v, x: v.x + e.deltaX, y: v.y + e.deltaY }));
            }
        };
        el.addEventListener('wheel', handleWheel, { passive: false });
        return () => el.removeEventListener('wheel', handleWheel);
    }, []);

    const handlePointerDown = (e: React.PointerEvent) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        setIsDragging(true); setDragStart({ x: e.clientX, y: e.clientY });
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
        if (is3D) {
            setView3D(v => ({ ...v, rotZ: v.rotZ + dx * 0.01, rotX: Math.max(-Math.PI/2, Math.min(Math.PI/2, v.rotX + dy * 0.01)) }));
        } else {
            setView(v => ({ ...v, x: v.x - dx, y: v.y - dy }));
        }
        setDragStart({ x: e.clientX, y: e.clientY });
    };

    const handlePointerUp = (e: React.PointerEvent) => { setIsDragging(false); (e.target as HTMLElement).releasePointerCapture(e.pointerId); };

    return (
        <NodeFrame id={id} data={data} selected={selected} icon={<Icons.Graph />} defaultLabel="Graph" className={`graph-node ${touchingClasses}`} contentStyle={{ padding: 0 }}>
            <div className="nowheel" style={{ display: 'flex', flexDirection: 'row', width: '100%', height: '100%', overflow: 'hidden' }}>
                {data.slots?.formulaSidebar && (
                    <div style={{ width: '220px', minWidth: '220px', flexShrink: 0, height: '100%' }}>
                        <FormulaSidebarArea containerId={id} sidebarSid={data.slots.formulaSidebar as string} />
                    </div>
                )}
                <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                    {!isReceivingExternal && !data.slots?.formulaSidebar && (
                        <div style={{ padding: '6px 8px', background: 'var(--bg-input)', borderBottom: '1px solid var(--border-header)' }}>
                            <math-field ref={mfRef} class="nodrag formula-input" />
                        </div>
                    )}
                    {isReceivingExternal && !data.slots?.formulaSidebar && (
                        <div style={{ padding: '6px 8px', background: 'var(--bg-input)', borderBottom: '1px solid var(--border-header)' }}>
                            <div style={{ width: '100%', background: 'var(--accent-light)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem', color: 'var(--accent-bright)' }}>{formulaInput}</div>
                        </div>
                    )}
                    <div ref={containerRef} className="nodrag nowheel" style={{ flexGrow: 1, position: 'relative', cursor: isDragging ? 'grabbing' : 'crosshair' }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}>
                        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
                        <div style={{ position: 'absolute', bottom: 4, right: 8, fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }}>
                            x{view.scale.toFixed(0)} · ({(view.x / view.scale * -1).toFixed(1)}, {(view.y / view.scale).toFixed(1)})
                        </div>
                        <div className="graph-controls" style={{ position: 'absolute', top: 8, right: 8, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <button onClick={() => setView(v => ({ ...v, scale: Math.max(1, v.scale * 1.3) }))}>+</button>
                            <button onClick={() => setView(v => ({ ...v, scale: Math.max(1, v.scale / 1.3) }))}>−</button>
                            <button onClick={() => setView({ x: 0, y: 0, scale: 40 })} style={{ fontSize: '0.5rem' }}>⌂</button>
                        </div>
                    </div>
                </div>
            </div>
            <style>{`
                .graph-controls button { width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; border-radius: 4px; cursor: pointer; }
                .graph-controls button:hover { background: rgba(255,255,255,0.2); }
            `}</style>
        </NodeFrame>
    );
});

