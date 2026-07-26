const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function validMonth(year: number, month: number): string {
  return year >= 1990 && year <= 2100 && month >= 1 && month <= 12
    ? `${year}-${pad2(month)}`
    : "";
}

function excelSerialDate(raw: unknown): Date | null {
  const text = String(raw ?? "").trim();
  const value =
    typeof raw === "number"
      ? raw
      : /^\d{5}(?:\.\d+)?$/.test(text)
        ? Number(text)
        : NaN;
  if (!Number.isFinite(value) || value < 20_000 || value >= 80_000) return null;
  return new Date(EXCEL_EPOCH_UTC + Math.floor(value) * DAY_MS);
}

/** 统一转换 Date / Excel 序列号；普通文本保持原样，避免隐式 Date 猜测。 */
export function businessDateText(raw: unknown): string {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return `${raw.getFullYear()}-${pad2(raw.getMonth() + 1)}-${pad2(raw.getDate())}`;
  }
  const excelDate = excelSerialDate(raw);
  if (excelDate) {
    return `${excelDate.getUTCFullYear()}-${pad2(excelDate.getUTCMonth() + 1)}-${pad2(excelDate.getUTCDate())}`;
  }
  return String(raw ?? "").trim();
}

/** 返回文本中明确出现的全部业务月份；日期范围会返回起止月份。 */
export function businessMonthsOf(raw: unknown): string[] {
  if (raw instanceof Date || excelSerialDate(raw)) {
    const single = businessMonthOfSingle(raw);
    return single ? [single] : [];
  }

  const text = businessDateText(raw);
  const found: string[] = [];
  const seen = new Set<string>();
  const append = (month: string) => {
    if (month && !seen.has(month)) {
      seen.add(month);
      found.push(month);
    }
  };

  for (const match of text.matchAll(/((?:19|20)\d{2})[-/年.](\d{1,2})(?!\d)/g)) {
    append(validMonth(Number(match[1]), Number(match[2])));
  }
  if (found.length) return found;

  const compact = text.match(/^((?:19|20)\d{2})(\d{2})(?:\d{2})?$/);
  if (compact) append(validMonth(Number(compact[1]), Number(compact[2])));
  if (found.length) return found;

  const localized = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/);
  if (localized) {
    let year = Number(localized[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const first = Number(localized[1]);
    const second = Number(localized[2]);
    append(validMonth(year, first > 12 ? second : first));
  }
  return found;
}

function businessMonthOfSingle(raw: unknown): string {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return validMonth(raw.getFullYear(), raw.getMonth() + 1);
  }
  const excelDate = excelSerialDate(raw);
  return excelDate
    ? validMonth(excelDate.getUTCFullYear(), excelDate.getUTCMonth() + 1)
    : "";
}

/** 账期归属使用范围起始月；无法明确识别时返回空字符串。 */
export function businessMonthOf(raw: unknown): string {
  return businessMonthsOf(raw)[0] || "";
}

export function isSameBusinessMonth(
  raw: unknown,
  reference: Date = new Date(),
): boolean {
  const month = businessMonthOf(raw);
  const referenceMonth = validMonth(
    reference.getFullYear(),
    reference.getMonth() + 1,
  );
  return !!month && month === referenceMonth;
}
