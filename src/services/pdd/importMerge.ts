/**
 * 导入集合合并：同一店铺、同一来源文件重导时替换旧流水，避免重复记账。
 */
import type { PddBillLine } from "./types";
import { normalizeShopName } from "./logistics";

export function replaceImportedBillSource(
  existing: PddBillLine[],
  incoming: PddBillLine[],
  shopName: string,
  sourceName: string,
): PddBillLine[] {
  const shop = normalizeShopName(shopName);
  const source = String(sourceName || "").trim();
  const sourceKey = source.toLocaleLowerCase();
  const kept = existing.filter((line) => {
    if (!source) return true;
    return !(
      normalizeShopName(line.shopName) === shop &&
      String(line.sourceName || "").trim().toLocaleLowerCase() === sourceKey
    );
  });
  return [
    ...kept,
    ...incoming.map((line) => ({
      ...line,
      shopName: shop,
      sourceName: source,
    })),
  ];
}
