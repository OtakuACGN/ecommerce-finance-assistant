import { FileData } from "../utils/excel";
import { BillRecord, SKUMapping, findCol } from "./businessLogic";

export type SourceKind =
  | "pdd_orders"
  | "pdd_bill"
  | "product_master"
  | "ad_daily"
  | "unknown";

export interface PddOrder {
  orderId: string;
  productName: string;
  status: string;
  afterSale: string;
  qty: number;
  goodsTotal: number;
  buyerPaid: number;
  merchantReceived: number;
  platformDiscount: number;
  shopDiscount: number;
  productId: string;
  specName: string;
  merchantSku: string;
  merchantSpu: string;
  dealTime: string;
  shipTime: string;
  confirmTime: string;
  postage: number;
  expressNo: string;
  expressCompany: string;
  /** 店铺/账号标签（导入时填写，用于多店对比） */
  shopName?: string;
}

export interface PddBillLine {
  orderId: string;
  time: string;
  income: number;
  expense: number;
  billType: string;
  remark: string;
  bizDesc: string;
  shopName?: string;
}

export interface PddBillOrderAgg {
  orderId: string;
  income: number;
  refund: number;
  techFee: number;
  techFeeRefund: number;
  otherFee: number;
  subsidy: number;
  net: number;
  lines: number;
}

export interface ProductSku {
  productCode: string;
  productName: string;
  skuCode: string;
  specName: string;
  salePrice: number;
  costPrice: number;
  packCost: number;
  weightKg: number;
  stock: number;
}

export interface AdDay {
  date: string;
  spend: number;
  gmv: number;
  netGmv: number;
  settledGmv: number;
  orders: number;
  roi: number;
  impressions: number;
  clicks: number;
  shopName?: string;
}

/** 单家快递运费规则 */
export interface ExpressShipRule {
  label: string;
  keywords: string;
  firstWeightKg: number;
  firstWeightFee: number;
  additionalWeightKg: number;
  additionalWeightFee: number;
}

/** 运费/包材/退货/广告等经营参数 */
export interface CostSettings {
  firstWeightKg: number;
  firstWeightFee: number;
  additionalWeightKg: number;
  additionalWeightFee: number;
  defaultPackCost: number;
  forceDefaultPack: boolean;
  defaultWeightKg: number;
  countProductCostOnRefundedShip: boolean;
  /** 发货后退款：商品损耗比例 0-1 */
  returnRestockRate: number;
  /** 发货后退款：二次包装/入库 元/单 */
  returnRepackCost: number;
  /** 订单邮费抵扣运费 */
  usePostageIncome: boolean;
  /** 推广费分摊方式 */
  adAllocateMode: "by_gmv" | "by_order_count" | "none";
  /**
   * 品牌扣点 %（如 5 表示 5%）
   * 按 feeBaseMode 基数计提，从毛利扣减
   */
  brandPointPct: number;
  /**
   * 电商税 %（如 1 表示 1%）
   * 按 feeBaseMode 基数计提，从毛利扣减
   */
  ecommerceTaxPct: number;
  /** 扣点/税 计算基数 */
  feeBaseMode: "revenue" | "merchantReceived" | "goodsTotal";
  /** 按店铺覆盖扣点/税（空=用全局默认） */
  shopFeeOverrides: ShopFeeOverride[];
  expressRules: ExpressShipRule[];
}

/** 店铺级扣点/税覆盖 */
export interface ShopFeeOverride {
  shopName: string;
  /** 留空或 undefined 表示跟随全局 */
  brandPointPct: number | null;
  ecommerceTaxPct: number | null;
  feeBaseMode: "" | "revenue" | "merchantReceived" | "goodsTotal";
}

export const DEFAULT_EXPRESS_RULES: ExpressShipRule[] = [
  { label: "圆通", keywords: "圆通,YTO,yto", firstWeightKg: 1, firstWeightFee: 3, additionalWeightKg: 1, additionalWeightFee: 2 },
  { label: "邮政", keywords: "邮政,EMS,邮政快递,youzheng", firstWeightKg: 1, firstWeightFee: 3.5, additionalWeightKg: 1, additionalWeightFee: 2.5 },
  { label: "中通", keywords: "中通,ZTO,zto", firstWeightKg: 1, firstWeightFee: 3, additionalWeightKg: 1, additionalWeightFee: 2 },
  { label: "韵达", keywords: "韵达,YUNDA,yunda", firstWeightKg: 1, firstWeightFee: 3, additionalWeightKg: 1, additionalWeightFee: 2 },
  { label: "申通", keywords: "申通,STO,sto", firstWeightKg: 1, firstWeightFee: 3, additionalWeightKg: 1, additionalWeightFee: 2 },
];

export const DEFAULT_COST_SETTINGS: CostSettings = {
  firstWeightKg: 1,
  firstWeightFee: 3,
  additionalWeightKg: 1,
  additionalWeightFee: 2,
  defaultPackCost: 0.3,
  forceDefaultPack: false,
  defaultWeightKg: 0.5,
  countProductCostOnRefundedShip: false,
  returnRestockRate: 0.1,
  returnRepackCost: 0.5,
  usePostageIncome: true,
  adAllocateMode: "by_gmv",
  brandPointPct: 0,
  ecommerceTaxPct: 0,
  feeBaseMode: "revenue",
  shopFeeOverrides: [],
  expressRules: DEFAULT_EXPRESS_RULES.map((r) => ({ ...r })),
};

/** 一键参数模板 */
export interface CostSettingsTemplate {
  id: string;
  name: string;
  desc: string;
  patch: Partial<CostSettings>;
}

export const COST_SETTING_TEMPLATES: CostSettingsTemplate[] = [
  {
    id: "no_fee",
    name: "无扣点税",
    desc: "品牌扣点/电商税清零，其它参数保持",
    patch: { brandPointPct: 0, ecommerceTaxPct: 0 },
  },
  {
    id: "brand5_tax1",
    name: "扣点5%+税1%",
    desc: "常用：确认收入基数，扣点5%、电商税1%",
    patch: { brandPointPct: 5, ecommerceTaxPct: 1, feeBaseMode: "revenue" },
  },
  {
    id: "gmv_brand8",
    name: "按GMV扣点8%",
    desc: "品牌按商品总价扣 8%，税 0",
    patch: { brandPointPct: 8, ecommerceTaxPct: 0, feeBaseMode: "goodsTotal" },
  },
  {
    id: "high_return_loss",
    name: "高退货损耗",
    desc: "退货损耗30% + 二次包装1元，适合高逆向",
    patch: { returnRestockRate: 0.3, returnRepackCost: 1 },
  },
  {
    id: "low_cost_ops",
    name: "轻运营",
    desc: "包材0.2、退货损耗5%、二次包装0.3、无扣点税",
    patch: {
      defaultPackCost: 0.2,
      returnRestockRate: 0.05,
      returnRepackCost: 0.3,
      brandPointPct: 0,
      ecommerceTaxPct: 0,
    },
  },
  {
    id: "reset_shipping",
    name: "默认运费包材",
    desc: "恢复默认首续重与快递规则、包材",
    patch: {
      firstWeightKg: 1,
      firstWeightFee: 3,
      additionalWeightKg: 1,
      additionalWeightFee: 2,
      defaultPackCost: 0.3,
      defaultWeightKg: 0.5,
      expressRules: DEFAULT_EXPRESS_RULES.map((r) => ({ ...r })),
    },
  },
];

export function applyCostTemplate(
  current: CostSettings,
  templateId: string,
): CostSettings {
  const t = COST_SETTING_TEMPLATES.find((x) => x.id === templateId);
  if (!t) return current;
  const patch = { ...t.patch };
  if (patch.expressRules) {
    patch.expressRules = patch.expressRules.map((r) => ({ ...r }));
  }
  return {
    ...current,
    ...patch,
    shopFeeOverrides: current.shopFeeOverrides.map((o) => ({ ...o })),
    expressRules: (patch.expressRules || current.expressRules).map((r) => ({
      ...r,
    })),
  };
}

export function resolveShopFeeRates(
  settings: CostSettings,
  shopName?: string,
): {
  brandPointPct: number;
  ecommerceTaxPct: number;
  feeBaseMode: CostSettings["feeBaseMode"];
  fromOverride: boolean;
} {
  const shop = normalizeShopName(shopName);
  const ov = (settings.shopFeeOverrides || []).find(
    (x) => normalizeShopName(x.shopName) === shop,
  );
  if (!ov) {
    return {
      brandPointPct: Math.max(0, Number(settings.brandPointPct) || 0),
      ecommerceTaxPct: Math.max(0, Number(settings.ecommerceTaxPct) || 0),
      feeBaseMode: settings.feeBaseMode || "revenue",
      fromOverride: false,
    };
  }
  return {
    brandPointPct:
      ov.brandPointPct === null || ov.brandPointPct === undefined
        ? Math.max(0, Number(settings.brandPointPct) || 0)
        : Math.max(0, Number(ov.brandPointPct) || 0),
    ecommerceTaxPct:
      ov.ecommerceTaxPct === null || ov.ecommerceTaxPct === undefined
        ? Math.max(0, Number(settings.ecommerceTaxPct) || 0)
        : Math.max(0, Number(ov.ecommerceTaxPct) || 0),
    feeBaseMode:
      ov.feeBaseMode === "revenue" ||
      ov.feeBaseMode === "merchantReceived" ||
      ov.feeBaseMode === "goodsTotal"
        ? ov.feeBaseMode
        : settings.feeBaseMode || "revenue",
    fromOverride: true,
  };
}

export interface OrderProfitRow {
  orderId: string;
  shopName: string;
  productName: string;
  specName: string;
  merchantSku: string;
  merchantSpu: string;
  productId: string;
  status: string;
  afterSale: string;
  qty: number;
  merchantReceived: number;
  goodsTotal: number;
  costPrice: number;
  costTotal: number;
  packUnit: number;
  packTotal: number;
  weightKg: number;
  shippingFee: number;
  postageIncome: number;
  netShipping: number;
  shippingLoss: number;
  returnLoss: number;
  repackCost: number;
  brandPointFee: number;
  ecommerceTaxFee: number;
  adAllocated: number;
  costMatched: boolean;
  costMatchBy: string;
  shipRuleLabel: string;
  billIncome: number;
  billRefund: number;
  techFee: number;
  otherFee: number;
  subsidy: number;
  billNet: number;
  revenue: number;
  estimatedProfit: number;
  estimatedProfitAfterAd: number;
  dealTime: string;
  dealMonth: string;
  shipTime: string;
  expressCompany: string;
  isShipped: boolean;
  isRefunded: boolean;
  isCompleted: boolean;
  isPostShipRefund: boolean;
  isReturnRefund: boolean;
  isShipNotDeal: boolean;
}

export interface MonthMetrics {
  month: string;
  orderCount: number;
  goodsTotal: number;
  merchantReceived: number;
  refundOrderCount: number;
  refundRateByCount: number;
  refundRateByAmount: number;
  postShipRefundCount: number;
  postShipRefundRateByCount: number;
  shippingLossTotal: number;
  netShippingTotal: number;
  profitBeforeAd: number;
  profitAfterAd: number;
  profitMargin: number;
  adAllocated: number;
}

