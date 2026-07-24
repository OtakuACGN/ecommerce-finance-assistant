/**
 * 售后分析：支持拼多多/ERP 售后导出；售后原因=大项，售后描述=小项（近似合并）
 */
import type { FileData } from "../utils/excel";
import type { PddOrder } from "./pddBusiness";
import {
  clusterDescriptionsBatch,
  normalizeDescText,
  normalizeReasonLabel,
  type DescClusterResult,
} from "./afterSaleDescCluster";

export type AfterSaleFilter =
  | "all" | "success" | "revoked" | "failed" | "processing"
  | "beforeShip" | "afterShip" | "partial" | "full"
  | "returnRefund" | "refundOnly" | "resend" | "intercept";

export type AfterSaleStage = "before_ship" | "after_ship" | "unknown";
export type AfterSaleRefundScope = "full" | "partial" | "none" | "unknown";

export interface AfterSaleRow {
  afterSaleId: string;
  orderId: string;
  tradeAmount: number;
  status: string;
  platformStatus: string;
  refundType: string;
  refundAmount: number;
  orderStatus: string;
  shipWaybill: string;
  productId: string;
  buyer: string;
  timeoutAt: string;
  applyAt: string;
  reason: string;
  description: string;
  descClusterKey: string;
  descClusterLabel: string;
  descClusterMethod: DescClusterResult["method"];
  returnWaybill: string;
  returnLogisticsStatus: string;
  returnLogisticsTime: string;
  agreeRefundAt: string;
  agreeRefundBy: string;
  agreeReturnAt: string;
  agreeReturnBy: string;
  interceptStatus: string;
  skuInfo: string;
  orderTag: string;
  remark: string;
  shopName: string;
  warehouse: string;
  stage: AfterSaleStage;
  scope: AfterSaleRefundScope;
  isSuccess: boolean;
  isRevoked: boolean;
  isFailed: boolean;
  month: string;
  productName: string;
  specName: string;
  merchantSku: string;
  orderGoodsTotal: number;
  orderReceived: number;
  orderQty: number;
  orderMatched: boolean;
  refundQty: number;
  /** 申请退货数量 */
  applyReturnQty: number;
  /** 实退数量 */
  actualReturnQty: number;
}

export interface AfterSaleNameCount {
  name: string;
  count: number;
  refundAmount: number;
  tradeAmount: number;
  reason?: string;
  key?: string;
}

export interface AfterSaleSkuStat {
  key: string;
  productId: string;
  skuInfo: string;
  productName: string;
  merchantSku: string;
  count: number;
  successCount: number;
  refundAmount: number;
  tradeAmount: number;
  orderCount: number;
  orderGmv: number;
  refundRateByCount: number | null;
  refundRateByAmount: number | null;
}

export interface AfterSaleSummary {
  total: number;
  success: number;
  revoked: number;
  failed: number;
  processing: number;
  beforeShip: number;
  afterShip: number;
  stageUnknown: number;
  refundOnly: number;
  returnRefund: number;
  resend: number;
  fullRefund: number;
  partialRefund: number;
  intercept: number;
  refundAmountTotal: number;
  tradeAmountTotal: number;
  successRefundAmount: number;
  successTradeAmount: number;
  orderBaseCount: number;
  orderBaseGmv: number;
  refundRateByCount: number | null;
  refundRateByAmount: number | null;
  avgRefundAmount: number;
  partialGapAmount: number;
  afterFileName: string;
  orderSourceLabel: string;
  descClusterCount: number;
  descRawUnique: number;
}

export interface AfterSaleResult {
  rows: AfterSaleRow[];
  summary: AfterSaleSummary;
  reasonRank: AfterSaleNameCount[];
  descClusterRank: AfterSaleNameCount[];
  reasonDescRank: AfterSaleNameCount[];
  typeRank: AfterSaleNameCount[];
  statusRank: AfterSaleNameCount[];
  agreeByRank: AfterSaleNameCount[];
  skuRank: AfterSaleSkuStat[];
  productRank: AfterSaleSkuStat[];
  monthRank: AfterSaleNameCount[];
}

