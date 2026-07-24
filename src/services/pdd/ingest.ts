/**
 * 导入归类与展示文案
 */
import type { FileData } from "../../utils/excel";
import type { BillRecord, SKUMapping } from "../businessLogic";
import type {
  SourceKind,
  PddOrder,
  PddBillLine,
  ProductSku,
  AdDay,
  AdProduct,
} from "./types";
import {
  detectSourceKind,
  normalizeFileData,
  parsePddOrders,
  parsePddBillLines,
  parseProductMaster,
  billRecordFromPdd,
} from "./parse";
import { parseAdDaily, parseAdProduct } from "./ads";
import { productsToSkuMappings } from "./productMaster";

export function ingestForOperating(fileData: FileData): {
  kind: SourceKind;
  orders: PddOrder[];
  billLines: PddBillLine[];
  products: ProductSku[];
  adDays: AdDay[];
  adProducts: AdProduct[];
  billRecord?: BillRecord;
  skuMappings?: SKUMapping[];
  normalized: FileData;
} {
  const normalized = normalizeFileData(fileData);
  const kind = detectSourceKind(normalized);
  if (kind === "pdd_orders") {
    return { kind, orders: parsePddOrders(normalized), billLines: [], products: [], adDays: [], adProducts: [], normalized };
  }
  if (kind === "pdd_bill") {
    const billLines = parsePddBillLines(normalized);
    return {
      kind,
      orders: [],
      billLines,
      products: [],
      adDays: [],
      adProducts: [],
      billRecord: billRecordFromPdd(normalized, billLines),
      normalized,
    };
  }
  if (kind === "product_master") {
    const products = parseProductMaster(normalized);
    return {
      kind,
      orders: [],
      billLines: [],
      products,
      adDays: [],
      adProducts: [],
      skuMappings: productsToSkuMappings(products),
      normalized,
    };
  }
  if (kind === "ad_daily") {
    return { kind, orders: [], billLines: [], products: [], adDays: parseAdDaily(normalized), adProducts: [], normalized };
  }
  if (kind === "ad_product") {
    return {
      kind,
      orders: [],
      billLines: [],
      products: [],
      adDays: [],
      adProducts: parseAdProduct(normalized),
      normalized,
    };
  }
  return { kind: "unknown", orders: [], billLines: [], products: [], adDays: [], adProducts: [], normalized };
}

export function sourceKindLabel(kind: SourceKind): string {
  switch (kind) {
    case "pdd_orders":
      return "拼多多订单";
    case "pdd_bill":
      return "拼多多账务明细";
    case "product_master":
      return "商品资料/成本";
    case "ad_daily":
      return "推广分天数据";
    case "ad_product":
      return "商品推广汇总(按商品ID)";
    default:
      return "未知类型";
  }
}

/** 老板一页纸纯文本（复制留档） */
export function formatBossOnePagerText(
  table: any[][],
  title = "店财通 · 老板一页纸",
): string {
  const lines = [title, "=".repeat(24), `生成时间: ${new Date().toLocaleString("zh-CN")}`];
  for (let i = 1; i < (table || []).length; i++) {
    const row = table[i] || [];
    const k = String(row[0] ?? "").trim();
    const v = String(row[1] ?? "").trim();
    if (!k) continue;
    lines.push(`${k}: ${v}`);
  }
  lines.push("=".repeat(24));
  return lines.join("\n");
}

/** 合并商品资料：同规格编码优先，否则规格名/商品编码 */
