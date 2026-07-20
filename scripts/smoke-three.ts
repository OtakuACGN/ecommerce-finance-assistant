import { readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";
import path from "path";
import {
  buildOperatingReport,
  ingestForOperating,
  DEFAULT_COST_SETTINGS,
} from "../src/services/pddBusiness.ts";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
function load(fp: string) {
  const buf = readFileSync(fp);
  let text = buf.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text.includes("\uFFFD")) text = new TextDecoder("gb18030").decode(buf);
  const wb = XLSX.read(text, { type: "string" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    defval: "",
    raw: false,
  }) as any[][];
  return {
    name: path.basename(fp),
    path: fp,
    headers: (rows[0] || []).map(String),
    data: rows,
  };
}
const root = "C:/Users/L/Downloads";
const orders = ingestForOperating(
  load(`${root}/7a23336f32a1f51a9d8bf27125e3b781orders_export2026-07-20-10-09-23.csv`) as any,
).orders;
const products = ingestForOperating(
  load(`${root}/商品资料97104741812.xlsx`) as any,
).products;
const r = buildOperatingReport(
  orders,
  [],
  products,
  [],
  { ...DEFAULT_COST_SETTINGS, brandPointPct: 5, ecommerceTaxPct: 1 },
);
console.log(
  JSON.stringify(
    {
      anomalySummary: r.anomalySummaryTable,
      neg: (r.anomalyNegProfitTable?.length || 1) - 1,
      unmatched: (r.anomalyUnmatchedTable?.length || 1) - 1,
      feeFlip: (r.anomalyFeeFlipTable?.length || 1) - 1,
      highSku: (r.anomalyHighRefundSkuTable?.length || 1) - 1,
    },
    null,
    2,
  ),
);
// roundtrip settings json
const payload = {
  version: 1,
  costSettings: { ...DEFAULT_COST_SETTINGS, brandPointPct: 5 },
};
writeFileSync("scripts/_settings-roundtrip.json", JSON.stringify(payload), "utf8");
const back = JSON.parse(readFileSync("scripts/_settings-roundtrip.json", "utf8"));
console.log("settings ok", back.costSettings.brandPointPct === 5);
