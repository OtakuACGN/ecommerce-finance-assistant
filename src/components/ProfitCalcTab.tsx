import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_PROFIT_PARAMS,
  buildProfitExportSheets,
  calcAll,
  emptySku,
  newSkuId,
  skusFromProductMaster,
  type ProfitModelParams,
  type ProfitSkuInput,
} from "../services/profitCalc";
import type { ProductSku } from "../services/pddBusiness";
import { exportWorkbook } from "../utils/excel";
import { saveDataFile } from "../utils/desktop";

const STORAGE_KEY = "diancaitong_profit_calc_v1";

export interface ProfitCalcTabProps {
  desktopReady: boolean;
  opProducts?: ProductSku[];
  onError: (action: string, error: unknown) => void;
  showToast: (msg: string, type?: "success" | "warning" | "error") => void;
  onGoOperating?: () => void;
}

type Stored = {
  params: ProfitModelParams;
  rows: ProfitSkuInput[];
};

function loadStored(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    if (!parsed?.params || !Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch {
    return null;
  }
}

const DEMO_ROWS: ProfitSkuInput[] = [
  emptySku({
    name: "示例-加热款腰枕",
    sku: "加热款",
    cost: 32,
    pack: 0.3,
    ship: 3,
    bybt: 0,
    price: 59.9,
    currentPrice: 59.9,
  }),
  emptySku({
    name: "示例-基础款腰枕",
    sku: "基础款",
    cost: 22,
    pack: 0.3,
    ship: 3,
    bybt: 0,
    price: 39.9,
    currentPrice: 39.9,
  }),
  emptySku({
    name: "示例-加热按摩",
    sku: "加热按摩",
    cost: 42,
    pack: 0.3,
    ship: 3,
    bybt: 0,
    price: 89.9,
    currentPrice: 89.9,
  }),
];

function healthClass(h: string): string {
  if (h === "健康") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (h === "及格") return "bg-sky-50 text-sky-800 border-sky-200";
  if (h === "偏薄") return "bg-amber-50 text-amber-900 border-amber-200";
  if (h === "亏损/危险") return "bg-rose-50 text-rose-800 border-rose-200";
  return "bg-slate-50 text-slate-500 border-slate-200";
}

function numOrEmpty(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "";
  return String(v);
}

function parseOptNum(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = parseFloat(t.replace(/[,，%]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export default function ProfitCalcTab({
  desktopReady,
  opProducts = [],
  onError,
  showToast,
  onGoOperating,
}: ProfitCalcTabProps) {
  const stored = useMemo(() => loadStored(), []);
  const [params, setParams] = useState<ProfitModelParams>(
    stored?.params || { ...DEFAULT_PROFIT_PARAMS },
  );
  const [rows, setRows] = useState<ProfitSkuInput[]>(
    stored?.rows?.length ? stored.rows : DEMO_ROWS.map((r) => ({ ...r, id: newSkuId() })),
  );
  const [showParams, setShowParams] = useState(false);
  const [persistReady, setPersistReady] = useState(false);

  useEffect(() => {
    setPersistReady(true);
  }, []);

  useEffect(() => {
    if (!persistReady) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ params, rows }));
    } catch {
      /* ignore quota */
    }
  }, [params, rows, persistReady]);

  const { results, summary } = useMemo(
    () => calcAll(rows, params),
    [rows, params],
  );

  const updateRow = (id: string, patch: Partial<ProfitSkuInput>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    setRows((prev) => [...prev, emptySku({ ship: 3, pack: null, bybt: 0 })]);
  };

  const removeRow = (id: string) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  };

  const applySuggest = (id: string, price: number | null) => {
    if (price == null || !Number.isFinite(price)) {
      showToast("无可用建议价", "warning");
      return;
    }
    updateRow(id, { price: Math.round(price * 10) / 10 });
  };

  const handleImportProducts = () => {
    if (!opProducts.length) {
      showToast("请先在经营分析导入商品资料", "warning");
      onGoOperating?.();
      return;
    }
    const mapped = skusFromProductMaster(opProducts as any);
    if (!mapped.length) {
      showToast("商品资料为空", "warning");
      return;
    }
    setRows(mapped);
    showToast(`已导入 ${mapped.length} 条商品资料（可改售价后导出）`, "success");
  };

  const handleResetDemo = () => {
    setParams({ ...DEFAULT_PROFIT_PARAMS });
    setRows(DEMO_ROWS.map((r) => ({ ...r, id: newSkuId() })));
    showToast("已恢复示例数据与默认参数", "success");
  };

  const handleExport = async () => {
    const filled = rows.filter((r) => r.name || r.sku || r.cost || r.price);
    if (!filled.length) {
      showToast("请先填写至少一行资料", "warning");
      return;
    }
    if (!desktopReady) {
      showToast("请在桌面应用中导出 Excel", "warning");
      return;
    }
    try {
      const name = `利润测算_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const save = await saveDataFile(name);
      if (save.canceled || !save.filePath) return;
      const sheets = buildProfitExportSheets(rows, params);
      await exportWorkbook(sheets, save.filePath);
      showToast("已导出利润测算 Excel（含毛利预览/建议价/参数）", "success");
    } catch (e) {
      onError("导出利润测算", e);
    }
  };

  const setParam = <K extends keyof ProfitModelParams>(key: K, raw: string) => {
    const v = parseFloat(raw);
    if (!Number.isFinite(v)) return;
    setParams((p) => ({ ...p, [key]: v }));
  };

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className="max-w-[1680px] mx-auto space-y-4">
        {/* 标题区 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-800">利润测算</h2>
              <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-3xl">
                填货值 / 运费 / 售价，实时看期望毛利与建议挂价；填好后一键导出 Excel（毛利预览 + 三档建议价 + 参数说明）。
                模型与经营分析口径一致：售后按售前/发货后拆分，广告 = 售价÷ROI。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowParams((v) => !v)}
                className="px-3 py-1.5 rounded-lg text-sm border border-slate-300 bg-white hover:bg-slate-50"
              >
                {showParams ? "收起参数" : "模型参数"}
              </button>
              <button
                type="button"
                onClick={handleImportProducts}
                className="px-3 py-1.5 rounded-lg text-sm border border-slate-300 bg-white hover:bg-slate-50"
              >
                从商品资料导入
              </button>
              <button
                type="button"
                onClick={addRow}
                className="px-3 py-1.5 rounded-lg text-sm border border-violet-300 text-violet-700 bg-violet-50 hover:bg-violet-100"
              >
                + 添加SKU
              </button>
              <button
                type="button"
                onClick={() => void handleExport()}
                className="px-3 py-1.5 rounded-lg text-sm bg-emerald-600 text-white hover:bg-emerald-700"
              >
                导出 Excel
              </button>
            </div>
          </div>

          {/* KPI */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {[
              ["有售价SKU", String(summary.skuCount)],
              ["售价合计", summary.totalPrice.toFixed(2)],
              ["期望净利合计", summary.totalProfit.toFixed(2)],
              ["平均利润率", (summary.avgMargin * 100).toFixed(1) + "%"],
              ["健康/及格", `${summary.healthy}/${summary.ok}`],
              ["偏薄/危险", `${summary.thin}/${summary.danger}`],
            ].map(([k, v]) => (
              <div
                key={k}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <div className="text-[11px] text-slate-500">{k}</div>
                <div className="text-base font-semibold text-slate-800 tabular-nums">
                  {v}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 参数面板 */}
        {showParams && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-slate-800">模型参数（全局）</div>
              <button
                type="button"
                onClick={handleResetDemo}
                className="text-xs text-slate-500 hover:text-slate-800 underline"
              >
                恢复默认参数+示例
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {(
                [
                  ["platformRate", "平台扣点", true],
                  ["brandRate", "品牌扣点", true],
                  ["bybtRate", "百亿扣点", true],
                  ["defaultRoi", "默认ROI", false],
                  ["lightRoi", "轻投ROI", false],
                  ["heavyRoi", "重投ROI", false],
                  ["refundRate", "整体售后率", true],
                  ["preRefundShare", "售前占比", true],
                  ["postShipShare", "发货后占比", true],
                  ["insurance", "运费险(元)", false],
                  ["defaultPack", "默认包材(元)", false],
                  ["targetMargin", "目标净利率", true],
                ] as const
              ).map(([key, label, isPct]) => (
                <label key={key} className="text-xs text-slate-600 space-y-1">
                  <span className="block">{label}</span>
                  <input
                    type="number"
                    step={isPct ? "0.001" : "0.1"}
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-amber-50"
                    value={
                      isPct
                        ? Number((params[key] * 100).toFixed(3))
                        : params[key]
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (isPct) {
                        const v = parseFloat(raw);
                        if (!Number.isFinite(v)) return;
                        setParams((p) => ({ ...p, [key]: v / 100 }));
                      } else {
                        setParam(key, raw);
                      }
                    }}
                  />
                  {isPct && (
                    <span className="text-[10px] text-slate-400">单位：%</span>
                  )}
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500 leading-relaxed">
              售后损耗 = (售后率×售前)×广告 + (售后率×发货后)×(广告+运费险+运费)。
              行内「行ROI / 行售后率」可覆盖全局。目标净利率用于反推建议价。
            </p>
          </div>
        )}

        {/* 表格 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[1400px] w-full text-sm">
              <thead>
                <tr className="bg-slate-800 text-white text-xs">
                  {[
                    "品名",
                    "规格",
                    "货值",
                    "包材",
                    "运费",
                    "百亿",
                    "行ROI",
                    "行售后%",
                    "试算售价",
                    "广告",
                    "售后损耗",
                    "期望净利",
                    "利润率",
                    "健康度",
                    "建议价",
                    "距建议",
                    "轻/店/重投建议",
                    "操作",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-2 py-2 font-medium text-left whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r, idx) => (
                  <tr
                    key={r.id}
                    className={idx % 2 ? "bg-slate-50/80" : "bg-white"}
                  >
                    <td className="px-1.5 py-1">
                      <input
                        className="w-28 rounded border border-slate-200 px-1.5 py-1 text-xs bg-amber-50"
                        value={r.name}
                        onChange={(e) => updateRow(r.id, { name: e.target.value })}
                        placeholder="品名"
                      />
                    </td>
                    <td className="px-1.5 py-1">
                      <input
                        className="w-24 rounded border border-slate-200 px-1.5 py-1 text-xs bg-amber-50"
                        value={r.sku}
                        onChange={(e) => updateRow(r.id, { sku: e.target.value })}
                        placeholder="规格"
                      />
                    </td>
                    {(
                      [
                        ["cost", r.cost],
                        ["pack", r.pack],
                        ["ship", r.ship],
                      ] as const
                    ).map(([key, val]) => (
                      <td key={key} className="px-1.5 py-1">
                        <input
                          type="number"
                          step="0.01"
                          className="w-16 rounded border border-slate-200 px-1.5 py-1 text-xs bg-amber-50 tabular-nums"
                          value={
                            key === "pack"
                              ? numOrEmpty(val as number | null)
                              : (val as number)
                          }
                          placeholder={key === "pack" ? "默认" : ""}
                          onChange={(e) => {
                            if (key === "pack") {
                              updateRow(r.id, {
                                pack: parseOptNum(e.target.value),
                              });
                            } else {
                              const v = parseFloat(e.target.value);
                              updateRow(r.id, {
                                [key]: Number.isFinite(v) ? v : 0,
                              } as any);
                            }
                          }}
                        />
                      </td>
                    ))}
                    <td className="px-1.5 py-1">
                      <select
                        className="w-14 rounded border border-slate-200 px-1 py-1 text-xs bg-amber-50"
                        value={r.bybt}
                        onChange={(e) =>
                          updateRow(r.id, {
                            bybt: Number(e.target.value) as 0 | 1,
                          })
                        }
                      >
                        <option value={0}>否</option>
                        <option value={1}>是</option>
                      </select>
                    </td>
                    <td className="px-1.5 py-1">
                      <input
                        type="number"
                        step="0.1"
                        className="w-14 rounded border border-slate-200 px-1.5 py-1 text-xs bg-amber-50"
                        value={numOrEmpty(r.rowRoi)}
                        placeholder="默认"
                        onChange={(e) =>
                          updateRow(r.id, { rowRoi: parseOptNum(e.target.value) })
                        }
                      />
                    </td>
                    <td className="px-1.5 py-1">
                      <input
                        type="number"
                        step="0.1"
                        className="w-14 rounded border border-slate-200 px-1.5 py-1 text-xs bg-amber-50"
                        value={
                          r.rowRefundRate == null
                            ? ""
                            : Number((r.rowRefundRate * 100).toFixed(2))
                        }
                        placeholder="默认"
                        onChange={(e) => {
                          const v = parseOptNum(e.target.value);
                          updateRow(r.id, {
                            rowRefundRate: v == null ? null : v / 100,
                          });
                        }}
                      />
                    </td>
                    <td className="px-1.5 py-1">
                      <input
                        type="number"
                        step="0.1"
                        className="w-16 rounded border border-emerald-300 px-1.5 py-1 text-xs bg-emerald-50 font-medium tabular-nums"
                        value={r.price || ""}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          updateRow(r.id, {
                            price: Number.isFinite(v) ? v : 0,
                          });
                        }}
                      />
                    </td>
                    <td className="px-2 py-1 tabular-nums text-xs text-slate-600">
                      {r.price > 0 ? r.ad.toFixed(2) : "—"}
                    </td>
                    <td className="px-2 py-1 tabular-nums text-xs text-slate-600">
                      {r.price > 0 ? r.aftersale.toFixed(2) : "—"}
                    </td>
                    <td
                      className={`px-2 py-1 tabular-nums text-xs font-semibold ${
                        r.price > 0 && r.profit < 0
                          ? "text-rose-600"
                          : "text-slate-800"
                      }`}
                    >
                      {r.price > 0 ? r.profit.toFixed(2) : "—"}
                    </td>
                    <td className="px-2 py-1 tabular-nums text-xs font-semibold">
                      {r.price > 0 ? (r.margin * 100).toFixed(1) + "%" : "—"}
                    </td>
                    <td className="px-1.5 py-1">
                      <span
                        className={`inline-block text-[11px] px-1.5 py-0.5 rounded border ${healthClass(
                          r.health,
                        )}`}
                      >
                        {r.health}
                      </span>
                    </td>
                    <td className="px-2 py-1 tabular-nums text-xs text-sky-700 font-medium">
                      {r.suggestedPrice != null
                        ? r.suggestedPrice.toFixed(2)
                        : "—"}
                    </td>
                    <td
                      className={`px-2 py-1 tabular-nums text-xs ${
                        (r.gapToSuggest || 0) > 0.5
                          ? "text-amber-700"
                          : "text-slate-500"
                      }`}
                    >
                      {r.gapToSuggest != null
                        ? (r.gapToSuggest > 0 ? "+" : "") +
                          r.gapToSuggest.toFixed(2)
                        : "—"}
                    </td>
                    <td className="px-1.5 py-1 text-[11px] text-slate-600 whitespace-nowrap">
                      {r.lightSuggest != null
                        ? r.lightSuggest.toFixed(1)
                        : "—"}
                      {" / "}
                      {r.defaultSuggest != null
                        ? r.defaultSuggest.toFixed(1)
                        : "—"}
                      {" / "}
                      {r.heavySuggest != null
                        ? r.heavySuggest.toFixed(1)
                        : "—"}
                    </td>
                    <td className="px-1.5 py-1 whitespace-nowrap">
                      <button
                        type="button"
                        className="text-[11px] text-emerald-700 hover:underline mr-2"
                        onClick={() => applySuggest(r.id, r.suggestedPrice)}
                      >
                        用建议价
                      </button>
                      <button
                        type="button"
                        className="text-[11px] text-slate-400 hover:text-rose-600"
                        onClick={() => removeRow(r.id)}
                      >
                        删
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              黄格可编辑 · 利润率≥15% 对准目标 · 点「用建议价」可一键填入反推价
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={addRow}
                className="px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-50"
              >
                + 行
              </button>
              <button
                type="button"
                onClick={() => void handleExport()}
                className="px-2.5 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
              >
                导出 Excel
              </button>
            </div>
          </div>
        </div>

        {/* 毛利预览条 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-sm font-semibold text-slate-800 mb-3">
            毛利预览条（有售价的行）
          </div>
          <div className="space-y-2">
            {results
              .filter((r) => r.price > 0)
              .map((r) => {
                const pctBar = Math.min(100, Math.max(0, (r.margin / 0.3) * 100));
                const barColor =
                  r.margin < 0.05
                    ? "bg-rose-500"
                    : r.margin < 0.12
                      ? "bg-amber-400"
                      : r.margin < 0.18
                        ? "bg-sky-500"
                        : "bg-emerald-500";
                return (
                  <div key={r.id} className="flex items-center gap-3 text-xs">
                    <div className="w-36 truncate text-slate-700" title={r.name}>
                      {r.name || r.sku || "未命名"}
                    </div>
                    <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${barColor}`}
                        style={{ width: `${pctBar}%` }}
                      />
                    </div>
                    <div className="w-16 text-right tabular-nums font-medium text-slate-800">
                      {(r.margin * 100).toFixed(1)}%
                    </div>
                    <div className="w-16 text-right tabular-nums text-slate-500">
                      ¥{r.profit.toFixed(1)}
                    </div>
                    <div className="w-14 text-right tabular-nums text-slate-400">
                      ¥{r.price.toFixed(1)}
                    </div>
                  </div>
                );
              })}
            {!results.some((r) => r.price > 0) && (
              <div className="text-slate-400 text-sm py-4 text-center">
                请先填写试算售价
              </div>
            )}
          </div>
          <p className="mt-3 text-[11px] text-slate-400">
            条长满格约等于利润率 30%。颜色：红&lt;5% · 黄 5–12% · 蓝 12–18% · 绿≥18%
          </p>
        </div>
      </div>
    </div>
  );
}
