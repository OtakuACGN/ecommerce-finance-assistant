import DataTable from "./DataTable";
import type { FileData } from "../utils/excel";

export interface ReconcileTabProps {
  opOrdersCount: number;
  opOrdersReceivedTotal: number;
  opOrdersPeriod?: string;
  opShopNames?: string[];
  desktopReady: boolean;
  paymentFile: FileData | null;
  reconcileResult: any[][];
  onImportPayment: () => void;
  onReconcile: () => void;
  onClearPayment: () => void;
  onClearResult: () => void;
  onGoOperating: () => void;
}

export default function ReconcileTab({
  opOrdersCount,
  opOrdersReceivedTotal,
  opOrdersPeriod,
  opShopNames = [],
  desktopReady,
  paymentFile,
  reconcileResult,
  onImportPayment,
  onReconcile,
  onClearPayment,
  onClearResult,
  onGoOperating,
}: ReconcileTabProps) {
  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="font-semibold text-gray-800 mb-1">🧾 收款对账</h2>
          <p className="text-sm text-gray-500 mb-4">
            收款流水 vs <strong className="text-slate-700">经营分析订单</strong>
            （主数据，不依赖旧「当前表格」）：优先订单号 → 备注含单号 → 金额(+日期)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center">
              {paymentFile ? (
                <div className="text-green-600">
                  <div className="text-2xl mb-1">✅</div>
                  <div className="text-sm font-medium">{paymentFile.name}</div>
                  <div className="text-xs text-gray-500">
                    {Math.max(0, paymentFile.data.length - 1)} 条
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClearPayment();
                      onClearResult();
                    }}
                    className="mt-1 text-xs text-red-500 hover:underline"
                  >
                    移除
                  </button>
                </div>
              ) : (
                <>
                  <div className="text-2xl mb-1">💳</div>
                  <div className="text-sm text-gray-600 mb-2">收款流水</div>
                  <button
                    type="button"
                    onClick={onImportPayment}
                    disabled={!desktopReady}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-40"
                  >
                    选择文件
                  </button>
                </>
              )}
            </div>
            <div className="border-2 border-dashed border-blue-200 rounded-xl p-6 text-center bg-blue-50/40">
              <div className="text-2xl mb-1">📦</div>
              <div className="text-sm text-gray-600 mb-2">经营分析订单</div>
              <div className="text-sm font-medium text-blue-900">{opOrdersCount} 单</div>
              <div className="text-xs text-gray-500 mt-1">
                实收合计 ¥{opOrdersReceivedTotal.toFixed(2)}
              </div>
              {opOrdersPeriod ? (
                <div className="text-[11px] text-blue-800/80 mt-1">账期 {opOrdersPeriod}</div>
              ) : null}
              {opShopNames.length > 0 ? (
                <div className="text-[11px] text-slate-500 mt-0.5 truncate px-1" title={opShopNames.join("、")}>
                  店铺 {opShopNames.join("、")}
                </div>
              ) : null}
              {opOrdersCount === 0 && (
                <button
                  type="button"
                  onClick={onGoOperating}
                  className="mt-2 text-xs text-blue-600 underline"
                >
                  去经营分析导入订单
                </button>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onReconcile}
            disabled={opOrdersCount === 0 || !paymentFile}
            className="w-full px-4 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 text-sm font-medium disabled:opacity-40"
          >
            开始对账 →
          </button>
        </div>
        {reconcileResult.length > 0 && (
          <div className="bg-white rounded-xl shadow p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-gray-800 text-sm">对账结果</h3>
              <span className="text-xs text-gray-500">
                {Math.max(0, reconcileResult.length - 1)} 行
              </span>
            </div>
            <div className="mb-3 flex flex-wrap gap-2 text-xs">
              {(() => {
                const rows = reconcileResult.slice(1);
                const st = (r: any[]) => String(r[5] ?? r[4] ?? "");
                const method = (r: any[]) => String(r[6] ?? "");
                const ok = rows.filter(
                  (r) => st(r) === "已核销" || st(r) === "差额核销",
                ).length;
                const miss = rows.filter((r) => st(r) === "未匹配").length;
                const uncl = rows.filter((r) => st(r) === "未认领").length;
                const byId = rows.filter(
                  (r) => method(r) === "订单号" || method(r) === "备注含单号",
                ).length;
                return (
                  <>
                    <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-100">
                      已核销 {ok}
                    </span>
                    <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-100">
                      未匹配 {miss}
                    </span>
                    <span className="px-2 py-1 rounded-full bg-rose-50 text-rose-800 border border-rose-100">
                      未认领 {uncl}
                    </span>
                    <span className="px-2 py-1 rounded-full bg-slate-50 text-slate-700 border border-slate-200">
                      单号命中 {byId}
                    </span>
                  </>
                );
              })()}
            </div>
            <DataTable
              data={reconcileResult}
              headers={(reconcileResult[0] || []).map(String)}
              stickyCols={2}
            />
          </div>
        )}
      </div>
    </div>
  );
}
