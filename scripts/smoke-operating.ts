import { readFileSync } from "fs";
import { createRequire } from "module";
import path from "path";
import {
  buildOperatingReport,
  ingestForOperating,
  DEFAULT_COST_SETTINGS,
  parseAdDaily,
  aggregatePddBill,
} from "../src/services/pddBusiness.ts";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

function loadFile(filePath: string) {
  const name = path.basename(filePath);
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
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as any[][];
  return { name, path: filePath, headers: (rows[0] || []).map(String), data: rows };
}

const root = "C:/Users/L/Downloads";
const files = {
  orders: `${root}/7a23336f32a1f51a9d8bf27125e3b781orders_export2026-07-20-10-09-23.csv`,
  bill: `${root}/pdd-mall-bill-detail(wrc1ib6cxr8r905pg)_2026-07-20-10-09-55_2175.csv`,
  products: `${root}/\u5546\u54c1\u8d44\u659997104741812.xlsx`,
  ads: `${root}/\u5546\u54c1\u63a8\u5e7f_\u8d26\u6237_\u5206\u5929\u6570\u636e_20260601\u81f320260630.xls`,
};

const orders = ingestForOperating(loadFile(files.orders) as any).orders;
const bill = ingestForOperating(loadFile(files.bill) as any).billLines;
const products = ingestForOperating(loadFile(files.products) as any).products;
const ads = ingestForOperating(loadFile(files.ads) as any).adDays;
const { totals } = aggregatePddBill(bill);

const report = buildOperatingReport(orders, bill, products, ads, DEFAULT_COST_SETTINGS);
const s = report.summary;

console.log(
  JSON.stringify(
    {
      orders: orders.length,
      adDays: ads.length,
      adSpend: s.adSpend,
      adRoi: s.adRoi,
      billAdExcluded: s.billAdExpenseExcluded,
      billOtherFee: totals.otherFee,
      refundRate: s.refundRateByCount,
      returnRefundRate: s.returnRefundRateByCount,
      returnRefundCount: s.returnRefundCount,
      profitAfter: s.estimatedProfitAfterAd,
      lossRows: report.lossDiagnosisTable.length,
      bossRows: report.bossOnePagerTable.length,
      adAnalysisRows: report.adAnalysisTable.length,
      productReturnRows: report.productReturnTable.length,
    },
    null,
    2,
  ),
);

// ensure summary rows not in ads
const bad = ads.filter((d) => /合计|总计|汇总/.test(String(d.date)));
if (bad.length) {
  console.error("FAIL: summary ad rows present", bad);
  process.exit(1);
}
if (!report.bossOnePagerTable?.length || !report.lossDiagnosisTable?.length) {
  console.error("FAIL: missing diagnosis tables");
  process.exit(1);
}
console.log("SMOKE_OK");
