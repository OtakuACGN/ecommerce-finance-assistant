import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  buildOperatingReport,
  DEFAULT_COST_SETTINGS,
  ingestForOperating,
} from "../src/services/pddBusiness.ts";
import { parseAndAnalyzeAfterSales } from "../src/services/afterSaleAnalysis.ts";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const materialDir = path.resolve(process.argv[2] || path.join(process.cwd(), "..", "材料"));

if (!existsSync(materialDir)) {
  throw new Error(`材料目录不存在：${materialDir}`);
}

function loadFile(filePath: string) {
  const buffer = readFileSync(filePath);
  let workbook: any;
  if (/\.csv$/i.test(filePath)) {
    let text = buffer.toString("utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    if (text.includes("\uFFFD")) text = new TextDecoder("gb18030").decode(buffer);
    workbook = XLSX.read(text, { type: "string" });
  } else {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as any[][];
  return {
    name: path.basename(filePath),
    path: filePath,
    headers: (data[0] || []).map(String),
    data,
  };
}

const files = readdirSync(materialDir)
  .filter((name) => /\.(csv|xlsx?|xls)$/i.test(name))
  .map((name) => loadFile(path.join(materialDir, name)));

const orders: any[] = [];
const billLines: any[] = [];
const products: any[] = [];
const adDays: any[] = [];
const adProducts: any[] = [];
const classified: Record<string, string> = {};

for (const file of files) {
  const result = ingestForOperating(file as any);
  classified[file.name] = result.kind;
  orders.push(...result.orders);
  billLines.push(...result.billLines);
  products.push(...result.products);
  adDays.push(...result.adDays);
  adProducts.push(...result.adProducts);
}

const report = buildOperatingReport(
  orders,
  billLines,
  products,
  adDays,
  DEFAULT_COST_SETTINGS,
  adProducts,
);
const afterFile = files.find((file) => /售后/.test(file.name));
const afterSale = afterFile
  ? parseAndAnalyzeAfterSales(afterFile as any, { opOrders: orders })
  : null;
const summary = report.summary;

console.log(JSON.stringify({
  materialDir,
  classified,
  input: {
    orders: orders.length,
    billLines: billLines.length,
    products: products.length,
    adDays: adDays.length,
    adProducts: adProducts.length,
    afterSaleRows: afterSale?.summary.total || 0,
  },
  result: {
    confirmedRevenue: Number(summary.confirmedRevenue.toFixed(2)),
    costTotal: Number(summary.costTotal.toFixed(2)),
    packTotal: Number(summary.packTotal.toFixed(2)),
    shippingEstimated: Number(summary.netShippingTotal.toFixed(2)),
    platformFees: Number((summary.techFee + summary.otherFee).toFixed(2)),
    adSpend: Number(summary.adSpend.toFixed(2)),
    naturalMonthProfit: Number(summary.estimatedProfitAfterAd.toFixed(2)),
    naturalMonthProfitBeforeShipping: Number(summary.profitAfterAdBeforeShipping.toFixed(2)),
    profitMarginOnConfirmedRevenue: Number((summary.profitMargin * 100).toFixed(2)),
    costMatchedOrders: summary.costMatchedOrders,
    costUnmatchedOrders: summary.costUnmatchedOrders,
    afterSaleSuccess: afterSale?.summary.success || 0,
    afterSaleProcessing: afterSale?.summary.processing || 0,
  },
}, null, 2));
