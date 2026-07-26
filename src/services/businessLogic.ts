import { FileData } from "../utils/excel";
import { applySkuMappingRows } from "./skuMapping";

export interface BillRecord {
  fileName: string;
  /** 原始导入来源名，用于同一来源重导替换 */
  sourceName?: string;
  shopName?: string;
  platform: string;
  date: string;
  totalAmount: number;
  orderCount: number;
  commission: number;
  techFee: number;
  subsidy: number;
  refundAmount?: number;
  otherFee?: number;
  adExpense?: number;
  withdraw?: number;
  netAmount: number;
  rawData: any[][];
}

export interface RebateTier {
  min: number;
  max: number;
  rate: number;
  label: string;
}

/** 常用品牌阶梯返利模板（GMV 单位：万元），可在界面按合同修改。 */
export const DEFAULT_REBATE_TIERS: RebateTier[] = [
  { min: 0, max: 50, rate: 2, label: "0-50万" },
  { min: 50, max: 100, rate: 3, label: "50-100万" },
  { min: 100, max: 200, rate: 4, label: "100-200万" },
  { min: 200, max: 500, rate: 5, label: "200-500万" },
  { min: 500, max: 0, rate: 6, label: "500万以上" },
];

export interface RefundOrder {
  platform: string;
  orderId: string;
  refundAmount: number;
  refundDate: string;
  commissionLost: number;
  originalOrder?: string;
}

export interface CommissionDetail {
  orderId: string;
  platform: string;
  commission: number;
}

export interface SKUMapping {
  platformName: string;
  internalCode: string;
  price: number;
}

export function findAmount(row: any[]): number {
  for (const cell of row) {
    const num = parseFloat(String(cell).replace(/[¥¥$,，￥\s]/g, ""));
    if (!isNaN(num) && Math.abs(num) > 0) return num;
  }
  return 0;
}

export function detectPlatform(fileName: string): string {
  const name = fileName.toLowerCase();
  if (name.includes("taobao") || name.includes("淘宝")) return "淘宝";
  if (name.includes("jd") || name.includes("jingdong") || name.includes("京东"))
    return "京东";
  if (
    name.includes("pinduoduo") ||
    name.includes("拼多多") ||
    name.includes("pdd-") ||
    name.startsWith("pdd") ||
    name.includes("pdd_mall") ||
    name.includes("orders_export")
  )
    return "拼多多";
  if (name.includes("douyin") || name.includes("抖音")) return "抖音电商";
  if (name.includes("kuaishou") || name.includes("快手")) return "快手电商";
  if (name.includes("tmall") || name.includes("天猫")) return "天猫";
  if (name.includes("小红书") || name.includes("xiaohongshu") || name.includes("xhs"))
    return "小红书";
  return "其他";
}

export function findCol(headers: string[], keywords: string[]): number {
  const lower = headers.map((h) => String(h).toLowerCase());
  for (const kw of keywords) {
    const idx = lower.findIndex((h) => h.includes(kw.toLowerCase()));
    if (idx >= 0) return idx;
  }
  return -1;
}

