import { readFileSync } from "fs";
import { createRequire } from "module";
import path from "path";
import {
  buildOperatingReport,
  ingestForOperating,
  DEFAULT_COST_SETTINGS,
  aggregatePddBill,
  isOrderRefunded,
  isOrderCompleted,
  isOrderShipped,
  isReturnRefund,
  isPostShipRefund,
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
const orders = ingestForOperating(loadFile(`${root}/7a23336f32a1f51a9d8bf27125e3b781orders_export2026-07-20-10-09-23.csv`) as any).orders;
const bill = ingestForOperating(loadFile(`${root}/pdd-mall-bill-detail(wrc1ib6cxr8r905pg)_2026-07-20-10-09-55_2175.csv`) as any).billLines;
const products = ingestForOperating(loadFile(`${root}/\u5546\u54c1\u8d44\u659997104741812.xlsx`) as any).products;
const ads = ingestForOperating(loadFile(`${root}/\u5546\u54c1\u63a8\u5e7f_\u8d26\u6237_\u5206\u5929\u6570\u636e_20260601\u81f320260630.xls`) as any).adDays;

const report = buildOperatingReport(orders, bill, products, ads, DEFAULT_COST_SETTINGS);
const s = report.summary;
const rows = report.orderProfits;

// status breakdown
const statusMap = new Map<string, number>();
for (const o of orders) statusMap.set(o.status, (statusMap.get(o.status) || 0) + 1);

// revenue components
let revBill = 0, revOrder = 0, revZeroRefund = 0;
let costOnCompleted = 0, costOnShipped = 0, costOnRefund = 0;
let sumRevenue = 0, sumCost = 0, sumPack = 0, sumNetShip = 0, sumFees = 0, sumReturnLoss = 0, sumRepack = 0, sumAd = 0, sumProfit = 0, sumProfitAd = 0;
let completed = 0, refunded = 0;

for (const o of rows) {
  sumRevenue += o.revenue;
  sumCost += o.costTotal;
  sumPack += o.packTotal;
  sumNetShip += o.netShipping;
  sumFees += o.techFee + o.otherFee;
  sumReturnLoss += o.returnLoss;
  sumRepack += o.repackCost;
  sumAd += o.adAllocated;
  sumProfit += o.estimatedProfit;
  sumProfitAd += o.estimatedProfitAfterAd;
  if (o.isCompleted) completed++;
  if (o.isRefunded) refunded++;
}

// manual "seller intuition" profit estimates
const completedOrders = rows.filter((o) => o.isCompleted);
const completedGMV = completedOrders.reduce((s, o) => s + o.goodsTotal, 0);
const completedRecv = completedOrders.reduce((s, o) => s + o.merchantReceived, 0);
const completedCost = completedOrders.reduce((s, o) => s + o.costTotal, 0);
const completedPack = completedOrders.reduce((s, o) => s + o.packTotal, 0);
const completedShip = completedOrders.reduce((s, o) => s + o.netShipping, 0);
const completedFees = completedOrders.reduce((s, o) => s + o.techFee + o.otherFee, 0);
const completedAd = completedOrders.reduce((s, o) => s + o.adAllocated, 0);
const simpleProfit =
  completedRecv - completedCost - completedPack - completedShip - completedFees;
const simpleProfitAd = simpleProfit - completedAd;

// All non-refund merchant received style
const nonRefund = rows.filter((o) => !o.isRefunded);
const nonRefundRecv = nonRefund.reduce((s, o) => s + o.merchantReceived, 0);
const nonRefundCost = nonRefund.reduce((s, o) => s + o.costTotal + o.packTotal + o.netShipping + o.techFee + o.otherFee, 0);

// Bill totals
const { totals, byType } = aggregatePddBill(bill);
const topTypes = [...byType.entries()]
  .map(([type, v]) => ({ type, net: v.income - v.expense, expense: v.expense, income: v.income, count: v.count }))
  .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
  .slice(0, 15);

// Ad vs period
const adSpend = ads.reduce((s, d) => s + d.spend, 0);
const adGmv = ads.reduce((s, d) => s + d.gmv, 0);

// How many orders have bill match
const withBill = rows.filter((o) => o.billIncome > 0 || o.billRefund > 0 || o.techFee > 0).length;
const avgRevenue = rows.reduce((s,o)=>s+o.revenue,0);

// Check if shipping charged on refunds
const refundShip = rows.filter(o=>o.isRefunded).reduce((s,o)=>s+o.netShipping,0);
const refundCost = rows.filter(o=>o.isRefunded).reduce((s,o)=>s+o.costTotal,0);
const refundPack = rows.filter(o=>o.isRefunded).reduce((s,o)=>s+o.packTotal,0);
const refundRevenue = rows.filter(o=>o.isRefunded).reduce((s,o)=>s+o.revenue,0);
const refundProfit = rows.filter(o=>o.isRefunded).reduce((s,o)=>s+o.estimatedProfit,0);

// completed only profit from report rows
const completedProfit = completedOrders.reduce((s,o)=>s+o.estimatedProfit,0);
const completedProfitAd = completedOrders.reduce((s,o)=>s+o.estimatedProfitAfterAd,0);

console.log(JSON.stringify({
  statusBreakdown: Object.fromEntries(statusMap),
  formula: "revenue - cost - pack - netShipping - tech/other fees - returnLoss - repack - ad",
  current: {
    revenue: +sumRevenue.toFixed(2),
    cost: +sumCost.toFixed(2),
    pack: +sumPack.toFixed(2),
    netShip: +sumNetShip.toFixed(2),
    fees: +sumFees.toFixed(2),
    returnLoss: +sumReturnLoss.toFixed(2),
    repack: +sumRepack.toFixed(2),
    ad: +sumAd.toFixed(2),
    profitBeforeAd: +sumProfit.toFixed(2),
    profitAfterAd: +sumProfitAd.toFixed(2),
  },
  completedOnly: {
    count: completedOrders.length,
    recv: +completedRecv.toFixed(2),
    cost: +completedCost.toFixed(2),
    pack: +completedPack.toFixed(2),
    ship: +completedShip.toFixed(2),
    fees: +completedFees.toFixed(2),
    ad: +completedAd.toFixed(2),
    simpleProfit: +simpleProfit.toFixed(2),
    simpleProfitAd: +simpleProfitAd.toFixed(2),
    rowProfit: +completedProfit.toFixed(2),
    rowProfitAd: +completedProfitAd.toFixed(2),
  },
  refundOrdersImpact: {
    count: refunded,
    revenue: +refundRevenue.toFixed(2),
    cost: +refundCost.toFixed(2),
    pack: +refundPack.toFixed(2),
    ship: +refundShip.toFixed(2),
    profit: +refundProfit.toFixed(2),
  },
  ad: { days: ads.length, spend: +adSpend.toFixed(2), gmv: +adGmv.toFixed(2), roi: +(adGmv/adSpend).toFixed(2) },
  bill: {
    income: +totals.income.toFixed(2),
    refund: +totals.refund.toFixed(2),
    tech: +totals.techFee.toFixed(2),
    other: +totals.otherFee.toFixed(2),
    subsidy: +totals.subsidy.toFixed(2),
    adExcl: +totals.adExpense.toFixed(2),
    withdrawExcl: +totals.withdraw.toFixed(2),
    net: +totals.net.toFixed(2),
  },
  topBillTypes: topTypes,
  ordersWithBillMatch: withBill,
  merchantReceivedAll: +s.merchantReceived.toFixed(2),
}, null, 2));
