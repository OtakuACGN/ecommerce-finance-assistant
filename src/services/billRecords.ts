import type { BillRecord } from "./businessLogic";
import { normalizeShopName } from "./pdd/logistics";
import { businessMonthOf } from "./businessPeriod";

function billScopeKey(record: BillRecord): string {
  const platform = String(record.platform || "其他").trim().toLowerCase();
  const shop = normalizeShopName(record.shopName).toLowerCase();
  return `${platform}||${shop}`;
}

function billNamePeriodKey(record: BillRecord): string {
  const source = String(record.sourceName || record.fileName || "")
    .trim()
    .toLowerCase();
  const period = businessMonthOf(record.date);
  return `${billScopeKey(record)}||${source}||${period}`;
}

function isSameImportSource(
  existing: BillRecord,
  incoming: BillRecord,
): boolean {
  const incomingFingerprint = String(incoming.sourceFingerprint || "").trim();
  const existingFingerprint = String(existing.sourceFingerprint || "").trim();
  if (
    incomingFingerprint &&
    existingFingerprint &&
    incomingFingerprint === existingFingerprint
  ) {
    return true;
  }
  if (billScopeKey(existing) !== billScopeKey(incoming)) return false;

  const existingKey = billNamePeriodKey(existing);
  const incomingKey = billNamePeriodKey(incoming);
  const existingPeriod = businessMonthOf(existing.date);
  const incomingPeriod = businessMonthOf(incoming.date);
  if (existingPeriod && incomingPeriod) return existingKey === incomingKey;

  const existingName = String(existing.sourceName || existing.fileName || "")
    .trim()
    .toLowerCase();
  const incomingName = String(incoming.sourceName || incoming.fileName || "")
    .trim()
    .toLowerCase();
  return !!incomingName && existingName === incomingName;
}

/**
 * 同一平台、店铺、来源文件重导时替换旧记录，防止月度汇总重复记账。
 */
export function replaceBillRecordSource(
  existing: BillRecord[],
  incoming: BillRecord,
): BillRecord[] {
  return replaceBillRecordSources(existing, [incoming]);
}

/** 同一来源拆成多个月份记录时，整批原子替换，避免重导后重复或只剩最后一月。 */
export function replaceBillRecordSources(
  existing: BillRecord[],
  incoming: BillRecord[],
): BillRecord[] {
  if (incoming.length === 0) return existing;
  return [
    ...existing.filter(
      (record) => !incoming.some((item) => isSameImportSource(record, item)),
    ),
    ...incoming,
  ];
}
