import { useEffect, useRef } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import useStore, { type NodeData, type AppState, type CustomHandle } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';
import 'mathlive';

export function FunctionNode({ id, data }: NodeProps<Node<NodeData>>) {
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);
    const executeNode = useStore((state: AppState) => state.executeNode);
    const mfRef = useRef<any>(null);

    // Sync nerdamer variables to handles
    useEffect(() => {
        if (!data.formula) return;

        const syncHandles = async () => {
            try {
                // @ts-ignore
                const nerdamer = (await import('nerdamer/all.min')).default || (await import('nerdamer/all.min'));
                const solver = nerdamer.convertFromLaTeX(data.formula);
                const variables = solver.variables(); // e.g. ['x', 'y']

                const currentHandles = data.handles || [];
                const nonInputHandles = currentHandles.filter(h => h.type !== 'input');
                const existingInputs = currentHandles.filter(h => h.type === 'input');

                // Generate one handle per variable
                const newInputHandles: CustomHandle[] = variables.map((v: string, index: number) => {
                    const existing = existingInputs.find((h: any) => h.label === v || h.id === `h-in-${v}`);
                    if (existing) return existing;

                    // Create new input handle for this variable
                    const spacing = 100 / (variables.length + 1);
                    return {
                        id: `h-in-${v}`,
                        type: 'input',
                        position: 'left',
                        offset: (index + 1) * spacing,
                        label: v // We'll need to update DynamicHandles/CSS to show this label
                    } as any;
                });

                // Always keep one output handle
                const outputHandle = currentHandles.find(h => h.type === 'output') || { id: 'h-out', type: 'output', position: 'right', offset: 50 };

                const nextHandles = [...newInputHandles, ...nonInputHandles.filter(h => h.type !== 'output'), outputHandle];

                // Update if changed
                if (JSON.stringify(nextHandles) !== JSON.stringify(currentHandles)) {
                    updateNodeData(id, { handles: nextHandles });
                }
            } catch (e) {
                // Formula might be incomplete while typing
            }
        };

        syncHandles();
    }, [id, data.formula, updateNodeData]);

    // Setup MathField for formula input
    useEffect(() => {
        const mf = mfRef.current;
        if (!mf) return;

        if (mf.value !== data.formula && data.formula !== undefined) {
            mf.value = data.formula;
        }

        const handleInput = (e: any) => {
            updateNodeData(id, { formula: e.target.value });
        };

        mf.addEventListener('input', handleInput);
        return () => mf.removeEventListener('input', handleInput);
    }, [id, data.formula, updateNodeData]);

    return (
        <div className="math-node op-node function-node">
            <DynamicHandles nodeId={id} handles={data.handles} />
            <div className="node-header">
                Function
                <button
                    onClick={() => executeNode(id)}
                    className="exec-button"
                >
                    EXEC
                </button>
            </div>

            <div className="node-content" style={{ flexDirection: 'column', gap: '8px' }}>
                <div className="formula-label" style={{ fontSize: '0.6rem', color: '#666', width: '100%', textAlign: 'left' }}>FORMULA:</div>
                <math-field
                    ref={mfRef}
                    class="nodrag formula-input"
                    style={{ fontSize: '1rem', width: '100%', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '4px' }}
                >
                    {data.formula || ''}
                </math-field>

                <div className="result-label" style={{ fontSize: '0.6rem', color: '#666', width: '100%', textAlign: 'left', marginTop: '4px' }}>RESULT:</div>
                <math-field
                    read-only
                    style={{ fontSize: '1.2rem', color: '#00f2fe', background: 'transparent', border: 'none', width: '100%' }}
                >
                    {data.value || '?'}
                </math-field>
            </div>
        </div>
    );
}
