import { type NodeProps, type Node, NodeResizer } from '@xyflow/react';
import { useEffect } from 'react';
import useStore, { type AppState, type NodeData } from '../store/useStore';
import { DynamicHandles } from './DynamicHandles';
import { Icons } from '../components/Icons';

export function DecimalNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
    const updateNodeData = useStore((state: AppState) => state.updateNodeData);

    const handleToDecimal = (inputVal?: string) => {
        const valToConvert = inputVal !== undefined ? inputVal : data.value;
        if (valToConvert) {
            try {
                let clean = valToConvert.replace(/\\/g, '');
                if (clean.includes('frac')) {
                    const matches = clean.match(/frac\{(\d+)\}\{(\d+)\}/);
                    if (matches && matches.length === 3) {
                        const numerator = parseInt(matches[1]);
                        const denominator = parseInt(matches[2]);
                        if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
                            const res = numerator / denominator;
                            updateNodeData(id, { value: res.toString() });
                            return;
                        }
                    }
                }

                const num = parseFloat(clean);
                if (!isNaN(num)) {
                    updateNodeData(id, { value: num.toString() });
                }
            } catch (e) {
                console.error("Decimal conversion error", e);
            }
        }
    };

    useEffect(() => {
        if (data.input !== undefined) {
            handleToDecimal(data.input);
        }
    }, [data.input, id, updateNodeData]);

    const touchingClasses = data.touchingEdges
        ? Object.entries(data.touchingEdges)
            .filter(([_, touching]) => touching)
            .map(([edge]) => `edge-touch-${edge}`)
            .join(' ')
        : '';

    return (
        <div className={`math-node op-node decimal-node ${touchingClasses}`} style={{ width: '100%', height: '100%' }}>
            <NodeResizer minWidth={120} minHeight={80} isVisible={selected} lineStyle={{ border: 'none' }} handleStyle={{ width: 8, height: 8, borderRadius: '50%', background: 'transparent', border: 'none' }} />
            <DynamicHandles
                nodeId={id}
                handles={data.handles}
                allowedTypes={['input', 'output', 'trigger-in', 'trigger-out']}
                touchingEdges={data.touchingEdges}
                customDescriptions={{
                    'trigger-in': '接收電流時執行小數轉換',
                    'trigger-out': '轉換成功後發出電流'
                }}
            />
            <div className="node-header">
                <span><Icons.Decimal /> Decimal</span>
                <button onClick={() => handleToDecimal()} className="exec-button">CONV</button>
            </div>
            <div className="node-content">
                <div className="result-value" style={{ fontSize: '1.2rem' }}>
                    {data.value !== undefined ? data.value : '--'}
                </div>
            </div>
        </div>
    );
}
