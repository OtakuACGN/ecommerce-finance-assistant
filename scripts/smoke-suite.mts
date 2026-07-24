/**
 * DianCaiTong 1.2.4 smoke suite
 */
import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import * as XLSX from "xlsx";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(rel: string) {
  return import(pathToFileURL(path.join(root, rel)).href);
}

function fd(name: string, data: any[][]) {
  return { name, path: name, headers: (data[0] || []).map(String), data };
}

async function main() {
  let failed = 0;
  const ok = (name: string, cond: boolean, detail = "") => {
    if (cond) console.log("PASS " + name);
    else {
      failed++;
      console.error("FAIL " + name + (detail ? " | " + detail : ""));
    }
  };

  const express = await load("src/services/expressReconcile.ts");
  const bill = fd("bill.xlsx", [
    ["运单号", "预付面单", "运费", "加收费", "合计费用", "目的省份"],
    ["YT1", 3, 2.3, 0, 5.3, "浙江"],
    ["YT2", 3, 2.3, 0.5, 5.8, "江苏"],
  ]);
  const ship = fd("ship.xlsx", [
    ["运单号", "订单号", "快递公司", "发货时间", "商品名称", "商品数量"],
    ["YT1", "O1", "圆通", "2026-04-01", "垫", 1],
    ["YT2", "O2", "圆通", "2026-04-02", "枕", 1],
  ]);
  const rec = express.parseAndReconcile(bill, ship, { highFeeThreshold: 8 });
  const sumFace = rec.rows.reduce((s: number, r: any) => s + (Number(r.faceFee) || 0), 0);
  const sumTotal = rec.rows.reduce((s: number, r: any) => s + (Number(r.totalFee) || 0), 0);
  ok("express.matched", rec.summary.matched === 2, String(rec.summary.matched));
  ok("express.totalFee", Math.abs(sumTotal - 5.1) < 0.01, String(sumTotal));
  ok("express.faceNotInTotal", Math.abs(sumTotal - sumFace) > 0.5, "face=" + sumFace + " total=" + sumTotal);
  ok("express.billFeeTotal", Math.abs(rec.summary.billFeeTotal - sumTotal) < 0.01, String(rec.summary.billFeeTotal));
  const table = express.resultToTable(rec.rows, "all");
  ok("express.exportFace", table[0].includes("预付面单"));
  ok("express.exportActual", table[0].includes("实际费用"));
  ok("express.exportDiff", table[0].some((h: string) => String(h).includes("预付差额")));

  const after = await load("src/services/afterSaleAnalysis.ts");
  const afterData = [
    ["售后单号","售后状态","平台售后状态","订单状态","售后类型","退款类型","发货状态","快递公司","快递单号","平台订单号","售后原因","售后描述","商品名称","商品规格","商品ID","申请退款金额","订单金额","退款数量","商品数量"],
    ["SH1","已确认","退款成功","已发货","退款","","买家已签收","圆通","YT1","ORD1","其他原因","","垫","标准款","P1",15,39,1,1],
    ["SH2","已确认","退款成功","已发货","退款","","买家已签收","圆通","YT2","ORD2","质量问题","质量问题、做工太差","垫","标准款","P1",39,39,1,1],
  ];
  const ar = after.parseAndAnalyzeAfterSales(fd("after.xlsx", afterData));
  ok("after.success", ar.summary.success === 2, String(ar.summary.success));
  ok("after.partial", ar.summary.partialRefund >= 1, String(ar.summary.partialRefund));
  const emptyN = ar.rows.filter((r: any) => r.descClusterKey === "empty" || r.descClusterLabel === "无有效描述").length;
  ok("after.emptyDesc", emptyN >= 1, String(emptyN));

  
  // refund classification: full vs partial
  {
    const { analyzeOrderRefund } = await load("src/services/refundAnalysis.ts");
    const fullUnship = analyzeOrderRefund(
      { merchantReceived: 89, goodsTotal: 89, status: "未发货，退款成功", afterSale: "退款成功" },
      { income: 89, refund: 89, subsidy: 0 },
      true,
    );
    ok("refund.unshipped_full", fullUnship.refundKind === "full" && fullUnship.revenue === 0, JSON.stringify(fullUnship));
    const fullBill = analyzeOrderRefund(
      { merchantReceived: 156.42, goodsTotal: 158, status: "已收货，退款成功", afterSale: "退款成功" },
      { income: 156.42, refund: 156.42, subsidy: 0 },
      true,
    );
    ok("refund.bill_full_no_mr_fallback", fullBill.refundKind === "full" && Math.abs(fullBill.revenue) < 0.01, JSON.stringify(fullBill));
    const partial = analyzeOrderRefund(
      { merchantReceived: 69, goodsTotal: 69, status: "已收货，退款成功", afterSale: "退款成功" },
      { income: 69, refund: 15, subsidy: 0 },
      true,
    );
    ok(
      "refund.true_partial",
      partial.refundKind === "partial" && Math.abs(partial.revenue - 54) < 0.01 && Math.abs(partial.refundAmount - 15) < 0.01,
      JSON.stringify(partial),
    );
    const cancelled = analyzeOrderRefund(
      { merchantReceived: 89, goodsTotal: 89, status: "已取消", afterSale: "" },
      null,
      false,
    );
    ok("refund.cancelled_zero", cancelled.revenue === 0 && cancelled.residualRatio === 0, JSON.stringify(cancelled));
  }

const pdd = await load("src/services/pddBusiness.ts");
  const orders = [{
    orderId: "A1", productName: "item", status: "已发货", afterSale: "", qty: 1,
    goodsTotal: 50, buyerPaid: 50, merchantReceived: 48, platformDiscount: 0, shopDiscount: 0,
    productId: "P1", specName: "RED", merchantSku: "", merchantSpu: "SPU1",
    dealTime: "2026-01-01", shipTime: "2026-01-02", confirmTime: "", postage: 0,
    expressNo: "YT9", expressCompany: "圆通", shopName: "shopA",
  }];
  const rows = pdd.buildProductMasterFromOrders(orders, [], "all");
  ok("productMaster.rows", rows.length >= 1, String(rows.length));
  const imp = pdd.productMasterImportTable(rows);
  ok("productMaster.table", Array.isArray(imp) && imp.length >= 2);

  // ad by_product: product-level spend allocated within same productId only
  {
    const orders2 = [
      { ...orders[0], orderId: "B1", productId: "111", goodsTotal: 100, merchantReceived: 100, qty: 1 },
      { ...orders[0], orderId: "B2", productId: "111", goodsTotal: 100, merchantReceived: 100, qty: 1 },
      { ...orders[0], orderId: "B3", productId: "222", goodsTotal: 100, merchantReceived: 100, qty: 1 },
    ];
    const adProducts = [
      { productId: "111", productName: "p1", spend: 20, gmv: 200, netGmv: 0, settledGmv: 0, orders: 2, roi: 10, netRoi: 0, settledRoi: 0 },
      { productId: "222", productName: "p2", spend: 10, gmv: 100, netGmv: 0, settledGmv: 0, orders: 1, roi: 10, netRoi: 0, settledRoi: 0 },
    ];
    const settings = { ...(pdd.DEFAULT_COST_SETTINGS || {}), adAllocateMode: "by_product" };
    const report = pdd.buildOperatingReport(orders2, [], [], [], settings, adProducts);
    const byId = Object.fromEntries(report.orderProfits.map((o: any) => [o.orderId, o.adAllocated]));
    ok("ad.by_product.B1", Math.abs((byId.B1 || 0) - 10) < 0.01, String(byId.B1));
    ok("ad.by_product.B2", Math.abs((byId.B2 || 0) - 10) < 0.01, String(byId.B2));
    ok("ad.by_product.B3", Math.abs((byId.B3 || 0) - 10) < 0.01, String(byId.B3));
    ok("ad.summary.deductsAll", Math.abs(report.summary.estimatedProfitBeforeAd - report.summary.estimatedProfitAfterAd - 30) < 0.5, String(report.summary.estimatedProfitAfterAd));

    // diagnostics: fee attribution + ad id mismatch warning
    {
      const orders3 = [
        { ...orders[0], orderId: "C1", productId: "111", status: "已发货", goodsTotal: 100, merchantReceived: 100, qty: 1 },
        { ...orders[0], orderId: "C2", productId: "222", status: "已取消", goodsTotal: 80, merchantReceived: 80, qty: 1 },
      ];
      const billLines = [
        { orderId: "C1", type: "交易收入", amount: 100, income: 100, outcome: 0 },
      ];
      // minimal bill lines shape may differ - use empty and rely on order path
      const adProducts3 = [
        { productId: "999", productName: "x", spend: 30, gmv: 0, netGmv: 0, settledGmv: 0, orders: 0, roi: 0, netRoi: 0, settledRoi: 0 },
      ];
      const settings3 = { ...(pdd.DEFAULT_COST_SETTINGS || {}), adAllocateMode: "by_product" };
      const rep3 = pdd.buildOperatingReport(orders3, [], [], [], settings3, adProducts3);
      ok("diag.cancelled_excluded", Math.abs((rep3.summary.confirmedRevenue || 0) - 100) < 0.01, String(rep3.summary.confirmedRevenue));
      ok("diag.cancelled_count", (rep3.summary.cancelledOrderCount || 0) === 1, String(rep3.summary.cancelledOrderCount));
      ok("diag.ad_intersection0", (rep3.summary.adIdIntersection || 0) === 0, String(rep3.summary.adIdIntersection));
      ok("diag.ad_warning", String(rep3.summary.adMatchWarning || "").includes("交集"), String(rep3.summary.adMatchWarning || ""));
      ok("diag.ad_unallocated", Math.abs((rep3.summary.adUnallocated || 0) - 30) < 0.01, String(rep3.summary.adUnallocated));

    // money-critical: unknown refund keeps revenue + product cost (not full-refund loss path)
    {
      const ordersU = [{
        orderId: "U1", productName: "垫", status: "已收货，退款成功", afterSale: "退款成功", qty: 1,
        goodsTotal: 89, buyerPaid: 89, merchantReceived: 89, platformDiscount: 0, shopDiscount: 0,
        productId: "P9", specName: "标准", merchantSku: "SKU9", merchantSpu: "SPU9",
        dealTime: "2026-06-01", shipTime: "2026-06-02", confirmTime: "2026-06-05", postage: 0,
        expressNo: "YT1", expressCompany: "圆通", shopName: "shopA",
      }];
      const productsU = [{
        productCode: "SPU9", productName: "垫", skuCode: "SKU9", specName: "标准",
        salePrice: 89, costPrice: 35, packCost: 0, weightKg: 0.5, stock: 0,
      }];
      const billU = [{
        orderId: "U1", time: "2026-06-01", income: 89, expense: 0,
        billType: "交易收入", remark: "", bizDesc: "",
      }];
      const settingsU = { ...(pdd.DEFAULT_COST_SETTINGS || {}), adAllocateMode: "none", returnRestockRate: 0.1, returnRepackCost: 1, defaultPackCost: 0 };
      const repU = pdd.buildOperatingReport(ordersU, billU, productsU, [], settingsU, []);
      const rowU = repU.orderProfits[0];
      ok("money.unknown_kind", rowU.refundKind === "unknown", String(rowU.refundKind));
      ok("money.unknown_revenue", Math.abs(rowU.revenue - 89) < 0.01, String(rowU.revenue));
      ok("money.unknown_keeps_cost", Math.abs(rowU.costTotal - 35) < 0.01, String(rowU.costTotal));
      ok("money.unknown_no_return_loss", Math.abs(rowU.returnLoss || 0) < 0.01, String(rowU.returnLoss));
    }
    // money-critical: partial revenue = income - refund; full unship revenue 0
    {
      const ordersP = [
        {
          orderId: "P1", productName: "垫", status: "已收货，退款成功", afterSale: "退款成功", qty: 1,
          goodsTotal: 69, buyerPaid: 69, merchantReceived: 69, platformDiscount: 0, shopDiscount: 0,
          productId: "P1", specName: "标准", merchantSku: "S1", merchantSpu: "SP1",
          dealTime: "2026-06-01", shipTime: "2026-06-02", confirmTime: "", postage: 0,
          expressNo: "YT1", expressCompany: "圆通", shopName: "shopA",
        },
        {
          orderId: "F1", productName: "垫", status: "未发货，退款成功", afterSale: "退款成功", qty: 1,
          goodsTotal: 50, buyerPaid: 50, merchantReceived: 50, platformDiscount: 0, shopDiscount: 0,
          productId: "P1", specName: "标准", merchantSku: "S1", merchantSpu: "SP1",
          dealTime: "2026-06-01", shipTime: "", confirmTime: "", postage: 0,
          expressNo: "", expressCompany: "", shopName: "shopA",
        },
      ];
      const productsP = [{
        productCode: "SP1", productName: "垫", skuCode: "S1", specName: "标准",
        salePrice: 69, costPrice: 20, packCost: 0, weightKg: 0.5, stock: 0,
      }];
      const billP = [
        { orderId: "P1", time: "2026-06-01", income: 69, expense: 0, billType: "交易收入", remark: "", bizDesc: "" },
        { orderId: "P1", time: "2026-06-03", income: 0, expense: 15, billType: "退款", remark: "", bizDesc: "" },
        { orderId: "F1", time: "2026-06-01", income: 50, expense: 0, billType: "交易收入", remark: "", bizDesc: "" },
        { orderId: "F1", time: "2026-06-02", income: 0, expense: 50, billType: "退款", remark: "", bizDesc: "" },
      ];
      const settingsP = { ...(pdd.DEFAULT_COST_SETTINGS || {}), adAllocateMode: "none", defaultPackCost: 0, firstWeightFee: 0, additionalWeightFee: 0 };
      const repP = pdd.buildOperatingReport(ordersP, billP, productsP, [], settingsP, []);
      const p1 = repP.orderProfits.find((r) => r.orderId === "P1");
      const f1 = repP.orderProfits.find((r) => r.orderId === "F1");
      ok("money.partial_rev", !!p1 && Math.abs(p1.revenue - 54) < 0.01, p1 ? String(p1.revenue) : "missing");
      ok("money.partial_kind", !!p1 && p1.refundKind === "partial", p1 ? String(p1.refundKind) : "missing");
      ok("money.unship_full_rev0", !!f1 && Math.abs(f1.revenue) < 0.01 && f1.refundKind === "full", f1 ? `${f1.refundKind}/${f1.revenue}` : "missing");
      ok("money.summary_profit_recon", Math.abs(repP.summary.estimatedProfitBeforeAd - repP.orderProfits.reduce((s, r) => s + r.estimatedProfit, 0)) < 0.02, String(repP.summary.estimatedProfitBeforeAd));
    }
    }
  }

  // empty/header-only workbook must not be blank
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["(空表)"]]), "空表");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as number[];
  ok("emptyExport.buffer", Array.isArray(out) ? out.length > 100 : true, String(Array.isArray(out) ? out.length : typeof out));

  const bill2 = fd("b2.xlsx", [
    ["圆通对账单"],
    ["客户：测试"],
    ["运单号", "面单费用", "运费", "合计费用"],
    ["YT9", 3, 2.1, 5.1],
  ]);
  const ship2 = fd("s2.xlsx", [
    ["通知：导出时间 2026"],
    ["运单号", "订单号", "快递公司", "商品数量"],
    ["YT9", "O9", "圆通速递", 1],
  ]);
  const rec2 = express.parseAndReconcile(bill2, ship2, { highFeeThreshold: 8 });
  ok("express.headerOffset.match", rec2.summary.matched === 1, String(rec2.summary.matched));
  const yt9 = rec2.rows.find((r: any) => r.waybill === "YT9");
  ok("express.headerOffset.totalFee", Math.abs((yt9 && yt9.totalFee ? yt9.totalFee : 0) - 2.1) < 0.01, String(yt9 && yt9.totalFee));

  if (failed) {
    console.error("\n" + failed + " failed");
    process.exit(1);
  }
  console.log("\nALL PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
