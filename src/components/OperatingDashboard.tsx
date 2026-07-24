import StatCard from "./StatCard";
import type { OperatingReport } from "../services/pddBusiness";

export interface OperatingDashboardProps {
  opReport: OperatingReport;
  onOpenBrandPoint: () => void;
  onShowView: (view: string) => void;
}

/** 经营分析总览：指标卡 / 亏在哪 / 匹配 / 毛利阶梯 / 退款结构 */
export default function OperatingDashboard({
  opReport,
  onOpenBrandPoint,
  onShowView,
}: OperatingDashboardProps) {
  const orderCount = opReport.summary.orderCount || 0;
  const costUnmatched = opReport.summary.costUnmatchedOrders || 0;
  const costMatched = Math.max(0, orderCount - costUnmatched);
  const matchRate = orderCount > 0 ? (costMatched / orderCount) * 100 : 100;
  const matchTone =
    matchRate >= 95 ? "emerald" : matchRate >= 80 ? "sky" : "amber";

  return (
    <>
              {/* 成本匹配进度：引导补资料 */}
              <div
                className={`mb-4 rounded-xl border p-3 ${
                  matchTone === "emerald"
                    ? "bg-emerald-50/80 border-emerald-100"
                    : matchTone === "sky"
                      ? "bg-sky-50/80 border-sky-100"
                      : "bg-amber-50/80 border-amber-200"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="text-sm font-medium text-slate-800">
                    成本匹配进度
                    <span className="ml-2 text-lg font-bold tabular-nums">
                      {matchRate.toFixed(1)}%
                    </span>
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {costMatched}/{orderCount} 单已匹配
                      {costUnmatched > 0
                        ? ` · 待补 ${costUnmatched} 单 / ¥${(opReport.summary.costUnmatchedAmount || 0).toFixed(0)}`
                        : " · 成本齐全"}
                    </span>
                  </div>
                  {costUnmatched > 0 && (
                    <button
                      type="button"
                      className="text-xs px-2.5 py-1 rounded-lg bg-violet-600 text-white hover:bg-violet-700"
                      onClick={() => onShowView("unmatched")}
                    >
                      去补成本 / 看待补SKU
                    </button>
                  )}
                </div>
                <div className="h-2 rounded-full bg-white/80 border border-slate-200/80 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      matchTone === "emerald"
                        ? "bg-emerald-500"
                        : matchTone === "sky"
                          ? "bg-sky-500"
                          : "bg-amber-500"
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, matchRate))}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 mb-4">
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">商家实收</div>
                  <div className="text-lg font-bold">
                    ¥{opReport.summary.merchantReceived.toFixed(2)}
                  </div>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">确认收入（含部分退保留）</div>
                  <div className="text-lg font-bold text-emerald-700">
                    ¥{(opReport.summary.confirmedRevenue ?? opReport.summary.merchantReceived).toFixed(2)}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    部分退后有效收入 · 毛利基数优先用此
                  </div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">商品成本</div>
                  <div className="text-lg font-bold text-violet-700">
                    ¥{opReport.summary.costTotal.toFixed(2)}
                  </div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">包材合计</div>
                  <div className="text-lg font-bold text-violet-600">
                    ¥{opReport.summary.packTotal.toFixed(2)}
                  </div>
                </div>
                <div className="bg-sky-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">运费 / 邮费抵扣 / 净运费</div>
                  <div className="text-sm font-bold text-sky-700">
                    ¥{opReport.summary.shippingTotal.toFixed(2)}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    邮费+¥{opReport.summary.postageIncomeTotal.toFixed(2)} · 净¥
                    {opReport.summary.netShippingTotal.toFixed(2)}
                  </div>
                </div>
                <div className="bg-red-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">损耗运费</div>
                  <div className="text-lg font-bold text-red-600">
                    ¥{opReport.summary.shippingLossTotal.toFixed(2)}
                  </div>
                </div>
                <div className="bg-rose-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">退货损耗 / 二次包装</div>
                  <div className="text-sm font-bold text-rose-700">
                    ¥{opReport.summary.returnLossTotal.toFixed(2)}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    二次包装 ¥{opReport.summary.repackCostTotal.toFixed(2)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onOpenBrandPoint}
                  className="bg-violet-50 rounded-xl p-3 min-h-[96px] text-left hover:ring-2 hover:ring-violet-300 transition-shadow"
                  title="点击填写品牌扣点"
                >
                  <div className="text-xs text-gray-500 leading-snug">
                    品牌扣点
                    {(opReport.summary.brandPointPct || 0) > 0
                      ? ` (${opReport.summary.brandPointPct}%)`
                      : "（未填 · 点此填写）"}
                  </div>
                  <div className="text-lg font-bold text-violet-700">
                    ¥{(opReport.summary.brandPointTotal || 0).toFixed(2)}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5 leading-relaxed break-words">
                    {(opReport.summary.brandPointPct || 0) > 0
                      ? `选填计提 · 基数=${
                          opReport.summary.feeBaseMode === "goodsTotal"
                            ? "商品总价"
                            : opReport.summary.feeBaseMode === "merchantReceived"
                              ? "商家实收"
                              : "确认收入"
                        }`
                      : "默认不计提；在参数区填写%后生效（≠平台服务费）"}
                  </div>
                </button>
                <div className="bg-indigo-50 rounded-xl p-3 min-h-[96px]">
                  <div className="text-xs text-gray-500 leading-snug">
                    电商税 ({opReport.summary.ecommerceTaxPct || 0}%)
                  </div>
                  <div className="text-lg font-bold text-indigo-700">
                    ¥{(opReport.summary.ecommerceTaxTotal || 0).toFixed(2)}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5 leading-relaxed break-words">
                    与扣点同基数计提 · 可在上方参数区修改%
                  </div>
                </div>
                <div className="bg-amber-50 rounded-xl p-3 min-h-[96px]">
                  <div className="text-xs text-gray-500 leading-snug">总退款率(笔/额 · /全部订单)</div>
                  <div className="text-lg font-bold text-amber-700">
                    {(opReport.summary.refundRateByCount * 100).toFixed(1)}%
                    <span className="text-xs font-normal text-gray-500">
                      {" "}/{(opReport.summary.refundRateByAmount * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5 leading-relaxed break-words">
                    {opReport.summary.refundOrderCount}/{opReport.summary.orderCount} 单
                  </div>
                </div>
                <div className="bg-amber-50/80 rounded-xl p-3 min-h-[96px] border border-amber-100">
                  <div className="text-xs text-gray-500 leading-snug">全额退 / 部分退</div>
                  <div className="text-lg font-bold text-amber-800">
                    {opReport.summary.fullRefundCount ?? 0}
                    <span className="text-sm font-normal text-gray-500"> / </span>
                    {opReport.summary.partialRefundCount ?? 0}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5 leading-relaxed break-words">
                    实退 ¥{(opReport.summary.refundCashTotal ?? 0).toFixed(2)}
                    · 部分退保留收入 ¥
                    {(opReport.summary.partialRefundResidualRevenue ?? 0).toFixed(2)}
                  </div>
                </div>
                <div
                  className={`rounded-xl p-3 min-h-[96px] border ${
                    Math.abs(opReport.summary.refundVsReceivedGapTotal || 0) > 0.5
                      ? "bg-rose-50 border-rose-100"
                      : "bg-slate-50 border-slate-100"
                  }`}
                >
                  <div className="text-xs text-gray-500 leading-snug">实退 vs 商家实收差额</div>
                  <div
                    className={`text-lg font-bold ${
                      Math.abs(opReport.summary.refundVsReceivedGapTotal || 0) > 0.5
                        ? "text-rose-700"
                        : "text-slate-700"
                    }`}
                  >
                    ¥{(opReport.summary.refundVsReceivedGapTotal ?? 0).toFixed(2)}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5 leading-relaxed break-words">
                    退款单合计(实退−商家实收)；部分仅退款时实收仍可能{'>'}0
                    {(opReport.summary.partialRefundCount || 0) > 0 ? (
                      <button
                        type="button"
                        className="ml-1 underline text-rose-600"
                        onClick={() => onShowView("anomalyPartial" as any)}
                      >
                        看部分退明细
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="bg-orange-50 rounded-xl p-3 min-h-[96px]">
                  <div className="text-xs text-gray-500 leading-snug">发货后退款率(笔/额 · /已发货)</div>
                  <div className="text-lg font-bold text-orange-700">
                    {(opReport.summary.postShipRefundRateByCount * 100).toFixed(1)}%
                    <span className="text-xs font-normal text-gray-500">
                      {" "}/
                      {(opReport.summary.postShipRefundRateByAmount * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5 leading-relaxed break-words">
                    {opReport.summary.postShipRefundCount}/{opReport.summary.shippedOrderCount}
                    {" = "}发货未收货{opReport.summary.shipOnlyRefundCount}
                    +签收退{opReport.summary.signedReturnCount}
                    （=退货退款主口径）
                  </div>
                </div>
                <div className="bg-red-50 rounded-xl p-3 min-h-[88px] border border-red-100">
                  <div className="text-xs text-red-700/80">广告花费（已从毛利扣除）</div>
                  <div className="text-lg font-bold text-red-600">
                    -¥{opReport.summary.adSpend.toFixed(2)}
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                    {opReport.summary.adAllocatedTotal > 0.001
                      ? `其中明细已摊 ¥${opReport.summary.adAllocatedTotal.toFixed(2)}，其余在汇总扣完`
                      : "当前未摊到订单明细，但汇总毛利已全额扣减这笔广告"}
                  </div>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">毛利(未扣广告)</div>
                  <div className="text-lg font-bold text-emerald-700">
                    ¥{opReport.summary.estimatedProfitBeforeAd.toFixed(2)}
                  </div>
                </div>
                <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                  <div className="text-xs text-gray-500">毛利(已扣广告)</div>
                  <div className="text-lg font-bold text-green-700">
                    ¥{opReport.summary.estimatedProfitAfterAd.toFixed(2)}
                  </div>
                  <div className="text-[11px] text-green-800/80 mt-0.5">
                    {opReport.summary.estimatedProfitBeforeAd.toFixed(0)} − {opReport.summary.adSpend.toFixed(0)} = {opReport.summary.estimatedProfitAfterAd.toFixed(0)}
                  </div>
                </div>
                <div className="bg-blue-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">毛利率 / 已发货未成交</div>
                  <div className="text-lg font-bold text-blue-700">
                    {(opReport.summary.profitMargin * 100).toFixed(1)}%
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    未成交 {opReport.summary.shipNotDealCount} 单
                  </div>
                </div>
                <div className="bg-rose-50 rounded-xl p-3 min-h-[96px]">
                  <div className="text-xs text-gray-500 leading-snug">
                    退货退款率(主 · 发货后全部退/已发货)
                  </div>
                  <div className="text-lg font-bold text-rose-700">
                    {(opReport.summary.returnRefundRateByCount * 100).toFixed(1)}%
                    <span className="text-xs font-normal text-gray-500">
                      {" "}/{(opReport.summary.returnRefundRateByAmount * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-600 mt-0.5 leading-relaxed break-words">
                    {opReport.summary.returnRefundCount}/
                    {opReport.summary.shippedOrderCount} 已发货
                    {" = "}未收货退{opReport.summary.shipOnlyRefundCount}
                    +签收退{opReport.summary.signedReturnCount}
                    <br />
                    对照全部 {(opReport.summary.returnRefundRateOfAllByCount * 100).toFixed(1)}%
                    · 签收后{(opReport.summary.signedReturnRateByCount * 100).toFixed(2)}%
                  </div>
                </div>
                <div className="bg-fuchsia-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">广告ROI(仅推广日报)</div>
                  <div className="text-lg font-bold text-fuchsia-700">
                    {opReport.summary.adRoi.toFixed(2)}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    花费 ¥{opReport.summary.adSpend.toFixed(0)}
                    {opReport.summary.billAdExpenseExcluded > 0
                      ? ` · 账务广告已排除 ¥${opReport.summary.billAdExpenseExcluded.toFixed(0)}`
                      : ""}
                  </div>
                </div>
                {opReport.summary.latestMonth && (
                  <div className="bg-indigo-50 rounded-lg p-3 col-span-2 md:col-span-4">
                    <div className="text-xs text-gray-500 mb-1">
                      时段对比（最新月 vs 上月）
                    </div>
                    {(() => {
                      const months = opReport.summary.months || [];
                      const latest = months.find(
                        (m) => m.month === opReport.summary.latestMonth,
                      );
                      const prev = months.find(
                        (m) => m.month === opReport.summary.prevMonth,
                      );
                      if (!latest) {
                        return (
                          <div className="text-sm text-gray-500">暂无分月数据</div>
                        );
                      }
                      const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
                      const delta = (a: number, b?: number) => {
                        if (b === undefined || b === null) return "—";
                        const d = a - b;
                        const sign = d > 0 ? "+" : "";
                        return `${sign}${d.toFixed(2)}`;
                      };
                      return (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                          <div>
                            <div className="text-gray-500">
                              {latest.month} 退款率(笔)
                            </div>
                            <div className="font-semibold">
                              {pct(latest.refundRateByCount)}
                              {prev && (
                                <span className="text-gray-400 font-normal">
                                  {" "}
                                  (上月 {pct(prev.refundRateByCount)})
                                </span>
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-500">损耗运费</div>
                            <div className="font-semibold">
                              ¥{latest.shippingLossTotal.toFixed(2)}
                              {prev && (
                                <span className="text-gray-400 font-normal">
                                  {" "}
                                  (
                                  {delta(
                                    latest.shippingLossTotal,
                                    prev.shippingLossTotal,
                                  )}
                                  )
                                </span>
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-500">毛利(扣广告)</div>
                            <div className="font-semibold text-green-700">
                              ¥{latest.profitAfterAd.toFixed(2)}
                              {prev && (
                                <span className="text-gray-400 font-normal">
                                  {" "}
                                  (
                                  {delta(
                                    latest.profitAfterAd,
                                    prev.profitAfterAd,
                                  )}
                                  )
                                </span>
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-500">毛利率</div>
                            <div className="font-semibold">
                              {pct(latest.profitMargin)}
                              {prev && (
                                <span className="text-gray-400 font-normal">
                                  {" "}
                                  (上月 {pct(prev.profitMargin)})
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              <div className="bg-gradient-to-r from-rose-50 to-amber-50 border border-rose-100 rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="font-medium text-gray-800 text-sm">本月亏在哪（速览）</div>
                  <button
                    type="button"
                    className="text-xs text-blue-600 hover:underline"
                    onClick={() => onShowView("lossDiagnosis")}
                  >
                    查看完整诊断 →
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <StatCard
                    tone="rose"
                    label="广告(日报)"
                    value={"¥" + opReport.summary.adSpend.toFixed(0)}
                    onClick={() => onShowView("ads")}
                  />
                  <StatCard
                    tone="rose"
                    label="损耗运费"
                    value={"¥" + opReport.summary.shippingLossTotal.toFixed(0)}
                    onClick={() => onShowView("shipLoss")}
                  />
                  <StatCard
                    tone="rose"
                    label="退货损耗+二次包装"
                    value={
                      "¥" +
                      (
                        opReport.summary.returnLossTotal +
                        opReport.summary.repackCostTotal
                      ).toFixed(0)
                    }
                    onClick={() => onShowView("lossDiagnosis")}
                  />
                  <StatCard
                    tone="amber"
                    label="未匹配成本"
                    value={opReport.summary.costUnmatchedOrders + " 单"}
                    hint={"¥" + opReport.summary.costUnmatchedAmount.toFixed(0)}
                    onClick={() => onShowView("unmatched")}
                  />
                </div>
              </div>

              {/* 匹配方式可解释 */}
              {opReport.matchMethodTable && opReport.matchMethodTable.length > 1 && (
                <div className="mb-4 rounded-xl border border-sky-100 bg-sky-50/60 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="text-sm font-medium text-sky-900">成本匹配方式</div>
                    <button
                      type="button"
                      className="text-xs text-sky-700 underline"
                      onClick={() => onShowView("matchMethod")}
                    >
                      查看明细
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {opReport.matchMethodTable.slice(1).map((row, idx) => {
                      const name = String(row[0] ?? "");
                      const count = row[1];
                      const share = String(row[2] ?? "");
                      const bad = name === "未匹配";
                      return (
                        <span
                          key={idx}
                          className={`text-xs px-2 py-1 rounded-lg border ${
                            bad
                              ? "bg-amber-100 border-amber-200 text-amber-900"
                              : "bg-white border-sky-100 text-slate-700"
                          }`}
                        >
                          <strong>{name}</strong> {count}单 ({share})
                        </span>
                      );
                    })}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-2">
                    订单毛利表含「匹配方式」列；无编码命中会显示「商品规格(无编码)」等。
                  </div>
                </div>
              )}

              <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 text-white rounded-xl p-4 mb-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="text-sm font-semibold">毛利被谁吃掉了（对照）</div>
                    <div className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                      底座毛利 → 扣退货相关 → 扣扣点税 → 扣广告 = 最终毛利
                    </div>
                  </div>
                  <div className="text-right text-[11px] text-slate-300">
                    合计吃掉{" "}
                    <span className="text-amber-300 font-semibold text-sm">
                      ¥{(opReport.summary.marginEatenTotal || 0).toFixed(0)}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 text-sm">
                  <div className="rounded-lg bg-white/10 p-2.5 border border-white/10">
                    <div className="text-[11px] text-slate-300">① 经营底座</div>
                    <div className="text-lg font-bold text-emerald-300">
                      ¥{(opReport.summary.profitOpsBase || 0).toFixed(0)}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      收入-成本-包材-运费-平台费
                    </div>
                  </div>
                  <div className="rounded-lg bg-white/10 p-2.5 border border-white/10">
                    <div className="text-[11px] text-slate-300">② 退货相关吃掉</div>
                    <div className="text-lg font-bold text-rose-300">
                      -¥{(opReport.summary.returnRelatedCost || 0).toFixed(0)}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      损耗+二次包装 · 另有损耗运费 ¥
                      {(opReport.summary.shippingLossTotal || 0).toFixed(0)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-white/10 p-2.5 border border-white/10">
                    <div className="text-[11px] text-slate-300">③ 品牌扣点(选填)</div>
                    <div className="text-lg font-bold text-violet-300">
                      -¥{(opReport.summary.brandPointTotal || 0).toFixed(0)}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      全局 {opReport.summary.brandPointPct || 0}%
                      （可按店覆盖）
                    </div>
                  </div>
                  <div className="rounded-lg bg-white/10 p-2.5 border border-white/10">
                    <div className="text-[11px] text-slate-300">④ 电商税</div>
                    <div className="text-lg font-bold text-indigo-300">
                      -¥{(opReport.summary.ecommerceTaxTotal || 0).toFixed(0)}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      全局 {opReport.summary.ecommerceTaxPct || 0}%
                    </div>
                  </div>
                  <div className="rounded-lg bg-white/10 p-2.5 border border-white/10">
                    <div className="text-[11px] text-slate-300">⑤ 广告吃掉</div>
                    <div className="text-lg font-bold text-amber-300">
                      -¥{(opReport.summary.adSpend || 0).toFixed(0)}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      仅推广日报 · ROI{" "}
                      {(opReport.summary.adRoi || 0).toFixed(2)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-emerald-500/20 p-2.5 border border-emerald-400/30">
                    <div className="text-[11px] text-emerald-200">⑥ 最终毛利</div>
                    <div className="text-lg font-bold text-emerald-200">
                      ¥{opReport.summary.estimatedProfitAfterAd.toFixed(0)}
                    </div>
                    <div className="text-[10px] text-emerald-100/70 mt-0.5">
                      毛利率 {(opReport.summary.profitMargin * 100).toFixed(1)}% · 扣前
                      ¥{opReport.summary.estimatedProfitBeforeAd.toFixed(0)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
                  {(() => {
                    const ad = opReport.summary.adSpend || 0;
                    const fee =
                      (opReport.summary.brandPointTotal || 0) +
                      (opReport.summary.ecommerceTaxTotal || 0);
                    const ret =
                      (opReport.summary.returnRelatedCost || 0) +
                      (opReport.summary.shippingLossTotal || 0);
                    const sum = ad + fee + ret || 1;
                    const bar = (v: number, color: string, label: string) => (
                      <div key={label} className="bg-white/5 rounded-lg p-2 border border-white/10">
                        <div className="flex justify-between mb-1">
                          <span className="text-slate-300">{label}</span>
                          <span className="text-white font-medium">
                            ¥{v.toFixed(0)} · {((v / sum) * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-1.5 rounded bg-white/10 overflow-hidden">
                          <div
                            className={`h-full ${color}`}
                            style={{ width: `${Math.min(100, (v / sum) * 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                    return [
                      bar(ad, "bg-amber-400", "广告占比"),
                      bar(fee, "bg-violet-400", "扣点+税占比"),
                      bar(ret, "bg-rose-400", "退货相关占比"),
                    ];
                  })()}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">退款结构一览（口径对照）</div>
                    <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                      总退款 = 未发货退 + 发货未收货退 + 签收退；退货退款主口径 = 发货后全部退 / 已发货
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onShowView("rates")}
                    className="text-xs px-3 py-1.5 rounded-lg border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100"
                  >
                    打开退款率明细表
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                  <StatCard
                    tone="amber"
                    label="① 总退款"
                    value={`${(opReport.summary.refundRateByCount * 100).toFixed(1)}%`}
                    hint={
                      <>
                        {opReport.summary.refundOrderCount} / {opReport.summary.orderCount} 单
                        <br />
                        金额率 {(opReport.summary.refundRateByAmount * 100).toFixed(1)}%
                      </>
                    }
                    onClick={() => onShowView("rates")}
                  />
                  <StatCard
                    tone="slate"
                    label="② 未发货退款"
                    value={`${
                      opReport.summary.orderCount > 0
                        ? (
                            (opReport.summary.unshippedRefundCount /
                              opReport.summary.orderCount) *
                            100
                          ).toFixed(1)
                        : "0.0"
                    }%`}
                    hint={
                      <>
                        {opReport.summary.unshippedRefundCount} 单 · ¥
                        {opReport.summary.unshippedRefundAmount.toFixed(0)}
                      </>
                    }
                    onClick={() => onShowView("rates")}
                  />
                  <StatCard
                    tone="amber"
                    label="③ 发货后退款"
                    value={`${(opReport.summary.postShipRefundRateByCount * 100).toFixed(1)}%`}
                    hint={
                      <>
                        {opReport.summary.postShipRefundCount} /{" "}
                        {opReport.summary.shippedOrderCount} 已发货
                        <br />
                        未收货退 {opReport.summary.shipOnlyRefundCount} + 签收退{" "}
                        {opReport.summary.signedReturnCount}
                      </>
                    }
                    onClick={() => onShowView("rates")}
                  />
                  <StatCard
                    tone="rose"
                    label="④ 退货退款（发货后）"
                    value={`${(opReport.summary.returnRefundRateByCount * 100).toFixed(1)}%`}
                    hint={
                      <>
                        主：{opReport.summary.returnRefundCount} /{" "}
                        {opReport.summary.shippedOrderCount} 已发货
                        <br />
                        签收后辅：
                        {(opReport.summary.signedReturnRateByCount * 100).toFixed(2)}% (
                        {opReport.summary.signedReturnCount}/
                        {opReport.summary.receivedRelatedCount})
                      </>
                    }
                    onClick={() => onShowView("rates")}
                  />
                </div>
              </div>

    </>
  );
}
