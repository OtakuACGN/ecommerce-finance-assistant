import DataTable from "./DataTable";
import type { OperatingReport } from "../services/pddBusiness";

export interface SalesRankTabProps {
  opReport: OperatingReport | null;
  currentData: any[][];
  currentHeaders: string[];
  onShowSkuRank: () => void;
  onShowSpuRank: () => void;
  onShowSkuTable: () => void;
  onShowSpuTable: () => void;
  onGoOperating: () => void;
}

export default function SalesRankTab({
  opReport,
  currentData,
  currentHeaders,
  onShowSkuRank,
  onShowSpuRank,
  onShowSkuTable,
  onShowSpuTable,
  onGoOperating,
}: SalesRankTabProps) {
  void onGoOperating;
  return (
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="max-w-[1400px] mx-auto space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="font-semibold text-gray-800 text-lg">
                  按编码销售排行总榜
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  以规格编码 / 商品编码汇总销量与实收，分析什么规格更好卖（需先在「经营分析」生成报表）
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!opReport}
                  onClick={() => {
                    if (!opReport) return;
                    onShowSkuRank();
                  }}
                  className="px-3 py-1.5 rounded-lg text-sm bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40"
                >
                  规格销售榜
                </button>
                <button
                  type="button"
                  disabled={!opReport}
                  onClick={() => {
                    if (!opReport) return;
                    onShowSpuRank();
                  }}
                  className="px-3 py-1.5 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
                >
                  编码/SPU榜
                </button>
              </div>
            </div>

            {!opReport ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-sm px-4 py-3">
                请先切换到「经营分析」导入订单（及商品资料）并点击「生成经营报表」，再查看销售排行。
                <button type="button" className="ml-2 underline" onClick={onGoOperating}>去经营分析</button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="rounded-lg bg-slate-50 border p-3">
                    <div className="text-xs text-slate-500">订单数</div>
                    <div className="text-xl font-bold">{opReport.summary.orderCount}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 border p-3">
                    <div className="text-xs text-slate-500">商品总价 GMV</div>
                    <div className="text-xl font-bold">
                      ¥{opReport.summary.goodsTotal.toFixed(0)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50 border p-3">
                    <div className="text-xs text-slate-500">规格数(销售榜)</div>
                    <div className="text-xl font-bold">
                      {Math.max(0, (opReport.salesRankSkuTable?.length || 1) - 1)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50 border p-3">
                    <div className="text-xs text-slate-500">商品编码数</div>
                    <div className="text-xl font-bold">
                      {Math.max(0, (opReport.salesRankSpuTable?.length || 1) - 1)}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      onShowSkuTable();
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs border bg-violet-50 border-violet-200 text-violet-900"
                  >
                    显示规格编码榜
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onShowSpuTable();
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs border bg-indigo-50 border-indigo-200 text-indigo-900"
                  >
                    显示商品编码榜
                  </button>
                </div>

                <div className="border border-slate-200 rounded-xl bg-white overflow-x-clip">
                  <DataTable
                    data={
                      currentData.length > 0 &&
                      String(currentData[0]?.[0] || "").includes("排名")
                        ? currentData
                        : opReport.salesRankSkuTable || []
                    }
                    headers={
                      currentData.length > 0 &&
                      String(currentData[0]?.[0] || "").includes("排名")
                        ? currentHeaders
                        : (opReport.salesRankSkuTable || [])[0] || []
                    }
                    stickyCols={3}
                    maxHeightClass="max-h-full"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  默认按销量（件数）降序；可点列头排序。横向滚动时前几列已冻结，方便对照编码/品名。
                </p>
              </>
            )}
          </div>
        </div>
      </div>

  );
}
