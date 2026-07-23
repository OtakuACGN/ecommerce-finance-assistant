import type { OperatingReport } from "../services/pddBusiness";
import type { ProductMasterMeta } from "../services/productMasterMeta";
import type { ProductMasterBuildMode } from "../services/pddBusiness";

export interface OperatingActionBarProps {
  opReport: OperatingReport | null;
  opOrdersLen: number;
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
  onJumpUnmatched: () => void;
}

/** 经营分析主操作条：生成/导出/待补引导 */
export default function OperatingActionBar({
  opReport,
  opOrdersLen,
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

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onBuildReport}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
        >
          生成经营报表
        </button>
        <button
          type="button"
          onClick={onExportOperating}
          disabled={!opReport}
          className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-40"
        >
          导出 Excel
        </button>
        <button
          type="button"
          onClick={onExportAnomalies}
          disabled={!opReport}
          className="px-4 py-2 rounded-lg bg-rose-600 text-white text-sm hover:bg-rose-700 disabled:opacity-40"
        >
          导出异常订单
        </button>
        <button
          type="button"
          onClick={onCopyUnmatchedSkus}
          disabled={!opReport || unmatchedN === 0}
          className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm hover:bg-amber-600 disabled:opacity-40"
        >
          复制待补SKU
        </button>
        <button
          type="button"
          onClick={onCopyBossOnePager}
          disabled={!opReport}
          className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm hover:bg-slate-900 disabled:opacity-40"
        >
          复制老板一页纸
        </button>
        <button
          type="button"
          onClick={onCopyBossOnePagerTsv}
          disabled={!opReport}
          className="px-4 py-2 rounded-lg border border-slate-400 bg-white text-slate-800 text-sm hover:bg-slate-50 disabled:opacity-40"
        >
          复制一页纸表格
        </button>
        <button
          type="button"
          onClick={() => onExportProductMaster("all")}
          disabled={opOrdersLen === 0}
          className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-700 disabled:opacity-40"
        >
          生成商品资料
        </button>
        <button
          type="button"
          onClick={() => onExportProductMaster("missing_cost")}
          disabled={opOrdersLen === 0}
          className="px-4 py-2 rounded-lg bg-violet-500/90 text-white text-sm hover:bg-violet-600 disabled:opacity-40"
        >
          待补商品资料
        </button>
        <button
          type="button"
          onClick={onExportCostSettings}
          className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm hover:bg-slate-50"
        >
          导出参数JSON
        </button>
        <button
          type="button"
          onClick={onImportCostSettings}
          className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm hover:bg-slate-50"
        >
          导入参数JSON
        </button>
      </div>
    </div>
  );
}
