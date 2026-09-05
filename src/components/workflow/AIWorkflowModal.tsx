import React, { useState, useEffect, useMemo } from 'react';
import { Icons } from '../Icons';
import {
  callGeminiGenerateWorkflow,
  getStoredApiKey,
  setStoredApiKey,
} from '../../utils/aiClient';
import { convertSpecToCanvasGraph } from '../../utils/aiWorkflowGenerator';
import type { WorkflowSpec } from '../../types/workflowSpec';
import useStore, { type AppNode } from '../../store/useStore';
import { defaultCommunityTemplates } from '../../community/catalog';
import type { Edge } from '@xyflow/react';

interface AIWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyGraph: (nodes: AppNode[], edges: Edge[], mode: 'replace' | 'append') => void;
}

const PRESET_PROMPTS = [
  {
    title: '二次方程式判別式與根',
    prompt: '製作一個一元二次方程式 ax^2 + bx + c = 0 的工作流，輸入 a, b, c 三個參數，計算判別式 d = b^2 - 4ac，並同時輸出兩根。',
  },
  {
    title: '社群節點整合：定理定義與判別',
    prompt: '製作一個數學定理探究流程：開頭引用社群的「定義卡片 (Definition Card)」做前置陳述，接著輸入題目參數 a, b, c，經由 calculateNode 運算判別式，最後將摘要輸出至結果節點。',
  },
  {
    title: '幾何圓面積與周長聯動',
    prompt: '製作一個圓幾何計算工作流，包含一個動態半徑 SliderNode (範圍 1~50)，同時計算並輸出圓周長 2*pi*r 與圓面積 pi*r^2。',
  },
  {
    title: '三角函數正弦波與振幅頻率',
    prompt: '製作一個正弦波計算工作流，包含振幅 A 與頻率 f 兩個數值輸入，透過 calculateNode 產生 A*sin(2*pi*f*t)，並連線至圖表展示。',
  },
  {
    title: '含佔位節點的進階演算法',
    prompt: '製作一個訊號處理流程：輸入取樣頻率與振幅，中間需要一個「快速傅立葉變換(FFT)」演算法（請標記為 dummyNode），最後輸出頻譜。',
  },
];