export interface OperatingSummary {
  orderCount: number;
  goodsTotal: number;
  merchantReceived: number;
  buyerPaid: number;
  refundOrderCount: number;
  refundOrderAmount: number;
  refundRateByCount: number;
  refundRateByAmount: number;
  shippedOrderCount: number;
  postShipRefundCount: number;
  postShipRefundAmount: number;
  postShipRefundRateByCount: number;
  postShipRefundRateByAmount: number;
  /**
   * 退货退款（体感主口径）= 发货后全部退
   * 即 已发货退款成功 + 已收货退款成功
   */
  returnRefundCount: number;
  returnRefundAmount: number;
  /** 主口径：发货后全部退 / 已发货订单 */
  returnRefundRateByCount: number;
  returnRefundRateByAmount: number;
  /** 辅助：发货后全部退 / 全部订单 */
  returnRefundRateOfAllByCount: number;
  returnRefundRateOfAllByAmount: number;
  /** 签收后退货（仅「已收货，退款成功」） */
  signedReturnCount: number;
  signedReturnAmount: number;
  /** 签收后退货率 = 已收货退 / 已收货相关 */
  signedReturnRateByCount: number;
  signedReturnRateByAmount: number;
  /** 已收货相关订单数（已收货成功 + 已收货退款） */
  receivedRelatedCount: number;
  /** 未发货退款 */
  unshippedRefundCount: number;
  unshippedRefundAmount: number;
  /** 仅已发货未收货就退款（不含已收货退款） */
  shipOnlyRefundCount: number;
  shipOnlyRefundAmount: number;
  shipNotDealCount: number;
  costTotal: number;
  packTotal: number;
  shippingTotal: number;
  postageIncomeTotal: number;
  netShippingTotal: number;
  shippingLossTotal: number;
  returnLossTotal: number;
  repackCostTotal: number;
  /** 品牌扣点合计 */
  brandPointTotal: number;
  /** 电商税合计 */
  ecommerceTaxTotal: number;
  /** 当前扣点% / 税%（回显） */
  brandPointPct: number;
  ecommerceTaxPct: number;
  feeBaseMode: CostSettings["feeBaseMode"];
  /** 经营底座毛利：收入-成本-包材-净运费-平台费（未扣退货/扣点税/广告） */
  profitOpsBase: number;
  /** 退货相关吃掉：退货损耗+二次包装 */
  returnRelatedCost: number;
  /** 损耗运费（已发货未成交） */
  // shippingLossTotal already exists
  /** 广告+扣点+税+退货相关 合计吃掉 */
  marginEatenTotal: number;
  costMatchedOrders: number;
  costUnmatchedOrders: number;
  costUnmatchedAmount: number;
  billIncome: number;
  billRefund: number;
  techFee: number;
  otherFee: number;
  subsidy: number;
  billNet: number;
  /** 账务里出现的推广费（已排除，不扣毛利） */
  billAdExpenseExcluded: number;
  /** 提现合计（资金划出，已排除，不扣毛利） */
  billWithdrawExcluded: number;
  /** 仅推广日报按日相加 */
  adSpend: number;
  adGmv: number;
  adRoi: number;
  adAllocatedTotal: number;
  estimatedProfitBeforeAd: number;
  estimatedProfitAfterAd: number;
  profitMargin: number;
  months: MonthMetrics[];
  latestMonth?: string;
  prevMonth?: string;
}

export interface OperatingReport {
  summary: OperatingSummary;
  orderProfits: OrderProfitRow[];
  billByType: { type: string; income: number; expense: number; net: number; count: number }[];
  adDays: AdDay[];
  unmatchedSkus: UnmatchedSkuRow[];
  orderTable: any[][];
  summaryTable: any[][];
  billTypeTable: any[][];
  adTable: any[][];
  billWideTable: any[][];
  productMapTable: any[][];
  shipLossTable: any[][];
  rateTable: any[][];
  periodTable: any[][];
  expressTable: any[][];
  unmatchedTable: any[][];
  shopTable: any[][];
  spuTable: any[][];
  skuTable: any[][];
  /** 推广分析（按日 + 汇总，仅日报） */
  adAnalysisTable: any[][];
  /** 产品退货退款率（按商品编码） */
  productReturnTable: any[][];
  /** 本月亏在哪 */
  lossDiagnosisTable: any[][];
  /** 老板一页纸 */
  bossOnePagerTable: any[][];
  /** 异常订单/规格（找坑） */
  anomalySummaryTable: any[][];
  anomalyNegProfitTable: any[][];
  anomalyUnmatchedTable: any[][];
  anomalyFeeFlipTable: any[][];
  anomalyHighRefundSkuTable: any[][];
}

export interface UnmatchedSkuRow {
  key: string;
  count: number;
  amount: number;
  productName: string;
  specName: string;
  merchantSku: string;
  merchantSpu: string;
  productId: string;
  sampleOrderIds: string;
}

function toNum(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = parseFloat(String(v).replace(/[¥￥$,，\s]/g, "").replace(/%/g, ""));
  return isNaN(n) ? 0 : n;
}

function cell(row: any[], idx: number): string {
  if (idx < 0) return "";
  return String(row[idx] ?? "").trim();
}

function normalizeHeader(h: any): string {
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
  if (
    name.includes("商品推广") ||
    name.includes("推广") ||
    name.includes("分天数据") ||
    (joined.includes("成交花费") && joined.includes("交易额")) ||
    (joined.includes("总花费") && joined.includes("实际投产比"))
  ) {
    return "ad_daily";
  }
  return "unknown";
}

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
    productId: findCol(h, ["商品id", "商品ID"]),
    specName: findCol(h, ["商品规格", "规格名称", "规格"]),
    merchantSku: findCol(h, ["商家编码-规格", "规格编码", "商家编码"]),
    merchantSpu: findCol(h, ["商家编码-商品", "商品编码"]),
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
    productId: cell(row, idx.productId),
    specName: cell(row, idx.specName),
    merchantSku: cell(row, idx.merchantSku),
    merchantSpu: cell(row, idx.merchantSpu),
    dealTime: cell(row, idx.dealTime),
    shipTime: cell(row, idx.shipTime),
    confirmTime: cell(row, idx.confirmTime),
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

export function productsToSkuMappings(products: ProductSku[]): SKUMapping[] {
  const out: SKUMapping[] = [];
  const seen = new Set<string>();
  for (const p of products) {
    const unitCost = p.costPrice + p.packCost;
    const keys = [p.specName, p.skuCode, p.productName, p.productCode].filter(Boolean);
    for (const k of keys) {
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({
        platformName: k,
        internalCode: p.skuCode || p.productCode || k,
        price: unitCost,
      });
    }
  }
  return out;
}

function isAdDailyDate(date: string): boolean {
  const s = String(date || "").trim();
  if (!s) return false;
  if (/合计|总计|汇总|小计|平均|全部|全年|本月|上月|total|sum|avg/i.test(s)) return false;
  // 接受 2026-06-01 / 2026/6/1 / 6/1/26 / 2026年6月1日
  if (/\d{4}\s*[-/年.]\s*\d{1,2}/.test(s)) return true;
  if (/^\d{1,2}[\/-]\d{1,2}([\/-]\d{2,4})?/.test(s)) return true;
  if (/^\d{8}$/.test(s)) return true;
  return false;
}

export function parseAdDaily(fileData: FileData): AdDay[] {
  const data = normalizeFileData(fileData);
  const h = data.headers;
  const dateCol = findCol(h, ["日期", "date"]);
  // 优先总花费；不要把汇总行的「总计」列混进来——按日行相加即可
  const spendCol = findCol(h, ["总花费", "成交花费", "花费", "消耗"]);
  const gmvCol = findCol(h, ["交易额", "gmv"]);
  const netGmvCol = findCol(h, ["净交易额"]);
  const settledCol = findCol(h, ["结算交易额"]);
  const ordersCol = findCol(h, ["成交笔数", "净成交笔数"]);
  const roiCol = findCol(h, ["实际投产比", "投产比", "roi"]);
  const impCol = findCol(h, ["曝光量"]);
  const clickCol = findCol(h, ["点击量"]);

  const byDate = new Map<string, AdDay>();
  for (const row of data.data.slice(1)) {
    const date = cell(row, dateCol);
    if (!isAdDailyDate(date)) continue;
    const spend = toNum(cell(row, spendCol >= 0 ? spendCol : findCol(h, ["成交花费"])));
    const day: AdDay = {
      date,
      spend,
      gmv: toNum(cell(row, gmvCol)),
      netGmv: toNum(cell(row, netGmvCol)),
      settledGmv: toNum(cell(row, settledCol)),
      orders: toNum(cell(row, ordersCol)),
      roi: toNum(cell(row, roiCol)),
      impressions: toNum(cell(row, impCol)),
      clicks: toNum(cell(row, clickCol)),
    };
    // 同日期多行：花费/交易额累加（不把总计行算进去，上面已过滤）
    const prev = byDate.get(date);
    if (!prev) {
      byDate.set(date, day);
    } else {
      prev.spend += day.spend;
      prev.gmv += day.gmv;
      prev.netGmv += day.netGmv;
      prev.settledGmv += day.settledGmv;
      prev.orders += day.orders;
      prev.impressions += day.impressions;
      prev.clicks += day.clicks;
      // ROI 用汇总重算
      prev.roi = prev.spend > 0 ? prev.gmv / prev.spend : 0;
      byDate.set(date, prev);
    }
  }
  return Array.from(byDate.values()).sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
}

export function normalizeShopName(name?: string): string {
  const s = String(name || "").trim();
  return s || "默认店铺";
}

export function guessShopNameFromFile(fileName: string): string {
  const base = String(fileName || "")
    .replace(/\.[^.]+$/, "")
    .replace(/orders_export.*$/i, "")
    .replace(/pdd-mall-bill-detail[^(]*/i, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/商品推广.*$/g, "")
    .replace(/商品资料.*$/g, "")
    .replace(/[_\-]+$/g, "")
    .trim();
  if (base && base.length >= 2 && base.length <= 40) return base;
  return "";
}

interface CostMatch {

  costPrice: number;
  packCost: number;
  weightKg: number;
  matched: boolean;
  by: string;
}


export function resolveExpressRule(
  expressCompany: string,
  settings: CostSettings,
): {
  rule: {
    firstWeightKg: number;
    firstWeightFee: number;
    additionalWeightKg: number;
    additionalWeightFee: number;
  };
  label: string;
} {
  const name = String(expressCompany || "").trim();
  for (const r of settings.expressRules || []) {
    const keys = String(r.keywords || "")
      .split(/[,，|/]/)
      .map((k) => k.trim())
      .filter(Boolean);
    if (keys.some((k) => k && name.includes(k))) {
      return {
        label: r.label || keys[0] || "匹配规则",
        rule: {
          firstWeightKg: r.firstWeightKg,
          firstWeightFee: r.firstWeightFee,
          additionalWeightKg: r.additionalWeightKg,
          additionalWeightFee: r.additionalWeightFee,
        },
      };
    }
  }
  return {
    label: name ? `默认` : "默认",
    rule: {
      firstWeightKg: settings.firstWeightKg,
      firstWeightFee: settings.firstWeightFee,
      additionalWeightKg: settings.additionalWeightKg,
      additionalWeightFee: settings.additionalWeightFee,
    },
  };
}

export function calcShippingFeeByRule(
  weightKg: number,
  rule: {
    firstWeightKg: number;
    firstWeightFee: number;
    additionalWeightKg: number;
    additionalWeightFee: number;
  },
  defaultWeightKg: number,
): number {
  const w = weightKg > 0 ? weightKg : defaultWeightKg;
  if (w <= rule.firstWeightKg) return rule.firstWeightFee;
  const unit = rule.additionalWeightKg > 0 ? rule.additionalWeightKg : 1;
  const steps = Math.ceil((w - rule.firstWeightKg) / unit - 1e-9);
  return rule.firstWeightFee + Math.max(0, steps) * rule.additionalWeightFee;
}

export function calcShippingFee(
  weightKg: number,
  settings: CostSettings,
  expressCompany = "",
): { fee: number; ruleLabel: string } {
  const resolved = resolveExpressRule(expressCompany, settings);
  return {
    fee: calcShippingFeeByRule(weightKg, resolved.rule, settings.defaultWeightKg),
    ruleLabel: resolved.label,
  };
}

export function isOrderRefunded(o: PddOrder): boolean {
  return /退款成功/.test(o.status) || /退款成功/.test(o.afterSale);
}

export function isOrderShipped(o: PddOrder): boolean {
  return Boolean(String(o.shipTime || "").trim()) || /已发货|已收货/.test(o.status);
}

export function isOrderCompleted(o: PddOrder): boolean {
  return /^已收货/.test(o.status) && !isOrderRefunded(o);
}

export function isPostShipRefund(o: PddOrder): boolean {
  return isOrderShipped(o) && isOrderRefunded(o);
}

/** 签收后退款（仅已收货退款成功）；体感「退货退款率」= isPostShipRefund */
export function isReturnRefund(o: PddOrder): boolean {
  const st = `${o.status}|${o.afterSale}`;
  if (/已收货/.test(st) && isOrderRefunded(o)) return true;
  if (/已收货退款/.test(st)) return true;
  return false;
}

export function isShipNotDeal(o: PddOrder): boolean {
  return isOrderShipped(o) && !isOrderCompleted(o);
}

export function dealMonthOf(dealTime: string): string {
  const s = String(dealTime || "").trim();
  if (!s) return "未知";

  // 2026-06-30 / 2026/6/30 / 2026年6月
  let m = s.match(/(\d{4})[-/年.](\d{1,2})/);
  if (m) {
    return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}`;
  }

  // xlsx 常把日期读成 6/30/26 或 06/30/2026
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const a = Number(m[1]);
    const b = Number(m[2]);
    // 首段 >12 视为 日/月/年，否则按 月/日/年（xlsx 默认美式）
    const month = a > 12 ? b : a;
    if (month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, "0")}`;
    }
  }

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  return "未知";
}

