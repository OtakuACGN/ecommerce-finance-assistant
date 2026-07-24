/**
 * 经营报表 buildOperatingReport
 */
import { analyzeOrderRefund } from "../refundAnalysis";
import type {
  PddOrder,
  PddBillLine,
  ProductSku,
  AdDay,
  AdProduct,
  CostSettings,
  OperatingReport,
  OrderProfitRow,
  UnmatchedSkuRow,
  MonthMetrics,
  OperatingSummary,
} from "./types";
import { DEFAULT_COST_SETTINGS } from "./types";
import { resolveShopFeeRates } from "./costSettings";
import {
  calcShippingFee,
  isOrderRefunded,
  isOrderShipped,
  isOrderCompleted,
  isPostShipRefund,
  isReturnRefund,
  isShipNotDeal,
  dealMonthOf,
  normalizeShopName,
  matchProduct,
  buildProductIndexes,
} from "./logistics";
import { aggregatePddBill } from "./parse";

export function buildOperatingReport(
  orders: PddOrder[],
  billLines: PddBillLine[],
  products: ProductSku[],
  adDays: AdDay[],
  settings: CostSettings = DEFAULT_COST_SETTINGS,
  adProducts: AdProduct[] = [],
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
  const adSpendDaily = adDays.reduce((s, d) => s + d.spend, 0);
  const adSpendProduct = adProducts.reduce((s, a) => s + (a.spend || 0), 0);
  // 有商品推广汇总时优先用商品真实花费（避免与分天重复相加）
  const adSpend = adSpendProduct > 0 ? adSpendProduct : adSpendDaily;
  const adGmv =
    adSpendProduct > 0
      ? adProducts.reduce((s, a) => s + (a.gmv || 0), 0)
      : adDays.reduce((s, d) => s + d.gmv, 0);
  const adNetGmv =
    adSpendProduct > 0
      ? adProducts.reduce((s, a) => s + (a.netGmv || 0), 0)
      : adDays.reduce((s, d) => s + (d.netGmv || 0), 0);
  const adSettledGmv =
    adSpendProduct > 0
      ? adProducts.reduce((s, a) => s + (a.settledGmv || 0), 0)
      : adDays.reduce((s, d) => s + (d.settledGmv || 0), 0);
  const adByProductId = new Map<string, number>();
  for (const a of adProducts) {
    const id = String(a.productId || "").trim().replace(/\.0$/, "");
    if (!id) continue; // 无商品ID不匹配（禁止品名兜底）
    adByProductId.set(id, (adByProductId.get(id) || 0) + (a.spend || 0));
  }
  const normProductId = (raw: string) => String(raw || "").trim().replace(/\.0$/, "");
  /** 仅商品ID精确匹配推广花费（排行/挂表用） */
  const lookupProductAd = (productId: string) => {
    const id = normProductId(productId);
    if (!id) return 0;
    return adByProductId.get(id) || 0;
  };

  // 广告按店铺分摊（多店对比时各店互不串）
  const adSpendByShop = new Map<string, number>();
  for (const d of adDays) {
    const shop = normalizeShopName(d.shopName);
    adSpendByShop.set(shop, (adSpendByShop.get(shop) || 0) + d.spend);
  }
  // 先比对商家实收 vs 账务退款，识别全额/部分退；广告分摊排除全额退，部分退按保留占比计基数
  const refundPre = orders.map((o) => {
    const bill = byOrder.get(o.orderId);
    return analyzeOrderRefund(o, bill || null, isOrderRefunded(o));
  });
  const orderMeta = orders.map((o, i) => {
    const shop = normalizeShopName(o.shopName);
    const rk = refundPre[i];
    let allocBase = 0;
    if (/已取消/.test(String(o.status || "")) || rk.refundKind === "full") {
      allocBase = 0;
    } else if (rk.refundKind === "partial") {
      const base = o.goodsTotal > 0 ? o.goodsTotal : Math.max(0, o.merchantReceived);
      allocBase = Math.max(0, base * rk.residualRatio);
    } else {
      allocBase = o.goodsTotal > 0 ? o.goodsTotal : 0;
    }
    return {
      orderId: o.orderId,
      shop,
      goodsTotal: o.goodsTotal,
      allocBase,
      residualRatio: rk.residualRatio,
      refundKind: rk.refundKind,
    };
  });
  const allocBaseByShop = new Map<string, number>();
  const orderCountByShop = new Map<string, number>();
  for (const m of orderMeta) {
    allocBaseByShop.set(m.shop, (allocBaseByShop.get(m.shop) || 0) + m.allocBase);
    if (m.refundKind !== "full") {
      orderCountByShop.set(m.shop, (orderCountByShop.get(m.shop) || 0) + 1);
    }
  }
  const totalAllocBase = orderMeta.reduce((s, o) => s + o.allocBase, 0);
  const orderCountForAd = Math.max(
    1,
    orderMeta.filter((m) => m.refundKind !== "full").length,
  );
  // 商品ID维度成交基数：用于把该商品推广花费摊到同商品订单（非全店均摊）
  const productAllocBase = new Map<string, number>();
  for (let i = 0; i < orders.length; i++) {
    const m = orderMeta[i];
    if (!m || m.refundKind === "full") continue;
    const pid = normProductId(orders[i].productId || "");
    if (!pid) continue;
    productAllocBase.set(pid, (productAllocBase.get(pid) || 0) + m.allocBase);
  }
  // 若广告未打店铺标签且仅有默认店铺花费，则仍按全局分摊（兼容单店）
  const adShops = Array.from(adSpendByShop.keys());
  const useGlobalAd =
    adShops.length === 0 ||
    (adShops.length === 1 && adShops[0] === "默认店铺");

  const orderProfits: OrderProfitRow[] = orders.map((o, idx) => {
    const matched = matchProduct(o, indexes, settings);
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

    const bill = byOrder.get(o.orderId);
    const billIncome = bill?.income || 0;
    const billRefund = bill?.refund || 0;
    const techFee = bill?.techFee || 0;
    const otherFee = bill?.otherFee || 0;
    const subsidy = bill?.subsidy || 0;
    const billNet = bill ? bill.net : o.merchantReceived;

    // 比对商家实收 vs 账务退款，识别全额/部分退，并确定确认收入（与广告分摊预分析一致）
    const refundInfo = refundPre[idx] || analyzeOrderRefund(o, bill || null, refunded);
    const revenue = refundInfo.revenue;
    const residualRatio = refundInfo.residualRatio;
    const refundRatio = refundInfo.refundRatio;
    const refundKind = refundInfo.refundKind;
    const refundAmount = refundInfo.refundAmount;
    const refundCompareNote = refundInfo.compareNote;

    const unitCost = matched.costPrice;
    const fullProductCost = unitCost * o.qty;
    const packTotal = shipped ? packUnit * o.qty : 0;

    // 成本：未退=原规则；全额退=可计全额或入库损耗；部分退=保留部分计成本，退回部分按开关
    let costTotal = 0;
    let returnLoss = 0;
    let repackCost = 0;
    if (refundKind === "none") {
      let chargeProductCost = false;
      if (completed) chargeProductCost = true;
      else if (shipped && !refunded) chargeProductCost = true;
      costTotal = chargeProductCost ? fullProductCost : 0;
    } else if (refundKind === "partial") {
      // 部分退：收入只扣退款额（revenue=保留）；成本按保留比例计，退回部分可计损耗
      const keptCost = fullProductCost * residualRatio;
      const refundedCostBase = fullProductCost * refundRatio;
      if (settings.countProductCostOnRefundedShip) {
        costTotal = fullProductCost;
        returnLoss = 0;
      } else {
        costTotal = keptCost;
        returnLoss =
          postShipRefund || shipped
            ? refundedCostBase * Math.max(0, Math.min(1, settings.returnRestockRate || 0))
            : 0;
      }
      repackCost =
        (postShipRefund || shipped) && refundRatio > 0.01
          ? Math.max(0, settings.returnRepackCost || 0)
          : 0;
    } else {
      // full / unknown refund
      if (postShipRefund && settings.countProductCostOnRefundedShip) {
        costTotal = fullProductCost;
        returnLoss = 0;
      } else if (postShipRefund) {
        costTotal = 0;
        returnLoss =
          fullProductCost * Math.max(0, Math.min(1, settings.returnRestockRate || 0));
      } else {
        costTotal = 0;
        returnLoss = 0;
      }
      repackCost = postShipRefund ? Math.max(0, settings.returnRepackCost || 0) : 0;
    }

    const unitWeight = matched.weightKg > 0 ? matched.weightKg : settings.defaultWeightKg;
    const weightKg = unitWeight * o.qty;
    const shipCalc = shipped
      ? calcShippingFee(weightKg, settings, o.expressCompany)
      : { fee: 0, ruleLabel: "-", ruleMatched: true };
    const shippingFee = shipCalc.fee;
    const postageIncome = settings.usePostageIncome ? Math.max(0, o.postage || 0) : 0;
    const netShipping = Math.max(0, shippingFee - postageIncome);
    // 展示用：已发货未成交的净运费（主毛利只扣 netShipping，不再重复扣 shippingLoss）
    const shippingLoss = shipNotDeal ? netShipping : 0;

    // 推广费分摊：
    // - by_product：有商品推广时按商品ID分到该商品订单（非全店均摊；无ID=0）
    // - by_gmv / by_order_count：强制全店均摊（不推荐）
    // - none：订单明细分摊=0，汇总仍扣总广告
    const shopName = normalizeShopName(o.shopName);
    let adAllocated = 0;
    const metaAlloc = orderMeta[idx]?.allocBase ?? 0;
    const mode = settings.adAllocateMode || "by_product";
    if (refundKind !== "full") {
      if (mode === "by_product") {
        const pid = normProductId(o.productId || "");
        const productSpend = pid ? adByProductId.get(pid) || 0 : 0;
        const base = pid ? productAllocBase.get(pid) || 0 : 0;
        if (productSpend > 0 && base > 0 && metaAlloc > 0) {
          adAllocated = (metaAlloc / base) * productSpend;
        }
      } else if (mode !== "none") {
        if (useGlobalAd) {
          if (mode === "by_gmv" && totalAllocBase > 0 && adSpend > 0) {
            adAllocated = (metaAlloc / totalAllocBase) * adSpend;
          } else if (mode === "by_order_count" && adSpend > 0) {
            adAllocated = adSpend / orderCountForAd;
          }
        } else {
          const shopSpend = adSpendByShop.get(shopName) || 0;
          if (mode === "by_gmv") {
            const base = allocBaseByShop.get(shopName) || 0;
            if (base > 0 && shopSpend > 0) adAllocated = (metaAlloc / base) * shopSpend;
          } else if (mode === "by_order_count") {
            const cnt = orderCountByShop.get(shopName) || 1;
            if (shopSpend > 0) adAllocated = shopSpend / cnt;
          }
        }
      }
    }

    const billPlatformFees = techFee + otherFee;
    // 品牌扣点 / 电商税：与账务平台费独立；仅按参数区/店铺覆盖填写计提（默认 0=不填）
    const shopRates = resolveShopFeeRates(settings, o.shopName || "");
    const feeBase =
      shopRates.feeBaseMode === "goodsTotal"
        ? Math.max(0, o.goodsTotal || 0)
        : shopRates.feeBaseMode === "merchantReceived"
          ? Math.max(0, o.merchantReceived || 0)
          : Math.max(0, revenue);
    const brandPct = Math.max(0, Number(shopRates.brandPointPct) || 0);
    const taxPct = Math.max(0, Number(shopRates.ecommerceTaxPct) || 0);
    const brandPointFee = feeBase * (brandPct / 100);
    const ecommerceTaxFee = feeBase * (taxPct / 100);
    // 仅控制账务技术服务费/其他费用是否进毛利；绝不覆盖品牌扣点
    const feeStackMode = settings.feeStackMode || "both";
    let fees = billPlatformFees;
    if (feeStackMode === "settings_only") {
      fees = 0;
    }
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
      expressRuleMatched: shipped ? !!shipCalc.ruleMatched : true,
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
      refundKind,
      refundAmount,
      refundRatio,
      residualRatio,
      refundCompareNote,
    };
  });

  const goodsTotal = orders.reduce((s, o) => s + o.goodsTotal, 0);
  const merchantReceived = orders.reduce((s, o) => s + o.merchantReceived, 0);
  const buyerPaid = orders.reduce((s, o) => s + o.buyerPaid, 0);

  const refundOrders = orderProfits.filter((o) => o.isRefunded);
  const refundOrderCount = refundOrders.length;
  const refundOrderAmount = refundOrders.reduce((s, o) => s + o.goodsTotal, 0);
  const fullRefundOrders = orderProfits.filter((o) => o.refundKind === "full");
  const partialRefundOrders = orderProfits.filter((o) => o.refundKind === "partial");
  const fullRefundCount = fullRefundOrders.length;
  const partialRefundCount = partialRefundOrders.length;
  const refundCashTotal = orderProfits.reduce((s, o) => s + (o.refundAmount || 0), 0);
  const partialRefundResidualRevenue = partialRefundOrders.reduce(
    (s, o) => s + o.revenue,
    0,
  );
  // 退款单上：账务/推断实退 - 仍保留的商家实收（正=退得多于实收残留解释，负=实收仍高于退款）
  const refundVsReceivedGapTotal = refundOrders.reduce((s, o) => {
    return s + ((o.refundAmount || 0) - (o.merchantReceived || 0));
  }, 0);
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
  const confirmedRevenue = orderProfits.reduce((s, o) => s + (o.revenue || 0), 0);
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
  // 由单笔毛利反推底座，自动兼容 feeStackMode（settings_only 不扣账务 tech 等）
  const profitOpsBase = orderProfits.reduce((s, o) => {
    return (
      s +
      o.estimatedProfit +
      o.returnLoss +
      o.repackCost +
      o.brandPointFee +
      o.ecommerceTaxFee
    );
  }, 0);
  const returnRelatedCost = returnLossTotal + repackCostTotal;
  // 不含损耗运费：主毛利已扣 netShipping，损耗运费仅作展示项，避免叙事重复
  const marginEatenTotal =
    returnRelatedCost +
    brandPointTotal +
    ecommerceTaxTotal +
    adSpend;
  const costMatchedOrders = orderProfits.filter((o) => o.costMatched).length;
  const costUnmatchedAmount = orderProfits
    .filter((o) => !o.costMatched)
    .reduce((s, o) => s + o.merchantReceived, 0);

  let profitBefore = orderProfits.reduce((s, o) => s + o.estimatedProfit, 0);
  if (orders.length === 0 && billLines.length > 0) profitBefore = totals.net;
  // 汇总始终扣总广告：订单已摊 + 未摊到单的部分（none/无商品ID/未匹配推广）
  const profitAfterOrders = orderProfits.reduce((s, o) => s + o.estimatedProfitAfterAd, 0);
  const unallocatedAd = Math.max(0, adSpend - adAllocatedTotal);
  let profitAfter = profitAfterOrders - unallocatedAd;
  const profitMargin = merchantReceived > 0 ? profitAfter / merchantReceived : 0;

  // 按月汇总 + 时段对比
  const monthMap = new Map<string, OrderProfitRow[]>();
  for (const o of orderProfits) {
    const m = o.dealMonth || "未知";
    if (!monthMap.has(m)) monthMap.set(m, []);
    monthMap.get(m)!.push(o);
  }
  // 分天广告按自然月汇总；无分天时按各月商家实收占比分摊总广告
  const adSpendByMonth = new Map<string, number>();
  for (const d of adDays) {
    const raw = String(d.date || "").trim();
    const m = raw.match(/(\d{4})[-/年.](\d{1,2})/);
    if (!m) continue;
    const key = `${m[1]}-${String(m[2]).padStart(2, "0")}`;
    adSpendByMonth.set(key, (adSpendByMonth.get(key) || 0) + (d.spend || 0));
  }
  const monthMrTotal = Array.from(monthMap.entries())
    .filter(([m]) => m !== "未知")
    .reduce((s, [, rows]) => s + rows.reduce((ss, r) => ss + r.merchantReceived, 0), 0);

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
      const allocated = rows.reduce((s, r) => s + r.adAllocated, 0);
      // 该月应扣广告：优先分天；否则按实收占比；且不少于已摊到单的金额
      let monthAd = adSpendByMonth.get(month) || 0;
      if (monthAd <= 0 && adSpend > 0 && monthMrTotal > 0) {
        monthAd = (mr / monthMrTotal) * adSpend;
      }
      // 使用商品推广总额时，分天合计可能略有差异，按比例校准到 adSpend
      const daySum = Array.from(adSpendByMonth.values()).reduce((s, v) => s + v, 0);
      if (daySum > 0 && adSpend > 0 && Math.abs(daySum - adSpend) > 0.05) {
        monthAd = monthAd * (adSpend / daySum);
      }
      const monthAdCost = Math.max(allocated, monthAd);
      const pa = pb - monthAdCost;
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
        adAllocated: monthAdCost,
      };
    });
  const latestMonth = months.length ? months[months.length - 1].month : undefined;
  const prevMonth = months.length >= 2 ? months[months.length - 2].month : undefined;

  const adRoi = adSpend > 0 ? adGmv / adSpend : 0;
  const adNetRoi = adSpend > 0 ? adNetGmv / adSpend : 0;
  const adSettledRoi = adSpend > 0 ? adSettledGmv / adSpend : 0;
  const costUnmatchedOrders = orderProfits.length - costMatchedOrders;
  const summary: OperatingSummary = {
    orderCount: orders.length,
    goodsTotal,
    merchantReceived,
    confirmedRevenue,
    buyerPaid,
    refundOrderCount,
    refundOrderAmount,
    fullRefundCount,
    partialRefundCount,
    refundCashTotal,
    partialRefundResidualRevenue,
    refundVsReceivedGapTotal,
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
    adNetGmv,
    adSettledGmv,
    adRoi,
    adNetRoi,
    adSettledRoi,
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
      "成本匹配", "匹配方式", "快递规则命中", "账单收入", "账单退款", "技术服务费", "其他费用", "补贴",
      "是否发货", "是否退款", "退款类型", "实退金额", "退款占比", "保留占比", "实收vs退款说明",
      "是否成交", "发货后退款", "已发货未成交", "毛利(未扣广告)", "毛利(扣广告)",
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
      o.expressRuleMatched ? "是" : "否",
      o.billIncome.toFixed(2), o.billRefund.toFixed(2), o.techFee.toFixed(2),
      o.otherFee.toFixed(2), o.subsidy.toFixed(2),
      o.isShipped ? "是" : "否", o.isRefunded ? "是" : "否",
      o.refundKind === "full" ? "全额退" : o.refundKind === "partial" ? "部分退" : o.refundKind === "none" ? "-" : "未知",
      o.refundAmount.toFixed(2),
      (o.refundRatio * 100).toFixed(1) + "%",
      (o.residualRatio * 100).toFixed(1) + "%",
      o.refundCompareNote,
      o.isCompleted ? "是" : "否",
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
    ["确认收入合计(含部分退保留)", summary.confirmedRevenue.toFixed(2)],
    [
      "账务平台费进毛利",
      settings.feeStackMode === "settings_only" ? "否(仅展示)" : "是",
    ],
    [
      "品牌扣点%(全局)",
      String(Math.max(0, Number(settings.brandPointPct) || 0)),
    ],
    ["退款订单数", summary.refundOrderCount],
    ["退款订单商品总价", summary.refundOrderAmount.toFixed(2)],
    ["全额退款订单数", summary.fullRefundCount],
    ["部分退款订单数", summary.partialRefundCount],
    ["实退金额合计(账务优先/可推断)", summary.refundCashTotal.toFixed(2)],
    ["部分退保留确认收入", summary.partialRefundResidualRevenue.toFixed(2)],
    ["退款单(实退-商家实收)差额合计", summary.refundVsReceivedGapTotal.toFixed(2)],
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
    ["广告+扣点税+退货相关合计吃掉(不含运费,运费已在净运费)", summary.marginEatenTotal.toFixed(2)],
    ["成本未匹配订单", summary.costUnmatchedOrders],
    ["账单交易收入", summary.billIncome.toFixed(2)],
    ["账单退款", summary.billRefund.toFixed(2)],
    ["技术服务费(净)", summary.techFee.toFixed(2)],
    ["其他费用", summary.otherFee.toFixed(2)],
    ["补贴", summary.subsidy.toFixed(2)],
    ["广告花费(商品推广优先,否则分天合计)", summary.adSpend.toFixed(2)],
    ["广告交易额(推广日报)", summary.adGmv.toFixed(2)],
    ["广告ROI(交易额/花费)", summary.adRoi.toFixed(2)],
    ["账务推广费(已排除不扣毛利)", summary.billAdExpenseExcluded.toFixed(2)],
    ["提现(资金划出已排除)", summary.billWithdrawExcluded.toFixed(2)],
    ["广告分摊合计", summary.adAllocatedTotal.toFixed(2)],
    ["广告分摊方式", settings.adAllocateMode || "by_product"],
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
      "全额退款",
      summary.fullRefundCount,
      fullRefundOrders.reduce((s, o) => s + (o.refundAmount || 0), 0).toFixed(2),
      `${summary.fullRefundCount}/${summary.orderCount}`,
      summary.orderCount > 0 ? pct(summary.fullRefundCount / summary.orderCount) : "0%",
      goodsTotal > 0
        ? pct(fullRefundOrders.reduce((s, o) => s + (o.refundAmount || 0), 0) / goodsTotal)
        : "0%",
      "商家实收≈0 或 账务退款覆盖基准金额",
    ],
    [
      "部分退款",
      summary.partialRefundCount,
      partialRefundOrders.reduce((s, o) => s + (o.refundAmount || 0), 0).toFixed(2),
      `${summary.partialRefundCount}/${summary.orderCount}`,
      summary.orderCount > 0 ? pct(summary.partialRefundCount / summary.orderCount) : "0%",
      goodsTotal > 0
        ? pct(partialRefundOrders.reduce((s, o) => s + (o.refundAmount || 0), 0) / goodsTotal)
        : "0%",
      "仅退部分：保留确认收入=部分退保留确认收入，成本按保留占比",
    ],
    [
      "实退金额(账务优先)",
      summary.refundOrderCount,
      summary.refundCashTotal.toFixed(2),
      "-",
      "-",
      goodsTotal > 0 ? pct(summary.refundCashTotal / goodsTotal) : "0%",
      "账务退款优先；无账务时用商品总价-商家实收推断",
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
  const expressMap = new Map<
    string,
    {
      count: number;
      weight: number;
      fee: number;
      net: number;
      loss: number;
      matched: number;
      companies: Map<string, number>;
    }
  >();
  let shippedForExpress = 0;
  for (const o of orderProfits) {
    if (!o.isShipped) continue;
    shippedForExpress += 1;
    const key = o.shipRuleLabel || o.expressCompany || "未知";
    const e =
      expressMap.get(key) ||
      {
        count: 0,
        weight: 0,
        fee: 0,
        net: 0,
        loss: 0,
        matched: 0,
        companies: new Map<string, number>(),
      };
    e.count += 1;
    e.weight += o.weightKg;
    e.fee += o.shippingFee;
    e.net += o.netShipping;
    e.loss += o.shippingLoss;
    if (o.expressRuleMatched) e.matched += 1;
    const cname = o.expressCompany || "未知快递";
    e.companies.set(cname, (e.companies.get(cname) || 0) + 1);
    expressMap.set(key, e);
  }
  const expressTable: any[][] = [
    [
      "运费规则/快递",
      "已发货单量",
      "占比",
      "总重量kg",
      "运费(毛)",
      "净运费",
      "损耗运费",
      "单均净运费",
      "规则命中率",
      "告警",
    ],
    ...Array.from(expressMap.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .map(([k, v]) => {
        const share = shippedForExpress ? v.count / shippedForExpress : 0;
        const hit = v.count ? v.matched / v.count : 0;
        const alert =
          hit < 1
            ? hit === 0
              ? "未命中配置规则，走默认首重续重"
              : "部分单未命中规则"
            : "";
        return [
          k,
          v.count,
          `${(share * 100).toFixed(1)}%`,
          v.weight.toFixed(2),
          v.fee.toFixed(2),
          v.net.toFixed(2),
          v.loss.toFixed(2),
          v.count ? (v.net / v.count).toFixed(2) : "0",
          `${(hit * 100).toFixed(0)}%`,
          alert,
        ];
      }),
  ];

  // 未匹配快递规则明细（按快递公司）
  const unmatchExpressMap = new Map<string, number>();
  for (const o of orderProfits) {
    if (!o.isShipped || o.expressRuleMatched) continue;
    const c = o.expressCompany || "未知快递";
    unmatchExpressMap.set(c, (unmatchExpressMap.get(c) || 0) + 1);
  }
  const expressAlertTable: any[][] = [
    ["快递公司", "已发货未命中规则单量", "占已发货", "建议"],
    ...Array.from(unmatchExpressMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([c, n]) => [
        c,
        n,
        shippedForExpress ? `${((n / shippedForExpress) * 100).toFixed(1)}%` : "0%",
        "在运费参数中新增该快递关键词规则",
      ]),
  ];

const matchMethodMap = new Map<string, { count: number; amount: number }>();
  for (const o of orderProfits) {
    const key = o.costMatched ? o.costMatchBy || "已匹配" : "未匹配";
    const row = matchMethodMap.get(key) || { count: 0, amount: 0 };
    row.count += 1;
    row.amount += o.merchantReceived || 0;
    matchMethodMap.set(key, row);
  }
  const matchMethodTable: any[][] = [
    ["匹配方式", "订单数", "占比", "商家实收合计", "说明"],
    ...Array.from(matchMethodMap.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .map(([k, v]) => [
        k,
        v.count,
        orderProfits.length
          ? `${((v.count / orderProfits.length) * 100).toFixed(1)}%`
          : "0%",
        v.amount.toFixed(2),
        k === "未匹配"
          ? "请补商品资料成本，或开启「无编码按规格匹配」"
          : k.includes("无编码") || k.includes("规格")
            ? "无/弱编码订单已按规格匹配"
            : "编码优先匹配",
      ]),
  ];

  const billTypeTable: any[][] = [
    ["账务类型", "收入", "支出", "净额", "笔数"],
    ...billByType.map((b) => [b.type, b.income.toFixed(2), b.expense.toFixed(2), b.net.toFixed(2), b.count]),
  ];

  const adTable: any[][] = [
    [
      "日期",
      "花费",
      "交易额",
      "净交易额",
      "结算交易额",
      "成交笔数",
      "实际投产比",
      "净实际投产比",
      "结算投产比",
      "曝光",
      "点击",
      "店铺",
    ],
    ...adDays.map((d) => [
      d.date,
      d.spend.toFixed(2),
      d.gmv.toFixed(2),
      d.netGmv.toFixed(2),
      d.settledGmv.toFixed(2),
      d.orders,
      Number(d.roi || 0).toFixed(2),
      Number(d.netRoi || 0).toFixed(2),
      Number(d.settledRoi || 0).toFixed(2),
      d.impressions,
      d.clicks,
      d.shopName || "默认店铺",
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
      "广告花费(日报合计)",
      "毛利",
      "毛利率",
      "未匹配成本单",
    ],
    ...Array.from(shopMap.entries())
      .sort((a, b) => b[1].merchantReceived - a[1].merchantReceived)
      .map(([shop, a]) => {
        const adShop = adSpendByShop.get(shop) || (useGlobalAd && shopMap.size === 1 ? adSpend : 0);
        const refundRate = a.orderCount ? a.refundCount / a.orderCount : 0;
        const psr = a.shippedCount ? a.postShipRefundCount / a.shippedCount : 0;
        const margin = a.merchantReceived > 0 ? a.profitBefore / a.merchantReceived : 0;
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
          a.profitBefore.toFixed(2),
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
    /** 商品推广真实花费（按商品ID匹配，整商品只计一次） */
    productAdSpend: number;
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
    productAdSpend: 0,
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

  // 商品推广：按商品ID挂到 SPU/商品维度（整商品一次，不做订单均摊）
  const attachProductAd = (map: Map<string, RankAgg>) => {
    for (const a of map.values()) {
      // 整商品一次：仅按商品ID匹配推广汇总花费（无ID=0）
      a.productAdSpend = lookupProductAd(a.productId);
    }
  };
  attachProductAd(spuMap);
  // 规格维度：不拆分商品广告（避免多规格重复扣），广告列仅在编码/SPU 有意义
  for (const a of skuMap.values()) {
    a.productAdSpend = 0;
  }

  const rankRows = (map: Map<string, RankAgg>, kind: "spu" | "sku") => {
    const rows = Array.from(map.values()).sort((a, b) => b.profitBefore - a.profitBefore);
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
            "结算金额",
            "退款率(笔)",
            "成本",
            "包材",
            "净运费",
            "损耗运费",
            "商品广告费",
            "毛利",
            "毛利(扣商品广告)",
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
            "结算金额",
            "退款率(笔)",
            "成本",
            "包材",
            "净运费",
            "损耗运费",
            "毛利",
            "毛利率",
            "未匹配单",
          ];
    return [
      header,
      ...rows.map((a, idx) => {
        const refundRate = a.orderCount ? a.refundCount / a.orderCount : 0;
        const profitAfterProductAd = a.profitBefore - (a.productAdSpend || 0);
        // 有商品广告时用扣商品广告后毛利率；规格维不扣商品广告
        const profitForMargin =
          kind === "spu" ? profitAfterProductAd : a.profitBefore;
        const margin =
          a.merchantReceived > 0 ? profitForMargin / a.merchantReceived : 0;
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
            (a.productAdSpend || 0).toFixed(2),
            a.profitBefore.toFixed(2),
            profitAfterProductAd.toFixed(2),
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
          a.profitBefore.toFixed(2),
          pct(margin),
          a.unmatched,
        ];
      }),
    ];
  };

  const spuTable = rankRows(spuMap, "spu");
  const skuTable = rankRows(skuMap, "sku");

  // 销售排行：结算金额=商家实收；商品广告费按商品ID真实匹配（非均摊）。
  // 编码销售可扣商品广告；规格销售不拆商品广告。
  const hasProductAds = adSpendProduct > 0.005;
  const salesRankFrom = (map: Map<string, RankAgg>, kind: "spu" | "sku") => {
    const rows = Array.from(map.values()).sort((a, b) => {
      if (b.qty !== a.qty) return b.qty - a.qty;
      if (b.goodsTotal !== a.goodsTotal) return b.goodsTotal - a.goodsTotal;
      return b.orderCount - a.orderCount;
    });
    const header =
      kind === "spu"
        ? hasProductAds
          ? [
              "排名",
              "商品编码",
              "商品名称",
              "商品ID",
              "订单数",
              "销量",
              "商品总价",
              "结算金额",
              "退款订单",
              "退款率(笔)",
              "商品广告费",
              "毛利",
              "毛利(扣商品广告)",
              "毛利率",
            ]
          : [
              "排名",
              "商品编码",
              "商品名称",
              "商品ID",
              "订单数",
              "销量",
              "商品总价",
              "结算金额",
              "退款订单",
              "退款率(笔)",
              "毛利",
              "毛利率",
            ]
        : [
            "排名",
            "规格编码",
            "商品编码",
            "商品名称",
            "规格名称",
            "商品ID",
            "订单数",
            "销量",
            "商品总价",
            "结算金额",
            "退款订单",
            "退款率(笔)",
            "毛利",
            "毛利率",
          ];
    return [
      header,
      ...rows.map((a, idx) => {
        const refundRate = a.orderCount ? a.refundCount / a.orderCount : 0;
        const afterAd = a.profitBefore - (a.productAdSpend || 0);
        const marginBase =
          kind === "spu" && hasProductAds ? afterAd : a.profitBefore;
        const margin =
          a.merchantReceived > 0 ? marginBase / a.merchantReceived : 0;
        if (kind === "spu") {
          if (hasProductAds) {
            return [
              idx + 1,
              a.merchantSpu || a.label,
              a.productName,
              a.productId,
              a.orderCount,
              a.qty,
              a.goodsTotal.toFixed(2),
              a.merchantReceived.toFixed(2),
              a.refundCount,
              pct(refundRate),
              (a.productAdSpend || 0).toFixed(2),
              a.profitBefore.toFixed(2),
              afterAd.toFixed(2),
              pct(margin),
            ];
          }
          return [
            idx + 1,
            a.merchantSpu || a.label,
            a.productName,
            a.productId,
            a.orderCount,
            a.qty,
            a.goodsTotal.toFixed(2),
            a.merchantReceived.toFixed(2),
            a.refundCount,
            pct(refundRate),
            a.profitBefore.toFixed(2),
            pct(margin),
          ];
        }
        return [
          idx + 1,
          a.merchantSku || a.label,
          a.merchantSpu,
          a.productName,
          a.specName,
          a.productId,
          a.orderCount,
          a.qty,
          a.goodsTotal.toFixed(2),
          a.merchantReceived.toFixed(2),
          a.refundCount,
          pct(refundRate),
          a.profitBefore.toFixed(2),
          pct(margin),
        ];
      }),
    ];
  };
  const salesRankSkuTable = salesRankFrom(skuMap, "sku");
  const salesRankSpuTable = salesRankFrom(spuMap, "spu");


  // 推广分析：按日 + 汇总（仅日报，不含账务广告）
  const adAnalysisTable: any[][] = [
    [
      "区块",
      "日期/指标",
      "花费",
      "交易额",
      "净交易额",
      "结算交易额",
      "实际投产比",
      "净实际投产比",
      "结算投产比",
      "成交笔数",
      "曝光",
      "点击",
      "点击率",
      "说明",
    ],
    ...adDays.map((d) => {
      const ctr = d.impressions > 0 ? d.clicks / d.impressions : 0;
      const roi = d.spend > 0 ? d.gmv / d.spend : Number(d.roi || 0);
      const netRoi = d.spend > 0 ? (d.netGmv || 0) / d.spend : Number(d.netRoi || 0);
      const settledRoi =
        d.spend > 0 ? (d.settledGmv || 0) / d.spend : Number(d.settledRoi || 0);
      return [
        "按日",
        d.date,
        d.spend.toFixed(2),
        d.gmv.toFixed(2),
        (d.netGmv || 0).toFixed(2),
        (d.settledGmv || 0).toFixed(2),
        roi.toFixed(2),
        netRoi.toFixed(2),
        settledRoi.toFixed(2),
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
      adNetGmv.toFixed(2),
      adSettledGmv.toFixed(2),
      adRoi.toFixed(2),
      adNetRoi.toFixed(2),
      adSettledRoi.toFixed(2),
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
    ["损耗运费(已发货未成交)", shippingLossTotal.toFixed(2), "发出去但未成交的运费成本(展示项，已含在净运费)"],
    [
      "全额退/部分退订单数",
      `${fullRefundCount}/${partialRefundCount}`,
      `实退合计¥${refundCashTotal.toFixed(2)} · 部分退保留收入¥${partialRefundResidualRevenue.toFixed(2)}`,
    ],
    [
      "确认收入合计",
      confirmedRevenue.toFixed(2),
      "部分退后的有效收入（≠商家实收原字段简单加总时可核对）",
    ],
    [
      "账务平台费",
      settings.feeStackMode === "settings_only" ? "不进毛利" : "进毛利",
      "来自账务技术服务费/其他费用；与品牌扣点无关",
    ],
    [
      "品牌扣点",
      `${Math.max(0, Number(settings.brandPointPct) || 0)}%`,
      "参数区选填；0 或空表示不计提，与平台服务费分开",
    ],
    [
      "退款单(实退-商家实收)差额",
      refundVsReceivedGapTotal.toFixed(2),
      "用于核对部分仅退款：正=退得多于当前实收残留",
    ],
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
    ["确认收入", summary.confirmedRevenue.toFixed(2)],
    ["总退款率(笔/额)", `${pct(summary.refundRateByCount)} / ${pct(summary.refundRateByAmount)}`],
    [
      "全额退 / 部分退",
      `${summary.fullRefundCount} / ${summary.partialRefundCount}`,
    ],
    ["实退金额合计", summary.refundCashTotal.toFixed(2)],
    ["部分退保留确认收入", summary.partialRefundResidualRevenue.toFixed(2)],
    [
      "退款单(实退-商家实收)差额",
      summary.refundVsReceivedGapTotal.toFixed(2),
    ],
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
    ["实际投产比(交易额/花费)", summary.adRoi.toFixed(2)],
    ["净实际投产比(净交易额/花费)", (summary.adNetRoi ?? 0).toFixed(2)],
    ["结算投产比(结算交易额/花费)", (summary.adSettledRoi ?? 0).toFixed(2)],
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
  const highRefundMinShipped = Math.max(
    1,
    Math.round(Number(settings.anomalyHighRefundMinShipped) || 3),
  );
  const highRefundRate = Math.min(
    1,
    Math.max(0, Number(settings.anomalyHighRefundRate) || 0.3),
  );
  const highRefundSkus = Array.from(skuAnomMap.values())
    .filter((a) => a.shipped >= highRefundMinShipped)
    .map((a) => ({
      ...a,
      postShipRate: a.shipped ? a.postShip / a.shipped : 0,
      refundRate: a.orderCount ? a.refund / a.orderCount : 0,
    }))
    .filter((a) => a.postShipRate >= highRefundRate)
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

  // 部分退 + 商家实收与退款比对异常（实收+实退 与 基准金额偏差过大）
  const partialRefundAnomalyOrders = orderProfits
    .filter((o) => o.refundKind === "partial" || o.isRefunded)
    .map((o) => {
      const base = Math.max(
        o.billIncome || 0,
        o.goodsTotal || 0,
        (o.merchantReceived || 0) + (o.refundAmount || 0),
      );
      const sum = (o.merchantReceived || 0) + (o.refundAmount || 0);
      const eps = Math.max(1, base * 0.05);
      const mismatch =
        o.isRefunded &&
        (o.billIncome > 0 || o.billRefund > 0) &&
        Math.abs(sum - base) > eps &&
        Math.abs(sum - ((o.billIncome || 0) + (o.subsidy || 0))) > eps;
      return { o, mismatch, base, sum };
    })
    .filter((x) => x.o.refundKind === "partial" || x.mismatch)
    .sort((a, b) => {
      if (a.mismatch !== b.mismatch) return a.mismatch ? -1 : 1;
      return (b.o.refundAmount || 0) - (a.o.refundAmount || 0);
    });

  const anomalyPartialRefundTable: any[][] = [
    [
      "异常类型",
      "店铺",
      "订单号",
      "商品",
      "规格",
      "状态",
      "商家实收",
      "实退金额",
      "实收+实退",
      "基准金额",
      "确认收入",
      "退款类型",
      "退款占比",
      "比对说明",
      "毛利(扣广告)",
    ],
    ...partialRefundAnomalyOrders.map(({ o, mismatch, base, sum }) => [
      mismatch
        ? "实收与退款对不齐"
        : o.refundKind === "partial"
          ? "部分退款"
          : "退款比对",
      o.shopName,
      o.orderId,
      o.productName,
      o.specName,
      o.status,
      o.merchantReceived.toFixed(2),
      (o.refundAmount || 0).toFixed(2),
      sum.toFixed(2),
      base.toFixed(2),
      o.revenue.toFixed(2),
      o.refundKind === "full"
        ? "全额退"
        : o.refundKind === "partial"
          ? "部分退"
          : o.refundKind === "none"
            ? "-"
            : "未知",
      ((o.refundRatio || 0) * 100).toFixed(1) + "%",
      o.refundCompareNote || "",
      o.estimatedProfitAfterAd.toFixed(2),
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
      "部分退/比对异常",
      partialRefundAnomalyOrders.length,
      `部分退 ${partialRefundCount} 单；实收+实退与基准偏差>5% 会标为对不齐`,
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
    expressAlertTable,
    matchMethodTable,
    unmatchedTable,
    shopTable,
    spuTable,
    skuTable,
    salesRankSkuTable,
    salesRankSpuTable,
    adAnalysisTable,
    productReturnTable,
    lossDiagnosisTable,
    bossOnePagerTable,
    anomalySummaryTable,
    anomalyNegProfitTable,
    anomalyUnmatchedTable,
    anomalyFeeFlipTable,
    anomalyHighRefundSkuTable,
    anomalyPartialRefundTable,
  };
}


