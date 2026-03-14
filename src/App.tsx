import React, { useState, useCallback } from 'react';
import { ReactFlow, Background, Controls, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import useStore, { dataNodeHandles, toolNodeHandles } from './store/useStore';
import { NumberNode } from './nodes/NumberNode';
import { AddNode } from './nodes/AddNode';

const nodeTypes = {
  numberNode: NumberNode,
  addNode: AddNode,
};

function Flow() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, removeNode } = useStore();
  const { screenToFlowPosition } = useReactFlow();
  const [paneMenu, setPaneMenu] = useState<{ x: number, y: number, screenX: number, screenY: number } | null>(null);
  const [nodeMenu, setNodeMenu] = useState<{ x: number, y: number, nodeId: string } | null>(null);

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
    setNodeMenu({
      x: e.clientX,
      y: e.clientY,
      nodeId: node.id,
    });
  }, []);

  const handleAddNode = (type: string) => {
    if (!paneMenu) return;
    const position = screenToFlowPosition({ x: paneMenu.screenX, y: paneMenu.screenY });
    addNode({
      id: `${type}-${Date.now()}`,
      type,
      position,
      data: { handles: type === 'numberNode' ? dataNodeHandles : toolNodeHandles }
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

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a0a' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
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
          <div className="menu-item" onClick={() => handleAddNode('numberNode')}>+ Number (Data)</div>
          <div className="menu-item border-top" onClick={() => handleAddNode('addNode')}>+ Add (Tool)</div>
        </div>
      )}

      {nodeMenu && (
        <div
          className="pane-context-menu"
          style={{ position: 'absolute', left: nodeMenu.x, top: nodeMenu.y, zIndex: 1000 }}
          onMouseLeave={() => setNodeMenu(null)}
        >
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
