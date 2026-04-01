import React, { useState, useMemo, memo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getMathEngine } from '../utils/MathEngine';
import { useLanguage } from '../contexts/LanguageContext';
import { MathInput } from './MathInput';
import type { BalanceOperation } from '../store/useStore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Term {
    id: string;
    latex: string;         // the full display latex (e.g. "2x" or "\left( 2x+1 \right)")
    sign: '+' | '-';       // the sign preceding this term
    coefficient: string;   // isolated coefficient, or '1'
    variable: string;      // isolated variable part, or term.latex
    side: 'LHS' | 'RHS';
}

interface ParsedEquation {
    lhs: Term[];
    rhs: Term[];
}

interface InteractiveEquationProps {
    formula: string;
    onApplyOperation: (op: string, value: string, meta?: Partial<BalanceOperation>) => void;
}

interface FactorSuggestion {
    factor: string;
    remainder: string;
}

interface SelectionActionState {
    rect: DOMRect;
    side: 'lhs' | 'rhs';
    selectedLatex: string;
    factorSuggestion: FactorSuggestion | null;
    expandResult: string | null;
    simplifyResult: string | null;
}

// ─── Pure char-scanner ────────────────────────────────────────────────────────
// Tracks depth using ( [ \left( \left[ only.
// { } are LaTeX syntax, NOT mathematical grouping — depth is NOT changed by them.
// Returns top-level additive terms with their preceding sign.

function scanTopLevelTerms(latex: string): { latex: string; sign: '+' | '-' }[] {
    const results: { latex: string; sign: '+' | '-' }[] = [];
    let current = '';
    let depth = 0;
    let pendingSign: '+' | '-' = '+';
    let i = 0;
    const len = latex.length;

    const flush = () => {
        const t = current.trim();
        if (t) results.push({ latex: t, sign: pendingSign });
        current = '';
    };

    while (i < len) {
        // \left( and \left[
        if (latex.startsWith('\\left(', i)) { depth++; current += '\\left('; i += 6; continue; }
        if (latex.startsWith('\\left[', i)) { depth++; current += '\\left['; i += 6; continue; }
        if (latex.startsWith('\\left\\{', i)) { depth++; current += '\\left\\{'; i += 7; continue; }
        // \right) and \right]
        if (latex.startsWith('\\right)', i)) { depth--; current += '\\right)'; i += 7; continue; }
        if (latex.startsWith('\\right]', i)) { depth--; current += '\\right]'; i += 7; continue; }
        if (latex.startsWith('\\right\\}', i)) { depth--; current += '\\right\\}'; i += 8; continue; }

        const ch = latex[i];

        // Standard math brackets — track depth
        if (ch === '(' || ch === '[') { depth++; current += ch; i++; continue; }
        if (ch === ')' || ch === ']') { depth--; current += ch; i++; continue; }

        // LaTeX braces — pass through, do NOT track depth
        if (ch === '{' || ch === '}') { current += ch; i++; continue; }

        // Top-level split point
        if (depth === 0 && (ch === '+' || ch === '-')) {
            flush();
            pendingSign = ch as '+' | '-';
            i++;
            continue;
        }

        current += ch;
        i++;
    }
    flush();
    return results;
}

// ─── Term parser ─────────────────────────────────────────────────────────────

function parseSide(latex: string, side: 'LHS' | 'RHS'): Term[] {
    const rawTerms = scanTopLevelTerms(latex);
    const ce = getMathEngine();
    const terms: Term[] = [];

    rawTerms.forEach((raw, idx) => {
        let coefficient = '1';
        let variable = raw.latex;

        try {
            const expr = ce.parse(raw.latex);
            const json = expr.json;
            const head = Array.isArray(json) ? json[0] : null;

            if (head === 'Multiply') {
                const ops = (expr as any).ops ?? [];
                const first = ops[0];
                if (first && first.numericValue !== undefined && ops.length >= 2) {
                    const rest = ops.slice(1);
                    coefficient = first.latex;
                    variable = rest.length === 1 ? rest[0].latex : ce.box(['Multiply', ...rest]).latex;
                }
            } else if (head === 'Divide') {
                const [num, den] = (expr as any).ops ?? [];
                if (num && den) {
                    const numJson = num.json;
                    const numHead = Array.isArray(numJson) ? numJson[0] : null;
                    if (numHead === 'Multiply' && (num as any).ops?.[0]?.numericValue !== undefined) {
                        const numOps = (num as any).ops;
                        coefficient = ce.box(['Divide', numOps[0], den]).latex;
                        variable = ce.box(['Multiply', ...numOps.slice(1)]).latex;
                    } else if (num?.numericValue !== undefined) {
                        coefficient = raw.latex;
                        variable = '1';
                    } else {
                        coefficient = ce.box(['Divide', 1, den]).latex;
                        variable = num.latex;
                    }
                }
            } else if ((expr as any).numericValue !== undefined) {
                coefficient = raw.latex;
                variable = '1';
            }
            // Parenthesised group — keep as atomic, no split
            if (head === 'Delimiter' || head === 'Parentheses' ||
                raw.latex.startsWith('\\left(') || raw.latex.startsWith('(')) {
                coefficient = '1';
                variable = raw.latex;
            }
        } catch (_) { /* keep defaults */ }

        terms.push({
            id: `${side}-${idx}`,
            latex: raw.latex,
            sign: raw.sign,
            coefficient,
            variable,
            side,
        });
    });

    return terms;
}

