/**
 * 文件识别与解析：订单/账务/商品资料；订单表与收款对账
 */
import type { FileData } from "../../utils/excel";
import { BillRecord, findCol } from "../businessLogic";
import type {
  SourceKind,
  PddOrder,
  PddBillLine,
  PddBillOrderAgg,
  ProductSku,
} from "./types";
import {
  toNum,
  cell,
  cellId,
  findColExactThen,
  cellTime,
} from "./helpers";

export function normalizeHeader(h: any): string {
  return String(h ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/<[^>]+>/g, "")
    .replace(/[（(].*?[）)]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

/** Detect real header row for platform export preambles. */
export function findHeaderRowIndex(rows: any[][]): number {
  if (!rows.length) return 0;
  const patterns: string[][] = [
    ["商户订单号", "发生时间", "账务类型"],
    ["订单号", "商家实收", "商品"],
    ["商品编码", "商品名称", "规格编码"],
    ["商品编码", "商品名称", "规格名称"],
    ["日期", "成交花费", "交易额"],
    ["日期", "总花费", "交易额"],
    ["商品名称", "商品ID", "总花费"],
    ["商品名称", "商品ID", "成交花费"],
    ["商品名称", "商品ID", "实际投产比"],
  ];
  const limit = Math.min(rows.length, 30);
  for (let i = 0; i < limit; i++) {
    const joined = (rows[i] || []).map((c) => String(c ?? "")).join("|");
    for (const keys of patterns) {
      const hit = keys.filter((k) => joined.includes(k)).length;
      if (hit >= Math.min(2, keys.length)) return i;
    }
  }
  // fallback: first non-empty row with >=3 non-empty cells
  for (let i = 0; i < limit; i++) {
    const nonEmpty = (rows[i] || []).filter((c) => String(c ?? "").trim() !== "").length;
    if (nonEmpty >= 3) return i;
  }
  return 0;
}

export function normalizeFileData(fileData: FileData): FileData {
  const headerIdx = findHeaderRowIndex(fileData.data);
  if (headerIdx <= 0) {
    const headers = (fileData.data[0] || []).map((h) => String(h ?? ""));
    return { ...fileData, headers, data: fileData.data };
  }
  const sliced = fileData.data.slice(headerIdx);
  // drop fully empty rows
  const cleaned = sliced.filter((row, idx) => {
    if (idx === 0) return true;
    return (row || []).some((c) => String(c ?? "").trim() !== "");
  });
  const headers = (cleaned[0] || []).map((h) => String(h ?? ""));
  return { ...fileData, headers, data: cleaned };
}

export function detectSourceKind(fileData: FileData): SourceKind {
  const name = fileData.name.toLowerCase();
  const headers = fileData.headers.map((h) => String(h ?? ""));
  const joined = headers.join("|");
  const nJoined = headers.map(normalizeHeader).join("|");

  if (
    name.includes("pdd-mall-bill") ||
    name.includes("bill-detail") ||
    name.includes("账务明细") ||
    (joined.includes("商户订单号") && joined.includes("账务类型"))
  ) {
    return "pdd_bill";
  }
  if (
    name.includes("orders_export") ||
    name.includes("订单") ||
    (joined.includes("订单号") && (joined.includes("商家实收") || joined.includes("用户实付")))
  ) {
    return "pdd_orders";
  }
  if (
    name.includes("商品资料") ||
    name.includes("product") ||
    (nJoined.includes("商品编码") && (nJoined.includes("规格编码") || nJoined.includes("规格名称")))
  ) {
    return "product_master";
  }
  // 仅识别分天推广（商品汇总细分分摊已停用）
  const hasAdSpendCol =
    joined.includes("总花费") ||
    joined.includes("成交花费") ||
    nJoined.includes("总花费") ||
    nJoined.includes("成交花费");
  const hasDateCol = joined.includes("日期") || nJoined.includes("日期");
  const isProductAdSummary =
    name.includes("汇总数据_商品") ||
    name.includes("汇总数据商品") ||
    (name.includes("商品推广") &&
      name.includes("汇总") &&
      name.includes("商品") &&
      !name.includes("分天"));
  if (isProductAdSummary) {
    return "ad_product";
  }
  // 有商品ID+花费、无日期列 → 也按商品推广汇总识别
  const hasProductIdCol =
    joined.includes("商品id") ||
    joined.includes("商品ID") ||
    nJoined.includes("商品id") ||
    nJoined.includes("商品ID");
  if (hasProductIdCol && hasAdSpendCol && !hasDateCol) {
    return "ad_product";
  }
  if (
    name.includes("分天数据") ||
    (name.includes("商品推广") && hasDateCol) ||
    (name.includes("推广") && hasDateCol && hasAdSpendCol) ||
    (hasDateCol && hasAdSpendCol) ||
    (joined.includes("成交花费") && joined.includes("交易额") && hasDateCol) ||
    (joined.includes("总花费") && joined.includes("实际投产比") && hasDateCol)
  ) {
    return "ad_daily";
  }
  return "unknown";
}

/** 统一订单时间单元格（Date / Excel序列号 / 字符串） */

export function parsePddOrders(fileData: FileData): PddOrder[] {
  const data = normalizeFileData(fileData);
  const h = data.headers;
  const idx = {
    product: findCol(h, ["商品"]),
    orderId: findCol(h, ["订单号"]),
    status: findCol(h, ["订单状态"]),
    goodsTotal: findCol(h, ["商品总价", "商品总额", "订单金额"]),
    shopDiscount: findCol(h, ["店铺优惠"]),
    platformDiscount: findCol(h, ["平台优惠"]),
    buyerPaid: findCol(h, ["用户实付", "实付金额"]),
    merchantReceived: findCol(h, ["商家实收", "实收金额"]),
    qty: findCol(h, ["商品数量", "数量"]),
    shipTime: findCol(h, ["发货时间"]),
    confirmTime: findCol(h, ["确认收货时间"]),
    productId: findColExactThen(h, [
      "商品id",
      "商品ID",
      "商品Id",
      "商品编号",
      "商品ID(必填)",
    ]),
    specName: findCol(h, ["商品规格", "规格名称", "规格"]),
    // 注意：不要用裸「商家编码」，会误匹配「商家编码-商品」
    merchantSku: findCol(h, ["商家编码-规格", "规格编码", "商家规格编码", "sku编码", "SKU编码"]),
    merchantSpu: findCol(h, ["商家编码-商品", "商品编码", "spu编码", "SPU编码"]),
    afterSale: findCol(h, ["售后状态"]),
    dealTime: findCol(h, ["订单成交时间", "成交时间", "下单时间"]),
    postage: findCol(h, ["邮费"]),
    expressNo: findCol(h, ["快递单号"]),
    expressCompany: findCol(h, ["快递公司"]),
  };

  return data.data.slice(1).map((row) => ({
    orderId: cell(row, idx.orderId),
    productName: cell(row, idx.product),
    status: cell(row, idx.status),
    afterSale: cell(row, idx.afterSale),
    qty: Math.max(1, Math.round(toNum(cell(row, idx.qty))) || 1),
    goodsTotal: toNum(cell(row, idx.goodsTotal)),
    buyerPaid: toNum(cell(row, idx.buyerPaid)),
    merchantReceived: toNum(cell(row, idx.merchantReceived)),
    platformDiscount: toNum(cell(row, idx.platformDiscount)),
    shopDiscount: toNum(cell(row, idx.shopDiscount)),
    productId: cellId(row, idx.productId),
    specName: cell(row, idx.specName),
    merchantSku: cell(row, idx.merchantSku),
    merchantSpu: cell(row, idx.merchantSpu),
    dealTime: cellTime(row, idx.dealTime),
    shipTime: cellTime(row, idx.shipTime),
    confirmTime: cellTime(row, idx.confirmTime),
    postage: toNum(cell(row, idx.postage)),
    expressNo: cell(row, idx.expressNo),
    expressCompany: cell(row, idx.expressCompany),
  })).filter((o) => o.orderId);
}

export function parsePddBillLines(fileData: FileData): PddBillLine[] {
  const data = normalizeFileData(fileData);
  const h = data.headers;
  const orderCol = findCol(h, ["商户订单号", "订单号"]);
  const timeCol = findCol(h, ["发生时间", "时间", "日期"]);
  const incomeCol = findCol(h, ["收入金额", "收入"]);
  const expenseCol = findCol(h, ["支出金额", "支出"]);
  const typeCol = findCol(h, ["账务类型", "类型"]);
  const remarkCol = findCol(h, ["备注"]);
  const bizCol = findCol(h, ["业务描述", "描述"]);

  return data.data.slice(1).map((row) => ({
    orderId: cell(row, orderCol),
    time: cell(row, timeCol),
    income: toNum(cell(row, incomeCol)),
    expense: Math.abs(toNum(cell(row, expenseCol))),
    billType: cell(row, typeCol),
    remark: cell(row, remarkCol),
    bizDesc: cell(row, bizCol),
  })).filter((l) => l.orderId || l.billType || l.income || l.expense);
}

function classifyBillLine(
  line: PddBillLine,
): "income" | "refund" | "tech" | "tech_refund" | "subsidy" | "ad" | "withdraw" | "other" {
  const t = `${line.billType}|${line.remark}|${line.bizDesc}`;
  // 推广/广告在账务里会再记一笔，经营分析只认推广日报，账务广告直接排除
  if (/推广|广告|点击成本|场景推广|全站推广|多多搜索|明星店铺|直播推广|商品推广/.test(t)) {
    return "ad";
  }
  // 提现=资金划出，不是经营支出；提现手续费仍算费用
  if (/提现/.test(t)) {
    if (/手续费|服务费|费率/.test(t)) return "other";
    return "withdraw";
  }
  if (/退款|退货|售后/.test(t)) return "refund";
  if (/技术服务费|基础技术服务费|服务费返还/.test(t)) {
    if (line.income > 0 || /返还|退回/.test(t)) return "tech_refund";
    return "tech";
  }
  if (/交易收入|订单收入|货款/.test(t)) return "income";
  if (/补贴|优惠券|奖励|返点|佣金返还|活动|满减/.test(t)) return "subsidy";
  if (/其他服务|扣款|罚款|违约|运费险|保险/.test(t)) return "other";
  return "other";
}

export function aggregatePddBill(lines: PddBillLine[]): {
  byOrder: Map<string, PddBillOrderAgg>;
  byType: Map<string, { income: number; expense: number; count: number }>;
  totals: {
    income: number;
    refund: number;
    techFee: number;
    techFeeRefund: number;
    otherFee: number;
    subsidy: number;
    /** 账务中的推广/广告扣费（已排除，不进毛利） */
    adExpense: number;
    /** 提现金额（资金划出，已排除，不进毛利/支出） */
    withdraw: number;
    net: number;
  };
} {
  const byOrder = new Map<string, PddBillOrderAgg>();
  const byType = new Map<string, { income: number; expense: number; count: number }>();
  const totals = {
    income: 0,
    refund: 0,
    techFee: 0,
    techFeeRefund: 0,
    otherFee: 0,
    subsidy: 0,
    adExpense: 0,
    withdraw: 0,
    net: 0,
  };

  for (const line of lines) {
    const typeKey = line.billType || "其他";
    const typeAgg = byType.get(typeKey) || { income: 0, expense: 0, count: 0 };
    typeAgg.income += line.income;
    typeAgg.expense += line.expense;
    typeAgg.count += 1;
    byType.set(typeKey, typeAgg);

    const orderId = line.orderId || "(无订单号)";
    const agg =
      byOrder.get(orderId) ||
      ({
        orderId,
        income: 0,
        refund: 0,
        techFee: 0,
        techFeeRefund: 0,
        otherFee: 0,
        subsidy: 0,
        net: 0,
        lines: 0,
      } as PddBillOrderAgg);

    const kind = classifyBillLine(line);
    if (kind === "income") {
      agg.income += line.income;
      totals.income += line.income;
    } else if (kind === "refund") {
      const amt = line.expense || line.income;
      agg.refund += amt;
      totals.refund += amt;
    } else if (kind === "tech") {
      const amt = line.expense || line.income;
      agg.techFee += amt;
      totals.techFee += amt;
    } else if (kind === "tech_refund") {
      const amt = line.income || line.expense;
      agg.techFeeRefund += amt;
      totals.techFeeRefund += amt;
    } else if (kind === "subsidy") {
      const amt = line.income - line.expense;
      agg.subsidy += amt;
      totals.subsidy += amt;
    } else if (kind === "ad") {
      // 不计入订单费用/毛利，只累计便于核对
      const amt = line.expense || line.income;
      totals.adExpense += amt;
    } else if (kind === "withdraw") {
      // 提现=钱拿出去，不是经营支出，不进 otherFee / 毛利
      const amt = line.expense || line.income;
      totals.withdraw += amt;
    } else {
      // other: net effect
      const net = line.income - line.expense;
      if (net < 0) {
        agg.otherFee += -net;
        totals.otherFee += -net;
      } else if (net > 0) {
        agg.subsidy += net;
        totals.subsidy += net;
      }
    }
    agg.lines += 1;
    byOrder.set(orderId, agg);
  }

  for (const agg of byOrder.values()) {
    const techNet = Math.max(0, agg.techFee - agg.techFeeRefund);
    agg.techFee = techNet;
    agg.net = agg.income - agg.refund - techNet - agg.otherFee + agg.subsidy;
  }
  const techNetTotal = Math.max(0, totals.techFee - totals.techFeeRefund);
  totals.techFee = techNetTotal;
  totals.net =
    totals.income - totals.refund - techNetTotal - totals.otherFee + totals.subsidy;

  return { byOrder, byType, totals };
}

export function billRecordFromPdd(fileData: FileData, lines: PddBillLine[]): BillRecord {
  const { byOrder, totals } = aggregatePddBill(lines);
  const times = lines.map((l) => l.time).filter(Boolean).sort();
  const period =
    times.length > 0
      ? `${String(times[0]).slice(0, 10)} ~ ${String(times[times.length - 1]).slice(0, 10)}`
      : "未知账期";

  // wide table for detail view
  const wideHeader = [
    "订单号",
    "交易收入",
    "退款",
    "技术服务费",
    "其他费用",
    "补贴",
    "账单净额",
    "流水行数",
  ];
  const wideRows = Array.from(byOrder.values()).map((o) => [
    o.orderId,
    o.income.toFixed(2),
    o.refund.toFixed(2),
    o.techFee.toFixed(2),
    o.otherFee.toFixed(2),
    o.subsidy.toFixed(2),
    o.net.toFixed(2),
    o.lines,
  ]);

  return {
    fileName: fileData.name,
    platform: "拼多多",
    date: period,
    totalAmount: totals.income,
    orderCount: byOrder.size,
    commission: 0,
    techFee: totals.techFee,
    subsidy: totals.subsidy,
    netAmount: totals.net,
    rawData: [wideHeader, ...wideRows],
  };
}

export function parseProductMaster(fileData: FileData): ProductSku[] {
  const data = normalizeFileData(fileData);
  const h = data.headers.map((x) => String(x ?? ""));
  const hNorm = h.map(normalizeHeader);

  const find = (keys: string[]) => {
    for (const k of keys) {
      const nk = normalizeHeader(k);
      let idx = hNorm.findIndex((x) => x.includes(nk) || nk.includes(x));
      if (idx >= 0) return idx;
      idx = h.findIndex((x) => String(x).includes(k));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const idx = {
    productCode: find(["商品编码"]),
    productName: find(["商品名称"]),
    skuCode: find(["规格编码", "必填规格编码"]),
    specName: find(["规格名称"]),
    salePrice: find(["参考售价"]),
    costPrice: find(["参考成本价", "成本价", "成本"]),
    packCost: find(["包材成本价", "包材"]),
    weightKg: find(["重量"]),
    stock: find(["可用库存", "库存"]),
  };

  return data.data
    .slice(1)
    .map((row) => ({
      productCode: cell(row, idx.productCode),
      productName: cell(row, idx.productName),
      skuCode: cell(row, idx.skuCode),
      specName: cell(row, idx.specName),
      salePrice: toNum(cell(row, idx.salePrice)),
      costPrice: toNum(cell(row, idx.costPrice)),
      packCost: toNum(cell(row, idx.packCost)),
      weightKg: toNum(cell(row, idx.weightKg)),
      stock: toNum(cell(row, idx.stock)),
    }))
    .filter((p) => p.productCode || p.skuCode || p.specName || p.productName);
}


/** 经营分析订单 → 表格（映射/收款对账共用） */
export function ordersToTable(orders: PddOrder[]): any[][] {
  return [
    [
      "订单号",
      "商品名称",
      "商品规格",
      "商家编码-规格",
      "商家实收",
      "商品总价",
      "数量",
      "订单状态",
      "店铺",
    ],
    ...orders.map((o) => [
      o.orderId,
      o.productName,
      o.specName,
      o.merchantSku || o.specName || "",
      Number(o.merchantReceived || 0),
      Number(o.goodsTotal || 0),
      Number(o.qty || 0),
      o.status || "",
      o.shopName || "",
    ]),
  ];
}

/** 收款对账：优先订单号，其次备注含单号，最后金额(+可选日期) */
export function reconcileOrderPayments(
  orderTable: any[][],
  paymentData: any[][],
  amountColHint: string[] = ["商家实收", "订单金额", "商品总价", "金额", "收款金额", "交易金额", "入账金额"],
): any[][] {
  if (!orderTable.length || !paymentData.length) return [];

  const orderHeaders = (orderTable[0] || []).map((h) => String(h ?? ""));
  const payHeaders = (paymentData[0] || []).map((h) => String(h ?? ""));

  const findIdx = (headers: string[], hints: string[]) => {
    for (const hint of hints) {
      const i = headers.findIndex((h) => h.toLowerCase().includes(hint.toLowerCase()));
      if (i >= 0) return i;
    }
    return -1;
  };

  const orderAmtIdx = findIdx(orderHeaders, amountColHint);
  const orderIdIdx = findIdx(orderHeaders, ["订单号", "商户订单号", "主订单号", "order id", "orderid"]);
  const nameIdx = findIdx(orderHeaders, ["商品名称", "商品", "品名"]);
  const orderDateIdx = findIdx(orderHeaders, ["成交时间", "确认时间", "发货时间", "日期", "时间"]);

  const payAmtIdx = findIdx(payHeaders, amountColHint);
  const payOrderIdx = findIdx(payHeaders, [
    "订单号",
    "商户订单号",
    "关联订单",
    "业务订单号",
    "原订单号",
    "order",
  ]);
  const payRemarkIdx = findIdx(payHeaders, [
    "备注",
    "摘要",
    "说明",
    "附言",
    "商品名称",
    "对方",
    "描述",
    "remark",
    "memo",
  ]);
  const payDateIdx = findIdx(payHeaders, ["发生时间", "交易时间", "入账时间", "日期", "时间", "记账时间"]);

  const parseAmount = (v: unknown): number => {
    const n = parseFloat(String(v ?? "").replace(/[¥$,，￥\s]/g, ""));
    return isNaN(n) ? 0 : n;
  };

  const rowAmount = (row: any[], preferredIdx: number) => {
    if (preferredIdx >= 0) {
      const n = parseAmount(row[preferredIdx]);
      if (n !== 0 || String(row[preferredIdx] ?? "").trim() !== "") return n;
    }
    for (const cell of row) {
      const n = parseAmount(cell);
      if (Math.abs(n) > 0) return n;
    }
    return 0;
  };

  const normalizeOrderId = (s: string) =>
    String(s || "")
      .trim()
      .replace(/[\s\-—_]/g, "")
      .toUpperCase();

  const extractIdsFromText = (text: string): string[] => {
    const s = String(text || "");
    const hits = new Set<string>();
    // 常见电商订单号：较长数字串 / 字母数字混合
    const re = /[A-Za-z0-9][A-Za-z0-9\-_]{8,}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      const id = normalizeOrderId(m[0]);
      if (id.length >= 8) hits.add(id);
    }
    return Array.from(hits);
  };

  const parseLooseDate = (v: unknown): number | null => {
    const s = String(v ?? "").trim();
    if (!s) return null;
    // 2026-07-20 10:11:12 / 2026/7/20
    const m = s.match(/(\d{4})[\/\-年.](\d{1,2})[\/\-月.](\d{1,2})/);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      if (!isNaN(d.getTime())) return d.getTime();
    }
    const t = Date.parse(s.replace(/年|月/g, "-").replace(/日/g, " "));
    return isNaN(t) ? null : t;
  };

  type PayItem = {
    row: any[];
    amount: number;
    orderId: string;
    remark: string;
    dateMs: number | null;
    used: boolean;
  };

  const payments: PayItem[] = paymentData.slice(1).map((row) => {
    const orderIdRaw =
      payOrderIdx >= 0 ? String(row[payOrderIdx] ?? "").trim() : "";
    const remarkParts: string[] = [];
    if (payRemarkIdx >= 0) remarkParts.push(String(row[payRemarkIdx] ?? ""));
    // 也拼整行文本，便于从备注/对方信息抠单号
    remarkParts.push(row.map((c) => String(c ?? "")).join(" "));
    const remark = remarkParts.join(" | ");
    return {
      row,
      amount: rowAmount(row, payAmtIdx),
      orderId: normalizeOrderId(orderIdRaw),
      remark,
      dateMs: payDateIdx >= 0 ? parseLooseDate(row[payDateIdx]) : null,
      used: false,
    };
  });

  const byOrderId = new Map<string, number[]>();
  payments.forEach((p, idx) => {
    if (!p.orderId) return;
    const list = byOrderId.get(p.orderId) || [];
    list.push(idx);
    byOrderId.set(p.orderId, list);
  });

  const DAY = 24 * 60 * 60 * 1000;
  const reconciled: any[][] = [
    [
      "订单号",
      "商品名称",
      "订单金额",
      "收款金额",
      "差额",
      "状态",
      "匹配方式",
      "说明",
      "收款摘要",
    ],
  ];

  const takePayment = (idx: number) => {
    payments[idx].used = true;
    return payments[idx];
  };

  for (const order of orderTable.slice(1)) {
    const oidRaw = orderIdIdx >= 0 ? String(order[orderIdIdx] ?? "").trim() : "";
    const oidNorm = normalizeOrderId(oidRaw);
    const name = nameIdx >= 0 ? String(order[nameIdx] ?? "") : "";
    const orderAmount = rowAmount(order, orderAmtIdx);
    if (!oidNorm && orderAmount === 0) continue;
    const orderDateMs =
      orderDateIdx >= 0 ? parseLooseDate(order[orderDateIdx]) : null;

    let hitIdx = -1;
    let method = "";
    let note = "";

    // 1) 订单号列精确匹配
    if (oidNorm && byOrderId.has(oidNorm)) {
      const cands = (byOrderId.get(oidNorm) || []).filter((i) => !payments[i].used);
      if (cands.length) {
        // 多条时优先金额接近
        cands.sort(
          (a, b) =>
            Math.abs(payments[a].amount - orderAmount) -
            Math.abs(payments[b].amount - orderAmount),
        );
        hitIdx = cands[0];
        method = "订单号";
        note = "订单号精确匹配";
      }
    }

    // 2) 收款备注/整行包含订单号
    if (hitIdx < 0 && oidNorm) {
      for (let i = 0; i < payments.length; i++) {
        if (payments[i].used) continue;
        const textIds = extractIdsFromText(payments[i].remark);
        if (
          payments[i].remark.includes(oidRaw) ||
          payments[i].remark.includes(oidNorm) ||
          textIds.includes(oidNorm)
        ) {
          hitIdx = i;
          method = "备注含单号";
          note = "从收款备注/摘要识别订单号";
          break;
        }
      }
    }

    // 3) 金额匹配（可选日期窗 ±3 天）
    if (hitIdx < 0 && Math.abs(orderAmount) > 0) {
      let best = -1;
      let bestScore = Number.POSITIVE_INFINITY;
      for (let i = 0; i < payments.length; i++) {
        if (payments[i].used) continue;
        if (Math.abs(payments[i].amount - orderAmount) >= 0.01) continue;
        let score = 0;
        if (orderDateMs != null && payments[i].dateMs != null) {
          const payDate = payments[i].dateMs as number;
          const diff = Math.abs(orderDateMs - payDate);
          if (diff > 3 * DAY) continue; // 超出 3 天不认
          score = diff;
        } else {
          score = 1e12; // 无日期时靠后
        }
        if (score < bestScore) {
          bestScore = score;
          best = i;
        }
      }
      if (best >= 0) {
        hitIdx = best;
        method = orderDateMs != null && payments[best].dateMs != null ? "金额+日期" : "仅金额";
        note =
          method === "金额+日期"
            ? "金额一致且日期接近(±3天)"
            : "仅金额一致（同金额多笔时可能不准）";
      }
    }

    if (hitIdx >= 0) {
      const pay = takePayment(hitIdx);
      const diff = Number((orderAmount - pay.amount).toFixed(2));
      const absDiff = Math.abs(diff);
      const status = absDiff < 0.01 ? "已核销" : "差额核销";
      reconciled.push([
        oidRaw,
        name,
        orderAmount,
        pay.amount,
        diff,
        status,
        method,
        note + (absDiff >= 0.01 ? `；差额 ${diff}` : ""),
        pay.remark.slice(0, 80),
      ]);
    } else {
      reconciled.push([
        oidRaw,
        name,
        orderAmount,
        "",
        orderAmount,
        "未匹配",
        "",
        "无对应收款记录",
        "",
      ]);
    }
  }

  for (const pay of payments) {
    if (pay.used) continue;
    const maybeIds = [
      pay.orderId,
      ...extractIdsFromText(pay.remark),
    ].filter(Boolean);
    reconciled.push([
      maybeIds[0] || "",
      "",
      "",
      pay.amount,
      pay.amount ? -pay.amount : "",
      "未认领",
      "",
      "无对应订单",
      pay.remark.slice(0, 80),
    ]);
  }
  return reconciled;
}

