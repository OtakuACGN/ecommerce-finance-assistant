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
  const incomingKey = billSourceKey(incoming);
  if (!incomingKey.endsWith("||")) {
    return [
      ...existing.filter((record) => billSourceKey(record) !== incomingKey),
      incoming,
    ];
  }
  return [...existing, incoming];
}
