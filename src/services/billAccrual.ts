/**
 * 账单计提 / 退款损失表：纯函数，便于 smoke 与 App 瘦身
 */
import type { BillRecord, CommissionDetail, RefundOrder } from "./businessLogic";
import { calculateRefundLossWithMatching } from "./businessLogic";

export function buildAccrualTable(billRecords: BillRecord[]): any[][] {
  const headers = [
    "平台",
    "账期",
    "账单金额",
    "订单笔数",
    "佣金",
    "技术服务费",
    "补贴/返点",
    "净收款",
    "佣金率",
    "技术服务费率",
    "是否跨期",
  ];
  const rows = billRecords.map((b) => {
    const commRate =
      b.totalAmount > 0
        ? ((b.commission / b.totalAmount) * 100).toFixed(2) + "%"
        : "0%";
    const techRate =
      b.totalAmount > 0
        ? ((b.techFee / b.totalAmount) * 100).toFixed(2) + "%"
        : "0%";
    const today = new Date();
    const billDate = new Date(b.date);
    const isCrossPeriod =
      !isNaN(billDate.getTime()) && billDate.getMonth() !== today.getMonth();
    return [
      b.platform,
      b.date,
      b.totalAmount.toFixed(2),
      b.orderCount,
      b.commission.toFixed(2),
      b.techFee.toFixed(2),
      b.subsidy.toFixed(2),
      b.netAmount.toFixed(2),
      commRate,
      techRate,
      isCrossPeriod ? "⚠️跨期" : "当月",
    ];
  });
  const totalRow = [
    "合计",
    "",
    billRecords.reduce((s, b) => s + b.totalAmount, 0).toFixed(2),
    billRecords.reduce((s, b) => s + b.orderCount, 0),
    billRecords.reduce((s, b) => s + b.commission, 0).toFixed(2),
    billRecords.reduce((s, b) => s + b.techFee, 0).toFixed(2),
    billRecords.reduce((s, b) => s + b.subsidy, 0).toFixed(2),
    billRecords.reduce((s, b) => s + b.netAmount, 0).toFixed(2),
    "",
    "",
    "",
  ];
  return [headers, ...rows, totalRow];
}

export function avgCommissionRateFromBills(billRecords: BillRecord[]): number {
  if (billRecords.length === 0) return 0.05;
  const totalAmt = billRecords.reduce((s, b) => s + b.totalAmount, 0);
  if (totalAmt <= 0) return 0.05;
  return billRecords.reduce((s, b) => s + b.commission, 0) / totalAmt;
}

export function buildRefundLossTable(
  refundRecords: RefundOrder[],
  commissionDetails: CommissionDetail[],
  billRecords: BillRecord[],
): {
  table: any[][];
  matchedCount: number;
  totalCount: number;
} {
  const avgCommissionRate = avgCommissionRateFromBills(billRecords);
  const { results, matchedCount, totalCount } = calculateRefundLossWithMatching(
    refundRecords,
    commissionDetails,
    avgCommissionRate,
  );

  const matchedAmount = results
    .filter((r) => r.isMatched)
    .reduce((s, r) => s + r.commission, 0);
  const estimatedAmount = results
    .filter((r) => !r.isMatched)
    .reduce((s, r) => s + r.commission, 0);

  const headers = [
    "平台",
    "退款日期",
    "订单号",
    "退款金额",
    "实际佣金",
    "匹配状态",
    "佣金来源",
    "损失合计",
    "说明",
  ];

  const rows = results.map((r) => [
    r.platform,
    r.refundDate,
    r.orderId,
    r.refundAmount.toFixed(2),
    r.commission.toFixed(2),
    r.isMatched ? "✅已匹配" : "⚠️估算",
    r.matchSource,
    (r.refundAmount + r.commission).toFixed(2),
    r.isMatched ? "退款+佣金双重损失" : "退款+估算佣金损失",
  ]);

  const totalRefund = refundRecords.reduce((s, r) => s + r.refundAmount, 0);
  const totalComm = results.reduce((s, r) => s + r.commission, 0);

  const totalRow = [
    "合计",
    "",
    `${matchedCount}/${totalCount} 笔已匹配`,
    totalRefund.toFixed(2),
    totalComm.toFixed(2),
    matchedCount === totalCount
      ? "✅100%匹配"
      : `⚠️${totalCount - matchedCount}笔估算`,
    matchedCount > 0
      ? `精确¥${matchedAmount.toFixed(2)}/估算¥${estimatedAmount.toFixed(2)}`
      : "全部估算",
    (totalRefund + totalComm).toFixed(2),
    `涉及 ${refundRecords.length} 笔退款`,
  ];

  return {
    table: [headers, ...rows, totalRow],
    matchedCount,
    totalCount,
  };
}
