/** 经营参数：加载 / 规范化 / 持久化（与品牌扣点、账务平台费无关的通用设置） */
import {
  DEFAULT_COST_SETTINGS,
  DEFAULT_EXPRESS_RULES,
  type CostSettings,
  type ShopFeeOverride,
} from "./pddBusiness";

export const OP_COST_STORAGE_KEY = "pdd-operating-cost-settings";

export function cloneDefaultCostSettings(): CostSettings {
  return {
    ...DEFAULT_COST_SETTINGS,
    expressRules: DEFAULT_EXPRESS_RULES.map((r) => ({ ...r })),
    shopFeeOverrides: (DEFAULT_COST_SETTINGS.shopFeeOverrides || []).map((o) => ({
      ...o,
    })),
  };
}

function normalizeShopOverrides(raw: unknown): ShopFeeOverride[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((o: any) => ({
    shopName: String(o?.shopName || ""),
    brandPointPct:
      o?.brandPointPct === null || o?.brandPointPct === ""
        ? null
        : o?.brandPointPct === undefined
          ? null
          : Math.max(0, Number(o.brandPointPct) || 0),
    ecommerceTaxPct:
      o?.ecommerceTaxPct === null || o?.ecommerceTaxPct === ""
        ? null
        : o?.ecommerceTaxPct === undefined
          ? null
          : Math.max(0, Number(o.ecommerceTaxPct) || 0),
    feeBaseMode:
      o?.feeBaseMode === "revenue" ||
      o?.feeBaseMode === "merchantReceived" ||
      o?.feeBaseMode === "goodsTotal"
        ? o.feeBaseMode
        : "",
  }));
}

/** 把 JSON/localStorage 片段收成可用 CostSettings */
export function normalizeCostSettings(parsed: Partial<CostSettings> | null | undefined): CostSettings {
  const base = cloneDefaultCostSettings();
  if (!parsed || typeof parsed !== "object") return base;
  const rules =
    Array.isArray(parsed.expressRules) && parsed.expressRules.length > 0
      ? parsed.expressRules.map((r) => ({ ...r }))
      : DEFAULT_EXPRESS_RULES.map((r) => ({ ...r }));
  return {
    ...base,
    ...parsed,
    expressRules: rules,
    adAllocateMode:
      parsed.adAllocateMode === "by_order_count" ||
      parsed.adAllocateMode === "none" ||
      parsed.adAllocateMode === "by_gmv"
        ? parsed.adAllocateMode
        : "by_gmv",
    matchBySpecWhenNoCode: parsed.matchBySpecWhenNoCode !== false,
    anomalyHighRefundRate: Math.min(
      1,
      Math.max(
        0,
        Number.isFinite(Number(parsed.anomalyHighRefundRate))
          ? Number(parsed.anomalyHighRefundRate)
          : 0.3,
      ),
    ),
    anomalyHighRefundMinShipped: Math.max(
      1,
      Math.round(Number(parsed.anomalyHighRefundMinShipped) || 3),
    ),
    // bill_first 历史别名：与 both 相同（平台费进毛利，不顶替品牌扣点）
    feeStackMode:
      parsed.feeStackMode === "settings_only" ? "settings_only" : "both",
    brandPointPct: Math.max(0, Number(parsed.brandPointPct) || 0),
    ecommerceTaxPct: Math.max(0, Number(parsed.ecommerceTaxPct) || 0),
    feeBaseMode:
      parsed.feeBaseMode === "goodsTotal" ||
      parsed.feeBaseMode === "merchantReceived" ||
      parsed.feeBaseMode === "revenue"
        ? parsed.feeBaseMode
        : "revenue",
    shopFeeOverrides: normalizeShopOverrides(parsed.shopFeeOverrides),
  };
}

export function loadOpCostSettings(): CostSettings {
  try {
    const raw = localStorage.getItem(OP_COST_STORAGE_KEY);
    if (!raw) return cloneDefaultCostSettings();
    return normalizeCostSettings(JSON.parse(raw) as Partial<CostSettings>);
  } catch {
    return cloneDefaultCostSettings();
  }
}

export function saveOpCostSettings(settings: CostSettings): void {
  try {
    localStorage.setItem(OP_COST_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore quota */
  }
}

/** 从订单毛利表按条件筛行（表头保留） */
export type OrderTableFilter =
  | "all"
  | "partial"
  | "full"
  | "neg"
  | "unmatched"
  | "ship_loss";

export function filterOrderTable(
  orderTable: any[][] | undefined,
  filter: OrderTableFilter,
): any[][] {
  if (!orderTable || orderTable.length === 0) return [];
  const header = orderTable[0] || [];
  if (filter === "all") return orderTable;
  const typeIdx = header.indexOf("退款类型");
  const profitIdx = (() => {
    const keys = ["毛利(扣广告)", "毛利(未扣广告)", "毛利"];
    for (const k of keys) {
      const i = header.indexOf(k);
      if (i >= 0) return i;
    }
    return -1;
  })();
  const matchIdx = header.indexOf("成本匹配");
  const shipLossIdx = header.indexOf("损耗运费");
  const rows = orderTable.slice(1).filter((row) => {
    if (filter === "partial") return String(row[typeIdx] ?? "") === "部分退";
    if (filter === "full") return String(row[typeIdx] ?? "") === "全额退";
    if (filter === "unmatched") return String(row[matchIdx] ?? "") === "否";
    if (filter === "neg") {
      const n = Number(String(row[profitIdx] ?? "").replace(/[,%￥¥\s]/g, ""));
      return Number.isFinite(n) && n < 0;
    }
    if (filter === "ship_loss") {
      const n = Number(String(row[shipLossIdx] ?? "").replace(/[,%￥¥\s]/g, ""));
      return Number.isFinite(n) && n > 0.009;
    }
    return true;
  });
  return [header, ...rows];
}
