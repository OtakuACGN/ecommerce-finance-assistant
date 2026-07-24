import type { PddOrder, PddBillLine } from "../services/pddBusiness";

/** 从订单/账务推断账期展示文案 */
export function formatOpOrdersPeriod(orders: PddOrder[]): string {
  const times = orders
    .map((o) => String(o.dealTime || o.shipTime || "").trim())
    .filter(Boolean)
    .map((t) => t.slice(0, 10))
    .filter((t) => /^\d{4}-\d{2}-\d{2}/.test(t))
    .sort();
  if (!times.length) return "未识别账期";
  const a = times[0];
  const b = times[times.length - 1];
  return a === b ? a : `${a} ~ ${b}`;
}

export function formatOpBillPeriod(lines: PddBillLine[]): string {
  const times = lines
    .map((l) => String(l.time || "").trim())
    .filter(Boolean)
    .map((t) => t.slice(0, 10))
    .filter((t) => /^\d{4}-\d{2}-\d{2}/.test(t))
    .sort();
  if (!times.length) return "未识别账期";
  const a = times[0];
  const b = times[times.length - 1];
  return a === b ? a : `${a} ~ ${b}`;
}

export function uniqueShopNames(orders: PddOrder[], limit = 4): string[] {
  const set = new Set<string>();
  for (const o of orders) {
    const n = String(o.shopName || "").trim();
    if (n) set.add(n);
  }
  return Array.from(set).slice(0, limit);
}

export function sumMerchantReceived(orders: PddOrder[]): number {
  return orders.reduce((s, o) => s + (o.merchantReceived || 0), 0);
}
