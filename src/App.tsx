import React, { useState, useCallback } from 'react';
import { ReactFlow, Background, Controls, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import useStore, { dataNodeHandles, toolNodeHandles, textNodeHandles } from './store/useStore';
import { NumberNode } from './nodes/NumberNode';
import { FunctionNode } from './nodes/FunctionNode';
import { TextNode } from './nodes/TextNode';
import { DecimalNode } from './nodes/DecimalNode';
import { CalculusNode } from './nodes/CalculusNode';
import { calculusNodeHandles } from './store/useStore';

const nodeTypes = {
  numberNode: NumberNode,
  functionNode: FunctionNode,
  textNode: TextNode,
  decimalNode: DecimalNode,
  calculusNode: CalculusNode,
};

function Flow() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, removeNode, handleProximitySnap, checkProximity } = useStore();
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
          <div className="menu-item" onClick={() => handleAddNode('numberNode')}>+ Number (Data)</div>
          <div className="menu-item border-top" onClick={() => handleAddNode('functionNode')}>+ Function (Tool)</div>
          <div className="menu-item border-top" onClick={() => handleAddNode('textNode')}>+ Text (Markdown)</div>
          <div className="menu-item border-top" onClick={() => handleAddNode('decimalNode')}>+ To Decimal (Util)</div>
          <div className="menu-item border-top" onClick={() => handleAddNode('calculusNode', 'diff')}>+ Differentiate (d/dx)</div>
          <div className="menu-item border-top" onClick={() => handleAddNode('calculusNode', 'integ')}>+ Integrate (∫ dx)</div>
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
