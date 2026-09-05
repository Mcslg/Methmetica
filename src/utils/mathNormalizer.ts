import { getMathEngine } from './MathEngine';

/**
 * 常見希臘字母變數集合（應被視為可輸入的數學變數，如 theta, alpha, omega 等）
 */
export const GREEK_VARIABLES = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'Delta', 'theta', 'lambda',
  'mu', 'nu', 'xi', 'pi_var', 'rho', 'sigma', 'tau', 'phi', 'chi', 'psi', 'omega',
  'Alpha', 'Beta', 'Gamma', 'Theta', 'Lambda', 'Sigma', 'Phi', 'Psi', 'Omega'
]);

/**
 * 標準 LaTeX 數學運算子與指令集合（不包含可作為未知數的希臘字母）
 */
export const LATEX_COMMANDS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
  'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh',
  'sqrt', 'log', 'ln', 'exp', 'pi', 'abs', 'det',
  'frac', 'cdot', 'times', 'div', 'pm', 'mp', 'partial',
  'left', 'right', 'int', 'sum', 'prod', 'lim', 'infty',
  'mathbf', 'mathrm', 'mathit', 'text',
  ...GREEK_VARIABLES,
]);

/**
 * 數學常數與排除名單（在變數提取時不應被視為使用者輸入未知數；排除純函數與 pi/e/i 等常數，但允許其他希臘字母作為變數）
 */
export const MATH_CONSTANTS_AND_EXCLUDES = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
  'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh',
  'sqrt', 'log', 'ln', 'exp', 'abs', 'det',
  'frac', 'cdot', 'times', 'div', 'pm', 'mp', 'partial',
  'left', 'right', 'int', 'sum', 'prod', 'lim', 'infty',
  'mathbf', 'mathrm', 'mathit', 'text',
  'pi', 'PI', 'e', 'E', 'i', 'I', 'infty'
]);

/**
 * 展開公式中的隱式乘法（Implicit Multiplication）並正規化為標準 LaTeX
 * 例如：
 * - 數字緊接字母: 4a -> 4 \cdot a
 * - 相鄰單字母相乘: ac -> a \cdot c, 4ac -> 4 \cdot a \cdot c
 * - 括號相鄰乘法: 4a(b+c) -> 4 \cdot a \cdot (b+c), (a)(b) -> (a) \cdot (b)
 * - 常見函數補齊反斜線: sin -> \sin, pi -> \pi
 */