export function parseBill(fileData: FileData): BillRecord {
  const headers = fileData.headers;
  const rows = fileData.data.slice(1);
  const platform = detectPlatform(fileData.name);
  const amtCol = findCol(headers, [
    "订单金额",
    "商品总额",
    "商品总价",
    "商家实收",
    "用户实付",
    "交易收入",
    "收入金额",
    "交易额",
    "销售额",
    "amount",
    "total",
    "gmv",
    "sales",
  ]);
  const cntCol = findCol(headers, ["订单数", "笔数", "count", "订单数量"]);
  const commCol = findCol(headers, [
    "佣金",
    "commission",
    "平台服务费",
    "扣点",
  ]);
  const techCol = findCol(headers, [
    "技术服务费",
    "tech",
    "服务费",
    "平台费",
  ]);
  const subCol = findCol(headers, [
    "补贴",
    "subsidy",
    "奖励",
    "返点",
    " rebate",
  ]);
  const refundCol = findCol(headers, [
    "退款金额",
    "实退金额",
    "refund",
  ]);
  const otherFeeCol = findCol(headers, [
    "其他费用",
    "罚款",
    "违约金",
    "other fee",
  ]);
  const dateCol = findCol(headers, [
    "日期",
    "账期",
    "period",
    "date",
    "月份",
  ]);
  const totalAmount =
    amtCol >= 0
      ? rows.reduce((s, r) => s + Math.abs(findAmount([r[amtCol]])), 0)
      : 0;
  const orderCount =
    cntCol >= 0
      ? rows.reduce((s, r) => s + parseInt(String(r[cntCol] || 0)), 0)
      : rows.length;
  const commission =
    commCol >= 0
      ? rows.reduce((s, r) => s + Math.abs(findAmount([r[commCol]])), 0)
      : 0;
  const techFee =
    techCol >= 0 && techCol !== commCol
      ? rows.reduce((s, r) => s + Math.abs(findAmount([r[techCol]])), 0)
      : 0;
  const subsidy =
    subCol >= 0
      ? rows.reduce((s, r) => s + Math.abs(findAmount([r[subCol]])), 0)
      : 0;
  const refundAmount =
    refundCol >= 0
      ? rows.reduce((s, r) => s + Math.abs(findAmount([r[refundCol]])), 0)
      : 0;
  const otherFee =
    otherFeeCol >= 0
      ? rows.reduce((s, r) => s + Math.abs(findAmount([r[otherFeeCol]])), 0)
      : 0;
  return {
    fileName: fileData.name,
    sourceName: fileData.name,
    platform,
    date: dateCol >= 0 ? String(rows[0]?.[dateCol] || "未知账期") : "未知账期",
    totalAmount,
    orderCount,
    commission,
    techFee,
    subsidy,
    refundAmount,
    otherFee,
    netAmount:
      totalAmount - refundAmount - commission - techFee - otherFee + subsidy,
    rawData: fileData.data,
  };
}

export function parseCommissionDetails(fileData: FileData): CommissionDetail[] {
  const headers = fileData.headers;
  const rows = fileData.data.slice(1);

  const orderIdCol = findCol(headers, ["订单号", "order", "编号", "id", "order_id"]);
  const platformCol = findCol(headers, ["平台", "platform", "渠道", "source"]);
  const commissionCol = findCol(headers, ["佣金", "commission", "服务费", "扣点", "platform_fee"]);

  if (commissionCol < 0) {
    return [];
  }

  const details: CommissionDetail[] = [];

  for (const row of rows) {
    const orderId = orderIdCol >= 0 ? String(row[orderIdCol] || "").trim() : "";
    const platform = platformCol >= 0
      ? String(row[platformCol] || "").trim()
      : detectPlatform(fileData.name);
    const commission = Math.abs(findAmount([row[commissionCol]]));

    if (commission > 0) {
      details.push({ orderId, platform, commission });
    }
  }

  return details;
}

export function calculateRebate(gmvWan: number, tiers: RebateTier[]) {
  let remaining = gmvWan;
  let totalRebate = 0;
  const details: any[][] = [];
  for (const tier of tiers) {
    if (remaining <= 0) break;
    const tierMax = tier.max > 0 ? tier.max : remaining + 1;
    const applicable = Math.min(remaining, tierMax - tier.min);
    if (applicable > 0) {
      const rebate = (applicable * tier.rate) / 100;
      totalRebate += rebate;
      details.push([
        tier.label,
        `${tier.min}-${tier.max === 0 ? "∞" : tier.max}万`,
        `${tier.rate}%`,
        `${applicable.toFixed(2)}万`,
        `${rebate.toFixed(4)}万`,
      ]);
      remaining -= applicable;
    }
  }
  return { totalRebate, details };
}

export function generateRebateTable(
  gmvYuan: number,
  tiers: RebateTier[]
): any[][] {
  if (gmvYuan <= 0) return [];
  const gmvWan = gmvYuan / 10000;
  const { totalRebate, details } = calculateRebate(gmvWan, tiers);
  const headers = [
    "阶梯区间",
    "区间范围(万)",
    "返利比例",
    "适用GMV(万)",
    "返利金额(万)",
  ];
  return [
    headers,
    ...details,
    ["", "", "", "返利合计(万)", totalRebate.toFixed(4)],
    ["", "", "", "折合人民币", `¥${(totalRebate * 10000).toFixed(2)}`],
  ];
}

