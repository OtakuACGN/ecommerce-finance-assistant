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

export function cell(row: any[], idx: number): string {
  if (idx < 0) return "";
  return String(row[idx] ?? "").trim();
}

export function cellId(row: any[], idx: number): string {
  if (idx < 0) return "";
  const v = row[idx];
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number" && Number.isFinite(v)) {
    // 12~16 位商品ID 用整数串，避免 4.77e+11
    if (Math.abs(v) >= 1e11 && Math.abs(v) < 1e16 && Number.isInteger(v)) {
      return String(Math.trunc(v));
    }
    if (Number.isInteger(v)) return String(Math.trunc(v));
    // 非整数但接近整数（Excel 浮点）
    const r = Math.round(v);
    if (Math.abs(v - r) < 1e-6 && Math.abs(r) >= 1e10) return String(r);
    return String(v);
  }
  let s = String(v).trim().replace(/,/g, "");
  if (/e\+?\d+/i.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n) && Math.abs(n) >= 1e10) return String(Math.round(n));
  }
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, "");
  return s;
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
