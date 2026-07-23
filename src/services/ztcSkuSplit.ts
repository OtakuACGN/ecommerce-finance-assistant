/**
 * 直通车细分：商品推广费按「商品ID」挂到链接，再在链接内按 SKU 拆分
 *
 * 铁律：
 * 1) 只按商品ID精确匹配推广花费（无ID / ID对不上 = 未匹配，禁止品名兜底）
 * 2) 一笔推广花费只使用一次
 * 3) 规格广告费 = 整链广告费 × (规格基数 / 该商品内基数合计)
 * 4) 未开广告的商品保持整链广告费=0，不因同名被扣费
 */
import type { AdProduct, OrderProfitRow } from "./pddBusiness";

export type ZtcSplitMode = "settlement" | "gmv" | "qty";

export interface ZtcSkuRow {
  productId: string;
  productName: string;
  merchantSpu: string;
  merchantSku: string;
  specName: string;
  orderCount: number;
  qty: number;
  goodsTotal: number;
  settlement: number;
  profitBeforeAd: number;
  productAdSpend: number;
  productGmv: number;
  productRoi: number;
  skuAdSpend: number;
  profitAfterAd: number;
  marginAfterAd: number;
  splitShare: number;
  splitMode: ZtcSplitMode;
  matchBy: "商品ID" | "无广告";
}

export interface ZtcBreakdownResult {
  rows: ZtcSkuRow[];
  table: any[][];
  productTable: any[][];
  summary: {
    productCount: number;
    skuCount: number;
    matchedAdSpend: number;
    unmatchedAdSpend: number;
    unmatchedProductCount: number;
    totalSettlement: number;
    totalProfitBefore: number;
    totalProfitAfter: number;
    totalSkuAd: number;
    orderRows: number;
    orderWithProductId: number;
    uniqueOrderProductIds: number;
    uniqueAdProductIds: number;
    idIntersection: number;
    sampleOrderIds: string[];
    sampleAdIds: string[];
  };
  unmatchedAds: {
    productId: string;
    productName: string;
    spend: number;
    reason: string;
  }[];
}

function normId(id: string): string {
  let s = String(id || "")
    .trim()
    .replace(/,/g, "");
  if (/e\+?\d+/i.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return String(Math.round(n));
  }
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, "");
  return s;
}

