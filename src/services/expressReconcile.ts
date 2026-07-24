/**
 * 快递对账：快递账单 vs 店铺发货订单，主键为运单号
 */
import type { FileData } from "../utils/excel";
import type { PddOrder } from "./pddBusiness";

export type ExpressMatchStatus =
  | "已匹配"
  | "仅快递账单有"
  | "仅发货未入账"
  | "其他快递"
  /** @deprecated 兼容旧结果，等同仅发货未入账 */
  | "仅店铺发货有";

export type ExpressFilter =
  | "all"
  | "matched"
  | "billOnly"
  | "shipOnly"
  | "otherExpress"
  | "unmatched"
  | "multi"
  | "highFee";

export interface CourierBillRow {
  waybill: string;
  bizTime: string;
  outlet: string;
  destProvince: string;
  destCity: string;
  weight: number;
  customer: string;
  faceFee: number;
  freight: number;
  surcharge: number;
  totalFee: number;
}

export interface ShipOrderRow {
  waybill: string;
  orderNo: string;
  shop: string;
  shipTime: string;
  region: string;
  productName: string;
  sku: string;
  productCode: string;
  qty: number;
  weight: number;
  totalPrice: number;
  received: number;
  express: string;
  remark: string;
  /** 同一运单在发货表出现的行数 */
  rowCount: number;
}

export interface ExpressReconcileRow {
  status: ExpressMatchStatus;
  waybill: string;
  orderNo: string;
  shop: string;
  shipTime: string;
  express: string;
  productName: string;
  sku: string;
  productCode: string;
  shipQty: number | null;
  shipWeight: number | null;
  billWeight: number | null;
  weightDiff: number | null;
  faceFee: number | null;
  freight: number | null;
  surcharge: number | null;
  totalFee: number | null;
  destProvince: string;
  destCity: string;
  shipRegion: string;
  billCustomer: string;
  billTime: string;
  outlet: string;
  shipDupCount: number;
  note: string;
}

export interface ExpressReconcileSummary {
  billCount: number;
  shipUniqueWaybills: number;
  shipRowCount: number;
  matched: number;
  billOnly: number;
  /** 同承运商：发货有、账单无 */
  shipOnly: number;
  /** 其他快递公司（不计入本账单缺口） */
  otherExpress: number;
  /** 真对不上 = 仅账单 + 仅发货未入账（不含其他快递） */
  unmatched: number;
  /** 账单推断承运商 */
  billCarrierLabel: string;
  shipSourceLabel: string;
  /** 多件运单数 */
  multiCount: number;
  /** 高运费运单数 */
  highFeeCount: number;
  highFeeThreshold: number;
  billFeeTotal: number;
  matchedFeeTotal: number;
  billOnlyFeeTotal: number;
  shipDupWaybills: number;
  avgBillFee: number;
  p90BillFee: number;
}

export interface ExpressReconcileResult {
  rows: ExpressReconcileRow[];
  summary: ExpressReconcileSummary;
  billName: string;
  shipName: string;
  highFeeThreshold: number;
}

/** 默认高运费阈值（元）：合计费用 >= 阈值列入「高运费」异常清单 */
export const DEFAULT_HIGH_FEE_THRESHOLD = 8;

export function isUnmatchedRow(r: ExpressReconcileRow): boolean {
  return (
    r.status === "仅快递账单有" ||
    r.status === "仅发货未入账" ||
    r.status === "仅店铺发货有"
  );
}

export function isOtherExpressRow(r: ExpressReconcileRow): boolean {
  return r.status === "其他快递";
}

export function isShipOnlyUnmatchedRow(r: ExpressReconcileRow): boolean {
  return r.status === "仅发货未入账" || r.status === "仅店铺发货有";
}

// ---------- 承运商识别：运单号前缀 + 快递公司名 ----------

export type CarrierCode =
  | "YTO"
  | "ZTO"
  | "STO"
  | "YD"
  | "SF"
  | "JT"
  | "EMS"
  | "YZ"
  | "DB"
  | "JD"
  | "OTHER"
  | "UNKNOWN";

const CARRIER_LABEL: Record<CarrierCode, string> = {
  YTO: "圆通",
  ZTO: "中通",
  STO: "申通",
  YD: "韵达",
  SF: "顺丰",
  JT: "极兔",
  EMS: "EMS",
  YZ: "邮政",
  DB: "德邦",
  JD: "京东",
  OTHER: "其他",
  UNKNOWN: "未知",
};

/** 发货侧「快递公司」名称匹配（优先于单号） */
const NAME_RULES: { code: CarrierCode; keys: string[] }[] = [
  { code: "YTO", keys: ["圆通", "YTO", "YUANTONG"] },
  { code: "ZTO", keys: ["中通", "ZTO", "ZHONGTONG"] },
  { code: "STO", keys: ["申通", "STO", "SHENTONG"] },
  { code: "YD", keys: ["韵达", "YUNDA", "YUN DA"] },
  { code: "SF", keys: ["顺丰", "SHUNFENG", "SF EXPRESS"] },
  { code: "JT", keys: ["极兔", "J&T", "JTEXPRESS", "JT EXPRESS"] },
  { code: "JD", keys: ["京东物流", "京东快递", "京东", "JD"] },
  { code: "DB", keys: ["德邦", "DEPPON"] },
  { code: "EMS", keys: ["EMS"] },
  { code: "YZ", keys: ["邮政快递", "邮政包裹", "中国邮政", "邮政"] },
];

/**
 * 运单号前缀识别（仅可靠字母前缀）。
 * 中通/申通/韵达等多为纯数字，不靠单号猜，避免误判。
 */
