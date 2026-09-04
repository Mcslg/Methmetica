/**
 * Code Runner Worker
 * 負責在隔離環境中執行使用者提供的 JavaScript
 */

self.onmessage = async (e: MessageEvent) => {
    const { requestId, code, inputs, typedInputs, globals, outputDeclarations } = e.data;

    // 模擬 helpers
    const customOutputs: Record<string, unknown> = {};
    const globalUpdates: Record<string, string> = {};

    // [NEW] 自動拆箱 (Unboxing): 如果輸入是 {type, value} 格式，自動提取 value
    const unboxedInputs: Record<string, unknown> = {};
    Object.entries(inputs || {}).forEach(([key, val]) => {
        if (val && typeof val === 'object' && 'type' in val && 'value' in val) {
            unboxedInputs[key] = (val as { value: unknown }).value;
        } else {
            unboxedInputs[key] = val;
        }
    });
    Object.entries(typedInputs || {}).forEach(([key, val]) => {
        if (val && typeof val === 'object' && 'type' in val && 'value' in val) {
            unboxedInputs[key] = (val as { value: unknown }).value;
        }
    });

    const stringifyOutput = (value: unknown): string => {
        if (value === undefined) return '';
        // 如果已經是字串，直接回傳
        if (typeof value === 'string') return value;
        try {
            return JSON.stringify(value, null, 2);
        } catch {
            return String(value);
        }
    };

    const helpers = {
        setGlobal: (name: string, value: unknown) => {
            const normalizedName = name.startsWith('$') ? name : `$${name}`;
            const storedValue = stringifyOutput(value);
            globalUpdates[normalizedName] = storedValue;
            return value;
        },
        getGlobal: (name: string) => {
            const normalizedName = name.startsWith('$') ? name : `$${name}`;
            return globals[normalizedName] ?? globals[normalizedName.slice(1)];
        },
        stringify: stringifyOutput,
        // [NEW] 允許使用者獲取原始包裝數據
        getRawInput: (name: string) => typedInputs?.[name] ?? inputs[name]
    };

    try {
        // 將 executor 改為 AsyncFunction 的形式
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        const executor = new AsyncFunction(
            'inputs',
            'typedInputs',
            'outputs',
            'globals',
            'helpers',
            `"use strict";\n${code}`
        );

        // 使用 await 執行結果 (傳入的是拆箱後的資料)
        let rawResult = await executor(unboxedInputs, typedInputs || {}, customOutputs, globals, helpers);

        if (rawResult === undefined) {
            const outputKeys = Object.keys(customOutputs);
            if (outputKeys.length === 1) {
                rawResult = customOutputs[outputKeys[0]];
            }
        }

        // [NEW] 自動裝箱 (Boxing): 根據宣告將結果包裝回 MathValue
        const boxValue = (val: unknown, name: string) => {
            const declaredTypes = outputDeclarations?.[name];
            const type = Array.isArray(declaredTypes) ? (declaredTypes[0] || 'unknown') : (declaredTypes || 'unknown');
            return {
                type,
                value: val,
                meta: { source: 'CodeNode', declaredTypes }
            };
        };

        const boxedResult = boxValue(rawResult, 'return');
        const boxedOutputs: Record<string, unknown> = {};
        Object.keys(customOutputs).forEach(key => {
            boxedOutputs[key] = boxValue(customOutputs[key], key);
        });

        self.postMessage({
            requestId,
            type: 'success',
            result: boxedResult,
            outputs: boxedOutputs,
            globalUpdates
        });
    } catch (error) {
        self.postMessage({
            requestId,
            type: 'error',
            error: error instanceof Error ? error.message : String(error)
        });
    }
};
