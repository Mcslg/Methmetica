import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ReactFlow, Background, Controls, ReactFlowProvider, useReactFlow, BackgroundVariant, type Edge, type OnConnectEnd } from '@xyflow/react';
import { useShallow } from 'zustand/react/shallow';
import '@xyflow/react/dist/style.css';

import useStore, { createGraphSignature, type AppNode } from './store/useStore';
import { nodeTypes, getNodeDefinition, buildNodeCatalog } from './nodes/registry';
import { getTemplateHandles, type ReviewMetadata, type WorkflowIcon } from './community/types';
import { Sidebar } from './components/Sidebar';
import { ExplainOverlay } from './components/ExplainOverlay';
import { FloatingPalette } from './components/FloatingPalette';
import { WorkflowHeader } from './components/WorkflowHeader';
import { Icons } from './components/Icons';
import { Dashboard } from './components/Dashboard';
import { DebugOverlay, countRender } from './components/DebugOverlay';
import { TemplateBehaviorTesterPanel } from './components/TemplateBehaviorTesterPanel';
import { LiveNodePreview } from './components/LiveNodePreview';
import { WorkflowSketch } from './components/WorkflowSketch';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { AuthBootstrap } from './components/AuthBootstrap';
import { isSupabaseConfigured } from './integrations/supabase/client';
import { getWorkflowBlueprintFromSupabaseByRef, getWorkflowVersionBlueprintFromSupabase } from './integrations/supabase/workflows';
import * as driveService from './utils/googleDriveService';
import { loadLocalDraft, loadPublicWorkflowEdit, saveLocalDraft, savePublicWorkflowEdit } from './utils/localDraftService';
import { type AppRoute, parseRouteFromLocation, readEditorSnapshotFromHistory, replaceRoute } from './utils/navigation';
import type { MathValue } from './types/mathTypes';
import { expandDummyNodeWithSubgraph, createNodeManufacturingWorkflow } from './utils/aiWorkflowGenerator';
import type { WorkflowSpec } from './types/workflowSpec';
import { AIWorkflowModal } from './components/workflow/AIWorkflowModal';
import { callGeminiImplementDummyNode, getStoredApiKey } from './utils/aiClient';

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
type EdgeTransferTooltip = {
  value: unknown;
  typedValue?: MathValue;
  inferredType: string;
  sourceNodeId: string;
  sourceHandleId?: string | null;
  targetNodeId: string;
  targetHandleId?: string | null;
};

type DataTooltipState = {
  x: number;
  y: number;
  text?: React.ReactNode;
  edgeTransfer?: EdgeTransferTooltip;
};

const stringifyTooltipJson = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return JSON.stringify({ value: String(value) }, null, 2);
  }
};

const buildEdgeMetadata = (edgeTransfer: EdgeTransferTooltip) => {
  if (edgeTransfer.typedValue?.meta) {
    return edgeTransfer.typedValue.meta;
  }

  return {
    sourceNodeId: edgeTransfer.sourceNodeId,
    sourceHandleId: edgeTransfer.sourceHandleId || 'default',
    targetNodeId: edgeTransfer.targetNodeId,
    targetHandleId: edgeTransfer.targetHandleId || 'default',
    inferredType: edgeTransfer.inferredType,
    hasTypedValue: Boolean(edgeTransfer.typedValue),
  };
};

function DataTooltipContent({ tooltip, isShiftPressed }: { tooltip: DataTooltipState; isShiftPressed: boolean }) {
  if (!tooltip.edgeTransfer) return <>{tooltip.text}</>;

  const { edgeTransfer } = tooltip;
  const displayValue = edgeTransfer.typedValue?.display
    ?? edgeTransfer.typedValue?.text
    ?? edgeTransfer.typedValue?.value
    ?? edgeTransfer.value;
  const metadata = buildEdgeMetadata(edgeTransfer);

  return (
    <div style={{ textAlign: 'left', minWidth: isShiftPressed ? '260px' : 'auto', maxWidth: isShiftPressed ? '420px' : '260px' }}>
      <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>
        {isShiftPressed ? 'Metadata JSON' : 'Data transmitted:'}
      </div>
      <pre style={{
        margin: '4px 0 0',
        fontFamily: 'monospace',
        fontWeight: isShiftPressed ? 500 : 800,
        fontSize: isShiftPressed ? '0.68rem' : '0.75rem',
        wordBreak: 'break-word',
        whiteSpace: 'pre-wrap',
        maxHeight: isShiftPressed ? '240px' : 'none',
        overflow: isShiftPressed ? 'auto' : 'visible',
      }}>
        {isShiftPressed ? stringifyTooltipJson(metadata) : String(displayValue ?? 'undefined')}
      </pre>
      <div style={{ fontSize: '0.75rem', color: 'var(--accent)', marginTop: 2 }}>{edgeTransfer.inferredType}</div>
      {!isShiftPressed && <div style={{ fontSize: '0.6rem', opacity: 0.4, marginTop: 4 }}>Hold Shift for metadata JSON</div>}
    </div>
  );
}

const annotatePublicWorkflowNodes = (
  nodes: AppNode[],
  meta?: {
    workflowId?: string;
    workflowVersionId?: string;
    workflowVersion?: number;
    ownerId?: string;
    authorName?: string;
    icon?: WorkflowIcon;
  } & ReviewMetadata,
) => nodes.map(node => (
  node.type === 'projectNode'
    ? {
        ...node,
        data: {
          ...node.data,
          workflowSource: 'public' as const,
          readOnlyPreview: true,
          supabaseWorkflowId: meta?.workflowId ?? node.data.supabaseWorkflowId,
          workflowVersionId: meta?.workflowVersionId,
          workflowVersion: meta?.workflowVersion,
          ownerId: meta?.ownerId ?? node.data.ownerId,
          authorName: meta?.authorName ?? node.data.authorName,
          workflowIcon: meta?.icon ?? node.data.workflowIcon,
          reviewStatus: meta?.reviewStatus ?? node.data.reviewStatus,
          reviewCount: meta?.reviewCount ?? node.data.reviewCount,
          reviewRequired: meta?.reviewRequired ?? node.data.reviewRequired,
          reviewWarning: meta?.reviewWarning ?? node.data.reviewWarning,
          requiredContributorReviews: meta?.requiredContributorReviews ?? node.data.requiredContributorReviews,
          requiredExpertReviews: meta?.requiredExpertReviews ?? node.data.requiredExpertReviews,
          contributorReviewCount: meta?.contributorReviewCount ?? node.data.contributorReviewCount,
          expertReviewCount: meta?.expertReviewCount ?? node.data.expertReviewCount,
          extraContributorReviews: meta?.extraContributorReviews ?? node.data.extraContributorReviews,
          extraExpertReviews: meta?.extraExpertReviews ?? node.data.extraExpertReviews,
          reviewedByMe: meta?.reviewedByMe ?? node.data.reviewedByMe,
        },
      }
    : node
));

