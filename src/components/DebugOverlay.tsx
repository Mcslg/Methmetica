/**
 * DebugOverlay.tsx
 * Temporary performance monitoring overlay.
 * Import and add <DebugOverlay /> to App.tsx to enable.
 * Remove when done debugging.
 */
import { useEffect, useRef, useState } from 'react';
import useStore from '../store/useStore';

// ── Global render counters (module-level, no React overhead) ─────────────────
export const RenderCounters: Record<string, number> = {};
export function countRender(name: string) {
    RenderCounters[name] = (RenderCounters[name] || 0) + 1;
}

// ── Global evaluateGraph call counter ────────────────────────────────────────
export let evalGraphCallCount = 0;
export function incrementEvalGraph() { evalGraphCallCount++; }

// ── FPS meter ────────────────────────────────────────────────────────────────
function useFPS() {
    const [fps, setFps] = useState(60);
    const frameTimesRef = useRef<number[]>([]);
    const rafRef = useRef<number>(0);

    useEffect(() => {
        let last = performance.now();
        const tick = (now: number) => {
            const delta = now - last;
            last = now;
            frameTimesRef.current.push(delta);
            if (frameTimesRef.current.length > 60) frameTimesRef.current.shift();
            const avg = frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length;
            setFps(Math.round(1000 / avg));
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, []);

    return fps;
}

// ── Main overlay ─────────────────────────────────────────────────────────────
export function DebugOverlay() {
    const fps = useFPS();
    const [counters, setCounters] = useState<Record<string, number>>({});
    const [evalCount, setEvalCount] = useState(0);
    const [storeUpdateCount, setStoreUpdateCount] = useState(0);

    // Subscribe to store changes to count updates
    useEffect(() => {
        return useStore.subscribe(() => {
            setStoreUpdateCount(c => c + 1);
        });
    }, []);

    const timerRef = useRef<any>(null);

    // Poll render counters and eval count every 500ms
    useEffect(() => {
        timerRef.current = setInterval(() => {
            setCounters({ ...RenderCounters });
            setEvalCount(evalGraphCallCount);
        }, 500);
        return () => clearInterval(timerRef.current);
    }, []);

    const nodes = useStore(s => s.nodes);
    countRender('DebugOverlay');

    const [visible, setVisible] = useState(true);

    const fpsColor = fps >= 50 ? '#43e97b' : fps >= 30 ? '#ffcc00' : '#ff4757';

    if (!visible) {
        return (
            <button
                onClick={() => setVisible(true)}
                style={{
                    position: 'fixed', bottom: 60, right: 12, zIndex: 99999,
                    background: '#111', border: '1px solid #333', color: '#aaa',
                    fontSize: '0.65rem', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer'
                }}
            >
                🔍 Debug
            </button>
        );
    }

    return (
        <div style={{
            position: 'fixed', bottom: 60, right: 12, zIndex: 99999,
            background: 'rgba(10,10,16,0.95)', backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
            padding: '10px 14px', fontFamily: 'monospace', fontSize: '0.72rem',
            color: '#ccc', minWidth: '200px', boxShadow: '0 4px 30px rgba(0,0,0,0.6)',
            userSelect: 'none'
        }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ color: '#888', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>🔍 Perf Monitor</span>
                <button onClick={() => setVisible(false)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '0.75rem' }}>✕</button>
            </div>

            {/* FPS */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#888' }}>FPS</span>
                <span style={{ color: fpsColor, fontWeight: 700, fontSize: '0.9rem' }}>{fps}</span>
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '6px 0' }} />

            {/* Node & Edge count */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span style={{ color: '#888' }}>Nodes</span>
                <span style={{ color: '#4facfe' }}>{nodes.length}</span>
            </div>

            {/* Store update rate */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span style={{ color: '#888' }}>Store updates</span>
                <span style={{ color: storeUpdateCount > 200 ? '#ff4757' : '#aaa' }}>{storeUpdateCount}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span style={{ color: '#888' }}>evaluateGraph()</span>
                <span style={{ color: evalCount > 100 ? '#ff4757' : '#ffcc00' }}>{evalCount}</span>
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '6px 0' }} />

            {/* Per-component render counts */}
            <div style={{ color: '#888', fontSize: '0.6rem', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>React Render Counts</div>
            {Object.entries(counters).sort(([, a], [, b]) => b - a).map(([name, count]) => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', gap: '10px' }}>
                    <span style={{ color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>{name}</span>
                    <span style={{ color: count > 100 ? '#ff4757' : count > 30 ? '#ffcc00' : '#43e97b', flexShrink: 0 }}>{count}</span>
                </div>
            ))}
            {Object.keys(counters).length === 0 && (
                <div style={{ color: '#444', fontSize: '0.65rem' }}>No components tracked yet</div>
            )}

            {/* Reset */}
            <button
                onClick={() => {
                    Object.keys(RenderCounters).forEach(k => { RenderCounters[k] = 0; });
                    evalGraphCallCount = 0;
                    setStoreUpdateCount(0);
                    setEvalCount(0);
                    setCounters({});
                }}
                style={{
                    marginTop: '8px', width: '100%', padding: '3px',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    color: '#888', borderRadius: '4px', cursor: 'pointer', fontSize: '0.65rem'
                }}
            >
                Reset Counters
            </button>
        </div>
    );
}
