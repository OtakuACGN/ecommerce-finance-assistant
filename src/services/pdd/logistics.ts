/**
 * 店铺/快递/订单状态
 */
import type { PddOrder, ProductSku, CostSettings } from "./types";
import { normMatchKey } from "./helpers";
import { businessMonthOf } from "../businessPeriod";

export function normalizeShopName(name?: string): string {
  const s = String(name || "").trim();
  return s || "默认店铺";
}

export function guessShopNameFromFile(fileName: string): string {
  const base = String(fileName || "")
    .replace(/\.[^.]+$/, "")
    .replace(/orders_export.*$/i, "")
    .replace(/pdd-mall-bill-detail[^(]*/i, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/商品推广.*$/g, "")
    .replace(/商品资料.*$/g, "")
    .replace(/[_\-]+$/g, "")
    .trim();
  if (base && base.length >= 2 && base.length <= 40) return base;
  return "";
}

interface CostMatch {

  costPrice: number;
  packCost: number;
  weightKg: number;
  matched: boolean;
  by: string;
}


export function resolveExpressRule(
  expressCompany: string,
  settings: CostSettings,
): {
  rule: {
    firstWeightKg: number;
    firstWeightFee: number;
    additionalWeightKg: number;
    additionalWeightFee: number;
  };
  label: string;
  matched: boolean;
} {
  const name = String(expressCompany || "").trim();
  for (const r of settings.expressRules || []) {
    const keys = String(r.keywords || "")
      .split(/[,，|/]/)
      .map((k) => k.trim())
      .filter(Boolean);
    if (keys.some((k) => k && name.includes(k))) {
      return {
        label: r.label || keys[0] || "匹配规则",
        matched: true,
        rule: {
          firstWeightKg: r.firstWeightKg,
          firstWeightFee: r.firstWeightFee,
          additionalWeightKg: r.additionalWeightKg,
          additionalWeightFee: r.additionalWeightFee,
        },
      };
    }
  }
  return {
    label: name ? `默认(未匹配规则)` : "默认(无快递)",
    matched: false,
    rule: {
      firstWeightKg: settings.firstWeightKg,
      firstWeightFee: settings.firstWeightFee,
      additionalWeightKg: settings.additionalWeightKg,
      additionalWeightFee: settings.additionalWeightFee,
    },
  };
}

export function calcShippingFeeByRule(
  weightKg: number,
  rule: {
    firstWeightKg: number;
    firstWeightFee: number;
    additionalWeightKg: number;
    additionalWeightFee: number;
  },
  defaultWeightKg: number,
): number {
  const w = weightKg > 0 ? weightKg : defaultWeightKg;
  if (w <= rule.firstWeightKg) return rule.firstWeightFee;
  const unit = rule.additionalWeightKg > 0 ? rule.additionalWeightKg : 1;
  const steps = Math.ceil((w - rule.firstWeightKg) / unit - 1e-9);
  return rule.firstWeightFee + Math.max(0, steps) * rule.additionalWeightFee;
}

export function calcShippingFee(
  weightKg: number,
  settings: CostSettings,
  expressCompany = "",
): { fee: number; ruleLabel: string; ruleMatched: boolean } {
  const resolved = resolveExpressRule(expressCompany, settings);
  return {
    fee: calcShippingFeeByRule(weightKg, resolved.rule, settings.defaultWeightKg),
    ruleLabel: resolved.label,
    ruleMatched: resolved.matched,
  };
}

export function isOrderRefunded(o: PddOrder): boolean {
  return /退款成功/.test(o.status) || /退款成功/.test(o.afterSale);
}

export function isOrderShipped(o: PddOrder): boolean {
  return Boolean(String(o.shipTime || "").trim()) || /已发货|已收货/.test(o.status);
}

export function isOrderCompleted(o: PddOrder): boolean {
  return /^已收货/.test(o.status) && !isOrderRefunded(o);
}

export function isPostShipRefund(o: PddOrder): boolean {
  return isOrderShipped(o) && isOrderRefunded(o);
}

/** 签收后退款（仅已收货退款成功）；体感「退货退款率」= isPostShipRefund */
export function isReturnRefund(o: PddOrder): boolean {
  const st = `${o.status}|${o.afterSale}`;
  if (/已收货/.test(st) && isOrderRefunded(o)) return true;
  if (/已收货退款/.test(st)) return true;
  return false;
}

export function isShipNotDeal(o: PddOrder): boolean {
  return isOrderShipped(o) && !isOrderCompleted(o);
}

export function dealMonthOf(dealTime: string | number | Date | null | undefined): string {
  return businessMonthOf(dealTime) || "未知";
}

interface CostMatch {
  costPrice: number;
  packCost: number;
  weightKg: number;
  matched: boolean;
  by: string;
}


/** 匹配键规范化：去空白/全角空格，避免无编码规格对不上 */

function looseSpecKey(raw: string): string {
  return normMatchKey(raw)
    .toLowerCase()
    .replace(/^\d{1,3}/, "")
    .replace(/【[^】]*】|\[[^\]]*\]|（[^）]*）|\([^)]*\)/g, "")
    // 平台规格里常见“全面/全棉”录入差异，仅用于唯一候选兜底。
    .replace(/全面/g, "全棉")
    .replace(/[\s,，、;；:：/\\|_\-*×x]+/g, "");
}

