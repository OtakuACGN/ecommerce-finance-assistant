/**
 * 通用利润测算引擎（与「店财通_通用利润测算表」模型一致）
 *
 * 售后损耗 O = (r×售前)×广告 + (r×发货后)×(广告+运费险+运费)
 * 期望净利 = P − 货值 − 包材 − 运费 − 平台 − 品牌 − 百亿 − 广告 − 运费险 − 售后
 * 建议价：按目标净利率反解 P
 */

export interface ProfitModelParams {
  /** 平台扣点 0.008 = 0.8% */
  platformRate: number;
  /** 品牌扣点，白牌默认 0 */
  brandRate: number;
  /** 百亿补贴扣点 0.044 */
  bybtRate: number;
  /** 默认 ROI */
  defaultRoi: number;
  /** 轻投 ROI 参考 */
  lightRoi: number;
  /** 重投 ROI 参考 */
  heavyRoi: number;
  /** 整体售后率 r */
  refundRate: number;
  /** 售后中售前占比 */
  preRefundShare: number;
  /** 售后中发货后占比 */
  postShipShare: number;
  /** 运费险（元） */
  insurance: number;
  /** 默认包材（元） */
  defaultPack: number;
  /** 目标净利率 */
  targetMargin: number;
}

export interface ProfitSkuInput {
  id: string;
  name: string;
  sku: string;
  cost: number;
  /** 空则用默认包材 */
  pack?: number | null;
  ship: number;
  /** 1=参加百亿 */
  bybt: 0 | 1;
  /** 空则用默认 ROI */
  rowRoi?: number | null;
  /** 空则用全局售后率 */
  rowRefundRate?: number | null;
  /** 试算售价 */
  price: number;
  /** 可选现价对照 */
  currentPrice?: number | null;
  note?: string;
}

export interface ProfitSkuResult extends ProfitSkuInput {
  effectiveRoi: number;
  effectiveRefundRate: number;
  effectivePack: number;
  ad: number;
  aftersale: number;
  platformFee: number;
  brandFee: number;
  bybtFee: number;
  profit: number;
  margin: number;
  health: "亏损/危险" | "偏薄" | "及格" | "健康" | "—";
  suggestedPrice: number | null;
  suggestedProfit: number | null;
  suggestedMargin: number | null;
  lightSuggest: number | null;
  defaultSuggest: number | null;
  heavySuggest: number | null;
  currentMargin: number | null;
  gapToSuggest: number | null;
}

export interface ProfitSummary {
  skuCount: number;
  totalPrice: number;
  totalProfit: number;
  avgMargin: number;
  healthy: number;
  danger: number;
  thin: number;
  ok: number;
}

export const DEFAULT_PROFIT_PARAMS: ProfitModelParams = {
  platformRate: 0.008,
  brandRate: 0,
  bybtRate: 0.044,
  defaultRoi: 4.5,
  lightRoi: 5,
  heavyRoi: 3.5,
  refundRate: 0.33,
  preRefundShare: 0.25,
  postShipShare: 0.75,
  insurance: 0.5,
  defaultPack: 0.3,
  targetMargin: 0.15,
};

