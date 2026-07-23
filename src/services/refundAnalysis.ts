export type RefundKind = "none" | "full" | "partial" | "unknown";

export interface OrderRefundAnalysis {
  refundKind: RefundKind;
  baseAmount: number;
  billRefund: number;
  billResidual: number;
  merchantReceived: number;
  refundAmount: number;
  refundRatio: number;
  residualRatio: number;
  revenue: number;
  compareNote: string;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Compare merchantReceived vs bill refund to detect partial refunds. */
export function analyzeOrderRefund(
  order: { merchantReceived: number; goodsTotal: number; status: string; afterSale: string },
  bill?: { income: number; refund: number; subsidy: number } | null,
  refunded?: boolean,
): OrderRefundAnalysis {
  const isRef =
    refunded ??
    (/退款成功/.test(String(order.status || "")) ||
      /退款成功/.test(String(order.afterSale || "")));
  const mr = Math.max(0, Number(order.merchantReceived) || 0);
  const gt = Math.max(0, Number(order.goodsTotal) || 0);
  const billIncome = Math.max(0, Number(bill?.income) || 0);
  const billRefund = Math.max(0, Number(bill?.refund) || 0);
  const subsidy = Number(bill?.subsidy) || 0;
  const billResidual = bill ? Math.max(0, billIncome - billRefund + subsidy) : 0;
  const hasBillMoney = !!(bill && (billIncome > 0 || billRefund > 0 || Math.abs(subsidy) > 0));
  const baseAmount = Math.max(billIncome, gt, mr + billRefund, mr);

  if (!isRef) {
    const revenue = mr > 0 ? mr : hasBillMoney ? billResidual : 0;
    return {
      refundKind: "none",
      baseAmount,
      billRefund,
      billResidual,
      merchantReceived: mr,
      refundAmount: billRefund,
      refundRatio: 0,
      residualRatio: 1,
      revenue,
      compareNote: hasBillMoney ? "未退款；收入优先商家实收" : "未退款",
    };
  }

  if (hasBillMoney) {
    const revenue = billResidual;
    const eps = Math.max(0.05, baseAmount * 0.02);
    const covered = baseAmount > 0 ? billRefund + eps >= baseAmount : billRefund > 0 && revenue <= eps;
    const residualTiny = revenue <= eps && mr <= eps;
    if (residualTiny || covered) {
      const refundAmount = billRefund > 0 ? billRefund : baseAmount;
      return {
        refundKind: "full",
        baseAmount,
        billRefund,
        billResidual,
        merchantReceived: mr,
        refundAmount,
        refundRatio: 1,
        residualRatio: 0,
        revenue: Math.max(0, revenue),
        compareNote:
          "全额退：账务退款 " +
          billRefund.toFixed(2) +
          " / 基准 " +
          baseAmount.toFixed(2) +
          "，商家实收 " +
          mr.toFixed(2),
      };
    }
    const refundAmount =
      billRefund > 0 ? billRefund : Math.max(0, baseAmount - Math.max(revenue, mr));
    let finalRevenue = revenue;
    if (revenue <= eps && mr > eps) finalRevenue = mr;
    const residualRatio = baseAmount > 0 ? clamp01(finalRevenue / baseAmount) : 0;
    const refundRatio =
      baseAmount > 0 ? clamp01(refundAmount / baseAmount) : clamp01(1 - residualRatio);
    const sumCheck = mr + refundAmount;
    const gap = sumCheck - baseAmount;
    const mis =
      baseAmount > 0 && Math.abs(gap) > Math.max(1, baseAmount * 0.05)
        ? "；⚠️实收+实退与基准差 " + gap.toFixed(2)
        : "";
    return {
      refundKind: "partial",
      baseAmount,
      billRefund,
      billResidual,
      merchantReceived: mr,
      refundAmount,
      refundRatio,
      residualRatio,
      revenue: finalRevenue,
      compareNote:
        "部分退：账务退款 " +
        billRefund.toFixed(2) +
        " / 基准 " +
        baseAmount.toFixed(2) +
        "，商家实收 " +
        mr.toFixed(2) +
        "，确认收入 " +
        finalRevenue.toFixed(2) +
        mis,
    };
  }

  if (mr > 0.05) {
    const base = Math.max(gt, mr);
    const refundAmount = gt > mr + 0.05 ? gt - mr : 0;
    const residualRatio = base > 0 ? clamp01(mr / base) : 1;
    return {
      refundKind: "partial",
      baseAmount: base,
      billRefund: 0,
      billResidual: 0,
      merchantReceived: mr,
      refundAmount,
      refundRatio: clamp01(1 - residualRatio),
      residualRatio,
      revenue: mr,
      compareNote:
        refundAmount > 0
          ? "部分退(无账务)：商家实收 " +
            mr.toFixed(2) +
            "，商品总价 " +
            gt.toFixed(2) +
            "，推断退款 " +
            refundAmount.toFixed(2)
          : "部分退(无账务)：状态退款但商家实收>0，按实收确认收入",
    };
  }

  return {
    refundKind: "full",
    baseAmount: Math.max(gt, baseAmount),
    billRefund: 0,
    billResidual: 0,
    merchantReceived: mr,
    refundAmount: Math.max(gt, baseAmount),
    refundRatio: 1,
    residualRatio: 0,
    revenue: 0,
    compareNote: "全额退(无账务)：状态退款且商家实收约等于0",
  };
}

