import { readFileSync } from "fs";
import { createRequire } from "module";
import path from "path";
import {
  ingestForOperating,
  aggregatePddBill,
  buildOperatingReport,
  DEFAULT_COST_SETTINGS,
} from "../src/services/pddBusiness.ts";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

function loadFile(filePath: string) {
  const name = path.basename(filePath);
  const buf = readFileSync(filePath);
  let text = buf.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text.includes("\uFFFD")) text = new TextDecoder("gb18030").decode(buf);
  const wb = XLSX.read(text, { type: "string" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    defval: "",
    raw: false,
  }) as any[][];
  return { name, path: filePath, headers: (rows[0] || []).map(String), data: rows };
}

const billPath =
  "C:/Users/L/Downloads/pdd-mall-bill-detail(wrc1ib6cxr8r905pg)_2026-07-20-10-09-55_2175.csv";
const ordersPath =
  "C:/Users/L/Downloads/7a23336f32a1f51a9d8bf27125e3b781orders_export2026-07-20-10-09-23.csv";

const bill = ingestForOperating(loadFile(billPath) as any).billLines;
const orders = ingestForOperating(loadFile(ordersPath) as any).orders;
const { totals, byType } = aggregatePddBill(bill);

const withdrawTypes = [...byType.entries()]
  .filter(([k]) => /提现/.test(k))
  .map(([k, v]) => ({ type: k, expense: v.expense, income: v.income, count: v.count }));

const report = buildOperatingReport(orders, bill, [], [], DEFAULT_COST_SETTINGS);

console.log(
  JSON.stringify(
    {
      withdrawTypes,
      billWithdraw: totals.withdraw,
      otherFee: totals.otherFee,
      adExpense: totals.adExpense,
      billWithdrawExcluded: report.summary.billWithdrawExcluded,
      otherFeeInSummary: report.summary.otherFee,
      profitAfter: report.summary.estimatedProfitAfterAd,
    },
    null,
    2,
  ),
);
console.log("OK");
