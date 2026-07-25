import { useMemo, useState } from "react";
import DataTable from "./DataTable";
import type { OperatingReport } from "../services/pddBusiness";

export interface SalesRankTabProps {
  opReport: OperatingReport | null;
  onGoOperating: () => void;
}

export default function SalesRankTab({
  opReport,
  onGoOperating,
}: SalesRankTabProps) {
  const [view, setView] = useState<"sku" | "spu">("sku");
  const table = useMemo(
    () =>
      view === "sku"
        ? opReport?.salesRankSkuTable || []
        : opReport?.salesRankSpuTable || [],
    [opReport, view],
  );
  const eligibleSummary = useMemo(() => {
    const headers = table[0] || [];
    const orderIdx = headers.indexOf("订单数");
    const qtyIdx = headers.indexOf("销量");
    const gmvIdx = headers.indexOf("商品总价");
    return table.slice(1).reduce(
      (sum, row) => ({
        orders: sum.orders + (Number(row[orderIdx]) || 0),
        qty: sum.qty + (Number(row[qtyIdx]) || 0),
        gmv: sum.gmv + (Number(row[gmvIdx]) || 0),
      }),
      { orders: 0, qty: 0, gmv: 0 },
    );
  }, [table]);

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
                    setView("sku");
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
                    setView("spu");
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
                    <div className="text-xl font-bold">{eligibleSummary.orders}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 border p-3">
                    <div className="text-xs text-slate-500">商品总价 GMV</div>
                    <div className="text-xl font-bold">
                      ¥{eligibleSummary.gmv.toFixed(0)}
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
                    onClick={() => setView("sku")}
                    className={`px-3 py-1.5 rounded-lg text-xs border ${
                      view === "sku"
                        ? "bg-violet-600 border-violet-600 text-white"
                        : "bg-violet-50 border-violet-200 text-violet-900"
                    }`}
                  >
                    显示规格编码榜
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("spu")}
                    className={`px-3 py-1.5 rounded-lg text-xs border ${
                      view === "spu"
                        ? "bg-indigo-600 border-indigo-600 text-white"
                        : "bg-indigo-50 border-indigo-200 text-indigo-900"
                    }`}
                  >
                    显示商品编码榜
                  </button>
                </div>

                <div className="border border-slate-200 rounded-xl bg-white overflow-x-clip">
                  <DataTable
                    data={table}
                    headers={(table[0] || []).map(String)}
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
