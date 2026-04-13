import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow, useViewport } from '@xyflow/react';
import useStore from '../store/useStore';
import { getNodeDefinition } from '../nodes/registry';
import { Icons } from './Icons';
import { useLanguage } from '../contexts/LanguageContext';

const EXPLAIN_SIDE_LABELS: Record<string, Record<string, string>> = {
  'en': { left: 'LEFT', right: 'RIGHT', top: 'TOP', bottom: 'BOTTOM' },
  'zh-TW': { left: '左側', right: '右側', top: '上方', bottom: '下方' },
};

const EXPLAIN_SIDE_ARROWS: Record<string, string> = {
  left: '←', right: '→', top: '↑', bottom: '↓',
};

function getExplainPluginOpportunities(explainNode: any, language: string) {
  const result: any[] = [];
  const type = explainNode.type;
  const slots = explainNode.data?.slots || {};

  if (!slots.comment) result.push({ side: 'top', sourceType: 'textNode', title: language === 'zh-TW' ? '加入註解' : 'Add Comment', detail: language === 'zh-TW' ? '在頂部掛載一個文字節點來解釋這個公式。' : 'Deploy a text node on top to annotate this calculation.' });
  if (!slots.buttonNode) result.push({ side: 'left', sourceType: 'buttonNode', title: language === 'zh-TW' ? '手動觸發' : 'Manual Trigger', detail: language === 'zh-TW' ? '停止自動計算，改為點擊按鈕時才執行運算。' : 'Stop auto-eval, wait for manual trigger button to execute.' });
  if (!slots.gateNode) result.push({ side: 'left', sourceType: 'gateNode', title: language === 'zh-TW' ? '邏輯閘門' : 'Logic Gate', detail: language === 'zh-TW' ? '使用 1 或 0 控制資料是否允許通過此節點。' : 'Use 1 or 0 to control if data is allowed to pass through.' });

  if (type === 'calculateNode') {
    if (!slots.formulaSidebar) result.push({ side: 'right', sourceType: 'formulaSidebar', title: language === 'zh-TW' ? '變數側邊欄' : 'Formula Sidebar', detail: language === 'zh-TW' ? '展開側邊欄，透過滑桿直接控制此公式的自訂變數 (x, y...)' : 'Expand a sidebar with sliders for formula variables (x, y...)' });
  } else if (type === 'solveNode' || type === 'calculusNode') {
    if (!slots.resultText) result.push({ side: 'right', sourceType: 'textNode', title: language === 'zh-TW' ? '輸出至黑板' : 'Output to Board', detail: language === 'zh-TW' ? '將這個數學節點的計算結果即時寫入文字黑板中。' : 'Write this node\'s evaluation result into a text board.' });
    if (!slots.stepsArea) result.push({ side: 'bottom', sourceType: 'textNode', title: language === 'zh-TW' ? '展開計算過程' : 'Show Steps', detail: language === 'zh-TW' ? '展開面板顯示推導的每一步驟（若支援）。' : 'Expand panel to show step-by-step derivation (if supported).' });
  }

  return result;
}

interface ExplainOverlayProps {
  isOpen: boolean;
  targetNodeId: string | null;
  isDataTooltipActive: boolean;
  onAddNode: (type: string, data?: any, screenPos?: { x: number, y: number }) => void;
}

