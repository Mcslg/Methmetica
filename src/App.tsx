import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ReactFlow, Background, Controls, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import useStore, { dataNodeHandles, toolNodeHandles, textNodeHandles } from './store/useStore';
import { NumberNode } from './nodes/NumberNode';
import { CalculateNode } from './nodes/CalculateNode';
import { TextNode } from './nodes/TextNode';
import { DecimalNode } from './nodes/DecimalNode';
import { CalculusNode } from './nodes/CalculusNode';
import { AppendNode } from './nodes/AppendNode';
import { ButtonNode } from './nodes/ButtonNode';
import { GateNode } from './nodes/GateNode';
import { RangeNode } from './nodes/RangeNode';
import { ForEachNode } from './nodes/ForEachNode';
import { GraphNode } from './nodes/GraphNode';
import { SliderNode } from './nodes/SliderNode';
import { calculusNodeHandles, buttonNodeHandles, appendNodeHandles, gateNodeHandles, rangeNodeHandles, forEachNodeHandles, graphNodeHandles, sliderNodeHandles } from './store/useStore';
import { Sidebar } from './components/Sidebar';

const nodeTypes = {
  numberNode: NumberNode,
  calculateNode: CalculateNode,
  textNode: TextNode,
  decimalNode: DecimalNode,
  calculusNode: CalculusNode,
  appendNode: AppendNode,
  buttonNode: ButtonNode,
  gateNode: GateNode,
  rangeNode: RangeNode,
  forEachNode: ForEachNode,
  graphNode: GraphNode,
  sliderNode: SliderNode,
};

function Flow() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, removeNode, handleProximitySnap, checkProximity, addHandle } = useStore();
  const { screenToFlowPosition } = useReactFlow();
  const [paneMenu, setPaneMenu] = useState<{ x: number, y: number, screenX: number, screenY: number } | null>(null);
  const [nodeMenu, setNodeMenu] = useState<{ x: number, y: number, nodeId: string, relativeY: number } | null>(null);
  const connectingNodeRef = useRef<{ nodeId: string, handleId: string, handleType: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(e.type === 'keydown');
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('keyup', handleKey);
    };
  }, []);

  const nodeLibrary = [
    { type: 'textNode', label: 'Text Logic', desc: 'Markdown & text processing', category: 'Logic', icon: '¶', color: '#4facfe' },
    { type: 'calculateNode', label: 'Math Calculator', desc: 'Symbolic math expressions', category: 'Math', icon: 'fx', color: '#ffcc33' },
    { type: 'decimalNode', label: 'To Decimal', desc: 'Convert fraction/LaTeX to float', category: 'Utils', icon: '0.1', color: '#43e97b' },
    { type: 'calculusNode', label: 'Calculus Tool', desc: 'Derivatives & Integrals', category: 'Math', icon: '∫', color: '#a18cd1' },
    { type: 'appendNode', label: 'Append Logger', desc: 'Append data to touching TextNode', category: 'Logic', icon: '⤓', color: '#43e97b' },
    { type: 'buttonNode', label: 'Run Trigger', desc: 'Manual signal trigger', category: 'Logic', icon: '⚡', color: '#ffcc00' },
    { type: 'gateNode', label: 'Trigger Gate', desc: 'Pass trigger if input is non-zero', category: 'Logic', icon: '⛩', color: '#4facfe' },
    { type: 'rangeNode', label: 'Range Generator', desc: 'Generate a sequence of numbers', category: 'Math', icon: '{n}', color: '#43e97b' },
    { type: 'forEachNode', label: 'For Each', desc: 'Process sequence items on neighbor', category: 'Logic', icon: '↻', color: '#6c5ce7' },
    { type: 'graphNode', label: 'Graph Calculator', desc: 'Plot 2D dynamic mathematical functions', category: 'Math', icon: '📈', color: '#ff66b2' },
    { type: 'sliderNode', label: 'Slider Input', desc: 'Interactive numeric value slider', category: 'Input', icon: '—○—', color: '#4facfe' },
  ];

  const filteredLibrary = nodeLibrary.filter(item => 
    item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.desc.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const onPaneContextMenu = useCallback((e: MouseEvent | React.MouseEvent) => {
    e.preventDefault();
    setNodeMenu(null);
    setSearchQuery('');
    
    // Adjusted position logic to prevent overflow
    const menuWidth = 350; // Estimated max width
    const menuHeight = 500; // Estimated max height
    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 20;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 20;
    if (x < 10) x = 10;
    if (y < 10) y = 10;

    setPaneMenu({
      x,
      y,
      screenX: e.clientX,
      screenY: e.clientY,
    });
    // Focus search on next tick
    setTimeout(() => searchInputRef.current?.focus(), 10);
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
        case 'buttonNode': return buttonNodeHandles;
        case 'appendNode': return appendNodeHandles;
        case 'gateNode': return gateNodeHandles;
        case 'rangeNode': return rangeNodeHandles;
        case 'forEachNode': return forEachNodeHandles;
        case 'graphNode': return graphNodeHandles;
        case 'sliderNode': return sliderNodeHandles;
        default: return toolNodeHandles;
      }
    };

    const getDefaultSize = (type: string) => {
      switch (type) {
        case 'textNode': return { width: 300, height: 180 };
        case 'calculateNode': 
        case 'calculusNode': return { width: 160, height: 75 };
        case 'rangeNode':
        case 'forEachNode': 
        case 'gateNode': return { width: 180, height: 110 };
        case 'graphNode': return { width: 300, height: 260 };
        case 'numberNode': return { width: 120, height: 80 };
        case 'sliderNode': return { width: 180, height: 110 };
        case 'buttonNode': return { width: 120, height: 46 };
        default: return { width: 200, height: 120 };
      }
    };

    addNode({
      id: `${type}-${Date.now()}`,
      type,
      position,
      style: getDefaultSize(type),
      data: {
        handles: getHandles(type),
        ...(variant ? { variant } : {}),
        ...(type === 'rangeNode' ? { rangeDef: '0..10' } : {})
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
      <Sidebar />
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
          className={`command-palette nodrag ${searchQuery ? 'is-searching' : ''} ${isShiftPressed ? 'is-shifting' : ''}`}
          style={{ position: 'absolute', left: paneMenu.x, top: paneMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="command-search-container">
            <input
              ref={searchInputRef}
              type="text"
              className="command-input"
              placeholder="Search nodes... (e.g. 'cal' or 'text')"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filteredLibrary.length > 0) {
                  handleAddNode(filteredLibrary[0].type);
                } else if (e.key === 'Escape') {
                  setPaneMenu(null);
                }
              }}
            />
          </div>
          <div className="command-list">
            {filteredLibrary.length > 0 ? (
              <>
                {Array.from(new Set(filteredLibrary.map(n => n.category))).map(cat => (
                  <React.Fragment key={cat}>
                    <div className="command-category">{cat}</div>
                    {filteredLibrary.filter(n => n.category === cat).map(item => (
                      <div 
                        key={item.type} 
                        className="command-item" 
                        onClick={() => handleAddNode(item.type)}
                      >
                        <div className="command-icon" style={{ '--theme-color': item.color } as any}>
                          {item.icon}
                        </div>
                        <div className="command-info">
                          <span className="command-label">{item.label}</span>
                          <span className="command-desc">{item.desc}</span>
                        </div>
                      </div>
                    ))}
                  </React.Fragment>
                ))}
              </>
            ) : (
              <div className="command-empty">No nodes found matching your search.</div>
            )}
          </div>
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
