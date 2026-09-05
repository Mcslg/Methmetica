# Methmetica 看板 (Kanban)

最後更新時間：2026-09-04

---

- [ ] **自訂節點防循環與右鍵選單檢索 (Custom Node Circularity Prevention & Context Menu Discovery)**：
  - 移除節點製造面板上的本工作流就地封裝按鈕，防止自我循環依賴。
  - 私人自訂工作流自動可用（含有效端點即被視為節點），比照社群節點採 `search-only` 隱藏於左側側欄，僅在右鍵選單/搜尋中可見。
  - 支援私人工作流版本控制與跨工作流引用升級。
  - 公開社群發布強制登入身分驗證。
- [ ] **拓撲連線草圖生成器 (Topological Schematic Sketch Engine)**：
  - 升級 `WorkflowSketch`，由依賴隨意物理座標改為依賴 DAG 連線拓撲分層自動繪製。
  - 標準化為左至右電路式草圖，杜絕遠距節點導致的縮圖過小或大面積空白問題。
  - 同步套用於 Dashboard 工作流預覽卡片與 AI 生成預覽視窗。
- [ ] **社群工作流管理專區**：提供使用者專屬的「我的已發布工作流」清單，支援編輯、下架與版本管理。
- [ ] **Core 工作流審核/管理工具**：完善管理員與受信任編輯者 (trusted_editor) 的審核工作台 UI。
- [ ] **工作流公開詳情頁與 SEO**：建立公開工作流的預覽頁與分享連結。
- [ ] **內部工作流畫布編輯器**：支援在 Community Template 內部進行完整的工作流畫布編輯。

---

## 🏗️ 進行中 (In Progress)

*(目前無進行中項目，所有規劃功能已實作並移至待測試)*

---

## 🧪 待測試 (Pending Test)

