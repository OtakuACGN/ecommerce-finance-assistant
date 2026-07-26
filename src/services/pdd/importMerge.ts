/**
 * 导入集合合并：同一店铺、同一来源文件重导时替换旧流水，避免重复记账。
 */
import type { AdDay, PddBillLine } from "./types";
import { normalizeShopName } from "./logistics";
import { businessMonthOf } from "../businessPeriod";

export function replaceImportedBillSource(
  existing: PddBillLine[],
  incoming: PddBillLine[],
  shopName: string,
  sourceName: string,
  sourceFingerprint = "",
): PddBillLine[] {
  const shop = normalizeShopName(shopName);
  const source = String(sourceName || "").trim();
  const sourceKey = source.toLocaleLowerCase();
  const fingerprint = String(sourceFingerprint || "").trim();
  const incomingPeriods = new Set(
    incoming.map((line) => businessMonthOf(line.time)).filter(Boolean),
  );
  const kept = existing.filter((line) => {
    const existingFingerprint = String(line.sourceFingerprint || "").trim();
    if (fingerprint && existingFingerprint === fingerprint) return false;
    if (normalizeShopName(line.shopName) !== shop) return true;
    if (
      !source ||
      String(line.sourceName || "").trim().toLocaleLowerCase() !== sourceKey
    ) {
      return true;
    }
    const existingPeriod = businessMonthOf(line.time);
    return !!existingPeriod &&
      incomingPeriods.size > 0 &&
      !incomingPeriods.has(existingPeriod);
  });
  return [
    ...kept,
    ...incoming.map((line) => ({
      ...line,
      shopName: shop,
      sourceName: source,
      sourceFingerprint: fingerprint,
    })),
  ];
}

/**
 * 推广日报允许同一店铺导入多个日期文件；只替换同名来源。
 * 保留来源粒度能避免重导重复，同时不会误删同店铺的其他月份/分段文件。
 */
export function replaceImportedAdDailySource(
  existing: AdDay[],
  incoming: AdDay[],
  shopName: string,
  sourceName: string,
): AdDay[] {
  const shop = normalizeShopName(shopName);
  const source = String(sourceName || "").trim();
  const sourceKey = source.toLocaleLowerCase();
  const incomingDateKeys = new Set(
    incoming.map((day) => `${shop}||${String(day.date || "").trim()}`),
  );
  const kept = existing.filter((day) => {
    const sameSource =
      !!source &&
      normalizeShopName(day.shopName) === shop &&
      String(day.sourceName || "").trim().toLocaleLowerCase() === sourceKey;
    const overwrittenDate = incomingDateKeys.has(
      `${normalizeShopName(day.shopName)}||${String(day.date || "").trim()}`,
    );
    // 同来源重导整批替换；不同来源日期重叠时以后导入者为准，避免双算。
    return !sameSource && !overwrittenDate;
  });
  return [
    ...kept,
    ...incoming.map((day) => ({
      ...day,
      shopName: shop,
      sourceName: source,
    })),
  ];
}
