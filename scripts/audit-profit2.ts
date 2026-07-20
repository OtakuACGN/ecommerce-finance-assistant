import { readFileSync } from "fs";
import { createRequire } from "module";
import path from "path";
import {
  buildOperatingReport,
  ingestForOperating,
  DEFAULT_COST_SETTINGS,
} from "../src/services/pddBusiness.ts";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

function load(filePath: string) {
  const buf = readFileSync(filePath);
  let workbook: any;
  if (/\.csv$/i.test(filePath)) {
    let text = buf.toString("utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    if (text.includes("\uFFFD")) text = new TextDecoder("gb18030").decode(buf);
    workbook = XLSX.read(text, { type: "string" });
  } else {
    workbook = XLSX.read(buf, { type: "buffer" });
  }
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
    header: 1,
    defval: "",
    raw: false,
  }) as any[][];
  return {
    name: path.basename(filePath),
    path: filePath,
    headers: (rows[0] || []).map(String),
    data: rows,
  };
}

const root = "C:/Users/L/Downloads";
const orders = ingestForOperating(
  load(`${root}/7a23336f32a1f51a9d8bf27125e3b781orders_export2026-07-20-10-09-23.csv`) as any,
).orders;
const bill = ingestForOperating(
  load(`${root}/pdd-mall-bill-detail(wrc1ib6cxr8r905pg)_2026-07-20-10-09-55_2175.csv`) as any,
).billLines;
const products = ingestForOperating(
  load(`${root}/\u5546\u54c1\u8d44\u659997104741812.xlsx`) as any,
).products;
const ads = ingestForOperating(
  load(`${root}/\u5546\u54c1\u63a8\u5e7f_\u8d26\u6237_\u5206\u5929\u6570\u636e_20260601\u81f320260630.xls`) as any,
).adDays;

const r = buildOperatingReport(orders, bill, products, ads, DEFAULT_COST_SETTINGS);
const completed = r.orderProfits.filter((o) => o.isCompleted);
const cRev = completed.reduce((s, o) => s + o.revenue, 0);
const cRecv = completed.reduce((s, o) => s + o.merchantReceived, 0);
const cBillIn = completed.reduce((s, o) => s + o.billIncome, 0);
const cBillRef = completed.reduce((s, o) => s + o.billRefund, 0);
const noBill = completed.filter((o) => !o.billIncome && !o.billRefund && !o.techFee);

const modeB = completed.reduce(
  (s, o) =>
    s +
    o.merchantReceived -
    o.costTotal -
    o.packTotal -
    o.netShipping -
    o.techFee -
    o.otherFee,
  0,
);
// 卖家常用：已收货实收 - 成本包材运费 - 平台费 - 广告
const modeBAd = modeB - r.summary.adSpend;
// 含损耗：modeB - 退货相关损耗运费包装
const loss =
  r.summary.shippingLossTotal + r.summary.returnLossTotal + r.summary.repackCostTotal;
const modeB2 = modeB - loss;
const modeB2Ad = modeB2 - r.summary.adSpend;

// 抽样看已收货订单 revenue vs merchantReceived
const samples = completed.slice(0, 5).map((o) => ({
  id: o.orderId,
  recv: o.merchantReceived,
  rev: o.revenue,
  billIn: o.billIncome,
  billRef: o.billRefund,
  cost: o.costTotal,
  profit: o.estimatedProfit,
}));

console.log(
  JSON.stringify(
    {
      completedCount: completed.length,
      completedRevenue_billBased: +cRev.toFixed(2),
      completedMerchantReceived: +cRecv.toFixed(2),
      gap: +(cRecv - cRev).toFixed(2),
      billIncomeOnCompleted: +cBillIn.toFixed(2),
      billRefundOnCompleted: +cBillRef.toFixed(2),
      completedNoBillMatch: noBill.length,
      // 更贴近卖家体感
      profit_completedRecv_based: +modeB.toFixed(2),
      profit_completedRecv_minusAd: +modeBAd.toFixed(2),
      profit_completed_minusLosses: +modeB2.toFixed(2),
      profit_completed_minusLosses_minusAd: +modeB2Ad.toFixed(2),
      current_system_beforeAd: +r.summary.estimatedProfitBeforeAd.toFixed(2),
      current_system_afterAd: +r.summary.estimatedProfitAfterAd.toFixed(2),
      samples,
    },
    null,
    2,
  ),
);