function Flow() {
  const { t, language } = useLanguage();
  const {
    nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, addNodes, removeNode, addHandle, updateNodeData, toggleWirelessEdge,
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
    toggleWirelessEdge: state.toggleWirelessEdge,
    addNode: state.addNode,
    addNodes: state.addNodes,
    removeNode: state.removeNode,
    updateNodeData: state.updateNodeData,
    addHandle: state.addHandle,
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
  const { screenToFlowPosition, flowToScreenPosition, setCenter } = useReactFlow();
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
  const [dataTooltip, setDataTooltip] = useState<DataTooltipState | null>(null);
  const [isExplainMode, setIsExplainMode] = useState(false);
  const [isQuickNavOpen, setIsQuickNavOpen] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [quickNavQuery, setQuickNavQuery] = useState('');
  const [quickNavActiveIndex, setQuickNavActiveIndex] = useState(0);
  const quickNavInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const idleTimerRef = useRef<number | null>(null);

  const handleOpenAIModal = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    setIdleTooltip(null);
    setIsAIModalOpen(true);
  }, []);

  const handleApplyAIGraph = useCallback((newNodes: AppNode[], newEdges: Edge[], mode: 'replace' | 'append') => {
    if (mode === 'replace') {
      useStore.getState().setGraph(newNodes, newEdges);
    } else {
      const currentNodes = useStore.getState().nodes;
      const currentEdges = useStore.getState().edges;
      const maxX = currentNodes.length > 0
        ? Math.max(...currentNodes.map(n => n.position.x + (n.width || 200))) + 120
        : 120;
      const offsetNodes = newNodes.map(n => ({
        ...n,
        position: { x: n.position.x + maxX, y: n.position.y },
      }));
      useStore.setState({
        nodes: [...currentNodes, ...offsetNodes],
        edges: [...currentEdges, ...newEdges],
      });
    }
    setTimeout(() => {
      useStore.getState().evaluateGraph();
    }, 50);
  }, []);

  const filteredQuickNavNodes = useMemo(() => {
    const q = quickNavQuery.trim().toLowerCase();
    const scored = nodes.map((node) => {
      const label = String(node.data?.label || '').trim();
      const nodeType = String(node.type || '');
      const id = String(node.id || '');
      const haystack = `${label} ${nodeType} ${id}`.toLowerCase();
      if (!q) return { node, score: 0 };
      if (haystack.includes(q)) {
        const starts = label.toLowerCase().startsWith(q) || nodeType.toLowerCase().startsWith(q);
        return { node, score: starts ? 0 : 1 };
      }
      return null;
    }).filter(Boolean) as { node: AppNode; score: number }[];

    return scored
      .sort((a, b) => a.score - b.score)
      .map((item) => item.node)
      .slice(0, 40);
  }, [nodes, quickNavQuery]);

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
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsQuickNavOpen(true);
        setQuickNavQuery('');
        setQuickNavActiveIndex(0);
        return;
      }
      if (e.key === 'Escape' && isQuickNavOpen) {
        e.preventDefault();
        setIsQuickNavOpen(false);
        return;
      }
      if (e.key === 'Shift') {
        setIsShiftPressed(e.type === 'keydown');
        if (e.type === 'keyup') setBladeTrail([]);
      }
      if (e.key === 'Alt') setAltPressed(e.type === 'keydown');
      if (e.key === 'Control' || e.key === 'Meta') {
        setCtrlPressed(e.type === 'keydown');
        setIsCtrlPressedState(e.type === 'keydown');
        if (e.type === 'keyup') setBladeTrail([]);
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
  }, [isQuickNavOpen, redo, setAltPressed, setCtrlPressed, undo]);

  useEffect(() => {
    if (!isQuickNavOpen) return;
    const timer = window.setTimeout(() => quickNavInputRef.current?.focus(), 10);
    return () => window.clearTimeout(timer);
  }, [isQuickNavOpen]);

  const jumpToNode = useCallback((node: AppNode) => {
    const width = node.measured?.width ?? node.width ?? 220;
    const height = node.measured?.height ?? node.height ?? 120;
    setCenter(node.position.x + width / 2, node.position.y + height / 2, { duration: 320 });
    setHoveredNodeId(node.id);
    window.setTimeout(() => {
      if (useStore.getState().hoveredNodeId === node.id) {
        useStore.getState().setHoveredNodeId(null);
      }
    }, 1200);
    setIsQuickNavOpen(false);
  }, [setCenter, setHoveredNodeId]);

  const getNodeDisplayInfo = useCallback((node: AppNode) => {
    const definition = getNodeDefinition(node.type || '');
    const label = String(node.data?.label || definition?.metadata.label || node.type || node.id);
    const typeLabel = definition?.metadata.label || node.type || 'node';
    const color = definition?.metadata.color || 'var(--accent-bright)';
    const incoming = edges.filter((edge) => edge.target === node.id).length;
    const outgoing = edges.filter((edge) => edge.source === node.id).length;
    const wireless = edges.filter((edge) => edge.className?.includes('wireless-edge') && (edge.source === node.id || edge.target === node.id)).length;
    const size = {
      width: Math.round(node.measured?.width ?? node.width ?? 180),
      height: Math.round(node.measured?.height ?? node.height ?? 110),
    };
    return { definition, label, typeLabel, color, incoming, outgoing, wireless, size };
  }, [edges]);


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
          sourceWorkflowId: template.sourceWorkflowId,
          sourceWorkflowVersionId: template.sourceWorkflowVersionId,
          sourceWorkflowSlug: template.sourceWorkflowSlug,
          updateAvailable: template.updateAvailable,
          updateSeverity: template.updateSeverity,
          updateMessage: template.updateMessage,
          latestWorkflowVersionId: template.latestWorkflowVersionId,
          latestWorkflowVersion: template.latestWorkflowVersion,
        } : {}),
      }
    } as AppNode);
    setPaneMenu(null); setRadialMenu(null);
  }, [addNode, communityTemplates, paneMenu, radialMenu, screenToFlowPosition]);

  useEffect(() => {
    if (!radialMenu) return;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

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

    window.addEventListener('contextmenu', handleContextMenu, { capture: true });
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu, { capture: true });
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

  // 監聽 Dummy 節點遞迴生成與開新頁面編輯子圖事件
  useEffect(() => {
    const handleImplementDummy = async (e: Event) => {
      const customEvt = e as CustomEvent<{
        nodeId: string;
        label: string;
        description: string;
        inputs: Array<{ id: string; name: string }>;
        outputs: Array<{ id: string; name: string }>;
      }>;
      const { nodeId, label, description, inputs, outputs } = customEvt.detail;

      const apiKey = getStoredApiKey();
      let generatedSpec: WorkflowSpec | null = null;

      if (apiKey) {
        try {
          const customTemplates = useStore.getState().communityTemplates;
          generatedSpec = await callGeminiImplementDummyNode({
            label,
            description,
            expectedInputs: inputs,
            expectedOutputs: outputs,
          }, apiKey, customTemplates);
        } catch (err) {
          console.warn('[AI] Gemini 實作 Dummy 節點失敗，使用基礎骨架替代', err);
        }
      }

      // 若未提供 API Key 或生成失敗，回退至基礎端點子圖
      if (!generatedSpec) {
        generatedSpec = {
          schemaVersion: 2,
          id: `subgraph-${Date.now()}`,
          name: label,
          description: description,
          version: '1.0.0',
          visibility: 'private',
          publishKind: 'node',
          inputs: (inputs || []).map(i => ({ id: i.id, name: i.name, dataType: 'any' as const })),
          outputs: (outputs || []).map(o => ({ id: o.id, name: o.name, dataType: 'any' as const })),
          nodes: [
            ...(inputs || []).map((inp, idx) => ({
              id: `in-${idx}`,
              type: 'inputNode',
              name: inp.name || `in_${idx + 1}`,
              position: { x: 50, y: 50 + idx * 100 },
            })),
            ...(outputs || []).map((out, idx) => ({
              id: `out-${idx}`,
              type: 'outputNode',
              name: out.name || `out_${idx + 1}`,
              position: { x: 450, y: 50 + idx * 100 },
            })),
          ],
          edges: [],
        };
      }

      if (!generatedSpec) return;

      // 建立「節點製造工作流」草稿（含 ProjectNode、InputNode、運算節點、OutputNode）
      const customTemplates = useStore.getState().communityTemplates;
      const dummyNode = useStore.getState().nodes.find(n => n.id === nodeId);
      const existingDraftId = dummyNode?.data?.draftId as string | undefined;

      let draftId: string;
      try {
        const result = createNodeManufacturingWorkflow(
          generatedSpec,
          {
            label: `${label} 製造工作流`,
            description: description || `由 AI 自動生成的「${label}」節點製造工作流，包含介面端點與演算法實作。`,
            existingDraftId,
          },
          customTemplates
        );
        draftId = result.draftId;
      } catch (err) {
        console.warn('[AI] 製造工作流草稿建立失敗，仍繼續展開節點', err);
        draftId = '';
      }

      const currentNodes = useStore.getState().nodes;
      const currentEdges = useStore.getState().edges;
      const { nodes: nextNodes, edges: nextEdges } = expandDummyNodeWithSubgraph(
        currentNodes,
        currentEdges,
        nodeId,
        generatedSpec,
        draftId || undefined
      );

      useStore.setState({ nodes: nextNodes, edges: nextEdges });
      useStore.getState().evaluateGraph();
    };

    const handleOpenSubgraphNewPage = (e: Event) => {
      const customEvt = e as CustomEvent<{ nodeId: string; workflowSpec?: WorkflowSpec }>;
      const { nodeId, workflowSpec } = customEvt.detail;

      // 若節點本身已有 draftId，直接跳轉（不應走到這裡，但作為防衛性處理）
      const existingNode = useStore.getState().nodes.find(n => n.id === nodeId);
      const existingDraftId = existingNode?.data?.draftId as string | undefined
        || existingNode?.data?.subgraphDraftId as string | undefined;
      if (existingDraftId) {
        window.open(
          `${window.location.origin}${window.location.pathname}?view=editor&source=draft&id=${existingDraftId}`,
          '_blank'
        );
        return;
      }

      // Fallback：即時建立製造工作流草稿後跳轉
      if (workflowSpec) {
        try {
          const result = createNodeManufacturingWorkflow(workflowSpec, {
            label: `${workflowSpec.name} 製造工作流`,
            description: workflowSpec.description,
          });

          // 回填 draftId 到當前父節點
          const updateNodeData = useStore.getState().updateNodeData;
          updateNodeData(nodeId, { draftId: result.draftId, subgraphDraftId: result.draftId });

          window.open(
            `${window.location.origin}${window.location.pathname}?view=editor&source=draft&id=${result.draftId}`,
            '_blank'
          );
        } catch (err) {
          console.warn('[AI] Fallback 製造工作流草稿建立失敗', err);
        }
        return;
      }

      // 最終 fallback：使用舊版 subgraph 暫存機制（容錯路由已能解析）
      const spec = workflowSpec || {
        schemaVersion: 2 as const,
        id: `subgraph-${nodeId}`,
        name: '子工作流',
        description: '',
        version: '1.0.0',
        inputs: [],
        outputs: [],
        nodes: [],
        edges: [],
      };

      try {
        localStorage.setItem(`subgraph_draft_${spec.id}`, JSON.stringify(spec));
      } catch (err) {
        console.warn('Failed to cache subgraph spec to localStorage', err);
      }

      window.open(`${window.location.origin}${window.location.pathname}?subgraph=${spec.id}`, '_blank');
    };

    const handleLoadDemo = () => {
      const demoInNode: AppNode = {
        id: 'demo-in-radius',
        type: 'inputNode',
        position: { x: 80, y: 150 },
        width: 200,
        height: 130,
        data: {
          label: 'radius',
          nodeName: 'radius',
          value: '5',
          handles: [{ id: 'out', type: 'output', position: 'right', offset: 50, label: 'radius' }]
        }
      };

      const demoCodeNode: AppNode = {
        id: 'demo-calc-area',
        type: 'codeNode',
        position: { x: 360, y: 150 },
        width: 280,
        height: 240,
        data: {
          label: '圓面積計算',
          code: `input radius as real\noutput area as real\n\noutputs.area = Math.PI * radius * radius;`,
          autoRun: true,
          handles: [
            { id: 'radius', type: 'input', position: 'left', offset: 35, label: 'radius' },
            { id: 'area', type: 'output', position: 'right', offset: 35, label: 'area' },
            { id: 'h-result', type: 'output', position: 'right', offset: 65, label: 'Result' }
          ]
        }
      };

      const demoOutNode: AppNode = {
        id: 'demo-out-area',
        type: 'outputNode',
        position: { x: 720, y: 150 },
        width: 200,
        height: 130,
        data: {
          label: 'area',
          nodeName: 'area',
          handles: [{ id: 'in', type: 'input', position: 'left', offset: 50, label: 'area' }]
        }
      };

      const demoDummyNode: AppNode = {
        id: 'demo-dummy-perimeter',
        type: 'dummyNode',
        position: { x: 360, y: 440 },
        width: 240,
        height: 160,
        data: {
          label: '圓周長計算器',
          description: 'AI 規劃之佔位節點，可點擊下方按鈕實作。',
          expectedInputs: [{ id: 'radius', name: 'radius', dataType: 'real' }],
          expectedOutputs: [{ id: 'perimeter', name: 'perimeter', dataType: 'real' }],
          handles: [
            { id: 'radius', type: 'input', position: 'left', offset: 50, label: 'radius' },
            { id: 'perimeter', type: 'output', position: 'right', offset: 50, label: 'perimeter' }
          ]
        }
      };

      const demoCompositeNode: AppNode = {
        id: 'demo-composite-circle',
        type: 'compositeWorkflowNode',
        position: { x: 720, y: 440 },
        width: 280,
        height: 220,
        data: {
          label: '圓幾何複合節點',
          description: '已封裝之子工作流節點，帶有宣告式 Slider。',
          workflowSpec: {
            schemaVersion: 2,
            id: 'circle-subgraph-demo',
            name: '圓幾何計算器',
            description: '內建半徑拉桿與周長面積',
            version: '1.0.0',
            inputs: [{ id: 'radius', name: 'radius', dataType: 'real', defaultValue: 5 }],
            outputs: [{ id: 'area', name: 'area', dataType: 'real' }],
            nodes: [],
            edges: [],
            ui: [
              { type: 'slider', id: 'ui-slider-1', label: '動態半徑 (Radius)', bindInput: 'radius', min: 1, max: 20, defaultValue: 5 },
              { type: 'text', id: 'ui-text-1', content: '拖曳滑桿可直接測試雙向數值連動。' }
            ]
          },
          handles: [
            { id: 'radius', type: 'input', position: 'left', offset: 50, label: 'radius' },
            { id: 'area', type: 'output', position: 'right', offset: 50, label: 'area' }
          ]
        }
      };

      const demoEdges: Edge[] = [
        {
          id: 'edge-in-to-code',
          source: 'demo-in-radius',
          sourceHandle: 'out',
          target: 'demo-calc-area',
          targetHandle: 'radius'
        },
        {
          id: 'edge-code-to-out',
          source: 'demo-calc-area',
          sourceHandle: 'area',
          target: 'demo-out-area',
          targetHandle: 'in'
        }
      ];

      const currentNodes = useStore.getState().nodes;
      const currentEdges = useStore.getState().edges;
      const filteredNodes = currentNodes.filter(n => !n.id.startsWith('demo-'));
      const filteredEdges = currentEdges.filter(e => !e.id.startsWith('edge-'));

      useStore.setState({
        nodes: [...filteredNodes, demoInNode, demoCodeNode, demoOutNode, demoDummyNode, demoCompositeNode],
        edges: [...filteredEdges, ...demoEdges]
      });
      setTimeout(() => useStore.getState().evaluateGraph(), 100);
    };

    const handleOpenAI = () => handleOpenAIModal();

    window.addEventListener('ai-implement-dummy-node', handleImplementDummy);
    window.addEventListener('open-subgraph-new-page', handleOpenSubgraphNewPage);
    window.addEventListener('load-ai-workflow-demo', handleLoadDemo);
    window.addEventListener('open-ai-workflow-modal', handleOpenAI);

    return () => {
      window.removeEventListener('ai-implement-dummy-node', handleImplementDummy);
      window.removeEventListener('open-subgraph-new-page', handleOpenSubgraphNewPage);
      window.removeEventListener('load-ai-workflow-demo', handleLoadDemo);
      window.removeEventListener('open-ai-workflow-modal', handleOpenAI);
    };
  }, [handleOpenAIModal]);

  // [RECONNECT] Global click interceptor to ensure we don't miss clicks on handles due to event propagation limits
  useEffect(() => {
    if (!heldConnection) return;
    
    const handleGlobalClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const elAtPoint = document.elementFromPoint(e.clientX, e.clientY);
      const handleEl = elAtPoint?.closest('.react-flow__handle');
      
      if (handleEl) {
        const targetNodeId = handleEl.getAttribute('data-nodeid');
        const targetHandleId = handleEl.getAttribute('data-handleid');
        
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
    };

    window.addEventListener('click', handleGlobalClick, { capture: true, once: true });
    
    return () => {
      window.removeEventListener('click', handleGlobalClick, { capture: true });
    };
  }, [heldConnection, onConnect, setHeldConnection]);


  const handleDeleteNode = () => { if (nodeMenu) { removeNode(nodeMenu.nodeId); setNodeMenu(null); } };
  const handleToggleDriveImageOutput = () => {
    if (!nodeMenu) return;
    const node = nodes.find(n => n.id === nodeMenu.nodeId);
    if (!node || node.type !== 'driveImageNode') return;

    const hasImageOutput = (node.data.handles || []).some(handle => handle.id === 'h-image');
    if (hasImageOutput) {
      const nextHandles = (node.data.handles || []).filter(handle => handle.id !== 'h-image');
      updateNodeData(node.id, { handles: nextHandles });
    } else {
      addHandle(node.id, {
        id: 'h-image',
        type: 'output',
        position: 'right',
        offset: 50,
        label: 'image',
        declaredType: 'image',
        description: 'Google Drive image data',
      });
    }
    setNodeMenu(null);
  };
  const handleToggleCodeErrorOutput = () => {
    if (!nodeMenu) return;
    const node = nodes.find(n => n.id === nodeMenu.nodeId);
    if (!node || node.type !== 'codeNode') return;

    const hasErrorOutput = Boolean(node.data.showCodeErrorOutput) || (node.data.handles || []).some(handle => handle.id === 'h-error');
    if (hasErrorOutput) {
      const nextHandles = (node.data.handles || []).filter(handle => handle.id !== 'h-error');
      updateNodeData(node.id, { handles: nextHandles, showCodeErrorOutput: false });
      useStore.setState((state) => ({
        edges: state.edges.filter(edge => !(
          (edge.source === node.id && edge.sourceHandle === 'h-error') ||
          (edge.target === node.id && edge.targetHandle === 'h-error')
        )),
      }));
    } else {
      updateNodeData(node.id, { showCodeErrorOutput: true });
      if (!(node.data.handles || []).some(handle => handle.id === 'h-error')) {
        addHandle(node.id, {
          id: 'h-error',
          type: 'output',
          position: 'right',
          offset: (node.data.handles || []).some(handle => handle.id === 'h-result') ? 66 : 50,
          label: 'error',
          declaredType: 'error',
          description: 'Any runtime errors captured',
        });
      }
    }
    setNodeMenu(null);
  };
  const handleToggleHeader = () => {
    if (!nodeMenu) return;
    const node = nodes.find(n => n.id === nodeMenu.nodeId);
    if (!node) return;
    updateNodeData(node.id, { hideHeader: !node.data.hideHeader });
    setNodeMenu(null);
  };
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

  const onConnectEnd: OnConnectEnd = useCallback((event, connectionState) => {
    const connectStart = connectingNodeRef.current;
    connectingNodeRef.current = null;
    if (!connectStart) return;

    // If the connection already landed on a valid existing handle, React Flow already handled it.
    if (connectionState?.isValid && connectionState?.toHandle) return;

    const getClientPosition = (evt: MouseEvent | TouchEvent) => {
      if ('touches' in evt) {
        const touch = evt.changedTouches?.[0] || evt.touches?.[0];
        return touch ? { x: touch.clientX, y: touch.clientY } : null;
      }
      return { x: evt.clientX, y: evt.clientY };
    };

    const clientPos = getClientPosition(event);
    if (!clientPos) return;

    const hitNodeFromDom = document
      .elementFromPoint(clientPos.x, clientPos.y)
      ?.closest('.react-flow__node');
    const toNodeId =
      connectionState?.toNode?.id ||
      (hitNodeFromDom instanceof HTMLElement ? hitNodeFromDom.getAttribute('data-id') : null);

    if (!toNodeId || toNodeId === connectStart.nodeId) return;

    const targetNode = nodes.find((n) => n.id === toNodeId);
    // For textNode, allow even if no existing handles (handles start empty)
    if (!targetNode) return;
    if (targetNode.type !== 'textNode' && !Array.isArray(targetNode.data?.handles)) return;

    const sourceNode = nodes.find((n) => n.id === connectStart.nodeId);
    const startHandleBaseId = connectStart.handleId.replace(/-(source|target)$/, '');
    const startCustomHandle = sourceNode?.data?.handles?.find((h) => h.id === startHandleBaseId);

    const isScopeStart = startCustomHandle?.type === 'scope';
    // Auto-create handle on node body is currently scoped to gray "scope" handle only.
    if (!isScopeStart) return;

    const nodeEl = document.querySelector(`[data-id="${toNodeId}"]`);
    if (!(nodeEl instanceof HTMLElement)) return;
    const rect = nodeEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const relX = Math.max(0, Math.min(rect.width, clientPos.x - rect.left));
    const relY = Math.max(0, Math.min(rect.height, clientPos.y - rect.top));
    const dTop = relY;
    const dBottom = rect.height - relY;
    const dLeft = relX;
    const dRight = rect.width - relX;
    const minDist = Math.min(dTop, dBottom, dLeft, dRight);
    const side: 'top' | 'bottom' | 'left' | 'right' =
      minDist === dTop ? 'top' :
      minDist === dBottom ? 'bottom' :
      minDist === dLeft ? 'left' : 'right';
    const offsetBase = (side === 'top' || side === 'bottom')
      ? (relX / rect.width) * 100
      : (relY / rect.height) * 100;
    const offset = Math.max(5, Math.min(95, offsetBase));

    // Use a non "h-auto-" prefix so TextNode's DOM-sync logic won't treat it as temporary.
    // Use 'input' type so it acts as a target handle for the incoming scope source.
    const newHandleId = `h-drop-scope-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    addHandle(toNodeId, {
      id: newHandleId,
      type: 'scope',
      position: side,
      offset,
    });

    requestAnimationFrame(() => {
      if (connectStart.handleType === 'source') {
        onConnect({
          source: connectStart.nodeId,
          sourceHandle: connectStart.handleId,
          target: toNodeId,
          targetHandle: newHandleId,
        });
      } else {
        onConnect({
          source: toNodeId,
          sourceHandle: newHandleId,
          target: connectStart.nodeId,
          targetHandle: connectStart.handleId,
        });
      }
    });
  }, [addHandle, nodes, onConnect]);

  countRender('Flow (App.tsx)');

  return (
    <div style={{ width: '100vw', height: '100vh', background: 'var(--bg-page)' }}>
      <DebugOverlay />
      <Sidebar />
      <FloatingPalette />
      <TemplateBehaviorTesterPanel />
      <AIWorkflowModal
        isOpen={isAIModalOpen}
        onClose={() => setIsAIModalOpen(false)}
        onApplyGraph={handleApplyAIGraph}
      />
      <button
        className="nodrag"
        onClick={handleOpenAIModal}
        style={{
          position: 'fixed',
          top: 14,
          right: 116,
          zIndex: 1300,
          border: '1px solid var(--ai-border, rgba(74, 222, 128, 0.3))',
          background: 'var(--ai-bg, rgba(74, 222, 128, 0.08))',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          color: 'var(--ai-text, #4ade80)',
          borderRadius: '8px',
          padding: '6px 12px',
          fontSize: '0.75rem',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.15)',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--ai-border-hover, rgba(74, 222, 128, 0.6))';
          e.currentTarget.style.background = 'var(--ai-bg, rgba(74, 222, 128, 0.15))';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--ai-border, rgba(74, 222, 128, 0.3))';
          e.currentTarget.style.background = 'var(--ai-bg, rgba(74, 222, 128, 0.08))';
        }}
        title="AI 工作流自動生成 (Google Gemini)"
      >
        <span style={{ fontSize: '12px' }}>✨</span>
        <span>AI 生成工作流</span>
      </button>
      <button
        className="nodrag"
        onClick={() => {
          setIsQuickNavOpen(true);
          setQuickNavQuery('');
          setQuickNavActiveIndex(0);
        }}
        style={{
          position: 'fixed',
          top: 14,
          right: 14,
          zIndex: 1300,
          border: '1px solid var(--border-node)',
          background: 'var(--bg-node)',
          color: 'var(--text-main)',
          borderRadius: '8px',
          padding: '6px 10px',
          fontSize: '0.75rem',
          cursor: 'pointer'
        }}
        title="Quick Node Navigator (Cmd/Ctrl+K)"
      >
        Go to Node
      </button>
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
          
          // [SLICING / HELD] Tracker
          if ((isShiftPressed && isCtrlPressed) || heldConnection) {
            setLastFlowPos(currentFlowPos);

            if (isShiftPressed && isCtrlPressed) {
               if (lastFlowPos) sliceEdges(lastFlowPos, currentFlowPos);
               setBladeTrail(prev => [...prev.slice(-15), { ...currentFlowPos, id: Date.now() }]);
            }
          } else {
            if (lastFlowPos) setLastFlowPos(null);
            if (bladeTrail.length > 0) setBladeTrail([]);
          }

          const target = e.target as HTMLElement;
          if (target.classList.contains('react-flow__pane') && !paneMenu && !radialMenu && !nodeMenu && !isAIModalOpen) {
            const { clientX, clientY } = e;
            idleTimerRef.current = setTimeout(() => setIdleTooltip({ x: clientX, y: clientY }), 1200);
          }
        }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgeContextMenu={(e, edge) => {
          e.preventDefault();
          e.stopPropagation();
          toggleWirelessEdge(edge.id);
        }}
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
            let typedVal: MathValue | undefined;
            if (edge.sourceHandle) {
               val = sourceNode.data.outputs?.[edge.sourceHandle] ?? val;
               typedVal = sourceNode.data.typedOutputs?.[edge.sourceHandle];
               if (typedVal) type = typedVal.type;
               else if (!isNaN(Number(val))) type = 'Number';
               else if (typeof val === 'string') type = 'String';
            }
            setDataTooltip({
                x: e.clientX,
                y: e.clientY - 40,
                edgeTransfer: {
                  value: val,
                  typedValue: typedVal,
                  inferredType: type,
                  sourceNodeId: edge.source,
                  sourceHandleId: edge.sourceHandle,
                  targetNodeId: edge.target,
                  targetHandleId: edge.targetHandle,
                }
            });
          }
        }}
        onEdgeMouseLeave={() => {
          if (isExplainMode) setDataTooltip(null);
        }}
        onClick={closeMenus}

        fitView
        colorMode={theme}
      >
        <Background color={theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(14, 47, 11, 0.08)'} gap={18} variant={BackgroundVariant.Dots} />
        <Controls position="bottom-right" />
      </ReactFlow>
      {isQuickNavOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.35)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            zIndex: 1400,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: '12vh'
          }}
          onClick={() => setIsQuickNavOpen(false)}
        >
          <div
            className="nodrag"
            style={{
              width: 'min(920px, 92vw)',
              maxHeight: '70vh',
              overflow: 'hidden',
              border: '1px solid var(--border-node)',
              background: 'var(--bg-node)',
              borderRadius: '12px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.35)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              borderBottom: '1px solid var(--border-header)'
            }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-sub)' }}>
                {filteredQuickNavNodes.length} nodes
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-sub)' }}>
                Gallery
              </div>
            </div>
            <input
              name="quickNavSearch"
              ref={quickNavInputRef}
              value={quickNavQuery}
              onChange={(e) => {
                setQuickNavQuery(e.target.value);
                setQuickNavActiveIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setQuickNavActiveIndex((prev) => Math.min(prev + 1, Math.max(filteredQuickNavNodes.length - 1, 0)));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setQuickNavActiveIndex((prev) => Math.max(prev - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  const node = filteredQuickNavNodes[quickNavActiveIndex];
                  if (node) jumpToNode(node);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setIsQuickNavOpen(false);
                }
              }}
              placeholder="Search node by label / type / id..."
              style={{
                width: '100%',
                border: 'none',
                borderBottom: '1px solid var(--border-header)',
                background: 'transparent',
                color: 'var(--text-main)',
                padding: '14px 16px',
                fontSize: '0.95rem',
                outline: 'none'
              }}
            />
            <WorkflowSketch
              nodes={nodes}
              edges={edges}
              activeNodeId={filteredQuickNavNodes[quickNavActiveIndex]?.id}
              title="Workflow Sketch"
              countLabel={`${nodes.length} nodes · ${edges.length} edges`}
            />
            <div style={{ maxHeight: '56vh', overflowY: 'auto' }}>
              {filteredQuickNavNodes.length === 0 ? (
                <div style={{ padding: '14px 16px', color: 'var(--text-sub)', fontSize: '0.85rem' }}>
                  No matching nodes.
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: '10px',
                  padding: '12px'
                }}>
                  {filteredQuickNavNodes.map((node, idx) => {
                    const info = getNodeDisplayInfo(node);
                    const isActive = idx === quickNavActiveIndex;
                    return (
                      <button
                        key={node.id}
                        onMouseEnter={() => setQuickNavActiveIndex(idx)}
                        onClick={() => jumpToNode(node)}
                        style={{
                          minHeight: '156px',
                          border: isActive ? '1px solid rgba(79, 172, 254, 0.75)' : '1px solid var(--border-node)',
                          background: isActive ? 'rgba(79, 172, 254, 0.12)' : 'rgba(255,255,255,0.035)',
                          color: 'var(--text-main)',
                          borderRadius: '8px',
                          padding: '10px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          boxShadow: isActive ? '0 0 16px rgba(79, 172, 254, 0.18)' : 'none'
                        }}
                      >
                        <LiveNodePreview node={node} />
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {info.label}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', color: 'var(--text-sub)', fontSize: '0.66rem' }}>
                          <span>{info.incoming} in · {info.outgoing} out</span>
                          <span>{info.size.width}x{info.size.height}</span>
                        </div>
                        {info.wireless > 0 && (
                          <div style={{ color: '#9ca3af', fontSize: '0.66rem' }}>
                            wireless {info.wireless}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <WorkflowHeader />

      {paneMenu && (
        <div
          className={`command-palette nodrag ${searchQuery ? 'is-searching' : ''} ${isShiftPressed ? 'is-shifting' : ''}`}
          style={{ position: 'absolute', left: paneMenu.x, top: paneMenu.y }}
        >
          <div className="command-search-container">
            <input
              name="commandPaletteSearch"
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
        <div className="pie-menu-container" style={{ left: radialMenu.screenX - 160, top: radialMenu.screenY - 160 }} onContextMenu={(e) => e.preventDefault()}>
          <svg className="pie-svg" viewBox="0 0 320 320">
            {(() => {
              const items = [
                { type: 'calculateNode', label: t('nodes.calculate.title'), icon: <Icons.Calculate size={24} />, color: '#ffcc33', start: 2, end: 178 },
                { type: 'textNode', label: t('categories.text') || '筆記', icon: <Icons.Text size={24} />, color: '#4facfe', start: 182, end: 358 }
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
                      <text className="pie-item-desc" y="20" style={{ fill: 'var(--text-main)', opacity: 0.4 }}>{item.type === 'calculateNode' ? t('nodes.calculate.desc') || '數學運算' : t('categories.logic')}</text>
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
          <div className="menu-item" onClick={handleToggleHeader}>
            {nodes.find(n => n.id === nodeMenu.nodeId)?.data.hideHeader
              ? (language === 'zh-TW' ? '顯示標題列' : 'Show Header')
              : (language === 'zh-TW' ? '隱藏標題列' : 'Hide Header')}
          </div>
          {nodes.find(n => n.id === nodeMenu.nodeId)?.type === 'driveImageNode' && (
            <div className="menu-item" onClick={handleToggleDriveImageOutput}>
              {(nodes.find(n => n.id === nodeMenu.nodeId)?.data.handles || []).some(handle => handle.id === 'h-image')
                ? (language === 'zh-TW' ? '隱藏圖片輸出' : 'Hide Image Output')
                : (language === 'zh-TW' ? '新增圖片輸出' : 'Add Image Output')}
            </div>
          )}
          {nodes.find(n => n.id === nodeMenu.nodeId)?.type === 'codeNode' && (
            <div className="menu-item" onClick={handleToggleCodeErrorOutput}>
              {nodes.find(n => n.id === nodeMenu.nodeId)?.data.showCodeErrorOutput ||
                (nodes.find(n => n.id === nodeMenu.nodeId)?.data.handles || []).some(handle => handle.id === 'h-error')
                ? (language === 'zh-TW' ? '隱藏錯誤 (Error) 輸出' : 'Hide Error Output')
                : (language === 'zh-TW' ? '顯示錯誤 (Error) 輸出' : 'Show Error Output')}
            </div>
          )}
          <div className="menu-item" onClick={handleDuplicateNode}>{t('common.duplicate')}</div>
          <div className="menu-item" style={{ color: 'var(--color-danger, #ef4444)' }} onClick={handleDeleteNode}>{t('common.delete')}</div>
        </div>
      )}

      {!isAIModalOpen && idleTooltip && createPortal(
        <div className="idle-tooltip" style={{ position: 'fixed', left: idleTooltip.x + 20, top: idleTooltip.y + 20, background: 'var(--bg-node)', backdropFilter: 'blur(10px)', border: '1px solid var(--border-node)', padding: '8px 14px', borderRadius: '12px', color: 'var(--text-main)', fontSize: '0.75rem', pointerEvents: 'none', zIndex: 9999, boxShadow: 'var(--node-shadow)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}>
          <span><span style={{ color: 'var(--accent-bright)', fontWeight: 700 }}>{t('tips.right_click')}</span> {t('tips.create_node')}</span>
          <span style={{ opacity: 0.3 }}>|</span>
          <span><span style={{ color: 'var(--color-warning, #f59e0b)', fontWeight: 700 }}>{t('tips.shift_right_click')}</span> {t('tips.quick_create')}</span>
        </div>,
        document.body
      )}

      <div
        style={{
          position: 'fixed',
          right: 18,
          top: 54,
          zIndex: 99999,
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          borderRadius: 8,
          border: `1px solid ${isExplainMode ? 'rgba(74, 222, 128, 0.45)' : 'var(--border-node)'}`,
          background: isExplainMode
            ? (theme === 'dark' ? 'rgba(20, 34, 22, 0.85)' : 'rgba(240, 253, 244, 0.95)')
            : 'var(--bg-node)',
          backdropFilter: 'blur(12px)',
          color: 'var(--text-main)',
          boxShadow: 'var(--node-shadow)',
          transition: 'all 0.2s ease',
        }}
      >
        <span style={{ fontSize: '0.65rem', letterSpacing: '0.06em', opacity: 0.75, fontWeight: 500 }}>
          {language === 'zh-TW' ? '說明模式' : 'Explain Mode'}
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 18,
            height: 18,
            borderRadius: 4,
            background: isExplainMode ? 'rgba(74, 222, 128, 0.18)' : 'var(--bg-input)',
            border: `1px solid ${isExplainMode ? 'rgba(74, 222, 128, 0.45)' : 'var(--border-input)'}`,
            fontWeight: 700,
            fontSize: '10px',
            lineHeight: 1,
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
          
          const sourcePos = flowToScreenPosition({ 
            x: sourceNode.position.x + (sourceNode.measured?.width ?? 200) / 2, 
            y: sourceNode.position.y + (sourceNode.measured?.height ?? 100) / 2 
          });

          // Tip position follows mouse precisely across screen space
          const tipScreenPos = lastFlowPos ? flowToScreenPosition(lastFlowPos) : { x: 0, y: 0 };

          return createPortal(
            <>
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
                  style={{ opacity: 0.8 }}
                />
                <circle cx={tipScreenPos.x} cy={tipScreenPos.y} r="5" fill="var(--accent)" filter="url(#held-glow)" />
              </svg>
              {/* UI Indicator */}
              <div style={{ position: 'fixed', left: tipScreenPos.x + 20, top: tipScreenPos.y + 20, background: 'var(--accent)', color: 'white', padding: '4px 10px', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 700, pointerEvents: 'none', zIndex: 100000, boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
                {language === 'zh-TW' ? '點擊連結目標' : 'Click to connect'}
              </div>
            </>,
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
            <DataTooltipContent tooltip={dataTooltip} isShiftPressed={isShiftPressed} />
        </div>,
        document.body
      )}

      {/* Visual Effects & Animations */}

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
  const setGraphWithSavedBaseline = useStore(state => state.setGraphWithSavedBaseline);
  const setActiveFileId = useStore(state => state.setActiveFileId);
  const user = useStore(state => state.user);
  const nodes = useStore(state => state.nodes);
  const edges = useStore(state => state.edges);
  const savedGraphSignature = useStore(state => state.savedGraphSignature);
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
        const blueprint = isSupabaseConfigured
          ? await getWorkflowBlueprintFromSupabaseByRef(route.id)
          : null;
        if (!blueprint) throw new Error(`Workflow ${route.id} not found`);
        if (token !== routeTokenRef.current) return;
        const publishedNodes = annotatePublicWorkflowNodes(blueprint.nodes as AppNode[], blueprint.meta);
        const publishedEdges = blueprint.edges as Edge[];
        const workflowId = blueprint.meta?.workflowId ?? route.id;
        const ownerId = blueprint.meta?.ownerId;
        const localEdit = workflowId && ownerId && user?.id === ownerId
          ? loadPublicWorkflowEdit(workflowId, ownerId)
          : null;
        if (localEdit) {
          setGraphWithSavedBaseline(localEdit.nodes as AppNode[], localEdit.edges as Edge[], publishedNodes, publishedEdges);
        } else {
          setGraph(publishedNodes, publishedEdges);
        }
        setActiveFileId(null);
        setCurrentView('editor');
        return;
      }

      if (route.source === 'version' && route.id) {
        const blueprint = isSupabaseConfigured
          ? await getWorkflowVersionBlueprintFromSupabase(route.id)
          : null;
        if (!blueprint) throw new Error(`Workflow version ${route.id} not found`);
        if (token !== routeTokenRef.current) return;
        setGraph(annotatePublicWorkflowNodes(blueprint.nodes as AppNode[], blueprint.meta), blueprint.edges as Edge[]);
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
  }, [setActiveFileId, setCurrentView, setGraph, setGraphWithSavedBaseline, user?.id]);

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

  useEffect(() => {
    if (currentView !== 'editor' || !user?.id) return;
    const route = parseRouteFromLocation(window.location);
    if (route.view !== 'editor' || route.source !== 'public') return;
    const projectRoot = nodes.find(node => node.type === 'projectNode');
    const workflowId = typeof projectRoot?.data.supabaseWorkflowId === 'string'
      ? projectRoot.data.supabaseWorkflowId
      : route.id;
    const ownerId = typeof projectRoot?.data.ownerId === 'string'
      ? projectRoot.data.ownerId
      : null;
    const hasUnsavedPublicEdit = createGraphSignature(nodes, edges) !== savedGraphSignature;
    if (!workflowId || ownerId !== user.id || !hasUnsavedPublicEdit) return;
    const timer = window.setTimeout(() => {
      savePublicWorkflowEdit(workflowId, ownerId, { nodes, edges });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [currentView, edges, nodes, savedGraphSignature, user?.id]);

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
