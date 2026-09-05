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

- [ ] **WorkflowHeader 工作流標題列淺色模式適配與樣式收斂 (WorkflowHeader Light Mode Adaptation & Theme Convergence)**：
  - **根本原因修復**：修復 [`WorkflowHeader.tsx`](file:///Users/mac/Documents/methmatica/src/components/WorkflowHeader.tsx) 原先寫死深黑色背景 `rgba(10, 14, 12, 0.72)`、冷灰邊框 `rgba(148, 163, 184, 0.28)` 與硬編碼陰影的缺陷。在淺色模式下，文字顏色 `--text-main` 為深墨綠（`#0E2F0B`），疊加在寫死的黑底上導致對比度嚴重不足且視覺突兀。
  - **全面收斂至系統主題變數**：
    - 容器背景切換為 `var(--bg-node)`（深色為墨綠暗底，淺色為米白純淨底色配合 `blur(16px)` 毛玻璃效果）。
    - 邊框切換為 `var(--border-node)`，陰影對齊 `var(--node-shadow)`，圓角由銳利的 `4px` 調整為圓潤的 `10px`。
    - 未驗證徽章切換為 `--color-warning`、`--color-warning-bg` 與 `--color-warning-border`；節點數標籤對齊 `--bg-input` 與 `--text-sub`。
    - 在 [`index.css`](file:///Users/mac/Documents/methmatica/src/index.css) 正式註冊 `.workflow-header-overlay` 樣式規範。
  - 0 errors 通過 `npm run build` 與 `npx eslint`。

- [ ] **AI 提示詞識別「另外做一個節點/獨立模組」與 DummyNode 連鎖觸發 (AI Prompt Semantic DummyNode Trigger for Custom Subgraphs)**：
  - **強約束觸發規則 (Trigger Conditions)**：在 [`aiClient.ts`](file:///Users/mac/Documents/methmatica/src/utils/aiClient.ts) 的系統提示詞（System Instruction）中強化 `dummyNode` 規則。明確要求模型當使用者提示詞提及「另外做一個節點」、「封裝成獨立節點/模組」、「另外做成一個模組」時，**即使公式本身非常單純（例如餘弦定理），也必須強制使用 `dummyNode`**，不可直接簡化為單個 `calculateNode`。
  - **自動連鎖製造草稿**：配合既有的方案 A 自動連鎖實作機制，只要頂層產生 `dummyNode`，系統將自動向 Gemini 發起二次請求實作子圖、生成帶有 Markdown 文件說明的製造草稿，並替換為可直接展開與求值的 `compositeWorkflowNode`。
  - 0 errors 通過 `npm run build` 與 `npx eslint src/utils/aiClient.ts`。

- [ ] **AI 生成工作流彈窗與閒置右鍵提示浮層衝突修復 (Idle Tooltip vs AI Modal Conflict Fix)**：
  - **層級與開啟互斥**：將 [`AIWorkflowModal.tsx`](file:///Users/mac/Documents/methmatica/src/components/workflow/AIWorkflowModal.tsx) 遮罩的 `z-index` 調升至 `100001`，徹底壓過一般全域浮層。
  - **即時清理與觸發阻擋**：在 [`App.tsx`](file:///Users/mac/Documents/methmatica/src/App.tsx) 中封裝 `handleOpenAIModal`，當開啟 AI 工作流生成彈窗時，立即清除閒置計時器並將 `idleTooltip` 設為 `null`；在 `onMouseMove` 與 DOM 渲染條件中加入 `!isAIModalOpen` 雙重防護，徹底消除彈窗開啟時右鍵產生節點浮動提示的滯留問題。
  - 0 errors 通過 `npm run build` 與 `npx eslint`。

- [ ] **端點輸入 (InputNode) 輸出值同步與 CalculateNode 希臘字母變數支援修復 (InputNode Output Sync & Greek Variables Support)**：
  - **InputNode 輸出同步**：修復 [`InputNode.tsx`](file:///Users/mac/Documents/methmatica/src/nodes/core/InputNode.tsx) 在修改輸入數值時僅更新 `data.value` 的缺陷，同步寫入 `data.outputs.out` 與 `data.outputs['h-out']`，確保下游連線與子圖 Runtime 能可靠讀取即時數值。
  - **希臘字母變數解放**：重構 [`mathNormalizer.ts`](file:///Users/mac/Documents/methmatica/src/utils/mathNormalizer.ts)，將 `alpha, beta, theta, omega, phi...` 等希臘符號從常數排除名單中分離，使其能正確作為公式未知數提取，使 `calculateNode` 左側自動生成對應的輸入端口（Handle）。
  - **雙向變數指派相容**：在 [`statelessMathEvaluator.ts`](file:///Users/mac/Documents/methmatica/src/utils/statelessMathEvaluator.ts) 與 [`CalculationService.ts`](file:///Users/mac/Documents/methmatica/src/utils/deprecated/CalculationService.ts) 中，支援希臘變數名稱與 LaTeX 反斜線符號（如 `theta` 與 `\theta`）的雙向比對與指派。
  - 0 errors 通過 `npm run build` 與 `npx eslint`。

- [ ] **自訂節點製造工作流自動注入 Markdown 筆記說明節點 (Auto-Injected Documentation TextNode in Manufacturing Workflows)**：
  - **Prompt 明確要求**：在 [`aiClient.ts`](file:///Users/mac/Documents/methmatica/src/utils/aiClient.ts) 的 `callGeminiImplementDummyNode` 中，明確指示 AI 在生成子工作流時必須包含一個 `textNode`，詳細記載數學原理、計算步驟與推導說明。
  - **雙重保障自動注入**：在 [`aiWorkflowGenerator.ts`](file:///Users/mac/Documents/methmatica/src/utils/aiWorkflowGenerator.ts) 的 `createNodeManufacturingWorkflow` 中，若 AI 產生的子圖未含文字卡片，系統自動在 `ProjectNode` 下方注入一個規格完整的 `textNode` 說明卡片（含功能概述、Inputs 規格、Outputs 結果與操作提示），確保使用者開啟製造工作流時有一目了然的文件說明。
  - 0 errors 通過 `npm run build` 與 `npx eslint src`。

- [ ] **子工作流編譯為無狀態函式求值與 CompositeWorkflowNode 運算對接 (Workflow Subgraph Compilation & Stateless Evaluation)**：
  - **純無狀態數學求值工具 (`statelessMathEvaluator.ts`)**：抽取 `evaluateMathExpression(formula, variables)`，使用 ComputeEngine 進行嚴謹的純函式變數代入與運算求值，不依賴 React 畫面組件。
  - **擴充工作流編譯器 (`workflowCompiler.ts`)**：
    - 節點支援白名單納入 `calculateNode`、`inputNode`、`outputNode`（若遇到未知型別或算式缺失則嚴格報錯中斷）。
    - 支援無 Bridge 的標準子工作流編譯架構（`compileSubgraphWorkflow`），自動以 `inputNode` 群作為輸入端點、`outputNode` 群作為輸出端點。
    - 匯出 `buildWorkflowFunction(graph)`，可直接產出非同步純運算函式 `(inputs) => Promise<outputs>`。
  - **畫布求值管線對接 (`useStore.ts`)**：
    - 在 `evaluateGraph` 拓撲排序中加入 `compositeWorkflowNode` 求值分支：自動讀取本機製造草稿（`draftId`），編譯為子圖 artifact 並以當前外部輸入執行運算，計算完成自動更新 `outputs` 推出下游節點。
  - **複合節點「🔄 重新生成」按鈕 (`CompositeWorkflowNode.tsx`)**：
    - 在右上角控制列新增「🔄 重新生成」按鈕，可直接以原先的輸入/輸出接口向 AI 發起重新生成並覆蓋既有草稿，解決初次生成不滿意需手動刪除重拉的問題。
  - 0 errors 通過 `npm run build` 與 `npx eslint src`。

- [ ] **AI 實作節點自動生成「節點製造工作流」與新分頁跳轉整合 (AI Dummy Node Auto-Manufacturing Workflow & Tab Navigation)**：
  - 當 DummyNode 點擊「✨ 由 AI 實作此節點」完成後，呼叫 `createNodeManufacturingWorkflow` 自動將生成的子圖規格轉化為包含 `ProjectNode`、`InputNode`（介面輸入）、運算節點、`OutputNode`（介面輸出）的完整自訂節點製造工作流。
  - 呼叫 `localDraftService.createLocalDraft` 將製造工作流保存至本地草稿庫，並將 `draftId` 回填至父工作流中的 `CompositeWorkflowNode`（`data.draftId` 與 `data.subgraphDraftId`）。
  - 複合節點點擊「開啟製造工作流 ↗」時，透過標準路由 `/?view=editor&source=draft&id=${draftId}` 在獨立新分頁開啟該製造草稿，可立即試算或點擊「設計與建立節點」進行自訂節點封裝。
  - 增強 `navigation.ts` 路由解析，支援舊版 `?subgraph=` 與 `?draft=` 連結容錯映射至標準草稿路由。
  - 在 `NodeData` 型別新增 `draftId` 與 `subgraphDraftId` 可選欄位。
  - 0 errors 通過 `tsc -b` 與 `vite build`。

- [ ] **右上角「說明模式 (Explain Mode)」提示微縮與避讓排版優化 (Explain Mode Badge Compact & Positioning Adjustment)**：
  - **位置下移避讓頂部操作列**：修復原先 `top: 18px` 與頂部 `Go to Node` 按鈕互相遮擋衝突的問題，向下調整至 `top: 54px, right: 18px`，清晰獨立停靠於頂部控制區下方。
  - **尺寸與內距輕量微縮**：整體內距由 `10px 14px` 縮減為 `4px 8px`，圓角由 `14px` 調整為 `8px`；快捷鍵字母「M」鍵帽由 `28×28px` 縮減至 `18×18px`（字體 `10px`），標題字體微調為 `0.65rem`，大幅減少畫布右上角視覺干擾，維持優雅簡約的指示效果。
  - 0 errors 通過 `npm run build` 與 `npx eslint src`。

- [ ] **自訂節點封裝器與「設計與建立節點」按鈕淺色模式可讀性與背景相容修復 (Node Creator Panel & Builder Button Light Mode Readability & Theming Fix)**：
  - **「設計與建立節點」按鈕文字隱形修復**：修復 [index.css](file:///Users/mac/Documents/methmatica/src/index.css) 中 `.builder-create-btn` 原先寫死 `color: #e0f2fe`（淡粉白），在淺色模式的米白卡片上呈現「白底白字」完全看不清的問題；改採具高對比與高質感的實體主題膠囊按鈕（`--ai-btn-bg` 搭配純白字），在深色（翠綠）與淺色（深墨綠）模式下皆清晰明亮。
  - **自訂節點封裝器 UI 背景與文字對比修復**：徹底重構 [NodeCreatorPanel.tsx](file:///Users/mac/Documents/methmatica/src/components/workflow/NodeCreatorPanel.tsx)，拔除根層級的硬編碼純白文字 `color: '#f8fafc'` 與各子區塊硬編碼的暗黑背景色（`rgba(15, 23, 42, 0.6)`、`#131e36`），全數切換為主題變數 `--text-main`、`--text-sub`、`--bg-input` 與 `--bg-node`。淺色模式下側邊欄無論換何種背景，文字均呈現深墨綠色，不再出現「背景蓋住文字」或反白消失的瑕疵，並新增「← 返回元件庫」快捷跳轉。
  - **節點製造器 (NodeBuilderNode) 介面區塊相容性**：修復 [NodeBuilderNode.tsx](file:///Users/mac/Documents/methmatica/src/nodes/NodeBuilderNode.tsx) 介面端點清單的原生白框與黑灰底，全面收斂為 `--border-node` 與 `--bg-node`。
  - 0 errors 通過 `npm run build` 與 `npx eslint src`。

- [ ] **系統主色調收斂與 AI 生成去漸層化 (Dual-Theme Convergence & Seamless AI Aesthetics)**：
  - **亮暗雙主色調體系收斂**：嚴格鎖定現有的暗色（以 `:root` 墨綠黑 `#080d08` 為基底、翡翠綠 `#4ade80` 為高亮）與亮色（以 `[data-theme='light']` 暖米白 `#fdfbf7` 為基底、深墨綠 `#0E2F0B` 為文字與邊框）兩種主題，不增加多餘選色器或外部主題擴充。
  - **AI 生成介面去漸層化與主題高度融合**：
    - 全面移除 [AIWorkflowModal.tsx](file:///Users/mac/Documents/methmatica/src/components/workflow/AIWorkflowModal.tsx) 頂部標題、圖示、預設範例與底部「開始生成工作流」/「覆蓋並開啟」的高彩度紫色與天藍色漸層（`linear-gradient`），改用自然融合的 `--ai-bg`、`--ai-border` 與 `--ai-btn-bg`，在深色下沉穩翠綠、在淺色下優雅墨綠。
    - 移除 [NodeLibrary.tsx](file:///Users/mac/Documents/methmatica/src/components/NodeLibrary.tsx) 側邊欄「✨ AI 生成工作流」的紫藍漸層與陰影，改用與側邊欄完全協調之微透亮底色與框線。
    - 移除 [DummyNode.tsx](file:///Users/mac/Documents/methmatica/src/nodes/core/DummyNode.tsx)「✨ 由 AI 實作此節點」按鈕的粉紫高彩度漸層與外框徽章粉色，改為實體按鈕與警告黃徽章。
    - 移除 [App.tsx](file:///Users/mac/Documents/methmatica/src/App.tsx) 頂部右上角「✨ AI 生成工作流」浮動按鈕的紫藍漸層，改用 `--ai-bg` 與 `--ai-text`，徹底解決淺色模式下反差突兀的問題。
  - **語意警告色獨立化**：將刪除節點（紅色 `--color-danger`）與提示/警告（黃色 `--color-warning`）獨立於主色綠之外，確保功能危險性與快捷鍵提示清晰可辨。
  - 0 errors 通過 `npm run build` 與 `npx eslint src`。

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
