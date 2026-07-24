/**
 * 商品资料：生成/导出/合并/SKU映射
 */
import type { SKUMapping } from "../businessLogic";
import type { PddOrder, ProductSku } from "./types";
import { normMatchKey } from "./helpers";
import { buildProductIndexes } from "./logistics";

export function productsToSkuMappings(products: ProductSku[]): SKUMapping[] {
  const out: SKUMapping[] = [];
  const seen = new Set<string>();
  for (const p of products) {
    const unitCost = p.costPrice + p.packCost;
    const keys = [p.specName, p.skuCode, p.productName, p.productCode].filter(Boolean);
    for (const k of keys) {
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({
        platformName: k,
        internalCode: p.skuCode || p.productCode || k,
        price: unitCost,
      });
    }
  }
  return out;
}

/** 从订单去重后生成的商品资料行（可回填成本后导入） */
export interface GeneratedProductRow extends ProductSku {
  dedupeKey: string;
  productId: string;
  orderCount: number;
  qtyTotal: number;
  receivedTotal: number;
  avgUnitPrice: number;
  hasCost: boolean;
  costSource: string;
  sampleOrderIds: string;
}

export type ProductMasterBuildMode = "all" | "missing_cost";

function productDedupeKey(order: PddOrder): string {
  if (order.merchantSku) return `sku:${order.merchantSku}`;
  if (order.merchantSpu && order.specName) return `spu-spec:${order.merchantSpu}|${order.specName}`;
  if (order.productId && order.specName) return `id-spec:${order.productId}|${order.specName}`;
  if (order.productName && order.specName) return `name-spec:${order.productName}|${order.specName}`;
  if (order.merchantSpu) return `spu:${order.merchantSpu}`;
  if (order.productId) return `id:${order.productId}`;
  if (order.productName) return `name:${order.productName}`;
  return `order:${order.orderId}`;
}

function findExistingProduct(
  order: PddOrder,
  indexes: ReturnType<typeof buildProductIndexes>,
): { product: ProductSku; by: string } | null {
  const sku = normMatchKey(order.merchantSku);
  const spu = normMatchKey(order.merchantSpu);
  const spec = normMatchKey(order.specName);
  const name = normMatchKey(order.productName);
  const productId = normMatchKey(order.productId);
  if (sku && indexes.bySku.has(sku)) {
    return { product: indexes.bySku.get(sku)!, by: "规格编码" };
  }
  if (name && spec && indexes.byNameSpec.has(`${name}||${spec}`)) {
    return { product: indexes.byNameSpec.get(`${name}||${spec}`)!, by: "品名+规格" };
  }
  if (spec && indexes.bySpec.has(spec)) {
    return { product: indexes.bySpec.get(spec)!, by: "规格名称" };
  }
  if (spu && indexes.bySpu.has(spu)) {
    return { product: indexes.bySpu.get(spu)!, by: "商品编码" };
  }
  if (productId && indexes.bySku.has(productId)) {
    return { product: indexes.bySku.get(productId)!, by: "商品ID" };
  }
  if (productId && indexes.bySpu.has(productId)) {
    return { product: indexes.bySpu.get(productId)!, by: "商品ID" };
  }
  if (name && indexes.byName.has(name)) {
    return { product: indexes.byName.get(name)!, by: "商品名称" };
  }
  return null;
}

/**
 * 从订单去重生成商品资料。
 * - 优先用商家编码-规格 作为规格编码
 * - 若已导入商品资料，自动带上已有成本/重量/包材
 * - mode=missing_cost 仅输出无成本（成本+包材=0）的规格
 */
