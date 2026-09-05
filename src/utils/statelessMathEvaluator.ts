import { getMathEngine } from './MathEngine';
import { normalizeLatexFormula, extractFormulaVariables } from './mathNormalizer';

/**
 * 無狀態數學表達式求值：
 * 接收 LaTeX/算式字串與變數鍵值映射，使用 ComputeEngine 進行變數代入與求值。
 * 若求值失敗或遇到錯誤則拋出 Error。
 */
export function evaluateMathExpression(
  rawFormula: string,
  variables: Record<string, string | number>
): string {
  if (!rawFormula || !rawFormula.trim()) {
    throw new Error('算式為空，無法求值。');
  }

  const formula = normalizeLatexFormula(rawFormula);
  const ce = getMathEngine();

  ce.pushScope();
  try {
    // 取得算式中所需的變數清單
    const requiredVars = extractFormulaVariables(formula);

    for (const v of requiredVars) {
      // 支援普通變數與前綴變數 (如 h-in-x -> x)
      let val = variables[v];
      if (val === undefined) {
        val = variables[`h-in-${v}`];
      }

      if (val !== undefined && String(val).trim() !== '') {
        const parsedVal = ce.parse(String(val));
        ce.assign(v, parsedVal);
      }
    }

    const expr = ce.parse(formula);
    const evaluated = expr.evaluate();

    const result = evaluated.latex || evaluated.toString();
    if (!result || result === 'undefined') {
      throw new Error(`算式 "${rawFormula}" 求值結果未定義。`);
    }

    return result;
  } finally {
    ce.popScope();
  }
}