export function reconcilePayments(
  currentData: any[][],
  paymentData: any[][]
): any[][] {
  if (currentData.length === 0 || paymentData.length === 0) return [];
  const orderHeaders = (currentData[0] || []).map(String);
  const paymentHeaders = (paymentData[0] || []).map(String);
  const orderIdCol = findCol(orderHeaders, [
    "订单号",
    "订单编号",
    "商户订单号",
    "order id",
  ]);
  const paymentIdCol = findCol(paymentHeaders, [
    "订单号",
    "订单编号",
    "商户订单号",
    "order id",
  ]);
  const orderAmountCol = findCol(orderHeaders, [
    "订单金额",
    "商品总价",
    "商家实收",
    "用户实付",
    "amount",
  ]);
  const paymentAmountCol = findCol(paymentHeaders, [
    "收款金额",
    "支付金额",
    "入账金额",
    "实收金额",
    "amount",
  ]);
  const orderRows = currentData.slice(1);
  const paymentRows = paymentData.slice(1);
  const reconciled: any[][] = [["订单金额", "收款金额", "状态", "说明"]];
  const usedPayments = new Set<number>();
  const amountOf = (row: any[], column: number) =>
    column >= 0
      ? Math.abs(
          parseFloat(String(row[column] ?? "").replace(/[¥￥$,，\s]/g, "")),
        ) || 0
      : 0;
  const idOf = (row: any[], column: number) =>
    column >= 0 ? String(row[column] ?? "").trim().replace(/\.0$/, "") : "";
  const orderAmountCounts = new Map<number, number>();
  const paymentAmountCounts = new Map<number, number>();
  for (const row of orderRows) {
    const amount = amountOf(row, orderAmountCol);
    if (amount > 0)
      orderAmountCounts.set(amount, (orderAmountCounts.get(amount) || 0) + 1);
  }
  for (const row of paymentRows) {
    const amount = amountOf(row, paymentAmountCol);
    if (amount > 0)
      paymentAmountCounts.set(amount, (paymentAmountCounts.get(amount) || 0) + 1);
  }

  orderRows.forEach((order) => {
    const orderAmount = amountOf(order, orderAmountCol);
    if (orderAmount === 0) return;
    const orderId = idOf(order, orderIdCol);
    let matchIdx =
      orderId && paymentIdCol >= 0
        ? paymentRows.findIndex(
            (pay, index) =>
              !usedPayments.has(index) &&
              idOf(pay, paymentIdCol) === orderId,
          )
        : -1;
    if (
      matchIdx < 0 &&
      orderAmountCounts.get(orderAmount) === 1 &&
      paymentAmountCounts.get(orderAmount) === 1
    ) {
      matchIdx = paymentRows.findIndex(
        (pay, index) =>
          !usedPayments.has(index) &&
          Math.abs(amountOf(pay, paymentAmountCol) - orderAmount) < 0.01,
      );
    }
    if (matchIdx >= 0) {
      usedPayments.add(matchIdx);
      reconciled.push([
        orderAmount,
        amountOf(paymentRows[matchIdx], paymentAmountCol),
        "已核销",
        orderId ? "订单号匹配" : "唯一金额匹配",
      ]);
    } else {
      reconciled.push([orderAmount, "", "未匹配", "无对应收款记录"]);
    }
  });

  paymentRows.forEach((pay, index) => {
    if (!usedPayments.has(index)) {
      reconciled.push([
        "",
        amountOf(pay, paymentAmountCol),
        "未认领",
        "无对应订单",
      ]);
    }
  });
  return reconciled;
}

export function applySkuMapping(
  currentData: any[][],
  skuMappings: SKUMapping[]
): any[][] {
  return applySkuMappingRows(currentData, skuMappings);
}