export function buildProductMasterFromOrders(
  orders: PddOrder[],
  existing: ProductSku[] = [],
  mode: ProductMasterBuildMode = "all",
): GeneratedProductRow[] {
  const indexes = buildProductIndexes(existing);
  type Agg = {
    key: string;
    productCode: string;
    productName: string;
    skuCode: string;
    specName: string;
    productId: string;
    orderCount: number;
    qtyTotal: number;
    receivedTotal: number;
    goodsTotal: number;
    sampleIds: string[];
    costPrice: number;
    packCost: number;
    weightKg: number;
    salePrice: number;
    stock: number;
    costSource: string;
  };
  const map = new Map<string, Agg>();

  for (const o of orders) {
    if (!o.orderId) continue;
    const key = productDedupeKey(o);
    let row = map.get(key);
    if (!row) {
      const hit = findExistingProduct(o, indexes);
      const productCode = o.merchantSpu || hit?.product.productCode || o.productId || "";
      const specName = o.specName || hit?.product.specName || "";
      // 无规格编码时，用订单「商品规格」填充规格编码，方便回填成本与再导入匹配
      const skuCode =
        o.merchantSku ||
        hit?.product.skuCode ||
        specName ||
        "";
      const productName = o.productName || hit?.product.productName || "";
      row = {
        key,
        productCode,
        productName,
        skuCode,
        specName,
        productId: o.productId || "",
        orderCount: 0,
        qtyTotal: 0,
        receivedTotal: 0,
        goodsTotal: 0,
        sampleIds: [],
        costPrice: hit?.product.costPrice || 0,
        packCost: hit?.product.packCost || 0,
        weightKg: hit?.product.weightKg || 0,
        salePrice: hit?.product.salePrice || 0,
        stock: hit?.product.stock || 0,
        costSource: hit ? `已有资料(${hit.by})` : "待填",
      };
      map.set(key, row);
    }
    row.orderCount += 1;
    row.qtyTotal += Math.max(1, o.qty || 1);
    row.receivedTotal += o.merchantReceived || 0;
    row.goodsTotal += o.goodsTotal || 0;
    if (row.sampleIds.length < 3 && o.orderId) row.sampleIds.push(o.orderId);
    if (!row.productName && o.productName) row.productName = o.productName;
    if (!row.specName && o.specName) row.specName = o.specName;
    if (!row.skuCode && o.merchantSku) row.skuCode = o.merchantSku;
    // 仍无规格编码时，用商品规格兜底
    if (!row.skuCode && (o.specName || row.specName)) {
      row.skuCode = o.specName || row.specName;
    }
    if (!row.productCode && o.merchantSpu) row.productCode = o.merchantSpu;
    if (!row.productId && o.productId) row.productId = o.productId;
  }

  let rows: GeneratedProductRow[] = Array.from(map.values()).map((r) => {
    const avgUnit = r.qtyTotal > 0 ? r.goodsTotal / r.qtyTotal : 0;
    const salePrice = r.salePrice > 0 ? r.salePrice : Number(avgUnit.toFixed(2));
    const hasCost = r.costPrice + r.packCost > 0;
    // 规格编码优先级：商家规格编码 > 已有资料 > 商品规格 > 商品编码 > 去重键
    const skuCode =
      r.skuCode ||
      (r.key.startsWith("sku:") ? r.key.slice(4) : "") ||
      r.specName ||
      r.productCode ||
      r.key;
    return {
      productCode: r.productCode,
      productName: r.productName,
      skuCode,
      specName: r.specName,
      salePrice,
      costPrice: r.costPrice,
      packCost: r.packCost,
      weightKg: r.weightKg,
      stock: r.stock,
      dedupeKey: r.key,
      productId: r.productId,
      orderCount: r.orderCount,
      qtyTotal: r.qtyTotal,
      receivedTotal: r.receivedTotal,
      avgUnitPrice: Number(avgUnit.toFixed(2)),
      hasCost,
      costSource: hasCost ? r.costSource : "待填",
      sampleOrderIds: r.sampleIds.join(","),
    };
  });

  rows.sort((a, b) => {
    if (a.hasCost !== b.hasCost) return a.hasCost ? 1 : -1;
    return b.orderCount - a.orderCount || a.productName.localeCompare(b.productName, "zh");
  });

  if (mode === "missing_cost") {
    rows = rows.filter((r) => !r.hasCost);
  }
  return rows;
}

/** 平台商品资料标准表头（与 parseProductMaster / 后台导出一致） */
export const PRODUCT_MASTER_HEADERS = [
  "商品编码",
  "商品名称",
  "<必填>规格编码",
  "规格名称",
  "规格条码",
  "重量(kg)",
  "长(cm)",
  "宽(cm)",
  "高(cm)",
  "体积(m³)",
  "参考售价(元)",
  "参考成本价(元)",
  "包材成本价(元)",
  "一级分类",
  "二级分类",
  "三级分类",
  "四级分类",
  "标签",
  "供应商",
  "市场",
  "档口",
  "品牌",
  "单位",
  "保质期(天)",
  "保质期禁收天数(天)",
  "保质期禁售天数(天)",
  "保质期临期预警天数(天)",
  "可用库存",
] as const;

