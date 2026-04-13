# Code Node DSL 說明文件 (Methmetica)

Code Node 是 Methmetica 中最強大的邏輯節點，它提供了一層接近自然語言的「混合 DSL」擴充，讓你能夠自定義節點的介面（Handle）並直接使用 JavaScript 執行複雜運算。

---

## 1. 介面宣告 (Interface Declarations)

你可以在程式碼的最上方使用宣告語法，節點會**自動即時生成**對應的連接孔 (Handles)。

### 輸入宣告 `input`
語法：`input [變數名稱] as [型別名稱]` (陣列型別請用 `[型別]`)
*   **自動解構**：宣告後，你可以在後續程式碼直接使用 `[變數名稱]`，不需透過 `inputs.x`。
*   **範例**：
    ```javascript
    input x as real
    input y as [real] // y 是一個實數陣列
    
    return x; 
    ```

### 輸出宣告 `output`
語法：`output [變數名稱] as [型別名稱]`
*   **多重輸出**：除了預設的 `Result` 輸出外，你可以定義多個命名輸出孔。
*   **賦值方式**：使用系統注入的 `outputs` 物件進行賦值。
*   **範例**：
    ```javascript
    output quotient as integer
    output remainder as integer
    
    outputs.quotient = Math.floor(a / b);
    outputs.remainder = a % b;
    ```

---

## 2. 執行環境與作用域 (Execution Scope)

### 非同步執行 (Async execution)
Code Node 預設支援 `async/await`。這意味著你可以：
*   使用 `await` 等待非同步任務。
*   **動態載入外部套件**：
    ```javascript
    const { add } = await import('https://esm.sh/mathjs');
    return add(1, 2);
    ```

### 系統注入變數 (Injected Variables)
*   `inputs`: 包含所有輸入資料的原始物件。
*   `outputs`: 用於寫入 `output` 宣告對應的資料。
*   `globals`: 唯讀物件，包含目前工作流的所有全局變數。
*   `helpers`: 系統工具箱。
    *   `helpers.setGlobal(name, value)`: 更新工作流全局變數。
    *   `helpers.getGlobal(name)`: 取得特定全局變數。

---

## 3. 安全性與隔離 (Security & Isolation)

*   **物理隔離**：所有代碼執行於 **Web Worker** 執行緒中。
*   **無 DOM 訪問**：程式碼無法造訪 `window` 或 `document`，確保安全性。
*   **超時保護**：運算若超過 **3 秒** 未回應（例如無窮迴圈），系統將自動終止該任務並報錯。

---

## 4. 最佳實踐

1.  **型別標註**：建議依照 `DATA_TYPES.md` 規範填寫（如 `[real]`, `[matrix]`, `[integer]`），這有助於未來系統進行自動類型檢查。
2.  **單一職責**：盡量讓每一個 Code Node 只處理特定的邏輯或轉換，以利工作流的維護與重用。
