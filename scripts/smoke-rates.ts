import { readFileSync } from "fs";
import { createRequire } from "module";
import path from "path";
import { buildOperatingReport, ingestForOperating, DEFAULT_COST_SETTINGS } from "../src/services/pddBusiness.ts";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
function load(fp: string) {
  const buf = readFileSync(fp);
  let wb: any;
  if (/\.csv$/i.test(fp)) {
    let text = buf.toString("utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    if (text.includes("\uFFFD")) text = new TextDecoder("gb18030").decode(buf);
    wb = XLSX.read(text, { type: "string" });
  } else wb = XLSX.read(buf, { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: false }) as any[][];
  return { name: path.basename(fp), path: fp, headers: (rows[0] || []).map(String), data: rows };
}
const root = "C:/Users/L/Downloads";
const orders = ingestForOperating(load(`${root}/7a23336f32a1f51a9d8bf27125e3b781orders_export2026-07-20-10-09-23.csv`) as any).orders;
const bill = ingestForOperating(load(`${root}/pdd-mall-bill-detail(wrc1ib6cxr8r905pg)_2026-07-20-10-09-55_2175.csv`) as any).billLines;
const r = buildOperatingReport(orders, bill, [], [], DEFAULT_COST_SETTINGS);
const s = r.summary;
console.log(JSON.stringify({
  total: s.orderCount,
  refundRate: (s.refundRateByCount * 100).toFixed(2) + "%",
  returnRefund_main: {
    count: s.returnRefundCount,
    rate: (s.returnRefundRateByCount * 100).toFixed(2) + "%",
    formula: `${s.returnRefundCount}/${s.shippedOrderCount}`,
    ofAll: (s.returnRefundRateOfAllByCount * 100).toFixed(2) + "%",
  },
  shipOnly: s.shipOnlyRefundCount,
  signedReturn: {
    count: s.signedReturnCount,
    rate: (s.signedReturnRateByCount * 100).toFixed(2) + "%",
    formula: `${s.signedReturnCount}/${s.receivedRelatedCount}`,
  },
  postShipSame: s.postShipRefundCount === s.returnRefundCount,
  rateRow: r.rateTable.find((row) => String(row[0]).includes("退货退款(主")),
}, null, 2));
