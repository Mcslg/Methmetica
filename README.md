# Methmetica — AI 驅動的節點式數學工作流平台

> **Wikipedia 儲存的是可以閱讀的知識，而 Methmetica 儲存的是可以執行的知識。**

## 作品展示

- **🌐 線上體驗網址**：[https://mcslg.github.io/Methmetica/](https://mcslg.github.io/Methmetica/)
- **📦 專案原始碼**：[https://github.com/Mcslg/Methmetica](https://github.com/Mcslg/Methmetica)
- **🎬 演示影片**：[https://youtube.com/watch?v=VmcOA5XySf8&t=50&feature=shared]https://youtube.com/watch?v=VmcOA5XySf8&t=50&feature=shared

---

## 問題與目標

### 要解決的問題
目前使用者學習與應用數學時常面臨兩種極端困境：
1. **傳統教材與 Wikipedia**：內容雖然完整，但皆以靜態的線性文字呈現，讀者必須自行在腦中串聯概念與公式關係，**缺乏互動性與即時動態驗證能力**。
2. **一般 AI 解題工具**：僅直接輸出一整段文字答案。當使用者想**檢查某一步驟的邏輯**、**調整參數重新實驗**，或**將特定解法模組化重用到其他問題**時，往往需要重新向 AI 提問，無法將解法轉化為長久可用的工具。

### 目標使用者與預期影響
- **學生**：將 AI 生成的黑箱解法轉化為可視化節點流程，直觀看見每一步的計算與邏輯，並可自行修改節點參數進行探究式學習。
- **教師**：利用 AI 快速生成基礎數學工作流教學範本，再依照課程進度彈性編排與修改節點，製作互動式動態教材。
- **數學內容創作者**：將個人解法沉澱為可分享、可組合且可重用的「子工作流」知識單元。
- **科研人員**：運用節點工作流來進行數學運算與統整。
- **預期影響**：實現 **Question $\rightarrow$ Workflow $\rightarrow$ Understanding $\rightarrow$ Execution $\rightarrow$ Reuse** 的循環，讓數學知識從「一段需要閱讀的文章」轉變為「可被拆解、執行與重複組合的結構化工具」。

---

## 本次黑客松新增核心功能

- **自然語言轉換為結構化工作流**：使用者輸入自然語言數學需求，AI 自動規劃為有向無環圖 (DAG) 工作流草圖，而非單純的文字答案。
- **AI 節點庫資產沉澱與重用 (Node Registry)**：AI 規劃時優先檢索並重用既有節點庫；若功能缺失才動態生成新節點並自動入庫，隨使用累積降低重複生成成本。
- **自創節點 (workflows as Nodes)**：生成工作流時可將需要創造的節點標成dummy node 並自動生成定義工作流。
---

## 系統架構

Methmetica 採用分層反應式架構，將「自然語言意圖」、「節點拓撲排程」、「符號代數運算」與「知識沉澱複用」解耦串聯：

```
┌─────────────────────────────────────────────────────────────┐
│ 1. AI 編排與規格轉換層 (AI Workflow Orchestration)          │
│    - 提示詞意圖解析 (System Instruction / Three-Zone Prompt)│
│    - 社群節點庫動態注入 (Catalog-Aware Discovery)            │
│    - DAG 自動拓撲分層與排版 (DAG Layout Algorithm)          │
│    - 遞迴佔位實作鏈 (Recursive DummyNode Expansion)         │
└──────────────────────────────┬──────────────────────────────┘
                               │ WorkflowSpec v2
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. 互動式節點畫布層 (Visual Graph Canvas Layer)              │
│    - React Flow 響應式有向圖畫布 (@xyflow/react v12)        │
│    - 所見即所得數學輸入 (MathLive) & 印刷級渲染 (KaTeX)      │
│    - 富文本筆記與 Markdown 說明卡片 (Tiptap / React-Markdown)│
│    - 亮暗雙色調自適應系統 (Emerald Dark / Warm Off-white Light)│
└──────────────────────────────┬──────────────────────────────┘
                               │ State / Edges / Handles
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. 雙軌符號運算與求值引擎 (CAS & Stateless Execution Engine) │
│    - 反應式資料流與拓撲遍歷 (Zustand Flow Store)            │
│    - 符號運算與代數求解 (CortexJS ComputeEngine / Nerdamer) │
│    - 智慧隱式乘法展開與希臘字母變數抽取 (mathNormalizer.ts)  │
│    - 子工作流無狀態編譯器 (workflowCompiler.ts)              │
└──────────────────────────────┬──────────────────────────────┘
                               │ Custom Node Manufacture
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. 知識沉澱與雲端同步層 (Knowledge Persistence & Sync Layer) │
│    - 工作流就地封裝為節點 (Workflows as Composite Nodes)    │
│    - 本地草稿快取與版本變更追蹤 (LocalDraft / Dirty Tracking)│
│    - 雲端儲存與 Google OAuth 身份驗證 (Supabase BaaS)        │
│    - 核心/社群範本共享市集 (Community Catalog)              │
└─────────────────────────────────────────────────────────────┘
```

### 核心運作流程
1. **意圖解析與排版**：使用者輸入自然語言需求，AI 優先檢索現有節點庫，輸出結構化 `WorkflowSpec`，前端即時透過 DAG 分層演算法在畫布上水平展開節點與連線。
2. **自動遞迴實作鏈 (DummyNode Chain)**：當遇到未收錄之特定算法（或使用者指定獨立模組）時，系統先建立 `dummyNode` 佔位符，並自動發起二次實作請求，將其擴展為內嵌 Markdown 文件與標準端點的製造工作流草稿，最後以 `compositeWorkflowNode` 封裝。
3. **即時拓撲動態求值**：使用者拖曳滑桿或修改輸入時，引擎以 DAG 拓撲順序推動資料流；支援相鄰隱式乘法（如 $4ac \to 4 \cdot a \cdot c$）與希臘字母變數自動代換求值，運算結果即時反饋至 KaTeX 與視覺圖表。
4. **知識資產化**：任意工作流均可透過「設計與建立節點」封裝成專屬自訂節點，並發布至雲端社群知識庫，供其他使用者或 AI 後續直接引用。

---

## 使用技術

| 領域 / 元件 | 技術選型 | 說明與用途 |
| :--- | :--- | :--- |
| **核心框架** | React 19, TypeScript 5.9 | 前端使用者介面與嚴格型別定義 |
| **建置工具** | Vite 8 | 次世代極速前端模組打包與開發伺服器 |
| **流程圖與畫布** | @xyflow/react (React Flow v12) | 節點拖曳、連線、自訂 Handle 與畫布縮放拓撲視圖 |
| **數學排版與輸入** | MathLive, KaTeX | 所見即所得數學輸入欄位與高品質 LaTeX 渲染 |
| **代數運算 (CAS)** | @cortex-js/compute-engine, Nerdamer | 高精度符號數學運算、方程式求根與無狀態純函式求值 |
| **富文本與說明** | Tiptap Editor Suite, React-Markdown | Markdown 筆記編輯、LaTeX 語法擴充 (MathPill) 與結構化卡片說明 |
| **全域狀態管理** | Zustand 5 | 集中式工作流狀態、DAG 拓撲求解排程與畫布歷史 |
| **AI 模型與服務** | Google Gemini API (2.5 Flash / 1.5 Flash) | 自然語言工作流規劃、代數演算法生成與自訂節點子圖建構 |
| **雲端後端 (BaaS)** | Supabase (PostgreSQL, Auth, Storage) | Google OAuth 登入、工作流雲端存取與社群模組發布 |
| **CI/CD 自動化部署** | GitHub Actions, GitHub Pages | 程式碼品質檢查、自動構建與靜態網頁託管 |

---

## 安裝與執行

### 1. 先決條件
- **Node.js**：`>= 18.0.0` (建議 Node.js 20 或 22)
- **npm**：`>= 9.0.0`

### 2. 本機開發步驟
```bash
# 1. 複製專案庫
git clone https://github.com/Mcslg/Methmetica.git
cd Methmetica

# 2. 安裝依賴套件
npm install

# 3. 配置環境變數 (選填)
cp .env.example .env
# 可依需求在 .env 中填入 VITE_GEMINI_API_KEY 或 Supabase 金鑰。
# （若未設定，本機畫布試算仍可完整運行，AI 金鑰亦可直接在 UI 中填入）

# 4. 啟動本機開發伺服器
npm run dev
```
啟動後於瀏覽器造訪 `http://localhost:5173` 即可開始使用。

### 3. 生產環境建置與驗證
```bash
# 執行 TypeScript 型別檢查與 Vite 生產打包
npm run build

# 本機預覽打包成果
npm run preview

# 執行 ESLint 程式碼檢查
npm run lint
```

---

## 🧪 AI 工作流生成測試指南

Methmetica 具備將自然語言數學問題自動轉譯為有向無環圖 (DAG) 與自訂節點連鎖實作的能力。評審或開發者可依照以下步驟進行測試與評估：

### 1. 配置 Gemini API Key
- **免設定介面輸入（推薦）**：無論在線上體驗版或本地端，開啟「✨ AI 生成工作流」彈窗後，點擊金鑰欄位填入 Google Gemini API Key 即可（系統會安全保存在瀏覽器的 `localStorage` 中，不經過任何中繼伺服器）。
- **環境變數配置**：在本地開發時，亦可直接於 `.env` 中填入 `VITE_GEMINI_API_KEY=你的金鑰`。

### 2. 開啟 AI 生成介面
點擊畫布右上角浮動按鈕 **「✨ AI 生成工作流」**（或左側抽屜工具箱頂部按鈕），即可開啟自然語言工作流編排面板。

### 3. 推薦測試案例

#### 測試案例 A：標準三區互動探究（Markdown 說明 + 滑桿參數 + 即時運算）
> **Prompt**：「製作一個圓幾何計算工作流，包含一個動態半徑 SliderNode (範圍 1~50)，同時計算並輸出圓周長 2*pi*r 與圓面積 pi*r^2。」
>
> **驗證要點**：
> - 畫布自動呈現三區規範佈局：頂部為 Markdown 原理說明卡片、中部為動態半徑滑桿、右側為運算與輸出端點。
> - 拖曳半徑滑桿，圓周長與圓面積數值以 DAG 拓撲順序即時聯動更新。

#### 測試案例 B：自訂獨立模組與自動連鎖實作（DummyNode Chain）
> **Prompt**：「製作一個三角形求解工作流，輸入邊長 a, b 與夾角 theta，**餘弦定理請另外做一個獨立節點**，最後輸出第三邊 c。」
>
> **驗證要點**：
> - 模型精確識別「另外做一個獨立節點」需求，先標記為佔位節點，並連鎖發起二次生成自動實作子工作流。
> - 畫布直接呈現封裝好的 `compositeWorkflowNode`（複合工作流節點）。
> - 點擊複合節點上的 **「開啟製造工作流 ↗」**，會在獨立新分頁開啟該節點的製造草稿（含數學推導筆記、Interface In/Out 端點與內部算式）。
> - 點擊右上角 **「🔄 重新生成」** 按鈕，可原地向 AI 發起重新實作覆蓋草稿。

#### 測試案例 C：社群黑盒子模組調用
> **Prompt**：「製作一個數學定理探究流程：開頭引用社群的「定義卡片」做前置陳述，接著輸入題目參數 a, b, c，經由 calculateNode 運算判別式，最後將摘要輸出至結果節點。」
>
> **驗證要點**：
> - AI 優先檢索現有社群節點目錄，正確引用宣告之輸入/輸出 Handles，體現知識庫資產重用能力。

### 4. 預覽與載入
- 點擊 **「開始生成工作流」** 後，視窗即時展示連線拓撲電路草圖。
- 點擊 **「覆蓋並開啟」**，一鍵渲染至畫布並啟動動態求值。

---

## 作品展示

- **🌐 線上體驗網址**：[https://mcslg.github.io/Methmetica/](https://mcslg.github.io/Methmetica/)
- **📦 專案原始碼**：[https://github.com/Mcslg/Methmetica](https://github.com/Mcslg/Methmetica)
- **🎬 演示影片**：（黑客松評選影片連結待填）

---

## 限制與未來工作

### 目前已知限制
1. **主執行緒高頻運算負擔**：目前的無狀態數學求值引擎與方程式求解運行於主執行緒，當處理極大維度矩陣或高階微積分連續求值時，畫布 UI 可能出現微幅影格波動。
2. **社群自訂節點檢索規模**：目前自訂節點檢索與 AI 目錄注入主要依賴分類標籤與 Handles 元資料比對；當社群節點數量大幅擴張時，需引進語意向量嵌入（Vector Embedding Search）以提高匹配精度。

### 未來發展方向
- **Web Worker / WebAssembly 算力隔離**：將 `statelessMathEvaluator` 與符號計算完整移至 Web Worker 執行，並探索透過 Pyodide 整合 Python 科學計算生態（如 SymPy、NumPy）。
- **拓撲電路草圖生成器**：由依賴自由物理座標升級為純 DAG 連線拓撲自動分層繪製，提供更標準化的縮圖預覽卡片。
- **社群節點版本控制與多人協作**：支援社群自訂節點的跨工作流自動引用升級與版本回退機制。

---

## 第三方服務、資料與素材

- **Google Gemini API**：提供自然語言工作流規劃與子圖代碼生成服務 ([Google AI Terms](https://ai.google.dev/terms))
- **React Flow (@xyflow/react)**：開源節點式流程圖引擎，採用 MIT License ([React Flow](https://reactflow.dev/))
- **CortexJS ComputeEngine**：開源現代符號數學計算引擎，採用 MIT License ([CortexJS](https://cortexjs.io/compute-engine/))
- **MathLive & KaTeX**：開源數學公式輸入器與渲染器，採用 MIT License ([MathLive](https://cortexjs.io/mathlive/) / [KaTeX](https://katex.org/))
- **Nerdamer**：開源符號代數系統 (CAS)，採用 MIT License ([Nerdamer](https://nerdamer.com/))
- **Tiptap**：開源無頭富文本編輯套件，採用 MIT License ([Tiptap](https://tiptap.dev/))
- **Supabase**：開源後端即服務 (BaaS)，採用 Apache License 2.0 ([Supabase](https://supabase.com/))

---

## 團隊成員

| 角色 / 姓名 | 分工職責 |
| :--- | :--- |
| **Mcslg** | 產品核心架構設計、AI 自然語言工作流編排管線、符號計算引擎與節點製造系統實作 |

---

## License

本專案採用 [MIT License](LICENSE) 授權。
