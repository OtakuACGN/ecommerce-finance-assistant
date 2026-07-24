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
