/** 成本模板与店铺扣点解析 */
import type { CostSettings } from "./types";
import { COST_SETTING_TEMPLATES } from "./types";
import { normalizeShopName } from "./logistics";

export function applyCostTemplate(
  current: CostSettings,
  templateId: string,
): CostSettings {
  const t = COST_SETTING_TEMPLATES.find((x) => x.id === templateId);
  if (!t) return current;
  const patch = { ...t.patch };
  if (patch.expressRules) {
    patch.expressRules = patch.expressRules.map((r) => ({ ...r }));
  }
  return {
    ...current,
    ...patch,
    shopFeeOverrides: current.shopFeeOverrides.map((o) => ({ ...o })),
    expressRules: (patch.expressRules || current.expressRules).map((r) => ({
      ...r,
    })),
  };
}

export function resolveShopFeeRates(
  settings: CostSettings,
  shopName?: string,
): {
  brandPointPct: number;
  ecommerceTaxPct: number;
  feeBaseMode: CostSettings["feeBaseMode"];
  fromOverride: boolean;
} {
  const shop = normalizeShopName(shopName);
  const ov = (settings.shopFeeOverrides || []).find(
    (x) => normalizeShopName(x.shopName) === shop,
  );
  if (!ov) {
    return {
      brandPointPct: Math.max(0, Number(settings.brandPointPct) || 0),
      ecommerceTaxPct: Math.max(0, Number(settings.ecommerceTaxPct) || 0),
      feeBaseMode: settings.feeBaseMode || "revenue",
      fromOverride: false,
    };
  }
  return {
    brandPointPct:
      ov.brandPointPct === null || ov.brandPointPct === undefined
        ? Math.max(0, Number(settings.brandPointPct) || 0)
        : Math.max(0, Number(ov.brandPointPct) || 0),
    ecommerceTaxPct:
      ov.ecommerceTaxPct === null || ov.ecommerceTaxPct === undefined
        ? Math.max(0, Number(settings.ecommerceTaxPct) || 0)
        : Math.max(0, Number(ov.ecommerceTaxPct) || 0),
    feeBaseMode:
      ov.feeBaseMode === "revenue" ||
      ov.feeBaseMode === "merchantReceived" ||
      ov.feeBaseMode === "goodsTotal"
        ? ov.feeBaseMode
        : settings.feeBaseMode || "revenue",
    fromOverride: true,
  };
}

