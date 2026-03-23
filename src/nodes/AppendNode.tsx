import { NodeResizer, type NodeProps, type Node } from '@xyflow/react';
import useStore, { type NodeData, type AppNode, type AppState } from '../store/useStore';
import { appendNodeHandles, insertNodeHandles } from './handles';
import { DynamicHandles } from './DynamicHandles';
import { Icons } from '../components/Icons';

export const AppendNode = ({ id, data, selected }: NodeProps<Node<NodeData>>) => {
    const nodes = useStore(state => state.nodes);
    const implicitEdges = useStore(state => state.implicitEdges);
    const updateNodeData = useStore(state => state.updateNodeData);

    const isInsert = data.variant === 'insert';

    // Find the neighbor TextNode we are attached to (output target)
    const getTargetTextNode = () => {
        const neighborIds = implicitEdges
            .filter(e => e.source === id)
            .map(e => e.target);
            
        return nodes.find(n => neighborIds.includes(n.id) && n.type === 'textNode');
    };

    const target = getTargetTextNode();
    const isAttached = !!target;

    const toggleMode = () => {
        const nextVariant = isInsert ? undefined : 'insert';
        const nextHandles = isInsert ? appendNodeHandles : insertNodeHandles;
        updateNodeData(id, { variant: nextVariant as any, handles: nextHandles });
    };

    return (
        <div 
            className={`math-node append-node ${isAttached ? 'attached' : 'detached'}`}
            style={{
                width: '100%',
                height: '100%',
                overflow: 'visible',
                display: 'flex',
                flexDirection: 'column',
                boxSizing: 'border-box',
                padding: '0',
                background: isAttached ? 'var(--bg-node)' : 'var(--bg-input)',
                border: isAttached ? '1px solid var(--accent-bright)' : '1px solid var(--border-node)',
                borderRadius: '16px',
            }}
        >
            <NodeResizer minWidth={160} minHeight={120} isVisible={selected} lineStyle={{ border: 'none' }} handleStyle={{ width: 8, height: 8, borderRadius: '50%', background: 'transparent', border: 'none' }} />
            
            <div className="node-header" style={{ 
                color: isAttached ? 'var(--accent-bright)' : 'var(--text-sub)',
            }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span>
                        <Icons.Append />
                        Append
                    </span>
                    <button 
                        onClick={toggleMode}
                        className="variant-toggle"
                        style={{
                            padding: '2px 6px',
                            cursor: 'pointer',
                        }}
                    >
                        {isInsert ? 'Insert' : 'Append'}
                    </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.5rem', opacity: 0.8 }}>{isAttached ? 'CONNECTED' : 'STANDBY'}</span>
                    <span>{isAttached ? '●' : '○'}</span>
                </div>
            </div>

            <DynamicHandles 
                nodeId={id} 
                handles={data.handles} 
                allowedTypes={['input']} 
                touchingEdges={data.touchingEdges}
            />

            <style>{`
                .append-node.attached { box-shadow: 0 0 15px rgba(67, 233, 123, 0.15); }
                .append-node.detached { border-style: dashed; }
            `}</style>
        </div>
    );
};

export const executeAppendNode = (node: AppNode, state: AppState): void => {
    const { nodes, edges, implicitEdges, updateNodeData } = state;
    const explicitEdges = edges.filter(e => e.target === node.id);
    const implicitInputsToAppend = implicitEdges.filter(e => e.target === node.id);

    const values = [
        ...explicitEdges.map(e => {
            const source = nodes.find(n => n.id === e.source);
            return (e.sourceHandle && source?.data.outputs?.[e.sourceHandle]) ?? source?.data.value;
        }),
        ...implicitInputsToAppend.map(e => nodes.find(n => n.id === e.source)?.data?.value)
    ].filter(v => v !== undefined);

    const val = values[0];
    if (val !== undefined && val !== '') {
        // Find all implicit neighbors
        const neighbors = implicitEdges
            .filter(e => e.source === node.id || e.target === node.id)
            .map(e => e.source === node.id ? e.target : e.source);

        // Specifically find the textNode among neighbors
        const targetNode = nodes.find(n => neighbors.includes(n.id) && n.type === 'textNode');

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
                } else {
                    // Try implicit index if any
                    const implicitIndex = implicitEdges.find(e => e.target === node.id);
                    if (implicitIndex) {
                        const source = nodes.find(n => n.id === implicitIndex.source);
                        lineIndex = Number(source?.data.value || 0);
                    }
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
