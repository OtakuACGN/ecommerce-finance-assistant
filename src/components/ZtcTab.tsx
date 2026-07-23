import { useMemo, useState } from "react";
import DataTable from "./DataTable";
import type { AdProduct, OperatingReport } from "../services/pddBusiness";
import {
  buildZtcSkuBreakdown,
  type ZtcSplitMode,
} from "../services/ztcSkuSplit";
import { exportWorkbook } from "../utils/excel";
import { saveDataFile } from "../utils/desktop";

export interface ZtcTabProps {
  opReport: OperatingReport | null;
  opAdProducts: AdProduct[];
  desktopReady: boolean;
  onGoOperating: () => void;
  onError: (action: string, error: unknown) => void;
  showToast: (msg: string, type?: "success" | "warning" | "error") => void;
}

export default function ZtcTab({
  opReport,
  opAdProducts,
  desktopReady,
  onGoOperating,
  onError,
  showToast,
}: ZtcTabProps) {
  const [mode, setMode] = useState<ZtcSplitMode>("settlement");
  const [view, setView] = useState<"sku" | "product" | "unmatched">("sku");

  const result = useMemo(() => {
    if (!opReport?.orderProfits?.length) return null;
    return buildZtcSkuBreakdown(opReport.orderProfits, opAdProducts, mode);
  }, [opReport, opAdProducts, mode]);

  const table =
    view === "sku"
      ? result?.table || []
      : view === "product"
        ? result?.productTable || []
        : [
            ["商品ID", "商品名称", "广告花费", "说明"],
            ...(result?.unmatchedAds || []).map((a) => [
              a.productId,
              a.productName,
              a.spend.toFixed(2),
              a.reason || "未匹配",
            ]),
          ];

  const headers = (table[0] || []).map(String);

  const handleExport = async () => {
    if (!result) {
      showToast("请先在经营分析生成报表并导入商品推广", "warning");
      return;
    }
    try {
      const name = `直通车规格细分_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const save = await saveDataFile(name);
      if (save.canceled || !save.filePath) return;
      const unmatchedTable = [
        ["商品ID", "商品名称", "广告花费", "说明"],
        ...result.unmatchedAds.map((a) => [
          a.productId,
          a.productName,
          a.spend.toFixed(2),
          a.reason || "未匹配",
        ]),
      ];
      await exportWorkbook(
        [
          { name: "规格细分", data: result.table },
          { name: "商品汇总", data: result.productTable },
          { name: "未匹配广告", data: unmatchedTable },
          {
            name: "说明",
            data: [
              ["项目", "内容"],
              ["分摊逻辑", "单条推广链接(商品ID) ROI 固定；规格广告费=整链广告费×规格基数/商品基数"],
              ["默认基数", "结算金额(商家实收)"],
              ["可选基数", "商品总价 / 销量"],
              ["规格净利润", "规格毛利(未扣广告) − 规格广告费"],
              ["匹配规则", "仅商品ID精确匹配；无ID或对不上=未匹配，不用品名兜底（未开广告商品不扣费）"],
              ["注意", "不做全店广告均摊；仅拆本商品链接内花费"],
            ],
          },
        ],
        save.filePath,
      );
      showToast("直通车细分已导出", "success");
    } catch (e) {
      onError("导出直通车细分", e);
    }
  };

  const readyOrders = (opReport?.orderProfits?.length || 0) > 0;
  const readyAds = opAdProducts.length > 0;

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className="max-w-[1600px] mx-auto space-y-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-800">直通车细分</h2>
              <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-3xl">
                商品推广（直通车）一条链接对应一个商品ID，链接内可有多个规格(SKU)，但
                <strong className="text-slate-700"> ROI 在商品层固定</strong>
                。按规格贡献占比拆广告费，得到每个规格的真实广告消耗与净利润。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onGoOperating}
                className="px-3 py-1.5 rounded-lg text-sm border border-slate-300 bg-white hover:bg-slate-50"
              >
                去经营分析导入
              </button>
              <button
                type="button"
                onClick={() => void handleExport()}
                disabled={!result}
                className="px-3 py-1.5 rounded-lg text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                导出 Excel
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div
              className={`rounded-xl border p-3 ${
                readyOrders ? "bg-emerald-50 border-emerald-100" : "bg-amber-50 border-amber-100"
              }`}
            >
              <div className="text-xs text-slate-500">① 经营报表订单</div>
              <div className="font-semibold text-slate-800 mt-0.5">
                {readyOrders
                  ? `已就绪 ${opReport!.orderProfits.length} 单`
                  : "请先在经营分析导入订单并生成报表"}
              </div>
            </div>
            <div
              className={`rounded-xl border p-3 ${
                readyAds ? "bg-emerald-50 border-emerald-100" : "bg-amber-50 border-amber-100"
              }`}
            >
              <div className="text-xs text-slate-500">② 商品推广汇总</div>
              <div className="font-semibold text-slate-800 mt-0.5">
                {readyAds
                  ? `已导入 ${opAdProducts.length} 个商品`
                  : "请导入「商品推广_汇总数据_商品」表"}
              </div>
            </div>
            <div className="rounded-xl border border-sky-100 bg-sky-50 p-3">
              <div className="text-xs text-slate-500">③ 拆分公式</div>
              <div className="font-medium text-slate-800 mt-0.5 text-xs leading-relaxed">
                规格广告费 = 商品广告费 × (规格基数 ÷ 商品基数)
                <br />
                规格净利润 = 规格毛利 − 规格广告费
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">分摊基数：</span>
            {(
              [
                ["settlement", "结算金额(推荐)"],
                ["gmv", "商品总价"],
                ["qty", "销量"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setMode(k)}
                className={`px-2.5 py-1 rounded-lg text-xs border ${
                  mode === k
                    ? "bg-violet-600 text-white border-violet-600"
                    : "bg-white text-slate-700 border-slate-300"
                }`}
              >
                {label}
              </button>
            ))}
            <span className="mx-2 h-4 w-px bg-slate-200" />
            <span className="text-xs text-slate-500">匹配：仅商品ID（无品名兜底）</span>
          </div>

          {result && (
            <div
              className={`mt-3 rounded-xl border px-3 py-2 text-xs leading-relaxed ${
                result.summary.idIntersection > 0
                  ? "bg-emerald-50 border-emerald-100 text-emerald-900"
                  : "bg-amber-50 border-amber-200 text-amber-950"
              }`}
            >
              <div className="font-medium mb-0.5">匹配诊断</div>
              <div>
                订单 {result.summary.orderRows} 单 · 含商品ID{" "}
                {result.summary.orderWithProductId} 单 · 唯一商品ID{" "}
                {result.summary.uniqueOrderProductIds} 个
                {" · "}
                推广商品 {result.summary.uniqueAdProductIds} 个 · ID交集{" "}
                <strong>{result.summary.idIntersection}</strong> 个
              </div>
              {result.summary.idIntersection === 0 && (
                <div className="mt-1">
                  {result.summary.orderWithProductId === 0
                    ? "订单侧商品ID为空：请回到经营分析重新导入订单（确认有「商品id」列）并点「生成经营报表」。"
                    : "订单有商品ID，但与推广表ID对不上（不同链接/时段，或该商品未开直通车）。不会用品名兜底，避免未开广告商品被误扣。"}
                  <div className="mt-0.5 text-[11px] opacity-80">
                    订单ID样例：{(result.summary.sampleOrderIds || []).join(", ") || "无"}
                    {" | "}
                    推广ID样例：{(result.summary.sampleAdIds || []).join(", ") || "无"}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {result && (
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 p-3">
              <div className="text-xs text-slate-500">匹配商品</div>
              <div className="text-lg font-bold">{result.summary.productCount}</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3">
              <div className="text-xs text-slate-500">规格数</div>
              <div className="text-lg font-bold">{result.summary.skuCount}</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3">
              <div className="text-xs text-slate-500">已匹配广告费</div>
              <div className="text-lg font-bold text-violet-700">
                ¥{result.summary.matchedAdSpend.toFixed(0)}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3">
              <div className="text-xs text-slate-500">未匹配广告费</div>
              <div className="text-lg font-bold text-amber-700">
                ¥{result.summary.unmatchedAdSpend.toFixed(0)}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3">
              <div className="text-xs text-slate-500">规格净利润合计</div>
              <div
                className={`text-lg font-bold ${
                  result.summary.totalProfitAfter >= 0 ? "text-emerald-700" : "text-rose-700"
                }`}
              >
                ¥{result.summary.totalProfitAfter.toFixed(0)}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3">
              <div className="text-xs text-slate-500">扣广告前毛利</div>
              <div className="text-lg font-bold text-slate-700">
                ¥{result.summary.totalProfitBefore.toFixed(0)}
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 md:p-4">
          <div className="flex flex-wrap gap-2 mb-3">
            {(
              [
                ["sku", "规格净利润"],
                ["product", "商品汇总"],
                ["unmatched", `未匹配广告(${result?.summary.unmatchedProductCount || 0})`],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setView(k)}
                className={`px-3 py-1.5 rounded-lg text-xs border ${
                  view === k
                    ? "bg-slate-800 text-white border-slate-800"
                    : "bg-white text-slate-700 border-slate-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {!readyOrders || !readyAds ? (
            <div className="text-sm text-slate-500 py-10 text-center">
              请先完成：经营分析生成报表 + 导入商品推广汇总表
              {!desktopReady && (
                <div className="text-xs text-amber-600 mt-2">建议在桌面端导入本地 xls 文件</div>
              )}
            </div>
          ) : table.length <= 1 ? (
            <div className="text-sm text-slate-500 py-10 text-center">
              暂无数据：请确认订单含商品ID，且与推广表商品ID一致
            </div>
          ) : (
            <DataTable
              data={table}
              headers={headers}
              stickyCols={view === "unmatched" ? 1 : 2}
            />
          )}
        </div>
      </div>
    </div>
  );
}
