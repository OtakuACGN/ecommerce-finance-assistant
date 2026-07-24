export type AppTab =
  | "mapping"
  | "reconcile"
  | "bill"
  | "express"
  | "salesRank"
  | "ztc"
  | "profit"
  | "monthly"
  | "operating"
  | "aftersale";

export const PRIMARY_TABS: { key: AppTab; label: string }[] = [
  { key: "operating", label: "经营分析" },
  { key: "ztc", label: "直通车细分" },
  { key: "profit", label: "利润测算" },
  { key: "salesRank", label: "销售排行" },
  { key: "monthly", label: "月度汇总" },
];

export const SECONDARY_TABS: { key: AppTab; label: string }[] = [
  { key: "mapping", label: "SKU映射" },
  { key: "reconcile", label: "收款对账" },
  { key: "bill", label: "账单对账" },
  { key: "express", label: "快递对账" },
  { key: "aftersale", label: "售后分析" },
];
