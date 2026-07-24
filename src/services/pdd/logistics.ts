/**
 * 店铺/快递/订单状态
 */
import type { PddOrder, ProductSku, CostSettings } from "./types";
import { normMatchKey } from "./helpers";

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
  if (dealTime === null || dealTime === undefined || dealTime === "") return "未知";

  const pad = (n: number) => String(n).padStart(2, "0");
  const validYear = (y: number) => y >= 1990 && y <= 2100;
  const fmt = (y: number, m: number) =>
    m >= 1 && m <= 12 && validYear(y) ? `${y}-${pad(m)}` : "";

  // Date 对象
  if (dealTime instanceof Date && !Number.isNaN(dealTime.getTime())) {
    const r = fmt(dealTime.getFullYear(), dealTime.getMonth() + 1);
    if (r) return r;
  }

  // Excel 序列号（数字或纯数字字符串，约 1990–2100）
  const asNum =
    typeof dealTime === "number"
      ? dealTime
      : /^\d+(\.\d+)?$/.test(String(dealTime).trim())
        ? Number(String(dealTime).trim())
        : NaN;
  if (Number.isFinite(asNum) && asNum > 20000 && asNum < 80000) {
    // Excel 纪元 1899-12-30（含 1900 闰年兼容）
    const utc = Date.UTC(1899, 11, 30) + Math.floor(asNum) * 86400000;
    const d = new Date(utc);
    const r = fmt(d.getUTCFullYear(), d.getUTCMonth() + 1);
    if (r) return r;
  }

  const s = String(dealTime).trim();

  // 标准：2026-06-30 / 2026/6/30 / 2026年6月…（年份必须 19xx/20xx，避免吃到订单号）
  let m = s.match(/(?:^|[^\d])((?:19|20)\d{2})[-/年.](\d{1,2})(?!\d)/);
  if (!m) m = s.match(/^((?:19|20)\d{2})[-/年.](\d{1,2})/);
  if (m) {
    const r = fmt(Number(m[1]), Number(m[2]));
    if (r) return r;
  }

  // 6/30/26、06/30/2026、30/6/2026
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const a = Number(m[1]);
    const b = Number(m[2]);
    // 美式优先 月/日/年；若首段>12 则 日/月/年
    let month = a > 12 ? b : a;
    if (a <= 12 && b > 12) month = a; // 6/30/26
    if (a > 12 && b <= 12) month = b; // 30/6/26
    const r = fmt(year, month);
    if (r) return r;
  }

  // 最后才用 Date 解析，并校验年份，禁止 45474 / 订单号被当成年份
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const r = fmt(d.getFullYear(), d.getMonth() + 1);
    if (r) return r;
  }
  return "未知";
}

interface CostMatch {
  costPrice: number;
  packCost: number;
  weightKg: number;
  matched: boolean;
  by: string;
}


/** 匹配键规范化：去空白/全角空格，避免无编码规格对不上 */


export function buildProductIndexes(products: ProductSku[]) {
  const bySku = new Map<string, ProductSku>();
  const bySpec = new Map<string, ProductSku>();
  const bySpu = new Map<string, ProductSku>();
  const byName = new Map<string, ProductSku>();
  /** 品名+规格 联合键，避免同名多规格误匹配 */
  const byNameSpec = new Map<string, ProductSku>();
  for (const p of products) {
    const sku = normMatchKey(p.skuCode);
    const spec = normMatchKey(p.specName);
    const code = normMatchKey(p.productCode);
    const name = normMatchKey(p.productName);
    if (sku) bySku.set(sku, p);
    if (spec) bySpec.set(spec, p);
    if (code) bySpu.set(code, p);
    if (name) byName.set(name, p);
    if (name && spec) byNameSpec.set(`${name}||${spec}`, p);
  }
  return { bySku, bySpec, bySpu, byName, byNameSpec };
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
    // 生成商品资料时可能把商品ID写入商品编码/规格编码
    if (productId && indexes.bySku.has(productId)) {
      return wrap(indexes.bySku.get(productId)!, "商品ID=规格编码");
    }
    if (productId && indexes.bySpu.has(productId)) {
      return wrap(indexes.bySpu.get(productId)!, "商品ID=商品编码");
    }
    // 模糊：规格互相包含（仅无编码或编码未命中时）
    if (spec) {
      for (const [k, p] of indexes.bySpec) {
        if (k.includes(spec) || spec.includes(k)) {
          return wrap(p, "模糊商品规格");
        }
      }
    }
    if (sku) {
      for (const [k, p] of indexes.bySpec) {
        if (k.includes(sku) || sku.includes(k)) {
          return wrap(p, "模糊规格");
        }
      }
    }
    // 最弱：仅品名（多规格时可能不准，放最后）
    if (name && indexes.byName.has(name)) {
      return wrap(indexes.byName.get(name)!, "商品名称");
    }
  }

  return unmatched();
}