export const ExplainOverlay: React.FC<ExplainOverlayProps> = ({
  isOpen,
  targetNodeId,
  isDataTooltipActive,
  onAddNode
}) => {
  const { language } = useLanguage();
  const theme = useStore(state => state.theme);
  const nodes = useStore(state => state.nodes);
  const { flowToScreenPosition } = useReactFlow();
  const viewport = useViewport(); // triggers re-render on zoom/pan

  const explainNode = useMemo(
    () => (isOpen && targetNodeId ? nodes.find(node => node.id === targetNodeId) ?? null : null),
    [isOpen, targetNodeId, nodes]
  );

  const explainDefinition = explainNode ? getNodeDefinition(explainNode.type || '') : null;

  const explainOpportunities = useMemo(
    () => (explainNode ? getExplainPluginOpportunities(explainNode, language) : []),
    [explainNode, language]
  );

  const explainSideLabels = EXPLAIN_SIDE_LABELS[language] || EXPLAIN_SIDE_LABELS['en'];

  const explainNodeRect = useMemo(() => {
    if (!isOpen || !explainNode) return null;
    const width = explainNode.measured?.width || explainNode.width || 200;
    const height = explainNode.measured?.height || explainNode.height || 100;

    const topLeft = flowToScreenPosition({ x: explainNode.position.x, y: explainNode.position.y });
    const bottomRight = flowToScreenPosition({ x: explainNode.position.x + width, y: explainNode.position.y + height });

    return {
      left: topLeft.x,
      top: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explainNode, flowToScreenPosition, isOpen, viewport]);

  const explainDescription = explainDefinition?.metadata.desc || explainNode?.data.templateSummary || '';
  const explainTitle = explainNode?.data.label || explainDefinition?.metadata.label || explainNode?.type || '';
  const explainCategory = explainDefinition?.metadata.category || '';
  const explainInfoWidth = 260;
  const explainSlotsWidth = 320;
  const explainPanelHeight = 420;

  const explainPositions = useMemo(() => {
    if (!isOpen || !explainNodeRect || typeof window === 'undefined') return null;

    // Flush panels directly against node edges (gap = 0)
    let leftPanelX = explainNodeRect.left - explainInfoWidth;
    let rightPanelX = explainNodeRect.left + explainNodeRect.width;

    const isLeftSafe = leftPanelX >= 20;
    const isRightSafe = rightPanelX + explainSlotsWidth <= window.innerWidth - 20;

    // Fallback if panels don't fit on both sides
    if (!isLeftSafe && !isRightSafe) {
      leftPanelX = 20;
      rightPanelX = leftPanelX + explainInfoWidth + 8;
    } else if (!isLeftSafe) {
      // Both panels go right of node
      leftPanelX = rightPanelX + explainSlotsWidth + 8;
    } else if (!isRightSafe) {
      // Both panels go left of node
      rightPanelX = explainNodeRect.left - explainSlotsWidth;
      leftPanelX = rightPanelX - explainInfoWidth - 8;
    }

    // Frame height: tall enough to contain panel content, node centered vertically
    const frameHeight = Math.max(explainPanelHeight, explainNodeRect.height + 80);
    const verticalPad = (frameHeight - explainNodeRect.height) / 2;
    const frameTop = Math.max(20, Math.min(
      explainNodeRect.top - verticalPad,
      window.innerHeight - frameHeight - 20
    ));

    const frameLeft = Math.min(leftPanelX, explainNodeRect.left);
    const frameRight = Math.max(rightPanelX + explainSlotsWidth, explainNodeRect.left + explainNodeRect.width);

    return {
      infoPos: { x: leftPanelX, y: frameTop },
      slotsPos: { x: rightPanelX, y: frameTop },
      frame: {
        x: frameLeft,
        y: frameTop,
        width: frameRight - frameLeft,
        height: frameHeight,
      }
    };
  }, [explainNodeRect, isOpen, explainInfoWidth, explainSlotsWidth, explainPanelHeight]);

  if (!isOpen || !explainNodeRect || !explainNode || !explainPositions) return null;
  if (isDataTooltipActive) return null;

  const isDark = theme === 'dark';
  const greenBorder = isDark ? 'rgba(74, 222, 128, 0.38)' : 'rgba(34, 197, 94, 0.45)';
  const greenDivider = isDark ? 'rgba(74, 222, 128, 0.16)' : 'rgba(34, 197, 94, 0.22)';
  const panelBgLeft = isDark
    ? 'linear-gradient(160deg, rgba(13, 19, 13, 0.98) 0%, rgba(10, 13, 10, 0.97) 100%)'
    : 'linear-gradient(160deg, #ffffff 0%, #fafcf9 100%)';
  const panelBgRight = isDark
    ? 'linear-gradient(160deg, rgba(8, 20, 12, 0.98) 0%, rgba(8, 12, 9, 0.97) 100%)'
    : 'linear-gradient(160deg, #f0fdf4 0%, #f7fcf8 100%)';

  return createPortal(
    <>
      {/* ── Super Frame: unified border enclosing panels + node ── */}
      <div
        style={{
          position: 'fixed',
          left: explainPositions.frame.x,
          top: explainPositions.frame.y,
          width: explainPositions.frame.width,
          height: explainPositions.frame.height,
          borderRadius: 28,
          border: `1.5px solid ${greenBorder}`,
          background: isDark ? 'rgba(74, 222, 128, 0.012)' : 'rgba(74, 222, 128, 0.02)',
          boxShadow: isDark
            ? `0 0 90px rgba(74, 222, 128, 0.07), 0 40px 90px rgba(0,0,0,0.45)`
            : `0 0 60px rgba(74, 222, 128, 0.1), 0 24px 60px rgba(0,0,0,0.08)`,
          pointerEvents: 'none',
          zIndex: 99987,
        }}
      />

      {/* ── Node Highlight: dashed outline within the frame ── */}
      <div
        style={{
          position: 'fixed',
          left: explainNodeRect.left,
          top: explainNodeRect.top,
          width: explainNodeRect.width,
          height: explainNodeRect.height,
          borderRadius: 16,
          pointerEvents: 'none',
          zIndex: 99990,
          background: 'rgba(74, 222, 128, 0.055)',
          border: `1.5px dashed ${greenBorder}`,
          boxShadow: `0 0 28px rgba(74, 222, 128, 0.18)`,
        }}
      />

      {/* ── Left Panel: Node Information ── */}
      <div
        style={{
          position: 'fixed',
          left: explainPositions.infoPos.x,
          top: explainPositions.infoPos.y,
          width: explainInfoWidth,
          height: explainPositions.frame.height,
          overflowY: 'auto',
          zIndex: 99995,
          borderRadius: '22px 0 0 22px',
          borderRight: `1px solid ${greenDivider}`,
          background: panelBgLeft,
          backdropFilter: 'blur(20px)',
          color: 'var(--text-main)',
          padding: '24px 20px',
          boxSizing: 'border-box',
        }}
      >
        {/* Header */}
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
              boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
              flexShrink: 0,
            }}
          >
            {explainDefinition?.metadata.icon || <Icons.Comment />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, lineHeight: 1.25 }}>{explainTitle}</div>
            <div style={{ fontSize: '0.7rem', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 2 }}>
              {explainCategory}
            </div>
          </div>
        </div>

        {/* Description */}
        <div style={{ fontSize: '0.88rem', lineHeight: 1.65, opacity: 0.82, marginBottom: 20 }}>
          {explainDescription || (language === 'zh-TW' ? '這個節點目前沒有額外說明。' : 'No extra description is available for this node yet.')}
        </div>

        {/* Explore hint */}
        <div
          style={{
            borderRadius: 14,
            padding: '14px 16px',
            background: isDark ? 'rgba(74, 222, 128, 0.07)' : 'rgba(74, 222, 128, 0.1)',
            border: `1px solid ${greenDivider}`,
          }}
        >
          <div style={{ fontSize: '0.7rem', opacity: 0.55, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 7 }}>
            {language === 'zh-TW' ? '探索與擴充' : 'Explore & Extend'}
          </div>
          <div style={{ fontSize: '0.83rem', lineHeight: 1.6 }}>
            {language === 'zh-TW'
              ? '點擊右側的插件可以快速在節點旁新增對應的功能節點。'
              : 'Click a plugin on the right to instantly add the corresponding node next to this one.'}
          </div>
        </div>
      </div>

      {/* ── Right Panel: Pluggable Slots ── */}
      <div
        style={{
          position: 'fixed',
          left: explainPositions.slotsPos.x,
          top: explainPositions.slotsPos.y,
          width: explainSlotsWidth,
          height: explainPositions.frame.height,
          overflowY: 'auto',
          zIndex: 99995,
          borderRadius: '0 22px 22px 0',
          borderLeft: `1px solid ${greenDivider}`,
          background: panelBgRight,
          backdropFilter: 'blur(20px)',
          color: 'var(--text-main)',
          padding: '24px 20px',
          boxSizing: 'border-box',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: '0.75rem', opacity: 0.58, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {language === 'zh-TW' ? '可搭配的插件' : 'Pluggable Slots'}
          </div>
          <div style={{
            fontSize: '0.74rem', color: '#4ade80', fontWeight: 700,
            background: 'rgba(74, 222, 128, 0.15)', padding: '2px 10px', borderRadius: 20,
            border: '1px solid rgba(74, 222, 128, 0.25)',
          }}>
            {explainOpportunities.length} {language === 'zh-TW' ? '可用' : 'available'}
          </div>
        </div>

        {/* Plugin cards */}
        {explainOpportunities.length > 0 ? explainOpportunities.map((item, index) => {
          const sourceDefinition = getNodeDefinition(item.sourceType);
          const accentBorder = '4px solid #4ade80';
          const normalBorderColor = isDark ? 'rgba(74, 222, 128, 0.16)' : 'rgba(74, 222, 128, 0.3)';

          return (
            <div
              key={`${item.sourceType}-${item.side}-${index}`}
              style={{
                padding: '13px 14px',
                borderRadius: 14,
                marginBottom: 10,
                background: isDark ? 'rgba(74, 222, 128, 0.05)' : 'rgba(74, 222, 128, 0.07)',
                border: `1px solid ${normalBorderColor}`,
                borderLeft: item.side === 'left' ? accentBorder : `1px solid ${normalBorderColor}`,
                borderRight: item.side === 'right' ? accentBorder : undefined,
                borderTop: item.side === 'top' ? accentBorder : undefined,
                borderBottom: item.side === 'bottom' ? accentBorder : undefined,
                cursor: 'pointer',
                transition: 'transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(74, 222, 128, 0.14)';
                e.currentTarget.style.background = isDark ? 'rgba(74, 222, 128, 0.09)' : 'rgba(74, 222, 128, 0.13)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.background = isDark ? 'rgba(74, 222, 128, 0.05)' : 'rgba(74, 222, 128, 0.07)';
              }}
              onClick={() => {
                const nodeLeft = explainNode.position.x;
                const nodeTop = explainNode.position.y;
                const nodeW = explainNode.measured?.width || explainNode.width || 200;
                const nodeH = explainNode.measured?.height || explainNode.height || 100;

                let customPos = { x: nodeLeft, y: nodeTop };
                if (item.side === 'left') customPos = { x: nodeLeft - 240, y: nodeTop };
                if (item.side === 'right') customPos = { x: nodeLeft + nodeW + 40, y: nodeTop };
                if (item.side === 'top') customPos = { x: nodeLeft, y: nodeTop - 150 };
                if (item.side === 'bottom') customPos = { x: nodeLeft, y: nodeTop + nodeH + 40 };

                onAddNode(item.sourceType, undefined, flowToScreenPosition(customPos));
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 7 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{
                    color: sourceDefinition?.metadata.color || '#4ade80',
                    display: 'inline-flex', alignItems: 'center',
                    background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                    padding: 6, borderRadius: 8, flexShrink: 0,
                  }}>
                    {sourceDefinition?.metadata.icon || <Icons.Grid />}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.2 }}>{item.title}</span>
                </div>
                <span style={{
                  color: '#4ade80', fontSize: '0.73rem', fontWeight: 700,
                  whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3,
                  opacity: 0.85,
                }}>
                  {EXPLAIN_SIDE_ARROWS[item.side]} {explainSideLabels[item.side]}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', lineHeight: 1.55, opacity: 0.75 }}>
                {item.detail}
              </div>
            </div>
          );
        }) : (
          <div
            style={{
              padding: '16px',
              borderRadius: 14,
              background: 'var(--bg-input)',
              border: '1px dashed var(--border-input)',
              fontSize: '0.83rem',
              lineHeight: 1.6,
              opacity: 0.75,
              textAlign: 'center',
            }}
          >
            {language === 'zh-TW'
              ? '這個節點目前沒有可擴充的插槽。'
              : 'This node currently has no expandable slots.'}
          </div>
        )}
      </div>
    </>,
    document.body
  );
};
