import { readFileSync } from "fs";
import { createRequire } from "module";
import path from "path";
import {
  buildOperatingReport,
  ingestForOperating,
  DEFAULT_COST_SETTINGS,
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
    if (text.includes("\uFFFD") || /[\u00c0-\u00ff]{4,}/.test(text.slice(0, 200))) {
      text = new TextDecoder("gb18030").decode(buf);
    }
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
const r = buildOperatingReport(orders, bill, products, ads, DEFAULT_COST_SETTINGS);
const s = r.summary;

console.log(JSON.stringify({
  订单数: s.orderCount,
  商品总价GMV: +s.goodsTotal.toFixed(2),
  商家实收: +s.merchantReceived.toFixed(2),
  商品成本: +s.costTotal.toFixed(2),
  包材: +s.packTotal.toFixed(2),
  净运费: +s.netShippingTotal.toFixed(2),
  损耗运费: +s.shippingLossTotal.toFixed(2),
  退货损耗: +s.returnLossTotal.toFixed(2),
  二次包装: +s.repackCostTotal.toFixed(2),
  技术服务费: +s.techFee.toFixed(2),
  其他费用_不含提现广告: +s.otherFee.toFixed(2),
  广告花费_仅推广日报: +s.adSpend.toFixed(2),
  广告ROI: +s.adRoi.toFixed(2),
  账务广告已排除: +s.billAdExpenseExcluded.toFixed(2),
  提现已排除: +s.billWithdrawExcluded.toFixed(2),
  总退款率_笔: +(s.refundRateByCount * 100).toFixed(2) + "%",
  发货后退款率_笔: +(s.postShipRefundRateByCount * 100).toFixed(2) + "%",
  退货退款率_笔: +(s.returnRefundRateByCount * 100).toFixed(2) + "%",
  毛利_未扣广告: +s.estimatedProfitBeforeAd.toFixed(2),
  毛利_扣广告: +s.estimatedProfitAfterAd.toFixed(2),
  毛利率_扣广告: +(s.profitMargin * 100).toFixed(2) + "%",
  成本匹配: `${s.costMatchedOrders}/${s.orderCount}`,
}, null, 2));
