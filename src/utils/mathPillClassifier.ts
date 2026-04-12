import { getTypeById } from '../config/mathTypeCatalog';
import type { MathCapability, MathTypeId, MathValue } from '../types/mathTypes';

type ClassifyMathPillOptions = {
    name?: string;
    nodeId: string;
    handleId: string;
};

const getCapabilities = (type: MathTypeId): MathCapability[] => getTypeById(type)?.capabilities || [];

const createValue = (
    type: MathTypeId,
    raw: string,
    value: unknown,
    options: ClassifyMathPillOptions,
    meta: NonNullable<MathValue['meta']> = {}
): MathValue => ({
    type,
    value,
    text: raw,
    latex: raw,
    display: raw,
    tags: getCapabilities(type),
    meta: {
        source: 'textNode.mathPill',
        name: options.name || undefined,
        isGlobal: options.name?.startsWith('$') || undefined,
        sourceNodeId: options.nodeId,
        sourceHandleId: options.handleId,
        parseStatus: 'classified',
        confidence: 0.8,
        ...meta,
    },
});

const normalizeLatexNumber = (raw: string) => raw
    .replace(/,/g, '')
    .replace(/\\,/g, '')
    .trim();

const parseFraction = (raw: string) => {
    const trimmed = normalizeLatexNumber(raw);
    const latexMatch = trimmed.match(/^\\frac\{(-?\d+)\}\{(-?\d+)\}$/);
    const slashMatch = trimmed.match(/^(-?\d+)\/(-?\d+)$/);
    const match = latexMatch || slashMatch;
    if (!match) return null;

    const numerator = Number(match[1]);
    const denominator = Number(match[2]);
    if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || denominator === 0) return null;
    return { numerator, denominator };
};

const parseList = (raw: string) => {
    const normalized = raw
        .replace(/\\left\[/g, '[')
        .replace(/\\right\]/g, ']')
        .replace(/\\lbrack/g, '[')
        .replace(/\\rbrack/g, ']')
        .trim();

    if (!normalized.startsWith('[') || !normalized.endsWith(']')) return null;

    try {
        const parsed = JSON.parse(normalized);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        const body = normalized.slice(1, -1).trim();
        if (!body) return [];
        return body.split(',').map(item => item.trim());
    }
};

const hasTopLevelRelation = (raw: string, relationPattern: RegExp) => relationPattern.test(raw);

export const classifyMathPillValue = (rawValue: string, options: ClassifyMathPillOptions): MathValue => {
    const raw = rawValue.trim();

    if (raw === '\\top') {
        return createValue('boolean', rawValue, true, options, { exact: true, confidence: 1 });
    }

    if (raw === '\\bot') {
        return createValue('boolean', rawValue, false, options, { exact: true, confidence: 1 });
    }

    if (/^-?\d+$/.test(normalizeLatexNumber(raw))) {
        return createValue('integer', rawValue, Number(normalizeLatexNumber(raw)), options, { exact: true, confidence: 1 });
    }

    const rational = parseFraction(raw);
    if (rational) {
        return createValue('rational', rawValue, rational, options, { exact: true, confidence: 0.95 });
    }

    if (/^-?(?:\d+\.\d+|\d+\.\d*|\.\d+)$/.test(normalizeLatexNumber(raw))) {
        return createValue('real', rawValue, Number(normalizeLatexNumber(raw)), options, { approximate: true, confidence: 0.95 });
    }

    const list = parseList(raw);
    if (list) {
        return createValue('list', rawValue, list, options, {
            shape: [list.length],
            confidence: 0.85,
        });
    }

    if (hasTopLevelRelation(raw, /(?:<=|>=|<|>|\\leq|\\geq|\\lt|\\gt)/)) {
        return createValue('inequality', rawValue, { source: raw }, options, { confidence: 0.8 });
    }

    if (hasTopLevelRelation(raw, /(?<![<>])=(?!=)/)) {
        const [left, ...rightParts] = raw.split('=');
        return createValue('equation', rawValue, {
            left: left.trim(),
            right: rightParts.join('=').trim(),
            relation: '=',
        }, options, { confidence: 0.85 });
    }

    if (/^[A-Za-z_$][\w$]*$/.test(raw)) {
        return createValue('symbol', rawValue, raw, options, { exact: true, confidence: 0.9 });
    }

    return createValue('expression', rawValue, { source: raw }, options, { confidence: 0.7 });
};
