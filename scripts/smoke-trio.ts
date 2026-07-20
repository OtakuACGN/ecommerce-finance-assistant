import { readFileSync } from "fs";
import { createRequire } from "module";
import path from "path";
import {
  buildOperatingReport,
  ingestForOperating,
  DEFAULT_COST_SETTINGS,
  applyCostTemplate,
  resolveShopFeeRates,
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
// tag half orders as another shop for override test
const tagged = orders.map((o, i) => ({
  ...o,
  shopName: i % 2 === 0 ? "店铺A" : "店铺B",
}));
const settings = applyCostTemplate(
  {
    ...DEFAULT_COST_SETTINGS,
    shopFeeOverrides: [
      { shopName: "店铺A", brandPointPct: 5, ecommerceTaxPct: 1, feeBaseMode: "revenue" },
      { shopName: "店铺B", brandPointPct: 0, ecommerceTaxPct: 0, feeBaseMode: "" },
    ],
  },
  "brand5_tax1", // global becomes 5/1 but B overrides to 0
);
// template applies after overrides object - re-apply overrides
settings.shopFeeOverrides = [
  { shopName: "店铺A", brandPointPct: 10, ecommerceTaxPct: 1, feeBaseMode: "revenue" },
  { shopName: "店铺B", brandPointPct: 0, ecommerceTaxPct: 0, feeBaseMode: "" },
];
settings.brandPointPct = 5;
settings.ecommerceTaxPct = 1;

const r = buildOperatingReport(tagged, [], [], [], settings);
const a = tagged.filter((o) => o.shopName === "店铺A").length;
const b = tagged.filter((o) => o.shopName === "店铺B").length;
const feeA = r.orderProfits.filter((o) => o.shopName === "店铺A").reduce((s, o) => s + o.brandPointFee, 0);
const feeB = r.orderProfits.filter((o) => o.shopName === "店铺B").reduce((s, o) => s + o.brandPointFee, 0);
console.log(
  JSON.stringify(
    {
      shops: { a, b },
      resolveA: resolveShopFeeRates(settings, "店铺A"),
      resolveB: resolveShopFeeRates(settings, "店铺B"),
      brandTotal: +r.summary.brandPointTotal.toFixed(2),
      feeA: +feeA.toFixed(2),
      feeB: +feeB.toFixed(2),
      expectB0: feeB === 0,
      ladder: {
        base: +r.summary.profitOpsBase.toFixed(2),
        returnEat: +r.summary.returnRelatedCost.toFixed(2),
        ad: +r.summary.adSpend.toFixed(2),
        eaten: +r.summary.marginEatenTotal.toFixed(2),
        final: +r.summary.estimatedProfitAfterAd.toFixed(2),
      },
      templateName: applyCostTemplate(DEFAULT_COST_SETTINGS, "high_return_loss").returnRestockRate,
    },
    null,
    2,
  ),
);