/** 可直接导入的商品资料表（标准列）；待填成本行排前，并附「成本状态」 */
export function productMasterImportTable(
  rows: Array<ProductSku | GeneratedProductRow>,
): any[][] {
  const sorted = [...rows].sort((a, b) => {
    const costOf = (p: ProductSku | GeneratedProductRow) => {
      if ("hasCost" in p && typeof (p as GeneratedProductRow).hasCost === "boolean") {
        return (p as GeneratedProductRow).hasCost ? 1 : 0;
      }
      return (p.costPrice || 0) + (p.packCost || 0) > 0 ? 1 : 0;
    };
    return costOf(a) - costOf(b); // 待填(0) 在前
  });
  const headers = ["填写标记", ...PRODUCT_MASTER_HEADERS, "成本状态"];
  return [
    headers,
    ...sorted.map((p) => {
      const hasCost =
        "hasCost" in p && typeof (p as GeneratedProductRow).hasCost === "boolean"
          ? (p as GeneratedProductRow).hasCost
          : (p.costPrice || 0) + (p.packCost || 0) > 0;
      return [
        hasCost ? "" : "⚠待填",
        p.productCode || "",
        p.productName || "",
        // 无规格编码时写入商品规格，保证模板可回填/再导入
        p.skuCode || p.specName || "",
        p.specName || "",
        "",
        p.weightKg ? Number(p.weightKg) : "",
        0,
        0,
        0,
        0,
        p.salePrice ? Number(p.salePrice) : "",
        p.costPrice ? Number(p.costPrice) : "",
        p.packCost ? Number(p.packCost) : "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        0,
        0,
        0,
        0,
        p.stock ? Number(p.stock) : "",
        hasCost ? "已有成本" : "待填成本",
      ];
    }),
  ];
}

/** 导出时需标记的数据行下标（0-based，不含表头；待填成本） */
export function productMasterPendingRowIndexes(
  rows: Array<ProductSku | GeneratedProductRow>,
): number[] {
  const sorted = [...rows].sort((a, b) => {
    const costOf = (p: ProductSku | GeneratedProductRow) => {
      if ("hasCost" in p && typeof (p as GeneratedProductRow).hasCost === "boolean") {
        return (p as GeneratedProductRow).hasCost ? 1 : 0;
      }
      return (p.costPrice || 0) + (p.packCost || 0) > 0 ? 1 : 0;
    };
    return costOf(a) - costOf(b);
  });
  const idxs: number[] = [];
  sorted.forEach((p, i) => {
    const hasCost =
      "hasCost" in p && typeof (p as GeneratedProductRow).hasCost === "boolean"
        ? (p as GeneratedProductRow).hasCost
        : (p.costPrice || 0) + (p.packCost || 0) > 0;
    if (!hasCost) idxs.push(i);
  });
  return idxs;
}

/** 辅助工作表：订单侧统计，方便填成本时对照 */
export function productMasterWorkTable(rows: GeneratedProductRow[]): any[][] {
  const sorted = [...rows].sort((a, b) => Number(a.hasCost) - Number(b.hasCost));
  return [
    [
      "填写标记",
      "规格编码",
      "商品编码",
      "商品名称",
      "规格名称",
      "商品ID",
      "订单数",
      "销量",
      "商家实收合计",
      "均单价(参考)",
      "参考成本价",
      "包材成本",
      "重量kg",
      "成本状态",
      "样例订单号",
      "去重键",
    ],
    ...sorted.map((r) => [
      r.hasCost ? "" : "⚠待填",
      r.skuCode || r.specName || "",
      r.productCode,
      r.productName,
      r.specName,
      r.productId,
      r.orderCount,
      r.qtyTotal,
      Number(r.receivedTotal.toFixed(2)),
      r.avgUnitPrice,
      r.costPrice || "",
      r.packCost || "",
      r.weightKg || "",
      r.costSource,
      r.sampleOrderIds,
      r.dedupeKey,
    ]),
  ];
}




export function mergeProductMasters(
  existing: ProductSku[],
  incoming: ProductSku[],
): ProductSku[] {
  const keyOf = (p: ProductSku) =>
    normMatchKey(p.skuCode) ||
    `${normMatchKey(p.productCode)}||${normMatchKey(p.specName)}` ||
    normMatchKey(p.specName) ||
    normMatchKey(p.productName);
  const map = new Map<string, ProductSku>();
  for (const p of existing) {
    const k = keyOf(p);
    if (k) map.set(k, { ...p });
  }
  for (const p of incoming) {
    const k = keyOf(p);
    if (!k) continue;
    const prev = map.get(k);
    if (!prev) {
      map.set(k, { ...p });
      continue;
    }
    map.set(k, {
      productCode: p.productCode || prev.productCode,
      productName: p.productName || prev.productName,
      skuCode: p.skuCode || prev.skuCode,
      specName: p.specName || prev.specName,
      salePrice: p.salePrice || prev.salePrice,
      costPrice: p.costPrice || prev.costPrice,
      packCost: p.packCost || prev.packCost,
      weightKg: p.weightKg || prev.weightKg,
      stock: p.stock || prev.stock,
    });
  }
  return Array.from(map.values());
}