export function newSkuId(): string {
  return `sku_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function emptySku(partial?: Partial<ProfitSkuInput>): ProfitSkuInput {
  return {
    id: newSkuId(),
    name: "",
    sku: "",
    cost: 0,
    pack: null,
    ship: 3,
    bybt: 0,
    rowRoi: null,
    rowRefundRate: null,
    price: 0,
    currentPrice: null,
    note: "",
    ...partial,
  };
}

function n(v: unknown, fallback = 0): number {
  const x = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[,，%]/g, ""));
  return Number.isFinite(x) ? x : fallback;
}

function healthOf(margin: number): ProfitSkuResult["health"] {
  if (!Number.isFinite(margin)) return "—";
  if (margin < 0.05) return "亏损/危险";
  if (margin < 0.12) return "偏薄";
  if (margin < 0.18) return "及格";
  return "健康";
}

/** 单笔期望利润 */
export function calcUnitProfit(
  input: {
    cost: number;
    pack: number;
    ship: number;
    price: number;
    bybt: 0 | 1;
    roi: number;
    refundRate: number;
  },
  params: ProfitModelParams,
): {
  ad: number;
  aftersale: number;
  platformFee: number;
  brandFee: number;
  bybtFee: number;
  profit: number;
  margin: number;
} {
  const P = Math.max(0, input.price);
  const roi = input.roi > 0 ? input.roi : params.defaultRoi;
  const r = Math.max(0, input.refundRate);
  const pre = params.preRefundShare;
  const ret = params.postShipShare;
  const ins = params.insurance;

  const ad = roi > 0 ? P / roi : 0;
  const aftersale = r * pre * ad + r * ret * (ad + ins + input.ship);
  const platformFee = P * params.platformRate;
  const brandFee = P * params.brandRate;
  const bybtFee = P * params.bybtRate * (input.bybt ? 1 : 0);
  const profit =
    P -
    input.cost -
    input.pack -
    input.ship -
    platformFee -
    brandFee -
    bybtFee -
    ad -
    ins -
    aftersale;
  const margin = P > 0 ? profit / P : 0;
  return { ad, aftersale, platformFee, brandFee, bybtFee, profit, margin };
}

/** 反推建议售价（目标净利率） */
export function suggestPrice(
  input: {
    cost: number;
    pack: number;
    ship: number;
    bybt: 0 | 1;
    roi: number;
    refundRate: number;
  },
  params: ProfitModelParams,
  targetMargin = params.targetMargin,
): number | null {
  const roi = input.roi > 0 ? input.roi : params.defaultRoi;
  if (roi <= 0) return null;
  const r = Math.max(0, input.refundRate);
  const a = r * params.preRefundShare;
  const b = r * params.postShipShare;
  const F = input.bybt ? 1 : 0;
  const coef =
    1 -
    params.platformRate -
    params.brandRate -
    params.bybtRate * F -
    (1 + a + b) / roi;
  const fixed =
    input.cost +
    input.pack +
    input.ship +
    params.insurance +
    b * (params.insurance + input.ship);
  const den = coef - targetMargin;
  if (den <= 1e-9) return null;
  const p = fixed / den;
  return Number.isFinite(p) && p > 0 ? p : null;
}

export function resolveEffective(
  row: ProfitSkuInput,
  params: ProfitModelParams,
): { roi: number; refundRate: number; pack: number } {
  const roi =
    row.rowRoi != null && row.rowRoi > 0 ? n(row.rowRoi) : params.defaultRoi;
  const refundRate =
    row.rowRefundRate != null && row.rowRefundRate >= 0
      ? n(row.rowRefundRate)
      : params.refundRate;
  const pack =
    row.pack != null && row.pack >= 0 ? n(row.pack) : params.defaultPack;
  return { roi, refundRate, pack };
}

export function calcSku(
  row: ProfitSkuInput,
  params: ProfitModelParams,
): ProfitSkuResult {
  const { roi, refundRate, pack } = resolveEffective(row, params);
  const base = {
    cost: n(row.cost),
    pack,
    ship: n(row.ship),
    bybt: row.bybt ? (1 as const) : (0 as const),
    roi,
    refundRate,
  };
  const price = n(row.price);
  const unit = calcUnitProfit({ ...base, price }, params);
  const suggestedPrice = suggestPrice(base, params);
  let suggestedProfit: number | null = null;
  let suggestedMargin: number | null = null;
  if (suggestedPrice != null) {
    const s = calcUnitProfit({ ...base, price: suggestedPrice }, params);
    suggestedProfit = s.profit;
    suggestedMargin = s.margin;
  }
  const lightSuggest = suggestPrice({ ...base, roi: params.lightRoi }, params);
  const defaultSuggest = suggestPrice({ ...base, roi: params.defaultRoi }, params);
  const heavySuggest = suggestPrice({ ...base, roi: params.heavyRoi }, params);

  let currentMargin: number | null = null;
  if (row.currentPrice != null && n(row.currentPrice) > 0) {
    currentMargin = calcUnitProfit(
      { ...base, price: n(row.currentPrice) },
      params,
    ).margin;
  }

  return {
    ...row,
    bybt: base.bybt,
    cost: base.cost,
    ship: base.ship,
    price,
    effectiveRoi: roi,
    effectiveRefundRate: refundRate,
    effectivePack: pack,
    ad: unit.ad,
    aftersale: unit.aftersale,
    platformFee: unit.platformFee,
    brandFee: unit.brandFee,
    bybtFee: unit.bybtFee,
    profit: unit.profit,
    margin: unit.margin,
    health: price > 0 ? healthOf(unit.margin) : "—",
    suggestedPrice,
    suggestedProfit,
    suggestedMargin,
    lightSuggest,
    defaultSuggest,
    heavySuggest,
    currentMargin,
    gapToSuggest:
      suggestedPrice != null && price > 0 ? suggestedPrice - price : null,
  };
}

export function calcAll(
  rows: ProfitSkuInput[],
  params: ProfitModelParams,
): { results: ProfitSkuResult[]; summary: ProfitSummary } {
  const results = rows.map((r) => calcSku(r, params));
  const priced = results.filter((r) => r.price > 0);
  const totalPrice = priced.reduce((s, r) => s + r.price, 0);
  const totalProfit = priced.reduce((s, r) => s + r.profit, 0);
  const summary: ProfitSummary = {
    skuCount: priced.length,
    totalPrice,
    totalProfit,
    avgMargin: totalPrice > 0 ? totalProfit / totalPrice : 0,
    healthy: priced.filter((r) => r.health === "健康").length,
    danger: priced.filter((r) => r.health === "亏损/危险").length,
    thin: priced.filter((r) => r.health === "偏薄").length,
    ok: priced.filter((r) => r.health === "及格").length,
  };
  return { results, summary };
}

function money(v: number | null | undefined): string | number {
  if (v == null || !Number.isFinite(v)) return "";
  return Math.round(v * 100) / 100;
}

function pct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "";
  return (v * 100).toFixed(2) + "%";
}

/** 导出多表 Excel 数据 */
export function buildProfitExportSheets(
  rows: ProfitSkuInput[],
  params: ProfitModelParams,
): Array<{ name: string; data: any[][] }> {
  const { results, summary } = calcAll(rows, params);

  const previewHeader = [
    "品名",
    "规格SKU",
    "货值",
    "包材",
    "运费",
    "是否百亿",
    "有效ROI",
    "有效售后率",
    "试算售价",
    "平台费",
    "品牌费",
    "百亿费",
    "广告费",
    "售后损耗",
    "期望净利",
    "期望利润率",
    "健康度",
    "建议价",
    "建议净利",
    "建议利润率",
    "距建议价",
    "轻投建议价",
    "店均建议价",
    "重投建议价",
    "现价",
    "现价利润率",
    "备注",
  ];

  const previewRows = results
    .filter((r) => r.name || r.sku || r.cost || r.price)
    .map((r) => [
      r.name,
      r.sku,
      money(r.cost),
      money(r.effectivePack),
      money(r.ship),
      r.bybt ? 1 : 0,
      money(r.effectiveRoi),
      pct(r.effectiveRefundRate),
      money(r.price),
      money(r.platformFee),
      money(r.brandFee),
      money(r.bybtFee),
      money(r.ad),
      money(r.aftersale),
      money(r.profit),
      pct(r.margin),
      r.health,
      money(r.suggestedPrice),
      money(r.suggestedProfit),
      pct(r.suggestedMargin),
      money(r.gapToSuggest),
      money(r.lightSuggest),
      money(r.defaultSuggest),
      money(r.heavySuggest),
      money(r.currentPrice ?? null),
      pct(r.currentMargin),
      r.note || "",
    ]);

  const batchHeader = [
    "品名",
    "规格",
    "货值",
    "包材",
    "运费",
    "是否百亿",
    "行售后率",
    "建议价·轻投",
    "建议价·店均",
    "建议价·重投",
    "店均价下净利",
    "店均价利润率",
  ];
  const batchRows = results
    .filter((r) => r.name || r.sku || r.cost)
    .map((r) => {
      const base = {
        cost: r.cost,
        pack: r.effectivePack,
        ship: r.ship,
        bybt: r.bybt,
        roi: params.defaultRoi,
        refundRate: r.effectiveRefundRate,
      };
      const dSug = r.defaultSuggest;
      let dProfit: number | null = null;
      let dMargin: number | null = null;
      if (dSug != null) {
        const u = calcUnitProfit({ ...base, price: dSug }, params);
        dProfit = u.profit;
        dMargin = u.margin;
      }
      return [
        r.name,
        r.sku,
        money(r.cost),
        money(r.effectivePack),
        money(r.ship),
        r.bybt ? 1 : 0,
        r.rowRefundRate != null ? pct(r.rowRefundRate) : "",
        money(r.lightSuggest),
        money(r.defaultSuggest),
        money(r.heavySuggest),
        money(dProfit),
        pct(dMargin),
      ];
    });

  const paramsTable: any[][] = [
    ["参数", "数值", "说明"],
    ["平台扣点", pct(params.platformRate), "技术服务费等，默认0.8%缓冲"],
    ["品牌扣点", pct(params.brandRate), "白牌填0"],
    ["百亿补贴", pct(params.bybtRate), "行内是否百亿=1时启用"],
    ["默认ROI", money(params.defaultRoi), "广告=售价÷ROI"],
    ["轻投ROI", money(params.lightRoi), "批量建议价·轻投档"],
    ["重投ROI", money(params.heavyRoi), "批量建议价·重投档"],
    ["整体售后率", pct(params.refundRate), "退款笔率"],
    ["售前占比", pct(params.preRefundShare), "售后中未发货占比"],
    ["发货后占比", pct(params.postShipShare), "售后中已发货退占比"],
    ["运费险", money(params.insurance), "元/单"],
    ["默认包材", money(params.defaultPack), "元/单"],
    ["目标净利率", pct(params.targetMargin), "反推建议价"],
  ];

  const formulaTable: any[][] = [
    ["公式项", "计算方式"],
    ["有效ROI", "行ROI 空或≤0 → 默认ROI，否则行ROI"],
    ["广告 L", "售价 ÷ 有效ROI"],
    [
      "售后损耗 O",
      "(整体售后率×售前占比)×L + (整体售后率×发货后占比)×(L+运费险+运费)",
    ],
    [
      "期望净利",
      "P − 货值 − 包材 − 运费 − 平台 − 品牌 − 百亿 − L − 运费险 − O",
    ],
    ["期望利润率", "期望净利 ÷ P"],
    ["建议价", "按目标净利率反解 P"],
    [
      "健康度",
      "<5% 亏损/危险；5–12% 偏薄；12–18% 及格；≥18% 健康",
    ],
    [
      "说明",
      "广告在净利扣 L，售后 O 内仍含 r×L 期望损失，偏保守，适合事前定价",
    ],
  ];

  const summaryTable: any[][] = [
    ["汇总项", "数值"],
    ["有售价SKU数", summary.skuCount],
    ["试算售价合计", money(summary.totalPrice)],
    ["期望净利合计", money(summary.totalProfit)],
    ["平均利润率", pct(summary.avgMargin)],
    ["健康", summary.healthy],
    ["及格", summary.ok],
    ["偏薄", summary.thin],
    ["亏损/危险", summary.danger],
    ["导出时间", new Date().toISOString().slice(0, 19).replace("T", " ")],
  ];

  return [
    { name: "毛利预览", data: [previewHeader, ...previewRows] },
    { name: "批量建议价", data: [batchHeader, ...batchRows] },
    { name: "模型参数", data: paramsTable },
    { name: "汇总", data: summaryTable },
    { name: "公式说明", data: formulaTable },
  ];
}

/** 从经营商品资料粗导入为测算行（可选） */
export function skusFromProductMaster(
  products: Array<{
    productName?: string;
    productCode?: string;
    skuCode?: string;
    specName?: string;
    costPrice?: number;
    packCost?: number;
    weightKg?: number;
    salePrice?: number;
  }>,
): ProfitSkuInput[] {
  return products.map((p) =>
    emptySku({
      name: p.productName || p.productCode || "",
      sku: p.skuCode || p.specName || "",
      cost: n(p.costPrice),
      pack: p.packCost != null ? n(p.packCost) : null,
      ship: 3,
      price: n(p.salePrice),
      currentPrice: n(p.salePrice) || null,
    }),
  );
}
