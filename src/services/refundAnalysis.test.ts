import { describe, expect, it } from "vitest";
import { analyzeOrderRefund } from "./refundAnalysis";
import { buildOperatingReport, DEFAULT_COST_SETTINGS } from "./pdd";

describe("refund classification", () => {
  it("classifies a cross-month partial refund using the order amount when current-period income is absent", () => {
    const result = analyzeOrderRefund(
      {
        merchantReceived: 100,
        goodsTotal: 100,
        status: "已收货，退款成功",
        afterSale: "仅退款成功",
      },
      {
        income: 0,
        refund: 20,
        subsidy: 0,
      },
      true,
    );

    expect(result.refundKind).toBe("partial");
    expect(result.refundAmount).toBe(20);
    expect(result.revenue).toBe(80);
    expect(result.refundRatio).toBe(0.2);
  });

  it("keeps a cross-month refund full when the refund reaches the order amount", () => {
    const result = analyzeOrderRefund(
      {
        merchantReceived: 100,
        goodsTotal: 100,
        status: "已收货，退款成功",
        afterSale: "仅退款成功",
      },
      {
        income: 0,
        refund: 100,
        subsidy: 3,
      },
      true,
    );

    expect(result.refundKind).toBe("full");
    expect(result.revenue).toBe(3);
    expect(result.refundRatio).toBe(1);
  });

  it("reports a refund-only cross-month adjustment as partial on the operating dashboard", () => {
    const report = buildOperatingReport(
      [{
        orderId: "CROSS-PARTIAL-1",
        productName: "测试商品",
        status: "已收货，退款成功",
        afterSale: "仅退款成功",
        qty: 1,
        goodsTotal: 100,
        buyerPaid: 100,
        merchantReceived: 100,
        platformDiscount: 0,
        shopDiscount: 0,
        productId: "P1",
        specName: "标准",
        merchantSku: "SKU1",
        merchantSpu: "SPU1",
        dealTime: "2026-06-10",
        shipTime: "2026-06-11",
        confirmTime: "2026-06-15",
        postage: 0,
        expressNo: "YT1",
        expressCompany: "圆通",
        shopName: "默认店铺",
      }],
      [{
        orderId: "CROSS-PARTIAL-1",
        time: "2026-07-02",
        income: 0,
        expense: 20,
        billType: "退款",
        remark: "",
        bizDesc: "",
      }],
      [],
      [],
      {
        ...DEFAULT_COST_SETTINGS,
        adAllocateMode: "none",
        defaultPackCost: 0,
        firstWeightFee: 0,
        additionalWeightFee: 0,
        expressRules: [],
      },
      [],
    );

    expect(report.summary.fullRefundCount).toBe(0);
    expect(report.summary.partialRefundCount).toBe(1);
    expect(report.orderProfits[0].refundKind).toBe("partial");
    expect(report.orderProfits[0].revenue).toBe(80);
  });

  it("does not guess full or partial when neither ledger income nor order amount is available", () => {
    const result = analyzeOrderRefund(
      {
        merchantReceived: 0,
        goodsTotal: 0,
        status: "已收货，退款成功",
        afterSale: "仅退款成功",
      },
      {
        income: 0,
        refund: 20,
        subsidy: 0,
      },
      true,
    );

    expect(result.refundKind).toBe("unknown");
    expect(result.refundAmount).toBe(20);
    expect(result.revenue).toBe(0);
  });
});