function gcd(a: number, b: number): number {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y !== 0) {
        const t = y;
        y = x % y;
        x = t;
    }
    return x;
}

function buildSelectedLatex(terms: Term[]): string {
    return terms
        .map((t, i) => (i === 0 && t.sign === '+') ? t.latex : `${t.sign}${t.latex}`)
        .join('')
        .trim();
}

function getSelectionRect(termIds: string[]): DOMRect | null {
    const elements = termIds
        .map(id => document.querySelector<HTMLElement>(`.ieq-term[data-term-id="${id}"]`))
        .filter((el): el is HTMLElement => !!el);

    if (elements.length === 0) return null;

    const rects = elements.map(el => el.getBoundingClientRect());
    const left = Math.min(...rects.map(r => r.left));
    const top = Math.min(...rects.map(r => r.top));
    const right = Math.max(...rects.map(r => r.right));
    const bottom = Math.max(...rects.map(r => r.bottom));
    return new DOMRect(left, top, right - left, bottom - top);
}

function detectFactorSuggestion(terms: Term[]): FactorSuggestion | null {
    if (terms.length < 2) return null;

    const ce = getMathEngine();
    const integerCoefficients = terms.map((term) => {
        const normalized = term.coefficient.trim();
        return /^-?\d+$/.test(normalized) ? Math.abs(parseInt(normalized, 10)) : null;
    });

    const numericGcd = integerCoefficients.every((value) => value !== null)
        ? integerCoefficients.reduce((acc, value) => gcd(acc, value as number), integerCoefficients[0] as number)
        : null;

    const symbolSets = terms.map((term) => {
        try {
            return new Set<string>(ce.parse(term.latex).symbols);
        } catch {
            return new Set<string>();
        }
    });

    const commonSymbols = symbolSets.reduce<string[]>((acc, set, index) => {
        const symbols = [...set].sort();
        if (index === 0) return symbols;
        return acc.filter(symbol => set.has(symbol));
    }, []);

    const allNegative = terms.every(term => term.sign === '-');
    const factorParts: string[] = [];

    if (numericGcd !== null && numericGcd > 1) {
        factorParts.push(String(allNegative ? -numericGcd : numericGcd));
    } else if (allNegative) {
        factorParts.push('-1');
    }

    if (commonSymbols.length > 0) {
        factorParts.push(commonSymbols[0]);
    }

    const factor = factorParts.join('');
    if (!factor || factor === '1') return null;

    try {
        const factorExpr = ce.parse(factor);
        const remainder = terms
            .map((term) => {
                const signed = `${term.sign === '-' ? '-' : ''}${term.latex}`;
                const quotient = ce.box(['Divide', ce.parse(signed), factorExpr]).simplify();
                return quotient.latex || quotient.toString();
            })
            .map((latex, index) => {
                const trimmed = latex.trim();
                if (index === 0) return trimmed;
                return trimmed.startsWith('-') ? trimmed : `+${trimmed}`;
            })
            .join('');

        if (!remainder || remainder === '0') return null;
        return { factor, remainder };
    } catch {
        return null;
    }
}

function detectExpandSuggestion(latex: string): string | null {
    const ce = getMathEngine();
    try {
        const expr = ce.parse(latex);
        const simplified = expr.simplify().latex || expr.simplify().toString();
        const head = Array.isArray(expr.json) ? expr.json[0] : null;
        if (head !== 'Multiply') return null;
        if (!simplified || simplified === latex.trim()) return null;
        return simplified;
    } catch {
        return null;
    }
}

function detectSimplifySuggestion(latex: string): string | null {
    const ce = getMathEngine();
    try {
        const simplifiedExpr = ce.parse(latex).simplify();
        const simplified = simplifiedExpr.latex || simplifiedExpr.toString();
        if (!simplified || simplified === latex.trim()) return null;
        return simplified;
    } catch {
        return null;
    }
}

// ─── Drag ghost – mounted once, moved via ref (zero React renders on move) ───

interface GhostState {
    label: string;
    mode: 'sideways' | 'downwards';
}

interface GhostHandle {
    show: (g: GhostState) => void;
    move: (x: number, y: number) => void;
    hide: () => void;
}

const DragGhost = React.forwardRef<GhostHandle, { _?: never }>((_props, ref) => {
    const elRef = useRef<HTMLDivElement>(null);
    const mathRef = useRef<any>(null);
    const stateRef = useRef<GhostState | null>(null);

    React.useImperativeHandle(ref, () => ({
        show(g) {
            stateRef.current = g;
            const el = elRef.current;
            if (!el) return;
            el.style.display = 'flex';
            el.style.background = g.mode === 'downwards'
                ? 'linear-gradient(135deg, #ff6b35, #f7931e)'
                : 'linear-gradient(135deg, #4facfe, #00f2fe)';
            if (mathRef.current) mathRef.current.value = g.label;
        },
        move(x, y) {
            const el = elRef.current;
            if (!el) return;
            el.style.transform = `translate(${x - 40}px, ${y - 24}px)`;
        },
        hide() {
            stateRef.current = null;
            const el = elRef.current;
            if (el) el.style.display = 'none';
        }
    }));

    return createPortal(
        <div
            ref={elRef}
            style={{
                display: 'none',
                position: 'fixed',
                left: 0,
                top: 0,
                zIndex: 10000000,
                pointerEvents: 'none',
                willChange: 'transform',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 20px',
                borderRadius: '20px',
                boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                border: '1.5px solid rgba(255,255,255,0.3)',
                backdropFilter: 'blur(4px)',
                transition: 'background 0.15s ease',
                minWidth: '60px',
                justifyContent: 'center',
            }}
        >
            <math-field
                ref={mathRef}
                read-only="true"
                style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'white',
                    fontSize: '1.2rem',
                    outline: 'none',
                    padding: 0,
                } as any}
            />
        </div>,
        document.body
    );
});
DragGhost.displayName = 'DragGhost';

