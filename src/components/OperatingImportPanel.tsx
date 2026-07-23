import type { Dispatch, SetStateAction } from "react";
import type { CostSettings, AdDay, AdProduct, PddBillLine, PddOrder, ProductSku, OperatingReport, ProductMasterBuildMode } from "../services/pddBusiness";

export interface ProductMasterMetaLite {
  lastFileName: string;
  lastImportedAt: string;
  lastExportedAt: string;
  lastMode: string;
  pendingFillCount: number;
  totalCount: number;
  step: number;
}

export interface OperatingImportPanelProps {
  opShopLabel: string;
  setOpShopLabel: Dispatch<SetStateAction<string>>;
  opDragOver: boolean;
  setOpDragOver: Dispatch<SetStateAction<boolean>>;
  onDrop: (e: React.DragEvent) => void;
  onImport: (expect?: string) => void;
  desktopReady: boolean;
  opOrders: PddOrder[];
  opProducts: ProductSku[];
  opBillLines: PddBillLine[];
  opAds: AdDay[];
  opAdProducts?: AdProduct[];
  opReport: OperatingReport | null;
  opSources: { kind: string; name: string; rows: number; shop?: string }[];
  opCostSettings: CostSettings;
  setOpCostSettings: Dispatch<SetStateAction<CostSettings>>;
  productImportMode: "replace" | "merge";
  setProductImportMode: Dispatch<SetStateAction<"replace" | "merge">>;
  productMasterMeta: ProductMasterMetaLite;
  onExportProductMaster: (mode?: ProductMasterBuildMode) => void;
  onLoadProductMasterFromOrders: (mode?: ProductMasterBuildMode) => void;
  onClearOperating: () => void;
  onBuildReport: () => void;
  onExportOperating: () => void;
  onExportCostSettings: () => void;
  onImportCostSettings: () => void;
  onInvalidateReport: () => void;
  sourceKindLabel: (kind: any) => string;
}

