import { useMemo } from 'react';
import { type Edge } from '@xyflow/react';
import { getNodeDefinition } from '../nodes/registry';
import type { AppNode } from '../store/useStore';

type WorkflowSketchProps = {
  nodes: AppNode[];
  edges: Edge[];
  activeNodeId?: string;
  width?: number;
  height?: number;
  padding?: number;
  title?: string;
  countLabel?: string;
  className?: string;
  framed?: boolean;
  simplified?: boolean;
};

export function WorkflowSketch({
  nodes,
  edges,
  activeNodeId,
  width = 880,
  height = 132,
  padding = 16,
  title,
  countLabel,
  className,
  framed = true,
  simplified = false,
}: WorkflowSketchProps) {
  const bounds = useMemo(() => {
    if (nodes.length === 0) {
      return { minX: 0, minY: 0, graphWidth: 1, graphHeight: 1 };
    }
    const positions = nodes.map((node) => ({
      x: node.position.x,
      y: node.position.y,
      width: node.measured?.width ?? node.width ?? 180,
      height: node.measured?.height ?? node.height ?? 110,
    }));
    const minX = Math.min(...positions.map((item) => item.x));
    const minY = Math.min(...positions.map((item) => item.y));
    const maxX = Math.max(...positions.map((item) => item.x + item.width));
    const maxY = Math.max(...positions.map((item) => item.y + item.height));
    return {
      minX,
      minY,
      graphWidth: Math.max(maxX - minX, 1),
      graphHeight: Math.max(maxY - minY, 1),
    };
  }, [nodes]);

  const graph = useMemo(() => {
    const innerWidth = width - padding * 2;
    const innerHeight = height - padding * 2;
    const scale = Math.min(innerWidth / bounds.graphWidth, innerHeight / bounds.graphHeight);
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const toRect = (node: AppNode) => {
      const minWidth = simplified ? 12 : 16;
      const minHeight = simplified ? 8 : 10;
      const widthScale = simplified ? 0.72 : 1;
      const heightScale = simplified ? 0.72 : 1;
      const nodeWidth = Math.max((node.measured?.width ?? node.width ?? 180) * scale * widthScale, minWidth);
      const nodeHeight = Math.max((node.measured?.height ?? node.height ?? 110) * scale * heightScale, minHeight);
      const x = padding + (node.position.x - bounds.minX) * scale;
      const y = padding + (node.position.y - bounds.minY) * scale;
      return { x, y, width: nodeWidth, height: nodeHeight };
    };

    return {
      nodeRects: nodes.map((node) => ({ node, rect: toRect(node) })),
      edgeLines: edges
        .map((edge) => {
          const source = nodeMap.get(edge.source);
          const target = nodeMap.get(edge.target);
          if (!source || !target) return null;
          const sourceRect = toRect(source);
          const targetRect = toRect(target);
          return {
            id: edge.id,
            x1: sourceRect.x + sourceRect.width,
            y1: sourceRect.y + sourceRect.height / 2,
            x2: targetRect.x,
            y2: targetRect.y + targetRect.height / 2,
            wireless: edge.className?.includes('wireless-edge'),
            scope: edge.className?.includes('scope-edge'),
          };
        })
        .filter(Boolean) as Array<{ id: string; x1: number; y1: number; x2: number; y2: number; wireless?: boolean; scope?: boolean }>,
    };
  }, [bounds.graphHeight, bounds.graphWidth, bounds.minX, bounds.minY, edges, height, nodes, padding, simplified, width]);

  const content = (
    <>
      {(title || countLabel) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
            {title}
          </span>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-sub)' }}>
            {countLabel}
          </span>
        </div>
      )}
      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        style={{
          display: 'block',
          borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.08)',
          background: simplified ? 'rgba(2,6,23,0.22)' : 'rgba(0,0,0,0.18)',
        }}
      >
        {simplified && (
          <rect
            x={padding}
            y={padding}
            width={width - padding * 2}
            height={height - padding * 2}
            rx={10}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeDasharray="4 6"
          />
        )}
        {graph.edgeLines.map((edge) => (
          <line
            key={edge.id}
            x1={edge.x1}
            y1={edge.y1}
            x2={edge.x2}
            y2={edge.y2}
            stroke={edge.wireless ? '#9ca3af' : edge.scope ? '#8a8a8a' : '#4facfe'}
            strokeWidth={simplified ? (edge.wireless ? 1 : 1.35) : edge.wireless ? 1.5 : 2}
            strokeDasharray={edge.wireless ? '5 4' : simplified ? '2 0' : undefined}
            opacity={simplified ? 0.52 : 0.82}
          />
        ))}
        {graph.nodeRects.map(({ node, rect }) => {
          const isActive = node.id === activeNodeId;
          const nodeColor = getNodeDefinition(node.type || '')?.metadata.color || '#4facfe';
          return (
            <g key={node.id}>
              <rect
                x={rect.x}
                y={rect.y}
                width={rect.width}
                height={rect.height}
                rx={Math.min(simplified ? 4 : 6, rect.height / 3)}
                fill={isActive ? 'rgba(79, 172, 254, 0.24)' : simplified ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.08)'}
                stroke={isActive ? '#7dd3fc' : simplified ? `${nodeColor}cc` : nodeColor}
                strokeWidth={isActive ? 2 : simplified ? 0.9 : 1}
              />
            </g>
          );
        })}
      </svg>
    </>
  );

  if (!framed) {
    return <div className={className}>{content}</div>;
  }

  return (
    <div
      className={className}
      style={{
        padding: '12px 14px 10px',
        borderBottom: '1px solid var(--border-header)',
        background: 'linear-gradient(180deg, rgba(79, 172, 254, 0.08), rgba(255,255,255,0.02))',
      }}
    >
      {content}
    </div>
  );
}
