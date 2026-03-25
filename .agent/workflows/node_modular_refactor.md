---
description: 節點模組化合併與彈射實作標準 (Node Modular Merge & Ejection Standard)
---

## 📌 實作目的
確保所有節點在「合併」與「彈射」時，具備統一的物理手感、計算連動以及 UI 極簡化邏輯。

## 🛠 實作清單

### 1. 容器節點架構 (Container Nodes)
- **必須使用 NodeFrame**：所有功能型容器必須包裹在 `src/components/NodeFrame.tsx` 中。
- **功能連動**：NodeFrame 會自動注入 `CommentArea` 與 `SlotTray`。
- **內容擴展**：若有畫布渲染需求（如 GraphNode），需透過 `contentStyle` 傳遞 CSS，確保內容全滿。

### 2. 計算引擎協議 (Calculation Protocol)
- **變數優先權**：在 `CalculationService.ts` 中，解析變項名稱的優先順序為：
    1. `Edges` (實體連線)
    2. `node.data.slots` (合併節點插槽)
    3. `Global Text Variables` (全域變項)
- **自動重算邏輯**：
    - 若容器節點含有滑桿 (Slider)，數值變動時應自動觸發 `executeNode`。
    - 若容器節點合併了按鈕 (ButtonNode)，滑桿動作則**不自動執行**，改為手動鎖定。

### 3. 物理彈射動畫 (Ejection Physics)
- **虛線渲染 (Ghost Line)**：彈射時不可使用原生 HTML Drag&Drop，必須透過 `useStore.setDraggingEjectPos` 驅動全局 SVG 虛線。
- **指針事件 (Pointer Events)**：
    - 在對標籤/按鈕進行 `Cmd/Ctrl + Drag` 時，必須攔截 `onPointerDown`。
    - 在移動過程中同步游標位置到 Store。
    - 在放手 (onPointerUp) 時計算移動距離，若大於 5px 則觸發 `handleGenericEject` 彈射。

### 4. UI 淨化原則 (UI Cleaning)
- **Handle 過濾**：節點左側的輸入圓圈 (Handle) 必須根據 `data.slots` 的內容動態顯示。
- **規則**：若 `handle.label` 與任何一個 `slotKey` (如 'x') 重合，該 Handle 必須自動過濾消失。

### 5. 文內嵌入組件 (Inline Pills in TextNode)
- Tiptap 核心中的 Slider、Button、Gate 等膠囊組件，其彈射邏輯必須與 NodeFrame 保持完全一致，共享一套物理指標追蹤機制。

## 🧪 驗證標準
1. 按住 Cmd 並拉動合併元件，是否出現藍色發光虛線？
2. 元件拉出後，原本隱藏的 Handle 是否正確重現？
3. 滑桿拉動時，容器計算數值是否即時連動？
4. 當合併按鈕時，自動連動是否正確鎖定？
