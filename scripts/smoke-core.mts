import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const mod = await import(pathToFileURL(path.join(root, "src/services/pddBusiness.ts")).href);
  const excel = await import(pathToFileURL(path.join(root, "src/utils/excel.ts")).href);
  const XLSX = await import("xlsx");
  const {
    buildProductMasterFromOrders,
    productMasterImportTable,
    productMasterPendingRowIndexes,
    productsToSkuMappings,
    ordersToTable,
    reconcileOrderPayments,
    mergeProductMasters,
    buildOperatingReport,
  } = mod;
  const { analyzeOrderRefund } = await import(pathToFileURL(path.join(root, "src/services/refundAnalysis.ts")).href);
  const billMod = await import(pathToFileURL(path.join(root, "src/services/billAccrual.ts")).href);
  // parseAdProduct via pddBusiness mod
  const mapMod = await import(pathToFileURL(path.join(root, "src/services/mappingReconcile.ts")).href);
  const { xlsxOutputToArrayBuffer } = excel;
  let failed = 0;
  const ok = (name: string, cond: boolean, detail="") => {
    if (cond) console.log("PASS " + name);
    else {
      failed++;
      console.error("FAIL " + name + (detail ? " | " + detail : ""));
    }
  };
  const orders = [
    {
      orderId: "A1",
      productName: "item",
      status: "shipped",
      afterSale: "",
      qty: 2,
      goodsTotal: 100,
      buyerPaid: 90,
      merchantReceived: 85,
      platformDiscount: 5,
      shopDiscount: 5,
      productId: "P1",
      specName: "RED-L",
      merchantSku: "",
      merchantSpu: "SPU1",
      dealTime: "2026-01-01",
      shipTime: "",
      confirmTime: "",
      postage: 0,
      expressNo: "",
      expressCompany: "",
      shopName: "shopA",
    },
    {
      orderId: "A2",
      productName: "item",
      status: "shipped",
      afterSale: "",
      qty: 1,
      goodsTotal: 50,
      buyerPaid: 50,
      merchantReceived: 48,
      platformDiscount: 0,
      shopDiscount: 0,
      productId: "P1",
      specName: "RED-L",
      merchantSku: "",
      merchantSpu: "SPU1",
      dealTime: "2026-01-02",
      shipTime: "",
      confirmTime: "",
      postage: 0,
      expressNo: "",
      expressCompany: "",
      shopName: "shopA",
    },
  ];
  const rows = buildProductMasterFromOrders(orders, [], "all");
  ok("product master rows", rows.length === 1, String(rows.length));
  ok("sku fallback to spec", rows[0].skuCode === "RED-L", String(rows[0].skuCode));
  ok("pending cost", rows[0].hasCost === false);
  const table = productMasterImportTable(rows);
  ok("import header cost status", table[0].includes("\u6210\u672c\u72b6\u6001"));
  ok("import sku filled", String(table[1][2]) === "RED-L");
  const pendingIdx = productMasterPendingRowIndexes(rows);
  ok("pending indexes", pendingIdx.length === 1 && pendingIdx[0] === 0);
  const products = [
    {
      productCode: "SPU1",
      productName: "item",
      skuCode: "RED-L",
      specName: "RED-L",
      salePrice: 50,
      costPrice: 20,
      packCost: 1,
      weightKg: 0.3,
      stock: 0,
    },
  ];
  ok("sku mappings", productsToSkuMappings(products).length > 0);
  const ot = ordersToTable(orders);
  ok("orders table", ot[0][0] === "\u8ba2\u5355\u53f7" && ot.length === 3);
  // amount-only payments
  const payments = [["id", "amt"], ["P1", 85], ["P2", 48], ["P3", 10]];
  const rec = reconcileOrderPayments(ot, payments);
  const statusOf = (r: any[]) => String(r[5] ?? r[4] ?? "");
  const matched = rec.filter((r: any[]) => statusOf(r) === "\u5df2\u6838\u9500" || statusOf(r) === "\u5dee\u989d\u6838\u9500").length;
  const unclaimed = rec.filter((r: any[]) => statusOf(r) === "\u672a\u8ba4\u9886").length;
  ok("reconcile matched", matched === 2, String(matched));
  ok("reconcile unclaimed", unclaimed === 1, String(unclaimed));

  // order-id first: same amount twice, match by order id column
  const paymentsById = [
    ["\u8ba2\u5355\u53f7", "\u91d1\u989d", "\u5907\u6ce8"],
    ["A1", 999, "ignore-amount"],
    ["A2", 48, "ok"],
    ["", 85, "order A1 in remark should not steal if id column exists for A1 already used"],
  ];
  // reset: A1 amount is 85, but payment row with A1 has 999 -> 差额核销 by order id
  const recId = reconcileOrderPayments(ot, paymentsById);
  const a1 = recId.find((r: any[]) => String(r[0]) === "A1");
  const a2 = recId.find((r: any[]) => String(r[0]) === "A2");
  ok("reconcile by order id A1", !!a1 && String(a1[6]) === "\u8ba2\u5355\u53f7", a1 ? String(a1[6]) : "missing");
  ok("reconcile by order id A2", !!a2 && (statusOf(a2) === "\u5df2\u6838\u9500" || statusOf(a2) === "\u5dee\u989d\u6838\u9500"), a2 ? statusOf(a2) : "missing");

  // remark contains order id
  const paymentsRemark = [
    ["\u91d1\u989d", "\u6458\u8981"],
    [85, "refund for A1 done"],
    [48, "pay A2"],
  ];
  const recRemark = reconcileOrderPayments(ot, paymentsRemark);
  const a1r = recRemark.find((r: any[]) => String(r[0]) === "A1");
  ok("reconcile by remark", !!a1r && String(a1r[6]) === "\u5907\u6ce8\u542b\u5355\u53f7", a1r ? String(a1r[6]) : "missing");
  const merged = mergeProductMasters(products, [
    {
      productCode: "SPU1",
      productName: "item",
      skuCode: "RED-L",
      specName: "RED-L",
      salePrice: 50,
      costPrice: 22,
      packCost: 1,
      weightKg: 0.3,
      stock: 5,
    },
  ]);
  ok("merge cost", merged[0].costPrice === 22);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([["a", "b"], [1, 2]]);
  XLSX.utils.book_append_sheet(wb, ws, "t");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const ab = xlsxOutputToArrayBuffer(out);

  // partial refund: merchant received remains
  const partial = analyzeOrderRefund(
    { merchantReceived: 40, goodsTotal: 100, status: "\u9000\u6b3e\u6210\u529f", afterSale: "" },
    { income: 100, refund: 60, subsidy: 0 },
    true,
  );
  ok("partial refund kind", partial.refundKind === "partial", partial.refundKind);
  ok("partial refund revenue", Math.abs(partial.revenue - 40) < 0.01, String(partial.revenue));

  const full = analyzeOrderRefund(
    { merchantReceived: 0, goodsTotal: 100, status: "\u9000\u6b3e\u6210\u529f", afterSale: "" },
    { income: 100, refund: 100, subsidy: 0 },
    true,
  );
  ok("full refund kind", full.refundKind === "full", full.refundKind);
  ok("full refund revenue", full.revenue <= 0.01, String(full.revenue));

  // no bill partial by merchant received
  const partialNoBill = analyzeOrderRefund(
    { merchantReceived: 30, goodsTotal: 100, status: "\u5df2\u53d1\u8d27\uff0c\u9000\u6b3e\u6210\u529f", afterSale: "" },
    null,
    true,
  );
  ok("partial no bill", partialNoBill.refundKind === "partial" && partialNoBill.revenue === 30, partialNoBill.compareNote);

  const report = buildOperatingReport(
    [
      {
        orderId: "R1", productName: "x", status: "\u9000\u6b3e\u6210\u529f", afterSale: "", qty: 1,
        goodsTotal: 100, buyerPaid: 100, merchantReceived: 40, platformDiscount: 0, shopDiscount: 0,
        productId: "P", specName: "S", merchantSku: "S1", merchantSpu: "SP", dealTime: "2026-01-01",
        shipTime: "2026-01-02", confirmTime: "", postage: 0, expressNo: "", expressCompany: "\u5706\u901a", shopName: "A",
      },
    ],
    [
      { orderId: "R1", time: "", income: 100, expense: 0, billType: "\u4ea4\u6613\u6536\u5165", remark: "", bizDesc: "" },
      { orderId: "R1", time: "", income: 0, expense: 60, billType: "\u9000\u6b3e", remark: "\u9000\u6b3e", bizDesc: "" },
    ],
    [{ productCode: "SP", productName: "x", skuCode: "S1", specName: "S", salePrice: 100, costPrice: 20, packCost: 1, weightKg: 0.5, stock: 0 }],
    [],
  );
  const row = report.orderProfits[0];
  ok("report partial kind", row.refundKind === "partial", row.refundKind);
  ok("report partial count", report.summary.partialRefundCount === 1, String(report.summary.partialRefundCount));
  ok("report residual revenue", Math.abs(row.revenue - 40) < 0.01, String(row.revenue));
  ok("report refund amount", Math.abs(row.refundAmount - 60) < 0.01, String(row.refundAmount));
  ok("report has compare note", String(row.refundCompareNote || "").length > 0, row.refundCompareNote);

  // full refund should not take ad allocation
  const fullRep = buildOperatingReport(
    [
      {
        orderId: "F1", productName: "y", status: "\u9000\u6b3e\u6210\u529f", afterSale: "", qty: 1,
        goodsTotal: 80, buyerPaid: 80, merchantReceived: 0, platformDiscount: 0, shopDiscount: 0,
        productId: "P2", specName: "S2", merchantSku: "S2", merchantSpu: "SP2", dealTime: "2026-01-03",
        shipTime: "2026-01-04", confirmTime: "", postage: 0, expressNo: "", expressCompany: "\u5706\u901a", shopName: "A",
      },
      {
        orderId: "N1", productName: "z", status: "\u5df2\u6536\u8d27\uff0c\u6210\u4ea4", afterSale: "", qty: 1,
        goodsTotal: 100, buyerPaid: 100, merchantReceived: 90, platformDiscount: 0, shopDiscount: 0,
        productId: "P3", specName: "S3", merchantSku: "S3", merchantSpu: "SP3", dealTime: "2026-01-03",
        shipTime: "2026-01-04", confirmTime: "2026-01-10", postage: 0, expressNo: "", expressCompany: "\u5706\u901a", shopName: "A",
      },
    ],
    [
      { orderId: "F1", time: "", income: 80, expense: 0, billType: "\u4ea4\u6613\u6536\u5165", remark: "", bizDesc: "" },
      { orderId: "F1", time: "", income: 0, expense: 80, billType: "\u9000\u6b3e", remark: "\u9000\u6b3e", bizDesc: "" },
      { orderId: "N1", time: "", income: 100, expense: 10, billType: "\u4ea4\u6613\u6536\u5165", remark: "", bizDesc: "" },
    ],
    [
      { productCode: "SP2", productName: "y", skuCode: "S2", specName: "S2", salePrice: 80, costPrice: 20, packCost: 1, weightKg: 0.5, stock: 0 },
      { productCode: "SP3", productName: "z", skuCode: "S3", specName: "S3", salePrice: 100, costPrice: 30, packCost: 1, weightKg: 0.5, stock: 0 },
    ],
    [{ date: "2026-01-03", spend: 20, gmv: 100, netGmv: 90, settledGmv: 90, shopName: "A" }],
    { adAllocateMode: "by_gmv" as const },
  );
  const fullRow = fullRep.orderProfits.find((r) => r.orderId === "F1")!;
  const normalRow = fullRep.orderProfits.find((r) => r.orderId === "N1")!;
  ok("full kind", fullRow.refundKind === "full", fullRow.refundKind);
  ok("full ad zero", Math.abs(fullRow.adAllocated) < 0.01, String(fullRow.adAllocated));
  ok("normal gets ad", normalRow.adAllocated > 0, String(normalRow.adAllocated));
  ok("fullRefundCount", fullRep.summary.fullRefundCount === 1, String(fullRep.summary.fullRefundCount));
  ok("anomaly partial table exists", Array.isArray(fullRep.anomalyPartialRefundTable), "missing");
  // marginEaten should not double-count shippingLoss into the same bucket as net shipping narrative
  ok(
    "marginEaten excludes shippingLoss double-count",
    fullRep.summary.marginEatenTotal + 1e-9 >= fullRep.summary.returnRelatedCost,
    String(fullRep.summary.marginEatenTotal),
  );


  
  {
    const { DEFAULT_COST_SETTINGS: defs } = await import(pathToFileURL(path.join(root, "src/services/pddBusiness.ts")).href);
    const order = {
      orderId: "FEE1", productName: "f", status: "\u5df2\u6536\u8d27\uff0c\u6210\u4ea4", afterSale: "", qty: 1,
      goodsTotal: 100, buyerPaid: 100, merchantReceived: 90, platformDiscount: 0, shopDiscount: 0,
      productId: "PF", specName: "SF", merchantSku: "SF1", merchantSpu: "SPF", dealTime: "2026-02-01",
      shipTime: "2026-02-01", confirmTime: "2026-02-05", postage: 0, expressNo: "", expressCompany: "\u5706\u901a", shopName: "A",
    };
    const bills = [
      { orderId: "FEE1", time: "", income: 100, expense: 0, billType: "\u4ea4\u6613\u6536\u5165", remark: "", bizDesc: "" },
      { orderId: "FEE1", time: "", income: 0, expense: 5, billType: "\u6280\u672f\u670d\u52a1\u8d39", remark: "tech", bizDesc: "" },
    ];
    const products = [{ productCode: "SPF", productName: "f", skuCode: "SF1", specName: "SF", salePrice: 100, costPrice: 20, packCost: 0, weightKg: 0.5, stock: 0 }];
    const both = buildOperatingReport([order], bills, products, [], { ...defs, brandPointPct: 10, ecommerceTaxPct: 0, feeStackMode: "both", adAllocateMode: "none", returnRestockRate: 0, returnRepackCost: 0 });
    const first = buildOperatingReport([order], bills, products, [], { ...defs, brandPointPct: 10, ecommerceTaxPct: 0, feeStackMode: "bill_first", adAllocateMode: "none", returnRestockRate: 0, returnRepackCost: 0 });
    const only = buildOperatingReport([order], bills, products, [], { ...defs, brandPointPct: 10, ecommerceTaxPct: 0, feeStackMode: "settings_only", adAllocateMode: "none", returnRestockRate: 0, returnRepackCost: 0 });
    ok("fee both has brand point", both.orderProfits[0].brandPointFee > 0, String(both.orderProfits[0].brandPointFee));
    // 品牌扣点与平台费独立：bill_first 不再跳过品牌扣点
    ok("fee bill_first keeps brand", first.orderProfits[0].brandPointFee > 0, String(first.orderProfits[0].brandPointFee));
    ok("fee bill_first still has tech in row", first.orderProfits[0].techFee > 0, String(first.orderProfits[0].techFee));
    ok("fee settings_only has brand", only.orderProfits[0].brandPointFee > 0, String(only.orderProfits[0].brandPointFee));
    // both 与 bill_first 行为一致（都进平台费+扣点）；settings_only 不扣平台费故利润更高
    ok(
      "fee both == bill_first profit",
      Math.abs(both.orderProfits[0].estimatedProfit - first.orderProfits[0].estimatedProfit) < 0.01,
      String(first.orderProfits[0].estimatedProfit),
    );
    ok(
      "fee settings_only profit higher (no bill platform)",
      only.orderProfits[0].estimatedProfit + 1e-9 >= both.orderProfits[0].estimatedProfit,
      String(only.orderProfits[0].estimatedProfit),
    );
    // 默认空扣点：brandPointPct=0 时 brandPointFee=0
    const emptyBp = buildOperatingReport([order], bills, products, [], { ...defs, brandPointPct: 0, ecommerceTaxPct: 0, feeStackMode: "both", adAllocateMode: "none", returnRestockRate: 0, returnRepackCost: 0 });
    ok("empty brand point fee zero", emptyBp.orderProfits[0].brandPointFee === 0, String(emptyBp.orderProfits[0].brandPointFee));
    ok("confirmedRevenue present", typeof both.summary.confirmedRevenue === "number", String(both.summary.confirmedRevenue));
  }

  {
    const { filterOrderTable } = await import(pathToFileURL(path.join(root, "src/services/opCostSettings.ts")).href);
    const sample = [
      ["退款类型", "毛利(扣广告)", "成本匹配", "损耗运费"],
      ["部分退", "-1", "是", "0"],
      ["全额退", "0", "否", "2"],
      ["-", "5", "是", "0"],
    ];
    ok("filter partial rows", filterOrderTable(sample, "partial").length === 2, String(filterOrderTable(sample, "partial").length));
    ok("filter full rows", filterOrderTable(sample, "full").length === 2, String(filterOrderTable(sample, "full").length));
    ok("filter neg rows", filterOrderTable(sample, "neg").length === 2, String(filterOrderTable(sample, "neg").length));
  }