export function generateAccrualTable(billRecords: BillRecord[]): any[][] {
  if (billRecords.length === 0) return [];
  const headers = [
    "平台",
    "账期",
    "交易收入",
    "退款",
    "订单笔数",
    "佣金",
    "技术服务费",
    "其他费用",
    "补贴/返点",
    "净收款",
    "佣金率",
    "技术服务费率",
    "是否跨期",
  ];
  const rows = billRecords.map((b) => {
    const commRate =
      b.totalAmount > 0
        ? ((b.commission / b.totalAmount) * 100).toFixed(2) + "%"
        : "0%";
    const techRate =
      b.totalAmount > 0
        ? ((b.techFee / b.totalAmount) * 100).toFixed(2) + "%"
        : "0%";
    const today = new Date();
    const billDate = new Date(b.date);
    const isCrossPeriod =
      !isNaN(billDate.getTime()) &&
      (billDate.getFullYear() !== today.getFullYear() ||
        billDate.getMonth() !== today.getMonth());

    return [
      b.platform,
      b.date,
      b.totalAmount.toFixed(2),
      (b.refundAmount || 0).toFixed(2),
      b.orderCount,
      b.commission.toFixed(2),
      b.techFee.toFixed(2),
      (b.otherFee || 0).toFixed(2),
      b.subsidy.toFixed(2),
      b.netAmount.toFixed(2),
      commRate,
      techRate,
      isCrossPeriod ? "⚠️跨期" : "当月",
    ];
  });

  const totalAmount = billRecords.reduce((s, b) => s + b.totalAmount, 0);
  const totalCount = billRecords.reduce((s, b) => s + b.orderCount, 0);
  const totalRefund = billRecords.reduce(
    (s, b) => s + (b.refundAmount || 0),
    0,
  );
  const totalComm = billRecords.reduce((s, b) => s + b.commission, 0);
  const totalTech = billRecords.reduce((s, b) => s + b.techFee, 0);
  const totalOther = billRecords.reduce((s, b) => s + (b.otherFee || 0), 0);
  const totalSub = billRecords.reduce((s, b) => s + b.subsidy, 0);
  const totalNet = billRecords.reduce((s, b) => s + b.netAmount, 0);

  const totalRow = [
    "合计",
    "",
    totalAmount.toFixed(2),
    totalRefund.toFixed(2),
    totalCount,
    totalComm.toFixed(2),
    totalTech.toFixed(2),
    totalOther.toFixed(2),
    totalSub.toFixed(2),
    totalNet.toFixed(2),
    "",
    "",
    "",
  ];

  return [headers, ...rows, totalRow];
}

export interface RefundLossResult {
  orderId: string;
  platform: string;
  refundAmount: number;
  refundDate: string;
  commission: number;
  isMatched: boolean;
  matchSource: "精确匹配" | "均摊估算";
}

export function calculateRefundLossWithMatching(
  refundRecords: RefundOrder[],
  commissionDetails: CommissionDetail[],
  avgCommissionRate: number
): { results: RefundLossResult[]; matchedCount: number; totalCount: number } {
  // Build lookup map for O(n) matching: key = "orderId|platform"
  const commissionMap = new Map<string, number>();
  for (const cd of commissionDetails) {
    const key = `${cd.orderId}|${cd.platform}`;
    commissionMap.set(key, (commissionMap.get(key) || 0) + cd.commission);
  }

  const results: RefundLossResult[] = [];
  let matchedCount = 0;

  for (const refund of refundRecords) {
    const key = `${refund.orderId}|${refund.platform}`;
    const matchedCommission = commissionMap.get(key);

    if (matchedCommission !== undefined) {
      results.push({
        orderId: refund.orderId,
        platform: refund.platform,
        refundAmount: refund.refundAmount,
        refundDate: refund.refundDate,
        commission: matchedCommission,
        isMatched: true,
        matchSource: "精确匹配",
      });
      matchedCount++;
    } else {
      // Fallback to average rate estimation
      results.push({
        orderId: refund.orderId,
        platform: refund.platform,
        refundAmount: refund.refundAmount,
        refundDate: refund.refundDate,
        commission: refund.refundAmount * avgCommissionRate,
        isMatched: false,
        matchSource: "均摊估算",
      });
    }
  }

  return { results, matchedCount, totalCount: refundRecords.length };
}
