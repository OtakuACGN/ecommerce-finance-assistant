import type { BillRecord } from "./businessLogic";
import { normalizeShopName } from "./pdd/logistics";

function billSourceKey(record: BillRecord): string {
  const platform = String(record.platform || "其他").trim().toLowerCase();
  const shop = normalizeShopName(record.shopName).toLowerCase();
  const source = String(record.sourceName || record.fileName || "")
    .trim()
    .toLowerCase();
  return `${platform}||${shop}||${source}`;
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
  const incomingKeys = new Set(
    incoming.map(billSourceKey).filter((key) => !key.endsWith("||")),
  );
  return [
    ...existing.filter((record) => !incomingKeys.has(billSourceKey(record))),
    ...incoming,
  ];
}
