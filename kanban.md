# Methmetica 看板 (Kanban)

最後更新時間：2026-09-04

---

簡單任務可能略顯冗餘：對於極為單純的運算指令（如「計算 1+1」），模型依然會生成說明卡片與滑桿，需視實際使用情境評估是否需允許在極簡指令下放寬三區限制。

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

- [ ] **全介面非同步文字繁體中文化收斂 (Pure Traditional Chinese UI Normalization)**：
  - **節點註冊庫全面中文化**：統一 [registry.tsx](file:///Users/mac/Documents/methmatica/src/nodes/registry.tsx) 中全數 24 種節點的 `metadata.label` 與 `desc`，徹底消除側邊欄與右鍵選單的純英文字串（如 `Notebook` $\to$ `筆記 (Notebook)`、`Math Calc` $\to$ `數學運算 (Calculate)`、`Interface In/Out` $\to$ `端點輸入/輸出` 等）。
  - **節點本體預設標籤收斂**：修復 [CalculateNode.tsx](file:///Users/mac/Documents/methmatica/src/nodes/CalculateNode.tsx)、[GraphNode.tsx](file:///Users/mac/Documents/methmatica/src/nodes/GraphNode.tsx)、[InputNode.tsx](file:///Users/mac/Documents/methmatica/src/nodes/core/InputNode.tsx)、[OutputNode.tsx](file:///Users/mac/Documents/methmatica/src/nodes/core/OutputNode.tsx)、[TextNode.tsx](file:///Users/mac/Documents/methmatica/src/nodes/TextNode.tsx)、[CodeNode.tsx](file:///Users/mac/Documents/methmatica/src/nodes/CodeNode.tsx) 等所有節點的 `defaultLabel` 與提示詞，不再預設出現在畫布上為英文。
  - **i18n 字典與分類補全**：在 [zh-TW.ts](file:///Users/mac/Documents/methmatica/src/translations/zh-TW.ts) 與 [en.ts](file:///Users/mac/Documents/methmatica/src/translations/en.ts) 補齊遺漏的類別 (`utils`, `media`, `interface`, `workflow`, `strategy`, `navigation`) 與導航常用詞 (`goto_home`, `unsaved_warning`, `synced`)，杜絕 `t(...)` 返回 raw key。
  - **全域操作與控制元件在地化**：滑桿參數標籤由 `MIN/MAX/STEP` 轉為 `最小值/最大值/步進`；右鍵選單「Header」轉為「標題列」；程式碼節點「AUTO/RUN」轉為「自動/執行」；頂部狀態列「UNTITLED WORKFLOW」轉為「未命名工作流」，呈現一致成熟的繁體中文體驗。
  - 0 errors 通過 `npm run build` 與 `npx eslint src`。

- [ ] **相鄰單字母隱式相乘自動拆解與變數解析引擎 (Smart Implicit Multiplication & Robust Variable Extraction)**：
  - **根本原因排查與解決**：徹底解決 CAS 代數系統（如 Nerdamer）與正則解析器將相鄰字母（如 `b^2 - 4ac` 中的 `ac`）誤判為單一識別字、導致拉動 Slider 時端點不吻合且輸出無法連動代入的根本問題。
  - **集中式數學公式正規化器 (`mathNormalizer.ts`)**：
    - 自動補齊數學函數反斜線（`sin` $\to$ `\sin`，`pi` $\to$ `\pi`）。
    - 智慧展開相鄰單字母乘法（`4ac` $\to$ `4 \cdot a \cdot c`，`ac` $\to$ `a \cdot c`，`2\pi r` $\to$ `2\pi \cdot r`），同時嚴格保護 LaTeX 語法關鍵字（如 `\sin`, `\frac`, `\cdot`, `\Delta` 等）。
    - 智慧展開括號與數字乘法（`4a(b+c)` $\to$ `4 \cdot a \cdot (b+c)`，`(a)(b)` $\to$ `(a) \cdot (b)`）。
  - **雙軌容錯變數提取器 (`extractFormulaVariables`)**：結合 ComputeEngine 語法樹與保留字過濾正則（以單詞邊界排序防止子字串污染），確保端點生成為獨立的 `h-in-b`, `h-in-a`, `h-in-c`。
  - **Nerdamer 轉換器 (`latexToNerdamer`)**：在方程式求解與代換前將隱式相乘轉為顯式 `*`，保證拉動各個 Slider 時數值能被精確代換計算。
  - **跨模組全套用**：同步套用於 [MathInput.tsx](file:///Users/mac/Documents/methmatica/src/components/MathInput.tsx)、[CalculateNode.tsx](file:///Users/mac/Documents/methmatica/src/nodes/CalculateNode.tsx)、[aiWorkflowGenerator.ts](file:///Users/mac/Documents/methmatica/src/utils/aiWorkflowGenerator.ts)、[CalculationService.ts](file:///Users/mac/Documents/methmatica/src/utils/deprecated/CalculationService.ts) 與 [aiClient.ts](file:///Users/mac/Documents/methmatica/src/utils/aiClient.ts)。
  - 0 errors 通過 `npm run build` 與 `npx eslint src`。

- [ ] **CalculateNode 與工作流算式 LaTeX 全面支援與即時預覽 (CalculateNode LaTeX Normalization, External Formula KaTeX & Realtime Result Preview)**：
  - **MathInput LaTeX 語法自動正規化**：在 [MathInput.tsx](file:///Users/mac/Documents/methmatica/src/components/MathInput.tsx) 建立標準 LaTeX 正規化機制，自動脫除外層 `$` / `$$` / `\(` / `\)` 定界符，並將程式碼乘號 `*` 自動轉譯為標準數學點乘 `\cdot`，且補齊常見數學函數斜線前綴（如 `\sin`, `\pi`），使 MathLive 在首幀掛載與後續狀態同步時均能呈現標準印刷級排版。
  - **外部公式輸入 (EXT) KaTeX 渲染**：在 [CalculateNode.tsx](file:///Users/mac/Documents/methmatica/src/nodes/CalculateNode.tsx) 修復 `useExternalFormula` 視圖原為純文字 `<div>` 的問題，引入 KaTeX 即時轉譯外部傳入之 LaTeX 算式。
  - **CalculateNode 即時運算結果預覽**：在 [CalculateNode.tsx](file:///Users/mac/Documents/methmatica/src/nodes/CalculateNode.tsx) 卡片底部新增 `= <katex>` 結果預覽列，當未知數輸入運算完成後直接以 KaTeX 呈現印刷級計算結果，不再盲算。
  - **OutputNode 端點資料流拓撲聯動**：在 [useStore.ts](file:///Users/mac/Documents/methmatica/src/store/useStore.ts) 的 `evaluateGraph` 拓撲運算中納入 `outputNode`，使 `calculateNode` 輸出的結果能即時傳遞至 `outputNode.data.input` 與 `outputNode.data.value`，搭配 [OutputNode.tsx](file:///Users/mac/Documents/methmatica/src/nodes/core/OutputNode.tsx) 完成端對端 LaTeX 串接。
  - **AI 提示詞與算式變數解析容錯強化**：在 [aiClient.ts](file:///Users/mac/Documents/methmatica/src/utils/aiClient.ts)、[aiWorkflowGenerator.ts](file:///Users/mac/Documents/methmatica/src/utils/aiWorkflowGenerator.ts) 與 [CalculationService.ts](file:///Users/mac/Documents/methmatica/src/utils/deprecated/CalculationService.ts) 將提示詞範例升級為正統 LaTeX（如 `b^2 - 4ac`），並在算式變數抽取與計算引擎執行階段徹底排除外層符號干擾。
  - 0 errors 通過 `npm run build` 與 `npx eslint src`。

- [ ] **全域 LaTeX 語法解析轉換與即時渲染修復 (LaTeX Parsing, Attribute Escaping & Global KaTeX Rendering)**：
  - **單雙錢號與標準 LaTeX 語法支援**：修復 [TextNode.tsx](file:///Users/mac/Documents/methmatica/src/nodes/TextNode.tsx) 原先僅識別 `$$...$$` 而忽略 `$x$` 行內公式的問題，全面擴充支援 `$$...$$`、`$...$`、`\[...\]` 與 `\(...\)`。
  - **HTML 屬性安全轉義防穿透**：解決含有 `<`、`>` 符號的公式（如 `\Delta > 0`）因未做屬性轉義導致 HTML 標籤提早閉合中斷的問題。
  - **舊存檔與 JSON 樹無損自動遷移**：實作 `migrateDocWithMath`，無論新生成之 Markdown 或已被儲存為純文字 JSON 之舊畫布，均能自動將帶有 `$` 的文字節點即時升級為 KaTeX `MathPill` 實體。
  - **即時輸入與貼上規則完整綁定**：在 Tiptap `MathPill` 擴充套件中加入 `addInputRules`（支援單錢號行內公式）與 `addPasteRules`（貼上含公式 Markdown 即時轉譯）。
  - **OutputNode 端點 KaTeX 渲染支援**：在 [OutputNode.tsx](file:///Users/mac/Documents/methmatica/src/nodes/core/OutputNode.tsx) 新增 KaTeX 渲染機制，當運算結果為 LaTeX 或型態為 `latex` 時直接顯示數學式而非純文字。
  - 0 errors 通過 `npx eslint src` 與 `npm run build`。

- [ ] **AI 提示詞三區架構與社群節點嚴格調用規範 (Three-Zone Prompt Architecture & Strict Community Node Invocation)**：
  - **說明區收斂至原生 textNode**：在 [aiClient.ts](file:///Users/mac/Documents/methmatica/src/utils/aiClient.ts) 明確規範說明區（Zone 1）必須且僅能使用支援 Markdown 與 LaTeX 公式之原生 `textNode`，嚴禁生成虛構的填空社群卡片。
  - **社群節點嚴格調用規範**：將社群節點庫定位為預先發布之黑盒子依賴（Black-box Component），僅在使用者需求明確精確吻合既有節點 ID 與功能時才允許引用其宣告 Handles，嚴禁現場改寫欄位或隨意捏造實例。若無完全吻合之社群節點，一律回歸原生幾何/數值節點與 `dummyNode`。
  - **分層垂直排序優化**：在 [aiWorkflowGenerator.ts](file:///Users/mac/Documents/methmatica/src/utils/aiWorkflowGenerator.ts) 的 `convertSpecToCanvasGraph` 中，對同分層之節點 bucket 依功能排序（說明區 `textNode` 置頂，互動區 `sliderNode` 居中，運算與社群程序在後），避免畫布同列節點上下錯置。
  - 0 errors 通過 `npx eslint src` 與 `npm run build`。

- [ ] **AI 節點表層欄位感知與連線端口自動正規化 (Node Surface Config & Port Normalization)**：
  - **表層欄位對齊**：在 `aiClient.ts` 明確定義 `calculateNode`（`formula`）、`sliderNode`（`nodeName`/`value`/`min`/`max`/`step`）、`graphNode`（`formula`）、`textNode`（`text`）、`inputNode`/`outputNode`（`nodeName`/`variant`/`value`）的表層可編輯欄位與預設範例。
  - **社群卡片欄位注入與同步**：在提示詞動態列出各社群節點表層欄位，生成時將 `templateFields` 合併並同步至 `templateDraft.builderBlocks`，使卡片直接顯示 AI 填寫的定義與步驟。
  - **首幀 Handles 預初始化**：在 `aiWorkflowGenerator.ts` 實作 `extractFormulaVariables`，直接由算式解析未知數變數預填 `h-in-<var>` 與 `h-out`，使 React Flow 掛載首幀即可精準吸附連線。
  - **連線 Handle 雙重容錯正規化**：自動將來源端點（`sliderNode`/`calculateNode`）之 `out`/`value` 映射為 `h-out`；目標變數（`a`, `b`, `x`）自動補齊為 `h-in-a`, `h-in-b`；圖表對齊為 `h-fn-in`。
  - `npx eslint src` (0 errors) 與 `npm run build` 打包通過。

- [ ] **核心常用節點移出 deprecated 與全專案 ESLint 零錯誤規範 (Migrate Core Nodes from Deprecated & ESLint Clean)**：
  - **移出核心三節點**：將 AI 工作流核心所依賴的 [CalculateNode.tsx](file:///Users/mac/Documents/methmatica/src/nodes/CalculateNode.tsx)、[SliderNode.tsx](file:///Users/mac/Documents/methmatica/src/nodes/SliderNode.tsx)、[GraphNode.tsx](file:///Users/mac/Documents/methmatica/src/nodes/GraphNode.tsx) 從 `src/nodes/deprecated/` 移至 `src/nodes/` 標準目錄。
  - **同步重構依賴參照**：全面更新 `registry.tsx` 與三個節點的內部 import 相對路徑，徹底移除對 deprecated 節點的參照。
  - **全面修復 ESLint 規範**：修復移出之三個節點及相關元件中 62 處 `no-explicit-any`、`no-empty`、`react-hooks/purity` 與 `set-state-in-effect` 違規。
  - `npx eslint src` 與 `npm run build` (`tsc -b && vite build`) 均達 **0 errors**。

- [ ] **社群節點庫動態注入至 AI 工作流生成機制 (Dynamic Community Catalog Ingestion for AI Workflow)**：
  - **動態提示詞目錄編譯**：在 [aiClient.ts](file:///Users/mac/Documents/methmatica/src/utils/aiClient.ts) 實作 `formatCommunityCatalogForPrompt` 與 `buildSystemInstruction`，將 `defaultCommunityTemplates` 與使用者自訂社群節點動態格式化為 Schema 注入 Gemini。
  - **節點類型與端口對齊**：支援 `communityTemplateNode` 語法，規範 `in-context`, `out-summary`, `in-data`, `out-method` 等 Handles 對接。
  - **畫布實體完整綁定**：在 [aiWorkflowGenerator.ts](file:///Users/mac/Documents/methmatica/src/utils/aiWorkflowGenerator.ts) 中轉換時自動補齊 `templateDraft`、`templateFields`、寬高樣式與 `DynamicHandles`。
  - **示範案例與乾淨體驗**：在 [AIWorkflowModal.tsx](file:///Users/mac/Documents/methmatica/src/components/workflow/AIWorkflowModal.tsx) 新增「社群節點整合：定理定義與判別」預設 Prompt，介面維持原生簡約，無多餘之假動畫。
  - 0 errors 通過 `tsc -b` 與 `vite build`。

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
