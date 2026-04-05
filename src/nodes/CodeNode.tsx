import { memo } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import useStore, { type AppState, type AppNode, type NodeData } from '../store/useStore';
import { NodeFrame } from '../components/NodeFrame';
import { Icons } from '../components/Icons';

const defaultCode = `return inputs.input;`;

const stringifyOutput = (value: unknown): string => {
    if (value === undefined) return '';
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
};

const parseValue = (value: string): unknown => {
    const trimmed = value.trim();
    if (trimmed === '') return '';
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed === 'null') return null;

    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric) && trimmed === String(numeric)) {
        return numeric;
    }

    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
            return JSON.parse(trimmed);
        } catch {
            return value;
        }
    }

    return value;
};

const buildInputs = (node: AppNode) => {
    const inputs: Record<string, unknown> = {};
    const handleMap = new Map((node.data.handles || []).map(handle => [handle.id, handle.label || handle.id]));

    Object.entries(node.data.inputs || {}).forEach(([handleId, rawValue]) => {
        const parsedValue = parseValue(rawValue);
        const label = handleMap.get(handleId);

        inputs[handleId] = parsedValue;

        if (label) {
            inputs[label] = parsedValue;
        }
    });

    if (node.data.input !== undefined) {
        inputs.input = parseValue(node.data.input);
    }

    return inputs;
};

type CodeExecutionResult = {
    result?: unknown;
    error?: unknown;
    outputs?: Record<string, unknown>;
};

export const executeCodeNode = (node: AppNode, state: AppState): void => {
    const code = node.data.code?.trim() || defaultCode;
    const inputs = buildInputs(node);

    try {
        const executor = new Function(
            'inputs',
            'helpers',
            `"use strict";
${code}`
        ) as (inputs: Record<string, unknown>, helpers: Record<string, unknown>) => unknown;

        const raw = executor(inputs, {
            stringify: stringifyOutput,
            parse: parseValue
        });

        const payload: CodeExecutionResult =
            raw && typeof raw === 'object' && !Array.isArray(raw) &&
            ('result' in (raw as Record<string, unknown>) || 'outputs' in (raw as Record<string, unknown>) || 'error' in (raw as Record<string, unknown>))
                ? raw as CodeExecutionResult
                : { result: raw };

        const resultText = stringifyOutput(payload.result);
        const errorText = payload.error === undefined ? '' : stringifyOutput(payload.error);

        state.updateNodeData(node.id, {
            value: resultText,
            error: errorText || undefined,
            outputs: {
                'h-result': resultText,
                'h-error': errorText,
            }
        });
        state.evaluateGraph();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        state.updateNodeData(node.id, {
            value: '',
            error: message,
            outputs: {
                'h-result': '',
                'h-error': message,
            }
        });
        state.evaluateGraph();
    }
};

export const CodeNode = memo(function CodeNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    const executeNode = useStore((state: AppState) => state.executeNode);

    return (
        <NodeFrame
            id={id}
            data={data}
            selected={selected}
            icon={<Icons.Code />}
            defaultLabel="Code"
            className="code-node"
            minWidth={260}
            minHeight={220}
            onManualRun={() => executeNode(id, true)}
            headerExtras={
                <button
                    onClick={() => executeNode(id, true)}
                    className="variant-toggle"
                    style={{
                        fontSize: '0.6rem',
                        padding: '2px 6px',
                        background: 'var(--accent)',
                        color: '#fff'
                    }}
                >
                    RUN
                </button>
            }
            customHandleDescriptions={{
                'h-in': 'Generic input value',
                'h-result': 'Execution result',
                'h-error': 'Execution error'
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                <textarea
                    className="nodrag"
                    spellCheck={false}
                    value={data.code ?? defaultCode}
                    onChange={(event) => updateNodeData(id, { code: event.target.value, language: 'javascript' })}
                    style={{
                        width: '100%',
                        minHeight: '112px',
                        resize: 'vertical',
                        background: 'rgba(10, 14, 24, 0.92)',
                        border: '1px solid var(--border-node)',
                        borderRadius: '8px',
                        color: '#d7e2ff',
                        padding: '10px',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                        fontSize: '0.78rem',
                        lineHeight: 1.45,
                        outline: 'none',
                        boxSizing: 'border-box'
                    }}
                />
                <div style={{ display: 'grid', gap: '6px' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-sub)' }}>
                        Input: <span style={{ color: 'var(--text-main)' }}>{data.input ?? 'None'}</span>
                    </div>
                    <div style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '8px',
                        padding: '8px',
                        minHeight: '42px'
                    }}>
                        <div style={{ fontSize: '0.62rem', color: 'var(--text-sub)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            Result
                        </div>
                        <pre style={{
                            margin: 0,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                            fontSize: '0.74rem',
                            color: data.error ? '#fca5a5' : 'var(--text-main)'
                        }}>
                            {data.error || data.value || 'Ready'}
                        </pre>
                    </div>
                </div>
            </div>
        </NodeFrame>
    );
});
