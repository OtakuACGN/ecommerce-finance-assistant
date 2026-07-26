/**
 * 统一业务编号入口。文本编号原样保留前导零；一旦 Excel 已将编号转成
 * 不安全数字或科学计数法，原始位数不可恢复，必须阻断而不是猜测。
 */
export function normalizeIdentifier(
  raw: unknown,
  label = "编号",
  compactWhitespace = false,
): string {
  if (raw === null || raw === undefined || raw === "") return "";

  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return "";
    if (!Number.isInteger(raw) || !Number.isSafeInteger(raw)) {
      throw new Error(
        `${label}已被 Excel 转为不安全数字，无法保证精度；请将该列设为文本格式后重新导出`,
      );
    }
    return String(raw);
  }

  let text = String(raw).trim();
  if (compactWhitespace) text = text.replace(/\s+/g, "");
  if (/^[+-]?\d+(?:\.\d+)?e[+-]?\d+$/i.test(text)) {
    throw new Error(
      `${label}已被 Excel 转为科学计数法，无法恢复原始位数；请将该列设为文本格式后重新导出`,
    );
  }
  if (/^\d{1,3}(?:,\d{3})+(?:\.0+)?$/.test(text)) {
    text = text.replace(/,/g, "");
  }
  return text.replace(/^(\d+)\.0+$/, "$1");
}
