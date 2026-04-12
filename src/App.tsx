import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ReactFlow, Background, Controls, ReactFlowProvider, useReactFlow, BackgroundVariant } from '@xyflow/react';
import { useShallow } from 'zustand/react/shallow';
import '@xyflow/react/dist/style.css';

import useStore, { type AppNode } from './store/useStore';
import { nodeTypes, getNodeDefinition, buildNodeCatalog } from './nodes/registry';
import { getTemplateInternalHandles } from './community/types';
import { Sidebar } from './components/Sidebar';
import { FloatingPalette } from './components/FloatingPalette';
import { Icons } from './components/Icons';
import { Dashboard } from './components/Dashboard';
import { DebugOverlay, countRender } from './components/DebugOverlay';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { AuthBootstrap } from './components/AuthBootstrap';

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
type ExplainSide = 'left' | 'right' | 'top' | 'bottom';
type ExplainPluginOpportunity = {
  sourceType: string;
  side: ExplainSide;
  title: string;
  detail: string;
};

const EXPLAIN_SIDE_LABELS = {
  en: { left: 'Left', right: 'Right', top: 'Top', bottom: 'Bottom' },
  'zh-TW': { left: '左側', right: '右側', top: '上方', bottom: '下方' },
} as const;

const EXPLAIN_SIDE_ARROWS: Record<ExplainSide, string> = {
  left: '←',
  right: '→',
  top: '↑',
  bottom: '↓',
};

function getExplainPluginOpportunities(node: AppNode, language: 'en' | 'zh-TW'): ExplainPluginOpportunity[] {
  const slots = node.data.slots || {};
  const isZh = language === 'zh-TW';
  const items: ExplainPluginOpportunity[] = [];
  const add = (sourceType: string, side: ExplainSide, title: string, detail: string, enabled = true) => {
    if (enabled) items.push({ sourceType, side, title, detail });
  };

  if (node.type === 'graphNode') {
    add('textNode', 'left', isZh ? '插入公式側欄' : 'Plug in formula sidebar', isZh ? '把 Notebook 插到左側，變成圖形的公式輸入區。' : 'Plug a Notebook into the left edge to turn it into the graph formula sidebar.', !slots.formulaSidebar);
    add('sliderNode', 'left', isZh ? '加入參數滑桿' : 'Attach parameter slider', isZh ? '把 Slider 貼到左側，讓圖形用該變數控制參數。' : 'Drop a Slider on the left edge to expose its variable as a graph parameter.');
    add('textNode', 'top', isZh ? '加入節點註解' : 'Attach note', isZh ? '把 Notebook 貼到上方，作為圖形的註解區。' : 'Drop a Notebook on the top edge to use it as a note for the graph.', !slots.comment);
  }

  if (node.type === 'textNode') {
    add('sliderNode', 'left', isZh ? '嵌入滑桿' : 'Embed slider', isZh ? '把 Slider 貼到邊緣，直接嵌進 Notebook 文字區上方。' : 'Drop a Slider onto the Notebook edge to embed it inline above the editor.');
    add('buttonNode', 'right', isZh ? '嵌入觸發按鈕' : 'Embed trigger button', isZh ? '把 Trigger 貼到邊緣，讓它成為 Notebook 內建按鈕。' : 'Drop a Trigger onto the Notebook edge to make it an embedded action button.');
    add('gateNode', 'right', isZh ? '嵌入 Gate' : 'Embed gate', isZh ? '把 Gate 貼到邊緣，讓 Notebook 可以直接控制觸發通道。' : 'Drop a Gate onto the Notebook edge to embed gate control in the note.');
    add('calculateNode', 'right', isZh ? '插入計算結果' : 'Insert calculation result', isZh ? '把 Calculate 貼到邊緣，把結果當作可引用內容插進 Notebook。' : 'Drop a Calculate node onto the edge to insert its result into the Notebook.');
    add('balanceNode', 'right', isZh ? '插入平衡步驟' : 'Insert balance steps', isZh ? '把 Balance 貼到邊緣，把等式操作結果帶進 Notebook。' : 'Drop a Balance node onto the edge to insert equivalence steps into the Notebook.');
    add('calculusNode', 'right', isZh ? '插入微積分步驟' : 'Insert calculus steps', isZh ? '把 Calculus 貼到邊緣，把推導或步驟嵌進 Notebook。' : 'Drop a Calculus node onto the edge to insert derivation steps into the Notebook.');
    add('appendNode', 'bottom', isZh ? '加入追加器' : 'Attach logger', isZh ? '把 Logger 貼到底部，Notebook 會成為它的追加目標。' : 'Drop a Logger on the bottom edge to make this Notebook its append target.', !slots.appender);
  }

  if (node.type === 'calculateNode' || node.type === 'solveNode' || node.type === 'balanceNode' || node.type === 'calculusNode') {
    add('textNode', 'right', isZh ? '掛上結果視窗' : 'Attach result panel', isZh ? '把 Notebook 貼到右側，用來顯示該節點的輸出或步驟。' : 'Drop a Notebook on the right edge to show this node’s result or steps.', !slots.resultText);
    add('sliderNode', 'right', isZh ? '加入輸入變數' : 'Attach variable slider', isZh ? '把 Slider 貼到右側，讓它成為這個節點的內建變數。' : 'Drop a Slider on the right edge to use it as an internal variable for this node.');
    add('textNode', 'top', isZh ? '加入節點註解' : 'Attach note', isZh ? '把 Notebook 貼到上方，作為這個節點的註解。' : 'Drop a Notebook on the top edge to use it as a note for this node.', !slots.comment);
  }

  if (node.type === 'gateNode' || node.type === 'rangeNode') {
    add('textNode', 'top', isZh ? '加入節點註解' : 'Attach note', isZh ? '把 Notebook 貼到上方，作為這個節點的註解。' : 'Drop a Notebook on the top edge to use it as a note for this node.', !slots.comment);
  }

  return items;
}