function normName(name: string): string {
  return String(name || "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

function skuKey(o: OrderProfitRow): string {
  return (
    String(o.merchantSku || "").trim() ||
    String(o.specName || "").trim() ||
    "默认规格"
  );
}

function weightOf(o: OrderProfitRow, mode: ZtcSplitMode): number {
  if (mode === "qty") return Math.max(0, o.qty || 0);
  if (mode === "gmv") return Math.max(0, o.goodsTotal || 0);
  return Math.max(0, o.merchantReceived || 0);
}

function pct(n: number): string {
  if (!isFinite(n)) return "0%";
  return (n * 100).toFixed(2) + "%";
}

function mergeAd(prev: AdProduct | undefined, a: AdProduct, id: string): AdProduct {
  if (!prev) {
    return { ...a, productId: id || a.productId };
  }
  prev.spend += a.spend || 0;
  prev.dealSpend += a.dealSpend || 0;
  prev.gmv += a.gmv || 0;
  prev.netGmv += a.netGmv || 0;
  prev.settledGmv += a.settledGmv || 0;
  prev.orders += a.orders || 0;
  if (prev.spend > 0) {
    prev.roi = prev.gmv / prev.spend;
    prev.netRoi = prev.netGmv / prev.spend;
    prev.settledRoi = prev.settledGmv / prev.spend;
  }
  if (!prev.productName && a.productName) prev.productName = a.productName;
  if (!prev.productId && id) prev.productId = id;
  return prev;
}

/**
 * 按商品ID将商品推广费拆到规格
 */
export function buildZtcSkuBreakdown(
  orderProfits: OrderProfitRow[],
  adProducts: AdProduct[],
  mode: ZtcSplitMode = "settlement",
): ZtcBreakdownResult {
  const adById = new Map<string, AdProduct>();
  for (const a of adProducts) {
    const id = normId(a.productId);
    if (id) adById.set(id, mergeAd(adById.get(id), a, id));
  }

  type OrderAgg = {
    productId: string;
    productName: string;
    merchantSpu: string;
    merchantSku: string;
    specName: string;
    orderCount: number;
    qty: number;
    goodsTotal: number;
    settlement: number;
    profitBeforeAd: number;
    weight: number;
  };

  // 永远按订单商品ID成组；无ID时用 name: 前缀单独成组
  const byGroup = new Map<string, Map<string, OrderAgg>>();
  const groupMeta = new Map<
    string,
    { productId: string; productName: string }
  >();

  let orderWithProductId = 0;
  const orderIdSet = new Set<string>();

  for (const o of orderProfits) {
    const pid = normId(o.productId);
    const nm = normName(o.productName);
    if (pid) {
      orderWithProductId += 1;
      orderIdSet.add(pid);
    }

    // 有 ID 只按 ID 分组；无 ID 单独成组（不参与广告匹配）
    const gkey = pid ? "id:" + pid : nm ? "noid:" + nm : "";
    if (!gkey) continue;

    if (!byGroup.has(gkey)) {
      byGroup.set(gkey, new Map());
      groupMeta.set(gkey, {
        productId: pid,
        productName: o.productName || "",
      });
    }
    const map = byGroup.get(gkey)!;
    const sk = skuKey(o);
    const prev = map.get(sk);
    const w = weightOf(o, mode);
    if (!prev) {
      map.set(sk, {
        productId: pid,
        productName: o.productName || "",
        merchantSpu: o.merchantSpu || "",
        merchantSku:
          o.merchantSku || (sk !== "默认规格" && sk === o.specName ? "" : sk),
        specName: o.specName || sk,
        orderCount: 1,
        qty: o.qty || 0,
        goodsTotal: o.goodsTotal || 0,
        settlement: o.merchantReceived || 0,
        profitBeforeAd: o.estimatedProfit || 0,
        weight: w,
      });
    } else {
      prev.orderCount += 1;
      prev.qty += o.qty || 0;
      prev.goodsTotal += o.goodsTotal || 0;
      prev.settlement += o.merchantReceived || 0;
      prev.profitBeforeAd += o.estimatedProfit || 0;
      prev.weight += w;
      if (!prev.productName && o.productName) prev.productName = o.productName;
      if (!prev.merchantSpu && o.merchantSpu) prev.merchantSpu = o.merchantSpu;
      if (!prev.productId && pid) prev.productId = pid;
      map.set(sk, prev);
    }
  }

  const rows: ZtcSkuRow[] = [];
  const productRows: {
    productId: string;
    productName: string;
    skuCount: number;
    orderCount: number;
    qty: number;
    settlement: number;
    profitBefore: number;
    productAd: number;
    productRoi: number;
    profitAfter: number;
    matchBy: string;
  }[] = [];

  let matchedAdSpend = 0;
  /** 已被使用的推广商品ID，防止一笔广告重复挂到多个订单组 */
  const usedAdIds = new Set<string>();

  for (const [gkey, skuMap] of byGroup) {
    const meta = groupMeta.get(gkey)!;
    const pid = meta.productId;

    let ad: AdProduct | undefined;
    let matchBy: ZtcSkuRow["matchBy"] = "无广告";

    // 仅商品ID精确匹配；无ID或ID对不上 → 无广告（不因同名/未开广告商品误挂）
    if (pid && adById.has(pid)) {
      ad = adById.get(pid);
      matchBy = "商品ID";
      usedAdIds.add(pid);
    }

    const productAd = ad?.spend || 0;
    const productGmv = ad?.gmv || 0;
    const productRoi =
      ad && ad.spend > 0
        ? ad.gmv / ad.spend
        : productAd > 0 && productGmv > 0
          ? productGmv / productAd
          : ad?.roi || 0;

    // 无广告的商品：仍可展示规格毛利，但不扣广告（productAd=0）
    // 用户主要看有广告的；无广告也输出便于核对
    if (productAd > 0) matchedAdSpend += productAd;

    const skus = Array.from(skuMap.values());
    const totalW = skus.reduce((s, x) => s + x.weight, 0);
    let productProfitBefore = 0;
    let productSettlement = 0;
    let productQty = 0;
    let productOrders = 0;
    let productProfitAfter = 0;
    let sumSkuAd = 0;

    const skuParts = skus.map((s) => {
      const share =
        totalW > 0 ? s.weight / totalW : skus.length > 0 ? 1 / skus.length : 0;
      return { s, share };
    });
    // 末条吃误差，保证规格广告费之和 = 商品广告费
    let allocated = 0;
    skuParts.forEach((part, idx) => {
      const isLast = idx === skuParts.length - 1;
      const skuAd = isLast
        ? Math.max(0, productAd - allocated)
        : productAd * part.share;
      if (!isLast) allocated += skuAd;
      sumSkuAd += skuAd;

      const profitAfter = part.s.profitBeforeAd - skuAd;
      const margin =
        part.s.settlement > 0 ? profitAfter / part.s.settlement : 0;

      rows.push({
        productId: part.s.productId || ad?.productId || pid,
        productName: part.s.productName || ad?.productName || "",
        merchantSpu: part.s.merchantSpu,
        merchantSku: part.s.merchantSku,
        specName: part.s.specName,
        orderCount: part.s.orderCount,
        qty: part.s.qty,
        goodsTotal: part.s.goodsTotal,
        settlement: part.s.settlement,
        profitBeforeAd: part.s.profitBeforeAd,
        productAdSpend: productAd,
        productGmv,
        productRoi,
        skuAdSpend: skuAd,
        profitAfterAd: profitAfter,
        marginAfterAd: margin,
        splitShare: part.share,
        splitMode: mode,
        matchBy,
      });
      productProfitBefore += part.s.profitBeforeAd;
      productSettlement += part.s.settlement;
      productQty += part.s.qty;
      productOrders += part.s.orderCount;
      productProfitAfter += profitAfter;
    });

    productRows.push({
      productId: pid || ad?.productId || "",
      productName: skus[0]?.productName || ad?.productName || "",
      skuCount: skus.length,
      orderCount: productOrders,
      qty: productQty,
      settlement: productSettlement,
      profitBefore: productProfitBefore,
      productAd,
      productRoi,
      profitAfter: productProfitAfter,
      matchBy,
    });
  }

  // 未匹配推广：订单中完全没有该商品ID
  const unmatchedAds: ZtcBreakdownResult["unmatchedAds"] = [];
  for (const [id, a] of adById) {
    if (usedAdIds.has(id)) continue;
    if ((a.spend || 0) <= 0) continue;
    let reason = "";
    if (orderWithProductId === 0) {
      reason = "订单未解析到商品ID，请重新导入订单并生成报表";
    } else if (orderIdSet.has(id)) {
      reason = "内部异常：订单有此ID但未挂上广告（请重算）";
    } else {
      reason = `订单中无此商品ID（${id}）。仅按商品ID匹配，未开广告或不同链接不会扣费`;
    }
    unmatchedAds.push({
      productId: a.productId,
      productName: a.productName,
      spend: a.spend || 0,
      reason,
    });
  }
  unmatchedAds.sort((a, b) => b.spend - a.spend);

  const unmatchedAdSpend = unmatchedAds.reduce((s, a) => s + a.spend, 0);
  const idIntersection = Array.from(adById.keys()).filter((id) =>
    orderIdSet.has(id),
  ).length;

  // 只展示：有广告 或 有结算的规格；优先有广告的排前
  rows.sort((a, b) => {
    if (b.productAdSpend !== a.productAdSpend)
      return b.productAdSpend - a.productAdSpend;
    return b.profitAfterAd - a.profitAfterAd;
  });
  productRows.sort((a, b) => b.productAd - a.productAd || b.profitAfter - a.profitAfter);

  const modeLabel =
    mode === "qty" ? "销量" : mode === "gmv" ? "商品总价" : "结算金额";

  const table: any[][] = [
    [
      "商品ID",
      "商品名称",
      "商品编码",
      "规格编码",
      "规格名称",
      "匹配方式",
      "订单数",
      "销量",
      "结算金额",
      "商品总价",
      "整链广告费",
      "商品ROI",
      "分摊占比",
      "分摊基数",
      "规格广告费",
      "毛利(未扣广告)",
      "规格净利润",
      "规格净利率",
    ],
    ...rows.map((r) => [
      r.productId,
      r.productName,
      r.merchantSpu,
      r.merchantSku,
      r.specName,
      r.matchBy,
      r.orderCount,
      r.qty,
      r.settlement.toFixed(2),
      r.goodsTotal.toFixed(2),
      r.productAdSpend.toFixed(2),
      r.productRoi > 0 ? r.productRoi.toFixed(2) : "-",
      pct(r.splitShare),
      modeLabel,
      r.skuAdSpend.toFixed(2),
      r.profitBeforeAd.toFixed(2),
      r.profitAfterAd.toFixed(2),
      pct(r.marginAfterAd),
    ]),
  ];

  const productTable: any[][] = [
    [
      "商品ID",
      "商品名称",
      "匹配方式",
      "规格数",
      "订单数",
      "销量",
      "结算金额",
      "整链广告费",
      "商品ROI",
      "毛利(未扣广告)",
      "扣广告后毛利",
      "净利率",
    ],
    ...productRows.map((r) => [
      r.productId,
      r.productName,
      r.matchBy,
      r.skuCount,
      r.orderCount,
      r.qty,
      r.settlement.toFixed(2),
      r.productAd.toFixed(2),
      r.productRoi > 0 ? r.productRoi.toFixed(2) : "-",
      r.profitBefore.toFixed(2),
      r.profitAfter.toFixed(2),
      r.settlement > 0 ? pct(r.profitAfter / r.settlement) : "0%",
    ]),
  ];

  const totalSettlement = rows.reduce((s, r) => s + r.settlement, 0);
  const totalProfitBefore = rows.reduce((s, r) => s + r.profitBeforeAd, 0);
  const totalProfitAfter = rows.reduce((s, r) => s + r.profitAfterAd, 0);
  const totalSkuAd = rows.reduce((s, r) => s + r.skuAdSpend, 0);

  return {
    rows,
    table,
    productTable,
    summary: {
      productCount: productRows.filter((r) => r.productAd > 0).length,
      skuCount: rows.filter((r) => r.productAdSpend > 0).length,
      matchedAdSpend,
      unmatchedAdSpend,
      unmatchedProductCount: unmatchedAds.length,
      totalSettlement,
      totalProfitBefore,
      totalProfitAfter,
      totalSkuAd,
      orderRows: orderProfits.length,
      orderWithProductId,
      uniqueOrderProductIds: orderIdSet.size,
      uniqueAdProductIds: adById.size,
      idIntersection,
      sampleOrderIds: Array.from(orderIdSet).slice(0, 5),
      sampleAdIds: Array.from(adById.keys()).slice(0, 5),
    },
    unmatchedAds,
  };
}