export function detectCarrierFromWaybill(waybill: string): CarrierCode {
  const w = normWaybill(waybill);
  if (!w) return "UNKNOWN";
  if (/^YT/i.test(w)) return "YTO";
  if (/^SF/i.test(w)) return "SF";
  if (/^JT/i.test(w)) return "JT";
  if (/^JD/i.test(w)) return "JD";
  return "UNKNOWN";
}

export function detectCarrierFromName(name: string): CarrierCode {
  const s = String(name || "").trim().toUpperCase();
  if (!s) return "UNKNOWN";
  for (const rule of NAME_RULES) {
    for (const k of rule.keys) {
      if (s.includes(k.toUpperCase()) || String(name).includes(k)) return rule.code;
    }
  }
  return "UNKNOWN";
}

export function carrierLabel(code: CarrierCode): string {
  return CARRIER_LABEL[code] || "未知";
}

/**
 * 推断本账承运商：
 * 1) 账单运单可靠前缀众数（圆通/顺丰/极兔/京东）
 * 2) 不够时：用「账单∩发货」已匹配运单的发货公司名众数（中通/申通等账单靠这个）
 */
export function inferBillCarrier(
  bills: CourierBillRow[],
  ships?: ShipOrderRow[],
): {
  code: CarrierCode;
  label: string;
  source: "waybill_prefix" | "ship_name" | "unknown";
} {
  const pickBest = (counts: Map<CarrierCode, number>): CarrierCode => {
    let best: CarrierCode = "UNKNOWN";
    let bestN = 0;
    for (const [c, n] of counts) {
      if (n > bestN) {
        best = c;
        bestN = n;
      }
    }
    return bestN > 0 ? best : "UNKNOWN";
  };

  const prefixCounts = new Map<CarrierCode, number>();
  for (const b of bills) {
    const c = detectCarrierFromWaybill(b.waybill);
    if (c === "UNKNOWN") continue;
    prefixCounts.set(c, (prefixCounts.get(c) || 0) + 1);
  }
  const byPrefix = pickBest(prefixCounts);
  // 前缀命中足够多（≥10 或 ≥账单 5%）才信，避免零星误码
  const billN = bills.length || 1;
  const prefixN = prefixCounts.get(byPrefix) || 0;
  if (byPrefix !== "UNKNOWN" && (prefixN >= 10 || prefixN / billN >= 0.05)) {
    return {
      code: byPrefix,
      label: carrierLabel(byPrefix),
      source: "waybill_prefix",
    };
  }

  if (ships?.length) {
    const shipMap = new Map(ships.map((s) => [s.waybill, s]));
    const nameCounts = new Map<CarrierCode, number>();
    for (const b of bills) {
      const s = shipMap.get(b.waybill);
      if (!s) continue;
      const c = resolveShipCarrier(s);
      if (c === "UNKNOWN") continue;
      nameCounts.set(c, (nameCounts.get(c) || 0) + 1);
    }
    const byShip = pickBest(nameCounts);
    if (byShip !== "UNKNOWN") {
      return {
        code: byShip,
        label: carrierLabel(byShip),
        source: "ship_name",
      };
    }
  }

  if (byPrefix !== "UNKNOWN") {
    return {
      code: byPrefix,
      label: carrierLabel(byPrefix),
      source: "waybill_prefix",
    };
  }
  return { code: "UNKNOWN", label: "未知", source: "unknown" };
}

/** 发货侧承运商：只从「快递公司」名称提取，不猜运单号 */
export function resolveShipCarrier(ship: ShipOrderRow): CarrierCode {
  return detectCarrierFromName(ship.express);
}

export function isSameCarrierFamily(
  shipCarrier: CarrierCode,
  billCarrier: CarrierCode,
): boolean {
  if (billCarrier === "UNKNOWN" || shipCarrier === "UNKNOWN") return true; // 无法判断时不归入「其他快递」
  return shipCarrier === billCarrier;
}

/** 多件：发货数量>1，或同一运单在发货表多行合并 */
export function isMultiPieceRow(r: ExpressReconcileRow): boolean {
  const qty = r.shipQty ?? 0;
  return qty > 1 || (r.shipDupCount ?? 0) > 1;
}

