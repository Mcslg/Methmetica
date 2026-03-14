# Methmetica v0.1.0 🧪

**Methmetica** 是一款基於節點（Node-based）的模組化數學運算工具。透過視覺化的連線，使用者可以自由串接數據與運算邏輯，並實現動態、可手動觸發的數學模型。

![GitHub repository](https://img.shields.io/badge/Status-Development-orange)
![Version](https://img.shields.io/badge/Version-0.1.0-blue)

## ✨ 特色功能

- **動態幾何 Handle**: 可以在節點邊緣任何位置點擊右鍵新增輸入/輸出點。
- **徑向輪盤選單 (Radial Menu)**: 點擊 Handle 擴展區即可彈出優雅的環形選單來選擇點位類型。
- **手動執行邏輯**: 工具型節點包含 `EXEC` 按鈕，點擊後才觸發計算，符合流程控制邏輯。
- **符號運算與無理數 (開發中)**: 整合 MathLive、Nerdamer 與 KaTeX，目標實現 $\sqrt{2}, \pi$ 等精確符號運算。
- **極簡玻璃美學**: 區分數據型（Data）與工具型（Tool）節點，具備科技感的懸浮與發光效果。

## 🚀 快速開始

### 安裝依賴
```bash
npm install
```

### 開啟開發伺服器
```bash
npm run dev
```

## ⌨️ 操作指南
- **新增節點**: 在畫布空白處點擊「右鍵」。
- **新增 Handle**: 在節點邊緣的「十字準心」區域點擊「右鍵」。
- **刪除節點**: 在節點本體上點擊「右鍵」。
- **刪除 Handle**: 直接「左鍵單擊」該 Handle。

---
Vibe-coded by Mcslg
