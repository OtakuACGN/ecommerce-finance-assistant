/**
 * SKU 映射应用 / 收款对账结果摘要：纯函数
 */
import type { SKUMapping } from "./businessLogic";
import type { PddOrder, ProductSku } from "./pddBusiness";
import {
  ordersToTable,
  productsToSkuMappings,
  reconcileOrderPayments,
} from "./pddBusiness";
import type { FileData } from "../utils/excel";

export function applySkuMappingsToTable(
  source: any[][],
  skuMappings: SKUMapping[],
): any[][] {
  if (!source.length) return [];
  const headers = source[0] || [];
  const dataRows = source.slice(1);
  const mappedRows = dataRows.map((row) => {
    const newRow = [...row];
    for (let i = 0; i < newRow.length; i++) {
      const cell = String(newRow[i] || "").trim();
      const mapping = skuMappings.find((m) => m.platformName === cell);
      if (mapping && !newRow.includes(mapping.internalCode)) {
        newRow.push(mapping.internalCode);
      }
    }
    return newRow;
  });
  return [[...headers, "内部编码"], ...mappedRows];
}

export function resolveMappingSourceTable(
  opOrders: PddOrder[],
  currentData: any[][],
): { table: any[][]; sourceLabel: string } | null {
  if (opOrders.length > 0) {
    return { table: ordersToTable(opOrders), sourceLabel: "经营分析订单" };
  }
  if (currentData.length > 0) {
    return { table: currentData, sourceLabel: "当前表格" };
  }
  return null;
}

export function buildMappingFileFromProducts(products: ProductSku[]): FileData {
  const maps = productsToSkuMappings(products);
  return {
    name: "来自经营分析商品资料",
    path: "",
    headers: ["平台品名", "内部编码", "成本"],
    data: [
      ["平台品名", "内部编码", "成本"],
      ...maps.map((m) => [m.platformName, m.internalCode, m.price]),
    ],
  };
}

export function summarizeReconcile(reconciled: any[][]): {
  matched: number;
  unmatched: number;
  unclaimed: number;
  byId: number;
} {
  const statusOf = (r: any[]) => String(r[5] ?? r[4] ?? "");
  const matched = reconciled.filter(
    (r) => statusOf(r) === "已核销" || statusOf(r) === "差额核销",
  ).length;
  const unmatched = reconciled.filter((r) => statusOf(r) === "未匹配").length;
  const unclaimed = reconciled.filter((r) => statusOf(r) === "未认领").length;
  const byId = reconciled.filter(
    (r) =>
      String(r[6] ?? "") === "订单号" || String(r[6] ?? "") === "备注含单号",
  ).length;
  return { matched, unmatched, unclaimed, byId };
}

export function runPaymentReconcile(
  orderTable: any[][],
  paymentData: any[][],
): any[][] {
  return reconcileOrderPayments(orderTable, paymentData);
}
