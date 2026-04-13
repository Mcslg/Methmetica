import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ReactFlow, Background, Controls, ReactFlowProvider, useReactFlow, BackgroundVariant, type Edge } from '@xyflow/react';
import { useShallow } from 'zustand/react/shallow';
import '@xyflow/react/dist/style.css';

import useStore, { type AppNode } from './store/useStore';
import { nodeTypes, getNodeDefinition, buildNodeCatalog } from './nodes/registry';
import { getTemplateHandles } from './community/types';
import { Sidebar } from './components/Sidebar';
import { ExplainOverlay } from './components/ExplainOverlay';
import { FloatingPalette } from './components/FloatingPalette';
import { Icons } from './components/Icons';
import { Dashboard } from './components/Dashboard';
import { DebugOverlay, countRender } from './components/DebugOverlay';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { AuthBootstrap } from './components/AuthBootstrap';
import { getCommunityWorkflowBlueprint, getCommunityWorkflowBySlug } from './community/catalog';
import { isSupabaseConfigured } from './integrations/supabase/client';
import { getWorkflowBlueprintFromSupabaseByRef } from './integrations/supabase/workflows';
import * as driveService from './utils/googleDriveService';
import { loadLocalDraft, saveLocalDraft } from './utils/localDraftService';
import { type AppRoute, parseRouteFromLocation, readEditorSnapshotFromHistory, replaceRoute } from './utils/navigation';

type PaneMenuEvent = {
  preventDefault: () => void;
  clientX: number;
  clientY: number;
  shiftKey?: boolean;
};

type NodeMenuEvent = PaneMenuEvent & {
  currentTarget?: EventTarget | null;
};

