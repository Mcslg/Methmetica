import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
import { SolveNode } from './nodes/SolveNode';
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
  solveNode: SolveNode,
};

function Flow() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, removeNode, handleProximitySnap, checkProximity, addHandle, setAltPressed } = useStore();
  const { screenToFlowPosition } = useReactFlow();
  const [paneMenu, setPaneMenu] = useState<{ x: number, y: number, screenX: number, screenY: number } | null>(null);
  const [radialMenu, setRadialMenu] = useState<{ x: number, y: number, screenX: number, screenY: number } | null>(null);
  const [radialSelection, setRadialSelection] = useState<'textNode' | 'calculateNode' | null>(null);
  const radialSelectionRef = useRef<'textNode' | 'calculateNode' | null>(null);
  const [nodeMenu, setNodeMenu] = useState<{ x: number, y: number, nodeId: string, relativeY: number } | null>(null);
  const connectingNodeRef = useRef<{ nodeId: string, handleId: string, handleType: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [idleTooltip, setIdleTooltip] = useState<{ x: number, y: number } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const idleTimerRef = useRef<any>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(e.type === 'keydown');
      if (e.key === 'Alt') setAltPressed(e.type === 'keydown');
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('keyup', handleKey);
    };
  }, [setAltPressed]);

  useEffect(() => {
    radialSelectionRef.current = radialSelection;
  }, [radialSelection]);

  useEffect(() => {
    if (!radialMenu) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - radialMenu.screenX;
      const dy = e.clientY - radialMenu.screenY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 40) {
        setRadialSelection(null);
        return;
      }

      let angle = Math.atan2(dx, -dy) * 180 / Math.PI;
      if (angle < 0) angle += 360;

      // 0-180 is Right (index 0 in math/text list), 180-360 is Left (index 1)
      if (angle >= 0 && angle < 180) setRadialSelection('calculateNode');
      else setRadialSelection('textNode');
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        const currentSelection = radialSelectionRef.current;
        if (currentSelection) {
          handleAddNode(currentSelection, undefined, { x: radialMenu.screenX, y: radialMenu.screenY });
          setRadialMenu(null);
          setRadialSelection(null);
        }
        // If there's no selection (they just clicked without dragging), 
        // leave the menu open so they can click the items directly!
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [radialMenu]);

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
    { type: 'solveNode', label: 'Equation Solver', desc: 'Solve equations for a variable', category: 'Math', icon: '?', color: '#ff7e5f' },
  ];

  const filteredLibrary = nodeLibrary.filter(item =>
    item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.desc.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const onPaneContextMenu = useCallback((e: MouseEvent | React.MouseEvent) => {
    e.preventDefault();

    if (radialMenu) {
      if (!e.shiftKey) {
         setRadialMenu(null);
         setRadialSelection(null);
      }
      return;
    }

    setNodeMenu(null);
    setSearchQuery('');

    if (e.shiftKey) {
      // If they just clicked (already released), we can still show it or just do nothing.
      // But usually, they'll hold.
      setPaneMenu(null);
      setRadialMenu({
        x: e.clientX,
        y: e.clientY,
        screenX: e.clientX,
        screenY: e.clientY,
      });
      return;
    }

    setRadialMenu(null);
    setRadialSelection(null);
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

  const handleAddNode = (type: string, variant?: string, customPos?: { x: number, y: number }) => {
    const posSource = customPos || (radialMenu ? { x: radialMenu.screenX, y: radialMenu.screenY } : paneMenu ? { x: paneMenu.screenX, y: paneMenu.screenY } : null);
    if (!posSource) return;

    const position = screenToFlowPosition({ x: posSource.x, y: posSource.y });
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
        case 'solveNode': return [{ id: 'h-in', type: 'input', position: 'left', offset: 50, label: 'eq' }, { id: 'h-out', type: 'output', position: 'right', offset: 50 }];
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
        case 'solveNode': return { width: 220, height: 160 };
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
    setRadialMenu(null);
  };

  const handleDeleteNode = () => {
    if (!nodeMenu) return;
    removeNode(nodeMenu.nodeId);
    setNodeMenu(null);
  };

  const handleDuplicateNode = () => {
    if (!nodeMenu) return;
    const node = nodes.find(n => n.id === nodeMenu.nodeId);
    if (!node) return;

    addNode({
      ...node,
      id: `${node.type}-${Date.now()}`,
      position: { x: node.position.x + 30, y: node.position.y + 30 },
      selected: true,
    } as any);
    setNodeMenu(null);
  };

  const closeMenus = () => {
    setPaneMenu(null);
    setRadialMenu(null);
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
        onMouseMove={(e) => {
          if (idleTooltip) setIdleTooltip(null);
          if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
          
          // Only trigger if we are over the pane, not dragging, and no menus are open
          const target = e.target as HTMLElement;
          const isPane = target.classList.contains('react-flow__pane');
          
          if (isPane && !paneMenu && !radialMenu && !nodeMenu) {
            const { clientX, clientY } = e;
            idleTimerRef.current = setTimeout(() => {
              setIdleTooltip({ x: clientX, y: clientY });
            }, 1200);
          }
        }}
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
        onMouseDown={(e: React.MouseEvent) => {
          setIdleTooltip(null);
          if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
          
          console.log('MouseDown', e.button, e.shiftKey, (e.target as HTMLElement).className);
          if (e.button === 2 && e.shiftKey) {
            const target = e.target as HTMLElement;
            // Pane might be nested or have different classes, search up to find flow-pane or just check if it's the pane
            const isPane = target.classList.contains('react-flow__pane') || target.closest('.react-flow__pane');
            console.log('isPane?', !!isPane);
            if (isPane) {
              setPaneMenu(null);
              setRadialMenu({
                x: e.clientX,
                y: e.clientY,
                screenX: e.clientX,
                screenY: e.clientY,
              });
              console.log('radialMenu set at', e.clientX, e.clientY);
            }
          }
        }}
        onNodeContextMenu={onNodeContextMenu}
        onClick={() => {
          closeMenus();
          setIdleTooltip(null);
          if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        }}
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

      {radialMenu && createPortal(
        <React.Fragment>
          {(() => { console.log('Rendering pie menu visually:', radialMenu); return null; })()}
          <div
            className="pie-menu-overlay"
            onClick={closeMenus}
            onContextMenu={(e) => { e.preventDefault(); closeMenus(); }}
          />
          <div
            className="pie-menu-container"
            style={{ left: radialMenu.screenX - 160, top: radialMenu.screenY - 160 }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => { e.preventDefault(); }}
          >
            <svg className="pie-svg" viewBox="0 0 320 320" style={{ pointerEvents: 'none' }}>
              {(() => {
                const items = [
                  { type: 'calculateNode', label: 'Math', icon: 'fx', color: '#ffcc33', desc: 'Calculation' },
                  { type: 'textNode', label: 'Text', icon: '¶', color: '#4facfe', desc: 'Logic' }
                ];
                const size = 320;
                const center = size / 2;
                const outerRadius = 140;
                const innerRadius = 55;
                const anglePerItem = 180;

                const describeArc = (start: number, end: number) => {
                  const polarToCartesian = (cx: number, cy: number, r: number, angleInDegrees: number) => {
                    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
                    return { x: cx + (r * Math.cos(angleInRadians)), y: cy + (r * Math.sin(angleInRadians)) };
                  };
                  const sOut = polarToCartesian(center, center, outerRadius, end);
                  const eOut = polarToCartesian(center, center, outerRadius, start);
                  const sIn = polarToCartesian(center, center, innerRadius, end);
                  const eIn = polarToCartesian(center, center, innerRadius, start);
                  return ["M", sOut.x, sOut.y, "A", outerRadius, outerRadius, 0, 0, 0, eOut.x, eOut.y, "L", eIn.x, eIn.y, "A", innerRadius, innerRadius, 0, 0, 1, sIn.x, sIn.y, "Z"].join(" ");
                };

                return items.map((item, i) => {
                  // Add a small 2 degree gap to prevent the SVG 180 degree arc bug where A command fails if points are diametrically perfectly opposed
                  const startAngle = i * anglePerItem + 2; 
                  const endAngle = (i + 1) * anglePerItem - 2;
                  
                  const midAngle = i * anglePerItem + anglePerItem / 2;
                  const radian = (midAngle - 90) * Math.PI / 180;
                  const tx = center + Math.cos(radian) * 95;
                  const ty = center + Math.sin(radian) * 95;
                  const isActive = radialSelection === item.type;

                  return (
                    <g key={item.type}>
                      <path
                        className={`pie-segment ${isActive ? 'active' : ''}`}
                        d={describeArc(startAngle, endAngle)}
                        style={{ '--item-color': item.color, pointerEvents: 'all' } as any}
                        onClick={() => handleAddNode(item.type)}
                      />
                      <g className="pie-label-group" transform={`translate(${tx}, ${ty})`}>
                        <text className="pie-item-icon" y="-15" style={{ '--item-color': item.color } as any}>{item.icon}</text>
                        <text className="pie-item-label" y="5" style={{ fill: isActive ? '#fff' : '#ccc' }}>{item.label}</text>
                        <text className="pie-item-desc" y="20">{item.desc}</text>
                      </g>
                    </g>
                  );
                });
              })()}
            </svg>
            <div className="pie-menu-center-v2" onClick={closeMenus}>
              {radialSelection ? '+' : '×'}
            </div>
          </div>
        </React.Fragment>,
        document.body
      )}

      {nodeMenu && (
        <div
          className="pane-context-menu"
          style={{ position: 'absolute', left: nodeMenu.x, top: nodeMenu.y, zIndex: 1000 }}
          onMouseLeave={() => setNodeMenu(null)}
        >
          <div className="menu-header">Node Actions</div>
          <div className="menu-item" onClick={handleDuplicateNode}>Duplicate Node</div>
          <div className="menu-item" style={{ color: '#ff4757' }} onClick={handleDeleteNode}>Delete Node</div>
        </div>
      )}

      {idleTooltip && createPortal(
        <div 
          className="idle-tooltip"
          style={{
            position: 'fixed',
            left: idleTooltip.x + 20,
            top: idleTooltip.y + 20,
            background: 'rgba(15, 15, 20, 0.75)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            padding: '8px 14px',
            borderRadius: '10px',
            color: 'rgba(255, 255, 255, 0.5)',
            fontSize: '0.7rem',
            pointerEvents: 'none',
            zIndex: 9999,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            letterSpacing: '0.02em',
            fontWeight: 500
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ color: '#4facfe', fontWeight: 700 }}>右鍵</span> 創造節點
          </span>
          <span style={{ opacity: 0.3 }}>|</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ color: '#ffcc00', fontWeight: 700 }}>Shift + 右鍵</span> 快速創造
          </span>
        </div>,
        document.body
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