export const AIWorkflowModal: React.FC<AIWorkflowModalProps> = ({
  isOpen,
  onClose,
  onApplyGraph,
}) => {
  const [prompt, setPrompt] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showApiKeySettings, setShowApiKeySettings] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedSpec, setGeneratedSpec] = useState<WorkflowSpec | null>(null);
  const [error, setError] = useState<string | null>(null);

  const customCommunityTemplates = useStore(state => state.communityTemplates);
  const allTemplates = useMemo(() => {
    const customIds = new Set(customCommunityTemplates.map(t => t.id));
    const filteredDefaults = defaultCommunityTemplates.filter(t => !customIds.has(t.id));
    return [...filteredDefaults, ...customCommunityTemplates];
  }, [customCommunityTemplates]);

  useEffect(() => {
    if (isOpen) {
      const stored = getStoredApiKey();
      setApiKey(stored);
      if (!stored) {
        setShowApiKeySettings(true);
      }
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveApiKey = (newKey: string) => {
    setApiKey(newKey);
    setStoredApiKey(newKey);
  };

  const handleGenerate = async (targetPrompt?: string) => {
    const textToRun = (targetPrompt || prompt).trim();
    if (!textToRun) return;

    setIsGenerating(true);
    setError(null);
    setGeneratedSpec(null);

    try {
      const spec = await callGeminiGenerateWorkflow(textToRun, apiKey, allTemplates);
      setGeneratedSpec(spec);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err || '生成失敗，請檢查 API Key 或網路連線。');
      setError(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApply = (mode: 'replace' | 'append') => {
    if (!generatedSpec) return;
    const { nodes, edges } = convertSpecToCanvasGraph(generatedSpec, { x: 120, y: 120 }, allTemplates);
    onApplyGraph(nodes, edges, mode);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(2, 6, 23, 0.72)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        animation: 'fadeIn 0.2s ease',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '90%',
          maxWidth: '680px',
          maxHeight: '90vh',
          backgroundColor: 'rgba(15, 23, 42, 0.94)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 24px rgba(56, 189, 248, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#f8fafc',
          fontFamily: 'inherit',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(90deg, rgba(56, 189, 248, 0.08) 0%, transparent 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #0284c7 0%, #7c3aed 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 10px rgba(124, 58, 237, 0.3)',
              }}
            >
              <Icons.Sparkles style={{ width: 18, height: 18, color: '#fff' }} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, letterSpacing: '-0.01em' }}>
                AI 工作流自動生成 (AI Workflow Generator)
              </h3>
              <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
                使用 Google Gemini 將自然語言需求編譯為有向無環圖 (DAG)
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setShowApiKeySettings(v => !v)}
              title="設定 Gemini API Key"
              style={{
                background: apiKey ? 'rgba(56, 189, 248, 0.1)' : 'rgba(239, 68, 68, 0.15)',
                border: apiKey ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid rgba(239, 68, 68, 0.4)',
                color: apiKey ? '#38bdf8' : '#f87171',
                padding: '5px 9px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <Icons.Settings style={{ width: 13, height: 13 }} />
              <span>{apiKey ? 'API Key 設定' : '需填入 API Key'}</span>
            </button>

            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icons.Clear style={{ width: 18, height: 18 }} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* API Key 摺疊區 */}
          {showApiKeySettings && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                background: 'rgba(30, 41, 59, 0.7)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                fontSize: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontWeight: 600, color: '#e2e8f0' }}>Google Gemini API Key</label>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#38bdf8', fontSize: '11px', textDecoration: 'none' }}
                >
                  免費獲取 API Key ↗
                </a>
              </div>
              <input
                type="password"
                value={apiKey}
                onChange={e => handleSaveApiKey(e.target.value)}
                placeholder="貼上您的 AI Studio Gemini API Key (AIzaSy...)"
                style={{
                  width: '100%',
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  color: '#f8fafc',
                  fontSize: '12px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <span style={{ fontSize: '10.5px', color: '#64748b' }}>
                Key 僅加密暫存於您的瀏覽器本地 (localStorage)，完全不經過第三方後端。
              </span>
            </div>
          )}

          {/* 輸入區 */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
              描述您想要建立的數學或演算法工作流：
            </label>
            <textarea
              rows={3}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="例如：製作一個計算二次方程式判別式與兩根的工作流，帶有三個輸入與一個判別式運算..."
              style={{
                width: '100%',
                background: 'rgba(30, 41, 59, 0.6)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '8px',
                padding: '10px 12px',
                color: '#f8fafc',
                fontSize: '13px',
                lineHeight: 1.5,
                outline: 'none',
                resize: 'none',
                boxSizing: 'border-box',
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handleGenerate();
                }
              }}
            />
          </div>

          {/* 快捷範例 */}
          <div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px', fontWeight: 600 }}>
              或點選常用範例：
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {PRESET_PROMPTS.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setPrompt(preset.prompt);
                    handleGenerate(preset.prompt);
                  }}
                  disabled={isGenerating}
                  style={{
                    background: 'rgba(30, 41, 59, 0.8)',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    borderRadius: '6px',
                    padding: '4px 9px',
                    color: '#cbd5e1',
                    fontSize: '11px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = '#38bdf8';
                    e.currentTarget.style.color = '#38bdf8';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.2)';
                    e.currentTarget.style.color = '#cbd5e1';
                  }}
                >
                  ⚡ {preset.title}
                </button>
              ))}
            </div>
          </div>

          {/* 錯誤提示 */}
          {error && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#fca5a5',
                fontSize: '12px',
                lineHeight: 1.4,
              }}
            >
              <strong>生成失敗：</strong> {error}
            </div>
          )}

          {/* 生成結果摘要預覽 */}
          {generatedSpec && (
            <div
              style={{
                padding: '14px',
                borderRadius: '10px',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Icons.Check style={{ width: 16, height: 16 }} />
                  <span>{generatedSpec.name}</span>
                </div>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  {generatedSpec.nodes.length} 個節點 • {generatedSpec.edges.length} 條連線
                </span>
              </div>

              {generatedSpec.description && (
                <p style={{ margin: 0, fontSize: '11.5px', color: '#cbd5e1', lineHeight: 1.4 }}>
                  {generatedSpec.description}
                </p>
              )}

              {/* 節點清單徽章 */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {generatedSpec.nodes.map((n, idx) => (
                  <span
                    key={idx}
                    style={{
                      background: n.type === 'dummyNode' ? 'rgba(234, 179, 8, 0.15)' : 'rgba(30, 41, 59, 0.9)',
                      border: n.type === 'dummyNode' ? '1px solid rgba(234, 179, 8, 0.4)' : '1px solid rgba(148, 163, 184, 0.25)',
                      color: n.type === 'dummyNode' ? '#facc15' : '#e2e8f0',
                      borderRadius: '4px',
                      padding: '2px 6px',
                      fontSize: '10.5px',
                    }}
                  >
                    {n.type === 'dummyNode' ? '✨ ' : ''}{n.name || n.type}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer 動作列 */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid rgba(148, 163, 184, 0.12)',
            background: 'rgba(15, 23, 42, 0.8)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
          }}
        >
          {generatedSpec ? (
            <>
              <button
                onClick={() => handleApply('append')}
                style={{
                  background: 'rgba(30, 41, 59, 0.9)',
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  color: '#e2e8f0',
                  borderRadius: '6px',
                  padding: '7px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                加入至當前畫布
              </button>
              <button
                onClick={() => handleApply('replace')}
                style={{
                  background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                  border: 'none',
                  color: 'white',
                  borderRadius: '6px',
                  padding: '7px 16px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(2, 132, 199, 0.35)',
                }}
              >
                覆蓋當前畫布並開啟
              </button>
            </>
          ) : (
            <button
              onClick={() => handleGenerate()}
              disabled={isGenerating || !prompt.trim()}
              style={{
                background: isGenerating || !prompt.trim()
                  ? 'rgba(71, 85, 105, 0.5)'
                  : 'linear-gradient(135deg, #0284c7 0%, #7c3aed 100%)',
                border: 'none',
                color: 'white',
                borderRadius: '6px',
                padding: '8px 18px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: isGenerating || !prompt.trim() ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: isGenerating ? 'none' : '0 4px 14px rgba(124, 58, 237, 0.35)',
              }}
            >
              {isGenerating ? (
                <>
                  <div className="spinner-small" style={{ width: 14, height: 14 }} />
                  <span>AI 正在分析並分層排版中...</span>
                </>
              ) : (
                <>
                  <Icons.Sparkles style={{ width: 14, height: 14 }} />
                  <span>開始生成工作流</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