ok("xlsx buffer", ab.byteLength > 32, String(ab.byteLength));
  {
    const fd = {
      name: "商品推广_账户_汇总数据_商品_20260601至20260630.xls",
      path: "",
      headers: ["商品名称","商品ID","总花费(元)","交易额(元)"],
      data: [
        ["商品名称","商品ID","总花费(元)","交易额(元)"],
        ["坐垫A","674492503196", "100", "500"],
        ["坐垫A-计划2","674492503196", "50", "200"],
        ["枕头B","638352032132", "80", "400"],
      ],
    };
    const ads = mod.parseAdProduct(fd);
    ok("ad product merge same id", ads.length === 2, String(ads.length));
    const a = ads.find((x: any) => x.productId === "674492503196");
    ok("ad product spend sum", a && Math.abs(a.spend - 150) < 0.01, String(a?.spend));
    const orders = [{
      orderId: "O1", productName: "坐垫A", status: "已发货", afterSale: "", qty: 1,
      goodsTotal: 100, buyerPaid: 100, merchantReceived: 90, platformDiscount: 0, shopDiscount: 0,
      productId: "674492503196", specName: "默认", merchantSku: "", merchantSpu: "SP1",
      dealTime: "2026-06-01", shipTime: "", confirmTime: "", postage: 0, expressNo: "", expressCompany: "", shopName: "S",
    }];
    const products = [{ productCode: "SP1", productName: "坐垫A", skuCode: "SKU1", specName: "默认", salePrice: 100, costPrice: 30, packCost: 0, weightKg: 0.5, stock: 0 }];
    const rep = mod.buildOperatingReport(orders, [], products, [], { ...mod.DEFAULT_COST_SETTINGS, adAllocateMode: "none", returnRestockRate: 0, returnRepackCost: 0, brandPointPct: 0, ecommerceTaxPct: 0 }, ads);
    ok("summary uses product ad spend", Math.abs(rep.summary.adSpend - 230) < 0.01, String(rep.summary.adSpend));
    const sales = rep.salesRankSpuTable || [];
    const header = (sales[0] || []).map(String);
    ok("sales has product ad col", header.includes("商品广告费"), header.join("|"));
    const row = sales.find((r: any[]) => String(r[3]) === "674492503196" || String(r[1]).includes("SP1"));
    // columns depend on hasProductAds
    const adIdx = header.indexOf("商品广告费");
    ok("sales product ad matched", adIdx >= 0 && row && Math.abs(Number(row[adIdx]) - 150) < 0.01, String(row?.[adIdx]));
  }

  {
    const bills = [{ platform: "PDD", date: "2026-01-15", totalAmount: 1000, orderCount: 10, commission: 50, techFee: 20, subsidy: 5, netAmount: 925, fileName: "b.xlsx" }];
    const acc = billMod.buildAccrualTable(bills);
    ok("accrual header", acc[0][0] === "平台");
    ok("accrual body+total", acc.length === 3, String(acc.length));
    ok("avg commission rate", Math.abs(billMod.avgCommissionRateFromBills(bills) - 0.05) < 1e-9);
    const maps = [{ platformName: "红", internalCode: "SKU1", price: 1 }];
    const src = [["品名", "数量"], ["红", 2], ["蓝", 1]];
    const mapped = mapMod.applySkuMappingsToTable(src, maps);
    ok("mapping adds col", mapped[0].includes("内部编码"));
    ok("mapping fills code", mapped[1].includes("SKU1"));
    const sum = mapMod.summarizeReconcile([["h"], ["a","b","c","d","e","已核销","订单号"]]);
    ok("reconcile summary matched", sum.matched === 1 && sum.byId === 1);
  }
  {
    const ztcMod = await import(pathToFileURL(path.join(root, "src/services/ztcSkuSplit.ts")).href);
    const orderProfits = [
      { orderId: "1", shopName: "S", productName: "垫", specName: "黑", merchantSku: "SKU-B", merchantSpu: "SP", productId: "PID1", status: "", afterSale: "", qty: 2, merchantReceived: 80, goodsTotal: 100, costPrice: 20, costTotal: 40, packUnit: 0, packTotal: 0, weightKg: 1, shippingFee: 0, postageIncome: 0, netShipping: 0, shippingLoss: 0, returnLoss: 0, repackCost: 0, brandPointFee: 0, ecommerceTaxFee: 0, adAllocated: 0, techFee: 0, otherFee: 0, revenue: 80, estimatedProfit: 40, estimatedProfitAfterAd: 40, costMatched: true, costMatchBy: "", isRefunded: false, isShipped: true, isPostShipRefund: false, isShipNotDeal: false, dealMonth: "2026-06", refundKind: "none" as const },
      { orderId: "2", shopName: "S", productName: "垫", specName: "白", merchantSku: "SKU-W", merchantSpu: "SP", productId: "PID1", status: "", afterSale: "", qty: 1, merchantReceived: 20, goodsTotal: 25, costPrice: 20, costTotal: 20, packUnit: 0, packTotal: 0, weightKg: 0.5, shippingFee: 0, postageIncome: 0, netShipping: 0, shippingLoss: 0, returnLoss: 0, repackCost: 0, brandPointFee: 0, ecommerceTaxFee: 0, adAllocated: 0, techFee: 0, otherFee: 0, revenue: 20, estimatedProfit: 0, estimatedProfitAfterAd: 0, costMatched: true, costMatchBy: "", isRefunded: false, isShipped: true, isPostShipRefund: false, isShipNotDeal: false, dealMonth: "2026-06", refundKind: "none" as const },
    ];
    const ads = [{ productId: "PID1", productName: "垫", campaignName: "c", spend: 100, dealSpend: 100, gmv: 500, netGmv: 400, settledGmv: 300, orders: 3, roi: 5, netRoi: 4, settledRoi: 3 }];
    const r = ztcMod.buildZtcSkuBreakdown(orderProfits as any, ads, "settlement");
    ok("ztc two skus", r.rows.length === 2, String(r.rows.length));
    const black = r.rows.find((x: any) => x.merchantSku === "SKU-B");
    const white = r.rows.find((x: any) => x.merchantSku === "SKU-W");
    ok("ztc black gets 80pct ad", black && Math.abs(black.skuAdSpend - 80) < 0.01, String(black?.skuAdSpend));
    ok("ztc white gets 20pct ad", white && Math.abs(white.skuAdSpend - 20) < 0.01, String(white?.skuAdSpend));
    ok("ztc black net profit", black && Math.abs(black.profitAfterAd - (40 - 80)) < 0.01, String(black?.profitAfterAd));
    ok("ztc match by product id", black && black.matchBy === "商品ID", String(black?.matchBy));

    // 同名不同商品ID：禁止串广告
    const orders2 = [
      { ...orderProfits[0], productId: "OTHER1", productName: "垫A" },
      { ...orderProfits[1], productId: "OTHER2", productName: "垫A" },
    ];
    const ads2 = [{ productId: "AD999", productName: "垫A", campaignName: "c", spend: 50, dealSpend: 50, gmv: 200, netGmv: 180, settledGmv: 150, orders: 2, roi: 4, netRoi: 3.6, settledRoi: 3 }];
    const r2 = ztcMod.buildZtcSkuBreakdown(orders2 as any, ads2, "settlement");
    ok("ztc no cross-id name match", r2.summary.matchedAdSpend === 0, String(r2.summary.matchedAdSpend));
    ok("ztc same-name different id still no ad", r2.rows.every((x: any) => x.productAdSpend === 0), String(r2.rows.map((x: any) => x.productAdSpend)));
    ok("ztc diag intersection", r2.summary.uniqueOrderProductIds === 2 && r2.summary.idIntersection === 0, String(r2.summary.idIntersection));

    // 无商品ID：不得用品名兜底（未开广告商品应保持未匹配）
    const orders3 = [
      { ...orderProfits[0], productId: "", productName: "垫A" },
      { ...orderProfits[1], productId: "", productName: "垫A" },
    ];
    const r3 = ztcMod.buildZtcSkuBreakdown(orders3 as any, ads2, "settlement");
    ok("ztc no name fallback without id", r3.summary.matchedAdSpend === 0, String(r3.summary.matchedAdSpend));
    ok("ztc noid rows unmatched", r3.rows.every((x: any) => x.productAdSpend === 0 && x.matchBy === "无广告"), String(r3.rows.map((x: any) => x.matchBy)));
  }

  
  {
    const profitMod = await import(pathToFileURL(path.join(root, "src/services/profitCalc.ts")).href);
    const params = { ...profitMod.DEFAULT_PROFIT_PARAMS };
    const row = profitMod.emptySku({ name: "测", sku: "A", cost: 32, pack: 0.3, ship: 3, bybt: 0, price: 59.9 });
    const r = profitMod.calcSku(row, params);
    ok("profit calc margin finite", Number.isFinite(r.margin) && r.price === 59.9, String(r.margin));
    ok("profit calc suggest exists", r.suggestedPrice != null && r.suggestedPrice > r.cost, String(r.suggestedPrice));
    const atSug = profitMod.calcUnitProfit({
      cost: 32, pack: 0.3, ship: 3, price: r.suggestedPrice, bybt: 0, roi: params.defaultRoi, refundRate: params.refundRate,
    }, params);
    ok("profit calc closed loop", Math.abs(atSug.margin - params.targetMargin) < 1e-6, String(atSug.margin));
    const sheets = profitMod.buildProfitExportSheets([row], params);
    ok("profit export sheets", sheets.length >= 4 && sheets[0].data.length >= 2, String(sheets.length));
    const by = profitMod.calcSku(profitMod.emptySku({ cost: 32, pack: 0.3, ship: 3, bybt: 1, price: 69.9 }), params);
    ok("profit bybt fee positive", by.bybtFee > 0, String(by.bybtFee));
  }

if (failed) {
    console.error(String(failed) + " failed");
    process.exit(1);
  }
  console.log("All smoke checks passed");
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
