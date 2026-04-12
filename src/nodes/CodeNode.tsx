import { memo, useEffect } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import useStore, { type AppState, type AppNode, type NodeData } from '../store/useStore';
import { NodeFrame } from '../components/NodeFrame';
import { Icons } from '../components/Icons';
import type { MathValue } from '../types/mathTypes';

const defaultCode = `return inputs.input;`;
const GLOBAL_DECLARATION_PATTERN = /^(\s*)global\s+([A-Za-z_$][\w$]*)\s*=\s*(.+);?\s*$/gm;

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

const buildGlobals = (state: AppState) => {
    const globals: Record<string, unknown> = {};

    Object.entries(state.globalVars || {}).forEach(([name, rawValue]) => {
        const parsedValue = parseValue(rawValue);
        globals[name] = parsedValue;

        if (name.startsWith('$') && name.length > 1) {
            globals[name.slice(1)] = parsedValue;
        }
    });

    return globals;
};

const normalizeGlobalName = (name: string) => name.startsWith('$') ? name : `$${name}`;

const transformGlobalDeclarations = (code: string) =>
    code.replace(GLOBAL_DECLARATION_PATTERN, (_match, indent: string, name: string, expression: string) => {
        const normalizedName = normalizeGlobalName(name);
        return `${indent}const ${name} = helpers.setGlobal('${normalizedName}', (${expression}));`;
    });

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

const buildTypedInputs = (node: AppNode) => {
    const typedInputs: Record<string, MathValue> = {};
    const handleMap = new Map((node.data.handles || []).map(handle => [handle.id, handle.label || handle.id]));

    Object.entries(node.data.typedInputs || {}).forEach(([handleId, typedValue]) => {
        const label = handleMap.get(handleId);

        typedInputs[handleId] = typedValue;

        if (label) {
            typedInputs[label] = typedValue;
        }
    });

    return typedInputs;
};

type CodeExecutionResult = {
    result?: unknown;
    error?: unknown;
    outputs?: Record<string, unknown>;
};

// Worker management
let workerInstance: Worker | null = null;
let pendingRequests = new Map<string, { resolve: (val: any) => void, reject: (err: any) => void }>();

const getWorker = () => {
    if (!workerInstance) {
        // Vite worker import syntax
        workerInstance = new Worker(new URL('../workers/codeRunner.worker.ts', import.meta.url), { type: 'module' });
        workerInstance.onmessage = (e) => {
            const { requestId, type, result, outputs, globalUpdates, error } = e.data;
            const pending = pendingRequests.get(requestId);
            if (!pending) return;

            if (type === 'success') {
                pending.resolve({ result, outputs, globalUpdates });
            } else {
                pending.reject(error);
            }
            pendingRequests.delete(requestId);
        };
    }
    return workerInstance;
};

export const executeCodeNode = async (node: AppNode, state: AppState): Promise<void> => {
    let baseCode = node.data.code?.trim() || defaultCode;
    
    // [NEW] Extract input & output declarations
    const INPUT_DECLARATION_REGEX = /^\s*input\s+([A-Za-z_$][\w$]*)\s+as\s+\[([a-zA-Z_]+)\]\s*$/gm;
    const OUTPUT_DECLARATION_REGEX = /^\s*output\s+([A-Za-z_$][\w$]*)\s+as\s+\[([a-zA-Z_]+)\]\s*$/gm;
    
    const declaredVars: string[] = [];
    const outputDeclarations: Record<string, string> = {};
    
    Array.from(baseCode.matchAll(INPUT_DECLARATION_REGEX)).forEach(match => declaredVars.push(match[1]));
    Array.from(baseCode.matchAll(OUTPUT_DECLARATION_REGEX)).forEach(match => {
        outputDeclarations[match[1]] = match[2];
    });
    
    // Strip declarations
    let strippedCode = baseCode.replace(INPUT_DECLARATION_REGEX, '');
    strippedCode = strippedCode.replace(OUTPUT_DECLARATION_REGEX, '').trim();
    
    // Inject destructured variables
    const preamble = declaredVars.length > 0 ? `const { ${declaredVars.join(', ')} } = inputs;\n` : '';
    
    const code = transformGlobalDeclarations(preamble + strippedCode);
    const inputs = buildInputs(node);
    const typedInputs = buildTypedInputs(node);
    const globals = buildGlobals(state);

    const requestId = `${node.id}-${Date.now()}`;
    const worker = getWorker();

    try {
        const response = await new Promise<any>((resolve, reject) => {
            pendingRequests.set(requestId, { resolve, reject });
            worker.postMessage({ requestId, code, inputs, typedInputs, globals, outputDeclarations });

            // Safety timeout
            setTimeout(() => {
                if (pendingRequests.has(requestId)) {
                    pendingRequests.delete(requestId);
                    reject('Execution Timeout (可能存在無窮迴圈)');
                }
            }, 3000);
        });

        const { result, outputs: customOutputs, globalUpdates } = response;

        // Apply global updates from worker
        if (globalUpdates) {
            Object.entries(globalUpdates).forEach(([name, value]) => {
                state.setGlobalVar(name as string, value as string);
            });
        }

        const payload: CodeExecutionResult =
            result && typeof result === 'object' && !Array.isArray(result) &&
            ('result' in (result as Record<string, unknown>) || 'outputs' in (result as Record<string, unknown>) || 'error' in (result as Record<string, unknown>))
                ? result as CodeExecutionResult
                : { result };

        // [NEW] Handle unboxing for display, but keep object for output handles
        const displayValue = (val: any) => {
            if (val && typeof val === 'object' && 'value' in val) return stringifyOutput(val.value);
            return stringifyOutput(val);
        };

        const resultText = displayValue(payload.result);
        const errorText = payload.error === undefined ? '' : displayValue(payload.error);

        const newOutputs: Record<string, string> = {
            'h-result': resultText,
            'h-error': stringifyOutput(payload.error),
        };
        const newTypedOutputs: Record<string, MathValue> = {};

        if (payload.result && typeof payload.result === 'object' && 'type' in payload.result && 'value' in payload.result) {
            newTypedOutputs['h-result'] = payload.result as MathValue;
        }
        
        // Serialize custom outputs (already boxed in worker)
        Object.entries(customOutputs || {}).forEach(([key, val]) => {
            newOutputs[`h-out-${key}`] = displayValue(val);
            if (val && typeof val === 'object' && 'type' in val && 'value' in val) {
                newTypedOutputs[`h-out-${key}`] = val as MathValue;
            }
        });

        state.updateNodeData(node.id, {
            value: resultText,
            error: errorText || undefined,
            outputs: newOutputs,
            typedOutputs: newTypedOutputs
        });
        state.evaluateGraph();
    } catch (error) {
        const message = typeof error === 'string' ? error : (error instanceof Error ? error.message : String(error));
        state.updateNodeData(node.id, {
            value: '',
            error: message,
            outputs: {
                'h-result': '',
                'h-error': message,
            },
            typedOutputs: {}
        });
        state.evaluateGraph();
    }
};