type AddNodeAtCenterEvent = CustomEvent<{ type: string; templateId?: string }>;
type ConnectStartPayload = { nodeId: string | null; handleId: string | null; handleType: string | null };
type TouchTargetEvent = React.TouchEvent<HTMLElement>;
function Flow() {
  const { t, language } = useLanguage();
  const {
    nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, addNodes, removeNode,
    handleProximitySnap, updatePluginHint, setAltPressed, setCtrlPressed, theme,
    isSidebarOpen, setDeletingHover, draggingEjectPos, hoveredNodeId,
    setHoveredNodeId, updateNodeDimensions, isAltPressed, undo, redo, takeSnapshot, sliceEdges,
    heldConnection, setHeldConnection
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
    updatePluginHint: state.updatePluginHint,
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
    takeSnapshot: state.takeSnapshot,
    sliceEdges: state.sliceEdges,
    heldConnection: state.heldConnection,
    setHeldConnection: state.setHeldConnection
  })));
  const communityTemplates = useStore(state => state.communityTemplates);
  const pluginHint = useStore(state => state.pluginHint);
  const { screenToFlowPosition, flowToScreenPosition } = useReactFlow();
  const [paneMenu, setPaneMenu] = useState<{ x: number, y: number, screenX: number, screenY: number } | null>(null);
  const [radialMenu, setRadialMenu] = useState<{ x: number, y: number, screenX: number, screenY: number } | null>(null);
  const [radialSelection, setRadialSelection] = useState<'textNode' | 'calculateNode' | null>(null);
  const radialSelectionRef = useRef<'textNode' | 'calculateNode' | null>(null);
  const [nodeMenu, setNodeMenu] = useState<{ x: number, y: number, nodeId: string, relativeY: number } | null>(null);
  const connectingNodeRef = useRef<{ nodeId: string, handleId: string, handleType: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [isCtrlPressed, setIsCtrlPressedState] = useState(false);
  const [lastFlowPos, setLastFlowPos] = useState<{ x: number, y: number } | null>(null);
  const [bladeTrail, setBladeTrail] = useState<{ x: number, y: number, id: number }[]>([]);
  const [idleTooltip, setIdleTooltip] = useState<{ x: number, y: number, text?: React.ReactNode } | null>(null);
  const [dataTooltip, setDataTooltip] = useState<{ x: number, y: number, text: React.ReactNode } | null>(null);
  const [isExplainMode, setIsExplainMode] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const idleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const handleCustomTooltip = (e: CustomEvent) => {
      if (!isExplainMode) {
          setDataTooltip(null);
          return;
      }
      if (e.detail) {
        setDataTooltip(e.detail);
      } else {
        setDataTooltip(null);
      }
    };
    window.addEventListener('setTooltip', handleCustomTooltip as EventListener);
    return () => window.removeEventListener('setTooltip', handleCustomTooltip as EventListener);
  }, [isExplainMode]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(e.type === 'keydown');
      if (e.key === 'Alt') setAltPressed(e.type === 'keydown');
      if (e.key === 'Control' || e.key === 'Meta') {
        setCtrlPressed(e.type === 'keydown');
        setIsCtrlPressedState(e.type === 'keydown');
      }
      if (e.type === 'keydown' && e.key.toLowerCase() === 'm' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        const tagName = target?.tagName;
        const isTypingTarget = !!target && (target.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT');
        if (!isTypingTarget) {
          e.preventDefault();
          setIsExplainMode(prev => !prev);
        }
      }

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
  }, [redo, setAltPressed, setCtrlPressed, undo]);


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

  const filteredLibrary = buildNodeCatalog(communityTemplates).filter(item => {
    const matches =
      item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.desc.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matches) return false;
    if (!item.hidden) return true;
    return searchQuery.trim().length > 0;
  });

  const explainNodeId = isExplainMode ? hoveredNodeId : null;

  const onPaneContextMenu = useCallback((e: MouseEvent | React.MouseEvent | PaneMenuEvent) => {
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

  const onNodeContextMenu = useCallback((e: React.MouseEvent<HTMLElement> | NodeMenuEvent, node: AppNode) => {
    e.preventDefault();
    setPaneMenu(null);
    const currentTarget = 'currentTarget' in e ? e.currentTarget : null;
    const rect = currentTarget instanceof HTMLElement ? currentTarget.getBoundingClientRect() : { top: e.clientY, height: 100 };
    const nodeHeight = rect.height || 100;
    const relativeY = ((e.clientY - rect.top) / nodeHeight) * 100;
    setNodeMenu({ x: e.clientX, y: e.clientY, nodeId: node.id, relativeY });
  }, []);

  // Long press for touch support
  const touchTimerRef = useRef<number | null>(null);
  const handleTouchStart = useCallback((e: TouchTargetEvent, node?: AppNode) => {
    const touch = e.touches[0];
    const { clientX, clientY } = touch;
    const target = e.currentTarget;

    if (touchTimerRef.current) clearTimeout(touchTimerRef.current);

    touchTimerRef.current = setTimeout(() => {
      if (node) {
        onNodeContextMenu({ preventDefault: () => { }, clientX, clientY, currentTarget: target }, node);
      } else {
        onPaneContextMenu({ preventDefault: () => { }, clientX, clientY });
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

  const handleAddNode = useCallback((type: string, variant?: string, customPos?: { x: number, y: number }, templateId?: string) => {
    const posSource = customPos || (radialMenu ? { x: radialMenu.screenX, y: radialMenu.screenY } : paneMenu ? { x: paneMenu.screenX, y: paneMenu.screenY } : null);
    if (!posSource) return;
    const position = screenToFlowPosition({ x: posSource.x, y: posSource.y });
    const def = getNodeDefinition(type);
    const template = templateId ? communityTemplates.find(t => t.id === templateId) : null;
    const handles = template ? getTemplateHandles(template).map(handle => ({
      id: handle.id,
      type: handle.type,
      position: handle.position,
      offset: handle.offset,
      label: handle.label,
    })) : (def ? def.defaultHandles : []);
    const size = template ? template.size : (def ? def.defaultSize : { width: 200, height: 120 });
    addNode({
      id: `${templateId || type}-${Date.now()}`,
      type,
      position,
      width: size.width,
      height: size.height,
      style: size,
      data: {
        handles,
        ...(variant ? { variant } : {}),
        ...(type === 'rangeNode' ? { rangeDef: '0..10' } : {}),
        ...(template ? {
          templateId: template.id,
          templateFields: Object.fromEntries(template.fields.map(field => [field.id, field.defaultValue || ''])),
          templateSummary: template.summary,
          templateBestAlgorithm: template.bestAlgorithm,
          templateAlternatives: template.alternativeAlgorithms,
          templateRelatedWorkflowIds: template.relatedWorkflowIds,
        } : {}),
      }
    } as AppNode);
    setPaneMenu(null); setRadialMenu(null);
  }, [addNode, communityTemplates, paneMenu, radialMenu, screenToFlowPosition]);

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
  }, [handleAddNode, radialMenu]);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData('application/reactflow');
    const ejectDataStr = event.dataTransfer.getData('application/reactflow-eject');
    if (ejectDataStr) {
      try {
        const { sliderData } = JSON.parse(ejectDataStr);
        const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        addNode({ ...sliderData, id: `slider-ejected-${Date.now()}`, position, selected: true } as AppNode);
        return;
      } catch (e) { console.error('Failed to parse eject data', e); }
    }
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        handleAddNode(parsed.type, undefined, { x: event.clientX, y: event.clientY }, parsed.templateId);
      } catch {
        handleAddNode(raw, undefined, { x: event.clientX, y: event.clientY });
      }
    }
  }, [addNode, handleAddNode, screenToFlowPosition]);

  useEffect(() => {
    const handleAddAtCenter = (e: Event) => {
      const addEvent = e as AddNodeAtCenterEvent;
      const type = addEvent.detail.type;
      const templateId = addEvent.detail.templateId;
      const { x, y } = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      handleAddNode(type, undefined, { x, y }, templateId);
    };
    window.addEventListener('add-node-at-center', handleAddAtCenter);
    return () => window.removeEventListener('add-node-at-center', handleAddAtCenter);
  }, [handleAddNode]);


  const handleDeleteNode = () => { if (nodeMenu) { removeNode(nodeMenu.nodeId); setNodeMenu(null); } };
  const handleDuplicateNode = () => {
    if (!nodeMenu) return;
    const node = nodes.find(n => n.id === nodeMenu.nodeId);
    if (!node) return;
    addNode({ ...node, id: `${node.type}-${Date.now()}`, position: { x: node.position.x + 30, y: node.position.y + 30 }, selected: true } as AppNode);
    setNodeMenu(null);
  };

  const closeMenus = () => { setPaneMenu(null); setRadialMenu(null); setNodeMenu(null); };

  const getPointerClientPosition = (event: React.MouseEvent | React.TouchEvent) => (
    'touches' in event
      ? { x: event.touches[0]?.clientX ?? 0, y: event.touches[0]?.clientY ?? 0 }
      : { x: event.clientX, y: event.clientY }
  );

  const onConnectStart = useCallback((_event: unknown, { nodeId, handleId, handleType }: ConnectStartPayload) => {
    if (!nodeId || !handleId || !handleType) return;
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

          const currentFlowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
          
          // [SLICING] Handle Shift + Command slicing
          if (isShiftPressed && isCtrlPressed) {
            if (lastFlowPos) {
              sliceEdges(lastFlowPos, currentFlowPos);
            }
            setLastFlowPos(currentFlowPos);
            
            // Add to trail for visual effect
            setBladeTrail(prev => [...prev.slice(-15), { ...currentFlowPos, id: Date.now() }]);
          } else {
            if (lastFlowPos) setLastFlowPos(null);
            if (bladeTrail.length > 0) setBladeTrail([]);
          }

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
            addNodes(copies as AppNode[]);
          }
        }}
        onNodeDrag={(event: React.MouseEvent | React.TouchEvent, node: AppNode) => {
          // [PERF] Let math-field lose focus on drag to stop cursor/RAF thrashing
          (document.activeElement as HTMLElement)?.blur();

          const { x, y } = getPointerClientPosition(event);
          const threshold = isSidebarOpen ? 180 : 40;
          setDeletingHover(x < threshold);

          // Update plugin hint with flow position
          updatePluginHint(node.id, screenToFlowPosition({ x, y }));
        }}
        onNodeDragStop={(event: React.MouseEvent | React.TouchEvent, node: AppNode) => {
          setDeletingHover(false);
          const { x } = getPointerClientPosition(event);
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
        onEdgeMouseEnter={(e, edge) => {
          if (!isExplainMode) return;
          const sourceNode = useStore.getState().nodes.find(n => n.id === edge.source);
          if (sourceNode) {
            let val = sourceNode.data.value;
            let type = 'Any';
            if (edge.sourceHandle) {
               val = sourceNode.data.outputs?.[edge.sourceHandle] ?? val;
               const typedVal = sourceNode.data.typedOutputs?.[edge.sourceHandle];
               if (typedVal) type = typedVal.type;
               else if (!isNaN(Number(val))) type = 'Number';
               else if (typeof val === 'string') type = 'String';
            }
            setDataTooltip({
                x: e.clientX,
                y: e.clientY - 40,
                text: (
                    <div style={{ textAlign: 'left', minWidth: isShiftPressed ? '180px' : 'auto' }}>
                        <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>{isShiftPressed ? 'Full Metadata' : 'Data transmitted:'}</div>
                        <div style={{ fontFamily: 'monospace', fontWeight: 'bold', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                             {isShiftPressed ? JSON.stringify(val, null, 2) : String(val ?? 'undefined')}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--accent)', marginTop: 2 }}>{type}</div>
                        {isShiftPressed && (
                             <div style={{ fontSize: '0.65rem', opacity: 0.5, marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 4 }}>
                                Source: {edge.source}<br/>
                                Handle: {edge.sourceHandle || 'default'}
                             </div>
                        )}
                        {!isShiftPressed && <div style={{ fontSize: '0.6rem', opacity: 0.4, marginTop: 4 }}>Hold Shift for metadata</div>}
                    </div>
                )
            });
          }
        }}
        onEdgeMouseLeave={() => {
          if (isExplainMode) setDataTooltip(null);
        }}
        onClick={(e) => {
          // [RECONNECT] If holding a sliced connection, try to plug it in or drop it
          if (heldConnection) {
            const target = e.target as HTMLElement;
            const handleEl = target.closest('.react-flow__handle');
            if (handleEl) {
              const targetNodeId = handleEl.getAttribute('data-nodeid');
              const targetHandleId = handleEl.getAttribute('data-id');
              
              if (targetNodeId && targetHandleId) {
                onConnect({
                  source: heldConnection.nodeId,
                  sourceHandle: heldConnection.handleId,
                  target: targetNodeId,
                  targetHandle: targetHandleId
                });
              }
            }
            setHeldConnection(null);
          }
          closeMenus();
        }}

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
                if (e.key === 'Enter' && filteredLibrary.length > 0) {
                  const firstItem = filteredLibrary[0];
                  handleAddNode(firstItem.type, undefined, undefined, firstItem.templateId);
                }
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
                    <div key={item.templateId || item.type} className="command-item" onClick={() => handleAddNode(item.type, undefined, undefined, item.templateId)}>
                      <div className="command-icon" style={{ '--theme-color': item.color } as React.CSSProperties}>{item.icon}</div>
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
                    <path className={`pie-segment ${isActive ? 'active' : ''}`} d={d} style={{ '--item-color': item.color } as React.CSSProperties} onClick={() => handleAddNode(item.type)} />
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

      <div
        style={{
          position: 'fixed',
          right: 24,
          top: 18,
          zIndex: 99999,
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          borderRadius: 14,
          border: `1px solid ${isExplainMode ? 'rgba(74, 222, 128, 0.45)' : 'var(--border-node)'}`,
          background: isExplainMode
            ? (theme === 'dark' ? 'rgba(20, 34, 22, 0.82)' : 'rgba(240, 253, 244, 0.95)')
            : 'var(--bg-node)',
          backdropFilter: 'blur(14px)',
          color: 'var(--text-main)',
          boxShadow: 'var(--node-shadow)',
        }}
      >
        <span style={{ fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.65 }}>
          {language === 'zh-TW' ? '說明模式' : 'Explain Mode'}
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 28,
            height: 28,
            borderRadius: 8,
            background: isExplainMode ? 'rgba(74, 222, 128, 0.18)' : 'var(--bg-input)',
            border: `1px solid ${isExplainMode ? 'rgba(74, 222, 128, 0.45)' : 'var(--border-input)'}`,
            fontWeight: 700,
          }}
        >
          M
        </span>
      </div>

      <ExplainOverlay 
        isOpen={isExplainMode} 
        targetNodeId={explainNodeId} 
        isDataTooltipActive={!!dataTooltip} 
        onAddNode={handleAddNode} 
      />

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

      {/* [NEW] Held Connection (Sticky Wire) */}
      {heldConnection && (() => {
          const sourceNode = nodes.find(n => n.id === heldConnection.nodeId);
          if (!sourceNode) return null;
          const tipFlowPos = lastFlowPos ?? { x: sourceNode.position.x, y: sourceNode.position.y };
          const tipScreenPos = flowToScreenPosition(tipFlowPos);
          
          // Use current mouse pos (we need a screen position for the SVG overlay)
          // We can track current client position or convert flow position back
          const sourcePos = flowToScreenPosition({ 
            x: sourceNode.position.x + (sourceNode.measured?.width ?? 200) / 2, 
            y: sourceNode.position.y + (sourceNode.measured?.height ?? 100) / 2 
          });

          return createPortal(
            <svg style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 99998, width: '100vw', height: '100vh' }}>
              <defs>
                 <filter id="held-glow"><feGaussianBlur stdDeviation="3"/><feComposite in="SourceGraphic" operator="over"/></filter>
              </defs>
              <path 
                className="held-wire-path"
                d={`M ${sourcePos.x} ${sourcePos.y} C ${(sourcePos.x + tipScreenPos.x) / 2} ${sourcePos.y}, ${(sourcePos.x + tipScreenPos.x) / 2} ${tipScreenPos.y}, ${tipScreenPos.x} ${tipScreenPos.y}`}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2.5"
                strokeDasharray="5,5"
                filter="url(#held-glow)"
                style={{ opacity: 0.6 }}
              />
              <circle cx={tipScreenPos.x} cy={tipScreenPos.y} r="4" fill="var(--accent)" />
            </svg>,
            document.body
          );
      })()}

      {/* [NEW] Blade Trail Effect */}
      <svg style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 99999, width: '100vw', height: '100vh' }}>
        <defs>
          <filter id="blade-glow"><feGaussianBlur stdDeviation="2.5" result="blur"/><feComposite in="SourceGraphic" in2="blur" operator="over"/></filter>
        </defs>
        {bladeTrail.length > 1 && (
          <path 
            d={bladeTrail.map((p, i) => {
              const screenP = flowToScreenPosition(p);
              return `${i === 0 ? 'M' : 'L'} ${screenP.x} ${screenP.y}`;
            }).join(' ')}
            fill="none"
            stroke="#ff3e00"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#blade-glow)"
            style={{ opacity: 0.8, transition: 'opacity 0.2s' }}
          />
        )}
      </svg>

      {pluginHint && (() => {
        const targetNode = nodes.find(n => n.id === pluginHint.targetId);
        if (!targetNode) return null;
        const bWidth = targetNode.measured?.width || targetNode.width || 200;
        const bHeight = targetNode.measured?.height || targetNode.height || 100;
        let anchor = { x: targetNode.position.x + bWidth, y: targetNode.position.y + bHeight / 2 };
        const offset = { x: 0, y: 0 };
        let transform = 'translateY(-50%)';

        if (pluginHint.side === 'left') {
          anchor = { x: targetNode.position.x, y: targetNode.position.y + bHeight / 2 };
          transform = 'translate(-100%, -50%)';
          offset.x = -15;
        } else if (pluginHint.side === 'right') {
          anchor = { x: targetNode.position.x + bWidth, y: targetNode.position.y + bHeight / 2 };
          transform = 'translateY(-50%)';
          offset.x = 15;
        } else if (pluginHint.side === 'top') {
          anchor = { x: targetNode.position.x + bWidth / 2, y: targetNode.position.y };
          transform = 'translateX(-50%) translateY(-100%)';
          offset.y = -15;
        } else if (pluginHint.side === 'bottom') {
          anchor = { x: targetNode.position.x + bWidth / 2, y: targetNode.position.y + bHeight };
          transform = 'translateX(-50%)';
          offset.y = 15;
        }

        const screenPos = flowToScreenPosition(anchor);
        return createPortal(
          <div style={{ position: 'fixed', left: screenPos.x + offset.x, top: screenPos.y + offset.y, transform, zIndex: 99999, pointerEvents: 'none' }}>
            <div className="plugin-hint-pill"><span className="plus">+</span>{pluginHint.label}</div>
          </div>,
          document.body
        );
      })()}

      {dataTooltip && createPortal(
        <div style={{
            position: 'fixed',
            left: dataTooltip.x,
            top: dataTooltip.y,
            transform: 'translateX(-50%) translateY(-100%)',
            background: 'var(--bg-node)',
            border: '1px solid var(--border-node)',
            padding: '8px 12px',
            borderRadius: '12px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
            zIndex: 100000,
            pointerEvents: 'none',
            color: 'var(--text-main)',
            backdropFilter: 'blur(10px)',
            transition: 'opacity 0.2s',
        }}>
            {dataTooltip.text}
        </div>,
        document.body
      )}

      <style>{`
        @keyframes eject-flow { from { stroke-dashoffset: 28; } to { stroke-dashoffset: 0; } }
        @keyframes hint-pulse { 0% { transform: scale(0.98); opacity: 0.8; } 50% { transform: scale(1.02); opacity: 1; } 100% { transform: scale(0.98); opacity: 0.8; } }
        .plugin-hint-pill { background: var(--bg-node); backdrop-filter: blur(10px); border: 1px solid var(--border-node); border-radius: 12px; padding: 8px 14px; color: var(--text-main); font-size: 0.75rem; font-weight: 500; white-space: nowrap; display: flex; align-items: center; gap: 8px; animation: hint-pulse 2s infinite ease-in-out; letter-spacing: 0.02em; boxShadow: var(--node-shadow); }
        .plugin-hint-pill .plus { color: #4facfe; font-weight: 700; font-size: 1rem; }
      `}</style>
    </div>
  );
}

