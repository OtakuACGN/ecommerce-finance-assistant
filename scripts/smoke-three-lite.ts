import { readFileSync } from "fs";
import { createRequire } from "module";
import path from "path";
import { buildOperatingReport, ingestForOperating, DEFAULT_COST_SETTINGS } from "../src/services/pddBusiness.ts";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const fp = "C:/Users/L/Downloads/7a23336f32a1f51a9d8bf27125e3b781orders_export2026-07-20-10-09-23.csv";
const buf = readFileSync(fp);
let text = buf.toString("utf8");
if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
if (text.includes("\uFFFD")) text = new TextDecoder("gb18030").decode(buf);
const wb = XLSX.read(text, { type: "string" });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: false }) as any[][];
const orders = ingestForOperating({ name: path.basename(fp), path: fp, headers: (rows[0]||[]).map(String), data: rows } as any).orders;
console.log("orders", orders.length);
const r = buildOperatingReport(orders, [], [], [], { ...DEFAULT_COST_SETTINGS, brandPointPct: 5, ecommerceTaxPct: 1 });
console.log("done", {
  has: !!r.anomalySummaryTable,
  summary: r.anomalySummaryTable,
  neg: (r.anomalyNegProfitTable?.length||1)-1,
});