- [ ] **AI 工作流生成機制 (AI Workflow Generator: Prompt UI, LLM API, Catalog-Aware & Recursive Dummy Expansion)**：
  - **AI 自然語言輸入介面**：在畫布頂部右側 (`AI 生成工作流` 按鈕) 與側邊欄提供彈窗對話面板 [AIWorkflowModal.tsx](file:///Users/mac/Documents/methmatica/src/components/workflow/AIWorkflowModal.tsx)，支援輸入自訂 Prompt 與點選 4 組常用範例。
  - **LLM API 連線與金鑰配置**：支援 Gemini 2.5 Flash / 1.5 Flash（優先讀取 `VITE_GEMINI_API_KEY` 或本機 `localStorage` 使用者填寫），具備 Loading 動畫、防禦性 JSON 格式化與錯誤提示。
  - **查庫優先與 WorkflowSpec 提示詞工程**：注入系統現有節點庫，引導 LLM 優先使用原生節點，未知算法自動生成 `dummyNode` 佔位符。
  - **DAG 拓撲垂直居中排版**：優化 [aiWorkflowGenerator.ts](file:///Users/mac/Documents/methmatica/src/utils/aiWorkflowGenerator.ts)，新增各層級垂直居中與間距計算，杜絕倒退線與重疊。
  - **真實遞迴 Dummy 展開**：點擊 DummyNode「✨ 由 AI 實作」時，自動發起二次 Gemini 請求實作該子圖演算法，並替換為複合節點。
  - 0 errors 通過 `tsc -b` 與 `vite build`。

- [ ] **側邊欄雙標籤整併與固定色系雙舌片 (Sidebar Dual Tabs & Fixed Flaps Style)**：
  - **頂部切換按鈕移除**：移除抽屜頂部多餘的「元件庫 / 節點製造」Tab 切換按鈕，保持介面乾淨。
  - **情境激活機制**：預設狀態下隱藏 Interface In/Out 與節點製造，側邊欄邊緣僅有 1 個半圓形開合舌片（元件庫）。
  - **點擊建立節點解鎖**：點擊 ProjectNode 的「設計與建立節點」後自動解鎖第 2 個舌片（節點製造），並在元件庫下方解鎖「工作流端點 (Interfaces)」。
  - **雙舌片固定色彩美學**：
    - 上舌片（元件庫）：維持原生暗色調毛玻璃風格 (`var(--bg-sidebar)` / `var(--border-node)` / `var(--text-sub)`)。
    - 下舌片（節點製造）：固定採用科技藍色系 (`#0b1e36` / `#38bdf8`)，hover 時呈現高亮藍，不再隨開合狀態動態跳色，風格穩定一致。
  - 0 errors 通過 `tsc -b` 與 `vite build`。

- [ ] **NodeFrame 規範對齊與一鍵演示功能 (UI Design Alignment & One-click Demo)**：
  - 將 `InputNode`、`OutputNode`、`DummyNode`、`CompositeWorkflowNode` 全面改寫包覆於 `NodeFrame`，套用統一深色毛玻璃、標題列、圖標與 CSS 變數。
  - 全面將連接接口對齊專案的 `DynamicHandles` 系統，正確顯示左/右側外圍連線圓點。
  - 參考 `SliderNode.tsx` 規範，修復 `SliderComponent` 缺少 `nodrag` 與事件阻止導致被 ReactFlow 攔截拉不動的問題。
  - 於左側工具欄新增「✨ 載入 AI 工作流演示 (Demo)」按鈕，提供一鍵完整測試。
  - 0 errors 通過 `tsc -b` 與 `vite build`。

- [ ] **Phase 3: AI 工作流生成、查庫檢索與 Dummy 節點遞迴展開機制**：
  - 實作 AI Prompt 轉 WorkflowSpec 解析器與 DAG 自動分層排版演算法 (`aiWorkflowGenerator.ts`)。
  - 實作 Dummy 節點遞迴展開事件處理 (`ai-implement-dummy-node`) 與子圖替換 (`expandDummyNodeWithSubgraph`)。
  - 實作「開新頁面」子圖編輯機制 (`open-subgraph-new-page`)。
  - 0 errors 通過 `tsc -b` 與 `vite build`。

- [ ] **Phase 2: 宣告式 4 種 UI 元件 (LaTeX Input, Slider, SVG Picture, Text) 與複合節點卡片渲染**：
  - 實作 4 種宣告式 UI 元件組件 (`NodeUIComponents.tsx`)。
  - 實作複合工作流節點 (`CompositeWorkflowNode`) 的卡片渲染、雙向資料綁定與「開新頁面」按鈕。
  - 0 errors 通過 `tsc -b` 與 `vite build`。

- [ ] **Phase 1: 統一工作流規格 (WorkflowSpec v2) 與獨立輸入/輸出/佔位節點 (InputNode, OutputNode, DummyNode)**：
  - 定義 AI-Native `WorkflowSpec` (schemaVersion: 2)。
  - 實作畫布實體 `InputNode`、`OutputNode` 與 `DummyNode`。
  - 實作子圖 (Subgraph) 外部 Handles 自動推導演算法。
  - 測試用例通過驗證，`tsc -b` 與 `vite build` 0 errors 通過。

- [ ] **ESLint 規範與型別修復（排除 deprecated）**：
  - 排除 `src/**/deprecated/**`。
  - 修復 125+ 處 ESLint 錯誤至 0 errors。
  - 修復所有 TypeScript 編譯錯誤，`tsc -b` 與 `vite build` 均 0 errors 通過。
  - 修復核心 Hook 順序規則違規與 MathfieldElement / ComputeEngine 型別相容問題。

---

## ✅ 已完成 (Done)

- [x] **Supabase 身份驗證強化**：Google OAuth 整合、快顯 session 還原、移除依賴 `profiles` 每頁讀取。
- [x] **工作流發布機制轉移**：將發布與可見度管理整合至 `projectNode`。
- [x] **資料變更追蹤 (Dirty Tracking)**：基於 `savedGraphSignature` 追蹤改動，取代舊有單純的 `activeFileId` 判斷。
- [x] **節點吸入/彈射系統 (Node Absorption & Ejection)**：按鈕與閘門可吸入至目標節點並支援物理彈射分離。
- [x] **Math Pill 互動與連線機制**：拖曳連線、右鍵編輯、解決深層連動迴圈問題。