interface CostMatch {
  costPrice: number;
  packCost: number;
  weightKg: number;
  matched: boolean;
  by: string;
}


function buildProductIndexes(products: ProductSku[]) {
  const bySku = new Map<string, ProductSku>();
  const bySpec = new Map<string, ProductSku>();
  const bySpu = new Map<string, ProductSku>();
  const byName = new Map<string, ProductSku>();
  for (const p of products) {
    if (p.skuCode) bySku.set(p.skuCode, p);
    if (p.specName) bySpec.set(p.specName, p);
    if (p.productCode) bySpu.set(p.productCode, p);
    if (p.productName) byName.set(p.productName, p);
  }
  return { bySku, bySpec, bySpu, byName };
}

function matchProduct(order: PddOrder, indexes: ReturnType<typeof buildProductIndexes>): CostMatch {
  const pack = (p: ProductSku) => p.packCost;
  const wrap = (p: ProductSku, by: string): CostMatch => ({
    costPrice: p.costPrice,
    packCost: pack(p),
    weightKg: p.weightKg,
    matched: true,
    by,
  });
  if (order.merchantSku && indexes.bySku.has(order.merchantSku)) {
    return wrap(indexes.bySku.get(order.merchantSku)!, "规格编码");
  }
  if (order.merchantSku && indexes.bySpec.has(order.merchantSku)) {
    return wrap(indexes.bySpec.get(order.merchantSku)!, "规格名称=商家编码");
  }
  if (order.specName && indexes.bySpec.has(order.specName)) {
    return wrap(indexes.bySpec.get(order.specName)!, "商品规格");
  }
  if (order.merchantSpu && indexes.bySpu.has(order.merchantSpu)) {
    return wrap(indexes.bySpu.get(order.merchantSpu)!, "商品编码");
  }
  if (order.productName && indexes.byName.has(order.productName)) {
    return wrap(indexes.byName.get(order.productName)!, "商品名称");
  }
  if (order.merchantSku) {
    for (const [spec, p] of indexes.bySpec) {
      if (spec.includes(order.merchantSku) || order.merchantSku.includes(spec)) {
        return wrap(p, "模糊规格");
      }
    }
  }
  return { costPrice: 0, packCost: 0, weightKg: 0, matched: false, by: "未匹配" };
}