export function isHighFeeRow(
  r: ExpressReconcileRow,
  threshold: number = DEFAULT_HIGH_FEE_THRESHOLD,
): boolean {
  return r.totalFee != null && Number.isFinite(r.totalFee) && r.totalFee >= threshold;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function feeStats(rows: ExpressReconcileRow[]): { avg: number; p90: number } {
  const fees = rows
    .map((r) => r.totalFee)
    .filter((n): n is number => n != null && Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  if (!fees.length) return { avg: 0, p90: 0 };
  const avg = fees.reduce((s, n) => s + n, 0) / fees.length;
  return {
    avg: Math.round(avg * 100) / 100,
    p90: Math.round(percentile(fees, 0.9) * 100) / 100,
  };
}

export function anomalyReason(
  r: ExpressReconcileRow,
  threshold: number,
): string {
  const parts: string[] = [];
  if (isOtherExpressRow(r)) parts.push("其他快递");
  else if (isUnmatchedRow(r)) parts.push(r.status);
  if (isMultiPieceRow(r)) {
    if ((r.shipDupCount ?? 0) > 1) parts.push(`同运单${r.shipDupCount}行`);
    if ((r.shipQty ?? 0) > 1) parts.push(`数量${r.shipQty}`);
  }
  if (isHighFeeRow(r, threshold)) parts.push(`高运费≥${threshold}`);
  if (r.weightDiff != null && Math.abs(r.weightDiff) >= 0.2) {
    parts.push(`重量差${r.weightDiff > 0 ? "+" : ""}${r.weightDiff}kg`);
  }
  return parts.join("；") || r.note;
}


function normWaybill(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/[\s\u00a0]/g, "")
    .toUpperCase();
}

function parseNum(raw: unknown): number {
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const s = String(raw)
    .replace(/[￥¥$,，\s]/g, "")
    .replace(/[^\d.\-]/g, "");
  if (!s) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function cell(row: any[], idx: number): string {
  if (idx < 0) return "";
  const v = row[idx];
  if (v == null) return "";
  return String(v).trim();
}

function findCol(headers: string[], names: string[]): number {
  const hs = headers.map((h) => String(h || "").trim());
  for (const name of names) {
    const exact = hs.findIndex((h) => h === name);
    if (exact >= 0) return exact;
  }
  for (const name of names) {
    const partial = hs.findIndex((h) => h.includes(name));
    if (partial >= 0) return partial;
  }
  return -1;
}

function isEmptyRow(row: any[]): boolean {
  return !(row || []).some((c) => String(c ?? "").trim() !== "");
}

/** 解析快递账单明细（运单号 + 费用） */
export function parseCourierBill(data: any[][]): CourierBillRow[] {
  if (!data?.length) return [];
  const headers = (data[0] || []).map((h) => String(h || ""));
  const iWaybill = findCol(headers, ["运单号", "运单编号", "快递单号", "面单号"]);
  if (iWaybill < 0) {
    throw new Error("快递账单缺少「运单号」列，请确认导入的是明细表而非汇总表");
  }
  const iBiz = findCol(headers, ["业务时间", "扫描时间", "揽收时间", "时间"]);
  const iOutlet = findCol(headers, ["所属网点", "网点"]);
  const iProv = findCol(headers, ["目的省份", "目的省", "省份"]);
  const iCity = findCol(headers, ["目的城市", "目的市", "城市"]);
  const iWeight = findCol(headers, ["网点称重", "称重", "计费重量", "重量"]);
  const iCust = findCol(headers, ["订单客户", "客户", "商家", "店铺"]);
  const iFace = findCol(headers, ["面单费用", "面单费", "面单"]);
  const iFreight = findCol(headers, ["运费", "快递费"]);
  const iExtra = findCol(headers, ["加收费用", "加收", "附加费"]);
  const iTotal = findCol(headers, ["合计费用", "合计", "总费用", "费用合计"]);

  const out: CourierBillRow[] = [];
  const seen = new Map<string, number>();

  for (let r = 1; r < data.length; r++) {
    const row = data[r] || [];
    if (isEmptyRow(row)) continue;
    const waybill = normWaybill(row[iWaybill]);
    if (!waybill) continue;

    const item: CourierBillRow = {
      waybill,
      bizTime: cell(row, iBiz),
      outlet: cell(row, iOutlet),
      destProvince: cell(row, iProv),
      destCity: cell(row, iCity),
      weight: parseNum(row[iWeight]),
      customer: cell(row, iCust),
      faceFee: parseNum(row[iFace]),
      freight: parseNum(row[iFreight]),
      surcharge: parseNum(row[iExtra]),
      totalFee:
        iTotal >= 0
          ? parseNum(row[iTotal])
          : parseNum(row[iFreight]) + parseNum(row[iFace]) + parseNum(row[iExtra]),
    };

    const prev = seen.get(waybill);
    if (prev != null) {
      // 同运单多行：累加费用与重量
      const old = out[prev];
      old.weight += item.weight;
      old.faceFee += item.faceFee;
      old.freight += item.freight;
      old.surcharge += item.surcharge;
      old.totalFee += item.totalFee;
      if (!old.bizTime) old.bizTime = item.bizTime;
    } else {
      seen.set(waybill, out.length);
      out.push(item);
    }
  }
  return out;
}

/** 解析店铺发货订单 */
export function parseShipOrders(data: any[][]): ShipOrderRow[] {
  if (!data?.length) return [];
  const headers = (data[0] || []).map((h) => String(h || ""));
  const iWaybill = findCol(headers, ["运单号", "快递单号", "物流单号"]);
  if (iWaybill < 0) {
    throw new Error("发货订单缺少「运单号」列");
  }
  const iOrder = findCol(headers, ["订单号", "平台订单号", "原始订单号"]);
  const iShop = findCol(headers, ["店铺名称", "店铺", "店名"]);
  const iShipTime = findCol(headers, ["发货时间", "出库时间", "打印时间"]);
  const iRegion = findCol(headers, ["省/市/区", "收货地区", "地区", "省市区"]);
  const iName = findCol(headers, ["商品名称", "品名", "宝贝名称"]);
  const iSku = findCol(headers, ["规格名称", "规格", "SKU名称"]);
  const iCode = findCol(headers, ["规格编码", "商品编码", "商家编码", "SKU编码"]);
  const iQty = findCol(headers, ["数量", "商品数量"]);
  const iWeight = findCol(headers, ["重量（kg）", "重量(kg)", "重量", "包裹重量"]);
  const iPrice = findCol(headers, ["总价", "商品总价", "成交金额"]);
  const iRecv = findCol(headers, ["实收", "商家实收", "实付"]);
  const iExpress = findCol(headers, [
    "快递公司",
    "物流公司",
    "承运商",
    "快递名称",
    "物流名称",
    "快递",
  ]);
  const iRemark = findCol(headers, ["备注", "买家留言"]);

  // 先按运单聚合
  const map = new Map<string, ShipOrderRow>();

  for (let r = 1; r < data.length; r++) {
    const row = data[r] || [];
    if (isEmptyRow(row)) continue;
    const waybill = normWaybill(row[iWaybill]);
    if (!waybill) continue;

    const piece: ShipOrderRow = {
      waybill,
      orderNo: cell(row, iOrder),
      shop: cell(row, iShop),
      shipTime: cell(row, iShipTime),
      region: cell(row, iRegion),
      productName: cell(row, iName),
      sku: cell(row, iSku),
      productCode: cell(row, iCode),
      qty: parseNum(row[iQty]) || 1,
      weight: parseNum(row[iWeight]),
      totalPrice: parseNum(row[iPrice]),
      received: parseNum(row[iRecv]),
      express: cell(row, iExpress),
      remark: cell(row, iRemark),
      rowCount: 1,
    };

    const exist = map.get(waybill);
    if (!exist) {
      map.set(waybill, piece);
      continue;
    }
    exist.rowCount += 1;
    exist.qty += piece.qty;
    exist.weight += piece.weight;
    exist.totalPrice += piece.totalPrice;
    exist.received += piece.received;
    if (piece.productName && !exist.productName.includes(piece.productName)) {
      exist.productName = exist.productName
        ? `${exist.productName} | ${piece.productName}`
        : piece.productName;
    }
    if (piece.sku && !exist.sku.includes(piece.sku)) {
      exist.sku = exist.sku ? `${exist.sku} | ${piece.sku}` : piece.sku;
    }
    if (piece.productCode && !exist.productCode.includes(piece.productCode)) {
      exist.productCode = exist.productCode
        ? `${exist.productCode} | ${piece.productCode}`
        : piece.productCode;
    }
    if (piece.orderNo && !exist.orderNo.includes(piece.orderNo)) {
      exist.orderNo = exist.orderNo
        ? `${exist.orderNo},${piece.orderNo}`
        : piece.orderNo;
    }
    if (!exist.shipTime && piece.shipTime) exist.shipTime = piece.shipTime;
    if (!exist.express && piece.express) exist.express = piece.express;
    if (!exist.shop && piece.shop) exist.shop = piece.shop;
    if (!exist.region && piece.region) exist.region = piece.region;
  }

  return Array.from(map.values());
}

/** 经营分析订单 → 发货侧运单（有运单号才参与） */
export function shipOrdersFromPddOrders(orders: PddOrder[]): ShipOrderRow[] {
  const map = new Map<string, ShipOrderRow>();
  for (const o of orders || []) {
    const waybill = normWaybill(o.expressNo);
    if (!waybill) continue;
    const piece: ShipOrderRow = {
      waybill,
      orderNo: o.orderId || "",
      shop: o.shopName || "",
      shipTime: o.shipTime || o.dealTime || "",
      region: "",
      productName: o.productName || "",
      sku: o.specName || "",
      productCode: o.merchantSku || o.merchantSpu || "",
      qty: o.qty || 1,
      weight: 0,
      totalPrice: o.goodsTotal || 0,
      received: o.merchantReceived || 0,
      express: o.expressCompany || "",
      remark: "",
      rowCount: 1,
    };
    const exist = map.get(waybill);
    if (!exist) {
      map.set(waybill, piece);
      continue;
    }
    exist.rowCount += 1;
    exist.qty += piece.qty;
    exist.totalPrice += piece.totalPrice;
    exist.received += piece.received;
    if (piece.orderNo && !exist.orderNo.includes(piece.orderNo)) {
      exist.orderNo = exist.orderNo ? `${exist.orderNo},${piece.orderNo}` : piece.orderNo;
    }
    if (piece.productName && !exist.productName.includes(piece.productName)) {
      exist.productName = exist.productName
        ? `${exist.productName} | ${piece.productName}`
        : piece.productName;
    }
    if (!exist.express && piece.express) exist.express = piece.express;
    if (!exist.shop && piece.shop) exist.shop = piece.shop;
    if (!exist.shipTime && piece.shipTime) exist.shipTime = piece.shipTime;
  }
  return Array.from(map.values());
}

/** 合并多来源发货运单（发货表优先补全字段，订单补缺口） */
export function mergeShipSources(parts: ShipOrderRow[][]): ShipOrderRow[] {
  const map = new Map<string, ShipOrderRow>();
  for (const list of parts) {
    for (const s of list) {
      const prev = map.get(s.waybill);
      if (!prev) {
        map.set(s.waybill, { ...s });
        continue;
      }
      map.set(s.waybill, {
        ...prev,
        orderNo: prev.orderNo || s.orderNo,
        shop: prev.shop || s.shop,
        shipTime: prev.shipTime || s.shipTime,
        region: prev.region || s.region,
        productName: prev.productName || s.productName,
        sku: prev.sku || s.sku,
        productCode: prev.productCode || s.productCode,
        qty: Math.max(prev.qty || 0, s.qty || 0) || prev.qty || s.qty,
        weight: prev.weight || s.weight,
        totalPrice: prev.totalPrice || s.totalPrice,
        received: prev.received || s.received,
        express: prev.express || s.express,
        remark: prev.remark || s.remark,
        rowCount: (prev.rowCount || 1) + (s.rowCount > 1 ? s.rowCount - 1 : 0),
      });
    }
  }
  return Array.from(map.values());
}

export function reconcileExpress(
  bills: CourierBillRow[],
  ships: ShipOrderRow[],
  meta?: {
    billName?: string;
    shipName?: string;
    highFeeThreshold?: number;
    shipSourceLabel?: string;
  },
): ExpressReconcileResult {
  const highFeeThreshold =
    meta?.highFeeThreshold != null && Number.isFinite(meta.highFeeThreshold)
      ? meta.highFeeThreshold
      : DEFAULT_HIGH_FEE_THRESHOLD;
  const billCarrier = inferBillCarrier(bills, ships);
  const billMap = new Map(bills.map((b) => [b.waybill, b]));
  const shipMap = new Map(ships.map((s) => [s.waybill, s]));
  const allWaybills = new Set<string>([...billMap.keys(), ...shipMap.keys()]);
  const rows: ExpressReconcileRow[] = [];

  for (const wb of allWaybills) {
    const b = billMap.get(wb);
    const s = shipMap.get(wb);
    if (b && s) {
      const weightDiff =
        Number.isFinite(b.weight) && Number.isFinite(s.weight)
          ? Math.round((b.weight - s.weight) * 1000) / 1000
          : null;
      const notes: string[] = [];
      if (s.rowCount > 1) notes.push(`发货表同运单${s.rowCount}行已合并`);
      if (weightDiff != null && Math.abs(weightDiff) >= 0.05) {
        notes.push(`重量差${weightDiff > 0 ? "+" : ""}${weightDiff}kg`);
      }
      rows.push({
        status: "已匹配",
        waybill: wb,
        orderNo: s.orderNo,
        shop: s.shop,
        shipTime: s.shipTime,
        express: s.express,
        productName: s.productName,
        sku: s.sku,
        productCode: s.productCode,
        shipQty: s.qty,
        shipWeight: s.weight,
        billWeight: b.weight,
        weightDiff,
        faceFee: b.faceFee,
        freight: b.freight,
        surcharge: b.surcharge,
        totalFee: b.totalFee,
        destProvince: b.destProvince,
        destCity: b.destCity,
        shipRegion: s.region,
        billCustomer: b.customer,
        billTime: b.bizTime,
        outlet: b.outlet,
        shipDupCount: s.rowCount,
        note: notes.join("；"),
      });
    } else if (b) {
      rows.push({
        status: "仅快递账单有",
        waybill: wb,
        orderNo: "",
        shop: "",
        shipTime: "",
        express: "",
        productName: "",
        sku: "",
        productCode: "",
        shipQty: null,
        shipWeight: null,
        billWeight: b.weight,
        weightDiff: null,
        faceFee: b.faceFee,
        freight: b.freight,
        surcharge: b.surcharge,
        totalFee: b.totalFee,
        destProvince: b.destProvince,
        destCity: b.destCity,
        shipRegion: "",
        billCustomer: b.customer,
        billTime: b.bizTime,
        outlet: b.outlet,
        shipDupCount: 0,
        note: "店铺发货表中无此运单（可能未导出发货/其他店铺/其他时段）",
      });
    } else if (s) {
      const shipCarrier = resolveShipCarrier(s);
      const other =
        billCarrier.code !== "UNKNOWN" &&
        shipCarrier !== "UNKNOWN" &&
        shipCarrier !== billCarrier.code;
      const notes: string[] = [];
      if (s.rowCount > 1) notes.push(`同运单${s.rowCount}行已合并`);
      if (other) {
        notes.push(
          `发货快递「${s.express || carrierLabel(shipCarrier)}」≠ 账单承运商「${billCarrier.label}」，不计入本账缺口`,
        );
      } else {
        notes.push(
          billCarrier.label !== "未知"
            ? `账单（${billCarrier.label}）中无此运单：可能未入账/时段外/漏扫`
            : "快递账单中无此运单：可能未入账/其他时段",
        );
        if (!String(s.express || "").trim()) {
          notes.push("发货侧无快递公司名称，无法判断是否其他快递");
        }
      }
      rows.push({
        status: other ? "其他快递" : "仅发货未入账",
        waybill: wb,
        orderNo: s.orderNo,
        shop: s.shop,
        shipTime: s.shipTime,
        express: s.express || (shipCarrier !== "UNKNOWN" ? carrierLabel(shipCarrier) : ""),
        productName: s.productName,
        sku: s.sku,
        productCode: s.productCode,
        shipQty: s.qty,
        shipWeight: s.weight,
        billWeight: null,
        weightDiff: null,
        faceFee: null,
        freight: null,
        surcharge: null,
        totalFee: null,
        destProvince: "",
        destCity: "",
        shipRegion: s.region,
        billCustomer: "",
        billTime: "",
        outlet: "",
        shipDupCount: s.rowCount,
        note: notes.join("；"),
      });
    }
  }

  const matched = rows.filter((r) => r.status === "已匹配");
  const billOnly = rows.filter((r) => r.status === "仅快递账单有");
  const shipOnly = rows.filter(isShipOnlyUnmatchedRow);
  const otherExpressRows = rows.filter(isOtherExpressRow);
  const sumFee = (list: ExpressReconcileRow[]) =>
    list.reduce((s, r) => s + (r.totalFee || 0), 0);

  const unmatchedRows = rows.filter(isUnmatchedRow);
  const multiRows = rows.filter(isMultiPieceRow);
  const highFeeRows = rows.filter((r) => isHighFeeRow(r, highFeeThreshold));
  // 有账单费用的行做均价/P90，便于判断阈值是否合理
  const withFee = rows.filter(
    (r) => r.totalFee != null && Number.isFinite(r.totalFee) && (r.totalFee as number) > 0,
  );
  const stats = feeStats(withFee);

  const summary: ExpressReconcileSummary = {
    billCount: bills.length,
    shipUniqueWaybills: ships.length,
    shipRowCount: ships.reduce((s, x) => s + x.rowCount, 0),
    matched: matched.length,
    billOnly: billOnly.length,
    shipOnly: shipOnly.length,
    otherExpress: otherExpressRows.length,
    unmatched: unmatchedRows.length,
    multiCount: multiRows.length,
    highFeeCount: highFeeRows.length,
    highFeeThreshold,
    billCarrierLabel: billCarrier.label,
    shipSourceLabel: meta?.shipSourceLabel || meta?.shipName || "",
    billFeeTotal: bills.reduce((s, b) => s + (b.totalFee || 0), 0),
    matchedFeeTotal: sumFee(matched),
    billOnlyFeeTotal: sumFee(billOnly),
    shipDupWaybills: ships.filter((s) => s.rowCount > 1).length,
    avgBillFee: stats.avg,
    p90BillFee: stats.p90,
  };

  // 异常优先：对不上 → 高运费 → 多件 → 已匹配；同组内高费用优先
  const rank = (r: ExpressReconcileRow): number => {
    if (isUnmatchedRow(r)) return 0;
    if (isOtherExpressRow(r)) return 1;
    if (isHighFeeRow(r, highFeeThreshold)) return 2;
    if (isMultiPieceRow(r)) return 3;
    return 4;
  };
  rows.sort((a, b) => {
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    const fa = a.totalFee ?? -1;
    const fb = b.totalFee ?? -1;
    if (fb !== fa) return fb - fa;
    return a.waybill.localeCompare(b.waybill);
  });

  return {
    rows,
    summary,
    billName: meta?.billName || "",
    shipName: meta?.shipName || "",
    highFeeThreshold,
  };
}

export function parseAndReconcile(
  billFile: FileData,
  shipFile: FileData | null,
  options?: {
    highFeeThreshold?: number;
    opOrders?: PddOrder[];
  },
): ExpressReconcileResult {
  const bills = parseCourierBill(billFile.data);
  if (!bills.length) throw new Error("快递账单未解析到有效运单");

  const parts: ShipOrderRow[][] = [];
  const labels: string[] = [];
  if (shipFile?.data?.length) {
    parts.push(parseShipOrders(shipFile.data));
    labels.push(shipFile.name || "发货订单");
  }
  if (options?.opOrders?.length) {
    const fromOrders = shipOrdersFromPddOrders(options.opOrders);
    if (fromOrders.length) {
      parts.push(fromOrders);
      labels.push(`经营分析订单(${fromOrders.length}运单)`);
    }
  }
  if (!parts.length) {
    throw new Error("请导入发货订单，或先在经营分析导入含运单号的订单");
  }
  const ships = mergeShipSources(parts);
  if (!ships.length) throw new Error("发货侧未解析到有效运单号");

  return reconcileExpress(bills, ships, {
    billName: billFile.name,
    shipName: labels.join(" + "),
    shipSourceLabel: labels.join(" + "),
    highFeeThreshold: options?.highFeeThreshold,
  });
}

function money(n: number | null | undefined): string | number {
  if (n == null || !Number.isFinite(n)) return "";
  return Math.round(n * 100) / 100;
}

function numOrEmpty(n: number | null | undefined): string | number {
  if (n == null || !Number.isFinite(n)) return "";
  return n;
}

export const EXPRESS_DETAIL_HEADERS = [
  "对账状态",
  "运单号",
  "订单号",
  "店铺",
  "发货时间",
  "快递公司",
  "商品名称",
  "规格",
  "规格/商品编码",
  "发货数量",
  "发货重量kg",
  "账单重量kg",
  "重量差kg",
  "面单费",
  "运费",
  "加收费",
  "合计费用",
  "目的省",
  "目的市",
  "收件地区",
  "账单客户",
  "业务时间",
  "所属网点",
  "发货同行数",
  "备注",
] as const;

export function rowToArray(r: ExpressReconcileRow): (string | number)[] {
  return [
    r.status,
    r.waybill,
    r.orderNo,
    r.shop,
    r.shipTime,
    r.express,
    r.productName,
    r.sku,
    r.productCode,
    numOrEmpty(r.shipQty),
    numOrEmpty(r.shipWeight),
    numOrEmpty(r.billWeight),
    numOrEmpty(r.weightDiff),
    money(r.faceFee),
    money(r.freight),
    money(r.surcharge),
    money(r.totalFee),
    r.destProvince,
    r.destCity,
    r.shipRegion,
    r.billCustomer,
    r.billTime,
    r.outlet,
    r.shipDupCount || "",
    r.note,
  ];
}

export function filterExpressRows(
  rows: ExpressReconcileRow[],
  filter: ExpressFilter,
  highFeeThreshold: number = DEFAULT_HIGH_FEE_THRESHOLD,
): ExpressReconcileRow[] {
  if (filter === "matched") return rows.filter((r) => r.status === "已匹配");
  if (filter === "billOnly") return rows.filter((r) => r.status === "仅快递账单有");
  if (filter === "shipOnly") return rows.filter(isShipOnlyUnmatchedRow);
  if (filter === "otherExpress") return rows.filter(isOtherExpressRow);
  if (filter === "unmatched") return rows.filter(isUnmatchedRow);
  if (filter === "multi") {
    return rows
      .filter(isMultiPieceRow)
      .sort((a, b) => (b.shipQty ?? 0) - (a.shipQty ?? 0) || (b.totalFee ?? 0) - (a.totalFee ?? 0));
  }
  if (filter === "highFee") {
    return rows
      .filter((r) => isHighFeeRow(r, highFeeThreshold))
      .sort((a, b) => (b.totalFee ?? 0) - (a.totalFee ?? 0));
  }
  return rows;
}

const ANOMALY_HEADERS = ["异常类型", ...EXPRESS_DETAIL_HEADERS] as const;

export function resultToTable(
  rows: ExpressReconcileRow[],
  filter: ExpressFilter = "all",
  highFeeThreshold: number = DEFAULT_HIGH_FEE_THRESHOLD,
): any[][] {
  const list = filterExpressRows(rows, filter, highFeeThreshold);
  const isAnomalyView =
    filter === "unmatched" ||
    filter === "otherExpress" ||
    filter === "multi" ||
    filter === "highFee";
  if (isAnomalyView) {
    return [
      [...ANOMALY_HEADERS],
      ...list.map((r) => [anomalyReason(r, highFeeThreshold), ...rowToArray(r)]),
    ];
  }
  return [[...EXPRESS_DETAIL_HEADERS], ...list.map(rowToArray)];
}


// ---------- 可视化 / 汇总分析 ----------

export interface ExpressFeeBucket {
  label: string;
  min: number;
  max: number; // exclusive; Infinity ok
  count: number;
  feeSum: number;
}

export interface ExpressProvinceStat {
  province: string;
  count: number;
  feeSum: number;
  avgFee: number;
}

export interface ExpressVizData {
  matchPie: { key: string; label: string; count: number; color: string }[];
  anomalyBars: { key: string; label: string; count: number; color: string }[];
  feeBuckets: ExpressFeeBucket[];
  topProvinces: ExpressProvinceStat[];
  multiVsSingle: { multi: number; single: number; multiFee: number; singleFee: number };
  feeTotal: number;
  matchRate: number; // 0-1, based on bill waybills
}

const FEE_BUCKET_DEFS: { label: string; min: number; max: number }[] = [
  { label: "0–2元", min: 0, max: 2 },
  { label: "2–4元", min: 2, max: 4 },
  { label: "4–6元", min: 4, max: 6 },
  { label: "6–8元", min: 6, max: 8 },
  { label: "8–12元", min: 8, max: 12 },
  { label: "12–20元", min: 12, max: 20 },
  { label: "20元+", min: 20, max: Infinity },
];

export function buildExpressViz(
  result: ExpressReconcileResult,
  highFeeThreshold?: number,
): ExpressVizData {
  const thr =
    highFeeThreshold ??
    result.highFeeThreshold ??
    result.summary.highFeeThreshold ??
    DEFAULT_HIGH_FEE_THRESHOLD;
  const rows = result.rows;
  const s = result.summary;

  const matchPie = [
    { key: "matched", label: "已匹配", count: s.matched, color: "#10b981" },
    { key: "billOnly", label: "仅账单", count: s.billOnly, color: "#f59e0b" },
    { key: "shipOnly", label: "仅发货未入账", count: s.shipOnly, color: "#f43f5e" },
    { key: "otherExpress", label: "其他快递", count: s.otherExpress, color: "#94a3b8" },
  ];

  const highN = rows.filter((r) => isHighFeeRow(r, thr)).length;
  const anomalyBars = [
    { key: "unmatched", label: "真对不上", count: s.unmatched, color: "#e11d48" },
    { key: "otherExpress", label: "其他快递", count: s.otherExpress, color: "#64748b" },
    { key: "multi", label: "多件", count: s.multiCount, color: "#d97706" },
    { key: "highFee", label: "高运费", count: highN, color: "#7c3aed" },
  ];

  const feeBuckets: ExpressFeeBucket[] = FEE_BUCKET_DEFS.map((d) => ({
    ...d,
    count: 0,
    feeSum: 0,
  }));
  let feeTotal = 0;
  for (const r of rows) {
    const fee = r.totalFee;
    if (fee == null || !Number.isFinite(fee) || fee < 0) continue;
    feeTotal += fee;
    const b = feeBuckets.find((x) => fee >= x.min && fee < x.max) || feeBuckets[feeBuckets.length - 1];
    b.count += 1;
    b.feeSum += fee;
  }

  const provMap = new Map<string, { count: number; feeSum: number }>();
  for (const r of rows) {
    if (r.totalFee == null || !Number.isFinite(r.totalFee)) continue;
    const p = (r.destProvince || "未知").trim() || "未知";
    const cur = provMap.get(p) || { count: 0, feeSum: 0 };
    cur.count += 1;
    cur.feeSum += r.totalFee;
    provMap.set(p, cur);
  }
  const topProvinces: ExpressProvinceStat[] = Array.from(provMap.entries())
    .map(([province, v]) => ({
      province,
      count: v.count,
      feeSum: Math.round(v.feeSum * 100) / 100,
      avgFee: v.count ? Math.round((v.feeSum / v.count) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.feeSum - a.feeSum)
    .slice(0, 10);

  let multi = 0;
  let single = 0;
  let multiFee = 0;
  let singleFee = 0;
  for (const r of rows) {
    const fee = r.totalFee ?? 0;
    if (isMultiPieceRow(r)) {
      multi += 1;
      multiFee += fee;
    } else if (r.status === "已匹配" || r.status === "仅快递账单有") {
      // 有账单侧意义的「单件」
      if (r.totalFee != null) {
        single += 1;
        singleFee += fee;
      } else if (r.status === "已匹配") {
        single += 1;
      }
    } else if (r.status === "仅店铺发货有" && !isMultiPieceRow(r)) {
      single += 1;
    }
  }

  const matchRate = s.billCount > 0 ? s.matched / s.billCount : 0;

  return {
    matchPie,
    anomalyBars,
    feeBuckets,
    topProvinces,
    multiVsSingle: {
      multi,
      single,
      multiFee: Math.round(multiFee * 100) / 100,
      singleFee: Math.round(singleFee * 100) / 100,
    },
    feeTotal: Math.round(feeTotal * 100) / 100,
    matchRate,
  };
}

function feeBucketsToTable(buckets: ExpressFeeBucket[]): any[][] {
  return [
    ["费用区间", "运单数", "费用合计", "费用占比%"],
    ...(() => {
      const total = buckets.reduce((s, b) => s + b.feeSum, 0) || 1;
      return buckets.map((b) => [
        b.label,
        b.count,
        money(b.feeSum),
        Math.round((b.feeSum / total) * 10000) / 100,
      ]);
    })(),
  ];
}

function provincesToTable(list: ExpressProvinceStat[]): any[][] {
  return [
    ["目的省份", "运单数", "费用合计", "均价"],
    ...list.map((p) => [p.province, p.count, money(p.feeSum), money(p.avgFee)]),
  ];
}

export function buildExpressExportSheets(result: ExpressReconcileResult): Array<{
  name: string;
  data: any[][];
}> {
  const { rows, summary, billName, shipName, highFeeThreshold } = result;
  const thr = highFeeThreshold ?? summary.highFeeThreshold ?? DEFAULT_HIGH_FEE_THRESHOLD;
  const viz = buildExpressViz(result, thr);

  const summarySheet: any[][] = [
    ["项目", "数值"],
    ["快递账单文件", billName],
    ["发货订单文件", shipName],
    ["账单运单数", summary.billCount],
    ["发货唯一运单数", summary.shipUniqueWaybills],
    ["发货原始行数", summary.shipRowCount],
    ["已匹配", summary.matched],
    ["仅快递账单有", summary.billOnly],
    ["仅发货未入账", summary.shipOnly],
    ["其他快递", summary.otherExpress],
    ["真对不上(不含其他快递)", summary.unmatched],
    ["账单承运商", summary.billCarrierLabel],
    ["发货数据来源", summary.shipSourceLabel],
    ["多件运单", summary.multiCount],
    ["高运费运单", viz.anomalyBars.find((a) => a.key === "highFee")?.count ?? summary.highFeeCount],
    ["高运费阈值(元)", thr],
    ["账单匹配率", `${Math.round(viz.matchRate * 10000) / 100}%`],
    ["账单均价(元)", money(summary.avgBillFee)],
    ["账单P90费用(元)", money(summary.p90BillFee)],
    ["账单合计费用", money(summary.billFeeTotal)],
    ["已匹配费用合计", money(summary.matchedFeeTotal)],
    ["仅账单费用合计", money(summary.billOnlyFeeTotal)],
    ["发货一单多行运单数", summary.shipDupWaybills],
    ["主键", "规范化运单号（去空格、大写）"],
    ["异常说明", "对不上=两边对不上；多件=数量>1或同运单多行；高运费=合计费用≥阈值"],
  ];

  const matchSheet: any[][] = [
    ["状态", "运单数", "占比%"],
    ...viz.matchPie.map((p) => {
      const total = viz.matchPie.reduce((s, x) => s + x.count, 0) || 1;
      return [p.label, p.count, Math.round((p.count / total) * 10000) / 100];
    }),
  ];

  const anomalySheet: any[][] = [
    ["异常类型", "数量"],
    ...viz.anomalyBars.map((a) => [a.label, a.count]),
    ["多件费用合计", money(viz.multiVsSingle.multiFee)],
    ["单件(有费用)费用合计", money(viz.multiVsSingle.singleFee)],
  ];

  return [
    { name: "对账汇总", data: summarySheet },
    { name: "匹配结构", data: matchSheet },
    { name: "异常概览", data: anomalySheet },
    { name: "费用分布", data: feeBucketsToTable(viz.feeBuckets) },
    { name: "省份费用TOP", data: provincesToTable(viz.topProvinces) },
    { name: "真对不上", data: resultToTable(rows, "unmatched", thr) },
    { name: "其他快递", data: resultToTable(rows, "otherExpress", thr) },
    { name: "多件", data: resultToTable(rows, "multi", thr) },
    { name: "高运费", data: resultToTable(rows, "highFee", thr) },
    { name: "全部明细", data: resultToTable(rows, "all", thr) },
    { name: "已匹配", data: resultToTable(rows, "matched", thr) },
    { name: "仅快递账单有", data: resultToTable(rows, "billOnly", thr) },
    { name: "仅发货未入账", data: resultToTable(rows, "shipOnly", thr) },
  ];
}

/** 导出当前筛选视图（单表） */
export function buildCurrentViewSheet(
  result: ExpressReconcileResult,
  filter: ExpressFilter,
  highFeeThreshold?: number,
): { name: string; data: any[][] } {
  const thr =
    highFeeThreshold ??
    result.highFeeThreshold ??
    result.summary.highFeeThreshold ??
    DEFAULT_HIGH_FEE_THRESHOLD;
  const names: Record<ExpressFilter, string> = {
    all: "全部明细",
    matched: "已匹配",
    billOnly: "仅快递账单有",
    shipOnly: "仅发货未入账",
    otherExpress: "其他快递",
    unmatched: "真对不上",
    multi: "多件",
    highFee: "高运费",
  };
  return {
    name: names[filter] || "当前视图",
    data: resultToTable(result.rows, filter, thr),
  };
}