export function expandImplicitMultiplication(formula: string): string {
  if (!formula || typeof formula !== 'string') return '';

  let clean = formula
    .replace(/^(\$\$?)|(\$\$?)$/g, '')
    .replace(/^\\\(|\\\)$/g, '')
    .trim();

  if (!clean) return '';

  // 1. 補齊常見無反斜線數學函數前綴 (如 sin -> \sin, pi -> \pi)
  clean = clean.replace(/(?<!\\)\b(sin|cos|tan|cot|sec|csc|sqrt|log|ln|exp|pi)\b/g, '\\$1');

  // 2. 將程式碼乘號 * 統一轉為標準數學點乘 \cdot
  clean = clean.replace(/\s*\*\s*/g, ' \\cdot ');

  // 3. 數字緊接英文字母: 4a -> 4 \cdot a
  clean = clean.replace(/(\d)\s*([a-zA-Z])/g, '$1 \\cdot $2');

  // 4. \pi 緊接英文字母: \pi r -> \pi \cdot r
  clean = clean.replace(/\\(pi|PI)\s*([a-zA-Z])/g, '\\$1 \\cdot $2');

  // 5. 拆解相鄰單字母隱式乘法 (如 ac -> a \cdot c，但排除 \sin 等 LaTeX 指令)
  clean = clean.replace(/(?<!\\[a-zA-Z]*)([a-zA-Z])(?=[a-zA-Z])/g, (_match, letter, offset, full) => {
    const prefix = full.slice(0, offset + 1);
    const lastSlash = prefix.lastIndexOf('\\');
    if (lastSlash !== -1) {
      const candidate = prefix.slice(lastSlash + 1);
      if (/^[a-zA-Z]+$/.test(candidate) && LATEX_COMMANDS.has(candidate.toLowerCase())) {
        return letter;
      }
    }
    return `${letter} \\cdot `;
  });

  // 6. 字母或數字緊接左括號: 4( -> 4 \cdot (, a( -> a \cdot ( (排除已知函數如 \sin() )
  clean = clean.replace(/(?<!\\[a-zA-Z]*)([a-zA-Z\d])\s*\(/g, (match, p1, offset, full) => {
    const prefix = full.slice(0, offset + 1);
    const lastSlash = prefix.lastIndexOf('\\');
    if (lastSlash !== -1) {
      const candidate = prefix.slice(lastSlash + 1);
      if (/^[a-zA-Z]+$/.test(candidate) && LATEX_COMMANDS.has(candidate.toLowerCase())) {
        return match;
      }
    }
    return `${p1} \\cdot (`;
  });

  // 7. 右括號緊接字母、數字或左括號: )( -> ) \cdot (, )a -> ) \cdot a
  clean = clean.replace(/\)\s*([a-zA-Z\d(])/g, ') \\cdot $1');

  // 8. 清理多餘連續的 \cdot
  clean = clean.replace(/(\\cdot\s*)+/g, '\\cdot ');

  return clean.trim();
}

/**
 * 標準化 LaTeX 算式字串
 */
export function normalizeLatexFormula(formula: string): string {
  return expandImplicitMultiplication(formula);
}

/**
 * 從數學算式中精準提取未知數變數清單
 * 同時支援 CortexJS ComputeEngine 語意解析與防禦性正則雙重容錯，杜絕多字母相鄰（如 ac）被判為單一變數。
 */
export function extractFormulaVariables(formula: string): string[] {
  if (!formula || typeof formula !== 'string' || !formula.trim()) return [];

  const clean = normalizeLatexFormula(formula);
  if (!clean) return [];

  const ceVars = new Set<string>();

  // 1. 優先使用 ComputeEngine 語法樹抽取符號與 unknowns
  try {
    const ce = getMathEngine();
    const expr = ce.parse(clean);
    if (expr.unknowns && expr.unknowns.length > 0) {
      expr.unknowns.forEach((u: string) => ceVars.add(u));
    }
  } catch {
    // 忽略語法樹 parse 異常，進入正則保底
  }

  // 2. 正則比對保底（防範如 \pm 或不完整 LaTeX 語法遭 ComputeEngine 截斷）
  const matches = clean.match(/[a-zA-Z]+/g) || [];
  const regexVars = matches.filter((m) => {
    return !MATH_CONSTANTS_AND_EXCLUDES.has(m) && !MATH_CONSTANTS_AND_EXCLUDES.has(m.toLowerCase());
  });

  const allVars = new Set<string>([...ceVars, ...regexVars]);

  // 3. 按照變數在公式中首次出現的順序排序（避免子字串如 \cdot 誤匹配）
  const sortedVars = Array.from(allVars).sort((a, b) => {
    const getIndex = (varName: string) => {
      const match = clean.match(new RegExp(`(?<!\\\\[a-zA-Z]*)\\b${varName}\\b`));
      return match && match.index !== undefined ? match.index : 9999;
    };
    return getIndex(a) - getIndex(b);
  });

  return sortedVars;
}

/**
 * 將 LaTeX 算式轉為 Nerdamer 符號計算引擎友善字串
 * （將隱式相乘與 \cdot 轉譯為 *，支援代入運算）
 */
export function latexToNerdamer(formula: string): string {
  if (!formula || typeof formula !== 'string') return '';

  const expanded = normalizeLatexFormula(formula);

  return expanded
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\left\(/g, '(')
    .replace(/\\right\)/g, ')')
    .replace(/\\sin/g, 'sin')
    .replace(/\\cos/g, 'cos')
    .replace(/\\tan/g, 'tan')
    .replace(/\\ln/g, 'log')
    .replace(/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)')
    .replace(/\\cdot/g, '*')
    .replace(/\{/g, '(')
    .replace(/\}/g, ')')
    .replace(/\\/g, '')
    .trim();
}
