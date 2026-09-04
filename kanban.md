# Methmetica 看板 (Kanban)

最後更新時間：2026-09-04

---

- [ ] **AI 友善節點製造架構：Template Canvas JSON 規格與標準 UI 元件 (LaTeX / Slider / SVG / Text)**：拋棄複雜視覺化 Builder，以宣告式 JSON 定義樣板畫面與元件渲染。
- [ ] **Interface 架構重構：獨立輸入/輸出節點 (Input/Output Nodes)**：每個介面埠對應畫布內的實體節點，取代原先生長在外圍的 Handle 模式，便於封裝與連線。
- [ ] **AI 工作流生成機制：節點庫查庫優先、Dummy 佔位節點與遞迴生成**：生成工作流時優先匹配現有庫，缺失者標記為 Dummy 節點並支援未來遞迴展開為子工作流。
- [ ] **社群工作流管理專區**：提供使用者專屬的「我的已發布工作流」清單，支援編輯、下架與版本管理。
- [ ] **Core 工作流審核/管理工具**：完善管理員與受信任編輯者 (trusted_editor) 的審核工作台 UI。
- [ ] **工作流公開詳情頁與 SEO**：建立公開工作流的預覽頁與分享連結。
- [ ] **內部工作流畫布編輯器**：支援在 Community Template 內部進行完整的工作流畫布編輯。

---

## 🏗️ 進行中 (In Progress)

*(目前無進行中項目)*

---

## 🧪 待測試 (Pending Test)

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