export const CodeNode = memo(function CodeNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    const executeNode = useStore((state: AppState) => state.executeNode);

    const currentCode = data.code ?? defaultCode;

    // [NEW] Sync handles based on input/output declarations
    useEffect(() => {
        const INPUT_DECLARATION_REGEX = /^\s*input\s+([A-Za-z_$][\w$]*)\s+as\s+\[([a-zA-Z_]+)\]\s*$/gm;
        const OUTPUT_DECLARATION_REGEX = /^\s*output\s+([A-Za-z_$][\w$]*)\s+as\s+\[([a-zA-Z_]+)\]\s*$/gm;
        
        const newInputs: { name: string, type: string }[] = [];
        Array.from(currentCode.matchAll(INPUT_DECLARATION_REGEX)).forEach(match => newInputs.push({ name: match[1], type: match[2] }));
        
        const newOutputs: { name: string, type: string }[] = [];
        Array.from(currentCode.matchAll(OUTPUT_DECLARATION_REGEX)).forEach(match => newOutputs.push({ name: match[1], type: match[2] }));

        const currentHandles = data.handles || [];
        
        let newInputHandles: any[] = [];
        if (newInputs.length > 0) {
            newInputHandles = newInputs.map((inp, index) => {
                const spacing = 100 / (newInputs.length + 1);
                return {
                    id: `h-in-${inp.name}`,
                    type: 'input',
                    position: 'left',
                    offset: (index + 1) * spacing,
                    label: inp.name
                };
            });
        } else {
            // Fallback to generic handle if no declarations
            newInputHandles = [{ id: 'h-in', type: 'input', position: 'left', offset: 50 }];
        }

        let newOutputHandles: any[] = [];
        if (newOutputs.length > 0) {
            newOutputHandles = newOutputs.map((out, index) => {
                const spacing = 100 / (newOutputs.length + 1);
                return {
                    id: `h-out-${out.name}`,
                    type: 'output',
                    position: 'right',
                    offset: (index + 1) * spacing,
                    label: out.name
                };
            });
        }

        const baseOutputHandles = currentHandles.filter((h: any) => h.type === 'output' && (h.id === 'h-result' || h.id === 'h-error'));
        if (baseOutputHandles.length === 0) {
            baseOutputHandles.push(
                { id: 'h-result', type: 'output', position: 'right', offset: 33 },
                { id: 'h-error', type: 'output', position: 'right', offset: 66 }
            );
        }

        const nextHandles = [...newInputHandles, ...newOutputHandles, ...baseOutputHandles];

        if (JSON.stringify(currentHandles) !== JSON.stringify(nextHandles)) {
            // Uses a requestAnimationFrame to avoid update-during-render React warnings if triggered immediately
            requestAnimationFrame(() => updateNodeData(id, { handles: nextHandles }));
        }
    }, [currentCode, id, updateNodeData, data.handles]);

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