export function buildProductIndexes(products: ProductSku[]) {
  const bySku = new Map<string, ProductSku>();
  const bySpec = new Map<string, ProductSku>();
  const bySpu = new Map<string, ProductSku>();
  const byName = new Map<string, ProductSku>();
  const byLooseSpec = new Map<string, ProductSku>();
  /** 品名+规格 联合键，避免同名多规格误匹配 */
  const byNameSpec = new Map<string, ProductSku>();
  const ambiguous = {
    sku: new Set<string>(),
    spec: new Set<string>(),
    spu: new Set<string>(),
    name: new Set<string>(),
    nameSpec: new Set<string>(),
    looseSpec: new Set<string>(),
  };
  const sameCostProfile = (a: ProductSku, b: ProductSku) =>
    Number(a.costPrice || 0) === Number(b.costPrice || 0) &&
    Number(a.packCost || 0) === Number(b.packCost || 0) &&
    Number(a.weightKg || 0) === Number(b.weightKg || 0);
  const addSafe = (
    map: Map<string, ProductSku>,
    blocked: Set<string>,
    key: string,
    product: ProductSku,
  ) => {
    if (!key || blocked.has(key)) return;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, product);
      return;
    }
    // 同一匹配键对应不同成本/重量时宁可待补，也不能静默取最后一条。
    if (!sameCostProfile(prev, product)) {
      map.delete(key);
      blocked.add(key);
    }
  };
  for (const p of products) {
    const sku = normMatchKey(p.skuCode);
    const spec = normMatchKey(p.specName);
    const code = normMatchKey(p.productCode);
    const name = normMatchKey(p.productName);
    const looseSpec = looseSpecKey(p.specName || p.skuCode);
    if (sku) addSafe(bySku, ambiguous.sku, sku, p);
    if (spec) addSafe(bySpec, ambiguous.spec, spec, p);
    if (code) addSafe(bySpu, ambiguous.spu, code, p);
    if (name) addSafe(byName, ambiguous.name, name, p);
    if (looseSpec) {
      addSafe(byLooseSpec, ambiguous.looseSpec, looseSpec, p);
    }
    if (name && spec) {
      addSafe(
        byNameSpec,
        ambiguous.nameSpec,
        `${name}||${spec}`,
        p,
      );
    }
  }
  return { bySku, bySpec, bySpu, byName, byNameSpec, byLooseSpec };
}