function App() {
  const currentView = useStore(state => state.currentView);
  const theme = useStore(state => state.theme);
  const setCurrentView = useStore(state => state.setCurrentView);
  const setGraph = useStore(state => state.setGraph);
  const setActiveFileId = useStore(state => state.setActiveFileId);
  const nodes = useStore(state => state.nodes);
  const edges = useStore(state => state.edges);
  const routeTokenRef = useRef(0);
  const [isRouteResolving, setIsRouteResolving] = useState(true);

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  const applyRoute = useCallback(async (route: AppRoute, historyState?: unknown) => {
    const token = ++routeTokenRef.current;
    setIsRouteResolving(true);

    if (route.view === 'home') {
      setCurrentView('home');
      setIsRouteResolving(false);
      return;
    }

    const shouldRestoreSnapshot = route.source === 'new' || route.source === 'draft';
    const snapshot = shouldRestoreSnapshot
      ? readEditorSnapshotFromHistory(historyState ?? window.history.state)
      : null;
    if (snapshot) {
      setGraph(snapshot.nodes as AppNode[], snapshot.edges as Edge[]);
      setActiveFileId(snapshot.activeFileId);
      setCurrentView('editor');
      setIsRouteResolving(false);
      return;
    }

    if (route.source === 'new') {
      setCurrentView('editor');
      setIsRouteResolving(false);
      return;
    }

    try {
      if (route.source === 'public' && route.id) {
        const blueprint =
          (isSupabaseConfigured ? await getWorkflowBlueprintFromSupabaseByRef(route.id) : null) ??
          getCommunityWorkflowBlueprint(route.id) ??
          (() => {
            const localBySlug = getCommunityWorkflowBySlug(route.id!);
            return localBySlug ? getCommunityWorkflowBlueprint(localBySlug.id) : null;
          })();
        if (!blueprint) throw new Error(`Workflow ${route.id} not found`);
        if (token !== routeTokenRef.current) return;
        setGraph(blueprint.nodes as AppNode[], blueprint.edges as Edge[]);
        setActiveFileId(null);
        setCurrentView('editor');
        return;
      }

      if (route.source === 'drive' && route.id) {
        const data = await driveService.loadWorkflow(route.id);
        if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
          throw new Error(`Workflow ${route.id} is invalid`);
        }
        if (token !== routeTokenRef.current) return;
        setGraph(data.nodes, data.edges);
        setActiveFileId(route.id);
        setCurrentView('editor');
        return;
      }

      if (route.source === 'draft' && route.id) {
        const draft = loadLocalDraft(route.id);
        if (!draft) {
          throw new Error(`Draft ${route.id} is missing`);
        }
        if (token !== routeTokenRef.current) return;
        setGraph(draft.nodes as AppNode[], draft.edges as Edge[]);
        setActiveFileId(null);
        setCurrentView('editor');
      }
    } catch (err) {
      console.error('Failed to open route workflow', err);
      if (token !== routeTokenRef.current) return;
      setCurrentView('home');
      replaceRoute({ view: 'home' });
    } finally {
      if (token === routeTokenRef.current) {
        setIsRouteResolving(false);
      }
    }
  }, [setActiveFileId, setCurrentView, setGraph]);

  useEffect(() => {
    const initialRoute = parseRouteFromLocation(window.location);
    replaceRoute(initialRoute);
    void applyRoute(initialRoute, window.history.state);

    const handlePopState = (event: PopStateEvent) => {
      void applyRoute(parseRouteFromLocation(window.location), event.state);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [applyRoute]);

  useEffect(() => {
    if (currentView !== 'editor') return;
    const route = parseRouteFromLocation(window.location);
    if (route.view !== 'editor' || route.source !== 'draft' || !route.id) return;
    const timer = window.setTimeout(() => {
      saveLocalDraft(route.id!, { nodes, edges });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [currentView, edges, nodes]);

  return (
    <LanguageProvider>
      <AuthBootstrap />
      {isRouteResolving ? (
        <div style={{
          width: '100vw',
          height: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: 'var(--bg-page)',
          color: 'var(--text-sub)'
        }}>
          Loading workflow...
        </div>
      ) : currentView === 'home' ? (
        <Dashboard />
      ) : (
        <ReactFlowProvider>
          <Flow />
        </ReactFlowProvider>
      )}
    </LanguageProvider>
  );
}

export default App;