export function buildOperatingReport(
  orders: PddOrder[],
  billLines: PddBillLine[],
  products: ProductSku[],
  adDays: AdDay[],
  settings: CostSettings = DEFAULT_COST_SETTINGS,
): OperatingReport {
  const { byOrder, byType, totals } = aggregatePddBill(billLines);
  const indexes = buildProductIndexes(products);
  const unmatchedMap = new Map<
    string,
    {
      count: number;
      amount: number;
      productName: string;
      specName: string;
      merchantSku: string;
      merchantSpu: string;
      productId: string;
      sampleOrderIds: string[];
    }
  >();
  const adSpend = adDays.reduce((s, d) => s + d.spend, 0);
  const adGmv = adDays.reduce((s, d) => s + d.gmv, 0);

  // 广告按店铺分摊（多店对比时各店互不串）
  const adSpendByShop = new Map<string, number>();
  for (const d of adDays) {
    const shop = normalizeShopName(d.shopName);
    adSpendByShop.set(shop, (adSpendByShop.get(shop) || 0) + d.spend);
  }
  const orderMeta = orders.map((o) => {
    const shop = normalizeShopName(o.shopName);
    return {
      orderId: o.orderId,
      shop,
      goodsTotal: o.goodsTotal,
      allocBase: o.goodsTotal > 0 ? o.goodsTotal : 0,
    };
  });
  const allocBaseByShop = new Map<string, number>();
  const orderCountByShop = new Map<string, number>();
  for (const m of orderMeta) {
    allocBaseByShop.set(m.shop, (allocBaseByShop.get(m.shop) || 0) + m.allocBase);
    orderCountByShop.set(m.shop, (orderCountByShop.get(m.shop) || 0) + 1);
  }
  const totalAllocBase = orderMeta.reduce((s, o) => s + o.allocBase, 0);
  const orderCountForAd = orders.length || 1;
  // 若广告未打店铺标签且仅有默认店铺花费，则仍按全局分摊（兼容单店）
  const adShops = Array.from(adSpendByShop.keys());
  const useGlobalAd =
    adShops.length === 0 ||
    (adShops.length === 1 && adShops[0] === "默认店铺");

  const orderProfits: OrderProfitRow[] = orders.map((o) => {
    const matched = matchProduct(o, indexes);
    const shipped = isOrderShipped(o);
    const refunded = isOrderRefunded(o);
    const completed = isOrderCompleted(o);
    const postShipRefund = isPostShipRefund(o);
    const returnRefund = isReturnRefund(o);
    const shipNotDeal = isShipNotDeal(o);
    const dealMonth = dealMonthOf(o.dealTime);

    let packUnit = settings.defaultPackCost;
    if (!settings.forceDefaultPack) {
      if (matched.matched && matched.packCost > 0) packUnit = matched.packCost;
      else if (matched.matched) packUnit = settings.defaultPackCost;
    }

    let chargeProductCost = false;
    if (completed) chargeProductCost = true;
    else if (shipped && !refunded) chargeProductCost = true;
    else if (postShipRefund && settings.countProductCostOnRefundedShip) chargeProductCost = true;

    const unitCost = matched.costPrice;
    const costTotal = chargeProductCost ? unitCost * o.qty : 0;
    const packTotal = shipped ? packUnit * o.qty : 0;

    // 退货入库损耗：发货后退款且未计全额成本时，按比例计损耗 + 二次包装
    const returnLoss =
      postShipRefund && !settings.countProductCostOnRefundedShip
        ? unitCost * o.qty * Math.max(0, Math.min(1, settings.returnRestockRate || 0))
        : 0;
    const repackCost = postShipRefund ? Math.max(0, settings.returnRepackCost || 0) : 0;

    const unitWeight = matched.weightKg > 0 ? matched.weightKg : settings.defaultWeightKg;
    const weightKg = unitWeight * o.qty;
    const shipCalc = shipped
      ? calcShippingFee(weightKg, settings, o.expressCompany)
      : { fee: 0, ruleLabel: "-" };
    const shippingFee = shipCalc.fee;
    const postageIncome = settings.usePostageIncome ? Math.max(0, o.postage || 0) : 0;
    const netShipping = Math.max(0, shippingFee - postageIncome);
    const shippingLoss = shipNotDeal ? netShipping : 0;

    const bill = byOrder.get(o.orderId);
    const billIncome = bill?.income || 0;
    const billRefund = bill?.refund || 0;
    const techFee = bill?.techFee || 0;
    const otherFee = bill?.otherFee || 0;
    const subsidy = bill?.subsidy || 0;
    const billNet = bill ? bill.net : o.merchantReceived;

    // 确认收入口径：
    // - 未退款：优先用订单「商家实收」（更贴近卖家体感；账单可能跨期/不全导致偏低）
    // - 已退款：默认 0；若账单有明确净额则取 max(0, 收入-退款+补贴)
    // 技术服务费/其他费用仍从账单取，避免漏扣平台费
    let revenue = 0;
    if (refunded) {
      if (bill && (billIncome > 0 || billRefund > 0)) {
        revenue = Math.max(0, billIncome - billRefund + subsidy);
      } else {
        revenue = 0;
      }
    } else if (o.merchantReceived > 0) {
      revenue = o.merchantReceived;
    } else if (bill) {
      revenue = Math.max(0, billIncome - billRefund + subsidy);
    } else {
      revenue = 0;
    }

    // 推广费分摊（多店优先按本店广告）
    const shopName = normalizeShopName(o.shopName);
    let adAllocated = 0;
    if (settings.adAllocateMode !== "none") {
      if (useGlobalAd) {
        if (settings.adAllocateMode === "by_gmv" && totalAllocBase > 0 && adSpend > 0) {
          adAllocated = (o.goodsTotal / totalAllocBase) * adSpend;
        } else if (settings.adAllocateMode === "by_order_count" && adSpend > 0) {
          adAllocated = adSpend / orderCountForAd;
        }
      } else {
        const shopSpend = adSpendByShop.get(shopName) || 0;
        if (settings.adAllocateMode === "by_gmv") {
          const base = allocBaseByShop.get(shopName) || 0;
          if (base > 0 && shopSpend > 0) adAllocated = (o.goodsTotal / base) * shopSpend;
        } else if (settings.adAllocateMode === "by_order_count") {
          const cnt = orderCountByShop.get(shopName) || 1;
          if (shopSpend > 0) adAllocated = shopSpend / cnt;
        }
      }
    }

    const fees = techFee + otherFee;
    // 品牌扣点 / 电商税：支持店铺覆盖
    const shopRates = resolveShopFeeRates(settings, o.shopName || "");
    const feeBase =
      shopRates.feeBaseMode === "goodsTotal"
        ? Math.max(0, o.goodsTotal || 0)
        : shopRates.feeBaseMode === "merchantReceived"
          ? Math.max(0, o.merchantReceived || 0)
          : Math.max(0, revenue);
    const brandPointFee = feeBase * (shopRates.brandPointPct / 100);
    const ecommerceTaxFee = feeBase * (shopRates.ecommerceTaxPct / 100);
    const estimatedProfit =
      revenue -
      costTotal -
      packTotal -
      netShipping -
      fees -
      returnLoss -
      repackCost -
      brandPointFee -
      ecommerceTaxFee;
    const estimatedProfitAfterAd = estimatedProfit - adAllocated;

    if (!matched.matched) {
      const key = o.merchantSku || o.specName || o.productName || o.orderId;
      const u = unmatchedMap.get(key) || {
        count: 0,
        amount: 0,
        productName: o.productName || "",
        specName: o.specName || "",
        merchantSku: o.merchantSku || "",
        merchantSpu: o.merchantSpu || "",
        productId: o.productId || "",
        sampleOrderIds: [] as string[],
      };
      u.count += 1;
      u.amount += o.merchantReceived;
      if (!u.productName && o.productName) u.productName = o.productName;
      if (!u.specName && o.specName) u.specName = o.specName;
      if (!u.merchantSku && o.merchantSku) u.merchantSku = o.merchantSku;
      if (!u.merchantSpu && o.merchantSpu) u.merchantSpu = o.merchantSpu;
      if (!u.productId && o.productId) u.productId = o.productId;
      if (u.sampleOrderIds.length < 5 && o.orderId) u.sampleOrderIds.push(o.orderId);
      unmatchedMap.set(key, u);
    }

    return {
      orderId: o.orderId,
      shopName,
      productName: o.productName,
      specName: o.specName,
      merchantSku: o.merchantSku,
      merchantSpu: o.merchantSpu || "",
      productId: o.productId || "",
      status: o.status,
      afterSale: o.afterSale,
      qty: o.qty,
      merchantReceived: o.merchantReceived,
      goodsTotal: o.goodsTotal,
      costPrice: unitCost,
      costTotal,
      packUnit,
      packTotal,
      weightKg,
      shippingFee,
      postageIncome,
      netShipping,
      shippingLoss,
      returnLoss,
      repackCost,
      brandPointFee,
      ecommerceTaxFee,
      adAllocated,
      costMatched: matched.matched,
      costMatchBy: matched.by,
      shipRuleLabel: shipCalc.ruleLabel,
      billIncome,
      billRefund,
      techFee,
      otherFee,
      subsidy,
      billNet,
      revenue,
      estimatedProfit,
      estimatedProfitAfterAd,
      dealTime: o.dealTime,
      dealMonth,
      shipTime: o.shipTime,
      expressCompany: o.expressCompany,
      isShipped: shipped,
      isRefunded: refunded,
      isCompleted: completed,
      isPostShipRefund: postShipRefund,
      isReturnRefund: returnRefund,
      isShipNotDeal: shipNotDeal,
    };
  });

  const goodsTotal = orders.reduce((s, o) => s + o.goodsTotal, 0);
  const merchantReceived = orders.reduce((s, o) => s + o.merchantReceived, 0);
  const buyerPaid = orders.reduce((s, o) => s + o.buyerPaid, 0);

  const refundOrders = orderProfits.filter((o) => o.isRefunded);
  const refundOrderCount = refundOrders.length;
  const refundOrderAmount = refundOrders.reduce((s, o) => s + o.goodsTotal, 0);
  const refundRateByCount = orders.length > 0 ? refundOrderCount / orders.length : 0;
  const refundRateByAmount = goodsTotal > 0 ? refundOrderAmount / goodsTotal : 0;

  const shippedOrders = orderProfits.filter((o) => o.isShipped);
  const shippedOrderCount = shippedOrders.length;
  const shippedAmount = shippedOrders.reduce((s, o) => s + o.goodsTotal, 0);
  const postShipRefunds = orderProfits.filter((o) => o.isPostShipRefund);
  const postShipRefundCount = postShipRefunds.length;
  const postShipRefundAmount = postShipRefunds.reduce((s, o) => s + o.goodsTotal, 0);
  const postShipRefundRateByCount =
    shippedOrderCount > 0 ? postShipRefundCount / shippedOrderCount : 0;
  const postShipRefundRateByAmount =
    shippedAmount > 0 ? postShipRefundAmount / shippedAmount : 0;

  // 体感主口径：退货退款 = 发货后全部退（已发货退 + 已收货退）
  const returnRefundCount = postShipRefundCount;
  const returnRefundAmount = postShipRefundAmount;
  // 仅发货未收货退款 = 发货后退款 - 签收后退款
  const shipOnlyRefunds = orderProfits.filter(
    (o) => o.isPostShipRefund && !o.isReturnRefund,
  );
  const shipOnlyRefundCount = shipOnlyRefunds.length;
  const shipOnlyRefundAmount = shipOnlyRefunds.reduce((s, o) => s + o.goodsTotal, 0);
  // 签收后退货（仅已收货退款成功）
  const signedReturns = orderProfits.filter((o) => o.isReturnRefund);
  const signedReturnCount = signedReturns.length;
  const signedReturnAmount = signedReturns.reduce((s, o) => s + o.goodsTotal, 0);
  // 已收货相关（已收货成功 + 已收货退款）
  const receivedRelated = orderProfits.filter(
    (o) => /已收货/.test(o.status) || o.isReturnRefund,
  );
  const receivedRelatedCount = receivedRelated.length || 0;
  const receivedRelatedAmount = receivedRelated.reduce((sum, o) => sum + o.goodsTotal, 0);
  // 未发货退款 = 总退款 - 发货后退款
  const unshippedRefunds = orderProfits.filter(
    (o) => o.isRefunded && !o.isPostShipRefund,
  );
  const unshippedRefundCount = unshippedRefunds.length;
  const unshippedRefundAmount = unshippedRefunds.reduce((sum, o) => sum + o.goodsTotal, 0);
  // 主口径：退货退款率 = 发货后全部退 / 已发货
  const returnRefundRateByCount = postShipRefundRateByCount;
  const returnRefundRateByAmount = postShipRefundRateByAmount;
  // 辅助：发货后全部退 / 全部订单
  const returnRefundRateOfAllByCount =
    orders.length > 0 ? returnRefundCount / orders.length : 0;
  const returnRefundRateOfAllByAmount =
    goodsTotal > 0 ? returnRefundAmount / goodsTotal : 0;
  // 签收后退货率（辅）：已收货退 / 已收货相关
  const signedReturnRateByCount =
    receivedRelatedCount > 0 ? signedReturnCount / receivedRelatedCount : 0;
  const signedReturnRateByAmount =
    receivedRelatedAmount > 0 ? signedReturnAmount / receivedRelatedAmount : 0;

  const shipNotDealCount = orderProfits.filter((o) => o.isShipNotDeal).length;
  const costTotal = orderProfits.reduce((s, o) => s + o.costTotal, 0);
  const packTotal = orderProfits.reduce((s, o) => s + o.packTotal, 0);
  const shippingTotal = orderProfits.reduce((s, o) => s + o.shippingFee, 0);
  const postageIncomeTotal = orderProfits.reduce((s, o) => s + o.postageIncome, 0);
  const netShippingTotal = orderProfits.reduce((s, o) => s + o.netShipping, 0);
  const shippingLossTotal = orderProfits.reduce((s, o) => s + o.shippingLoss, 0);
  const returnLossTotal = orderProfits.reduce((s, o) => s + o.returnLoss, 0);
  const repackCostTotal = orderProfits.reduce((s, o) => s + o.repackCost, 0);
  const brandPointTotal = orderProfits.reduce((s, o) => s + o.brandPointFee, 0);
  const ecommerceTaxTotal = orderProfits.reduce((s, o) => s + o.ecommerceTaxFee, 0);
  const adAllocatedTotal = orderProfits.reduce((s, o) => s + o.adAllocated, 0);
  // 毛利阶梯：底座 → 扣退货相关 → 扣扣点税 → 扣广告
  const profitOpsBase = orderProfits.reduce((s, o) => {
    const fees = o.techFee + o.otherFee;
    return (
      s +
      o.revenue -
      o.costTotal -
      o.packTotal -
      o.netShipping -
      fees
    );
  }, 0);
  const returnRelatedCost = returnLossTotal + repackCostTotal;
  const marginEatenTotal =
    returnRelatedCost +
    shippingLossTotal +
    brandPointTotal +
    ecommerceTaxTotal +
    (settings.adAllocateMode === "none" ? adSpend : adAllocatedTotal);
  const costMatchedOrders = orderProfits.filter((o) => o.costMatched).length;
  const costUnmatchedAmount = orderProfits
    .filter((o) => !o.costMatched)
    .reduce((s, o) => s + o.merchantReceived, 0);

  let profitBefore = orderProfits.reduce((s, o) => s + o.estimatedProfit, 0);
  if (orders.length === 0 && billLines.length > 0) profitBefore = totals.net;
  // 若 ad 未分摊到单，summary 仍扣总广告
  let profitAfter = orderProfits.reduce((s, o) => s + o.estimatedProfitAfterAd, 0);
  if (settings.adAllocateMode === "none") {
    profitAfter = profitBefore - adSpend;
  }
  const profitMargin = merchantReceived > 0 ? profitAfter / merchantReceived : 0;

  // 按月汇总 + 时段对比
  const monthMap = new Map<string, OrderProfitRow[]>();
  for (const o of orderProfits) {
    const m = o.dealMonth || "未知";
    if (!monthMap.has(m)) monthMap.set(m, []);
    monthMap.get(m)!.push(o);
  }
  const months: MonthMetrics[] = Array.from(monthMap.entries())
    .filter(([m]) => m !== "未知")
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, rows]) => {
      const gt = rows.reduce((s, r) => s + r.goodsTotal, 0);
      const mr = rows.reduce((s, r) => s + r.merchantReceived, 0);
      const ref = rows.filter((r) => r.isRefunded);
      const shipped = rows.filter((r) => r.isShipped);
      const psr = rows.filter((r) => r.isPostShipRefund);
      const pb = rows.reduce((s, r) => s + r.estimatedProfit, 0);
      const pa = rows.reduce((s, r) => s + r.estimatedProfitAfterAd, 0);
      return {
        month,
        orderCount: rows.length,
        goodsTotal: gt,
        merchantReceived: mr,
        refundOrderCount: ref.length,
        refundRateByCount: rows.length ? ref.length / rows.length : 0,
        refundRateByAmount: gt > 0 ? ref.reduce((s, r) => s + r.goodsTotal, 0) / gt : 0,
        postShipRefundCount: psr.length,
        postShipRefundRateByCount: shipped.length ? psr.length / shipped.length : 0,
        shippingLossTotal: rows.reduce((s, r) => s + r.shippingLoss, 0),
        netShippingTotal: rows.reduce((s, r) => s + r.netShipping, 0),
        profitBeforeAd: pb,
        profitAfterAd: pa,
        profitMargin: mr > 0 ? pa / mr : 0,
        adAllocated: rows.reduce((s, r) => s + r.adAllocated, 0),
      };
    });
  const latestMonth = months.length ? months[months.length - 1].month : undefined;
  const prevMonth = months.length >= 2 ? months[months.length - 2].month : undefined;

  const adRoi = adSpend > 0 ? adGmv / adSpend : 0;
  const costUnmatchedOrders = orderProfits.length - costMatchedOrders;
  const summary: OperatingSummary = {
    orderCount: orders.length,
    goodsTotal,
    merchantReceived,
    buyerPaid,
    refundOrderCount,
    refundOrderAmount,
    refundRateByCount,
    refundRateByAmount,
    shippedOrderCount,
    postShipRefundCount,
    postShipRefundAmount,
    postShipRefundRateByCount,
    postShipRefundRateByAmount,
    returnRefundCount,
    returnRefundAmount,
    returnRefundRateByCount,
    returnRefundRateByAmount,
    returnRefundRateOfAllByCount,
    returnRefundRateOfAllByAmount,
    signedReturnCount,
    signedReturnAmount,
    signedReturnRateByCount,
    signedReturnRateByAmount,
    receivedRelatedCount,
    unshippedRefundCount,
    unshippedRefundAmount,
    shipOnlyRefundCount,
    shipOnlyRefundAmount,
    shipNotDealCount,
    costTotal,
    packTotal,
    shippingTotal,
    postageIncomeTotal,
    netShippingTotal,
    shippingLossTotal,
    returnLossTotal,
    repackCostTotal,
    brandPointTotal,
    ecommerceTaxTotal,
    brandPointPct: Math.max(0, Number(settings.brandPointPct) || 0),
    ecommerceTaxPct: Math.max(0, Number(settings.ecommerceTaxPct) || 0),
    feeBaseMode: settings.feeBaseMode || "revenue",
    profitOpsBase,
    returnRelatedCost,
    marginEatenTotal,
    costMatchedOrders,
    costUnmatchedOrders,
    costUnmatchedAmount,
    billIncome: totals.income,
    billRefund: totals.refund,
    techFee: totals.techFee,
    otherFee: totals.otherFee,
    subsidy: totals.subsidy,
    billNet: totals.net,
    billAdExpenseExcluded: totals.adExpense || 0,
    billWithdrawExcluded: totals.withdraw || 0,
    adSpend,
    adGmv,
    adRoi,
    adAllocatedTotal,
    estimatedProfitBeforeAd: profitBefore,
    estimatedProfitAfterAd: profitAfter,
    profitMargin,
    months,
    latestMonth,
    prevMonth,
  };

  const billByType = Array.from(byType.entries())
    .map(([type, v]) => ({
      type,
      income: v.income,
      expense: v.expense,
      net: v.income - v.expense,
      count: v.count,
    }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

  const unmatchedSkus: UnmatchedSkuRow[] = Array.from(unmatchedMap.entries())
    .map(([key, v]) => ({
      key,
      count: v.count,
      amount: v.amount,
      productName: v.productName,
      specName: v.specName,
      merchantSku: v.merchantSku,
      merchantSpu: v.merchantSpu,
      productId: v.productId,
      sampleOrderIds: v.sampleOrderIds.join(" / "),
    }))
    .sort((a, b) => b.count - a.count || b.amount - a.amount);

  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
  const delta = (a: number, b: number) => a - b;

  const orderTable: any[][] = [
    [
      "店铺", "订单号", "月份", "成交时间", "发货时间", "快递公司", "运费规则", "商品", "规格", "商家编码",
      "商品编码", "商品ID", "状态", "售后", "数量", "商品总价", "商家实收", "确认收入", "单位成本", "商品成本", "包材",
      "重量kg", "运费", "邮费收入", "净运费", "损耗运费", "退货损耗", "二次包装", "品牌扣点", "电商税", "分摊广告",
      "成本匹配", "匹配方式", "账单收入", "账单退款", "技术服务费", "其他费用", "补贴",
      "是否发货", "是否退款", "是否成交", "发货后退款", "已发货未成交", "毛利(未扣广告)", "毛利(扣广告)",
    ],
    ...orderProfits.map((o) => [
      o.shopName, o.orderId, o.dealMonth, o.dealTime, o.shipTime, o.expressCompany, o.shipRuleLabel,
      o.productName, o.specName, o.merchantSku, o.merchantSpu, o.productId, o.status, o.afterSale, o.qty,
      o.goodsTotal.toFixed(2), o.merchantReceived.toFixed(2), o.revenue.toFixed(2),
      o.costPrice.toFixed(2), o.costTotal.toFixed(2), o.packTotal.toFixed(2),
      o.weightKg.toFixed(3), o.shippingFee.toFixed(2), o.postageIncome.toFixed(2),
      o.netShipping.toFixed(2), o.shippingLoss.toFixed(2), o.returnLoss.toFixed(2),
      o.repackCost.toFixed(2), o.brandPointFee.toFixed(2), o.ecommerceTaxFee.toFixed(2), o.adAllocated.toFixed(2),
      o.costMatched ? "是" : "否", o.costMatchBy,
      o.billIncome.toFixed(2), o.billRefund.toFixed(2), o.techFee.toFixed(2),
      o.otherFee.toFixed(2), o.subsidy.toFixed(2),
      o.isShipped ? "是" : "否", o.isRefunded ? "是" : "否", o.isCompleted ? "是" : "否",
      o.isPostShipRefund ? "是" : "否", o.isShipNotDeal ? "是" : "否",
      o.estimatedProfit.toFixed(2), o.estimatedProfitAfterAd.toFixed(2),
    ]),
  ];

  const summaryTable: any[][] = [
    ["指标", "数值"],
    ["订单数", summary.orderCount],
    ["商品总价合计", summary.goodsTotal.toFixed(2)],
    ["用户实付合计", summary.buyerPaid.toFixed(2)],
    ["商家实收合计", summary.merchantReceived.toFixed(2)],
    ["退款订单数", summary.refundOrderCount],
    ["退款订单商品总价", summary.refundOrderAmount.toFixed(2)],
    ["总退款率(笔数)", pct(summary.refundRateByCount)],
    ["总退款率(金额)", pct(summary.refundRateByAmount)],
    ["已发货订单数", summary.shippedOrderCount],
    ["发货后退款订单数", summary.postShipRefundCount],
    ["发货后退款率(笔数)", pct(summary.postShipRefundRateByCount)],
    ["发货后退款率(金额)", pct(summary.postShipRefundRateByAmount)],
    ["未发货退款订单数", summary.unshippedRefundCount],
    ["未发货退款金额(商品总价)", summary.unshippedRefundAmount.toFixed(2)],
    ["发货未收货退款订单数", summary.shipOnlyRefundCount],
    ["发货未收货退款金额(商品总价)", summary.shipOnlyRefundAmount.toFixed(2)],
    ["已收货相关订单数(已收货+已收货退)", summary.receivedRelatedCount],
    ["退货退款订单数(发货后全部退)", summary.returnRefundCount],
    ["退货退款金额(商品总价)", summary.returnRefundAmount.toFixed(2)],
    ["退货退款率(笔)=发货后全部退/已发货", pct(summary.returnRefundRateByCount)],
    ["退货退款率(额)=发货后全部退额/已发货额", pct(summary.returnRefundRateByAmount)],
    ["退货退款率(笔,辅助)=发货后全部退/全部订单", pct(summary.returnRefundRateOfAllByCount)],
    ["退货退款率(额,辅助)=发货后全部退额/全部商品总价", pct(summary.returnRefundRateOfAllByAmount)],
    ["签收后退货订单数", summary.signedReturnCount],
    ["签收后退货金额", summary.signedReturnAmount.toFixed(2)],
    ["签收后退货率(笔)=已收货退/已收货相关", pct(summary.signedReturnRateByCount)],
    ["签收后退货率(额)", pct(summary.signedReturnRateByAmount)],
    ["已发货未成交订单数", summary.shipNotDealCount],
    ["商品成本合计", summary.costTotal.toFixed(2)],
    ["包材合计", summary.packTotal.toFixed(2)],
    ["运费合计(毛)", summary.shippingTotal.toFixed(2)],
    ["邮费收入合计", summary.postageIncomeTotal.toFixed(2)],
    ["净运费合计", summary.netShippingTotal.toFixed(2)],
    ["损耗运费合计", summary.shippingLossTotal.toFixed(2)],
    ["退货入库损耗", summary.returnLossTotal.toFixed(2)],
    ["二次包装成本", summary.repackCostTotal.toFixed(2)],
    [`品牌扣点(全局${summary.brandPointPct}%)`, summary.brandPointTotal.toFixed(2)],
    [`电商税(全局${summary.ecommerceTaxPct}%)`, summary.ecommerceTaxTotal.toFixed(2)],
    ["扣点/税基数(全局)", summary.feeBaseMode === "goodsTotal" ? "商品总价" : summary.feeBaseMode === "merchantReceived" ? "商家实收" : "确认收入"],
    ["店铺扣点覆盖条数", (settings.shopFeeOverrides || []).filter((x) => String(x.shopName || "").trim()).length],
    ["经营底座毛利(未扣退货/扣点税/广告)", summary.profitOpsBase.toFixed(2)],
    ["退货相关成本(损耗+二次包装)", summary.returnRelatedCost.toFixed(2)],
    ["损耗运费(已发货未成交)", summary.shippingLossTotal.toFixed(2)],
    ["广告+扣点税+退货相关合计吃掉", summary.marginEatenTotal.toFixed(2)],
    ["成本未匹配订单", summary.costUnmatchedOrders],
    ["账单交易收入", summary.billIncome.toFixed(2)],
    ["账单退款", summary.billRefund.toFixed(2)],
    ["技术服务费(净)", summary.techFee.toFixed(2)],
    ["其他费用", summary.otherFee.toFixed(2)],
    ["补贴", summary.subsidy.toFixed(2)],
    ["广告花费(仅推广日报按日合计)", summary.adSpend.toFixed(2)],
    ["广告交易额(推广日报)", summary.adGmv.toFixed(2)],
    ["广告ROI(交易额/花费)", summary.adRoi.toFixed(2)],
    ["账务推广费(已排除不扣毛利)", summary.billAdExpenseExcluded.toFixed(2)],
    ["提现(资金划出已排除)", summary.billWithdrawExcluded.toFixed(2)],
    ["广告分摊合计", summary.adAllocatedTotal.toFixed(2)],
    ["广告分摊方式", settings.adAllocateMode],
    ["毛利(未扣广告)", summary.estimatedProfitBeforeAd.toFixed(2)],
    ["毛利(扣广告)", summary.estimatedProfitAfterAd.toFixed(2)],
    ["毛利率", pct(summary.profitMargin)],
    ["对比月份", `${summary.prevMonth || "-"} → ${summary.latestMonth || "-"}`],
  ];

  // 时段对比表
  const periodTable: any[][] = [
    ["月份", "订单数", "商品总价", "商家实收", "退款率(笔)", "退款率(额)", "发货后退款率(笔)", "净运费", "损耗运费", "毛利(未扣广告)", "毛利(扣广告)", "毛利率", "环比毛利(扣广告)", "环比退款率(笔)"],
  ];
  for (let i = 0; i < months.length; i++) {
    const m = months[i];
    const prev = i > 0 ? months[i - 1] : null;
    periodTable.push([
      m.month,
      m.orderCount,
      m.goodsTotal.toFixed(2),
      m.merchantReceived.toFixed(2),
      pct(m.refundRateByCount),
      pct(m.refundRateByAmount),
      pct(m.postShipRefundRateByCount),
      m.netShippingTotal.toFixed(2),
      m.shippingLossTotal.toFixed(2),
      m.profitBeforeAd.toFixed(2),
      m.profitAfterAd.toFixed(2),
      pct(m.profitMargin),
      prev ? delta(m.profitAfterAd, prev.profitAfterAd).toFixed(2) : "-",
      prev ? pct(delta(m.refundRateByCount, prev.refundRateByCount)) : "-",
    ]);
  }

  const rateTable: any[][] = [
    ["指标", "笔数", "金额", "计算式(笔)", "笔数率", "金额率", "口径说明"],
    [
      "总退款",
      summary.refundOrderCount,
      summary.refundOrderAmount.toFixed(2),
      `${summary.refundOrderCount}/${summary.orderCount}`,
      pct(summary.refundRateByCount),
      pct(summary.refundRateByAmount),
      "未发货退+发货未收货退+已收货退，分母=全部订单",
    ],
    [
      "未发货退款",
      summary.unshippedRefundCount,
      summary.unshippedRefundAmount.toFixed(2),
      `${summary.unshippedRefundCount}/${summary.orderCount}`,
      summary.orderCount > 0 ? pct(summary.unshippedRefundCount / summary.orderCount) : "0%",
      goodsTotal > 0 ? pct(summary.unshippedRefundAmount / goodsTotal) : "0%",
      "状态=未发货，退款成功 / 全部订单",
    ],
    [
      "发货后退款",
      summary.postShipRefundCount,
      summary.postShipRefundAmount.toFixed(2),
      `${summary.postShipRefundCount}/${summary.shippedOrderCount}`,
      pct(summary.postShipRefundRateByCount),
      pct(summary.postShipRefundRateByAmount),
      "已发货后退款 / 已发货订单（含发货未收货退+已收货退）",
    ],
    [
      "发货未收货退款",
      summary.shipOnlyRefundCount,
      summary.shipOnlyRefundAmount.toFixed(2),
      `${summary.shipOnlyRefundCount}/${summary.shippedOrderCount}`,
      summary.shippedOrderCount > 0 ? pct(summary.shipOnlyRefundCount / summary.shippedOrderCount) : "0%",
      goodsTotal > 0 ? pct(summary.shipOnlyRefundAmount / goodsTotal) : "0%",
      "状态=已发货，退款成功（拦截/拒收）/ 已发货",
    ],
    [
      "退货退款(主=发货后全部退)",
      summary.returnRefundCount,
      summary.returnRefundAmount.toFixed(2),
      `${summary.returnRefundCount}/${summary.shippedOrderCount}`,
      pct(summary.returnRefundRateByCount),
      pct(summary.returnRefundRateByAmount),
      "已发货退款成功+已收货退款成功 / 已发货（体感退货主口径）",
    ],
    [
      "退货退款(辅=/全部订单)",
      summary.returnRefundCount,
      summary.returnRefundAmount.toFixed(2),
      `${summary.returnRefundCount}/${summary.orderCount}`,
      pct(summary.returnRefundRateOfAllByCount),
      pct(summary.returnRefundRateOfAllByAmount),
      "发货后全部退 / 全部订单",
    ],
    [
      "签收后退货(辅)",
      summary.signedReturnCount,
      summary.signedReturnAmount.toFixed(2),
      `${summary.signedReturnCount}/${summary.receivedRelatedCount}`,
      pct(summary.signedReturnRateByCount),
      pct(summary.signedReturnRateByAmount),
      "仅「已收货，退款成功」/ 已收货相关",
    ],
    [
      "已发货未成交",
      summary.shipNotDealCount,
      orderProfits.filter((o) => o.isShipNotDeal).reduce((sum, o) => sum + o.goodsTotal, 0).toFixed(2),
      `${summary.shipNotDealCount}/${summary.orderCount}`,
      orders.length > 0 ? pct(summary.shipNotDealCount / orders.length) : "0%",
      goodsTotal > 0
        ? pct(orderProfits.filter((o) => o.isShipNotDeal).reduce((sum, o) => sum + o.goodsTotal, 0) / goodsTotal)
        : "0%",
      "已发货且未成交(含退款/在途)",
    ],
  ];

  // 分快递公司运费汇总
  const expressMap = new Map<string, { count: number; weight: number; fee: number; net: number; loss: number }>();
  for (const o of orderProfits) {
    if (!o.isShipped) continue;
    const key = o.shipRuleLabel || o.expressCompany || "未知";
    const e = expressMap.get(key) || { count: 0, weight: 0, fee: 0, net: 0, loss: 0 };
    e.count += 1;
    e.weight += o.weightKg;
    e.fee += o.shippingFee;
    e.net += o.netShipping;
    e.loss += o.shippingLoss;
    expressMap.set(key, e);
  }
  const expressTable: any[][] = [
    ["运费规则/快递", "已发货单量", "总重量kg", "运费(毛)", "净运费", "损耗运费", "单均净运费"],
    ...Array.from(expressMap.entries())
      .sort((a, b) => b[1].fee - a[1].fee)
      .map(([k, v]) => [
        k,
        v.count,
        v.weight.toFixed(2),
        v.fee.toFixed(2),
        v.net.toFixed(2),
        v.loss.toFixed(2),
        v.count ? (v.net / v.count).toFixed(2) : "0",
      ]),
  ];

  const billTypeTable: any[][] = [
    ["账务类型", "收入", "支出", "净额", "笔数"],
    ...billByType.map((b) => [b.type, b.income.toFixed(2), b.expense.toFixed(2), b.net.toFixed(2), b.count]),
  ];

  const adTable: any[][] = [
    ["日期", "花费", "交易额", "净交易额", "结算交易额", "成交笔数", "投产比", "曝光", "点击", "店铺"],
    ...adDays.map((d) => [
      d.date, d.spend.toFixed(2), d.gmv.toFixed(2), d.netGmv.toFixed(2), d.settledGmv.toFixed(2),
      d.orders, Number(d.roi || 0).toFixed(2), d.impressions, d.clicks, d.shopName || "默认店铺",
    ]),
  ];

  const billWideTable: any[][] = [
    ["订单号", "交易收入", "退款", "技术服务费", "其他费用", "补贴", "账单净额", "流水行数"],
    ...Array.from(byOrder.values()).map((o) => [
      o.orderId, o.income.toFixed(2), o.refund.toFixed(2), o.techFee.toFixed(2),
      o.otherFee.toFixed(2), o.subsidy.toFixed(2), o.net.toFixed(2), o.lines,
    ]),
  ];

  const productMapTable: any[][] = [
    ["商品编码", "商品名称", "规格编码", "规格名称", "成本价", "包材成本", "重量kg", "单位成本(含包材)", "参考售价"],
    ...products.map((p) => [
      p.productCode, p.productName, p.skuCode, p.specName,
      p.costPrice.toFixed(2), p.packCost.toFixed(2), p.weightKg.toFixed(3),
      (p.costPrice + p.packCost).toFixed(2), p.salePrice.toFixed(2),
    ]),
  ];

  const shipLossRows = orderProfits.filter((o) => o.shippingLoss > 0 || o.returnLoss > 0 || o.repackCost > 0);
  const shipLossTable: any[][] = [
    ["订单号", "状态", "售后", "发货时间", "快递", "运费规则", "商品", "数量", "重量kg", "净运费(损耗)", "退货损耗", "二次包装", "包材", "商品总价", "毛利"],
    ...shipLossRows.map((o) => [
      o.orderId, o.status, o.afterSale, o.shipTime, o.expressCompany, o.shipRuleLabel,
      o.productName, o.qty, o.weightKg.toFixed(3), o.shippingLoss.toFixed(2),
      o.returnLoss.toFixed(2), o.repackCost.toFixed(2), o.packTotal.toFixed(2),
      o.goodsTotal.toFixed(2), o.estimatedProfit.toFixed(2),
    ]),
  ];

  const unmatchedTable: any[][] = [
    [
      "待补键",
      "商品名称",
      "规格名称",
      "商家编码-规格",
      "商家编码-商品",
      "商品ID",
      "关联订单数",
      "商家实收合计",
      "样例订单号",
      "建议操作",
    ],
    ...unmatchedSkus.map((u) => [
      u.key,
      u.productName,
      u.specName,
      u.merchantSku,
      u.merchantSpu,
      u.productId,
      u.count,
      u.amount.toFixed(2),
      u.sampleOrderIds,
      "在商品资料中按规格编码补成本/重量/包材；规格编码建议与订单「商家编码-规格」一致",
    ]),
  ];

  // 多店铺/账号对比
  type Agg = {
    orderCount: number;
    goodsTotal: number;
    merchantReceived: number;
    refundCount: number;
    postShipRefundCount: number;
    shippedCount: number;
    shipNotDealCount: number;
    costTotal: number;
    packTotal: number;
    netShipping: number;
    shippingLoss: number;
    returnLoss: number;
    repackCost: number;
    adAllocated: number;
    profitBefore: number;
    profitAfter: number;
    unmatched: number;
  };
  const emptyAgg = (): Agg => ({
    orderCount: 0,
    goodsTotal: 0,
    merchantReceived: 0,
    refundCount: 0,
    postShipRefundCount: 0,
    shippedCount: 0,
    shipNotDealCount: 0,
    costTotal: 0,
    packTotal: 0,
    netShipping: 0,
    shippingLoss: 0,
    returnLoss: 0,
    repackCost: 0,
    adAllocated: 0,
    profitBefore: 0,
    profitAfter: 0,
    unmatched: 0,
  });

  const shopMap = new Map<string, Agg>();
  for (const o of orderProfits) {
    const k = o.shopName || "默认店铺";
    const a = shopMap.get(k) || emptyAgg();
    a.orderCount += 1;
    a.goodsTotal += o.goodsTotal;
    a.merchantReceived += o.merchantReceived;
    if (o.isRefunded) a.refundCount += 1;
    if (o.isPostShipRefund) a.postShipRefundCount += 1;
    if (o.isShipped) a.shippedCount += 1;
    if (o.isShipNotDeal) a.shipNotDealCount += 1;
    a.costTotal += o.costTotal;
    a.packTotal += o.packTotal;
    a.netShipping += o.netShipping;
    a.shippingLoss += o.shippingLoss;
    a.returnLoss += o.returnLoss;
    a.repackCost += o.repackCost;
    a.adAllocated += o.adAllocated;
    a.profitBefore += o.estimatedProfit;
    a.profitAfter += o.estimatedProfitAfterAd;
    if (!o.costMatched) a.unmatched += 1;
    shopMap.set(k, a);
  }
  // 店铺广告花费（未分摊到单时也能展示）
  const shopTable: any[][] = [
    [
      "店铺/账号",
      "订单数",
      "商品总价",
      "商家实收",
      "退款率(笔)",
      "发货后退款率(笔)",
      "损耗运费",
      "净运费",
      "商品成本",
      "包材",
      "退货损耗",
      "二次包装",
      "广告花费",
      "分摊广告",
      "毛利(未扣广告)",
      "毛利(扣广告)",
      "毛利率",
      "未匹配成本单",
    ],
    ...Array.from(shopMap.entries())
      .sort((a, b) => b[1].merchantReceived - a[1].merchantReceived)
      .map(([shop, a]) => {
        const adShop = adSpendByShop.get(shop) || (useGlobalAd && shopMap.size === 1 ? adSpend : 0);
        const refundRate = a.orderCount ? a.refundCount / a.orderCount : 0;
        const psr = a.shippedCount ? a.postShipRefundCount / a.shippedCount : 0;
        const margin = a.merchantReceived > 0 ? a.profitAfter / a.merchantReceived : 0;
        return [
          shop,
          a.orderCount,
          a.goodsTotal.toFixed(2),
          a.merchantReceived.toFixed(2),
          pct(refundRate),
          pct(psr),
          a.shippingLoss.toFixed(2),
          a.netShipping.toFixed(2),
          a.costTotal.toFixed(2),
          a.packTotal.toFixed(2),
          a.returnLoss.toFixed(2),
          a.repackCost.toFixed(2),
          adShop.toFixed(2),
          a.adAllocated.toFixed(2),
          a.profitBefore.toFixed(2),
          a.profitAfter.toFixed(2),
          pct(margin),
          a.unmatched,
        ];
      }),
  ];

  // SPU / 规格毛利排行
  type RankAgg = Agg & {
    label: string;
    productName: string;
    specName: string;
    merchantSku: string;
    merchantSpu: string;
    productId: string;
    qty: number;
  };
  const emptyRank = (extra: Partial<RankAgg> = {}): RankAgg => ({
    ...emptyAgg(),
    label: "",
    productName: "",
    specName: "",
    merchantSku: "",
    merchantSpu: "",
    productId: "",
    qty: 0,
    ...extra,
  });

  const spuMap = new Map<string, RankAgg>();
  const skuMap = new Map<string, RankAgg>();
  for (const o of orderProfits) {
    const spuKey =
      o.merchantSpu ||
      o.productId ||
      o.productName ||
      "未知SPU";
    const spu = spuMap.get(spuKey) || emptyRank({
      label: spuKey,
      productName: o.productName,
      merchantSpu: o.merchantSpu,
      productId: o.productId,
    });
    spu.orderCount += 1;
    spu.qty += o.qty;
    spu.goodsTotal += o.goodsTotal;
    spu.merchantReceived += o.merchantReceived;
    if (o.isRefunded) spu.refundCount += 1;
    if (o.isPostShipRefund) spu.postShipRefundCount += 1;
    if (o.isShipped) spu.shippedCount += 1;
    spu.costTotal += o.costTotal;
    spu.packTotal += o.packTotal;
    spu.netShipping += o.netShipping;
    spu.shippingLoss += o.shippingLoss;
    spu.returnLoss += o.returnLoss;
    spu.repackCost += o.repackCost;
    spu.adAllocated += o.adAllocated;
    spu.profitBefore += o.estimatedProfit;
    spu.profitAfter += o.estimatedProfitAfterAd;
    if (!o.costMatched) spu.unmatched += 1;
    if (!spu.productName && o.productName) spu.productName = o.productName;
    spuMap.set(spuKey, spu);

    const skuKey =
      o.merchantSku ||
      `${o.productName}||${o.specName}` ||
      o.orderId;
    const sku = skuMap.get(skuKey) || emptyRank({
      label: skuKey,
      productName: o.productName,
      specName: o.specName,
      merchantSku: o.merchantSku,
      merchantSpu: o.merchantSpu,
      productId: o.productId,
    });
    sku.orderCount += 1;
    sku.qty += o.qty;
    sku.goodsTotal += o.goodsTotal;
    sku.merchantReceived += o.merchantReceived;
    if (o.isRefunded) sku.refundCount += 1;
    if (o.isPostShipRefund) sku.postShipRefundCount += 1;
    if (o.isShipped) sku.shippedCount += 1;
    sku.costTotal += o.costTotal;
    sku.packTotal += o.packTotal;
    sku.netShipping += o.netShipping;
    sku.shippingLoss += o.shippingLoss;
    sku.returnLoss += o.returnLoss;
    sku.repackCost += o.repackCost;
    sku.adAllocated += o.adAllocated;
    sku.profitBefore += o.estimatedProfit;
    sku.profitAfter += o.estimatedProfitAfterAd;
    if (!o.costMatched) sku.unmatched += 1;
    if (!sku.productName && o.productName) sku.productName = o.productName;
    if (!sku.specName && o.specName) sku.specName = o.specName;
    skuMap.set(skuKey, sku);
  }

  const rankRows = (map: Map<string, RankAgg>, kind: "spu" | "sku") => {
    const rows = Array.from(map.values()).sort((a, b) => b.profitAfter - a.profitAfter);
    const header =
      kind === "spu"
        ? [
            "排名",
            "SPU键",
            "商品名称",
            "商品编码",
            "商品ID",
            "订单数",
            "件数",
            "商品总价",
            "商家实收",
            "退款率(笔)",
            "成本",
            "包材",
            "净运费",
            "损耗运费",
            "分摊广告",
            "毛利(未扣广告)",
            "毛利(扣广告)",
            "毛利率",
            "未匹配单",
          ]
        : [
            "排名",
            "规格键",
            "商品名称",
            "规格名称",
            "商家编码-规格",
            "商品编码",
            "订单数",
            "件数",
            "商品总价",
            "商家实收",
            "退款率(笔)",
            "成本",
            "包材",
            "净运费",
            "损耗运费",
            "分摊广告",
            "毛利(未扣广告)",
            "毛利(扣广告)",
            "毛利率",
            "未匹配单",
          ];
    return [
      header,
      ...rows.map((a, idx) => {
        const refundRate = a.orderCount ? a.refundCount / a.orderCount : 0;
        const margin = a.merchantReceived > 0 ? a.profitAfter / a.merchantReceived : 0;
        if (kind === "spu") {
          return [
            idx + 1,
            a.label,
            a.productName,
            a.merchantSpu,
            a.productId,
            a.orderCount,
            a.qty,
            a.goodsTotal.toFixed(2),
            a.merchantReceived.toFixed(2),
            pct(refundRate),
            a.costTotal.toFixed(2),
            a.packTotal.toFixed(2),
            a.netShipping.toFixed(2),
            a.shippingLoss.toFixed(2),
            a.adAllocated.toFixed(2),
            a.profitBefore.toFixed(2),
            a.profitAfter.toFixed(2),
            pct(margin),
            a.unmatched,
          ];
        }
        return [
          idx + 1,
          a.label,
          a.productName,
          a.specName,
          a.merchantSku,
          a.merchantSpu,
          a.orderCount,
          a.qty,
          a.goodsTotal.toFixed(2),
          a.merchantReceived.toFixed(2),
          pct(refundRate),
          a.costTotal.toFixed(2),
          a.packTotal.toFixed(2),
          a.netShipping.toFixed(2),
          a.shippingLoss.toFixed(2),
          a.adAllocated.toFixed(2),
          a.profitBefore.toFixed(2),
          a.profitAfter.toFixed(2),
          pct(margin),
          a.unmatched,
        ];
      }),
    ];
  };

  const spuTable = rankRows(spuMap, "spu");
  const skuTable = rankRows(skuMap, "sku");

  // 推广分析：按日 + 汇总（仅日报，不含账务广告）
  const adAnalysisTable: any[][] = [
    ["区块", "日期/指标", "花费", "交易额", "ROI", "成交笔数", "曝光", "点击", "点击率", "说明"],
    ...adDays.map((d) => {
      const ctr = d.impressions > 0 ? d.clicks / d.impressions : 0;
      const roi = d.spend > 0 ? d.gmv / d.spend : Number(d.roi || 0);
      return [
        "按日",
        d.date,
        d.spend.toFixed(2),
        d.gmv.toFixed(2),
        roi.toFixed(2),
        d.orders,
        d.impressions,
        d.clicks,
        pct(ctr),
        d.shopName || "默认店铺",
      ];
    }),
    [
      "汇总",
      "推广日报合计(已排除汇总行/账务广告)",
      adSpend.toFixed(2),
      adGmv.toFixed(2),
      adRoi.toFixed(2),
      adDays.reduce((s, d) => s + d.orders, 0),
      adDays.reduce((s, d) => s + d.impressions, 0),
      adDays.reduce((s, d) => s + d.clicks, 0),
      pct(
        (() => {
          const imp = adDays.reduce((s, d) => s + d.impressions, 0);
          const clk = adDays.reduce((s, d) => s + d.clicks, 0);
          return imp > 0 ? clk / imp : 0;
        })(),
      ),
      `账务推广费已排除 ¥${(totals.adExpense || 0).toFixed(2)}`,
    ],
  ];

  // 产品退货退款率（体感口径：发货后全部退 / 已发货）
  type ProdRet = {
    code: string;
    productName: string;
    orderCount: number;
    shippedCount: number;
    returnCount: number;
    signedReturnCount: number;
    goodsTotal: number;
    shippedAmount: number;
    returnAmount: number;
  };
  const prodRetMap = new Map<string, ProdRet>();
  for (const o of orderProfits) {
    const code =
      o.merchantSku ||
      o.merchantSpu ||
      o.productId ||
      o.productName ||
      "未知";
    const r =
      prodRetMap.get(code) ||
      ({
        code,
        productName: o.productName || "",
        orderCount: 0,
        shippedCount: 0,
        returnCount: 0,
        signedReturnCount: 0,
        goodsTotal: 0,
        shippedAmount: 0,
        returnAmount: 0,
      } as ProdRet);
    r.orderCount += 1;
    r.goodsTotal += o.goodsTotal;
    if (o.isShipped) {
      r.shippedCount += 1;
      r.shippedAmount += o.goodsTotal;
    }
    if (o.isPostShipRefund) {
      r.returnCount += 1;
      r.returnAmount += o.goodsTotal;
    }
    if (o.isReturnRefund) r.signedReturnCount += 1;
    if (!r.productName && o.productName) r.productName = o.productName;
    prodRetMap.set(code, r);
  }
  const productReturnTable: any[][] = [
    [
      "商品编码/键",
      "商品名称",
      "订单数",
      "已发货单",
      "退货退款单(发货后)",
      "签收后退货单",
      "计算式(笔)",
      "退货退款率(主=发货后/已发货)",
      "退货退款率(辅=发货后/全部单)",
      "商品总价",
      "退货金额",
      "退货退款率(额=退额/已发货额)",
    ],
    ...Array.from(prodRetMap.values())
      .filter((r) => r.returnCount > 0 || r.shippedCount > 0)
      .sort((a, b) => {
        const ra = a.shippedCount ? a.returnCount / a.shippedCount : 0;
        const rb = b.shippedCount ? b.returnCount / b.shippedCount : 0;
        return rb - ra || b.returnCount - a.returnCount;
      })
      .map((r) => {
        const rateMain = r.shippedCount ? r.returnCount / r.shippedCount : 0;
        const rateAll = r.orderCount ? r.returnCount / r.orderCount : 0;
        const rateA = r.shippedAmount > 0 ? r.returnAmount / r.shippedAmount : 0;
        return [
          r.code,
          r.productName,
          r.orderCount,
          r.shippedCount,
          r.returnCount,
          r.signedReturnCount,
          `${r.returnCount}/${r.shippedCount}`,
          pct(rateMain),
          pct(rateAll),
          r.goodsTotal.toFixed(2),
          r.returnAmount.toFixed(2),
          pct(rateA),
        ];
      }),
  ];

  // 最亏规格 Top5
  const lossSkuTop = Array.from(skuMap.values())
    .sort((a, b) => a.profitAfter - b.profitAfter)
    .slice(0, 5);
  // 高退款规格 Top5（按退款率，至少 3 单）
  const highRefundSkuTop = Array.from(skuMap.values())
    .filter((a) => a.orderCount >= 3)
    .map((a) => ({
      ...a,
      refundRate: a.orderCount ? a.refundCount / a.orderCount : 0,
    }))
    .sort((a, b) => b.refundRate - a.refundRate || b.refundCount - a.refundCount)
    .slice(0, 5);

  const lossDiagnosisTable: any[][] = [
    ["诊断项", "金额/指标", "说明"],
    ["广告花费(推广日报)", adSpend.toFixed(2), "仅日报按日相加；账务推广已排除"],
    [
      "账务推广费(已排除)",
      (totals.adExpense || 0).toFixed(2),
      "财务报表与推广重复项，不扣毛利",
    ],
    [
      "提现(已排除)",
      (totals.withdraw || 0).toFixed(2),
      "提现是资金划出，不是经营支出",
    ],
    ["损耗运费(已发货未成交)", shippingLossTotal.toFixed(2), "发出去但未成交的运费成本"],
    ["退货入库损耗", returnLossTotal.toFixed(2), "发货后退款按损耗比例计"],
    ["二次包装/入库", repackCostTotal.toFixed(2), "发货后退款二次包装"],
    ["品牌扣点", brandPointTotal.toFixed(2), `设定 ${settings.brandPointPct || 0}%`],
    ["电商税", ecommerceTaxTotal.toFixed(2), `设定 ${settings.ecommerceTaxPct || 0}%`],
    [
      "未匹配成本订单数",
      String(costUnmatchedOrders),
      `涉及商家实收 ¥${costUnmatchedAmount.toFixed(2)}`,
    ],
    ["毛利(未扣广告)", profitBefore.toFixed(2), ""],
    ["毛利(扣广告)", profitAfter.toFixed(2), ""],
    ["— 高退款规格 Top5 —", "", "订单≥3，按总退款率"],
    ...highRefundSkuTop.map((a, i) => [
      `高退款#${i + 1} ${a.productName || a.label}`,
      pct(a.orderCount ? a.refundCount / a.orderCount : 0),
      `规格:${a.specName || a.merchantSku || a.label} | 退${a.refundCount}/${a.orderCount}单 | 毛利¥${a.profitAfter.toFixed(2)}`,
    ]),
    ["— 最亏规格 Top5 —", "", "按扣广告毛利从低到高"],
    ...lossSkuTop.map((a, i) => [
      `最亏#${i + 1} ${a.productName || a.label}`,
      a.profitAfter.toFixed(2),
      `规格:${a.specName || a.merchantSku || a.label} | 单量${a.orderCount} | 退款率${pct(a.orderCount ? a.refundCount / a.orderCount : 0)}`,
    ]),
  ];

  const bossOnePagerTable: any[][] = [
    ["老板一页纸", "数值"],
    ["统计订单数", summary.orderCount],
    ["GMV(商品总价)", summary.goodsTotal.toFixed(2)],
    ["商家实收", summary.merchantReceived.toFixed(2)],
    ["总退款率(笔/额)", `${pct(summary.refundRateByCount)} / ${pct(summary.refundRateByAmount)}`],
    [
      "发货后退款率(笔/额)",
      `${pct(summary.postShipRefundRateByCount)} / ${pct(summary.postShipRefundRateByAmount)}`,
    ],
    [
      "退货退款率(主, 发货后全部退/已发货)",
      `${pct(summary.returnRefundRateByCount)} / ${pct(summary.returnRefundRateByAmount)}  (${summary.returnRefundCount}/${summary.shippedOrderCount})`,
    ],
    [
      "退货退款率(辅, /全部订单)",
      `${pct(summary.returnRefundRateOfAllByCount)} / ${pct(summary.returnRefundRateOfAllByAmount)}  (${summary.returnRefundCount}/${summary.orderCount})`,
    ],
    [
      "签收后退货率(辅)",
      `${pct(summary.signedReturnRateByCount)}  (${summary.signedReturnCount}/${summary.receivedRelatedCount})`,
    ],
    ["广告花费(推广日报)", summary.adSpend.toFixed(2)],
    ["广告交易额", summary.adGmv.toFixed(2)],
    ["广告ROI", summary.adRoi.toFixed(2)],
    ["净运费", summary.netShippingTotal.toFixed(2)],
    ["损耗运费", summary.shippingLossTotal.toFixed(2)],
    [`品牌扣点(${summary.brandPointPct}%)`, summary.brandPointTotal.toFixed(2)],
    [`电商税(${summary.ecommerceTaxPct}%)`, summary.ecommerceTaxTotal.toFixed(2)],
    ["经营底座毛利", summary.profitOpsBase.toFixed(2)],
    ["退货相关吃掉", summary.returnRelatedCost.toFixed(2)],
    ["广告+扣点税+退货相关合计吃掉", summary.marginEatenTotal.toFixed(2)],
    ["毛利(未扣广告)", summary.estimatedProfitBeforeAd.toFixed(2)],
    ["毛利(扣广告)", summary.estimatedProfitAfterAd.toFixed(2)],
    ["毛利率(扣广告)", pct(summary.profitMargin)],
    ["待补成本SKU数", unmatchedSkus.length],
    ["待补成本订单数", summary.costUnmatchedOrders],
    ["— Top亏规格 —", ""],
    ...lossSkuTop.map((a, i) => [
      `亏#${i + 1} ${(a.productName || a.label).slice(0, 24)}`,
      `¥${a.profitAfter.toFixed(2)} | ${a.specName || a.merchantSku || ""} | ${a.orderCount}单`,
    ]),
    ["生成时间", new Date().toISOString().slice(0, 19).replace("T", " ")],
  ];

  // ========== 异常订单 / 规格（找坑） ==========
  const orderHeader = [
    "异常类型",
    "店铺",
    "订单号",
    "商品",
    "规格",
    "商家编码",
    "状态",
    "商品总价",
    "确认收入",
    "商品成本",
    "净运费",
    "品牌扣点",
    "电商税",
    "分摊广告",
    "毛利(未扣广告)",
    "毛利(扣广告)",
    "成本匹配",
  ];
  const orderRow = (o: OrderProfitRow, tag: string) => [
    tag,
    o.shopName,
    o.orderId,
    o.productName,
    o.specName,
    o.merchantSku || o.merchantSpu,
    o.status,
    o.goodsTotal.toFixed(2),
    o.revenue.toFixed(2),
    o.costTotal.toFixed(2),
    o.netShipping.toFixed(2),
    o.brandPointFee.toFixed(2),
    o.ecommerceTaxFee.toFixed(2),
    o.adAllocated.toFixed(2),
    o.estimatedProfit.toFixed(2),
    o.estimatedProfitAfterAd.toFixed(2),
    o.costMatched ? "是" : "否",
  ];

  const negOrders = orderProfits
    .filter((o) => o.estimatedProfitAfterAd < 0)
    .sort((a, b) => a.estimatedProfitAfterAd - b.estimatedProfitAfterAd);
  const anomalyNegProfitTable: any[][] = [
    orderHeader,
    ...negOrders.map((o) => orderRow(o, "负毛利")),
  ];

  const unmatchedOrders = orderProfits
    .filter((o) => !o.costMatched)
    .sort((a, b) => b.merchantReceived - a.merchantReceived);
  const anomalyUnmatchedTable: any[][] = [
    orderHeader,
    ...unmatchedOrders.map((o) => orderRow(o, "未匹配成本")),
  ];

  // 扣点/税前非负、扣后变亏
  const feeFlipOrders = orderProfits
    .filter((o) => {
      const fee = (o.brandPointFee || 0) + (o.ecommerceTaxFee || 0);
      if (fee <= 0) return false;
      const beforeFee = o.estimatedProfit + fee; // 加回扣点税
      return beforeFee >= 0 && o.estimatedProfit < 0;
    })
    .sort((a, b) => a.estimatedProfit - b.estimatedProfit);
  const anomalyFeeFlipTable: any[][] = [
    orderHeader,
    ...feeFlipOrders.map((o) => orderRow(o, "扣点税后变亏")),
  ];

  // 高逆向规格：发货后逆向率≥30% 且 已发货≥3
  type SkuAnom = {
    label: string;
    productName: string;
    specName: string;
    orderCount: number;
    shipped: number;
    postShip: number;
    refund: number;
    profitAfter: number;
  };
  const skuAnomMap = new Map<string, SkuAnom>();
  for (const o of orderProfits) {
    const label =
      o.merchantSku || o.specName || o.productName || o.productId || o.orderId;
    const a =
      skuAnomMap.get(label) ||
      ({
        label,
        productName: o.productName || "",
        specName: o.specName || "",
        orderCount: 0,
        shipped: 0,
        postShip: 0,
        refund: 0,
        profitAfter: 0,
      } as SkuAnom);
    a.orderCount += 1;
    if (o.isShipped) a.shipped += 1;
    if (o.isPostShipRefund) a.postShip += 1;
    if (o.isRefunded) a.refund += 1;
    a.profitAfter += o.estimatedProfitAfterAd;
    if (!a.productName && o.productName) a.productName = o.productName;
    if (!a.specName && o.specName) a.specName = o.specName;
    skuAnomMap.set(label, a);
  }
  const highRefundSkus = Array.from(skuAnomMap.values())
    .filter((a) => a.shipped >= 3)
    .map((a) => ({
      ...a,
      postShipRate: a.shipped ? a.postShip / a.shipped : 0,
      refundRate: a.orderCount ? a.refund / a.orderCount : 0,
    }))
    .filter((a) => a.postShipRate >= 0.3)
    .sort((a, b) => b.postShipRate - a.postShipRate || b.postShip - a.postShip);

  const anomalyHighRefundSkuTable: any[][] = [
    [
      "规格键",
      "商品",
      "规格",
      "订单数",
      "已发货",
      "发货后退款",
      "发货后逆向率",
      "总退款率",
      "毛利(扣广告)",
    ],
    ...highRefundSkus.map((a) => [
      a.label,
      a.productName,
      a.specName,
      a.orderCount,
      a.shipped,
      a.postShip,
      pct(a.postShipRate),
      pct(a.refundRate),
      a.profitAfter.toFixed(2),
    ]),
  ];

  const anomalySummaryTable: any[][] = [
    ["异常项", "数量", "说明"],
    ["负毛利订单", negOrders.length, "扣广告后毛利 < 0"],
    ["未匹配成本订单", unmatchedOrders.length, "商品成本未匹配到商品资料"],
    ["扣点税后变亏订单", feeFlipOrders.length, "扣点/税前毛利≥0，扣后 < 0"],
    [
      "高逆向规格",
      highRefundSkus.length,
      "已发货≥3 且 发货后逆向率≥30%",
    ],
    [
      "负毛利金额合计",
      negOrders.reduce((s, o) => s + o.estimatedProfitAfterAd, 0).toFixed(2),
      "负毛利订单的毛利(扣广告)合计",
    ],
  ];

  return {
    summary,
    orderProfits,
    billByType,
    adDays,
    unmatchedSkus,
    orderTable,
    summaryTable,
    billTypeTable,
    adTable,
    billWideTable,
    productMapTable,
    shipLossTable,
    rateTable,
    periodTable,
    expressTable,
    unmatchedTable,
    shopTable,
    spuTable,
    skuTable,
    adAnalysisTable,
    productReturnTable,
    lossDiagnosisTable,
    bossOnePagerTable,
    anomalySummaryTable,
    anomalyNegProfitTable,
    anomalyUnmatchedTable,
    anomalyFeeFlipTable,
    anomalyHighRefundSkuTable,
  };
}


export function ingestForOperating(fileData: FileData): {
  kind: SourceKind;
  orders: PddOrder[];
  billLines: PddBillLine[];
  products: ProductSku[];
  adDays: AdDay[];
  billRecord?: BillRecord;
  skuMappings?: SKUMapping[];
  normalized: FileData;
} {
  const normalized = normalizeFileData(fileData);
  // improve platform detection side-effect via name
  const kind = detectSourceKind(normalized);
  if (kind === "pdd_orders") {
    return { kind, orders: parsePddOrders(normalized), billLines: [], products: [], adDays: [], normalized };
  }
  if (kind === "pdd_bill") {
    const billLines = parsePddBillLines(normalized);
    return {
      kind,
      orders: [],
      billLines,
      products: [],
      adDays: [],
      billRecord: billRecordFromPdd(normalized, billLines),
      normalized,
    };
  }
  if (kind === "product_master") {
    const products = parseProductMaster(normalized);
    return {
      kind,
      orders: [],
      billLines: [],
      products,
      adDays: [],
      skuMappings: productsToSkuMappings(products),
      normalized,
    };
  }
  if (kind === "ad_daily") {
    return { kind, orders: [], billLines: [], products: [], adDays: parseAdDaily(normalized), normalized };
  }
  return { kind: "unknown", orders: [], billLines: [], products: [], adDays: [], normalized };
}

export function sourceKindLabel(kind: SourceKind): string {
  switch (kind) {
    case "pdd_orders":
      return "拼多多订单";
    case "pdd_bill":
      return "拼多多账务明细";
    case "product_master":
      return "商品资料/成本";
    case "ad_daily":
      return "推广分天数据";
    default:
      return "未知类型";
  }
}
