import { memo } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import useStore, { type NodeData, type AppNode, type AppState } from '../store/useStore';
import { NodeFrame } from '../components/NodeFrame';
import { Icons } from '../components/Icons';

export const AppendNode = memo(function AppendNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    const updateNodeData = useStore(state => state.updateNodeData);
    const isInsert = data.variant === 'insert';

    const toggleMode = () => {
        const nextVariant = isInsert ? undefined : 'insert';
        updateNodeData(id, { variant: nextVariant as any });
    };

    return (
        <NodeFrame
            id={id}
            data={data}
            selected={selected}
            icon={<Icons.Append />}
            defaultLabel="Appender"
            className="append-node"
            headerExtras={
                <button 
                    onClick={toggleMode}
                    className="variant-toggle"
                    style={{
                        padding: '2px 6px',
                        cursor: 'pointer',
                        fontSize: '0.65rem'
                    }}
                >
                    {isInsert ? 'INSERT' : 'APPEND'}
                </button>
            }
        >
            <div style={{
                textAlign: 'center',
                padding: '10px',
                color: 'var(--text-sub)',
                fontSize: '0.75rem',
                border: '1px dashed var(--border-node)',
                borderRadius: '8px'
            }}>
                {isInsert ? 'Insert mode active' : 'Append mode active'}
                <div style={{ marginTop: '4px', fontSize: '0.65rem', opacity: 0.7 }}>
                    Connect input to log data
                </div>
            </div>
        </NodeFrame>
    );
});

export const executeAppendNode = (node: AppNode, state: AppState): void => {
    const { nodes, edges, updateNodeData } = state;
    const explicitEdges = edges.filter(e => e.target === node.id);

    const values = explicitEdges.map(e => {
        const source = nodes.find(n => n.id === e.source);
        return (e.sourceHandle && source?.data.outputs?.[e.sourceHandle]) ?? source?.data.value;
    }).filter(v => v !== undefined);

    const val = values[0];
    if (val !== undefined && val !== '') {
        // [MODULAR] 1. Find explicit target neighbors
        const explicitTargets = edges
            .filter(e => e.source === node.id)
            .map(e => e.target);

        // [MODULAR] 2. Find the target textNode (Either neighbor OR parent container)
        let targetNode = nodes.find(n => explicitTargets.includes(n.id) && n.type === 'textNode');
        if (!targetNode && node.data.parentId) {
            targetNode = nodes.find(n => n.id === node.data.parentId);
        }

        if (targetNode?.type === 'textNode') {
            const oldText = targetNode.data.text || '';
            let lines = oldText.split('\n');
            let appendix = String(val);

            // Detect if it's a number, formula, or already wrapped
            const isNumeric = !isNaN(Number(appendix)) && appendix.trim() !== '';
            const isLaTeX = appendix.includes('\\') || appendix.includes('{');
            const alreadyWrapped = (appendix.startsWith('$$') && appendix.endsWith('$$')) || (appendix.startsWith('[[') && appendix.endsWith(']]'));

            if ((isNumeric || isLaTeX) && !alreadyWrapped) {
                appendix = `$$${appendix.trim()}$$`;
            }

            if (node.data.variant === 'insert') {
                // Find line index input
                const indexEdge = edges.find(e => e.target === node.id && e.targetHandle === 'h-index');
                let lineIndex = 0;
                if (indexEdge) {
                    const source = nodes.find(n => n.id === indexEdge.source);
                    lineIndex = Number((indexEdge.sourceHandle && source?.data.outputs?.[indexEdge.sourceHandle]) ?? source?.data.value ?? 0);
                }

                // Clean up lines: if all empty, reset
                if (lines.length === 1 && lines[0] === '') lines = [];

                // Insert at index
                const idx = Math.max(0, Math.min(lines.length, Math.floor(lineIndex)));
                lines.splice(idx, 0, appendix);
                updateNodeData(targetNode.id, { text: lines.join('\n') });
            } else {
                // Default Append mode
                updateNodeData(targetNode.id, { text: oldText + (oldText ? '\n' : '') + appendix });
            }
        }
        // Update our own display value
        updateNodeData(node.id, { value: String(val) });
    }
};
