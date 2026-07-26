import { normalizeIdentifier } from "../../utils/identifier";

/** 内部匹配键 */
export function normMatchKey(s: string): string {
  return String(s ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/[\u00a0\u3000]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function toNum(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = parseFloat(String(v).replace(/[¥￥$,，\s]/g, "").replace(/%/g, ""));
  return isNaN(n) ? 0 : n;
}

/** 经营报表统一以“分”为最小展示精度，避免大量小数直接相加产生浮点尾差。 */
export function roundMoney(value: number): number {
  const amount = Number.isFinite(value) ? value : 0;
  const adjusted =
    amount + Math.sign(amount || 1) * Number.EPSILON;
  return Math.round(adjusted * 100) / 100;
}

export function addMoney(left: number, right: number): number {
  return roundMoney(left + right);
}

export function sumMoney(values: Iterable<number>): number {
  let cents = 0;
  for (const value of values) {
    cents += Math.round(
      (Number(value) + Math.sign(Number(value) || 1) * Number.EPSILON) * 100,
    );
  }
  return cents / 100;
}

export function cell(row: any[], idx: number): string {
  if (idx < 0) return "";
  return String(row[idx] ?? "").trim();
}

export function cellId(row: any[], idx: number, label = "编号"): string {
  if (idx < 0) return "";
  return normalizeIdentifier(row[idx], label);
}

export function findColExactThen(headers: string[], keywords: string[]): number {
  const raw = headers.map((h) => String(h ?? "").trim());
  const lower = raw.map((h) => h.toLowerCase());
  for (const kw of keywords) {
    const k = kw.toLowerCase();
    const exact = lower.findIndex((h) => h === k);
    if (exact >= 0) return exact;
  }
  for (const kw of keywords) {
    const k = kw.toLowerCase();
    const idx = lower.findIndex((h) => h.includes(k));
    if (idx >= 0) return idx;
  }
  return -1;
}

export function isAdDailyDate(date: string): boolean {

  const s = String(date || "").trim();
  if (!s) return false;
  if (/合计|总计|汇总|小计|平均|全部|全年|本月|上月|total|sum|avg/i.test(s)) return false;
  // 接受 2026-06-01 / 2026/6/1 / 6/1/26 / 2026年6月1日
  if (/\d{4}\s*[-/年.]\s*\d{1,2}/.test(s)) return true;
  if (/^\d{1,2}[\/-]\d{1,2}([\/-]\d{2,4})?/.test(s)) return true;
  if (/^\d{8}$/.test(s)) return true;
  return false;
}

export function cellTime(row: any[], idx: number): string {
  if (idx < 0) return "";
  const v = row[idx];
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())} ${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}`;
  }
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const utc = Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000;
    const d = new Date(utc);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  }
  return String(v).trim();
}
