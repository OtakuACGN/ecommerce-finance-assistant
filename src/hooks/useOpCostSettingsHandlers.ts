import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { PddOrder } from "../services/pddBusiness";
import {
  COST_SETTING_TEMPLATES,
  applyCostTemplate,
  normalizeShopName,
  type CostSettings,
  type ExpressShipRule,
  type ShopFeeOverride,
} from "../services/pddBusiness";
import { cloneDefaultCostSettings } from "../services/opCostSettings";
import type { ToastMessage } from "../components/Toast";

type ShowToast = (message: string, type?: ToastMessage["type"]) => void;

export interface OpCostSettingsHandlerDeps {
  opOrders: PddOrder[];
  setOpCostSettings: Dispatch<SetStateAction<CostSettings>>;
  showToast: ShowToast;
}

/** 运费/包材/扣点参数面板相关 handlers */
export function useOpCostSettingsHandlers(deps: OpCostSettingsHandlerDeps) {
  const { opOrders, setOpCostSettings, showToast } = deps;

  const updateExpressRule = useCallback(
    (index: number, patch: Partial<ExpressShipRule>) => {
      setOpCostSettings((s) => {
        const rules = s.expressRules.map((r, i) =>
          i === index ? { ...r, ...patch } : r,
        );
        return { ...s, expressRules: rules };
      });
    },
    [setOpCostSettings],
  );

  const handleResetOpCostSettings = useCallback(() => {
    setOpCostSettings(cloneDefaultCostSettings());
    showToast("已恢复默认运费/包材参数", "success");
  }, [setOpCostSettings, showToast]);

  const handleApplyCostTemplate = useCallback(
    (templateId: string) => {
      const t = COST_SETTING_TEMPLATES.find((x) => x.id === templateId);
      setOpCostSettings((s) => applyCostTemplate(s, templateId));
      showToast(t ? `已套用模板：${t.name}` : "模板不存在", t ? "success" : "warning");
    },
    [setOpCostSettings, showToast],
  );

  const handleAddShopFeeOverride = useCallback(() => {
    setOpCostSettings((s) => ({
      ...s,
      shopFeeOverrides: [
        ...(s.shopFeeOverrides || []),
        {
          shopName: "",
          brandPointPct: null,
          ecommerceTaxPct: null,
          feeBaseMode: "",
        } as ShopFeeOverride,
      ],
    }));
  }, [setOpCostSettings]);

  const handleUpdateShopFeeOverride = useCallback(
    (index: number, patch: Partial<ShopFeeOverride>) => {
      setOpCostSettings((s) => {
        const list = [...(s.shopFeeOverrides || [])];
        list[index] = { ...list[index], ...patch };
        return { ...s, shopFeeOverrides: list };
      });
    },
    [setOpCostSettings],
  );

  const handleRemoveShopFeeOverride = useCallback(
    (index: number) => {
      setOpCostSettings((s) => ({
        ...s,
        shopFeeOverrides: (s.shopFeeOverrides || []).filter((_, i) => i !== index),
      }));
    },
    [setOpCostSettings],
  );

  const handleSyncShopsToOverrides = useCallback(() => {
    const names = new Set<string>();
    for (const o of opOrders) names.add(normalizeShopName(o.shopName));
    if (names.size === 0) {
      showToast("请先导入订单（带店铺名）", "warning");
      return;
    }
    setOpCostSettings((s) => {
      const existing = new Map(
        (s.shopFeeOverrides || []).map((x) => [
          normalizeShopName(x.shopName),
          x,
        ]),
      );
      const merged: ShopFeeOverride[] = [];
      for (const name of Array.from(names).sort()) {
        merged.push(
          existing.get(name) || {
            shopName: name,
            brandPointPct: null,
            ecommerceTaxPct: null,
            feeBaseMode: "",
          },
        );
      }
      for (const [k, v] of existing) {
        if (!names.has(k) && String(v.shopName || "").trim()) merged.push(v);
      }
      return { ...s, shopFeeOverrides: merged };
    });
    showToast(`已同步 ${names.size} 个店铺到覆盖表`, "success");
  }, [opOrders, setOpCostSettings, showToast]);

  return {
    updateExpressRule,
    handleResetOpCostSettings,
    handleApplyCostTemplate,
    handleAddShopFeeOverride,
    handleUpdateShopFeeOverride,
    handleRemoveShopFeeOverride,
    handleSyncShopsToOverrides,
  };
}
