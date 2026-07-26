import type {
  AdDay,
  AdProduct,
  CostSettings,
  PddBillLine,
  PddOrder,
  ProductSku,
} from "./pddBusiness";
import type { SKUMapping } from "./businessLogic";
import { normalizeCostSettings } from "./opCostSettings";

export const OPERATING_WORKSPACE_KIND = "diancaitong.operating-workspace";
export const OPERATING_WORKSPACE_VERSION = 2;

export interface OperatingSourceSnapshot {
  kind: string;
  name: string;
  rows: number;
  shop?: string;
}

export interface OperatingWorkspaceData {
  orders: PddOrder[];
  billLines: PddBillLine[];
  products: ProductSku[];
  ads: AdDay[];
  adProducts: AdProduct[];
  skuMappings: SKUMapping[];
}

export interface OperatingWorkspaceSnapshot {
  kind: typeof OPERATING_WORKSPACE_KIND;
  version: typeof OPERATING_WORKSPACE_VERSION;
  exportedAt: string;
  appVersion: string;
  shopLabel: string;
  productImportMode: "replace" | "merge";
  sources: OperatingSourceSnapshot[];
  costSettings: CostSettings;
  data: OperatingWorkspaceData;
}

export interface CreateOperatingWorkspaceInput extends OperatingWorkspaceData {
  appVersion: string;
  shopLabel: string;
  productImportMode: "replace" | "merge";
  sources: OperatingSourceSnapshot[];
  costSettings: CostSettings;
  exportedAt?: string;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}格式不正确`);
  }
  return value as Record<string, unknown>;
}

function asObjectArray<T>(value: unknown, label: string): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label}必须是数组`);
  }
  if (
    value.some(
      (item) => !item || typeof item !== "object" || Array.isArray(item),
    )
  ) {
    throw new Error(`${label}包含无效记录`);
  }
  return value as T[];
}

function normalizeSources(value: unknown): OperatingSourceSnapshot[] {
  return asObjectArray<Record<string, unknown>>(value, "数据来源").map(
    (source) => ({
      kind: String(source.kind || "unknown"),
      name: String(source.name || "未命名来源"),
      rows: Math.max(0, Math.round(Number(source.rows) || 0)),
      ...(source.shop ? { shop: String(source.shop) } : {}),
    }),
  );
}

export function createOperatingWorkspace(
  input: CreateOperatingWorkspaceInput,
): OperatingWorkspaceSnapshot {
  return {
    kind: OPERATING_WORKSPACE_KIND,
    version: OPERATING_WORKSPACE_VERSION,
    exportedAt: input.exportedAt || new Date().toISOString(),
    appVersion: String(input.appVersion || "unknown"),
    shopLabel: String(input.shopLabel || ""),
    productImportMode:
      input.productImportMode === "merge" ? "merge" : "replace",
    sources: input.sources.map((source) => ({ ...source })),
    costSettings: normalizeCostSettings(input.costSettings),
    data: {
      orders: input.orders,
      billLines: input.billLines,
      products: input.products,
      ads: input.ads,
      adProducts: input.adProducts,
      skuMappings: input.skuMappings,
    },
  };
}

/**
 * 解析用户主动选择的工作区文件。
 * 只恢复原始业务数据；经营报表由当前版本代码重新计算，避免沿用旧口径结果。
 */
export function parseOperatingWorkspace(
  value: unknown,
): OperatingWorkspaceSnapshot {
  const root = asRecord(value, "工作区文件");
  if (root.kind !== OPERATING_WORKSPACE_KIND) {
    throw new Error("这不是店财通经营分析工作区文件");
  }
  const version = Number(root.version);
  if (
    !Number.isInteger(version) ||
    version < 1 ||
    version > OPERATING_WORKSPACE_VERSION
  ) {
    throw new Error(
      `暂不支持工作区版本 ${Number.isFinite(version) ? version : "未知"}（当前支持 ${OPERATING_WORKSPACE_VERSION}）`,
    );
  }

  const data = asRecord(root.data, "工作区数据");
  const rawSettings = asRecord(root.costSettings, "经营参数");
  return {
    kind: OPERATING_WORKSPACE_KIND,
    version: OPERATING_WORKSPACE_VERSION,
    exportedAt: String(root.exportedAt || ""),
    appVersion: String(root.appVersion || "unknown"),
    shopLabel: String(root.shopLabel || ""),
    productImportMode: root.productImportMode === "merge" ? "merge" : "replace",
    sources: normalizeSources(root.sources),
    costSettings: normalizeCostSettings(rawSettings as Partial<CostSettings>),
    data: {
      orders: asObjectArray<PddOrder>(data.orders, "订单数据"),
      billLines: asObjectArray<PddBillLine>(data.billLines, "账务数据"),
      products: asObjectArray<ProductSku>(data.products, "商品资料"),
      ads: asObjectArray<AdDay>(data.ads, "推广分天数据"),
      adProducts: asObjectArray<AdProduct>(
        data.adProducts,
        "商品推广数据",
      ),
      skuMappings: asObjectArray<SKUMapping>(
        data.skuMappings ?? [],
        "SKU 映射数据",
      ),
    },
  };
}

export function operatingWorkspaceSummary(
  workspace: Pick<OperatingWorkspaceSnapshot, "data">,
): string {
  return [
    `订单 ${workspace.data.orders.length} 单`,
    `账务 ${workspace.data.billLines.length} 行`,
    `商品 ${workspace.data.products.length} 条`,
    `SKU 映射 ${workspace.data.skuMappings.length} 条`,
    `推广 ${workspace.data.ads.length} 天`,
    `商品推广 ${workspace.data.adProducts.length} 条`,
  ].join(" · ");
}
