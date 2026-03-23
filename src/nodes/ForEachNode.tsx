import { NodeResizer, type NodeProps, type Node } from '@xyflow/react';
import useStore, { type AppState, type NodeData, type AppNode } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';
import { Icons } from '../components/Icons';

export function ForEachNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    const nodes = useStore((state: AppState) => state.nodes);
    const implicitEdges = useStore((state: AppState) => state.implicitEdges);

    const targetNode = nodes.find(n => 
        implicitEdges.some(e => e.source === id && e.target === n.id)
    );
    const isAttached = !!targetNode;

    return (
        <div 
            className={`math-node for-each-node ${isAttached ? 'attached' : 'detached'}`}
            style={{
                width: '100%',
                height: '100%',
                overflow: 'visible',
                display: 'flex',
                flexDirection: 'column',
                boxSizing: 'border-box',
                padding: '0',
                border: isAttached ? '1px solid rgba(162, 155, 254, 0.4)' : '1px solid var(--border-node)',
            }}
        >
            <NodeResizer minWidth={150} minHeight={110} isVisible={selected} lineStyle={{ border: 'none' }} handleStyle={{ width: 8, height: 8, borderRadius: '50%', background: 'transparent', border: 'none' }} />
            
            <div className="node-header" style={{ color: isAttached ? 'var(--accent-bright)' : 'var(--text-sub)' }}>
                <span>
                    <Icons.ForEach />
                    ForEach
                </span>
                {isAttached && <span style={{ fontSize: '0.5rem', opacity: 0.8 }}>LINKED</span>}
            </div>

            <div style={{ padding: '8px 12px', flexGrow: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-main)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {data.status || 'Ready / Standby'}
                </div>
                {isAttached && targetNode && (
                    <div style={{ fontSize: '0.6rem', color: '#888' }}>
                        Target: {targetNode.type?.replace('Node', '').toUpperCase()}
                    </div>
                )}
            </div>

            <DynamicHandles 
                nodeId={id} 
                handles={data.handles} 
                allowedTypes={['input', 'trigger-in', 'trigger-out']} 
                touchingEdges={data.touchingEdges}
            />
            
            <style>{`
                .for-each-node.attached { box-shadow: 0 0 15px rgba(108, 92, 231, 0.2); }
                .for-each-node.detached { border-style: dashed; }
            `}</style>
        </div>
    );
}

export const executeForEachNode = (node: AppNode, state: AppState): void => {
    const seqVal = node.data.input || '[]';
    let seq: any[] = [];
    try {
        seq = JSON.parse(seqVal);
        if (!Array.isArray(seq)) seq = [seqVal];
    } catch {
        seq = [seqVal];
    }

    if (seq.length === 0) return;

    // Find neighbor (prioritize magnetic/implicit connection on right or bottom)
    const implicitNeighbor = state.implicitEdges.find(e => e.source === node.id)?.target;
    const explicitNeighbor = state.edges.find(e => e.source === node.id)?.target;
    const neighborId = implicitNeighbor || explicitNeighbor;
    
    if (!neighborId) {
        state.updateNodeData(node.id, { status: 'Error: No Target' });
        return;
    }

    const runLoop = async () => {
        for (let i = 0; i < seq.length; i++) {
            const item = seq[i];
            // Update its own value so connected nodes can read it (like CalculateNode)
            state.updateNodeData(node.id, { 
                status: `Item ${i+1}/${seq.length}`,
                value: String(item)
            });
            
            // Also update the target's explicit input (like Calculus or Decimal node)
            state.updateNodeData(neighborId, { input: String(item) });
            await new Promise(r => setTimeout(r, 100));
            state.executeNode(neighborId);
            await new Promise(r => setTimeout(r, 50));
        }
        state.updateNodeData(node.id, { status: 'Done' });
        node.data.handles?.filter(h => h.type === 'trigger-out').forEach(h => state.triggerNode(node.id, h.id));
    };
    runLoop();
};
