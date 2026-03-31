import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ReactFlow, Background, Controls, ReactFlowProvider, useReactFlow, BackgroundVariant } from '@xyflow/react';
import { useShallow } from 'zustand/react/shallow';
import '@xyflow/react/dist/style.css';

import useStore from './store/useStore';
import { nodeTypes, nodeLibrary, getNodeDefinition } from './nodes/registry';
import { Sidebar } from './components/Sidebar';
import { FloatingPalette } from './components/FloatingPalette';
import { Icons } from './components/Icons';
import { DebugOverlay, countRender } from './components/DebugOverlay';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';

function Flow() {
  const { t } = useLanguage();
  const { 
    nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, addNodes, removeNode, 
    handleProximitySnap, updateMergeHint, setAltPressed, setCtrlPressed, theme, 
    isSidebarOpen, setDeletingHover, draggingEjectPos, hoveredNodeId, 
    setHoveredNodeId, updateNodeDimensions, isAltPressed, undo, redo, takeSnapshot
  } = useStore(useShallow(state => ({
    nodes: state.nodes,
    edges: state.edges,
    onNodesChange: state.onNodesChange,
    onEdgesChange: state.onEdgesChange,
    onConnect: state.onConnect,
    addNode: state.addNode,
    addNodes: state.addNodes,
    removeNode: state.removeNode,
    handleProximitySnap: state.handleProximitySnap,
    updateMergeHint: state.updateMergeHint,
    setAltPressed: state.setAltPressed,
    setCtrlPressed: state.setCtrlPressed,
    theme: state.theme,
    isSidebarOpen: state.isSidebarOpen,
    setDeletingHover: state.setDeletingHover,
    draggingEjectPos: state.draggingEjectPos,
    hoveredNodeId: state.hoveredNodeId,
    setHoveredNodeId: state.setHoveredNodeId,
    updateNodeDimensions: state.updateNodeDimensions,
    isAltPressed: state.isAltPressed,
    undo: state.undo,
    redo: state.redo,
    takeSnapshot: state.takeSnapshot
  })));
  const mergeHint = useStore(state => state.mergeHint);
  const { screenToFlowPosition, flowToScreenPosition } = useReactFlow();
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
      if (e.key === 'Control' || e.key === 'Meta') setCtrlPressed(e.type === 'keydown');

      // [UNDO/REDO Shortcuts]
      if (e.type === 'keydown' && (e.metaKey || e.ctrlKey)) {
        if (e.key === 'z') {
          if (e.shiftKey) {
            e.preventDefault();
            redo();
          } else {
            e.preventDefault();
            undo();
          }
        } else if (e.key === 'y') {
          e.preventDefault();
          redo();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('keyup', handleKey);
    };
  }, [setAltPressed, setCtrlPressed]);


  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  // Handle Cmd+Scroll for node resizing with event aggregation
  const resizeRafRef = useRef<number | null>(null);
  const pendingDeltaRef = useRef<number>(0);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
        // [FIX] Use ONLY metaKey (Cmd on Mac), NOT ctrlKey.
        // On Mac, trackpad pinch-to-zoom fires wheel events with ctrlKey=true.
        // If we also check ctrlKey, pinch gestures would resize nodes instead of zooming the canvas.
        if (e.metaKey && hoveredNodeId) {
            e.preventDefault();
            e.stopPropagation();
            
            pendingDeltaRef.current += e.deltaY;

            if (resizeRafRef.current === null) {
                resizeRafRef.current = requestAnimationFrame(() => {
                    const start = performance.now();
                    const factorW = -1.2, factorH = -0.8;
                    updateNodeDimensions(hoveredNodeId!, pendingDeltaRef.current * factorW, pendingDeltaRef.current * factorH);
                    pendingDeltaRef.current = 0;
                    resizeRafRef.current = null;
                    const end = performance.now();
                    if (end - start > 10) console.warn(`[Performance] Resize logic took ${Math.round(end - start)}ms`);
                });
            }
        }
    };

    window.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => {
        window.removeEventListener('wheel', handleWheel, { capture: true });
        if (resizeRafRef.current !== null) cancelAnimationFrame(resizeRafRef.current);
    };
  }, [hoveredNodeId, updateNodeDimensions]);

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
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [radialMenu]);

  const filteredLibrary = nodeLibrary.filter(item =>
    item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.desc.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const onPaneContextMenu = useCallback((e: MouseEvent | React.MouseEvent | { preventDefault: () => void, clientX: number, clientY: number, shiftKey?: boolean }) => {
    e.preventDefault();
    if (radialMenu) {
      if (!('shiftKey' in e && e.shiftKey)) { setRadialMenu(null); setRadialSelection(null); }
      return;
    }
    setNodeMenu(null);
    setSearchQuery('');
    if ('shiftKey' in e && e.shiftKey) {
      setPaneMenu(null);
      setRadialMenu({ x: e.clientX, y: e.clientY, screenX: e.clientX, screenY: e.clientY });
      return;
    }
    const menuWidth = 350;
    const menuHeight = 500;
    let x = e.clientX;
    let y = e.clientY;
    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 20;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 20;
    setPaneMenu({ x, y, screenX: e.clientX, screenY: e.clientY });
    setTimeout(() => searchInputRef.current?.focus(), 10);
  }, [radialMenu]);

  const onNodeContextMenu = useCallback((e: React.MouseEvent | { currentTarget: any, clientX: number, clientY: number, preventDefault: () => void }, node: any) => {
    e.preventDefault();
    setPaneMenu(null);
    const rect = 'currentTarget' in e && e.currentTarget ? (e.currentTarget as HTMLElement).getBoundingClientRect() : { top: e.clientY, height: 100 };
    const nodeHeight = (rect as any).height || 100;
    const relativeY = ((e.clientY - (rect as any).top) / nodeHeight) * 100;
    setNodeMenu({ x: e.clientX, y: e.clientY, nodeId: node.id, relativeY });
  }, []);

  // Long press for touch support
  const touchTimerRef = useRef<any>(null);
  const handleTouchStart = useCallback((e: any, node?: any) => {
    const touch = e.touches[0];
    const { clientX, clientY } = touch;
    const target = e.currentTarget;
    
    if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
    
    touchTimerRef.current = setTimeout(() => {
      if (node) {
        onNodeContextMenu({ preventDefault: () => {}, clientX, clientY, currentTarget: target }, node);
      } else {
        onPaneContextMenu({ preventDefault: () => {}, clientX, clientY });
      }
      touchTimerRef.current = null;
    }, 600);
  }, [onPaneContextMenu, onNodeContextMenu]);

  const handleTouchEnd = useCallback(() => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  }, []);


  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow');
      const ejectDataStr = event.dataTransfer.getData('application/reactflow-eject');
      if (ejectDataStr) {
        try {
          const { sliderData } = JSON.parse(ejectDataStr);
          const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
          addNode({ ...sliderData, id: `slider-ejected-${Date.now()}`, position, selected: true } as any);
          return;
        } catch (e) { console.error('Failed to parse eject data', e); }
      }
      if (type) handleAddNode(type, undefined, { x: event.clientX, y: event.clientY });
    }, [screenToFlowPosition, addNode]);

  const handleAddNode = (type: string, variant?: string, customPos?: { x: number, y: number }) => {
    const posSource = customPos || (radialMenu ? { x: radialMenu.screenX, y: radialMenu.screenY } : paneMenu ? { x: paneMenu.screenX, y: paneMenu.screenY } : null);
    if (!posSource) return;
    const position = screenToFlowPosition({ x: posSource.x, y: posSource.y });
    const def = getNodeDefinition(type);
    const handles = def ? def.defaultHandles : [];
    const size = def ? def.defaultSize : { width: 200, height: 120 };
    addNode({ id: `${type}-${Date.now()}`, type, position, style: size, data: { handles, ...(variant ? { variant } : {}), ...(type === 'rangeNode' ? { rangeDef: '0..10' } : {}) } } as any);
    setPaneMenu(null); setRadialMenu(null);
  };

  useEffect(() => {
    const handleAddAtCenter = (e: any) => {
      const type = e.detail.type;
      const { x, y } = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      handleAddNode(type, undefined, { x, y });
    };
    window.addEventListener('add-node-at-center', handleAddAtCenter);
    return () => window.removeEventListener('add-node-at-center', handleAddAtCenter);
  }, [handleAddNode]);


  const handleDeleteNode = () => { if (nodeMenu) { removeNode(nodeMenu.nodeId); setNodeMenu(null); } };
  const handleDuplicateNode = () => {
    if (!nodeMenu) return;
    const node = nodes.find(n => n.id === nodeMenu.nodeId);
    if (!node) return;
    addNode({ ...node, id: `${node.type}-${Date.now()}`, position: { x: node.position.x + 30, y: node.position.y + 30 }, selected: true } as any);
    setNodeMenu(null);
  };

  const closeMenus = () => { setPaneMenu(null); setRadialMenu(null); setNodeMenu(null); };

  const onConnectStart = useCallback((_event: any, { nodeId, handleId, handleType }: any) => {
    connectingNodeRef.current = { nodeId, handleId, handleType };
  }, []);

  const onConnectEnd = useCallback(() => {
    connectingNodeRef.current = null;
  }, []);

  countRender('Flow (App.tsx)');

  return (
    <div style={{ width: '100vw', height: '100vh', background: 'var(--bg-page)' }}>
      <DebugOverlay />
      <Sidebar />
      <FloatingPalette />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onDragOver={onDragOver}
        onDrop={onDrop}
        connectOnClick={false}
        onTouchStart={(e) => {
          const target = e.target as HTMLElement;
          const nodeEl = target.closest('.react-flow__node');
          if (nodeEl) {
            const nodeId = nodeEl.getAttribute('data-id');
            const node = nodes.find(n => n.id === nodeId);
            if (node) handleTouchStart(e, node);
          } else if (target.classList.contains('react-flow__pane') || target.closest('.react-flow__pane')) {
            handleTouchStart(e);
          }
        }}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchEnd}
        onMouseMove={(e) => {

          if (idleTooltip) setIdleTooltip(null);
          if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
          const target = e.target as HTMLElement;
          if (target.classList.contains('react-flow__pane') && !paneMenu && !radialMenu && !nodeMenu) {
            const { clientX, clientY } = e;
            idleTimerRef.current = setTimeout(() => setIdleTooltip({ x: clientX, y: clientY }), 1200);
          }
        }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onNodeDragStart={(event, _node, nodesBeingDragged) => {
          takeSnapshot(); // Snapshot BEFORE dragging
          if (event.altKey || isAltPressed) {
            // [CLONE] Create a copy of each dragged node at its starting position.
            // Since onNodeDragStart is called exactly when the drag begins, 
            // the positions in nodesBeingDragged are the original positions.
            const copies = nodesBeingDragged.map(n => ({
              ...n,
              id: `${n.type}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              data: { ...n.data }, 
              selected: false,
              dragging: false,
            }));
            addNodes(copies as any);
          }
        }}
        onNodeDrag={(event: any, node) => {
          // [PERF] Let math-field lose focus on drag to stop cursor/RAF thrashing
          (document.activeElement as HTMLElement)?.blur();
          
          const x = 'clientX' in event ? event.clientX : (event.touches ? event.touches[0].clientX : 0);
          const y = 'clientY' in event ? event.clientY : (event.touches ? event.touches[0].clientY : 0);
          const threshold = isSidebarOpen ? 180 : 40;
          setDeletingHover(x < threshold);
          
          // Update merge hint with flow position
          updateMergeHint(node.id, screenToFlowPosition({ x, y }));
        }}
        onNodeDragStop={(event: any, node) => {
          setDeletingHover(false);
          const x = 'clientX' in event ? event.clientX : (event.touches ? event.touches[0].clientX : 0);
          if (x < (isSidebarOpen ? 180 : 40)) removeNode(node.id);
          else handleProximitySnap(node.id);
        }}
        onPaneContextMenu={onPaneContextMenu}
        onMouseDown={(e: React.MouseEvent) => {

          setIdleTooltip(null);
          if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
          if (e.button === 2 && e.shiftKey) {
            const target = e.target as HTMLElement;
            if (target.classList.contains('react-flow__pane') || target.closest('.react-flow__pane')) {
              setPaneMenu(null);
              setRadialMenu({ x: e.clientX, y: e.clientY, screenX: e.clientX, screenY: e.clientY });
            }
          }
        }}
        onNodeContextMenu={onNodeContextMenu}
        onNodeMouseEnter={(_e, node) => setHoveredNodeId(node.id)}
        onNodeMouseLeave={() => setHoveredNodeId(null)}
        onClick={closeMenus}

        fitView
        colorMode={theme}
      >
        <Background color={theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(14, 47, 11, 0.08)'} gap={18} variant={BackgroundVariant.Dots} />
        <Controls position="bottom-right" />
      </ReactFlow>

      {paneMenu && (
        <div
          className={`command-palette nodrag ${searchQuery ? 'is-searching' : ''} ${isShiftPressed ? 'is-shifting' : ''}`}
          style={{ position: 'absolute', left: paneMenu.x, top: paneMenu.y }}
        >
          <div className="command-search-container">
            <input
              ref={searchInputRef}
              type="text"
              className="command-input"
              placeholder={t('common.search_placeholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filteredLibrary.length > 0) handleAddNode(filteredLibrary[0].type);
                else if (e.key === 'Escape') setPaneMenu(null);
              }}
            />
          </div>
          <div className="command-list">
            {filteredLibrary.length > 0 ? (
              Array.from(new Set(filteredLibrary.map(n => n.category))).map(cat => (
                <React.Fragment key={cat}>
                  <div className="command-category">{t(`categories.${cat.toLowerCase()}`)}</div>
                  {filteredLibrary.filter(n => n.category === cat).map(item => (
                    <div key={item.type} className="command-item" onClick={() => handleAddNode(item.type)}>
                      <div className="command-icon" style={{ '--theme-color': item.color } as any}>{item.icon}</div>
                      <div className="command-info"><span className="command-label">{item.label}</span><span className="command-desc">{item.desc}</span></div>
                    </div>
                  ))}
                </React.Fragment>
              ))
            ) : <div className="command-empty">{t('common.no_nodes')}</div>}
          </div>
        </div>
      )}

      {radialMenu && createPortal(
        <div className="pie-menu-container" style={{ left: radialMenu.screenX - 160, top: radialMenu.screenY - 160 }}>
          <svg className="pie-svg" viewBox="0 0 320 320">
            {(() => {
                const items = [
                  { type: 'calculateNode', label: t('nodes.calculate.title'), icon: <Icons.Calculate size={24} />, color: '#ffcc33', start: 2, end: 178 },
                  { type: 'textNode', label: t('categories.text') || 'Text', icon: <Icons.Text size={24} />, color: '#4facfe', start: 182, end: 358 }
                ];
                const center = 160; const outer = 140; const inner = 55;
                const polarToCartesian = (r: number, angle: number) => {
                    const rad = (angle - 90) * Math.PI / 180;
                    return { x: center + r * Math.cos(rad), y: center + r * Math.sin(rad) };
                };
                return items.map((item) => {
                    const isActive = radialSelection === item.type;
                    const sOut = polarToCartesian(outer, item.end);
                    const eOut = polarToCartesian(outer, item.start);
                    const sIn = polarToCartesian(inner, item.end);
                    const eIn = polarToCartesian(inner, item.start);
                    const d = ["M", sOut.x, sOut.y, "A", outer, outer, 0, 0, 0, eOut.x, eOut.y, "L", eIn.x, eIn.y, "A", inner, inner, 0, 0, 1, sIn.x, sIn.y, "Z"].join(" ");
                    const midAngle = (item.start + item.end) / 2;
                    const rad = (midAngle - 90) * Math.PI / 180;
                    const tx = center + Math.cos(rad) * 95;
                    const ty = center + Math.sin(rad) * 95;
                    return (
                        <g key={item.type}>
                          <path className={`pie-segment ${isActive ? 'active' : ''}`} d={d} style={{ '--item-color': item.color } as any} onClick={() => handleAddNode(item.type)} />
                          <g className="pie-label-group" transform={`translate(${tx}, ${ty})`}>
                            <g transform="translate(-12, -35)" style={{ color: item.color }}>{item.icon}</g>
                            <text className="pie-item-label" y="5" style={{ fill: 'var(--text-main)', opacity: isActive ? 1 : 0.6 }}>{item.label}</text>
                            <text className="pie-item-desc" y="20" style={{ fill: 'var(--text-main)', opacity: 0.4 }}>{item.type === 'calculateNode' ? t('nodes.calculate.desc') || 'Calculation' : t('categories.logic')}</text>
                          </g>
                        </g>
                    );
                });
            })()}
          </svg>
          <div className="pie-menu-center-v2" onClick={closeMenus}>{radialSelection ? '+' : '×'}</div>
        </div>,
        document.body
      )}

      {nodeMenu && (
        <div className="pane-context-menu" style={{ position: 'absolute', left: nodeMenu.x, top: nodeMenu.y, zIndex: 1000 }} onMouseLeave={() => setNodeMenu(null)}>
          <div className="menu-header">{t('common.node_actions')}</div>
          <div className="menu-item" onClick={handleDuplicateNode}>{t('common.duplicate')}</div>
          <div className="menu-item" style={{ color: '#ff4757' }} onClick={handleDeleteNode}>{t('common.delete')}</div>
        </div>
      )}

      {idleTooltip && createPortal(
        <div className="idle-tooltip" style={{ position: 'fixed', left: idleTooltip.x + 20, top: idleTooltip.y + 20, background: 'var(--bg-node)', backdropFilter: 'blur(10px)', border: '1px solid var(--border-node)', padding: '8px 14px', borderRadius: '12px', color: 'var(--text-main)', fontSize: '0.75rem', pointerEvents: 'none', zIndex: 9999, boxShadow: 'var(--node-shadow)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}>
          <span><span style={{ color: '#4facfe', fontWeight: 700 }}>{t('tips.right_click')}</span> {t('tips.create_node')}</span>
          <span style={{ opacity: 0.3 }}>|</span>
          <span><span style={{ color: '#ffcc00', fontWeight: 700 }}>{t('tips.shift_right_click')}</span> {t('tips.quick_create')}</span>
        </div>,
        document.body
      )}

      {draggingEjectPos && createPortal(
        <svg style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 99999, width: '100vw', height: '100vh' }}>
          <defs>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" result="blur" /><feComposite in="SourceGraphic" in2="blur" operator="over" /></filter>
            <linearGradient id="eject-grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#4facfe" /><stop offset="100%" stopColor="#00f2fe" /></linearGradient>
          </defs>
          <path d={`M ${draggingEjectPos.startX} ${draggingEjectPos.startY} L ${draggingEjectPos.curX} ${draggingEjectPos.curY}`} stroke="url(#eject-grad)" strokeWidth="3" strokeDasharray="6, 8" strokeLinecap="round" filter="url(#glow)" fill="none" style={{ animation: 'eject-flow 0.5s linear infinite', opacity: 0.8 }} />
          <circle cx={draggingEjectPos.startX} cy={draggingEjectPos.startY} r="4" fill="#4facfe" />
          <circle cx={draggingEjectPos.curX} cy={draggingEjectPos.curY} r="6" fill="#00f2fe" filter="url(#glow)" />
        </svg>,
        document.body
      )}

      {mergeHint && (() => {
        const targetNode = nodes.find(n => n.id === mergeHint.targetId);
        if (!targetNode) return null;
        const bWidth = targetNode.measured?.width || targetNode.width || 200;
        const bHeight = targetNode.measured?.height || targetNode.height || 100;
        let anchor = { x: targetNode.position.x + bWidth, y: targetNode.position.y + bHeight / 2 };
        let offset = { x: 0, y: 0 };
        let transform = 'translateY(-50%)';

        if (mergeHint.side === 'left') {
          anchor = { x: targetNode.position.x, y: targetNode.position.y + bHeight / 2 };
          transform = 'translate(-100%, -50%)';
          offset.x = -15;
        } else if (mergeHint.side === 'right') {
          anchor = { x: targetNode.position.x + bWidth, y: targetNode.position.y + bHeight / 2 };
          transform = 'translateY(-50%)';
          offset.x = 15;
        } else if (mergeHint.side === 'top') {
          anchor = { x: targetNode.position.x + bWidth / 2, y: targetNode.position.y };
          transform = 'translateX(-50%) translateY(-100%)';
          offset.y = -15;
        } else if (mergeHint.side === 'bottom') {
          anchor = { x: targetNode.position.x + bWidth / 2, y: targetNode.position.y + bHeight };
          transform = 'translateX(-50%)';
          offset.y = 15;
        }

        const screenPos = flowToScreenPosition(anchor);
        return createPortal(
          <div style={{ position: 'fixed', left: screenPos.x + offset.x, top: screenPos.y + offset.y, transform, zIndex: 99999, pointerEvents: 'none' }}>
              <div className="merge-hint-pill"><span className="plus">+</span>{mergeHint.label}</div>
          </div>,
          document.body
        );
      })()}

      <style>{`
        @keyframes eject-flow { from { stroke-dashoffset: 28; } to { stroke-dashoffset: 0; } }
        @keyframes hint-pulse { 0% { transform: scale(0.98); opacity: 0.8; } 50% { transform: scale(1.02); opacity: 1; } 100% { transform: scale(0.98); opacity: 0.8; } }
        .merge-hint-pill { background: var(--bg-node); backdrop-filter: blur(10px); border: 1px solid var(--border-node); border-radius: 12px; padding: 8px 14px; color: var(--text-main); font-size: 0.75rem; font-weight: 500; white-space: nowrap; display: flex; align-items: center; gap: 8px; animation: hint-pulse 2s infinite ease-in-out; letter-spacing: 0.02em; boxShadow: var(--node-shadow); }
        .merge-hint-pill .plus { color: #4facfe; font-weight: 700; font-size: 1rem; }
      `}</style>
    </div>
  );
}

function App() {
  return (
    <LanguageProvider>
      <ReactFlowProvider>
        <Flow />
      </ReactFlowProvider>
    </LanguageProvider>
  );
}

export default App;
