import { readFileSync, writeFileSync, mkdirSync } from "fs";
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
    workbook = XLSX.read(buf, { type: "buffer", cellDates: true });
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

const report = buildOperatingReport(
  orders,
  bill,
  products,
  ads,
  DEFAULT_COST_SETTINGS,
);
const s = report.summary;

const outDir = "D:/finance-data-cleaner/output";
mkdirSync(outDir, { recursive: true });
const outPath = `${outDir}/拼多多经营分析_${new Date().toISOString().slice(0, 10)}.xlsx`;

const sheets: [string, any[][]][] = [
  ["老板一页纸", report.bossOnePagerTable],
  ["经营汇总", report.summaryTable],
  ["本月亏在哪", report.lossDiagnosisTable],
  ["退款率", report.rateTable],
  ["时段对比", report.periodTable],
  ["店铺对比", report.shopTable],
  ["SPU毛利排行", report.spuTable],
  ["规格毛利排行", report.skuTable],
  ["推广分析", report.adAnalysisTable],
  ["产品退货退款率", report.productReturnTable],
  ["分快递运费", report.expressTable],
  ["订单毛利", report.orderTable],
  ["损耗运费", report.shipLossTable],
  ["账务类型", report.billTypeTable],
  ["账务按单", report.billWideTable],
  ["推广日报", report.adTable],
  ["商品成本", report.productMapTable],
  ["待补SKU", report.unmatchedTable],
];

const wb = XLSX.utils.book_new();
for (const [name, rows] of sheets) {
  if (!rows || !rows.length) continue;
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
}
XLSX.writeFile(wb, outPath);

const summary = {
  导出文件: outPath,
  订单数: s.orderCount,
  商品资料规格数: products.length,
  推广天数: ads.length,
  账务行数: bill.length,
  GMV商品总价: +s.goodsTotal.toFixed(2),
  商家实收: +s.merchantReceived.toFixed(2),
  商品成本: +s.costTotal.toFixed(2),
  包材: +s.packTotal.toFixed(2),
  净运费: +s.netShippingTotal.toFixed(2),
  损耗运费: +s.shippingLossTotal.toFixed(2),
  退货损耗: +s.returnLossTotal.toFixed(2),
  二次包装: +s.repackCostTotal.toFixed(2),
  技术服务费: +s.techFee.toFixed(2),
  其他费用: +s.otherFee.toFixed(2),
  广告花费_推广日报: +s.adSpend.toFixed(2),
  广告ROI: +s.adRoi.toFixed(2),
  账务广告已排除: +s.billAdExpenseExcluded.toFixed(2),
  提现已排除: +s.billWithdrawExcluded.toFixed(2),
  总退款率_笔: `${(s.refundRateByCount * 100).toFixed(2)}%`,
  发货后退款率_笔: `${(s.postShipRefundRateByCount * 100).toFixed(2)}%`,
  退货退款率_笔: `${(s.returnRefundRateByCount * 100).toFixed(2)}%`,
  毛利_未扣广告: +s.estimatedProfitBeforeAd.toFixed(2),
  毛利_扣广告: +s.estimatedProfitAfterAd.toFixed(2),
  毛利率_扣广告: `${(s.profitMargin * 100).toFixed(2)}%`,
  成本匹配: `${s.costMatchedOrders}/${s.orderCount}`,
  待补SKU: report.unmatchedSkus.length,
};
console.log(JSON.stringify(summary, null, 2));