function orderHasMerchantCode(order: PddOrder): boolean {
  return !!(normMatchKey(order.merchantSku) || normMatchKey(order.merchantSpu));
}

export function matchProduct(
  order: PddOrder,
  indexes: ReturnType<typeof buildProductIndexes>,
  settings?: Pick<CostSettings, "matchBySpecWhenNoCode">,
): CostMatch {
  const pack = (p: ProductSku) => p.packCost;
  const wrap = (p: ProductSku, by: string): CostMatch => ({
    costPrice: p.costPrice,
    packCost: pack(p),
    weightKg: p.weightKg,
    matched: true,
    by,
  });
  const unmatched = (): CostMatch => ({
    costPrice: 0,
    packCost: 0,
    weightKg: 0,
    matched: false,
    by: "未匹配",
  });

  const sku = normMatchKey(order.merchantSku);
  const spu = normMatchKey(order.merchantSpu);
  const spec = normMatchKey(order.specName);
  const name = normMatchKey(order.productName);
  const productId = normMatchKey(order.productId);
  const hasCode = orderHasMerchantCode(order);
  const allowSpecNoCode = settings?.matchBySpecWhenNoCode !== false;

  // —— 有编码：优先精确编码 ——
  if (sku && indexes.bySku.has(sku)) {
    return wrap(indexes.bySku.get(sku)!, "规格编码");
  }
  if (sku && indexes.bySpec.has(sku)) {
    return wrap(indexes.bySpec.get(sku)!, "规格名称=商家编码");
  }
  if (spu && indexes.bySpu.has(spu)) {
    return wrap(indexes.bySpu.get(spu)!, "商品编码");
  }

  // —— 无编码（或编码没命中）：按商品规格 / 品名+规格 ——
  // 有编码但未命中时也允许规格兜底，避免漏配；无编码则受开关控制
  const canUseSpec = hasCode || allowSpecNoCode;
  if (canUseSpec) {
    if (name && spec && indexes.byNameSpec.has(`${name}||${spec}`)) {
      return wrap(indexes.byNameSpec.get(`${name}||${spec}`)!, "品名+规格");
    }
    if (spec && indexes.bySpec.has(spec)) {
      return wrap(indexes.bySpec.get(spec)!, hasCode ? "商品规格(编码未命中)" : "商品规格(无编码)");
    }
    const looseSpec = looseSpecKey(spec || sku);
    if (looseSpec && indexes.byLooseSpec.has(looseSpec)) {
      return wrap(
        indexes.byLooseSpec.get(looseSpec)!,
        hasCode ? "规格规范化(编码未命中)" : "规格规范化(无编码)",
      );
    }
    // 生成商品资料时可能把商品ID写入商品编码/规格编码
    if (productId && indexes.bySku.has(productId)) {
      return wrap(indexes.bySku.get(productId)!, "商品ID=规格编码");
    }
    if (productId && indexes.bySpu.has(productId)) {
      return wrap(indexes.bySpu.get(productId)!, "商品ID=商品编码");
    }
    // 模糊：规格互相包含（仅无编码或编码未命中时）
    if (spec && spec.length >= 2) {
      const hits = Array.from(indexes.bySpec.entries())
        .filter(([k]) => k.length >= 2 && (k.includes(spec) || spec.includes(k)))
        .map(([, p]) => p);
      if (hits.length === 1) return wrap(hits[0], "模糊商品规格");
    }
    if (sku && sku.length >= 2) {
      const hits = Array.from(indexes.bySpec.entries())
        .filter(([k]) => k.length >= 2 && (k.includes(sku) || sku.includes(k)))
        .map(([, p]) => p);
      if (hits.length === 1) return wrap(hits[0], "模糊规格");
    }
    // 最弱：仅品名（多规格时可能不准，放最后）
    if (name && indexes.byName.has(name)) {
      return wrap(indexes.byName.get(name)!, "商品名称");
    }
  }

  return unmatched();
}



