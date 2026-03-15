import React, { useState, useCallback, useRef } from 'react';
import { ReactFlow, Background, Controls, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import useStore, { dataNodeHandles, toolNodeHandles, textNodeHandles } from './store/useStore';
import { NumberNode } from './nodes/NumberNode';
import { CalculateNode } from './nodes/CalculateNode';
import { TextNode } from './nodes/TextNode';
import { DecimalNode } from './nodes/DecimalNode';
import { CalculusNode } from './nodes/CalculusNode';
import { calculusNodeHandles } from './store/useStore';

const nodeTypes = {
  numberNode: NumberNode,
  calculateNode: CalculateNode,
  textNode: TextNode,
  decimalNode: DecimalNode,
  calculusNode: CalculusNode,
};

function Flow() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, removeNode, handleProximitySnap, checkProximity, addHandle } = useStore();
  const { screenToFlowPosition } = useReactFlow();
  const [paneMenu, setPaneMenu] = useState<{ x: number, y: number, screenX: number, screenY: number } | null>(null);
  const [nodeMenu, setNodeMenu] = useState<{ x: number, y: number, nodeId: string, relativeY: number } | null>(null);
  const connectingNodeRef = useRef<{ nodeId: string, handleId: string, handleType: string } | null>(null);

  const onPaneContextMenu = useCallback((e: MouseEvent | React.MouseEvent) => {
    e.preventDefault();
    setNodeMenu(null);
    setPaneMenu({
      x: e.clientX,
      y: e.clientY,
      screenX: e.clientX,
      screenY: e.clientY,
    });
  }, []);

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: any) => {
    e.preventDefault();
    setPaneMenu(null);
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeY = ((e.clientY - rect.top) / rect.height) * 100;
    setNodeMenu({
      x: e.clientX,
      y: e.clientY,
      nodeId: node.id,
      relativeY,
    });
  }, []);

  const handleAddNode = (type: string, variant?: string) => {
    if (!paneMenu) return;
    const position = screenToFlowPosition({ x: paneMenu.screenX, y: paneMenu.screenY });
    const getHandles = (type: string) => {
      switch (type) {
        case 'numberNode': return dataNodeHandles;
        case 'textNode': return textNodeHandles;
        case 'calculusNode': return calculusNodeHandles;
        default: return toolNodeHandles;
      }
    };

    addNode({
      id: `${type}-${Date.now()}`,
      type,
      position,
      data: {
        handles: getHandles(type),
        ...(variant ? { variant } : {})
      }
    } as any);
    setPaneMenu(null);
  };

  const handleDeleteNode = () => {
    if (!nodeMenu) return;
    removeNode(nodeMenu.nodeId);
    setNodeMenu(null);
  };

  const closeMenus = () => {
    setPaneMenu(null);
    setNodeMenu(null);
  };

  const onConnectStart = useCallback((_event: any, { nodeId, handleId, handleType }: any) => {
    connectingNodeRef.current = { nodeId, handleId, handleType };
  }, []);

  const onConnectEnd = useCallback((event: any) => {
    if (!connectingNodeRef.current) return;

    const nodeElement = event.target.closest('.react-flow__node');

    if (nodeElement && !event.target.closest('.react-flow__handle')) {
      const targetNodeId = nodeElement.getAttribute('data-id');
      const { nodeId: sourceNodeId, handleId: sourceHandleId } = connectingNodeRef.current;

      if (targetNodeId && targetNodeId !== sourceNodeId) {
        const sourceNode = nodes.find(n => n.id === sourceNodeId);
        const sourceHandle = sourceNode?.data.handles?.find(h => h.id === sourceHandleId);

        // Only auto-create if it's a trigger connection
        if (sourceHandle?.type.startsWith('trigger')) {
          const rect = nodeElement.getBoundingClientRect();
          const relativeY = ((event.clientY - rect.top) / rect.height) * 100;
          const newHandleId = `h-auto-tr-in-${Date.now()}`;

          // Add the handle
          addHandle(targetNodeId, {
            id: newHandleId,
            type: 'trigger-in',
            position: 'left', // Default to left side for auto-generated trigger inputs
            offset: Math.max(0, Math.min(100, relativeY))
          });

          // Connect it
          setTimeout(() => {
            onConnect({
              source: sourceNodeId,
              sourceHandle: sourceHandleId,
              target: targetNodeId,
              targetHandle: newHandleId
            });
          }, 50);
        }
      }
    }

    connectingNodeRef.current = null;
  }, [nodes, addHandle, onConnect]);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a0a' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={(changes) => {
          onNodesChange(changes);
          if (changes.some(c => c.type === 'position')) checkProximity();
        }}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onNodeDragStop={(_, node) => handleProximitySnap(node.id)}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        onClick={closeMenus}
        fitView
        colorMode="dark"
      >
        <Background color="#333" gap={16} />
        <Controls />
      </ReactFlow>

      {paneMenu && (
        <div
          className="pane-context-menu"
          style={{ position: 'absolute', left: paneMenu.x, top: paneMenu.y, zIndex: 1000 }}
          onMouseLeave={() => setPaneMenu(null)}
        >
          <div className="menu-header">Add Node</div>
          <div className="menu-item" onClick={() => handleAddNode('textNode')}>+ New Text Logic</div>
          <div className="menu-item border-top" onClick={() => handleAddNode('calculateNode')}>+ Calculate (Tool)</div>
          <div className="menu-item border-top" onClick={() => handleAddNode('decimalNode')}>+ To Decimal (Util)</div>
          <div className="menu-item border-top" onClick={() => handleAddNode('calculusNode', 'diff')}>+ Calculus (Tool)</div>
        </div>
      )}

      {nodeMenu && (
        <div
          className="pane-context-menu"
          style={{ position: 'absolute', left: nodeMenu.x, top: nodeMenu.y, zIndex: 1000 }}
          onMouseLeave={() => setNodeMenu(null)}
        >
          <div className="menu-header">Node Actions</div>
          <div className="menu-item" style={{ color: '#ff4757' }} onClick={handleDeleteNode}>Delete Node</div>
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  );
}

export default App;