// ─── Term Action Bar ─────────────────────────────────────────────────────────
// Hover-triggered compact action bar. Same glassy visual language as Pie Menu,
// but horizontal — doesn't conflict with the drag gesture space.

interface ActionBarInfo { term: Term; rect: DOMRect; }

const TermActionBar: React.FC<{
    info: ActionBarInfo | null;
    onApplyOperation: (op: string, value: string, meta?: Partial<BalanceOperation>) => void;
    onEnter: () => void;
    onLeave: () => void;
}> = ({ info, onApplyOperation, onEnter, onLeave }) => {
    if (!info) return null;
    const { term, rect } = info;
    const hasCoeff = term.coefficient !== '1' && term.variable !== '1';

    const actions = [
        {
            label: '⇄ Move',
            sub: term.side === 'LHS' ? '→ RHS' : '← LHS',
            color: '#4facfe',
            op: term.sign === '+' ? '-' : '+',
            val: term.latex,
        },
        ...(hasCoeff ? [{
            label: `÷ coeff`,
            sub: term.coefficient,
            color: '#f9a826',
            op: '/',
            val: term.coefficient,
            isMath: true,
        }] : []),
        {
            label: `÷ term`,
            sub: term.latex,
            color: '#f9a826',
            op: '/',
            val: term.latex,
            isMath: true,
        },
    ];

    const panelW = 60 + actions.length * 82;
    let left = rect.left + rect.width / 2 - panelW / 2;
    let top = rect.top - 56;
    left = Math.max(8, Math.min(left, window.innerWidth - panelW - 8));
    if (top < 8) top = rect.bottom + 8;

    return createPortal(
        <div
            onPointerEnter={onEnter}
            onPointerLeave={onLeave}
            style={{
                position: 'fixed',
                left,
                top,
                zIndex: 9999999,
                display: 'flex',
                alignItems: 'stretch',
                gap: '2px',
                padding: '5px',
                background: 'var(--ieq-action-bg)',
                border: '1px solid var(--ieq-action-border)',
                borderRadius: '14px',
                boxShadow: '0 12px 40px var(--ieq-action-shadow)',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                pointerEvents: 'all',
                animation: 'ieq-bar-in 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
        >
            {actions.map((action, i) => (
                <button
                    key={i}
                    onClick={(e) => { e.stopPropagation(); onApplyOperation(action.op, action.val); }}
                    title={`${action.label}: ${action.val}`}
                    style={{
                        background: `${action.color}12`,
                        border: `1px solid ${action.color}28`,
                        color: 'var(--ieq-action-text)',
                        borderRadius: '10px',
                        padding: '5px 10px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.14s',
                        fontFamily: 'inherit',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '1px',
                        minWidth: '72px',
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.background = `${action.color}22`;
                        e.currentTarget.style.borderColor = `${action.color}60`;
                        e.currentTarget.style.color = action.color;
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.background = `${action.color}12`;
                        e.currentTarget.style.borderColor = `${action.color}28`;
                        e.currentTarget.style.color = 'var(--ieq-action-text)';
                    }}
                >
                    <span>{action.label}</span>
                    <span style={{ fontSize: '0.62rem', opacity: 0.5, fontWeight: 400 }}>
                        {action.val.length > 8 ? action.val.slice(0, 8) + '…' : action.val}
                    </span>
                </button>
            ))}
        </div>,
        document.body
    );
};

const SelectionActionBar: React.FC<{
    info: SelectionActionState | null;
    onGroup: () => void;
    onFactor: () => void;
    onExpand: () => void;
    onSimplify: () => void;
    onClear: () => void;
}> = ({ info, onGroup, onFactor, onExpand, onSimplify, onClear }) => {
    if (!info) return null;

    const actionCount = 1
        + (info.simplifyResult ? 1 : 0)
        + (info.expandResult ? 1 : 0)
        + (info.factorSuggestion ? 1 : 0)
        + 1;
    const panelW = Math.max(200, actionCount * 110);
    let left = info.rect.left + info.rect.width / 2 - panelW / 2;
    let top = info.rect.bottom + 10;
    left = Math.max(8, Math.min(left, window.innerWidth - panelW - 8));
    if (top > window.innerHeight - 80) top = info.rect.top - 56;

    const renderActionButton = (
        label: string,
        preview: string,
        onClick: () => void,
        styles: { background: string; border: string; color: string }
    ) => (
        <button
            onClick={onClick}
            title={preview}
            style={{
                background: styles.background,
                border: styles.border,
                color: styles.color,
                borderRadius: '10px',
                padding: '8px 12px',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '3px',
                minWidth: '88px',
                textAlign: 'left',
            }}
        >
            <span>{label}</span>
            <span style={{ fontSize: '0.64rem', fontWeight: 500, opacity: 0.78, maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {preview}
            </span>
        </button>
    );

    return createPortal(
        <div
            style={{
                position: 'fixed',
                left,
                top,
                zIndex: 9999999,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                background: 'var(--ieq-action-bg)',
                border: '1px solid var(--ieq-action-border)',
                borderRadius: '14px',
                boxShadow: '0 12px 40px var(--ieq-action-shadow)',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
            }}
        >
            {renderActionButton(
                'Group',
                `(${info.selectedLatex})`,
                onGroup,
                {
                    background: 'rgba(79,172,254,0.12)',
                    border: '1px solid rgba(79,172,254,0.28)',
                    color: '#7ac4ff',
                }
            )}
            {info.simplifyResult && (
                renderActionButton(
                    'Simplify',
                    info.simplifyResult,
                    onSimplify,
                    {
                        background: 'rgba(196,156,255,0.14)',
                        border: '1px solid rgba(196,156,255,0.35)',
                        color: '#d0adff',
                    }
                )
            )}
            {info.expandResult && (
                renderActionButton(
                    'Expand',
                    info.expandResult,
                    onExpand,
                    {
                        background: 'rgba(255,184,77,0.14)',
                        border: '1px solid rgba(255,184,77,0.35)',
                        color: '#ffc76b',
                    }
                )
            )}
            {info.factorSuggestion ? (
                renderActionButton(
                    `Factor ${info.factorSuggestion.factor}`,
                    `${info.factorSuggestion.factor}(${info.factorSuggestion.remainder})`,
                    onFactor,
                    {
                        background: 'rgba(74,222,128,0.14)',
                        border: '1px solid rgba(74,222,128,0.35)',
                        color: '#7cf0a3',
                    }
                )
            ) : (
                <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', padding: '0 4px' }}>
                    No common factor
                </div>
            )}
            <button
                onClick={onClear}
                style={{
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: 'rgba(255,255,255,0.6)',
                    borderRadius: '10px',
                    padding: '8px 10px',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                }}
            >
                Clear
            </button>
        </div>,
        document.body
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const InteractiveEquation: React.FC<InteractiveEquationProps> = memo(({ formula, onApplyOperation }) => {
    const { t } = useLanguage();

    // ── Parsed data (expensive, memoised) ──────────────────────────────────
    const parsedData = useMemo((): ParsedEquation | null => {
        if (!formula || !formula.includes('=')) return null;
        try {
            const eqIdx = formula.indexOf('=');
            const lhsStr = formula.slice(0, eqIdx);
            const rhsStr = formula.slice(eqIdx + 1);
            return {
                lhs: parseSide(lhsStr, 'LHS'),
                rhs: parseSide(rhsStr, 'RHS'),
            };
        } catch (e) {
            console.error('[InteractiveEquation] parse error', e);
            return null;
        }
    }, [formula]);

    // ── Drag state — only for "has moved" flag + mode, NOT position ────────
    const dragRef = useRef<{
        term: Term;
        mode: 'pending' | 'sideways' | 'downwards';
        grabTarget: 'coeff' | 'var' | 'full';
        startX: number;
        startY: number;
        moved: boolean;
    } | null>(null);

    const [draggingTermId, setDraggingTermId] = useState<string | null>(null);
    const [dragMode, setDragMode] = useState<'sideways' | 'downwards' | null>(null);
    const [activeSide, setActiveSide] = useState<'LHS' | 'RHS' | null>(null);

    const ghostRef = useRef<GhostHandle | null>(null);

    // ── Hover action bar ───────────────────────────────────────────────────
    const [hoveredBar, setHoveredBar] = useState<ActionBarInfo | null>(null);
    const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearHoverTimer = () => {
        if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; }
    };

    const handleTermHoverEnter = useCallback((e: React.PointerEvent, term: Term) => {
        if (dragRef.current) return;
        clearHoverTimer();
        const rect = (e.currentTarget as HTMLElement).closest('.ieq-term')?.getBoundingClientRect();
        if (!rect) return;
        hoverTimer.current = setTimeout(() => setHoveredBar({ term, rect }), 160);
    }, []);

    const handleTermHoverLeave = useCallback(() => {
        clearHoverTimer();
        hoverTimer.current = setTimeout(() => setHoveredBar(null), 220);
    }, []);

    const handleBarEnter = useCallback(() => clearHoverTimer(), []);
    const handleBarLeave = useCallback(() => {
        clearHoverTimer();
        hoverTimer.current = setTimeout(() => setHoveredBar(null), 150);
    }, []);

    // ── Lasso selection ────────────────────────────────────────────────────
    const [selection, setSelection] = useState<{
        active: boolean;
        startX: number;
        startY: number;
        curX: number;
        curY: number;
        selectedIds: Set<string>;
    } | null>(null);
    const [selectionAction, setSelectionAction] = useState<SelectionActionState | null>(null);

    // ── Portal Hover Zoom ──────────────────────────────────────────────────
    const [portalParams, setPortalParams] = useState<{ left: number, top: number, width: number, height: number } | null>(null);
    const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const surfaceRef = useRef<HTMLDivElement>(null);
    const isHoveringRef = useRef(false);

    const handleSurfaceEnter = useCallback(() => {
        isHoveringRef.current = true;
        if (expandTimer.current) clearTimeout(expandTimer.current);
        if (dragRef.current || selection?.active) return;

        expandTimer.current = setTimeout(() => {
            const rect = surfaceRef.current?.getBoundingClientRect();
            if (rect) {
                setPortalParams({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
            }
        }, 120);
    }, [selection?.active]);

    const handleSurfaceLeave = useCallback(() => {
        isHoveringRef.current = false;
        if (expandTimer.current) clearTimeout(expandTimer.current);
        expandTimer.current = setTimeout(() => {
            if (!dragRef.current && !selection?.active) {
                setPortalParams(null);
            }
        }, 100);
    }, [selection?.active]);

    // ── Pointer handlers ───────────────────────────────────────────────────

    const handleTermPointerDown = useCallback((
        e: React.PointerEvent,
        term: Term,
        grabTarget: 'coeff' | 'var' | 'full'
    ) => {
        e.stopPropagation();
        clearHoverTimer();
        setHoveredBar(null);
        setSelectionAction(null);
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        dragRef.current = {
            term,
            mode: 'pending',
            grabTarget,
            startX: e.clientX,
            startY: e.clientY,
            moved: false,
        };
        setDraggingTermId(term.id);
    }, [clearHoverTimer]);

    const handleTermPointerMove = useCallback((e: React.PointerEvent) => {
        const d = dragRef.current;
        if (!d) return;

        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (d.mode === 'pending' && dist > 8) {
            const newMode = Math.abs(dy) > Math.abs(dx) * 0.7 ? 'downwards' : 'sideways';
            d.mode = newMode;
            d.moved = true;
            setDragMode(newMode);

            const ghost = ghostRef.current;
            if (ghost) {
                const label = newMode === 'downwards'
                    ? `\\div ${(d.grabTarget === 'coeff' && d.term.coefficient !== '1') ? d.term.coefficient : (d.grabTarget === 'var' ? d.term.variable : d.term.latex)}`
                    : `${d.term.sign === '+' ? '-' : '+'} ${d.term.latex}`;
                ghost.show({ label, mode: newMode });

                // Set which drop side is active
                setActiveSide(d.term.side === 'LHS' ? 'RHS' : 'LHS');
            }
        }

        if (d.moved) {
            ghostRef.current?.move(e.clientX, e.clientY);
        }
    }, []);

    const handleTermPointerUp = useCallback((e: React.PointerEvent) => {
        const d = dragRef.current;
        if (!d) return;
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

        ghostRef.current?.hide();
        setDraggingTermId(null);
        setDragMode(null);
        setActiveSide(null);

        if (!d.moved) {
            dragRef.current = null;
            return;
        }

        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;

        if (d.mode === 'sideways' && Math.abs(dx) > 40) {
            // Move to opposite side = sign flip
            const newSign = d.term.sign === '+' ? '-' : '+';
            onApplyOperation(newSign === '-' ? '-' : '+', d.term.latex);
        } else if (d.mode === 'downwards' && dy > 40) {
            const useCoeff = (d.grabTarget === 'coeff' || (d.grabTarget === 'full' && d.term.coefficient !== '1' && dx < 0)) && d.term.coefficient !== '1';
            const val = useCoeff ? d.term.coefficient : (d.grabTarget === 'var' ? d.term.variable : d.term.latex);
            onApplyOperation('/', val);
        }

        dragRef.current = null;
        if (!isHoveringRef.current) setPortalParams(null); // safely close portal on release if pointer left
    }, [onApplyOperation]);

    // ── Background pointer (lasso) ─────────────────────────────────────────

    const handleBgPointerDown = useCallback((e: React.PointerEvent) => {
        if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains('ieq-drop-zone')) return;
        e.stopPropagation();
        setSelectionAction(null);
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setSelection({ active: true, startX: e.clientX, startY: e.clientY, curX: e.clientX, curY: e.clientY, selectedIds: new Set() });
    }, []);

    const handleBgPointerMove = useCallback((e: React.PointerEvent) => {
        if (!selection?.active) return;
        e.stopPropagation();

        const rect = {
            left: Math.min(selection.startX, e.clientX),
            top: Math.min(selection.startY, e.clientY),
            right: Math.max(selection.startX, e.clientX),
            bottom: Math.max(selection.startY, e.clientY),
        };

        const newIds = new Set<string>();
        document.querySelectorAll<HTMLElement>('.ieq-term').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.left >= rect.left && r.right <= rect.right && r.top >= rect.top && r.bottom <= rect.bottom) {
                const id = el.dataset.termId;
                if (id) newIds.add(id);
            }
        });

        setSelection(prev => prev ? { ...prev, curX: e.clientX, curY: e.clientY, selectedIds: newIds } : prev);
    }, [selection]);

    const handleBgPointerUp = useCallback((e: React.PointerEvent) => {
        if (!selection) return;
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

        if (selection.selectedIds.size > 0) {
            const allTerms = [...(parsedData?.lhs ?? []), ...(parsedData?.rhs ?? [])];
            const selected = allTerms.filter(t => selection.selectedIds.has(t.id));
            const sides = new Set(selected.map(t => t.side));
            if (selected.length > 0 && sides.size === 1) {
                const side = selected[0].side;
                const sideTerms = side === 'LHS' ? (parsedData?.lhs ?? []) : (parsedData?.rhs ?? []);
                const selectedIndexes = sideTerms
                    .map((term, index) => selection.selectedIds.has(term.id) ? index : -1)
                    .filter(index => index >= 0);
                const isContiguous = selectedIndexes.every((index, i) => i === 0 || index === selectedIndexes[i - 1] + 1);

                if (isContiguous) {
                    const contiguousTerms = sideTerms.filter(term => selection.selectedIds.has(term.id));
                    const combined = buildSelectedLatex(contiguousTerms);
                    const rect = getSelectionRect(contiguousTerms.map(term => term.id));
                    setSelectionAction(rect ? {
                        rect,
                        side: side === 'LHS' ? 'lhs' : 'rhs',
                        selectedLatex: combined,
                        factorSuggestion: detectFactorSuggestion(contiguousTerms),
                        expandResult: contiguousTerms.length === 1 ? detectExpandSuggestion(combined) : null,
                        simplifyResult: detectSimplifySuggestion(combined),
                    } : null);
                }
            }
        }
        setSelection(null);
        if (!isHoveringRef.current) setPortalParams(null); // safely close portal on lasso finish if pointer left
    }, [selection, parsedData]);

    const applySelectionGrouping = useCallback(() => {
        if (!selectionAction) return;
        onApplyOperation('(', selectionAction.selectedLatex, {
            targetSide: selectionAction.side,
        });
        setSelectionAction(null);
    }, [selectionAction, onApplyOperation]);

    const applySelectionFactor = useCallback(() => {
        if (!selectionAction?.factorSuggestion) return;
        onApplyOperation('factor', selectionAction.selectedLatex, {
            targetSide: selectionAction.side,
            factor: selectionAction.factorSuggestion.factor,
            result: selectionAction.factorSuggestion.remainder,
        });
        setSelectionAction(null);
    }, [selectionAction, onApplyOperation]);

    const applySelectionExpand = useCallback(() => {
        if (!selectionAction?.expandResult) return;
        onApplyOperation('expand', selectionAction.selectedLatex, {
            targetSide: selectionAction.side,
            result: selectionAction.expandResult,
        });
        setSelectionAction(null);
    }, [selectionAction, onApplyOperation]);

    const applySelectionSimplify = useCallback(() => {
        if (!selectionAction?.simplifyResult) return;
        onApplyOperation('simplify', selectionAction.selectedLatex, {
            targetSide: selectionAction.side,
            result: selectionAction.simplifyResult,
        });
        setSelectionAction(null);
    }, [selectionAction, onApplyOperation]);

    // ── Render term ────────────────────────────────────────────────────────

    const renderTerm = (term: Term, index: number) => {
        const isDragging = draggingTermId === term.id;
        const isSelected = selection?.selectedIds.has(term.id) ?? false;
        const hasCoeff = term.coefficient !== '1' && term.variable !== '1' && term.variable !== '';

        const termBaseStyle: React.CSSProperties = {
            display: 'flex',
            alignItems: 'stretch',
            borderRadius: '8px',
            transition: 'opacity 0.15s, box-shadow 0.15s, transform 0.15s',
            opacity: isDragging ? 0.25 : 1,
            touchAction: 'none',
            boxShadow: isSelected
                ? '0 0 0 2px var(--accent-bright), 0 4px 16px rgba(74,222,128,0.25)'
                : '0 2px 8px var(--ieq-pill-shadow)',
        };

        const pillStyle = (part: 'single' | 'left' | 'right'): React.CSSProperties => ({
            padding: '3px 3px',
            cursor: 'grab',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: isSelected
                ? 'var(--ieq-pill-bg-selected)'
                : 'var(--ieq-pill-bg)',
            border: '1px solid var(--ieq-pill-border)',
            borderRadius: part === 'single' ? '8px'
                : part === 'left' ? '8px 0 0 8px'
                    : '0 8px 8px 0',
            borderRight: part === 'left' ? '1px solid var(--ieq-pill-border-inner)' : undefined,
            borderLeft: part === 'right' ? 'none' : undefined,
            transition: 'background 0.15s',
            minWidth: '20px',
        });

        return (
            <div key={term.id} style={{ display: 'flex', alignItems: 'center' }}>
                {(index > 0 || term.sign === '-') && (
                    <span style={{
                        margin: '0 4px',
                        fontSize: '1.05rem',
                        fontWeight: 600,
                        color: term.sign === '-' ? 'var(--ieq-sign-minus)' : 'var(--ieq-sign-plus)',
                        userSelect: 'none',
                        transition: 'color 0.15s',
                    }}>
                        {term.sign}
                    </span>
                )}
                <div
                    className="ieq-term nodrag"
                    data-term-id={term.id}
                    style={termBaseStyle}
                    onPointerEnter={(e) => handleTermHoverEnter(e, term)}
                    onPointerLeave={handleTermHoverLeave}
                >
                    {hasCoeff ? (
                        <>
                            <div
                                style={pillStyle('left')}
                                onPointerDown={(e) => handleTermPointerDown(e, term, 'coeff')}
                                onPointerMove={handleTermPointerMove}
                                onPointerUp={handleTermPointerUp}
                            >
                                <MathInput readOnly value={term.coefficient} style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '0.92rem', padding: 0 }} />
                            </div>
                            <div
                                style={pillStyle('right')}
                                onPointerDown={(e) => handleTermPointerDown(e, term, 'var')}
                                onPointerMove={handleTermPointerMove}
                                onPointerUp={handleTermPointerUp}
                            >
                                <MathInput readOnly value={term.variable} style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '0.92rem', padding: 0 }} />
                            </div>
                        </>
                    ) : (
                        <div
                            style={pillStyle('single')}
                            onPointerDown={(e) => handleTermPointerDown(e, term, 'full')}
                            onPointerMove={handleTermPointerMove}
                            onPointerUp={handleTermPointerUp}
                        >
                            <MathInput readOnly value={term.latex} style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '0.92rem', padding: 0 }} />
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // ── Drop zone style ────────────────────────────────────────────────────

    const dropZoneStyle = (side: 'LHS' | 'RHS'): React.CSSProperties => {
        const isTarget = activeSide === side && dragMode === 'sideways';
        return {
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '2px',
            padding: '8px 6px',
            borderRadius: '10px',
            border: isTarget
                ? '2px dashed var(--ieq-drop-border)'
                : '2px solid transparent',
            background: isTarget
                ? 'var(--ieq-drop-bg)'
                : 'transparent',
            transition: 'all 0.2s ease',
            minHeight: '42px',
            minWidth: '40px',
            flex: 1,
        };
    };

    // ── Hint line ──────────────────────────────────────────────────────────

    const HintLine = () => (
        <div style={{
            position: 'absolute',
            bottom: '6px',
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: '0.6rem',
            color: 'var(--ieq-hint)',
            pointerEvents: 'none',
            letterSpacing: '0.04em',
            userSelect: 'none',
        }}>
            ← drag across to move · drag down to divide ↓
        </div>
    );

    // ── Error state ────────────────────────────────────────────────────────

    if (!parsedData) {
        return (
            <div style={{
                opacity: 0.5,
                fontSize: '0.75rem',
                padding: '20px',
                textAlign: 'center',
                background: 'var(--ieq-surface-bg)',
                borderRadius: '12px',
                border: '1px dashed var(--ieq-surface-border)',
                color: 'var(--ieq-hint)',
            }}>
                {t('nodes.balance.error_parsing')}
            </div>
        );
    }

    const surfaceContent = (
        <>
            {/* LHS */}
            <div className="ieq-drop-zone" style={dropZoneStyle('LHS')}>
                {parsedData.lhs.map((t, i) => renderTerm(t, i))}
                {parsedData.lhs.length === 0 && (
                    <span style={{ opacity: 0.2, fontSize: '1.2rem' }}>0</span>
                )}
            </div>

            {/* Equals sign */}
            <div style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--accent-bright)',
                padding: '0 4px',
                userSelect: 'none',
                flexShrink: 0,
                opacity: 0.9,
                textShadow: '0 0 12px rgba(74,222,128,0.4)',
            }}>
                =
            </div>

            {/* RHS */}
            <div className="ieq-drop-zone" style={dropZoneStyle('RHS')}>
                {parsedData.rhs.map((t, i) => renderTerm(t, i))}
                {parsedData.rhs.length === 0 && (
                    <span style={{ opacity: 0.2, fontSize: '1.2rem' }}>0</span>
                )}
            </div>

            <HintLine />
        </>
    );

    return (
        <>
            {/* ── Main equation surface (Inline) ── */}
            <div
                ref={surfaceRef}
                className="nodrag ieq-surface ieq-inline-surface"
                onPointerEnter={handleSurfaceEnter}
                onPointerLeave={handleSurfaceLeave}
                onPointerDown={handleBgPointerDown}
                onPointerMove={handleBgPointerMove}
                onPointerUp={handleBgPointerUp}
                style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0',
                    background: 'var(--ieq-surface-bg)',
                    borderRadius: '14px',
                    border: '1px solid var(--ieq-surface-border)',
                    minHeight: '58px',
                    overflow: 'visible',
                    touchAction: 'none',
                    paddingBottom: '18px',
                    opacity: portalParams ? 0 : 1, // Hide inline when portal active
                }}
            >
                {surfaceContent}
            </div>

            {/* ── Portal Equation Surface (Zoomed) ── */}
            {portalParams && createPortal(
                <div
                    className="nodrag ieq-surface"
                    onPointerEnter={handleSurfaceEnter}
                    onPointerLeave={handleSurfaceLeave}
                    onPointerDown={handleBgPointerDown}
                    onPointerMove={handleBgPointerMove}
                    onPointerUp={handleBgPointerUp}
                    style={{
                        position: 'fixed',
                        left: portalParams.left,
                        top: portalParams.top,
                        width: portalParams.width,
                        // Height is deliberately omitted to allow flex wrap content to grow vertically
                        zIndex: 9999990,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0',
                        background: 'var(--ieq-portal-bg)',
                        borderRadius: '14px',
                        border: '1px solid var(--ieq-portal-border)',
                        minHeight: '58px',
                        touchAction: 'none',
                        paddingBottom: '18px',
                        boxShadow: '0 30px 80px var(--ieq-portal-shadow-out), inset 0 1px 0 var(--ieq-portal-shadow-in)',
                        transformOrigin: 'center center',
                        animation: 'ieq-portal-zoom 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
                    }}
                >
                    {surfaceContent}
                </div>,
                document.body
            )}

            {/* ── Lasso overlay ── */}
            {selection?.active && createPortal(
                <div style={{
                    position: 'fixed',
                    left: Math.min(selection.startX, selection.curX),
                    top: Math.min(selection.startY, selection.curY),
                    width: Math.abs(selection.curX - selection.startX),
                    height: Math.abs(selection.curY - selection.startY),
                    background: 'rgba(74, 222, 128, 0.07)',
                    border: '1.5px dashed rgba(74, 222, 128, 0.5)',
                    borderRadius: '4px',
                    pointerEvents: 'none',
                    zIndex: 9999999,
                }} />,
                document.body
            )}

            {/* ── Drag ghost — ref-controlled, no setState on move ── */}
            <DragGhost ref={ghostRef} />

            <SelectionActionBar
                info={selectionAction}
                onGroup={applySelectionGrouping}
                onFactor={applySelectionFactor}
                onExpand={applySelectionExpand}
                onSimplify={applySelectionSimplify}
                onClear={() => setSelectionAction(null)}
            />

            {/* ── Hover action bar ── */}
            <TermActionBar
                info={hoveredBar}
                onApplyOperation={(op, val) => { setHoveredBar(null); onApplyOperation(op, val); }}
                onEnter={handleBarEnter}
                onLeave={handleBarLeave}
            />

            <style>{`
                :root {
                    --ieq-surface-bg: rgba(0,0,0,0.18);
                    --ieq-surface-border: rgba(255,255,255,0.07);
                    --ieq-portal-bg: #151921;
                    --ieq-portal-border: rgba(255,255,255,0.15);
                    --ieq-portal-shadow-out: rgba(0,0,0,0.6);
                    --ieq-portal-shadow-in: rgba(255,255,255,0.05);
                    --ieq-pill-bg: rgba(255,255,255,0.07);
                    --ieq-pill-border: rgba(255,255,255,0.12);
                    --ieq-pill-border-inner: rgba(255,255,255,0.04);
                    --ieq-pill-bg-selected: rgba(74, 222, 128, 0.18);
                    --ieq-pill-hover: rgba(255,255,255,0.11);
                    --ieq-pill-shadow: rgba(0,0,0,0.2);
                    --ieq-sign-plus: rgba(255,255,255,0.6);
                    --ieq-sign-minus: rgba(255,120,80,0.9);
                    --ieq-drop-bg: rgba(79, 172, 254, 0.06);
                    --ieq-drop-border: rgba(79, 172, 254, 0.7);
                    --ieq-hint: rgba(255,255,255,0.2);
                    --ieq-action-bg: rgba(20, 24, 30, 0.95);
                    --ieq-action-border: rgba(255,255,255,0.12);
                    --ieq-action-shadow: rgba(0,0,0,0.5);
                    --ieq-action-text: rgba(255,255,255,0.75);
                }
                [data-theme='light'] {
                    --ieq-surface-bg: rgba(14,47,11,0.04);
                    --ieq-surface-border: rgba(14,47,11,0.08);
                    --ieq-portal-bg: #f5f7f9;
                    --ieq-portal-border: rgba(14,47,11,0.15);
                    --ieq-portal-shadow-out: rgba(0,0,0,0.15);
                    --ieq-portal-shadow-in: rgba(255,255,255,0.8);
                    --ieq-pill-bg: rgba(14,47,11,0.05);
                    --ieq-pill-border: rgba(14,47,11,0.1);
                    --ieq-pill-border-inner: rgba(14,47,11,0.04);
                    --ieq-pill-bg-selected: rgba(74, 222, 128, 0.25);
                    --ieq-pill-hover: rgba(14,47,11,0.08);
                    --ieq-pill-shadow: rgba(14,47,11,0.15);
                    --ieq-sign-plus: rgba(14,47,11,0.4);
                    --ieq-sign-minus: rgba(255,120,80,0.9);
                    --ieq-drop-bg: rgba(79, 172, 254, 0.08);
                    --ieq-drop-border: rgba(79, 172, 254, 0.7);
                    --ieq-hint: rgba(14,47,11,0.25);
                    --ieq-action-bg: rgba(255, 255, 255, 0.95);
                    --ieq-action-border: rgba(14,47,11,0.15);
                    --ieq-action-shadow: rgba(0,0,0,0.2);
                    --ieq-action-text: rgba(14,47,11,0.8);
                }
                .ieq-term:hover {
                    box-shadow: 0 6px 20px var(--ieq-pill-shadow) !important;
                    transform: translateY(-2px);
                }
                .ieq-term:active {
                    cursor: grabbing !important;
                }
                .ieq-surface > .ieq-drop-zone > div > .ieq-term:hover > div {
                    background: var(--ieq-pill-hover) !important;
                }
                @keyframes ieq-ghost-pop {
                    from { transform: scale(0.8); opacity: 0; }
                    to   { transform: scale(1);   opacity: 1; }
                }
                @keyframes ieq-bar-in {
                    from { opacity: 0; transform: translateY(6px) scale(0.94); }
                    to   { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes ieq-portal-zoom {
                    from { transform: scale(1); opacity: 0.8; }
                    to   { transform: scale(1.5); opacity: 1; }
                }
            `}</style>
        </>
    );
});

InteractiveEquation.displayName = 'InteractiveEquation';
