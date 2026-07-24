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

function isUnshippedRefundStatus(status: string, afterSale: string): boolean {
  const st = `${status || ""}|${afterSale || ""}`;
  // 未发货仅退款：订单侧通常无真实成交留存
  if (/未发货/.test(st) && /退款成功/.test(st)) return true;
  if (/未发货，退款成功|未发货退款成功/.test(st)) return true;
  return false;
}

/**
 * 比对商家实收 vs 账务退款，识别全额/部分退。
 * 口径：
 * - 真部分退：只扣退款额，确认收入=账务残留（收入-退款+补贴）
 * - 账务退款覆盖账务收入：全额退，确认收入=残留（通常 0）；订单「商家实收」常未清零，禁止回填
 * - 未发货仅退款：无收入
 */
export function analyzeOrderRefund(
  order: { merchantReceived: number; goodsTotal: number; status: string; afterSale: string },
  bill?: { income: number; refund: number; subsidy: number } | null,
  refunded?: boolean,
): OrderRefundAnalysis {
  const status = String(order.status || "");
  const afterSale = String(order.afterSale || "");
  const isRef =
    refunded ??
    (/退款成功/.test(status) || /退款成功/.test(afterSale));
  const mr = Math.max(0, Number(order.merchantReceived) || 0);
  const gt = Math.max(0, Number(order.goodsTotal) || 0);
  const billIncome = Math.max(0, Number(bill?.income) || 0);
  const billRefund = Math.max(0, Number(bill?.refund) || 0);
  const subsidy = Number(bill?.subsidy) || 0;
  const billResidual = bill ? Math.max(0, billIncome - billRefund + subsidy) : 0;
  const hasBillMoney = !!(bill && (billIncome > 0 || billRefund > 0 || Math.abs(subsidy) > 0));
  const unshippedRefund = isUnshippedRefundStatus(status, afterSale);

  // 基准：优先账务收入/商品总价/实收，禁止用「实收+退款」叠高（会把全额退打成 50% 部分退）
  const baseAmount = Math.max(billIncome, gt, mr);

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

  // 未发货仅退款：明确无收入（无论订单实收字段是否还挂着原金额）
  if (unshippedRefund) {
    const refundAmount = billRefund > 0 ? billRefund : Math.max(gt, mr, billIncome);
    return {
      refundKind: "full",
      baseAmount: Math.max(baseAmount, refundAmount),
      billRefund,
      billResidual,
      merchantReceived: mr,
      refundAmount,
      refundRatio: 1,
      residualRatio: 0,
      revenue: 0,
      compareNote:
        "全额退(未发货)：无成交留存；账务退款 " +
        billRefund.toFixed(2) +
        "，订单实收字段 " +
        mr.toFixed(2) +
        " 不计入收入",
    };
  }

  if (hasBillMoney) {
    const settleBase = billIncome > 0 ? billIncome : Math.max(gt, mr, 0);
    const eps = Math.max(0.05, Math.max(settleBase, billRefund, 1) * 0.02);
    const residual = Math.max(0, billResidual);
    // 账务退款覆盖账务收入，或账务残留≈0 且确实发生退款 → 全额退
    const incomeFullyRefunded = billIncome > 0 && billRefund + eps >= billIncome;
    const residualTiny = residual <= eps;
    const refundCoversSettle =
      settleBase > 0 ? billRefund + eps >= settleBase : billRefund > 0 && residualTiny;

    if (incomeFullyRefunded || (residualTiny && (refundCoversSettle || billRefund > 0))) {
      const refundAmount = billRefund > 0 ? billRefund : settleBase;
      return {
        refundKind: "full",
        baseAmount: Math.max(baseAmount, settleBase),
        billRefund,
        billResidual,
        merchantReceived: mr,
        refundAmount,
        refundRatio: 1,
        residualRatio: 0,
        // 全额退只认账务残留（通常 0）；订单商家实收可能未清零，禁止回填
        revenue: residual,
        compareNote:
          "全额退：账务退款 " +
          billRefund.toFixed(2) +
          " / 账务收入 " +
          billIncome.toFixed(2) +
          "，残留 " +
          residual.toFixed(2) +
          "；订单实收字段 " +
          mr.toFixed(2) +
          " 不计入",
      };
    }

    // 状态退款但账务尚无退款额：不记部分退，收入按账务残留（避免虚标部分退）
    if (billRefund <= eps) {
      return {
        refundKind: residual <= eps ? "full" : "unknown",
        baseAmount: Math.max(baseAmount, settleBase),
        billRefund,
        billResidual,
        merchantReceived: mr,
        refundAmount: residual <= eps ? Math.max(settleBase, billIncome) : 0,
        refundRatio: residual <= eps ? 1 : 0,
        residualRatio: residual <= eps ? 0 : 1,
        revenue: residual,
        compareNote:
          residual <= eps
            ? "全额退：账务残留≈0 且未见明确退款拆分"
            : "退款状态待账务：账务尚未见退款，暂按残留收入 " + residual.toFixed(2),
      };
    }

    // 真部分退：确认收入=账务残留，只扣退款额
    const refundAmount = billRefund;
    const finalRevenue = residual;
    const ratioBase = settleBase > 0 ? settleBase : Math.max(finalRevenue + refundAmount, 1);
    const residualRatio = clamp01(finalRevenue / ratioBase);
    const refundRatio = clamp01(refundAmount / ratioBase);
    return {
      refundKind: "partial",
      baseAmount: Math.max(baseAmount, settleBase),
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
        " / 账务收入 " +
        billIncome.toFixed(2) +
        "，确认收入 " +
        finalRevenue.toFixed(2) +
        "（只扣退款额）",
    };
  }

  // 无账务明细：已发货后退款且实收>0 时，保守按实收确认（缺账无法断定全额）
  if (mr > 0.05) {
    const base = Math.max(gt, mr);
    // 实收接近总价：更像「状态已退但缺账务/字段未更新」→ 无账务时不强行当部分退保留
    // 仅当实收明显小于总价时，才按差额推断部分退
    if (gt > mr + Math.max(1, gt * 0.05)) {
      const refundAmount = gt - mr;
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
          "部分退(无账务)：商家实收 " +
          mr.toFixed(2) +
          "，商品总价 " +
          gt.toFixed(2) +
          "，推断退款 " +
          refundAmount.toFixed(2),
      };
    }
    // 实收≈总价且状态退款成功：缺账务，按全额退处理（避免虚增收入）
    return {
      refundKind: "full",
      baseAmount: base,
      billRefund: 0,
      billResidual: 0,
      merchantReceived: mr,
      refundAmount: base,
      refundRatio: 1,
      residualRatio: 0,
      revenue: 0,
      compareNote:
        "全额退(无账务)：状态退款成功且实收≈商品总价，缺账务明细，不按实收计收入",
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
