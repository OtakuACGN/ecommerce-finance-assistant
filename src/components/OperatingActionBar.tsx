import type { OperatingReport } from "../services/pddBusiness";
import type { ProductMasterMeta } from "../services/productMasterMeta";
import type { ProductMasterBuildMode } from "../services/pddBusiness";

export interface OperatingActionBarProps {
  opReport: OperatingReport | null;
  opOrdersLen: number;
  hasWorkspaceData: boolean;
  reportBusy?: boolean;
  productMasterMeta: ProductMasterMeta;
  onBuildReport: () => void;
  onExportOperating: () => void;
  onExportAnomalies: () => void;
  onCopyUnmatchedSkus: () => void;
  onCopyBossOnePager: () => void;
  onCopyBossOnePagerTsv: () => void;
  onExportProductMaster: (mode: ProductMasterBuildMode) => void;
  onExportCostSettings: () => void;
  onImportCostSettings: () => void;
  onExportWorkspace: () => void;
  onImportWorkspace: () => void;
  onJumpUnmatched: () => void;
}

/** 经营分析主操作条：生成/导出/待补引导 */
export default function OperatingActionBar({
  opReport,
  opOrdersLen,
  hasWorkspaceData,
  reportBusy = false,
  productMasterMeta,
  onBuildReport,
  onExportOperating,
  onExportAnomalies,
  onCopyUnmatchedSkus,
  onCopyBossOnePager,
  onCopyBossOnePagerTsv,
  onExportProductMaster,
  onExportCostSettings,
  onImportCostSettings,
  onExportWorkspace,
  onImportWorkspace,
  onJumpUnmatched,
}: OperatingActionBarProps) {
  const unmatchedN = opReport?.unmatchedSkus?.length || 0;
  const costUnmatched = opReport?.summary?.costUnmatchedOrders || 0;
  const costTotal = opReport?.summary?.orderCount || 0;
  const matchRate =
    costTotal > 0
      ? Math.round(((costTotal - costUnmatched) / costTotal) * 1000) / 10
      : 100;

  return (
    <div className="space-y-2 mb-4">
      {(productMasterMeta.pendingFillCount > 0 || unmatchedN > 0) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {productMasterMeta.pendingFillCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-900 border border-amber-200 px-2.5 py-1">
              商品资料待填成本 <strong>{productMasterMeta.pendingFillCount}</strong>
              <button
                type="button"
                className="underline ml-1"
                onClick={() => onExportProductMaster("missing_cost")}
              >
                导出待补
              </button>
            </span>
          )}
          {unmatchedN > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 text-violet-900 border border-violet-200 px-2.5 py-1">
              报表待补SKU <strong>{unmatchedN}</strong>
              <button type="button" className="underline ml-1" onClick={onJumpUnmatched}>
                查看
              </button>
            </span>
          )}
          {opReport && costTotal > 0 && (
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${
                matchRate >= 95
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : matchRate >= 80
                    ? "bg-sky-50 text-sky-800 border-sky-200"
                    : "bg-rose-50 text-rose-800 border-rose-200"
              }`}
              title="订单成本匹配率（按订单笔数）"
            >
              成本匹配率 <strong>{matchRate}%</strong>
              <span className="text-[10px] opacity-80">
                ({costTotal - costUnmatched}/{costTotal})
              </span>
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onBuildReport}
            disabled={reportBusy}
            className="btn-primary px-4 py-2"
          >
            {reportBusy ? "正在后台计算…" : "生成经营报表"}
          </button>
          <button
            type="button"
            onClick={onExportOperating}
            disabled={!opReport}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            导出 Excel
          </button>
          <button
            type="button"
            onClick={onExportAnomalies}
            disabled={!opReport}
            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-40"
          >
            导出异常
          </button>
          <button
            type="button"
            onClick={onCopyUnmatchedSkus}
            disabled={!opReport || unmatchedN === 0}
            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-40"
          >
            复制待补 SKU
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-teal-200 bg-white p-0.5">
            <button
              type="button"
              onClick={onExportWorkspace}
              disabled={!hasWorkspaceData}
              className="rounded-lg bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-800 hover:bg-teal-100 disabled:opacity-40"
              title="备份订单、账务、商品、推广和经营参数"
            >
              备份工作区
            </button>
            <button
              type="button"
              onClick={onImportWorkspace}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-teal-800 hover:bg-teal-50"
              title="恢复工作区并按当前版本重新计算报表"
            >
              恢复
            </button>
          </div>

          <details className="group relative">
            <summary className="cursor-pointer list-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              更多工具
              <span className="ml-1 inline-block text-slate-400 transition-transform group-open:rotate-180" aria-hidden>
                ▾
              </span>
            </summary>
            <div className="absolute right-0 top-[calc(100%+0.5rem)] z-40 grid min-w-[22rem] grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
              <div className="col-span-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                汇报与商品资料
              </div>
              <button
                type="button"
                onClick={onCopyBossOnePager}
                disabled={!opReport}
                className="rounded-lg bg-slate-800 px-3 py-2 text-left text-sm text-white hover:bg-slate-900 disabled:opacity-40"
              >
                复制老板一页纸
              </button>
              <button
                type="button"
                onClick={onCopyBossOnePagerTsv}
                disabled={!opReport}
                className="rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                复制一页纸表格
              </button>
              <button
                type="button"
                onClick={() => onExportProductMaster("all")}
                disabled={opOrdersLen === 0}
                className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-left text-sm text-violet-700 hover:bg-violet-100 disabled:opacity-40"
              >
                生成全部商品资料
              </button>
              <button
                type="button"
                onClick={() => onExportProductMaster("missing_cost")}
                disabled={opOrdersLen === 0}
                className="rounded-lg border border-violet-200 px-3 py-2 text-left text-sm text-violet-700 hover:bg-violet-50 disabled:opacity-40"
              >
                导出待补商品资料
              </button>
              <div className="col-span-2 mt-1 border-t border-slate-100 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                经营参数
              </div>
              <button
                type="button"
                onClick={onExportCostSettings}
                className="rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"
              >
                导出参数 JSON
              </button>
              <button
                type="button"
                onClick={onImportCostSettings}
                className="rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"
              >
                导入参数 JSON
              </button>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