function Flow() {
  const { t, language } = useLanguage();
  const {
    nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, addNodes, removeNode,
    handleProximitySnap, updatePluginHint, setAltPressed, setCtrlPressed, theme,
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
    takeSnapshot: state.takeSnapshot
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
  const [idleTooltip, setIdleTooltip] = useState<{ x: number, y: number } | null>(null);
  const [isExplainMode, setIsExplainMode] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const idleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(e.type === 'keydown');
      if (e.key === 'Alt') setAltPressed(e.type === 'keydown');
      if (e.key === 'Control' || e.key === 'Meta') setCtrlPressed(e.type === 'keydown');
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

  const explainNode = useMemo(
    () => nodes.find(node => node.id === hoveredNodeId) ?? null,
    [hoveredNodeId, nodes]
  );
  const explainDefinition = explainNode ? getNodeDefinition(explainNode.type || '') : null;
  const explainOpportunities = useMemo(
    () => (explainNode ? getExplainPluginOpportunities(explainNode, language) : []),
    [explainNode, language]
  );
  const explainSides = Array.from(new Set(explainOpportunities.map(item => item.side)));
  const explainSideLabels = EXPLAIN_SIDE_LABELS[language];
  const explainNodeRect = useMemo(() => {
    if (!isExplainMode || !explainNode) return null;
    const width = explainNode.measured?.width || explainNode.width || 200;
    const height = explainNode.measured?.height || explainNode.height || 100;
    
    // Transform coordinates properly taking into account the zoom scale
    const topLeft = flowToScreenPosition({ x: explainNode.position.x, y: explainNode.position.y });
    const bottomRight = flowToScreenPosition({ x: explainNode.position.x + width, y: explainNode.position.y + height });
    
    return { 
       left: topLeft.x, 
       top: topLeft.y, 
       width: bottomRight.x - topLeft.x, 
       height: bottomRight.y - topLeft.y 
    };
  }, [explainNode, flowToScreenPosition, isExplainMode]);
  const explainDescription = explainDefinition?.metadata.desc || explainNode?.data.templateSummary || '';
  const explainTitle = explainNode?.data.label || explainDefinition?.metadata.label || explainNode?.type || '';
  const explainCategory = explainDefinition?.metadata.category || '';
  const explainInfoWidth = 260;
  const explainSlotsWidth = 320;
  const explainPanelHeight = 420;

  const explainPositions = useMemo(() => {
    if (!isExplainMode || !explainNodeRect || typeof window === 'undefined') return null;

    // Ideal positions: sandwich the node
    let leftPanelX = explainNodeRect.left - explainInfoWidth - 24;
    let rightPanelX = explainNodeRect.left + explainNodeRect.width + 24;

    // Bounds check
    const isLeftSafe = leftPanelX >= 20;
    const isRightSafe = rightPanelX + explainSlotsWidth <= window.innerWidth - 20;

    // If sandwich is impossible, stack them on the side that has more space
    if (!isLeftSafe && !isRightSafe) {
      leftPanelX = 20;
      rightPanelX = leftPanelX + explainInfoWidth + 16;
    } else if (!isLeftSafe) {
      leftPanelX = rightPanelX;
      rightPanelX += explainInfoWidth + 16;
    } else if (!isRightSafe) {
      rightPanelX = leftPanelX;
      leftPanelX -= explainSlotsWidth + 16;
    }

    const top = Math.min(
      Math.max(20, explainNodeRect.top - 16),
      Math.max(20, window.innerHeight - explainPanelHeight - 20)
    );
    return { infoPos: { x: leftPanelX, y: top }, slotsPos: { x: rightPanelX, y: top } };
  }, [explainNodeRect, isExplainMode]);

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
    const handles = template ? getTemplateInternalHandles(template).map(handle => ({
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

      {isExplainMode && explainNodeRect && createPortal(
        <div
          style={{
            position: 'fixed',
            left: explainNodeRect.left - 8,
            top: explainNodeRect.top - 8,
            width: explainNodeRect.width + 16,
            height: explainNodeRect.height + 16,
            borderRadius: 24,
            pointerEvents: 'none',
            zIndex: 99990,
            boxShadow: [
              explainSides.includes('top') ? 'inset 0 4px 0 rgba(74, 222, 128, 0.95)' : '',
              explainSides.includes('right') ? 'inset -4px 0 0 rgba(74, 222, 128, 0.95)' : '',
              explainSides.includes('bottom') ? 'inset 0 -4px 0 rgba(74, 222, 128, 0.95)' : '',
              explainSides.includes('left') ? 'inset 4px 0 0 rgba(74, 222, 128, 0.95)' : '',
            ].filter(Boolean).join(', '),
            background: 'rgba(74, 222, 128, 0.04)',
            outline: '1px solid rgba(74, 222, 128, 0.18)',
          }}
        >
          {explainSides.map((side) => {
            const markerStyle: React.CSSProperties = {
              position: 'absolute',
              color: '#4ade80',
              fontSize: '1rem',
              fontWeight: 800,
              textShadow: '0 0 10px rgba(74, 222, 128, 0.55)',
            };
            if (side === 'top') Object.assign(markerStyle, { top: -14, left: '50%', transform: 'translateX(-50%)' });
            if (side === 'right') Object.assign(markerStyle, { right: -14, top: '50%', transform: 'translateY(-50%)' });
            if (side === 'bottom') Object.assign(markerStyle, { bottom: -14, left: '50%', transform: 'translateX(-50%)' });
            if (side === 'left') Object.assign(markerStyle, { left: -14, top: '50%', transform: 'translateY(-50%)' });
            return <div key={side} style={markerStyle}>{EXPLAIN_SIDE_ARROWS[side]}</div>;
          })}
        </div>,
        document.body
      )}

      {isExplainMode && explainPositions && explainNode && createPortal(
        <>
          {/* Left Panel: Information */}
          <div
            style={{
              position: 'fixed',
              left: explainPositions.infoPos.x,
              top: explainPositions.infoPos.y,
              width: explainInfoWidth,
              maxHeight: explainPanelHeight,
              overflowY: 'auto',
              zIndex: 99995,
              borderRadius: 24,
              border: '1px solid var(--border-node)',
              background: theme === 'dark'
                ? 'linear-gradient(180deg, rgba(15, 20, 15, 0.98), rgba(10, 12, 10, 0.96))'
                : 'linear-gradient(180deg, #ffffff, #fdfcf7)',
              backdropFilter: 'blur(20px)',
              color: 'var(--text-main)',
              boxShadow: theme === 'dark' ? '0 28px 60px rgba(0,0,0,0.6)' : 'var(--node-shadow)',
              padding: '24px 20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--bg-input)',
                  color: explainDefinition?.metadata.color || 'var(--text-main)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                }}
              >
                {explainDefinition?.metadata.icon || <Icons.Comment />}
              </div>
              <div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{explainTitle}</div>
                <div style={{ fontSize: '0.72rem', opacity: 0.55, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {explainCategory}
                </div>
              </div>
            </div>

            <div style={{ fontSize: '0.9rem', lineHeight: 1.65, opacity: 0.85, marginBottom: 20 }}>
              {explainDescription || (language === 'zh-TW' ? '這個節點目前沒有額外說明。' : 'No extra description is available for this node yet.')}
            </div>

            <div
              style={{
                borderRadius: 16,
                padding: '16px 16px 14px',
                background: 'var(--accent-light)',
                border: '1px solid var(--border-input)',
              }}
            >
              <div style={{ fontSize: '0.72rem', opacity: 0.6, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                {language === 'zh-TW' ? '探索與擴充' : 'Explore & Extend'}
              </div>
              <div style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
                {language === 'zh-TW'
                  ? '綠色的發光邊框表示強大的「插槽」。將右側的插件拖曳到邊緣，或是直接點擊即可快速擴充功能。'
                  : 'Green glowing edges represent powerful "slots". Drag nodes to the edge or click the plugins on the right to extend functionality.'}
              </div>
            </div>
          </div>

          {/* Right Panel: Pluggable Slots */}
          <div
            style={{
              position: 'fixed',
              left: explainPositions.slotsPos.x,
              top: explainPositions.slotsPos.y,
              width: explainSlotsWidth,
              maxHeight: explainPanelHeight,
              overflowY: 'auto',
              zIndex: 99995,
              borderRadius: 24,
              border: '1px solid var(--border-node)',
              background: theme === 'dark'
                ? 'linear-gradient(180deg, rgba(8, 22, 12, 0.96), rgba(8, 11, 10, 0.96))'
                : 'linear-gradient(180deg, #f0fdf4, #ffffff)',
              backdropFilter: 'blur(20px)',
              color: 'var(--text-main)',
              boxShadow: theme === 'dark' ? '0 28px 60px rgba(0,0,0,0.6)' : 'var(--node-shadow)',
              padding: '24px 20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: '0.8rem', opacity: 0.62, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {language === 'zh-TW' ? '可搭配的插件' : 'Pluggable Plugins'}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#4ade80', fontWeight: 700, background: 'rgba(74, 222, 128, 0.15)', padding: '2px 8px', borderRadius: 12 }}>
                {explainOpportunities.length} {language === 'zh-TW' ? '可用' : 'Slots'}
              </div>
            </div>

            {explainOpportunities.length > 0 ? explainOpportunities.map((item, index) => {
              const sourceDefinition = getNodeDefinition(item.sourceType);
              return (
                <div
                  key={`${item.sourceType}-${item.side}-${index}`}
                  style={{
                    padding: '14px',
                    borderRadius: 16,
                    marginBottom: 12,
                    background: theme === 'dark' ? 'rgba(74, 222, 128, 0.05)' : 'rgba(74, 222, 128, 0.08)',
                    border: `1px solid ${theme === 'dark' ? 'rgba(74, 222, 128, 0.16)' : 'rgba(74, 222, 128, 0.3)'}`,
                    borderLeft: item.side === 'left' ? '4px solid #4ade80' : `1px solid ${theme === 'dark' ? 'rgba(74, 222, 128, 0.16)' : 'rgba(74, 222, 128, 0.3)'}`,
                    borderRight: item.side === 'right' ? '4px solid #4ade80' : undefined,
                    borderTop: item.side === 'top' ? '4px solid #4ade80' : undefined,
                    borderBottom: item.side === 'bottom' ? '4px solid #4ade80' : undefined,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 20px rgba(74, 222, 128, 0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  onClick={() => {
                    // Get current target block flow position
                    const nodeLeft = explainNode.position.x;
                    const nodeTop = explainNode.position.y;
                    const nodeW = explainNode.measured?.width || explainNode.width || 200;
                    const nodeH = explainNode.measured?.height || explainNode.height || 100;

                    // Calculate where the new node should drop (Flow coordinates)
                    let customPos = { x: nodeLeft, y: nodeTop };
                    if (item.side === 'left') customPos = { x: nodeLeft - 240, y: nodeTop };
                    if (item.side === 'right') customPos = { x: nodeLeft + nodeW + 40, y: nodeTop };
                    if (item.side === 'top') customPos = { x: nodeLeft, y: nodeTop - 150 };
                    if (item.side === 'bottom') customPos = { x: nodeLeft, y: nodeTop + nodeH + 40 };

                    // Add node via command (Convert back to Screen so handleAddNode can handle it)
                    handleAddNode(item.sourceType, undefined, flowToScreenPosition(customPos));
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{ color: sourceDefinition?.metadata.color || '#4ade80', display: 'inline-flex', alignItems: 'center', background: 'var(--bg-input)', padding: 6, borderRadius: 8 }}>
                        {sourceDefinition?.metadata.icon || <Icons.Grid />}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>{item.title}</span>
                    </div>
                    <span style={{ color: '#4ade80', fontSize: '0.76rem', fontWeight: 700, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {EXPLAIN_SIDE_ARROWS[item.side]} {explainSideLabels[item.side]}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.82rem', lineHeight: 1.55, opacity: 0.82 }}>
                    {item.detail}
                  </div>
                </div>
              );
            }) : (
              <div
                style={{
                  padding: '16px',
                  borderRadius: 16,
                  background: 'var(--bg-input)',
                  border: '1px dashed var(--border-input)',
                  fontSize: '0.84rem',
                  lineHeight: 1.6,
                  opacity: 0.82,
                  textAlign: 'center'
                }}
              >
                {language === 'zh-TW'
                  ? '這個節點目前沒有可擴充的插槽。'
                  : 'This node currently has no expandable slots.'}
              </div>
            )}
          </div>
        </>
        , document.body
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

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <LanguageProvider>
      <AuthBootstrap />
      {currentView === 'home' ? (
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
