import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import {
  buildOperatingReport,
  DEFAULT_COST_SETTINGS,
  type PddBillLine,
  type PddOrder,
  type ProductSku,
} from "../src/services/pddBusiness.ts";
import {
  createOperatingWorkspace,
  parseOperatingWorkspace,
} from "../src/services/operatingWorkspace.ts";

const orderCount = Math.max(10_000, Number(process.env.STRESS_ROWS) || 100_000);
const skuCount = 200;

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

const products: ProductSku[] = Array.from({ length: skuCount }, (_, index) => ({
  productCode: `SPU-${Math.floor(index / 5)}`,
  productName: `压力测试商品 ${Math.floor(index / 5)}`,
  skuCode: `SKU-${index}`,
  specName: `规格 ${index}`,
  salePrice: 59 + (index % 40),
  costPrice: 18 + (index % 15),
  packCost: 0.3 + (index % 3) * 0.1,
  weightKg: 0.4 + (index % 8) * 0.15,
  stock: 999,
}));

const orders: PddOrder[] = Array.from({ length: orderCount }, (_, index) => {
  const sku = products[index % skuCount];
  const fullRefund = index % 97 === 0;
  const partialRefund = !fullRefund && index % 41 === 0;
  const amount = sku.salePrice;
  return {
    orderId: `STRESS-${String(index).padStart(7, "0")}`,
    productName: sku.productName,
    status: fullRefund ? "已收货，退款成功" : "已收货",
    afterSale: fullRefund || partialRefund ? "退款成功" : "",
    qty: 1,
    goodsTotal: amount,
    buyerPaid: amount,
    merchantReceived: amount,
    platformDiscount: 0,
    shopDiscount: 0,
    productId: `P-${index % skuCount}`,
    specName: sku.specName,
    merchantSku: sku.skuCode,
    merchantSpu: sku.productCode,
    dealTime: `2026-07-${String((index % 28) + 1).padStart(2, "0")} 10:00:00`,
    shipTime: `2026-07-${String((index % 28) + 1).padStart(2, "0")} 18:00:00`,
    confirmTime: `2026-07-${String((index % 28) + 1).padStart(2, "0")} 20:00:00`,
    postage: 0,
    expressNo: `YT${String(index).padStart(10, "0")}`,
    expressCompany: index % 3 === 0 ? "圆通" : index % 3 === 1 ? "中通" : "申通",
    shopName: index % 2 === 0 ? "压力店 A" : "压力店 B",
  };
});

const billLines: PddBillLine[] = orders.flatMap((order, index) => {
  const rows: PddBillLine[] = [
    {
      orderId: order.orderId,
      time: order.dealTime,
      income: order.merchantReceived,
      expense: 0,
      billType: "交易收入",
      remark: "",
      bizDesc: "",
      shopName: order.shopName,
      sourceName: "stress-bill.csv",
    },
  ];
  if (index % 97 === 0 || index % 41 === 0) {
    rows.push({
      orderId: order.orderId,
      time: order.confirmTime,
      income: 0,
      expense: index % 97 === 0 ? order.merchantReceived : money(order.merchantReceived * 0.2),
      billType: "退款",
      remark: "",
      bizDesc: "",
      shopName: order.shopName,
      sourceName: "stress-bill.csv",
    });
  }
  return rows;
});

const beforeMemory = process.memoryUsage().heapUsed;
const reportStarted = performance.now();
const report = buildOperatingReport(
  orders,
  billLines,
  products,
  [],
  { ...DEFAULT_COST_SETTINGS, adAllocateMode: "none" },
  [],
);
const reportMs = performance.now() - reportStarted;

const workspaceStarted = performance.now();
const snapshot = createOperatingWorkspace({
  appVersion: "stress",
  shopLabel: "",
  productImportMode: "merge",
  sources: [
    { kind: "pdd_orders", name: "stress-orders.csv", rows: orders.length },
    { kind: "pdd_bill", name: "stress-bill.csv", rows: billLines.length },
  ],
  costSettings: DEFAULT_COST_SETTINGS,
  orders,
  billLines,
  products,
  ads: [],
  adProducts: [],
  skuMappings: [],
});
const serialized = JSON.stringify(snapshot);
const workspaceFilePath = join(
  tmpdir(),
  `diancaitong-workspace-${process.pid}-${Date.now()}.json`,
);
let restored: ReturnType<typeof parseOperatingWorkspace>;
let workspaceFileBytes = 0;
try {
  writeFileSync(workspaceFilePath, serialized, "utf8");
  const persisted = readFileSync(workspaceFilePath, "utf8");
  workspaceFileBytes = Buffer.byteLength(persisted, "utf8");
  restored = parseOperatingWorkspace(JSON.parse(persisted));
} finally {
  rmSync(workspaceFilePath, { force: true });
}
const workspaceMs = performance.now() - workspaceStarted;
const heapGrowthMb = (process.memoryUsage().heapUsed - beforeMemory) / 1024 / 1024;

const checks = {
  orderCount: report.summary.orderCount === orderCount,
  orderProfits: report.orderProfits.length === orderCount,
  finiteProfit: Number.isFinite(report.summary.estimatedProfitAfterAd),
  restoredOrders: restored.data.orders.length === orderCount,
  restoredBillLines: restored.data.billLines.length === billLines.length,
  workspaceFileBytes:
    workspaceFileBytes === Buffer.byteLength(serialized, "utf8"),
  workspaceFileCleaned: !existsSync(workspaceFilePath),
  reportWithinLimit: reportMs < 45_000,
  workspaceWithinLimit: workspaceMs < 30_000,
  memoryWithinLimit: heapGrowthMb < 1_500,
};

console.log(
  JSON.stringify(
    {
      input: {
        orders: orderCount,
        billLines: billLines.length,
        products: products.length,
      },
      result: {
        confirmedRevenue: money(report.summary.confirmedRevenue),
        profitAfterAd: money(report.summary.estimatedProfitAfterAd),
        reportMs: Math.round(reportMs),
        workspaceMs: Math.round(workspaceMs),
        workspaceMb: Math.round((serialized.length / 1024 / 1024) * 10) / 10,
        heapGrowthMb: Math.round(heapGrowthMb * 10) / 10,
      },
      checks,
    },
    null,
    2,
  ),
);

const failed = Object.entries(checks).filter(([, passed]) => !passed);
if (failed.length) {
  throw new Error(`压力测试失败：${failed.map(([name]) => name).join(", ")}`);
}
