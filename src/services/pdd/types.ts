/**
 * 拼多多经营分析 - 类型与默认成本/快递参数
 */
import type { RefundKind } from "../refundAnalysis";

export type SourceKind =
  | "pdd_orders"
  | "pdd_bill"
  | "product_master"
  | "ad_daily"
  | "ad_product"
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
  /** 实际投产比 = 交易额/花费 */
  roi: number;
  /** 净实际投产比 = 净交易额/花费 */
  netRoi: number;
  /** 结算投产比 = 结算交易额/花费 */
  settledRoi: number;
  impressions: number;
  clicks: number;
  shopName?: string;
}

/** 商品推广汇总（按商品ID真实归属，非均摊） */
export interface AdProduct {
  productId: string;
  productName: string;
  campaignName: string;
  /** 总花费(元) */
  spend: number;
  /** 成交花费(元) */
  dealSpend: number;
  gmv: number;
  netGmv: number;
  settledGmv: number;
  orders: number;
  roi: number;
  netRoi: number;
  settledRoi: number;
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
  /**
   * 订单无商家编码（规格/商品）时，按「商品规格」匹配商品资料。
   * 关掉则无编码订单不走规格/品名匹配，避免误匹配。
   */
  matchBySpecWhenNoCode: boolean;
  /** 高逆向规格：发货后逆向率阈值 0-1，默认 0.3 */
  anomalyHighRefundRate: number;
  /** 高逆向规格：最少已发货单量，默认 3 */
  anomalyHighRefundMinShipped: number;
  /**
   * 账务「平台费」(技术服务费/其他费用) 是否进毛利。
   * 与品牌扣点、电商税无关——后两者仅在参数区填写后才计提。
   * - both / bill_first: 账务平台费进毛利（bill_first 为历史别名，行为同 both）
   * - settings_only: 账务平台费仅展示，不进毛利
   */
  feeStackMode: "both" | "bill_first" | "settings_only";
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
  adAllocateMode: "none", // 广告不均摊到单/商品；整体可在汇总扣总花费
  brandPointPct: 0,
  ecommerceTaxPct: 0,
  feeBaseMode: "revenue",
  shopFeeOverrides: [],
  expressRules: DEFAULT_EXPRESS_RULES.map((r) => ({ ...r })),
  matchBySpecWhenNoCode: true,
  anomalyHighRefundRate: 0.3,
  anomalyHighRefundMinShipped: 3,
  feeStackMode: "both",
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
  /** 是否命中配置的快递规则（未命中走默认首重续重） */
  expressRuleMatched: boolean;
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
  refundKind: RefundKind;
  refundAmount: number;
  refundRatio: number;
  residualRatio: number;
  refundCompareNote: string;
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
  /** 确认收入合计（部分退后的有效收入） */
  confirmedRevenue: number;
  buyerPaid: number;
  refundOrderCount: number;
  refundOrderAmount: number;
  fullRefundCount: number;
  partialRefundCount: number;
  refundCashTotal: number;
  partialRefundResidualRevenue: number;
  refundVsReceivedGapTotal: number;
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
  adNetGmv: number;
  adSettledGmv: number;
  adRoi: number;
  adNetRoi: number;
  adSettledRoi: number;
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
  /** 未命中运费规则的快递公司 */
  expressAlertTable: any[][];
  /** 成本匹配方式分布 */
  matchMethodTable: any[][];
  unmatchedTable: any[][];
  shopTable: any[][];
  spuTable: any[][];
  skuTable: any[][];
  /** 按编码销售排行（销量优先） */
  salesRankSkuTable: any[][];
  salesRankSpuTable: any[][];
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
  /** 部分退 / 实收与退款比对异常 */
  anomalyPartialRefundTable: any[][];
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





/** 商品ID/编码：避免 Excel 科学计数法、尾部 .0 */


/** 列定位：先精确匹配，再 includes（避免「商品」误伤） */


