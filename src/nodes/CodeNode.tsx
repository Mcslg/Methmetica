import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import useStore, { type AppState, type AppNode, type NodeData } from '../store/useStore';
import { NodeFrame } from '../components/NodeFrame';
import { Icons } from '../components/Icons';
import type { MathValue } from '../types/mathTypes';
import { mathTypeCatalog } from '../config/mathTypeCatalog';

const defaultCode = `return inputs.input;`;
const GLOBAL_DECLARATION_PATTERN = /^(\s*)global\s+([A-Za-z_$][\w$]*)\s*=\s*(.+);?\s*$/gm;
const DECLARED_TYPE_PATTERN = String.raw`(?:\[[A-Za-z_,\s]+\]|[A-Za-z_]+)`;

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
const parseDeclaredTypes = (typeName: string) => typeName
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map(type => type.trim())
    .filter(Boolean);

const formatDeclaredTypes = (types: string[]) => types.length > 1 ? `[${types.join(',')}]` : (types[0] || 'unknown');

const transformGlobalDeclarations = (code: string) =>
    code.replace(GLOBAL_DECLARATION_PATTERN, (_match, indent: string, name: string, expression: string) => {
        const normalizedName = normalizeGlobalName(name);
        return `${indent}const ${name} = helpers.setGlobal('${normalizedName}', (${expression}));`;
    });

const buildOutputCollectionTrailer = (outputNames: string[]) => {
    if (outputNames.length === 0) return '';

    const assignments = outputNames.map(name => {
        const quotedName = JSON.stringify(name);
        return `if (typeof ${name} !== 'undefined') outputs[${quotedName}] = ${name};`;
    }).join('\n');

    return `\n${assignments}`;
};

const getTypeCompletionContext = (code: string, cursorIndex: number) => {
    const lineStart = code.lastIndexOf('\n', Math.max(0, cursorIndex - 1)) + 1;
    const lineBeforeCursor = code.slice(lineStart, cursorIndex);
    const match = lineBeforeCursor.match(/^\s*(?:input|output)\s+[A-Za-z_$][\w$]*\s+as\s+(\[?)([A-Za-z_,\s]*)$/);

    if (!match) return null;

    const hasBracket = match[1] === '[';
    const rawTypeText = match[2] || '';
    if (!hasBracket && rawTypeText.includes(',')) return null;

    const segmentStart = hasBracket ? rawTypeText.lastIndexOf(',') + 1 : 0;
    const segment = rawTypeText.slice(segmentStart);
    const leadingSpaces = segment.match(/^\s*/)?.[0].length || 0;
    const query = segment.slice(leadingSpaces);

    return {
        query,
        hasBracket,
        replaceStart: cursorIndex - rawTypeText.length + segmentStart + leadingSpaces,
        replaceEnd: cursorIndex,
    };
};

const getInvalidTypeNames = (code: string, validTypes: Set<string>) => {
    const invalid = new Set<string>();

    code.split('\n').forEach(line => {
        const match = line.match(/^\s*(?:input|output)\s+[A-Za-z_$][\w$]*\s+as\s+(.+?)\s*$/);
        if (!match) return;

        const rawTypeText = match[1].trim();
        const typeText = rawTypeText.startsWith('[')
            ? rawTypeText.replace(/^\[/, '').replace(/\]$/, '')
            : rawTypeText;

        typeText.split(',').map(type => type.trim()).filter(Boolean).forEach(typeName => {
            if (!validTypes.has(typeName)) {
                invalid.add(typeName);
            }
        });
    });

    return Array.from(invalid);
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

type WorkerResponse = {
    result?: unknown;
    outputs?: Record<string, unknown>;
    globalUpdates?: Record<string, unknown>;
};

type PendingRequest = {
    resolve: (val: WorkerResponse) => void;
    reject: (err: unknown) => void;
};

// Worker management
let workerInstance: Worker | null = null;
const pendingRequests = new Map<string, PendingRequest>();

const resetWorker = () => {
    if (workerInstance) {
        workerInstance.terminate();
        workerInstance = null;
    }
};

const rejectPendingRequests = (message: string) => {
    pendingRequests.forEach(({ reject }) => reject(message));
    pendingRequests.clear();
};

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
        workerInstance.onerror = () => {
            rejectPendingRequests('Code runner worker crashed.');
            resetWorker();
        };
        workerInstance.onmessageerror = () => {
            rejectPendingRequests('Code runner worker message failed.');
            resetWorker();
        };
    }
    return workerInstance;
};

