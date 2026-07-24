import type { Dispatch, SetStateAction } from "react";
import {
  COST_SETTING_TEMPLATES,
  type CostSettings,
  type ExpressShipRule,
  type ShopFeeOverride,
} from "../services/pddBusiness";

export interface OperatingSettingsPanelProps {
  settings: CostSettings;
  setSettings: Dispatch<SetStateAction<CostSettings>>;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  highlight: null | "brand";
  setHighlight: Dispatch<SetStateAction<null | "brand">>;
  onOpenBrandPoint: () => void;
  onReset: () => void;
  onApplyTemplate: (templateId: string) => void;
  onAddShopOverride: () => void;
  onUpdateShopOverride: (index: number, patch: Partial<ShopFeeOverride>) => void;
  onRemoveShopOverride: (index: number) => void;
  onSyncShops: () => void;
  onUpdateExpressRule: (index: number, patch: Partial<ExpressShipRule>) => void;
}

/** 经营参数：运费/包材/退货/广告/品牌扣点/店铺覆盖/快递规则 */
export default function OperatingSettingsPanel({
  settings: opCostSettings,
  setSettings: setOpCostSettings,
  open: opSettingsOpen,
  setOpen: setOpSettingsOpen,
  highlight: opSettingsHighlight,
  setHighlight: setOpSettingsHighlight,
  onOpenBrandPoint: openBrandPointSettings,
  onReset: handleResetOpCostSettings,
  onApplyTemplate: handleApplyCostTemplate,
  onAddShopOverride: handleAddShopFeeOverride,
  onUpdateShopOverride: handleUpdateShopFeeOverride,
  onRemoveShopOverride: handleRemoveShopFeeOverride,
  onSyncShops: handleSyncShopsToOverrides,
  onUpdateExpressRule: updateExpressRule,
}: OperatingSettingsPanelProps) {
  return (
          <div className="border border-gray-200 rounded-xl p-4 mb-4 bg-gray-50 space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <button
                type="button"
                className="font-medium text-gray-800 text-left hover:text-blue-700"
                onClick={() => setOpSettingsOpen((v) => !v)}
              >
                运费 / 包材 / 退货 / 广告 / 品牌扣点参数
                <span className="ml-2 text-xs font-normal text-slate-500">
                  {opSettingsOpen ? "收起 ▲" : "展开 ▼"}
                </span>
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openBrandPointSettings}
                  className="text-xs px-2 py-1 rounded border border-violet-300 text-violet-700 bg-violet-50 hover:bg-violet-100"
                >
                  填写品牌扣点
                </button>
                <button
                  type="button"
                  onClick={handleResetOpCostSettings}
                  className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-white"
                >
                  恢复默认
                </button>
              </div>
            </div>
            {!opSettingsOpen && (
              <div className="text-xs text-slate-500 leading-relaxed">
                当前：品牌扣点{" "}
                {(opCostSettings.brandPointPct || 0) > 0
                  ? `${opCostSettings.brandPointPct}%`
                  : "未填"}
                · 电商税{" "}
                {(opCostSettings.ecommerceTaxPct || 0) > 0
                  ? `${opCostSettings.ecommerceTaxPct}%`
                  : "未填"}
                · 包材 ¥{opCostSettings.defaultPackCost}
                · 广告分摊 {opCostSettings.adAllocateMode}
                · 账务平台费
                {opCostSettings.feeStackMode === "settings_only"
                  ? "不进毛利"
                  : "进毛利"}
              </div>
            )}
            {opSettingsOpen && (
            <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">默认首重(kg)</span>
                <input
                  type="number"
                  step="0.1"
                  value={opCostSettings.firstWeightKg}
                  onChange={(e) =>
                    setOpCostSettings((s) => ({
                      ...s,
                      firstWeightKg: Number(e.target.value) || 0,
                    }))
                  }
                  className="border rounded-lg px-2 py-1"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">默认首重运费(元)</span>
                <input
                  type="number"
                  step="0.1"
                  value={opCostSettings.firstWeightFee}
                  onChange={(e) =>
                    setOpCostSettings((s) => ({
                      ...s,
                      firstWeightFee: Number(e.target.value) || 0,
                    }))
                  }
                  className="border rounded-lg px-2 py-1"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">默认续重(kg)</span>
                <input
                  type="number"
                  step="0.1"
                  value={opCostSettings.additionalWeightKg}
                  onChange={(e) =>
                    setOpCostSettings((s) => ({
                      ...s,
                      additionalWeightKg: Number(e.target.value) || 1,
                    }))
                  }
                  className="border rounded-lg px-2 py-1"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">默认续重运费(元)</span>
                <input
                  type="number"
                  step="0.1"
                  value={opCostSettings.additionalWeightFee}
                  onChange={(e) =>
                    setOpCostSettings((s) => ({
                      ...s,
                      additionalWeightFee: Number(e.target.value) || 0,
                    }))
                  }
                  className="border rounded-lg px-2 py-1"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">默认包材价(元/件)</span>
                <input
                  type="number"
                  step="0.01"
                  value={opCostSettings.defaultPackCost}
                  onChange={(e) =>
                    setOpCostSettings((s) => ({
                      ...s,
                      defaultPackCost: Number(e.target.value) || 0,
                    }))
                  }
                  className="border rounded-lg px-2 py-1"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">缺省单件重量(kg)</span>
                <input
                  type="number"
                  step="0.1"
                  value={opCostSettings.defaultWeightKg}
                  onChange={(e) =>
                    setOpCostSettings((s) => ({
                      ...s,
                      defaultWeightKg: Number(e.target.value) || 0.1,
                    }))
                  }
                  className="border rounded-lg px-2 py-1"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">退货损耗比例(0-1)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={opCostSettings.returnRestockRate}
                  onChange={(e) =>
                    setOpCostSettings((s) => ({
                      ...s,
                      returnRestockRate: Math.min(
                        1,
                        Math.max(0, Number(e.target.value) || 0),
                      ),
                    }))
                  }
                  className="border rounded-lg px-2 py-1"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">二次包装/入库(元/单)</span>
                <input
                  type="number"
                  step="0.1"
                  value={opCostSettings.returnRepackCost}
                  onChange={(e) =>
                    setOpCostSettings((s) => ({
                      ...s,
                      returnRepackCost: Number(e.target.value) || 0,
                    }))
                  }
                  className="border rounded-lg px-2 py-1"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">推广费处理</span>
                <select
                  value={opCostSettings.adAllocateMode}
                  onChange={(e) =>
                    setOpCostSettings((s) => ({
                      ...s,
                      adAllocateMode: e.target
                        .value as CostSettings["adAllocateMode"],
                    }))
                  }
                  className="border rounded-lg px-2 py-1 bg-white"
                  title="优先按商品推广的商品ID分摊到订单；无商品推广时仅汇总扣总广告"
                >
                  <option value="by_product">按商品ID分摊(推荐·有商品推广时)</option>
                  <option value="none">不摊到单(仅汇总扣总广告)</option>
                  <option value="by_gmv">强制按全店成交额均摊(不推荐)</option>
                  <option value="by_order_count">强制按订单数均摊(不推荐)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">高逆向率阈值%</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round((opCostSettings.anomalyHighRefundRate ?? 0.3) * 100)}
                  onChange={(e) =>
                    setOpCostSettings((s) => ({
                      ...s,
                      anomalyHighRefundRate: Math.min(
                        1,
                        Math.max(0, (Number(e.target.value) || 0) / 100),
                      ),
                    }))
                  }
                  className="border rounded-lg px-2 py-1 bg-white"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">高逆向最少发货单</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={opCostSettings.anomalyHighRefundMinShipped ?? 3}
                  onChange={(e) =>
                    setOpCostSettings((s) => ({
                      ...s,
                      anomalyHighRefundMinShipped: Math.max(
                        1,
                        Math.round(Number(e.target.value) || 3),
                      ),
                    }))
                  }
                  className="border rounded-lg px-2 py-1 bg-white"
                />
              </label>
              <label
                id="op-settings-brand"
                className={`flex flex-col gap-1 col-span-2 sm:col-span-2 rounded-xl p-2 -m-2 ${
                  opSettingsHighlight === "brand"
                    ? "ring-2 ring-violet-400 bg-violet-50/80"
                    : ""
                }`}
              >
                <span className="text-xs text-gray-500">
                  品牌扣点(%) · 选填
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    id="op-brand-point-input"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={
                      !opCostSettings.brandPointPct
                        ? ""
                        : opCostSettings.brandPointPct
                    }
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      setOpSettingsHighlight(null);
                      setOpCostSettings((s) => ({
                        ...s,
                        brandPointPct:
                          raw === ""
                            ? 0
                            : Math.min(
                                100,
                                Math.max(0, Number(raw) || 0),
                              ),
                      }));
                    }}
                    className="border rounded-lg px-2 py-1 w-28"
                    placeholder="空=不计提"
                  />
                  <span className="text-[11px] text-slate-500 leading-snug">
                    与账务「技术服务费」无关。有品牌合作再填，如 5 表示 5%。
                    也可在下方「按店铺覆盖」分店填写。
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {[0, 3, 5, 8].map((p) => (
                    <button
                      key={`bp-${p}`}
                      type="button"
                      onClick={() =>
                        setOpCostSettings((s) => ({
                          ...s,
                          brandPointPct: p,
                        }))
                      }
                      className={`px-2 py-0.5 rounded-full text-[11px] border ${
                        (opCostSettings.brandPointPct || 0) === p
                          ? "bg-violet-600 text-white border-violet-600"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {p === 0 ? "清空" : `${p}%`}
                    </button>
                  ))}
                </div>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">电商税(%) · 选填</span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={
                    !opCostSettings.ecommerceTaxPct
                      ? ""
                      : opCostSettings.ecommerceTaxPct
                  }
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    setOpCostSettings((s) => ({
                      ...s,
                      ecommerceTaxPct:
                        raw === ""
                          ? 0
                          : Math.min(
                              100,
                              Math.max(0, Number(raw) || 0),
                            ),
                    }));
                  }}
                  className="border rounded-lg px-2 py-1"
                  placeholder="空=不计提"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">扣点/税计算基数</span>
                <select
                  value={opCostSettings.feeBaseMode || "revenue"}
                  onChange={(e) =>
                    setOpCostSettings((s) => ({
                      ...s,
                      feeBaseMode: e.target
                        .value as CostSettings["feeBaseMode"],
                    }))
                  }
                  className="border rounded-lg px-2 py-1 bg-white"
                >
                  <option value="revenue">确认收入（推荐）</option>
                  <option value="merchantReceived">商家实收</option>
                  <option value="goodsTotal">商品总价</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 col-span-2 sm:col-span-2">
                <span className="text-xs text-gray-500">
                  账务平台费进毛利（技术服务费/其他费用）
                </span>
                <select
                  value={
                    opCostSettings.feeStackMode === "settings_only"
                      ? "settings_only"
                      : "both"
                  }
                  onChange={(e) =>
                    setOpCostSettings((s) => ({
                      ...s,
                      feeStackMode: e.target
                        .value as CostSettings["feeStackMode"],
                    }))
                  }
                  className="border rounded-lg px-2 py-1 bg-white"
                >
                  <option value="both">
                    计入毛利（默认，与品牌扣点无关）
                  </option>
                  <option value="settings_only">
                    不计入毛利（账务仍展示，仅排查用）
                  </option>
                </select>
                <span className="text-[11px] text-slate-500 mt-0.5">
                  平台费来自账务明细；品牌扣点来自上方选填，二者独立、不会互相覆盖。
                </span>
              </label>
              <label className="flex items-center gap-2 mt-5">
                <input
                  type="checkbox"
                  checked={opCostSettings.forceDefaultPack}
                  onChange={(e) =>
                    setOpCostSettings((s) => ({
                      ...s,
                      forceDefaultPack: e.target.checked,
                    }))
                  }
                />
                <span className="text-xs text-gray-700">强制统一包材价</span>
              </label>
              <label className="flex items-center gap-2 mt-5">
                <input
                  type="checkbox"
                  checked={opCostSettings.countProductCostOnRefundedShip}
                  onChange={(e) =>
                    setOpCostSettings((s) => ({
                      ...s,
                      countProductCostOnRefundedShip: e.target.checked,
                    }))
                  }
                />
                <span className="text-xs text-gray-700">
                  发货后退款仍计全额商品成本
                </span>
              </label>
              <label className="flex items-center gap-2 mt-5">
                <input
                  type="checkbox"
                  checked={opCostSettings.usePostageIncome}
                  onChange={(e) =>
                    setOpCostSettings((s) => ({
                      ...s,
                      usePostageIncome: e.target.checked,
                    }))
                  }
                />
                <span className="text-xs text-gray-700">订单邮费抵扣运费成本</span>
              </label>
            </div>

            <div className="mt-3 p-3 rounded-xl border border-indigo-100 bg-indigo-50/50">
              <div className="mb-2">
                <div className="text-xs font-semibold text-indigo-900">一键参数模板</div>
                <div className="text-[11px] text-indigo-700/80">
                  只覆盖模板字段，其余设置与店铺覆盖保留
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {COST_SETTING_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    title={t.desc}
                    onClick={() => handleApplyCostTemplate(t.id)}
                    className="px-2.5 py-1.5 text-xs rounded-lg border border-indigo-200 bg-white text-indigo-800 hover:bg-indigo-100"
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 p-3 rounded-xl border border-violet-100 bg-violet-50/40">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div>
                  <div className="text-xs font-semibold text-violet-900">
                    店铺品牌扣点 / 电商税覆盖（≠平台服务费）
                  </div>
                  <div className="text-[11px] text-violet-700/80">
                    百分比留空=跟随全局默认；多店不同扣点时用这个
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSyncShopsToOverrides}
                    className="px-2.5 py-1 text-xs rounded-lg border border-violet-200 bg-white text-violet-800 hover:bg-violet-100"
                  >
                    从订单同步店铺
                  </button>
                  <button
                    type="button"
                    onClick={handleAddShopFeeOverride}
                    className="px-2.5 py-1 text-xs rounded-lg bg-violet-600 text-white hover:bg-violet-700"
                  >
                    + 添加店铺
                  </button>
                </div>
              </div>
              {(opCostSettings.shopFeeOverrides || []).length === 0 ? (
                <div className="text-[11px] text-slate-500">
                  暂无覆盖行。导入订单后点「从订单同步店铺」，再按店填扣点/税。
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="py-1 pr-2 font-medium">店铺名</th>
                        <th className="py-1 pr-2 font-medium">扣点%</th>
                        <th className="py-1 pr-2 font-medium">税%</th>
                        <th className="py-1 pr-2 font-medium">基数</th>
                        <th className="py-1 font-medium">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(opCostSettings.shopFeeOverrides || []).map((row, idx) => (
                        <tr key={idx} className="border-t border-violet-100/80">
                          <td className="py-1.5 pr-2">
                            <input
                              className="border rounded-lg px-2 py-1 w-40 bg-white"
                              value={row.shopName}
                              placeholder="店铺名"
                              onChange={(e) =>
                                handleUpdateShopFeeOverride(idx, {
                                  shopName: e.target.value,
                                })
                              }
                            />
                          </td>
                          <td className="py-1.5 pr-2">
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              className="border rounded-lg px-2 py-1 w-20 bg-white"
                              placeholder="全局"
                              value={row.brandPointPct ?? ""}
                              onChange={(e) =>
                                handleUpdateShopFeeOverride(idx, {
                                  brandPointPct:
                                    e.target.value === ""
                                      ? null
                                      : Math.max(0, Number(e.target.value) || 0),
                                })
                              }
                            />
                          </td>
                          <td className="py-1.5 pr-2">
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              className="border rounded-lg px-2 py-1 w-20 bg-white"
                              placeholder="全局"
                              value={row.ecommerceTaxPct ?? ""}
                              onChange={(e) =>
                                handleUpdateShopFeeOverride(idx, {
                                  ecommerceTaxPct:
                                    e.target.value === ""
                                      ? null
                                      : Math.max(0, Number(e.target.value) || 0),
                                })
                              }
                            />
                          </td>
                          <td className="py-1.5 pr-2">
                            <select
                              className="border rounded-lg px-2 py-1 bg-white"
                              value={row.feeBaseMode || ""}
                              onChange={(e) =>
                                handleUpdateShopFeeOverride(idx, {
                                  feeBaseMode: e.target
                                    .value as ShopFeeOverride["feeBaseMode"],
                                })
                              }
                            >
                              <option value="">跟随全局</option>
                              <option value="revenue">确认收入</option>
                              <option value="merchantReceived">商家实收</option>
                              <option value="goodsTotal">商品总价</option>
                            </select>
                          </td>
                          <td className="py-1.5">
                            <button
                              type="button"
                              onClick={() => handleRemoveShopFeeOverride(idx)}
                              className="text-red-600 hover:underline"
                            >
                              删除
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <div className="text-sm font-medium text-gray-800 mb-2">
                分快递运费规则（优先于默认首续重）
              </div>
              <div className="overflow-x-auto border border-gray-200 rounded-lg bg-white">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-100 text-gray-600">
                    <tr>
                      <th className="px-2 py-1.5 text-left">快递</th>
                      <th className="px-2 py-1.5 text-left">匹配关键词</th>
                      <th className="px-2 py-1.5 text-left">首重kg</th>
                      <th className="px-2 py-1.5 text-left">首重费</th>
                      <th className="px-2 py-1.5 text-left">续重kg</th>
                      <th className="px-2 py-1.5 text-left">续重费</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opCostSettings.expressRules.map((rule, idx) => (
                      <tr
                        key={rule.label + idx}
                        className="border-t border-gray-100"
                      >
                        <td className="px-2 py-1">
                          <input
                            value={rule.label}
                            onChange={(e) =>
                              updateExpressRule(idx, {
                                label: e.target.value,
                              })
                            }
                            className="w-20 border rounded px-1 py-0.5"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            value={rule.keywords}
                            onChange={(e) =>
                              updateExpressRule(idx, {
                                keywords: e.target.value,
                              })
                            }
                            className="w-40 border rounded px-1 py-0.5"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="number"
                            step="0.1"
                            value={rule.firstWeightKg}
                            onChange={(e) =>
                              updateExpressRule(idx, {
                                firstWeightKg: Number(e.target.value) || 0,
                              })
                            }
                            className="w-16 border rounded px-1 py-0.5"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="number"
                            step="0.1"
                            value={rule.firstWeightFee}
                            onChange={(e) =>
                              updateExpressRule(idx, {
                                firstWeightFee:
                                  Number(e.target.value) || 0,
                              })
                            }
                            className="w-16 border rounded px-1 py-0.5"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="number"
                            step="0.1"
                            value={rule.additionalWeightKg}
                            onChange={(e) =>
                              updateExpressRule(idx, {
                                additionalWeightKg:
                                  Number(e.target.value) || 1,
                              })
                            }
                            className="w-16 border rounded px-1 py-0.5"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="number"
                            step="0.1"
                            value={rule.additionalWeightFee}
                            onChange={(e) =>
                              updateExpressRule(idx, {
                                additionalWeightFee:
                                  Number(e.target.value) || 0,
                              })
                            }
                            className="w-16 border rounded px-1 py-0.5"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-[11px] text-gray-500">
              毛利=确认收入-商品成本-包材-净运费(运费-邮费)-账务平台费-退货损耗-二次包装-品牌扣点-电商税。商品/规格维度不均摊广告（广告非按单真实分摊）；整体汇总可按「推广费处理」扣总广告花费。品牌扣点/电商税默认空不计提；与账务技术服务费是两回事。部分退按实收/账务比对确认收入。
              参数自动记住（本机 localStorage）。改完参数后请重新点「生成经营报表」。
            </p>
            </div>
            )}
          </div>

  );
}
