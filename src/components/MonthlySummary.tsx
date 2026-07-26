import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { exportToExcel } from "../utils/excel";
import { saveDataFile } from "../utils/desktop";
import type { BillRecord } from "../services/businessLogic";
import { businessMonthOf } from "../services/businessPeriod";

interface PlatformSummary {
  platform: string;
  gmv: number;
  orderCount: number;
  commission: number;
  techFee: number;
  otherFee: number;
  subsidy: number;
  refundAmount: number;
  refundDetailAmount: number;
  refundCount: number;
  refundLoss: number;
  netAmount: number;
}

interface RefundOrder {
  platform: string;
  refundAmount: number;
  refundDate: string;
  commissionLost: number;
}

interface Props {
  billRecords: BillRecord[];
  refundRecords: RefundOrder[];
  onImportBill: () => void;
  desktopReady: boolean;
}

export default function MonthlySummary({
  billRecords,
  refundRecords,
  onImportBill,
  desktopReady,
}: Props) {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [comparisonMonth, setComparisonMonth] = useState<{
    year: number;
    month: number;
  } | null>(null);

  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  const currentMonthStr = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;

  const getMonthKey = useCallback((dateText: string) => {
    return businessMonthOf(dateText);
  }, []);
  const years = useMemo(() => {
    const importedYears = billRecords
      .map((record) => Number(getMonthKey(record.date).slice(0, 4)))
      .filter((year) => Number.isInteger(year) && year >= 2000 && year <= 2100);
    const current = new Date().getFullYear();
    const min = Math.min(current, 2023, ...importedYears);
    const max = Math.max(current, ...importedYears);
    const values: number[] = [];
    for (let year = max; year >= min; year--) values.push(year);
    return values;
  }, [billRecords, getMonthKey]);
  const comparisonOptions = useMemo(
    () =>
      years.flatMap((year) =>
        [...months]
          .reverse()
          .map((month) => ({
            year,
            month,
            value: `${year}-${String(month).padStart(2, "0")}`,
          })),
      ),
    [years],
  );
  const autoSelectedRef = useRef(false);

  useEffect(() => {
    if (autoSelectedRef.current || billRecords.length === 0) return;
    const hasSelectedMonth = billRecords.some(
      (record) => getMonthKey(record.date) === currentMonthStr,
    );
    if (!hasSelectedMonth) {
      const monthKeys = billRecords
        .map((record) => getMonthKey(record.date))
        .filter((key) => /^\d{4}-\d{2}$/.test(key))
        .sort();
      const latest = monthKeys[monthKeys.length - 1];
      if (latest) {
        const [year, month] = latest.split("-").map(Number);
        setSelectedYear(year);
        setSelectedMonth(month);
      }
    }
    autoSelectedRef.current = true;
  }, [billRecords, currentMonthStr, getMonthKey]);

  const buildSummary = useCallback(
    (monthKey: string | null) => {
      if (!monthKey) return [];
      const map: Record<string, PlatformSummary> = {};
      billRecords.forEach((b) => {
        const billMonth = getMonthKey(b.date);
        if (billMonth !== monthKey) return;
        const p = b.platform;
        if (!map[p])
          map[p] = {
            platform: p,
            gmv: 0,
            orderCount: 0,
            commission: 0,
            techFee: 0,
            otherFee: 0,
            subsidy: 0,
            refundAmount: 0,
            refundDetailAmount: 0,
            refundCount: 0,
            refundLoss: 0,
            netAmount: 0,
          };
        map[p].gmv += b.totalAmount;
        map[p].orderCount += b.orderCount;
        map[p].commission += b.commission;
        map[p].techFee += b.techFee;
        map[p].otherFee += b.otherFee || 0;
        map[p].subsidy += b.subsidy;
        map[p].refundAmount += b.refundAmount || 0;
        map[p].netAmount += b.netAmount;
      });
      refundRecords.forEach((r) => {
        const refundMonth = getMonthKey(r.refundDate);
        if (refundMonth !== monthKey) return;
        const p = r.platform || "其他";
        if (!map[p])
          map[p] = {
            platform: p,
            gmv: 0,
            orderCount: 0,
            commission: 0,
            techFee: 0,
            otherFee: 0,
            subsidy: 0,
            refundAmount: 0,
            refundDetailAmount: 0,
            refundCount: 0,
            refundLoss: 0,
            netAmount: 0,
          };
        map[p].refundDetailAmount += r.refundAmount;
        map[p].refundCount += 1;
        map[p].refundLoss += r.commissionLost;
      });
      return Object.values(map)
        .map((summary) => ({
          ...summary,
          refundAmount:
            summary.refundAmount > 0
              ? summary.refundAmount
              : summary.refundDetailAmount,
        }))
        .sort((a, b) => b.gmv - a.gmv);
    },
    [billRecords, refundRecords, getMonthKey],
  );

  const currentSummary = useMemo((): PlatformSummary[] => {
    return buildSummary(currentMonthStr);
  }, [buildSummary, currentMonthStr]);

  const currentTotal = useMemo(
    () => ({
      gmv: currentSummary.reduce((s, p) => s + p.gmv, 0),
      orderCount: currentSummary.reduce((s, p) => s + p.orderCount, 0),
      commission: currentSummary.reduce((s, p) => s + p.commission, 0),
      techFee: currentSummary.reduce((s, p) => s + p.techFee, 0),
      otherFee: currentSummary.reduce((s, p) => s + p.otherFee, 0),
      subsidy: currentSummary.reduce((s, p) => s + p.subsidy, 0),
      refundAmount: currentSummary.reduce((s, p) => s + p.refundAmount, 0),
      refundLoss: currentSummary.reduce((s, p) => s + p.refundLoss, 0),
      netAmount: currentSummary.reduce((s, p) => s + p.netAmount, 0),
    }),
    [currentSummary],
  );

  const comparisonMonthStr = comparisonMonth
    ? `${comparisonMonth.year}-${String(comparisonMonth.month).padStart(2, "0")}`
    : null;

  const comparisonSummary = useMemo((): PlatformSummary[] => {
    return buildSummary(comparisonMonthStr);
  }, [buildSummary, comparisonMonthStr]);

  const delta = (cur: number, prev: number) => {
    if (prev === 0) return null;
    const diff = cur - prev;
    const pct = ((diff / prev) * 100).toFixed(1);
    return { diff, pct, up: diff > 0 };
  };

  const fmt = (n: number) =>
    n.toLocaleString("zh-CN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const handleExport = useCallback(async () => {
    if (currentSummary.length === 0) return;
    const headers = [
      "平台",
      "交易收入",
      "订单数",
      "退款",
      "佣金",
      "平台服务费(净)",
      "其他费用",
      "补贴/返点",
      "净收款",
      "佣金损失",
      "净收入",
    ];
    const rows = currentSummary.map((p) => [
      p.platform,
      p.gmv,
      p.orderCount,
      p.refundAmount,
      p.commission,
      p.techFee,
      p.otherFee,
      p.subsidy,
      p.netAmount,
      p.refundLoss,
      p.netAmount - p.refundLoss,
    ]);
    rows.push([
      "合计",
      currentTotal.gmv,
      currentTotal.orderCount,
      currentTotal.refundAmount,
      currentTotal.commission,
      currentTotal.techFee,
      currentTotal.otherFee,
      currentTotal.subsidy,
      currentTotal.netAmount,
      currentTotal.refundLoss,
      currentTotal.netAmount - currentTotal.refundLoss,
    ]);
    try {
      const result = await saveDataFile(`月度汇总_${currentMonthStr}.xlsx`);
      if (!result.canceled && result.filePath)
        await exportToExcel([headers, ...rows], result.filePath);
    } catch (e) {
      console.error(e);
    }
  }, [currentSummary, currentTotal, currentMonthStr]);

  const ColorDot = (p: string) => {
    const colors: Record<string, string> = {
      淘宝: "bg-orange-400",
      天猫: "bg-red-400",
      京东: "bg-blue-400",
      抖音电商: "bg-pink-400",
      快手电商: "bg-purple-400",
      拼多多: "bg-yellow-400",
    };
    return (
      <span
        className={`inline-block w-2.5 h-2.5 rounded-full ${colors[p] || "bg-gray-400"} mr-1.5`}
      />
    );
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* 月度选择器 */}
        <div className="panel-card">
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">📅 月度对账汇总</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              基于已导入账单，自动按月汇总各平台数据
            </p>
          </div>
          <div className="p-4 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-600">
                汇总月份
              </label>
              <select
                aria-label="汇总年份"
                name="summary-year"
                autoComplete="off"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus-visible:border-blue-500"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}年
                  </option>
                ))}
              </select>
              <select
                aria-label="汇总月份"
                name="summary-month"
                autoComplete="off"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus-visible:border-blue-500"
              >
                {months.map((m) => (
                  <option key={m} value={m}>
                    {m}月
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-600">
                对比月份
              </label>
              <select
                aria-label="对比月份"
                name="comparison-month"
                autoComplete="off"
                value={
                  comparisonMonth
                    ? `${comparisonMonth.year}-${String(comparisonMonth.month).padStart(2, "0")}`
                    : ""
                }
                onChange={(e) => {
                  if (!e.target.value) {
                    setComparisonMonth(null);
                    return;
                  }
                  const [y, m] = e.target.value.split("-").map(Number);
                  setComparisonMonth({ year: y, month: m });
                }}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus-visible:border-blue-500"
              >
                <option value="">不对比</option>
                {comparisonOptions.map((option) => {
                  if (option.value === currentMonthStr) return null;
                  return (
                    <option key={option.value} value={option.value}>
                      {option.year}年{option.month}月
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="flex-1" />

            <button
              onClick={onImportBill}
              disabled={!desktopReady}
              className="px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-40"
            >
              + 导入账单
            </button>

            {currentSummary.length > 0 && (
              <button
                onClick={handleExport}
                disabled={!desktopReady}
                className="px-4 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm disabled:opacity-40"
              >
                📥 导出Excel
              </button>
            )}
          </div>
        </div>

        {/* 总览卡片 */}
        {currentSummary.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                label: "账务交易收入",
                value: currentTotal.gmv,
                unit: "¥",
                icon: "💰",
                colorClass: "text-blue-700",
              },
              {
                label: "净收款",
                value: currentTotal.netAmount,
                unit: "¥",
                icon: "✅",
                colorClass: "text-emerald-700",
              },
              {
                label: "退款+平台费用",
                value:
                  currentTotal.refundAmount +
                  currentTotal.commission +
                  currentTotal.techFee +
                  currentTotal.otherFee,
                unit: "¥",
                icon: "💸",
                colorClass: "text-rose-700",
              },
              {
                label: "补贴/返点",
                value: currentTotal.subsidy,
                unit: "¥",
                icon: "🎁",
                colorClass: "text-violet-700",
              },
            ].map((card) => (
              <div key={card.label} className="panel-card p-4">
                <div className="text-xs text-gray-500 mb-1">
                  {card.icon} {card.label}
                </div>
                <div className={`text-xl font-bold ${card.colorClass}`}>
                  {card.unit}
                  {fmt(card.value)}
                </div>
                {comparisonSummary.length > 0 &&
                  (() => {
                    const comp = comparisonSummary.reduce((s, p) => {
                      if (card.label.includes("交易收入")) return s + p.gmv;
                      if (card.label.includes("净收款")) return s + p.netAmount;
                      if (card.label.includes("退款"))
                        return (
                          s +
                          p.refundAmount +
                          p.commission +
                          p.techFee +
                          p.otherFee
                        );
                      if (card.label.includes("补贴")) return s + p.subsidy;
                      return 0;
                    }, 0);
                    const d = delta(card.value, comp);
                    if (!d) return null;
                    return (
                      <div
                        className={`text-xs mt-1 ${d.up ? "text-green-600" : "text-red-600"}`}
                      >
                        {d.up ? "↑" : "↓"} {fmt(Math.abs(d.diff))} ({d.pct}%)
                      </div>
                    );
                  })()}
              </div>
            ))}
          </div>
        )}

        {/* 平台汇总表 */}
        {currentSummary.length > 0 ? (
          <div className="panel-card overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800">
                  {selectedYear}年{selectedMonth}月 各平台汇总
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  点击列头可排序 | 红色数字为支出项
                </p>
              </div>
              <div className="text-sm text-gray-500">
                共 {currentSummary.length} 个平台 ·{" "}
                {currentTotal.orderCount.toLocaleString()} 笔订单
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium">
                      平台
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs text-gray-500 font-medium">
                      交易收入 (¥)
                    </th>
                    {comparisonSummary.length > 0 && (
                      <th className="px-4 py-2.5 text-right text-xs text-gray-500 font-medium">
                        对比月收入
                      </th>
                    )}
                    {comparisonSummary.length > 0 && (
                      <th className="px-4 py-2.5 text-right text-xs text-gray-500 font-medium">
                        收入变化
                      </th>
                    )}
                    <th className="px-4 py-2.5 text-right text-xs text-gray-500 font-medium">
                      订单数
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs text-gray-500 font-medium">
                      退款 (¥)
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs text-gray-500 font-medium">
                      佣金 (¥)
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs text-gray-500 font-medium">
                      平台服务费(净) (¥)
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs text-gray-500 font-medium">
                      其他费用 (¥)
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs text-gray-500 font-medium">
                      补贴/返点 (¥)
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs text-gray-500 font-medium">
                      净收款 (¥)
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs text-gray-500 font-medium">
                      实际收入 (¥)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {currentSummary.map((p) => {
                    const compP = comparisonSummary.find(
                      (c) => c.platform === p.platform,
                    );
                    const gmvDelta = compP ? delta(p.gmv, compP.gmv) : null;
                    return (
                      <tr
                        key={p.platform}
                        className="border-t hover:bg-gray-50"
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center">
                            {ColorDot(p.platform)}
                            <span className="font-medium text-gray-800">
                              {p.platform}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-gray-800">
                          {fmt(p.gmv)}
                        </td>
                        {comparisonSummary.length > 0 && (
                          <>
                            <td className="px-4 py-2.5 text-right text-gray-500">
                              {compP ? fmt(compP.gmv) : "-"}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {gmvDelta ? (
                                <span
                                  className={
                                    gmvDelta.up
                                      ? "text-green-600"
                                      : "text-red-600"
                                  }
                                >
                                  {gmvDelta.up ? "↑" : "↓"}{" "}
                                  {Math.abs(parseFloat(gmvDelta.pct))}%
                                </span>
                              ) : (
                                "-"
                              )}
                            </td>
                          </>
                        )}
                        <td className="px-4 py-2.5 text-right text-gray-600">
                          {p.orderCount.toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right text-rose-600">
                          {fmt(p.refundAmount)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-red-600">
                          {fmt(p.commission)}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right ${
                            p.techFee < 0 ? "text-green-600" : "text-orange-600"
                          }`}
                        >
                          {fmt(p.techFee)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-amber-700">
                          {fmt(p.otherFee)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-green-600">
                          {fmt(p.subsidy)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-blue-700">
                          {fmt(p.netAmount)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-indigo-700">
                          {fmt(p.netAmount - p.refundLoss)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* 合计行 */}
                <tfoot className="bg-gray-50 font-bold border-t-2">
                  <tr>
                    <td className="px-4 py-2.5 text-gray-700">合计</td>
                    <td className="px-4 py-2.5 text-right text-gray-800">
                      {fmt(currentTotal.gmv)}
                    </td>
                    {comparisonSummary.length > 0 && (
                      <>
                        <td className="px-4 py-2.5 text-right text-gray-500">
                          {fmt(
                            comparisonSummary.reduce((s, p) => s + p.gmv, 0),
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {(() => {
                            const d = delta(
                              currentTotal.gmv,
                              comparisonSummary.reduce((s, p) => s + p.gmv, 0),
                            );
                            return d ? (
                              <span
                                className={
                                  d.up ? "text-green-600" : "text-red-600"
                                }
                              >
                                {d.up ? "↑" : "↓"} {Math.abs(parseFloat(d.pct))}
                                %
                              </span>
                            ) : null;
                          })()}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-2.5 text-right text-gray-800">
                      {currentTotal.orderCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right text-rose-600">
                      {fmt(currentTotal.refundAmount)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-red-600">
                      {fmt(currentTotal.commission)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right ${
                        currentTotal.techFee < 0
                          ? "text-green-600"
                          : "text-orange-600"
                      }`}
                    >
                      {fmt(currentTotal.techFee)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-amber-700">
                      {fmt(currentTotal.otherFee)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-green-600">
                      {fmt(currentTotal.subsidy)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-blue-700">
                      {fmt(currentTotal.netAmount)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-indigo-700">
                      {fmt(currentTotal.netAmount - currentTotal.refundLoss)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ) : (
          <div className="panel-card p-16 text-center text-gray-400">
            <div className="text-5xl mb-4">📊</div>
            <div className="text-lg font-medium">
              暂无{selectedYear}年{selectedMonth}月数据
            </div>
            <div className="text-sm mt-2 text-gray-400">
              请先在「账单对账」标签页导入账单数据
            </div>
            <button
              onClick={onImportBill}
              disabled={!desktopReady}
              className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-40"
            >
              导入账单
            </button>
          </div>
        )}

        {/* 月度趋势说明 */}
        {currentSummary.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
            <div className="font-medium mb-1">💡 月度汇总说明</div>
            <ul className="space-y-0.5 text-xs">
              <li>
                • <strong>实际收入</strong> = 净收款 - 预估佣金损失（退款订单 ×
                平均佣金率）
              </li>
              <li>
                • <strong>交易收入</strong>、退款、平台服务费(净)和其他费用均来自账务明细；
                净收款已经扣除退款及费用
              </li>
              <li>
                • <strong>对比月份</strong>
                可跨年份选择月份，显示账务交易收入变化，↑表示增长，↓表示下降
              </li>
              <li>
                •
                预估佣金率来自已导入账单的汇总数据，精确佣金请以平台官方账单为准
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
