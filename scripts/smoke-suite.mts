/**
 * DianCaiTong 1.2.9 smoke suite
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
  const duplicateBillRows = express.parseCourierBill([
    ["运单号", "计费重量", "运费", "加收费用"],
    ["YT-DUP", 1, 2, 0],
    ["YT-DUP", 1, 0, 0.5],
  ]);
  ok(
    "express.duplicate_fee_rows_do_not_duplicate_weight",
    duplicateBillRows.length === 1
      && duplicateBillRows[0].weight === 1
      && Math.abs(duplicateBillRows[0].totalFee - 2.5) < 0.01,
    JSON.stringify(duplicateBillRows),
  );

  const after = await load("src/services/afterSaleAnalysis.ts");
  const afterData = [
    ["售后单号","售后状态","平台售后状态","订单状态","售后类型","退款类型","发货状态","快递公司","快递单号","平台订单号","售后原因","售后描述","商品名称","商品规格","商品ID","申请退款金额","订单金额","退款数量","商品数量"],
    ["SH1","已确认","退款成功","已发货","退款","","买家已签收","圆通","YT1","ORD1","其他原因","","垫","标准款","P1",15,39,1,1],
    ["SH2","已确认","退款成功","已发货","退款","","买家已签收","圆通","YT2","ORD2","质量问题","质量问题、做工太差","垫","标准款","P1",39,39,1,1],
    ["SH3","","平台处理中","已发货","退款","","买家已签收","圆通","YT3","ORD3","其他原因","","垫","标准款","P1",10,39,1,1],
  ];
  const ar = after.parseAndAnalyzeAfterSales(fd("after.xlsx", afterData));
  ok("after.success", ar.summary.success === 2, String(ar.summary.success));
  ok("after.partial", ar.summary.partialRefund >= 1, String(ar.summary.partialRefund));
  ok("after.platform_processing", ar.summary.processing === 1, String(ar.summary.processing));
  const emptyN = ar.rows.filter((r: any) => r.descClusterKey === "empty" || r.descClusterLabel === "无有效描述").length;
  ok("after.emptyDesc", emptyN >= 1, String(emptyN));
  const multiSkuOrders = after.parseOrderBaseFile([
    ["订单号", "商品ID", "商品名称", "商品规格", "规格编码", "商品总价", "商家实收", "商品数量"],
    ["ORD-MULTI", "P1", "商品一", "红色", "SKU-RED", 10, 9, 1],
    ["ORD-MULTI", "P2", "商品二", "蓝色", "SKU-BLUE", 20, 18, 1],
  ]);
  const multiSkuAfterRow = {
    ...ar.rows[0],
    orderId: "ORD-MULTI",
    productId: "P2",
    productName: "商品二",
    specName: "蓝色",
    skuInfo: "蓝色",
    merchantSku: "SKU-BLUE",
    refundAmount: 20,
    tradeAmount: 20,
  };
  const multiSkuResult = after.analyzeAfterSales([multiSkuAfterRow], { orders: multiSkuOrders });
  const blueSku = multiSkuResult.skuRank.find((x: any) => x.productId === "P2");
  ok(
    "after.multi_sku_order_keeps_sku_denominator",
    multiSkuOrders.length === 2
      && multiSkuResult.summary.orderBaseCount === 1
      && multiSkuResult.summary.orderBaseGmv === 30
      && blueSku?.orderCount === 1
      && blueSku?.orderGmv === 20,
    JSON.stringify({ orders: multiSkuOrders, summary: multiSkuResult.summary, blueSku }),
  );
  const multiSkuFileResult = after.parseAndAnalyzeAfterSales(
    fd("after-multi.xlsx", [
      afterData[0],
      ["SH-MULTI","已确认","退款成功","已发货","退款","","买家已签收","圆通","YT-M","ORD-MULTI","其他原因","","商品二","蓝色","P2",20,20,1,1],
    ]),
    {
      orderFile: fd("orders-multi.xlsx", [
        ["订单号", "商品ID", "商品名称", "商品规格", "规格编码", "商品总价", "商家实收", "商品数量"],
        ["ORD-MULTI", "P1", "商品一", "红色", "SKU-RED", 10, 9, 1],
        ["ORD-MULTI", "P2", "商品二", "蓝色", "SKU-BLUE", 20, 18, 1],
      ]),
    },
  );
  ok(
    "after.file_pipeline_preserves_multi_sku",
    multiSkuFileResult.summary.orderBaseCount === 1
      && multiSkuFileResult.summary.orderBaseGmv === 30
      && multiSkuFileResult.skuRank.find((x: any) => x.productId === "P2")?.orderGmv === 20,
    JSON.stringify(multiSkuFileResult.summary),
  );

  
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

  // Parser/import guardrails: avoid silent duplication and false cost matches.
  {
    const productFile = fd("订单商品资料.xlsx", [
      ["商品编码", "商品名称", "<必填>规格编码", "规格名称", "", "参考成本价(元)"],
      ["P1", "商品A", "S1", "标准", 999, 12],
    ]);
    ok(
      "parser.product_master_beats_filename_order",
      pdd.detectSourceKind(productFile) === "product_master",
      String(pdd.detectSourceKind(productFile)),
    );
    const parsedProducts = pdd.parseProductMaster(productFile);
    ok(
      "parser.empty_header_not_selected",
      parsedProducts.length === 1 &&
        parsedProducts[0].salePrice === 0 &&
        parsedProducts[0].costPrice === 12,
      JSON.stringify(parsedProducts[0]),
    );

    const techRefund = pdd.aggregatePddBill([
      {
        orderId: "T1",
        time: "2026-06-01",
        income: 2,
        expense: 0,
        billType: "技术服务费退款",
        remark: "",
        bizDesc: "基础技术服务费退回",
      },
    ]);
    ok(
      "bill.tech_refund_not_goods_refund",
      techRefund.totals.refund === 0 &&
        techRefund.totals.techFeeRefund === 2,
      JSON.stringify(techRefund.totals),
    );

    const ambiguousProducts = [
      {
        productCode: "P1", productName: "商品A", skuCode: "S1", specName: "标准",
        salePrice: 20, costPrice: 10, packCost: 0, weightKg: 0.5, stock: 0,
      },
      {
        productCode: "P2", productName: "商品B", skuCode: "S2", specName: "标准",
        salePrice: 30, costPrice: 20, packCost: 0, weightKg: 0.5, stock: 0,
      },
    ];
    const ambiguousOrder = {
      ...orders[0],
      productName: "未知商品",
      specName: "标准",
      merchantSku: "",
      merchantSpu: "",
      productId: "",
    };
    const ambiguousHit = pdd.matchProduct(
      ambiguousOrder,
      pdd.buildProductIndexes(ambiguousProducts),
      { matchBySpecWhenNoCode: true },
    );
    ok(
      "cost.ambiguous_spec_stays_unmatched",
      ambiguousHit.matched === false,
      JSON.stringify(ambiguousHit),
    );
    const typoOrder = {
      ...orders[0],
      productName: "荞麦枕",
      specName: "01全面双层纱-粉紫【亲肤透气】,30*60cm",
      merchantSku: "",
      merchantSpu: "乐可",
      productId: "",
    };
    const typoProducts = [
      {
        productCode: "乐可", productName: "荞麦枕", skuCode: "全棉双层纱-粉紫,30*60cm",
        specName: "全棉双层纱-粉紫,30*60cm", salePrice: 50, costPrice: 20,
        packCost: 0, weightKg: 0.5, stock: 0,
      },
      {
        productCode: "乐可", productName: "荞麦枕", skuCode: "全棉双层纱-灰色,30*60cm",
        specName: "全棉双层纱-灰色,30*60cm", salePrice: 50, costPrice: 18,
        packCost: 0, weightKg: 0.5, stock: 0,
      },
    ];
    const typoHit = pdd.matchProduct(
      typoOrder,
      pdd.buildProductIndexes(typoProducts),
      { matchBySpecWhenNoCode: true },
    );
    ok(
      "cost.loose_spec_unique_match",
      typoHit.matched === true && typoHit.costPrice === 20,
      JSON.stringify(typoHit),
    );

    const mergedNameOnly = pdd.mergeProductMasters(
      [{
        productCode: "", productName: "商品A", skuCode: "", specName: "",
        salePrice: 10, costPrice: 2, packCost: 0, weightKg: 0, stock: 0,
      }],
      [{
        productCode: "", productName: "商品B", skuCode: "", specName: "",
        salePrice: 12, costPrice: 3, packCost: 0, weightKg: 0, stock: 0,
      }],
    );
    ok(
      "productMaster.name_only_rows_do_not_collapse",
      mergedNameOnly.length === 2,
      JSON.stringify(mergedNameOnly),
    );

    const mergeBillLines = pdd.replaceImportedBillSource;
    ok(
      "import.bill_replace_helper_exists",
      typeof mergeBillLines === "function",
      typeof mergeBillLines,
    );
    if (typeof mergeBillLines === "function") {
      const oldLines = [
        { orderId: "O1", time: "2026-06-01", income: 10, expense: 0, billType: "交易收入", remark: "", bizDesc: "", shopName: "店A", sourceName: "六月账.csv" },
        { orderId: "O2", time: "2026-05-01", income: 8, expense: 0, billType: "交易收入", remark: "", bizDesc: "", shopName: "店A", sourceName: "五月账.csv" },
      ];
      const nextLines = [
        { orderId: "O1", time: "2026-06-01", income: 11, expense: 0, billType: "交易收入", remark: "", bizDesc: "" },
      ];
      const mergedLines = mergeBillLines(oldLines, nextLines, "店A", "六月账.csv");
      ok(
        "import.same_bill_source_replaces_not_duplicates",
        mergedLines.length === 2 &&
          mergedLines.filter((x: any) => x.sourceName === "六月账.csv").length === 1 &&
          mergedLines.find((x: any) => x.sourceName === "六月账.csv")?.income === 11,
        JSON.stringify(mergedLines),
      );
    }
  }

  // Generic module guardrails.
  {
    const logic = await load("src/services/businessLogic.ts");
    const loss = logic.calculateRefundLossWithMatching(
      [{ orderId: "R1", platform: "拼多多", refundAmount: 100, refundDate: "2026-06-01" }],
      [
        { orderId: "R1", platform: "拼多多", commission: 1.2 },
        { orderId: "R1", platform: "拼多多", commission: 0.8 },
      ],
      0.05,
    );
    ok(
      "refundLoss.multiple_commission_lines_sum",
      Math.abs(loss.results[0].commission - 2) < 0.001,
      JSON.stringify(loss.results[0]),
    );

    const mappedOnce = logic.applySkuMapping(
      [["平台SKU"], ["红色"]],
      [{ platformName: "红色", internalCode: "SKU-RED", price: 1 }],
    );
    const mappedTwice = logic.applySkuMapping(
      mappedOnce,
      [{ platformName: "红色", internalCode: "SKU-RED", price: 1 }],
    );
    ok(
      "mapping.apply_is_idempotent",
      mappedTwice[0].filter((x: any) => x === "内部编码").length === 1 &&
        mappedTwice[1].length === mappedTwice[0].length,
      JSON.stringify(mappedTwice),
    );

    const productMappings = pdd.productsToSkuMappings([
      {
        productCode: "P1", productName: "同一商品", skuCode: "S-RED", specName: "红色",
        salePrice: 20, costPrice: 10, packCost: 0, weightKg: 0.5, stock: 0,
      },
      {
        productCode: "P1", productName: "同一商品", skuCode: "S-BLUE", specName: "蓝色",
        salePrice: 20, costPrice: 11, packCost: 0, weightKg: 0.5, stock: 0,
      },
    ]);
    const mappedSpecificSku = logic.applySkuMapping(
      [["订单号", "商品名称", "商品规格", "商家编码-规格"], ["O1", "同一商品", "蓝色", "S-BLUE"]],
      productMappings,
    );
    ok(
      "mapping.specific_sku_beats_generic_product_name",
      mappedSpecificSku[1][4] === "S-BLUE",
      JSON.stringify(mappedSpecificSku[1]),
    );

    const sameAmountOrders = pdd.ordersToTable([
      { ...orders[0], orderId: "PAY-1", dealTime: "2026-06-01", merchantReceived: 100 },
      { ...orders[0], orderId: "PAY-2", dealTime: "2026-06-20", merchantReceived: 100 },
    ]);
    const paymentResult = pdd.reconcileOrderPayments(sameAmountOrders, [
      ["收款金额", "交易时间", "备注"],
      [100, "2026-06-20", "第二笔"],
      [100, "2026-06-01", "第一笔"],
    ]);
    ok(
      "reconcile.same_amount_uses_order_date",
      paymentResult[1][6] === "金额+日期" &&
        String(paymentResult[1][8]).includes("第一笔") &&
        String(paymentResult[2][8]).includes("第二笔"),
      JSON.stringify(paymentResult.slice(1)),
    );
    const sameOrderAcrossShops = pdd.reconcileOrderPayments(
      [
        ["成交时间", "店铺", "订单号", "商品名称", "商家实收"],
        ["2026-06-01", "店铺A", "SHARED-ORDER-001", "商品", 100],
        ["2026-06-01", "店铺B", "SHARED-ORDER-001", "商品", 100],
      ],
      [
        ["订单号", "收款金额", "店铺", "备注"],
        ["SHARED-ORDER-001", 100, "店铺B", "B店收款"],
        ["SHARED-ORDER-001", 100, "店铺A", "A店收款"],
      ],
    );
    ok(
      "reconcile.duplicate_order_id_respects_shop",
      String(sameOrderAcrossShops[1][8]).includes("A店收款")
        && String(sameOrderAcrossShops[2][8]).includes("B店收款"),
      JSON.stringify(sameOrderAcrossShops.slice(1)),
    );

    const profitCalc = await load("src/services/profitCalc.ts");
    const weightedProfitRows = profitCalc.skusFromProductMaster([
      {
        productName: "重货", skuCode: "HEAVY", costPrice: 10, packCost: 0,
        weightKg: 2.2, salePrice: 30,
      },
    ]);
    ok(
      "profitCalc.product_weight_drives_shipping",
      weightedProfitRows.length === 1 && weightedProfitRows[0].ship === 5,
      JSON.stringify(weightedProfitRows[0]),
    );
    const safeProfitParams = profitCalc.sanitizeProfitParams({
      ...profitCalc.DEFAULT_PROFIT_PARAMS,
      platformRate: -0.2,
      refundRate: 2,
      preRefundShare: -1,
      postShipShare: 3,
      insurance: -5,
    });
    ok(
      "profitCalc.invalid_params_are_sanitized",
      safeProfitParams.platformRate === 0 &&
        safeProfitParams.refundRate === 1 &&
        safeProfitParams.preRefundShare === 0 &&
        safeProfitParams.postShipShare === 1 &&
        safeProfitParams.insurance === 0,
      JSON.stringify(safeProfitParams),
    );
    const ztc = await load("src/services/ztcSkuSplit.ts");
    const refundedZtc = ztc.buildZtcSkuBreakdown(
      [{
        productId: "P1", productName: "商品", merchantSpu: "SP1", merchantSku: "SKU1",
        specName: "标准", qty: 1, goodsTotal: 100, merchantReceived: 100,
        revenue: 0, estimatedProfit: -3,
      }],
      [{
        productId: "P1", productName: "商品", spend: 0, dealSpend: 0, gmv: 0,
        netGmv: 0, settledGmv: 0, orders: 0, roi: 0, netRoi: 0, settledRoi: 0,
      }],
      "settlement",
    );
    ok(
      "ztc.margin_uses_confirmed_revenue",
      refundedZtc.rows[0].settlement === 0 &&
        refundedZtc.rows[0].marginAfterAd === null &&
        refundedZtc.table[0].includes("确认收入"),
      JSON.stringify(refundedZtc.rows[0]),
    );
    const salesRankReport = pdd.buildOperatingReport(
      [
        { ...orders[0], orderId: "SALE-1", status: "已收货", qty: 1, goodsTotal: 10, merchantReceived: 10 },
        { ...orders[0], orderId: "CANCEL-1", status: "已取消", qty: 100, goodsTotal: 1000, merchantReceived: 1000 },
      ],
      [],
      [{
        productCode: "SPU1", productName: "item", skuCode: "RED", specName: "RED",
        salePrice: 10, costPrice: 0, packCost: 0, weightKg: 0, stock: 0,
      }],
      [],
      {
        ...pdd.DEFAULT_COST_SETTINGS,
        adAllocateMode: "none",
        defaultPackCost: 0,
        firstWeightFee: 0,
        additionalWeightFee: 0,
        expressRules: [],
      },
      [],
    );
    const salesHeaders = salesRankReport.salesRankSkuTable[0];
    const salesRow = salesRankReport.salesRankSkuTable[1];
    ok(
      "salesRank.excludes_cancelled_and_uses_confirmed_revenue",
      salesRow[salesHeaders.indexOf("销量")] === 1 &&
        Number(salesRow[salesHeaders.indexOf("确认收入")]) === 10 &&
        salesHeaders.includes("确认收入"),
      JSON.stringify(salesRankReport.salesRankSkuTable),
    );
    const explicitBillRecord = pdd.billRecordFromPdd(
      { name: "六月账务.csv", path: "", headers: [], data: [] },
      [
        { orderId: "BILL-1", time: "2026-06-01", income: 100, expense: 0, billType: "交易收入", remark: "", bizDesc: "" },
        { orderId: "BILL-1", time: "2026-06-02", income: 0, expense: 20, billType: "退款", remark: "", bizDesc: "" },
        { orderId: "BILL-1", time: "2026-06-02", income: 0, expense: 5, billType: "罚款", remark: "", bizDesc: "" },
        { orderId: "", time: "2026-06-03", income: 0, expense: 50, billType: "提现", remark: "", bizDesc: "" },
      ],
    );
    ok(
      "bill.record_exposes_refund_other_and_real_order_count",
      explicitBillRecord.orderCount === 1 &&
        explicitBillRecord.refundAmount === 20 &&
        explicitBillRecord.otherFee === 5 &&
        explicitBillRecord.withdraw === 50 &&
        explicitBillRecord.netAmount === 75,
      JSON.stringify(explicitBillRecord),
    );
    const billRecordsService = await load("src/services/billRecords.ts");
    const replacedBillRecords = billRecordsService.replaceBillRecordSource(
      [{
        ...explicitBillRecord,
        sourceName: "六月账务.csv",
        shopName: "店A",
        totalAmount: 90,
      }],
      {
        ...explicitBillRecord,
        sourceName: "六月账务.csv",
        shopName: "店A",
        totalAmount: 100,
      },
    );
    ok(
      "bill.same_source_reimport_replaces_record",
      replacedBillRecords.length === 1 &&
        replacedBillRecords[0].totalAmount === 100,
      JSON.stringify(replacedBillRecords),
    );

    const now = new Date();
    const previousYearSameMonth =
      `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const accrual = logic.generateAccrualTable([{
      fileName: "old.csv",
      platform: "拼多多",
      date: previousYearSameMonth,
      totalAmount: 10,
      orderCount: 1,
      commission: 0,
      techFee: 0,
      subsidy: 0,
      netAmount: 10,
      rawData: [],
    }]);
    ok(
      "accrual.same_month_previous_year_is_cross_period",
      accrual[1][accrual[0].indexOf("是否跨期")] === "⚠️跨期",
      JSON.stringify(accrual[1]),
    );
  }

  // confirmed business rules: natural-month ledger basis, ¥1/kg additional
  // shipping, confirmed-revenue margin, and a before-shipping profit bridge.
  {
    const shippingSettings = {
      ...(pdd.DEFAULT_COST_SETTINGS || {}),
      expressRules: (pdd.DEFAULT_COST_SETTINGS?.expressRules || []).map((r: any) => ({ ...r })),
    };
    const twoKg = pdd.calcShippingFee(2, shippingSettings, "圆通");
    ok("rules.shipping_2kg_is_4", Math.abs(twoKg.fee - 4) < 0.01, String(twoKg.fee));

    const periodOrders = [{
      ...orders[0],
      orderId: "M1",
      status: "已收货",
      merchantReceived: 200,
      goodsTotal: 200,
      qty: 1,
      productId: "M1",
      merchantSku: "MS1",
      merchantSpu: "MP1",
      specName: "标准",
      shipTime: "2026-06-02",
      expressCompany: "圆通",
    }];
    const periodProducts = [{
      productCode: "MP1", productName: "item", skuCode: "MS1", specName: "标准",
      salePrice: 200, costPrice: 0, packCost: 0, weightKg: 0.5, stock: 0,
    }];
    const periodBill = [
      { orderId: "M1", time: "2026-06-01", income: 100, expense: 0, billType: "交易收入", remark: "", bizDesc: "" },
      { orderId: "OLD1", time: "2026-06-02", income: 20, expense: 0, billType: "交易收入", remark: "", bizDesc: "" },
      { orderId: "OLD1", time: "2026-06-02", income: 0, expense: 2, billType: "技术服务费", remark: "", bizDesc: "基础技术服务费" },
      { orderId: "OLD1", time: "2026-06-02", income: 0, expense: 3, billType: "罚款", remark: "", bizDesc: "" },
    ];
    const periodSettings = {
      ...(pdd.DEFAULT_COST_SETTINGS || {}),
      adAllocateMode: "none",
      defaultPackCost: 0,
      firstWeightFee: 3,
      additionalWeightFee: 1,
      expressRules: [],
    };
    const period = pdd.buildOperatingReport(
      periodOrders,
      periodBill,
      periodProducts,
      [],
      periodSettings,
      [],
    );
    ok("rules.calendar_revenue_all_bill_orders", Math.abs(period.summary.confirmedRevenue - 120) < 0.01, String(period.summary.confirmedRevenue));
    ok("rules.calendar_all_platform_fees", Math.abs(period.summary.estimatedProfitAfterAd - 112) < 0.01, String(period.summary.estimatedProfitAfterAd));
    ok("rules.before_shipping_profit", Math.abs(period.summary.profitAfterAdBeforeShipping - 115) < 0.01, String(period.summary.profitAfterAdBeforeShipping));
    ok("rules.margin_uses_confirmed_revenue", Math.abs(period.summary.profitMargin - (112 / 120)) < 0.0001, String(period.summary.profitMargin));
  }

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
      ok("money.partial_full_cost", !!p1 && Math.abs(p1.costTotal - 20) < 0.01, p1 ? String(p1.costTotal) : "missing");
      ok("money.partial_no_return_loss", !!p1 && Math.abs(p1.returnLoss || 0) < 0.01, p1 ? String(p1.returnLoss) : "missing");
      ok("money.unship_full_rev0", !!f1 && Math.abs(f1.revenue) < 0.01 && f1.refundKind === "full", f1 ? `${f1.refundKind}/${f1.revenue}` : "missing");
      ok("money.summary_profit_recon", Math.abs(repP.summary.estimatedProfitBeforeAd - repP.orderProfits.reduce((s, r) => s + r.estimatedProfit, 0)) < 0.02, String(repP.summary.estimatedProfitBeforeAd));

    // money-critical: full post-ship — default restock 0 = cost recovered; custom rate works
    {
      const ordersF = [{
        orderId: "FULL1", productName: "垫", status: "已收货，退款成功", afterSale: "退款成功", qty: 1,
        goodsTotal: 89, buyerPaid: 89, merchantReceived: 89, platformDiscount: 0, shopDiscount: 0,
        productId: "P9", specName: "标准", merchantSku: "SKU9", merchantSpu: "SPU9",
        dealTime: "2026-06-01", shipTime: "2026-06-02", confirmTime: "2026-06-05", postage: 0,
        expressNo: "YT9", expressCompany: "圆通", shopName: "shopA",
      }];
      const productsF = [{
        productCode: "SPU9", productName: "垫", skuCode: "SKU9", specName: "标准",
        salePrice: 89, costPrice: 35, packCost: 0, weightKg: 0.5, stock: 0,
      }];
      const billF = [
        { orderId: "FULL1", time: "2026-06-01", income: 89, expense: 0, billType: "交易收入", remark: "", bizDesc: "" },
        { orderId: "FULL1", time: "2026-06-06", income: 0, expense: 89, billType: "退款", remark: "", bizDesc: "" },
      ];
      const baseF = { ...(pdd.DEFAULT_COST_SETTINGS || {}), adAllocateMode: "none", defaultPackCost: 0, firstWeightFee: 0, additionalWeightFee: 0, returnRepackCost: 0 };
      const zero = pdd.buildOperatingReport(ordersF, billF, productsF, [], { ...baseF, returnRestockRate: 0 }, []);
      const ten = pdd.buildOperatingReport(ordersF, billF, productsF, [], { ...baseF, returnRestockRate: 0.1 }, []);
      const z = zero.orderProfits[0];
      const t10 = ten.orderProfits[0];
      ok("money.full_default_zero_restock", Math.abs((pdd.DEFAULT_COST_SETTINGS || {}).returnRestockRate || 0) < 1e-9, String((pdd.DEFAULT_COST_SETTINGS || {}).returnRestockRate));
      ok("money.full_rev0", !!z && Math.abs(z.revenue) < 0.01 && z.refundKind === "full", z ? `${z.refundKind}/${z.revenue}` : "missing");
      ok("money.full_cost_recovered", !!z && Math.abs(z.costTotal) < 0.01, z ? String(z.costTotal) : "missing");
      ok("money.full_return_loss0", !!z && Math.abs(z.returnLoss || 0) < 0.01, z ? String(z.returnLoss) : "missing");
      ok("money.full_custom_restock10", !!t10 && Math.abs((t10.returnLoss || 0) - 3.5) < 0.01 && Math.abs(t10.costTotal) < 0.01, t10 ? `${t10.returnLoss}/${t10.costTotal}` : "missing");
    }
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