export const executeCodeNode = async (node: AppNode, state: AppState): Promise<void> => {
    let baseCode = node.data.code?.trim() || defaultCode;
    
    // [NEW] Extract input & output declarations
    const INPUT_DECLARATION_REGEX = new RegExp(String.raw`^\s*input\s+([A-Za-z_$][\w$]*)\s+as\s+(${DECLARED_TYPE_PATTERN})\s*$`, 'gm');
    const OUTPUT_DECLARATION_REGEX = new RegExp(String.raw`^\s*output\s+([A-Za-z_$][\w$]*)\s+as\s+(${DECLARED_TYPE_PATTERN})\s*$`, 'gm');
    
    const declaredVars: string[] = [];
    const outputDeclarations: Record<string, string[]> = {};
    
    Array.from(baseCode.matchAll(INPUT_DECLARATION_REGEX)).forEach(match => declaredVars.push(match[1]));
    Array.from(baseCode.matchAll(OUTPUT_DECLARATION_REGEX)).forEach(match => {
        outputDeclarations[match[1]] = parseDeclaredTypes(match[2]);
    });
    
    // Strip declarations
    let strippedCode = baseCode.replace(INPUT_DECLARATION_REGEX, '');
    strippedCode = strippedCode.replace(OUTPUT_DECLARATION_REGEX, '').trim();
    
    // Inject destructured variables
    const preamble = declaredVars.length > 0 ? `const { ${declaredVars.join(', ')} } = inputs;\n` : '';
    
    const outputNames = Object.keys(outputDeclarations);
    const code = transformGlobalDeclarations(preamble + strippedCode + buildOutputCollectionTrailer(outputNames));
    const inputs = buildInputs(node);
    const typedInputs = buildTypedInputs(node);
    const globals = buildGlobals(state);

    const requestId = `${node.id}-${Date.now()}`;
    const worker = getWorker();

    try {
        const response = await new Promise<WorkerResponse>((resolve, reject) => {
            const timeout = window.setTimeout(() => {
                if (pendingRequests.has(requestId)) {
                    pendingRequests.delete(requestId);
                    resetWorker();
                    reject('Execution Timeout (可能存在無窮迴圈)');
                }
            }, 3000);

            pendingRequests.set(requestId, {
                resolve: (val) => {
                    window.clearTimeout(timeout);
                    resolve(val);
                },
                reject: (err) => {
                    window.clearTimeout(timeout);
                    reject(err);
                }
            });
            worker.postMessage({ requestId, code, inputs, typedInputs, globals, outputDeclarations });
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

        // Only update if something actually changed to prevent infinite loops and spam
        const currentData = node.data;
        const hasDataChanged = 
            currentData.value !== resultText ||
            currentData.error !== (errorText || undefined) ||
            JSON.stringify(currentData.outputs) !== JSON.stringify(newOutputs) ||
            JSON.stringify(currentData.typedOutputs) !== JSON.stringify(newTypedOutputs);

        if (hasDataChanged) {
            state.updateNodeData(node.id, {
                value: resultText,
                error: errorText || undefined,
                outputs: newOutputs,
                typedOutputs: newTypedOutputs
            });
            state.evaluateGraph();
        }
    } catch (error) {
        const message = typeof error === 'string' ? error : (error instanceof Error ? error.message : String(error));
        const currentData = node.data;
        const newOutputs = {
            'h-result': '',
            'h-error': message,
        };
        
        const hasErrorChanged = 
            currentData.error !== message ||
            JSON.stringify(currentData.outputs) !== JSON.stringify(newOutputs);

        if (hasErrorChanged) {
            state.updateNodeData(node.id, {
                value: '',
                error: message,
                outputs: newOutputs,
                typedOutputs: {}
            });
            state.evaluateGraph();
        }
    }
};

export const CodeNode = memo(function CodeNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    const executeNode = useStore((state: AppState) => state.executeNode);

    const currentCode = data.code ?? defaultCode;
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [cursorIndex, setCursorIndex] = useState(0);
    const typeIds = useMemo(() => mathTypeCatalog.map(type => type.id), []);
    const validTypeSet = useMemo(() => new Set<string>(typeIds), [typeIds]);
    const typeCompletionContext = useMemo(() => getTypeCompletionContext(currentCode, cursorIndex), [currentCode, cursorIndex]);
    const typeSuggestions = useMemo(() => {
        if (!typeCompletionContext) return [];
        const query = typeCompletionContext.query.toLowerCase();
        return mathTypeCatalog
            .filter(type => type.id.toLowerCase().startsWith(query) || type.label.toLowerCase().startsWith(query))
            .slice(0, 8);
    }, [typeCompletionContext]);
    const invalidTypeNames = useMemo(() => getInvalidTypeNames(currentCode, validTypeSet), [currentCode, validTypeSet]);

    const syncCursorIndex = () => {
        setCursorIndex(textareaRef.current?.selectionStart ?? 0);
    };

    const insertTypeSuggestion = (typeId: string) => {
        if (!typeCompletionContext) return;

        const suffix = '';
        const nextCode = `${currentCode.slice(0, typeCompletionContext.replaceStart)}${typeId}${suffix}${currentCode.slice(typeCompletionContext.replaceEnd)}`;
        const nextCursor = typeCompletionContext.replaceStart + typeId.length + suffix.length;

        updateNodeData(id, { code: nextCode, language: 'javascript' });
        requestAnimationFrame(() => {
            textareaRef.current?.focus();
            textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
            setCursorIndex(nextCursor);
        });
    };

    // [NEW] Sync handles based on input/output declarations
    useEffect(() => {
        const INPUT_DECLARATION_REGEX = new RegExp(String.raw`^\s*input\s+([A-Za-z_$][\w$]*)\s+as\s+(${DECLARED_TYPE_PATTERN})\s*$`, 'gm');
        const OUTPUT_DECLARATION_REGEX = new RegExp(String.raw`^\s*output\s+([A-Za-z_$][\w$]*)\s+as\s+(${DECLARED_TYPE_PATTERN})\s*$`, 'gm');
        
        const newInputs: { name: string, type: string }[] = [];
        Array.from(currentCode.matchAll(INPUT_DECLARATION_REGEX)).forEach(match => {
            newInputs.push({ name: match[1], type: formatDeclaredTypes(parseDeclaredTypes(match[2])) });
        });
        
        const newOutputs: { name: string, type: string }[] = [];
        Array.from(currentCode.matchAll(OUTPUT_DECLARATION_REGEX)).forEach(match => {
            newOutputs.push({ name: match[1], type: formatDeclaredTypes(parseDeclaredTypes(match[2])) });
        });

        const hasReturn = /\breturn\b/.test(currentCode);
        const currentHandles = data.handles || [];
        const showErrorOutput = Boolean(data.showCodeErrorOutput);
        
        let newInputHandles: any[] = [];
        if (newInputs.length > 0) {
            newInputHandles = newInputs.map((inp, index) => {
                const spacing = 100 / (newInputs.length + 1);
                return {
                    id: `h-in-${inp.name}`,
                    type: 'input',
                    position: 'left',
                    offset: (index + 1) * spacing,
                    label: inp.name,
                    declaredType: inp.type,
                    description: `Custom input variable: ${inp.name}`
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
                    label: out.name,
                    declaredType: out.type,
                    description: `Declared custom output: ${out.name}`
                };
            });
        }

        const baseOutputHandles: any[] = [];
        if (hasReturn) {
            baseOutputHandles.push({ id: 'h-result', type: 'output', position: 'right', offset: showErrorOutput ? 33 : 50, label: 'result', description: 'The value returned by the code' });
        }
        if (showErrorOutput) {
            baseOutputHandles.push({ id: 'h-error', type: 'output', position: 'right', offset: hasReturn ? 66 : 50, label: 'error', description: 'Any runtime errors captured' });
        }

        const nextHandles = [...newInputHandles, ...newOutputHandles, ...baseOutputHandles];

        if (JSON.stringify(currentHandles) !== JSON.stringify(nextHandles)) {
            // Uses a requestAnimationFrame to avoid update-during-render React warnings if triggered immediately
            requestAnimationFrame(() => updateNodeData(id, { handles: nextHandles }));
        }
    }, [currentCode, id, updateNodeData, data.handles, data.showCodeErrorOutput]);

    useEffect(() => {
        if (data.autoRun && (data.inputSignature || currentCode)) {
            // Delay slightly to ensure store has settled
            const timer = setTimeout(() => executeNode(id), 50);
            return () => clearTimeout(timer);
        }
    }, [data.inputSignature, currentCode, data.autoRun, id, executeNode]);

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
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <button
                        onClick={() => updateNodeData(id, { autoRun: !data.autoRun })}
                        className="variant-toggle"
                        style={{
                            fontSize: '0.6rem',
                            padding: '2px 6px',
                            background: data.autoRun ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
                            color: data.autoRun ? '#fff' : 'rgba(255,255,255,0.5)',
                            border: '1px solid currentColor',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        AUTO
                    </button>
                    <button
                        onClick={() => executeNode(id, true)}
                        className="variant-toggle"
                        style={{
                            fontSize: '0.6rem',
                            padding: '2px 6px',
                            background: 'var(--bg-input)',
                            color: 'var(--text-main)',
                            border: '1px solid var(--border-input)',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        RUN
                    </button>
                </div>
            }
            customHandleDescriptions={{
                'h-in': 'Generic input value',
                'h-result': 'Execution result',
                'h-error': 'Execution error'
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                <textarea
                    name={`code-editor-${id}`}
                    ref={textareaRef}
                    className="nodrag"
                    spellCheck={false}
                    value={data.code ?? defaultCode}
                    onChange={(event) => {
                        updateNodeData(id, { code: event.target.value, language: 'javascript' });
                        setCursorIndex(event.target.selectionStart);
                    }}
                    onClick={syncCursorIndex}
                    onKeyUp={syncCursorIndex}
                    onSelect={syncCursorIndex}
                    onKeyDown={(event) => {
                        if (typeSuggestions.length === 0) return;
                        if (event.key === 'Tab' || event.key === 'Enter') {
                            event.preventDefault();
                            insertTypeSuggestion(typeSuggestions[0].id);
                        }
                    }}
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
                {typeSuggestions.length > 0 && (
                    <div
                        className="nodrag"
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(86px, 1fr))',
                            gap: '4px',
                            padding: '6px',
                            background: 'rgba(15, 23, 42, 0.96)',
                            border: '1px solid rgba(148, 163, 184, 0.35)',
                            borderRadius: '8px',
                        }}
                    >
                        {typeSuggestions.map(type => (
                            <button
                                key={type.id}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => insertTypeSuggestion(type.id)}
                                title={`${type.label} (${type.category})`}
                                style={{
                                    border: '1px solid rgba(148, 163, 184, 0.25)',
                                    borderRadius: '6px',
                                    background: 'rgba(56, 189, 248, 0.12)',
                                    color: '#d7e2ff',
                                    fontSize: '0.66rem',
                                    padding: '4px 6px',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                }}
                            >
                                <span style={{ fontWeight: 800 }}>{type.id}</span>
                                <span style={{ opacity: 0.65 }}> · {type.category}</span>
                            </button>
                        ))}
                    </div>
                )}
                {invalidTypeNames.length > 0 && (
                    <div
                        style={{
                            color: '#fca5a5',
                            background: 'rgba(127, 29, 29, 0.22)',
                            border: '1px solid rgba(248, 113, 113, 0.32)',
                            borderRadius: '8px',
                            padding: '6px 8px',
                            fontSize: '0.66rem',
                        }}
                    >
                        Unknown type: {invalidTypeNames.join(', ')}
                    </div>
                )}
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