function norm(s: unknown): string { return String(s ?? "").trim(); }
function normOrderId(raw: unknown): string { return norm(raw).replace(/\s+/g, ""); }
function parseNum(raw: unknown): number {
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const s = String(raw).replace(/,/g, "").replace(/[￥¥]/g, "").trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
function cell(row: any[], idx: number): string { if (idx < 0) return ""; return norm(row[idx]); }
function findCol(headers: string[], names: string[]): number {
  const hs = headers.map((h) => String(h || "").trim());
  for (const name of names) { const i = hs.findIndex((h) => h === name); if (i >= 0) return i; }
  for (const name of names) { const i = hs.findIndex((h) => h.includes(name)); if (i >= 0) return i; }
  return -1;
}
function monthOf(dt: string): string {
  const m = String(dt || "").match(/(\d{4})[-\/]?(\d{1,2})/);
  if (!m) return "";
  return `${m[1]}-${m[2].padStart(2, "0")}`;
}

export function findAfterSaleHeaderRow(data: any[][]): number {
  const limit = Math.min(data.length, 20);
  let best = 0, bestScore = -1;
  for (let i = 0; i < limit; i++) {
    const headers = (data[i] || []).map((h) => String(h || "").trim());
    const joined = headers.join("|");
    let score = 0;
    if (headers.includes("售后单号") || headers.includes("售后编号")) score += 8;
    if (headers.includes("售后原因") || headers.includes("退款原因")) score += 6;
    if (headers.includes("售后描述")) score += 5;
    if (headers.includes("平台订单号") || headers.includes("订单编号") || headers.includes("订单号")) score += 4;
    if (headers.includes("申请退款金额") || headers.includes("退款金额")) score += 3;
    if (headers.includes("售后类型") || headers.includes("退款类型")) score += 2;
    if (joined.includes("3个月前") || joined.includes("仅支持在页面查看")) score -= 20;
    if (headers.filter(Boolean).length < 5) score -= 5;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return bestScore >= 6 ? best : 0;
}

export function detectAfterSaleStage(orderStatus: string, shipWaybill: string, shipStatus?: string): AfterSaleStage {
  const st = `${orderStatus || ""} ${shipStatus || ""}`;
  if (/未发货/.test(st)) return "before_ship";
  if (/已发货|已收货|待收货|发货在途|买家已签收/.test(st)) return "after_ship";
  if (norm(shipWaybill)) return "after_ship";
  if (!norm(shipWaybill) && st.trim()) return "before_ship";
  return "unknown";
}

export function detectRefundScope(
  tradeAmount: number,
  refundAmount: number,
  status: string,
  ctx?: {
    refundType?: string;
    stage?: AfterSaleStage;
    orderGoodsTotal?: number;
    orderReceived?: number;
    applyReturnQty?: number;
    actualReturnQty?: number;
  },
): AfterSaleRefundScope {
  if (!/退款成功|成功|已确认/.test(status) && /撤销|失败|关闭|取消/.test(status)) {
    return "none";
  }
  if (!(refundAmount > 0)) return "none";

  // 对照金额：表内交易额 > 订单商品总价 > 0（禁止用退款额冒充交易额）
  const base =
    tradeAmount > 0
      ? tradeAmount
      : ctx?.orderGoodsTotal && ctx.orderGoodsTotal > 0
        ? ctx.orderGoodsTotal
        : 0;

  if (base > 0) {
    const eps = Math.max(0.05, base * 0.02);
    if (refundAmount + eps >= base) return "full";
    // 仍有商家实收残留，且退款明显小于原价 → 部分退
    if (refundAmount + eps < base) return "partial";
    return "full";
  }

  // 无对照金额：按售后类型 + 发货阶段推断（ERP 常见「退款」= 仅退款/补偿）
  const typ = String(ctx?.refundType || "").trim();
  const stage = ctx?.stage;
  if (/未发货退款/.test(typ)) return "full";
  if (/退货退款/.test(typ)) return "full";
  // 已发货 + 类型就是「退款」+ 未实际退货 → 多为部分退/补偿（如退 5/15/19 元）
  if (
    stage === "after_ship" &&
    (/^退款$/.test(typ) || (/退款/.test(typ) && !/退货|未发货|补寄/.test(typ))) &&
    (ctx?.actualReturnQty == null || ctx.actualReturnQty <= 0)
  ) {
    return "partial";
  }
  if (/^退款$/.test(typ) && stage !== "before_ship") return "partial";
  return "unknown";
}

export function isAfterSaleSuccess(status: string, platformStatus?: string): boolean {
  // 有平台状态时以平台为准（ERP 导出更准）
  if (platformStatus && platformStatus.trim()) {
    if (/退款成功|售后成功/.test(platformStatus)) return true;
    if (/撤销|取消|失败|关闭|驳回|拒绝/.test(platformStatus)) return false;
  }
  const s = `${status || ""} ${platformStatus || ""}`;
  if (/撤销|取消|失败|关闭|驳回/.test(s) && !/退款成功/.test(s)) return false;
  return /退款成功|售后成功/.test(s) || (/成功/.test(s) && !/失败|撤销/.test(s));
}
export function isAfterSaleRevoked(status: string, platformStatus?: string): boolean {
  return /撤销|取消/.test(`${status || ""} ${platformStatus || ""}`);
}
export function isAfterSaleFailed(status: string, platformStatus?: string): boolean {
  const s = `${status || ""} ${platformStatus || ""}`;
  return /失败|关闭|驳回/.test(s) && !/撤销/.test(s);
}



export function parseAfterSaleFile(data: any[][]): AfterSaleRow[] {
  if (!data?.length) return [];
  const headerIdx = findAfterSaleHeaderRow(data);
  const headers = (data[headerIdx] || []).map((h) => String(h || ""));
  const iId = findCol(headers, ["售后单号", "售后编号"]);
  const iOrder = findCol(headers, ["平台订单号", "订单编号", "订单号"]);
  if (iId < 0 && iOrder < 0) {
    throw new Error("未识别售后表：需要「售后单号/售后编号」或「平台订单号/订单编号」");
  }
  const iTrade = findCol(headers, ["交易金额", "订单金额", "支付金额"]);
  const iRefund = findCol(headers, ["申请退款金额", "退款金额", "实退金额"]);
  const iStatus = findCol(headers, ["售后单状态", "售后状态"]);
  const iPlatStatus = findCol(headers, ["平台售后状态"]);
  const iType = findCol(headers, ["售后类型", "退款类型"]);
  const iOrderSt = findCol(headers, ["订单状态"]);
  const iShipSt = findCol(headers, ["平台发货状态", "发货状态"]);
  const iShipWb = findCol(headers, ["发货快递单号", "发货运单号", "运单号"]);
  const iPid = findCol(headers, ["商品ID", "商品id"]);
  const iBuyer = findCol(headers, ["收货人", "买家"]);
  const iTimeout = findCol(headers, ["超时时间"]);
  const iApply = findCol(headers, ["申请时间"]);
  const iReason = findCol(headers, ["售后原因", "退款原因"]);
  const iDesc = findCol(headers, ["售后描述", "问题描述", "描述"]);
  const iRetWb = findCol(headers, ["退货快递单号", "退货运单号"]);
  const iRetLog = findCol(headers, ["货物状态", "退货物流状态"]);
  const iRetExp = findCol(headers, ["退货快递"]);
  const iAgreeRf = findCol(headers, ["确认时间", "同意退款时间"]);
  const iAgreeRfBy = findCol(headers, ["创建人", "同意退款人"]);
  const iIntercept = findCol(headers, ["拦截状态", "快递拦截状态"]);
  const iSku = findCol(headers, ["规格名称", "sku信息", "SKU信息"]);
  const iCode = findCol(headers, ["规格编码", "商家编码"]);
  const iPName = findCol(headers, ["商品名称"]);
  const iTag = findCol(headers, ["订单标记"]);
  const iRemark = findCol(headers, ["卖家备注", "备注", "售后问题备注"]);
  const iShop = findCol(headers, ["店铺名称"]);
  const iWh = findCol(headers, ["仓库"]);
  const iApplyQty = findCol(headers, ["申请退货数量"]);
  const iActualQty = findCol(headers, ["实退数量"]);
  const iQty = iApplyQty >= 0 ? iApplyQty : findCol(headers, ["数量"]);
  const iProblem = findCol(headers, ["售后问题"]);

  type Draft = Omit<AfterSaleRow, "descClusterKey" | "descClusterLabel" | "descClusterMethod"> & { _rowKey: string };
  const drafts: Draft[] = [];
  for (let r = headerIdx + 1; r < data.length; r++) {
    const row = data[r] || [];
    const afterSaleId = cell(row, iId);
    const orderId = normOrderId(cell(row, iOrder));
    if (!afterSaleId && !orderId) continue;
    if (afterSaleId.includes("3个月前") || orderId.includes("3个月前")) continue;
    const status = cell(row, iStatus);
    const platformStatus = cell(row, iPlatStatus);
    const refundAmount = parseNum(row[iRefund]);
    // 切勿用退款金额冒充交易金额，否则部分退会全部变成全额退
    const tradeAmount = parseNum(row[iTrade]);
    const orderStatus = cell(row, iOrderSt);
    const shipStatus = cell(row, iShipSt);
    const shipWaybill = cell(row, iShipWb);
    const reason = normalizeReasonLabel(cell(row, iReason));
    let description = cell(row, iDesc);
    if (!description) description = cell(row, iProblem);
    const stage = detectAfterSaleStage(orderStatus, shipWaybill, shipStatus);
    const statusForScope = platformStatus || status;
    const refundType = cell(row, iType);
    const applyReturnQty = parseNum(row[iApplyQty >= 0 ? iApplyQty : iQty]);
    const actualReturnQty = iActualQty >= 0 ? parseNum(row[iActualQty]) : 0;
    const scope = detectRefundScope(tradeAmount, refundAmount, statusForScope, {
      refundType,
      stage,
      applyReturnQty,
      actualReturnQty,
    });
    const applyAt = cell(row, iApply);
    const productName = cell(row, iPName);
    const specName = cell(row, iSku);
    const merchantSku = cell(row, iCode);
    drafts.push({
      _rowKey: `${afterSaleId || orderId}#${r}`,
      afterSaleId, orderId, tradeAmount, status, platformStatus,
      refundType, refundAmount,
      orderStatus: orderStatus || shipStatus, shipWaybill,
      productId: cell(row, iPid), buyer: cell(row, iBuyer),
      timeoutAt: cell(row, iTimeout), applyAt, reason, description,
      returnWaybill: cell(row, iRetWb),
      returnLogisticsStatus: cell(row, iRetLog) || cell(row, iRetExp),
      returnLogisticsTime: "", agreeRefundAt: cell(row, iAgreeRf),
      agreeRefundBy: cell(row, iAgreeRfBy), agreeReturnAt: "", agreeReturnBy: "",
      interceptStatus: cell(row, iIntercept), skuInfo: specName,
      orderTag: cell(row, iTag), remark: cell(row, iRemark),
      shopName: cell(row, iShop), warehouse: cell(row, iWh),
      stage, scope,
      isSuccess: isAfterSaleSuccess(status, platformStatus),
      isRevoked: isAfterSaleRevoked(status, platformStatus),
      isFailed: isAfterSaleFailed(status, platformStatus),
      month: monthOf(applyAt), productName, specName, merchantSku,
      orderGoodsTotal: 0, orderReceived: 0, orderQty: 0, orderMatched: false,
      refundQty: applyReturnQty || 0,
      applyReturnQty: applyReturnQty || 0,
      actualReturnQty: actualReturnQty || 0,
    });
  }
  if (!drafts.length) throw new Error("售后表未解析到有效行（请确认含表头的明细）");

  const clusterMap = clusterDescriptionsBatch(
    drafts.map((d) => ({ id: d._rowKey, desc: d.description, reason: d.reason })),
  );
  return drafts.map((d) => {
    const c = clusterMap.get(d._rowKey) || {
      key: "empty", label: "无有效描述", method: "empty" as const, normalized: "",
    };
    const { _rowKey, ...rest } = d;
    return {
      ...rest,
      descClusterKey: c.key,
      descClusterLabel: c.label,
      descClusterMethod: c.method,
    };
  });
}

export interface OrderBaseRow {
  orderId: string; productId: string; productName: string; specName: string;
  merchantSku: string; goodsTotal: number; received: number; qty: number;
  afterSaleStatus: string; orderStatus: string;
}

export function parseOrderBaseFile(data: any[][]): OrderBaseRow[] {
  if (!data?.length) return [];
  const headerIdx = Math.max(0, data.findIndex((row) => {
    const j = (row || []).map((x) => String(x || "")).join("|");
    return j.includes("订单号") || j.includes("订单编号");
  }));
  const headers = (data[headerIdx] || []).map((h) => String(h || ""));
  const iOrder = findCol(headers, ["订单号", "订单编号", "平台订单号"]);
  if (iOrder < 0) throw new Error("订单表缺少「订单号」列");
  const iName = findCol(headers, ["商品", "商品名称"]);
  const iPid = findCol(headers, ["商品id", "商品ID"]);
  const iSpec = findCol(headers, ["商品规格", "规格名称", "规格"]);
  const iSku = findCol(headers, ["商家编码-规格维度", "规格编码", "商家编码"]);
  const iGoods = findCol(headers, ["商品总价(元)", "商品总价", "总价"]);
  const iRecv = findCol(headers, ["商家实收金额(元)", "商家实收", "实收"]);
  const iQty = findCol(headers, ["商品数量(件)", "商品数量", "数量"]);
  const iAs = findCol(headers, ["售后状态"]);
  const iOst = findCol(headers, ["订单状态"]);
  const map = new Map<string, OrderBaseRow>();
  for (let r = headerIdx + 1; r < data.length; r++) {
    const row = data[r] || [];
    const orderId = normOrderId(cell(row, iOrder));
    if (!orderId) continue;
    const piece: OrderBaseRow = {
      orderId, productId: cell(row, iPid), productName: cell(row, iName),
      specName: cell(row, iSpec), merchantSku: cell(row, iSku),
      goodsTotal: parseNum(row[iGoods]), received: parseNum(row[iRecv]),
      qty: parseNum(row[iQty]) || 1, afterSaleStatus: cell(row, iAs),
      orderStatus: cell(row, iOst),
    };
    const exist = map.get(orderId);
    if (!exist) { map.set(orderId, piece); continue; }
    exist.goodsTotal += piece.goodsTotal;
    exist.received += piece.received;
    exist.qty += piece.qty;
  }
  return Array.from(map.values());
}

export function orderBaseFromPddOrders(orders: PddOrder[]): OrderBaseRow[] {
  const map = new Map<string, OrderBaseRow>();
  for (const o of orders || []) {
    const orderId = normOrderId(o.orderId);
    if (!orderId) continue;
    const piece: OrderBaseRow = {
      orderId, productId: o.productId || "", productName: o.productName || "",
      specName: o.specName || "", merchantSku: o.merchantSku || o.merchantSpu || "",
      goodsTotal: o.goodsTotal || 0, received: o.merchantReceived || 0,
      qty: o.qty || 1, afterSaleStatus: o.afterSale || "", orderStatus: o.status || "",
    };
    const exist = map.get(orderId);
    if (!exist) { map.set(orderId, piece); continue; }
    exist.goodsTotal += piece.goodsTotal;
    exist.received += piece.received;
    exist.qty += piece.qty;
  }
  return Array.from(map.values());
}



function enrichWithOrders(rows: AfterSaleRow[], orders: OrderBaseRow[]): AfterSaleRow[] {
  const map = new Map(orders.map((o) => [o.orderId, o]));
  return rows.map((r) => {
    const o = map.get(r.orderId);
    if (!o) {
      // 无订单对照时再按类型规则算一遍 scope（防止早期缺字段）
      const scope = detectRefundScope(r.tradeAmount, r.refundAmount, r.platformStatus || r.status, {
        refundType: r.refundType,
        stage: r.stage,
        applyReturnQty: r.applyReturnQty,
        actualReturnQty: r.actualReturnQty,
      });
      return { ...r, scope };
    }
    const stage =
      r.stage !== "unknown" ? r.stage : detectAfterSaleStage(o.orderStatus, r.shipWaybill);
    const tradeAmount = r.tradeAmount > 0 ? r.tradeAmount : 0;
    const scope = detectRefundScope(tradeAmount, r.refundAmount, r.platformStatus || r.status, {
      refundType: r.refundType,
      stage,
      orderGoodsTotal: o.goodsTotal,
      orderReceived: o.received,
      applyReturnQty: r.applyReturnQty,
      actualReturnQty: r.actualReturnQty,
    });
    return {
      ...r,
      productName: r.productName || o.productName,
      specName: r.specName || o.specName,
      skuInfo: r.skuInfo || o.specName,
      merchantSku: r.merchantSku || o.merchantSku,
      productId: r.productId || o.productId,
      orderGoodsTotal: o.goodsTotal,
      orderReceived: o.received,
      orderQty: o.qty,
      orderMatched: true,
      stage,
      scope,
      // 有订单价时，差额对照用订单价
      tradeAmount: tradeAmount > 0 ? tradeAmount : o.goodsTotal || r.tradeAmount,
    };
  });
}

function rankByName(
  rows: AfterSaleRow[],
  pick: (r: AfterSaleRow) => string,
  onlySuccess = false,
  pickKey?: (r: AfterSaleRow) => string,
  pickReason?: (r: AfterSaleRow) => string,
): AfterSaleNameCount[] {
  const map = new Map<string, AfterSaleNameCount>();
  for (const r of rows) {
    if (onlySuccess && !r.isSuccess) continue;
    const name = pick(r) || "未填写";
    const key = pickKey ? pickKey(r) : name;
    const cur = map.get(key) || {
      name, key, count: 0, refundAmount: 0, tradeAmount: 0,
      reason: pickReason ? pickReason(r) : undefined,
    };
    cur.count += 1;
    cur.refundAmount += r.refundAmount || 0;
    cur.tradeAmount += r.tradeAmount || 0;
    map.set(key, cur);
  }
  return Array.from(map.values())
    .map((x) => ({
      ...x,
      refundAmount: Math.round(x.refundAmount * 100) / 100,
      tradeAmount: Math.round(x.tradeAmount * 100) / 100,
    }))
    .sort((a, b) => b.count - a.count || b.refundAmount - a.refundAmount);
}

function buildSkuRank(rows: AfterSaleRow[], orders: OrderBaseRow[], mode: "sku" | "product"): AfterSaleSkuStat[] {
  const orderAgg = new Map<string, { count: number; gmv: number; productName: string; merchantSku: string; productId: string }>();
  for (const o of orders) {
    const key = mode === "product"
      ? o.productId || o.productName || "未知商品"
      : `${o.productId || ""}||${o.specName || o.merchantSku || "未知规格"}`;
    const cur = orderAgg.get(key) || { count: 0, gmv: 0, productName: o.productName, merchantSku: o.merchantSku, productId: o.productId };
    cur.count += 1; cur.gmv += o.goodsTotal || 0; orderAgg.set(key, cur);
  }
  const map = new Map<string, AfterSaleSkuStat>();
  for (const r of rows) {
    const key = mode === "product"
      ? r.productId || r.productName || "未知商品"
      : `${r.productId || ""}||${r.skuInfo || r.specName || r.merchantSku || "未知规格"}`;
    const cur = map.get(key) || {
      key, productId: r.productId, skuInfo: mode === "sku" ? r.skuInfo || r.specName : "",
      productName: r.productName, merchantSku: r.merchantSku, count: 0, successCount: 0,
      refundAmount: 0, tradeAmount: 0, orderCount: 0, orderGmv: 0,
      refundRateByCount: null, refundRateByAmount: null,
    };
    cur.count += 1;
    if (r.isSuccess) cur.successCount += 1;
    cur.refundAmount += r.refundAmount || 0;
    cur.tradeAmount += r.tradeAmount || 0;
    if (!cur.productName && r.productName) cur.productName = r.productName;
    if (!cur.productId && r.productId) cur.productId = r.productId;
    if (!cur.merchantSku && r.merchantSku) cur.merchantSku = r.merchantSku;
    map.set(key, cur);
  }
  return Array.from(map.values())
    .map((s) => {
      const ob = orderAgg.get(s.key);
      const orderCount = ob?.count || 0;
      const orderGmv = ob?.gmv || 0;
      return {
        ...s,
        productName: s.productName || ob?.productName || "",
        merchantSku: s.merchantSku || ob?.merchantSku || "",
        productId: s.productId || ob?.productId || "",
        refundAmount: Math.round(s.refundAmount * 100) / 100,
        tradeAmount: Math.round(s.tradeAmount * 100) / 100,
        orderCount, orderGmv: Math.round(orderGmv * 100) / 100,
        refundRateByCount: orderCount > 0 ? s.successCount / orderCount : null,
        refundRateByAmount: orderGmv > 0 ? s.refundAmount / orderGmv : null,
      };
    })
    .sort((a, b) => b.refundAmount - a.refundAmount || b.successCount - a.successCount);
}

export function analyzeAfterSales(
  afterRows: AfterSaleRow[],
  options?: { orders?: OrderBaseRow[]; afterFileName?: string; orderSourceLabel?: string },
): AfterSaleResult {
  const orders = options?.orders || [];
  const rows = enrichWithOrders(afterRows, orders);
  const successRows = rows.filter((r) => r.isSuccess);
  const refundAmountTotal = rows.reduce((s, r) => s + (r.refundAmount || 0), 0);
  const tradeAmountTotal = rows.reduce((s, r) => s + (r.tradeAmount || 0), 0);
  const successRefundAmount = successRows.reduce((s, r) => s + (r.refundAmount || 0), 0);
  const successTradeAmount = successRows.reduce((s, r) => s + (r.tradeAmount || 0), 0);
  const orderBaseCount = orders.length;
  const orderBaseGmv = orders.reduce((s, o) => s + (o.goodsTotal || 0), 0);
  const successOrderIds = new Set(successRows.map((r) => r.orderId).filter(Boolean));
  const partialRows = successRows.filter((r) => r.scope === "partial");
  const partialGapAmount = partialRows.reduce((s, r) => {
    const base = r.tradeAmount > 0 ? r.tradeAmount : r.orderGoodsTotal || 0;
    return s + Math.max(0, base - (r.refundAmount || 0));
  }, 0);
  const descKeys = new Set(rows.map((r) => r.descClusterKey));
  const rawUnique = new Set(rows.map((r) => normalizeDescText(r.description)).filter(Boolean)).size;

  const summary: AfterSaleSummary = {
    total: rows.length,
    success: successRows.length,
    revoked: rows.filter((r) => r.isRevoked).length,
    failed: rows.filter((r) => r.isFailed).length,
    processing: rows.filter((r) => !r.isSuccess && !r.isRevoked && !r.isFailed && /处理|待|中/.test(r.status)).length,
    beforeShip: rows.filter((r) => r.stage === "before_ship").length,
    afterShip: rows.filter((r) => r.stage === "after_ship").length,
    stageUnknown: rows.filter((r) => r.stage === "unknown").length,
    refundOnly: rows.filter((r) =>
      (/退款/.test(r.refundType) || /未发货退款/.test(r.refundType)) && !/退货/.test(r.refundType) && !/补寄/.test(r.refundType),
    ).length,
    returnRefund: rows.filter((r) => /退货/.test(r.refundType)).length,
    resend: rows.filter((r) => /补寄/.test(r.refundType)).length,
    fullRefund: successRows.filter((r) => r.scope === "full").length,
    partialRefund: partialRows.length,
    intercept: rows.filter((r) => { const x = norm(r.interceptStatus); return !!x && !/未揽件|无|—|-/.test(x); }).length,
    refundAmountTotal: Math.round(refundAmountTotal * 100) / 100,
    tradeAmountTotal: Math.round(tradeAmountTotal * 100) / 100,
    successRefundAmount: Math.round(successRefundAmount * 100) / 100,
    successTradeAmount: Math.round(successTradeAmount * 100) / 100,
    orderBaseCount,
    orderBaseGmv: Math.round(orderBaseGmv * 100) / 100,
    refundRateByCount: orderBaseCount > 0 ? successOrderIds.size / orderBaseCount : null,
    refundRateByAmount: orderBaseGmv > 0 ? successRefundAmount / orderBaseGmv : null,
    avgRefundAmount: successRows.length ? Math.round((successRefundAmount / successRows.length) * 100) / 100 : 0,
    partialGapAmount: Math.round(partialGapAmount * 100) / 100,
    afterFileName: options?.afterFileName || "",
    orderSourceLabel: options?.orderSourceLabel || "",
    descClusterCount: descKeys.size,
    descRawUnique: rawUnique,
  };

  const sorted = [...rows].sort((a, b) => {
    const ra = a.isSuccess ? 0 : a.isRevoked ? 2 : 1;
    const rb = b.isSuccess ? 0 : b.isRevoked ? 2 : 1;
    if (ra !== rb) return ra - rb;
    return (b.refundAmount || 0) - (a.refundAmount || 0);
  });

  return {
    rows: sorted,
    summary,
    reasonRank: rankByName(rows, (r) => r.reason, true),
    descClusterRank: rankByName(rows, (r) => r.descClusterLabel, true, (r) => r.descClusterKey),
    reasonDescRank: rankByName(
      rows,
      (r) => `${r.reason} → ${r.descClusterLabel}`,
      true,
      (r) => `${r.reason}||${r.descClusterKey}`,
      (r) => r.reason,
    ),
    typeRank: rankByName(rows, (r) => r.refundType || "未填写", true),
    statusRank: rankByName(rows, (r) => r.platformStatus || r.status || "未填写", false),
    agreeByRank: rankByName(rows, (r) => r.agreeRefundBy || "未填写", true),
    skuRank: buildSkuRank(rows, orders, "sku"),
    productRank: buildSkuRank(rows, orders, "product"),
    monthRank: rankByName(rows, (r) => r.month || "未知", true),
  };
}

export function parseAndAnalyzeAfterSales(
  afterFile: FileData,
  options?: { orderFile?: FileData | null; opOrders?: PddOrder[]; useOpOrders?: boolean },
): AfterSaleResult {
  const afterRows = parseAfterSaleFile(afterFile.data);
  const parts: OrderBaseRow[][] = [];
  const labels: string[] = [];
  if (options?.orderFile?.data?.length) {
    parts.push(parseOrderBaseFile(options.orderFile.data));
    labels.push(options.orderFile.name || "订单导出");
  }
  if (options?.useOpOrders !== false && options?.opOrders?.length) {
    const fromOp = orderBaseFromPddOrders(options.opOrders);
    if (fromOp.length) {
      parts.push(fromOp);
      labels.push(`经营分析订单(${fromOp.length})`);
    }
  }
  const orderMap = new Map<string, OrderBaseRow>();
  for (const list of parts) {
    for (const o of list) {
      const prev = orderMap.get(o.orderId);
      if (!prev) { orderMap.set(o.orderId, { ...o }); continue; }
      if (!prev.productName && o.productName) prev.productName = o.productName;
      if (!prev.specName && o.specName) prev.specName = o.specName;
      if (!prev.merchantSku && o.merchantSku) prev.merchantSku = o.merchantSku;
      if (!prev.productId && o.productId) prev.productId = o.productId;
      if (!prev.goodsTotal && o.goodsTotal) prev.goodsTotal = o.goodsTotal;
      if (!prev.received && o.received) prev.received = o.received;
    }
  }
  return analyzeAfterSales(afterRows, {
    orders: Array.from(orderMap.values()),
    afterFileName: afterFile.name,
    orderSourceLabel: labels.join(" + "),
  });
}

export function filterAfterSaleRows(rows: AfterSaleRow[], filter: AfterSaleFilter): AfterSaleRow[] {
  if (filter === "success") return rows.filter((r) => r.isSuccess);
  if (filter === "revoked") return rows.filter((r) => r.isRevoked);
  if (filter === "failed") return rows.filter((r) => r.isFailed);
  if (filter === "processing") return rows.filter((r) => !r.isSuccess && !r.isRevoked && !r.isFailed && /处理|待|中/.test(r.status));
  if (filter === "beforeShip") return rows.filter((r) => r.stage === "before_ship");
  if (filter === "afterShip") return rows.filter((r) => r.stage === "after_ship");
  if (filter === "partial") return rows.filter((r) => r.scope === "partial" && r.isSuccess);
  if (filter === "full") return rows.filter((r) => r.scope === "full" && r.isSuccess);
  if (filter === "returnRefund") return rows.filter((r) => /退货/.test(r.refundType));
  if (filter === "refundOnly") return rows.filter((r) =>
    (/退款/.test(r.refundType) || /未发货退款/.test(r.refundType)) && !/退货/.test(r.refundType) && !/补寄/.test(r.refundType));
  if (filter === "resend") return rows.filter((r) => /补寄/.test(r.refundType));
  if (filter === "intercept") return rows.filter((r) => {
    const x = norm(r.interceptStatus); return !!x && !/未揽件|无|—|-/.test(x);
  });
  return rows;
}

const DETAIL_HEADERS = [
  "售后单号", "订单号", "平台售后状态", "售后单状态", "售后类型", "退款范围", "发货阶段",
  "申请退款金额", "交易/对照金额", "售后原因(大项)", "描述聚类(小项)", "原始售后描述", "聚类方式",
  "商品ID", "商品名称", "规格", "规格编码", "申请时间", "确认时间", "创建人",
  "发货运单号", "退货运单号", "拦截状态", "店铺", "是否匹配订单", "备注",
] as const;

function scopeLabel(s: AfterSaleRefundScope): string {
  if (s === "full") return "全额退";
  if (s === "partial") return "部分退";
  if (s === "none") return "无退款额";
  return "未知";
}
function stageLabel(s: AfterSaleStage): string {
  if (s === "before_ship") return "发货前";
  if (s === "after_ship") return "发货后";
  return "未知";
}
function methodLabel(m: DescClusterResult["method"]): string {
  if (m === "rule") return "规则";
  if (m === "fuzzy") return "相似合并";
  if (m === "empty") return "空/无效";
  if (m === "norm") return "归一";
  return "原文";
}

export function afterSaleRowToArray(r: AfterSaleRow): (string | number)[] {
  return [
    r.afterSaleId, r.orderId, r.platformStatus || "", r.status, r.refundType,
    scopeLabel(r.scope), stageLabel(r.stage),
    Math.round(r.refundAmount * 100) / 100, Math.round(r.tradeAmount * 100) / 100,
    r.reason, r.descClusterLabel, r.description, methodLabel(r.descClusterMethod),
    r.productId, r.productName, r.skuInfo || r.specName, r.merchantSku,
    r.applyAt, r.agreeRefundAt, r.agreeRefundBy, r.shipWaybill, r.returnWaybill,
    r.interceptStatus, r.shopName, r.orderMatched ? "是" : "否", r.remark,
  ];
}

export function afterSalesToTable(rows: AfterSaleRow[], filter: AfterSaleFilter = "all"): any[][] {
  const list = filterAfterSaleRows(rows, filter);
  return [[...DETAIL_HEADERS], ...list.map(afterSaleRowToArray)];
}

function money(n: number | null | undefined): string | number {
  if (n == null || !Number.isFinite(n)) return "";
  return Math.round(n * 100) / 100;
}
function pct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

export function buildAfterSaleExportSheets(result: AfterSaleResult): Array<{ name: string; data: any[][] }> {
  const s = result.summary;
  const summary: any[][] = [
    ["项目", "数值"],
    ["售后文件", s.afterFileName],
    ["订单基数来源", s.orderSourceLabel || "未对接订单"],
    ["售后单数", s.total],
    ["退款成功", s.success],
    ["发货前", s.beforeShip],
    ["发货后", s.afterShip],
    ["仅退款/未发货退款", s.refundOnly],
    ["退货退款", s.returnRefund],
    ["全额退", s.fullRefund],
    ["部分退", s.partialRefund],
    ["成功退款金额", money(s.successRefundAmount)],
    ["描述原始种类", s.descRawUnique],
    ["描述合并后种类", s.descClusterCount],
    ["订单基数", s.orderBaseCount],
    ["售后率(单)", pct(s.refundRateByCount)],
    ["售后率(额)", pct(s.refundRateByAmount)],
    ["说明", "售后原因=大项；售后描述=原文，经规则+相似合并为小项"],
  ];
  return [
    { name: "售后汇总", data: summary },
    { name: "原因大项", data: [["售后原因(大项)", "成功单数", "退款金额"], ...result.reasonRank.map((x) => [x.name, x.count, money(x.refundAmount)])] },
    { name: "描述小项合并", data: [["描述聚类(小项)", "成功单数", "退款金额"], ...result.descClusterRank.map((x) => [x.name, x.count, money(x.refundAmount)])] },
    { name: "原因x描述", data: [
      ["售后原因", "描述聚类", "组合", "成功单数", "退款金额"],
      ...result.reasonDescRank.map((x) => {
        const parts = String(x.name).split(" → ");
        return [x.reason || parts[0] || "", parts[1] || x.name, x.name, x.count, money(x.refundAmount)];
      }),
    ] },
    { name: "售后类型", data: [["售后类型", "成功单数", "退款金额"], ...result.typeRank.map((x) => [x.name, x.count, money(x.refundAmount)])] },
    { name: "规格排行", data: [
      ["商品ID", "规格", "商品名称", "成功数", "退款金额", "订单基数", "件数售后率"],
      ...result.skuRank.map((x) => [x.productId, x.skuInfo, x.productName, x.successCount, money(x.refundAmount), x.orderCount || "", pct(x.refundRateByCount)]),
    ] },
    { name: "成功明细", data: afterSalesToTable(result.rows, "success") },
    { name: "发货前", data: afterSalesToTable(result.rows, "beforeShip") },
    { name: "发货后", data: afterSalesToTable(result.rows, "afterShip") },
    { name: "全部明细", data: afterSalesToTable(result.rows, "all") },
  ];
}
