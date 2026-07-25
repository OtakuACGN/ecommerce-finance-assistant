/**
 * 经营分析视图表：按 view 取表 + 排序/置顶（纯函数，便于从 App 拆出）
 */
import type { OperatingReport } from "./pddBusiness";
import {
  filterOrderTable,
  type OrderTableFilter,
} from "./opCostSettings";

export function applyRankSortTable(
  table: any[][] | undefined,
  mode: "profit" | "loss",
): any[][] {
  if (!table || table.length <= 1) return table || [];
  if (mode === "profit") return table;
  const header = table[0];
  const rows = table.slice(1).slice().reverse();
  const ranked = rows.map((r, i) => {
    const copy = [...r];
    if (typeof copy[0] === "number" || /^\d+$/.test(String(copy[0]))) {
      copy[0] = i + 1;
    }
    return copy;
  });
  return [header, ...ranked];
}

/** 待填成本 / 未匹配行置顶 */
export function sortPendingCostFirst(table: any[][]): any[][] {
  if (!table || table.length <= 1) return table || [];
  const header = table[0] || [];
  const flagIdx = header.findIndex((h) => {
    const s = String(h);
    return s.includes("填写标记") || s.includes("成本匹配") || s === "有成本";
  });
  const costIdx = header.findIndex((h) => /成本/.test(String(h)));
  const idx = flagIdx >= 0 ? flagIdx : costIdx;
  if (idx < 0) return table;
  const body = table.slice(1).slice();
  body.sort((ra, rb) => {
    const sa = String(ra[idx] ?? "");
    const sb = String(rb[idx] ?? "");
    const pa = /待填|否|缺|未|0$/.test(sa) || Number(sa) === 0 ? 0 : 1;
    const pb = /待填|否|缺|未|0$/.test(sb) || Number(sb) === 0 ? 0 : 1;
    return pa - pb;
  });
  return [header, ...body];
}

function unmatchedFallbackTable(report: OperatingReport): any[][] {
  return [
    [
      "待补键",
      "商品名称",
      "规格名称",
      "商家编码-规格",
      "商家编码-商品",
      "商品ID",
      "关联订单数",
      "商家实收合计",
      "样例订单号",
    ],
    ...report.unmatchedSkus.map((u) => [
      u.key,
      u.productName,
      u.specName,
      u.merchantSku,
      u.merchantSpu,
      u.productId,
      u.count,
      u.amount.toFixed(2),
      u.sampleOrderIds,
    ]),
  ];
}

/** 解析经营分析当前视图对应的二维表 */
export function resolveOperatingViewTable(
  report: OperatingReport,
  view: string,
  rankSort: "profit" | "loss" = "profit",
  orderTableFilter: OrderTableFilter = "all",
): any[][] {
  const tableMap: Record<string, any[][]> = {
    summary: report.summaryTable,
    orders: report.orderTable,
    rates: report.rateTable,
    shipLoss: report.shipLossTable,
    billTypes: report.billTypeTable,
    billWide: report.billWideTable,
    ads: report.adTable,
    products: report.productMapTable,
    unmatched: report.unmatchedTable?.length
      ? report.unmatchedTable
      : unmatchedFallbackTable(report),
    period: report.periodTable,
    express: report.expressTable,
    expressAlert: report.expressAlertTable || [],
    matchMethod: report.matchMethodTable || [],
    shops: report.shopTable,
    spuRank: applyRankSortTable(report.spuTable, rankSort),
    skuRank: applyRankSortTable(report.skuTable, rankSort),
    salesRankSku: report.salesRankSkuTable || [],
    salesRankSpu: report.salesRankSpuTable || [],
    productReturn: report.productReturnTable || [],
    lossDiagnosis: report.lossDiagnosisTable || [],
    bossOnePager: report.bossOnePagerTable || [],
    anomalies: report.anomalySummaryTable || [],
    anomalyNeg: report.anomalyNegProfitTable || [],
    anomalyUnmatched: report.anomalyUnmatchedTable || [],
    anomalyFeeFlip: report.anomalyFeeFlipTable || [],
    anomalyHighSku: report.anomalyHighRefundSkuTable || [],
    anomalyPartial: report.anomalyPartialRefundTable || [],
  };
  let table = tableMap[view] || report.summaryTable;
  if (view === "products" || view === "unmatched") {
    table = sortPendingCostFirst(table);
  }
  if (view === "orders" && orderTableFilter !== "all") {
    table = filterOrderTable(report.orderTable, orderTableFilter);
  }
  return table;
}