export default function OperatingImportPanel({
  opShopLabel,
  setOpShopLabel,
  opDragOver,
  setOpDragOver,
  onDrop: handleOperatingDrop,
  onImport: handleOperatingImport,
  desktopReady,
  opOrders,
  opProducts,
  opBillLines,
  opAds,
  opAdProducts = [],
  opReport,
  opSources,
  opCostSettings,
  setOpCostSettings,
  productImportMode,
  setProductImportMode,
  productMasterMeta,
  onExportProductMaster: handleExportProductMaster,
  onLoadProductMasterFromOrders: handleLoadProductMasterFromOrders,
  onClearOperating: handleClearOperating,
  onBuildReport: handleBuildOperatingReport,
  onExportOperating: handleExportOperating,
  onExportCostSettings: handleExportCostSettings,
  onImportCostSettings: handleImportCostSettings,
  onInvalidateReport,
  sourceKindLabel,
}: OperatingImportPanelProps) {
  void sourceKindLabel;
  void opSources;
  void handleClearOperating;
  void handleBuildOperatingReport;
  void handleExportOperating;
  void handleExportCostSettings;
  void handleImportCostSettings;
  return (
    <>
          <div className="mb-4 flex flex-wrap items-end gap-3 p-1">
            <label className="flex flex-col gap-1 text-sm min-w-[220px]">
              <span className="text-xs text-gray-500">
                当前导入店铺/账号名（多店对比用）
              </span>
              <input
                value={opShopLabel}
                onChange={(e) => setOpShopLabel(e.target.value)}
                placeholder="例如：主店 / 小号A / 旗舰店"
                className="soft-input"
              />
            </label>
            <div className="text-xs text-gray-500 pb-2">
              留空则尝试从文件名识别，否则记为「默认店铺」。
              商品资料全店共用；订单/账务/推广按店铺标签分开。
            </div>
          </div>

          <div
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpDragOver(false);
            }}
            onDrop={handleOperatingDrop}
            className={`mb-4 rounded-xl border-2 border-dashed p-4 transition-colors ${
              opDragOver
                ? "border-blue-500 bg-blue-50"
                : "border-slate-200 bg-slate-50/80"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-800">
                  拖入多个文件自动识别类型
                </div>
                <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  支持一次拖入订单/账务/商品资料/推广（csv/xlsx/xls），自动分流；也可点下方按钮选择。
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {[
                    {
                      n: 1,
                      label: "导入订单",
                      done: opOrders.length > 0,
                      detail: opOrders.length ? `${opOrders.length}单` : "待导入",
                    },
                    {
                      n: 2,
                      label: "商品成本",
                      done: opProducts.length > 0,
                      detail: opProducts.length ? `${opProducts.length}规格` : "可选",
                    },
                    {
                      n: 3,
                      label: "生成报表",
                      done: !!opReport,
                      detail: opReport ? "已生成" : "待生成",
                    },
                  ].map((s, idx, arr) => (
                    <div key={s.n} className="flex items-center gap-2">
                      <div
                        className={`flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] ${
                          s.done
                            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                            : "bg-white border-slate-200 text-slate-600"
                        }`}
                      >
                        <span
                          className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                            s.done ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {s.done ? "✓" : s.n}
                        </span>
                        <span className="font-medium">{s.label}</span>
                        <span className="text-slate-400">{s.detail}</span>
                      </div>
                      {idx < arr.length - 1 && (
                        <span className="text-slate-300 text-xs">→</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleOperatingImport()}
                disabled={!desktopReady}
                className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-40"
              >
                选择文件（可多选）
              </button>
            </div>
          </div>

          {!opReport && (
            <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <div className="font-medium mb-1">首次使用 / 推荐流程</div>
              <ol className="list-decimal list-inside space-y-0.5 text-xs sm:text-sm text-sky-800">
                <li>导入订单（必选）</li>
                <li>可选：账务明细 / 推广分天</li>
                <li>商品资料：导出待补规格 → Excel 填成本 → 再导入</li>
                <li>点「生成经营报表」查看毛利 / 待补 SKU</li>
              </ol>
              {opOrders.length === 0 ? (
                <div className="mt-2 text-xs text-sky-700">
                  当前还没有订单，先从下面「1. 订单导出」开始。
                </div>
              ) : productMasterMeta.step < 3 || productMasterMeta.pendingFillCount > 0 ? (
                <div className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
                  订单已就绪。
                  {productMasterMeta.pendingFillCount > 0
                    ? `还有 ${productMasterMeta.pendingFillCount} 个规格待填成本，可导出「待补规格」后回导。`
                    : "可导入商品资料，或直接生成报表（无成本时毛利不准）。"}
                </div>
              ) : (
                <div className="mt-2 text-xs text-emerald-800">
                  资料较完整，可直接生成经营报表。
                </div>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <button
              onClick={() => handleOperatingImport("pdd_orders")}
              className="border border-blue-200/80 bg-gradient-to-br from-blue-50 to-indigo-50 hover:shadow-md hover:-translate-y-0.5 transition rounded-2xl p-4 text-left"
            >
              <div className="font-medium text-blue-800">1. 订单导出</div>
              <div className="text-xs text-blue-600 mt-1">
                orders_export*.csv
              </div>
              <div className="text-sm mt-2 text-gray-700">
                已导入 <strong>{opOrders.length}</strong> 单
              </div>
            </button>
            <button
              onClick={() => handleOperatingImport("pdd_bill")}
              className="border border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-teal-50 hover:shadow-md hover:-translate-y-0.5 transition rounded-2xl p-4 text-left"
            >
              <div className="font-medium text-emerald-800">2. 账务明细</div>
              <div className="text-xs text-emerald-600 mt-1">
                pdd-mall-bill-detail*.csv
              </div>
              <div className="text-sm mt-2 text-gray-700">
                已导入 <strong>{opBillLines.length}</strong> 行流水
              </div>
            </button>
                            <div className="border border-violet-200/80 bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl p-3 space-y-2">
              <button
                onClick={() => handleOperatingImport("product_master")}
                className="w-full text-left hover:opacity-90 transition"
              >
                <div className="font-medium text-violet-800">3. 商品资料</div>
                <div className="text-xs text-violet-600 mt-1">
                  商品资料*.xlsx（成本）· 或从订单生成
                </div>
                <div className="text-sm mt-2 text-gray-700">
                  已导入 <strong>{opProducts.length}</strong> 个规格
                </div>
              </button>
              <div className="flex flex-wrap gap-1.5 pt-1 border-t border-violet-100">
                <button
                  type="button"
                  onClick={() => handleExportProductMaster("all")}
                  disabled={opOrders.length === 0}
                  className="text-[11px] px-2 py-1 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40"
                  title="从订单去重导出标准商品资料模板"
                >
                  导出全部规格
                </button>
                <button
                  type="button"
                  onClick={() => handleExportProductMaster("missing_cost")}
                  disabled={opOrders.length === 0}
                  className="text-[11px] px-2 py-1 rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40"
                  title="仅导出尚未匹配成本的规格"
                >
                  导出待补规格
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadProductMasterFromOrders("all")}
                  disabled={opOrders.length === 0}
                  className="text-[11px] px-2 py-1 rounded border border-violet-300 text-violet-800 bg-white hover:bg-violet-50 disabled:opacity-40"
                  title="把订单去重结果载入为当前商品资料（成本可后补）"
                >
                  生成并载入
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpCostSettings((s) => ({
                      ...s,
                      matchBySpecWhenNoCode: !s.matchBySpecWhenNoCode,
                    }));
                    onInvalidateReport();
                  }}
                  className={`text-[11px] px-2 py-1 rounded border ${
                    opCostSettings.matchBySpecWhenNoCode !== false
                      ? "bg-emerald-600 text-white border-emerald-700"
                      : "bg-white text-slate-600 border-slate-300"
                  }`}
                  title="开启后：订单无商家编码时，用商品规格/品名+规格匹配商品资料（生成的无编码资料也能对上）"
                >
                  {opCostSettings.matchBySpecWhenNoCode !== false
                    ? "✓ 无编码按规格匹配"
                    : "无编码按规格匹配"}
                </button>
              </div>
              <div className="text-[10px] text-violet-700/80 leading-snug">
                无商家编码的订单：{opCostSettings.matchBySpecWhenNoCode !== false
                  ? "按「商品规格 / 品名+规格」匹配成本（推荐）"
                  : "不走规格匹配，无编码订单易未匹配"}
              </div>
              <div className="rounded-lg bg-white/80 border border-violet-100 p-2 space-y-1.5">
                <div className="text-[11px] font-medium text-violet-900">商品资料三步</div>
                <div className="flex flex-wrap gap-1 text-[10px]">
                  {[
                    { n: 1 as const, t: "①导出/生成" },
                    { n: 2 as const, t: "②填成本" },
                    { n: 3 as const, t: "③再导入" },
                  ].map((s) => (
                    <span
                      key={s.n}
                      className={`px-1.5 py-0.5 rounded ${
                        productMasterMeta.step === s.n
                          ? "bg-violet-600 text-white"
                          : productMasterMeta.step > s.n
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {s.t}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5 items-center">
                  <button
                    type="button"
                    onClick={() =>
                      setProductImportMode((m) =>
                        m === "merge" ? "replace" : "merge",
                      )
                    }
                    className={`text-[10px] px-2 py-0.5 rounded border ${
                      productImportMode === "merge"
                        ? "bg-violet-600 text-white border-violet-700"
                        : "bg-white text-slate-600 border-slate-300"
                    }`}
                  >
                    {productImportMode === "merge" ? "✓ 合并导入" : "替换导入"}
                  </button>
                  {productMasterMeta.pendingFillCount > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-medium">
                      还有 {productMasterMeta.pendingFillCount} 个待填成本
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-500 leading-snug">
                  {productMasterMeta.lastFileName
                    ? `最近：${productMasterMeta.lastFileName} · ${
                        productMasterMeta.lastImportedAt ||
                        productMasterMeta.lastExportedAt ||
                        "-"
                      } · ${productMasterMeta.totalCount}规格`
                    : "尚未导入/导出商品资料"}
                </div>
              </div>
            </div>
            <button
              onClick={() => handleOperatingImport("ad_daily")}
              className="border border-orange-200/80 bg-gradient-to-br from-orange-50 to-amber-50 hover:shadow-md hover:-translate-y-0.5 transition rounded-2xl p-4 text-left"
            >
              <div className="font-medium text-orange-800">4. 推广分天</div>
              <div className="text-xs text-orange-600 mt-1">
                商品推广*分天数据*.xls
              </div>
              <div className="text-sm mt-2 text-gray-700">
                已导入分天 <strong>{opAds.length}</strong> 天 · 商品推广 <strong>{opAdProducts.length}</strong> 个
              </div>
            </button>
          </div>

    </>
  );
}
