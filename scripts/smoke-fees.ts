import { readFileSync } from "fs";
import { createRequire } from "module";
import path from "path";
import { buildOperatingReport, ingestForOperating, DEFAULT_COST_SETTINGS } from "../src/services/pddBusiness.ts";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
function load(fp: string) {
  const buf = readFileSync(fp);
  let text = buf.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text.includes("\uFFFD")) text = new TextDecoder("gb18030").decode(buf);
  const wb = XLSX.read(text, { type: "string" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: false }) as any[][];
  return { name: path.basename(fp), path: fp, headers: (rows[0] || []).map(String), data: rows };
}
const root = "C:/Users/L/Downloads";
const orders = ingestForOperating(load(`${root}/7a23336f32a1f51a9d8bf27125e3b781orders_export2026-07-20-10-09-23.csv`) as any).orders;
const bill = ingestForOperating(load(`${root}/pdd-mall-bill-detail(wrc1ib6cxr8r905pg)_2026-07-20-10-09-55_2175.csv`) as any).billLines;
const base = buildOperatingReport(orders, bill, [], [], DEFAULT_COST_SETTINGS);
const withFees = buildOperatingReport(orders, bill, [], [], {
  ...DEFAULT_COST_SETTINGS,
  brandPointPct: 5,
  ecommerceTaxPct: 1,
  feeBaseMode: "revenue",
});
console.log(JSON.stringify({
  before: {
    profit: +base.summary.estimatedProfitAfterAd.toFixed(2),
    brand: base.summary.brandPointTotal,
    tax: base.summary.ecommerceTaxTotal,
  },
  after5pct_1pct: {
    profit: +withFees.summary.estimatedProfitAfterAd.toFixed(2),
    brand: +withFees.summary.brandPointTotal.toFixed(2),
    tax: +withFees.summary.ecommerceTaxTotal.toFixed(2),
    delta: +(base.summary.estimatedProfitAfterAd - withFees.summary.estimatedProfitAfterAd).toFixed(2),
    expectApprox: +(withFees.summary.brandPointTotal + withFees.summary.ecommerceTaxTotal).toFixed(2),
  },
}, null, 2));
