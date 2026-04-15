根據這份對話紀錄，以下是 FPS 持續降低問題的完整分析與解決方法：

---

## FPS 持續降低問題：原因與解決方案

### 🔍 問題一：MathField 與 React 渲染週期「共振」（最主要兇手）

**根本原因**
`math-field` 是 MathLive 的 Web Component，它的 `value` setter 運算成本極高，每次被呼叫都會觸發 Shadow DOM 重新佈局（Reflow）。原本的寫法是直接在 JSX 傳入 `value={data.formula}` 或 `children={formula}`，導致 React 每次重渲染組件時都會重新呼叫 `math-field` 的 setter，即使內容根本沒有改變。

**解決方案：非受控同步模式（Uncontrolled Mode）**

1. **不再透過 JSX 傳入 `value` 或 `children`**，讓 React 對 `math-field` 的內容「失明」。
2. **改用 `ref` 手動同步**：只有在 Store 值真正改變時，才透過 `ref.current.value = ...` 設定。
3. **精細化 Store 訂閱**：改為只訂閱特定欄位字串（如 `state.nodes.find(n => n.id === id)?.data.formula`），而非整個 `data` 物件。

受影響並修復的檔案：`CalculateNode.tsx`、`GraphNode.tsx`、`SolveNode.tsx`、`FormulaSidebarArea.tsx`。

---

### 🔍 問題二：GraphNode 自我渲染迴圈（22,000 次/分鐘）

**根本原因**
使用 `useStore(useShallow(state => state.nodes.filter(...).map(...)))` 時，`useShallow` 對每次 `map` 產生的「全新陣列」判定會失效。Zustand 誤以為資料改變，不斷觸發 GraphNode 重渲染，形成死循環。Debug 面板曾顯示 GraphNode 在幾十秒內渲染了 **22,336 次**，而 Store 只更新了 15 次。

**解決方案：改用 Primitive String 訂閱**

將 `.filter().map()` 改為回傳**字串（如 ID 與數值的連結）**，讓 Zustand 做字串比對而非物件參考比對，徹底切斷渲染迴圈。

---

### 🔍 問題三：Tiptap 藥丸（Pill）訂閱整個 `nodes` 或 `edges` 陣列

**根本原因**
`TextNode` 內的 `SliderPill`、`ButtonPill`、`GatePill`、`MathPill` 每一個都訂閱了整個 `state.nodes` 或 `state.edges` 陣列。每次任何一個節點改變，所有藥丸都會重新渲染，且因為 Tiptap 的 NodeView 可能沒有正確清除舊訂閱，造成「殭屍訂閱」在合併/取出後累積。

**解決方案：精細化訂閱 + `useShallow`**

每個 Pill 只訂閱它連結的**特定節點 ID 的值**，並配合 `useShallow` 做淺比對，避免無關變動觸發重渲染。

---

### 🔍 問題四：ResizeObserver 因 callback 重建而持續重建

**根本原因**
`GraphNode` 和 `TextNode` 的 `useEffect` 依賴了 `drawGraph`、`syncHandlesFromDOM` 等 `useCallback`。這些 callback 的依賴每次改變（例如 Slider 動一下），就會導致 `ResizeObserver` 被摧毀再重建，造成大量短暫的「暴衝（Burst）」。

**解決方案：用 `useRef` 穩定 callback 引用**

將 callback 存入 `ref`，讓 Observer 只建立一次，永遠透過 ref 呼叫最新版本的 callback。

---

### 🔍 問題五：`math-field` 的 inline style 造成 React 重複呼叫 setter

**根本原因**
JSX 中的 `style={{ fontSize: '1rem', ... }}` 每次渲染都是全新的物件字面量，React 以為 style 改變了，就去呼叫 `math-field` 的 style property setter，觸發 MathLive 內部重排。

**解決方案：將 inline style 移至 CSS class**

在 `index.css` 建立 `.formula-input` 等 class，讓 React 完全不需要管 style 屬性。

---

### 🔍 問題六：`App.tsx` 的巨型 Selector 導致整頁重渲染

**根本原因**
`const { nodes, ... } = useStore()` 一次訂閱幾乎所有狀態，任何一個無關的值改變都會導致整個 Flow 組件重渲染。

**解決方案：使用 `useShallow` 拆分精細 Selector**

只訂閱真正需要的狀態，讓 App 只在必要時重繪。

---

### 🔍 問題七：合併/取出觸發 50 次渲染峰值

**根本原因**
`set()` 之後立刻同步呼叫 `evaluateGraph()`，在 React 還未完成第一次渲染批次時就強迫再次更新，造成渲染瀑布。

**解決方案：用 `requestAnimationFrame` 延遲 `evaluateGraph`**

讓 React 先完成畫面更新，下一幀再觸發計算，從 ~50 次渲染降為 ~2 次。

---

### 📋 完整修復清單

| # | 位置 | 問題 | 修復方式 |
|---|------|------|---------|
| 1 | `CalculateNode / GraphNode / SolveNode` | `math-field` 每次渲染都觸發 Reflow | 改為 Uncontrolled + `ref` 手動同步 |
| 2 | `GraphNode.tsx` | `useShallow` + `filter().map()` 造成渲染迴圈 | 改用 Primitive String 做 Zustand 訂閱 |
| 3 | `TextNode.tsx` (各 Pill) | 訂閱整個 `nodes` / `edges` 陣列 | 改為只訂閱特定 ID 的值 + `useShallow` |
| 4 | `GraphNode / TextNode` | `ResizeObserver` 隨 callback 重建 | 用 `useRef` 穩定引用，Observer 只建立一次 |
| 5 | 所有節點 | `math-field` inline style 觸發 setter | 移至 CSS class |
| 6 | `App.tsx` | 巨型 `useStore()` Selector | 改用 `useShallow` 精細訂閱 |
| 7 | `useStore.ts` | merge/eject 後立刻呼叫 `evaluateGraph` | 改為 `requestAnimationFrame` 延遲觸發 |
| 8 | `App.tsx` | Cmd+Scroll 條件包含 `ctrlKey` 攔截捏合手勢 | 改為只偵測 `e.metaKey` |
| 9 | 所有節點 | 缺少 `React.memo` | 全面加上 `React.memo` |
| 10 | `useStore.ts` | `updateNodeDimensions` 無差異檢查 | 新舊值相同時跳過更新 |