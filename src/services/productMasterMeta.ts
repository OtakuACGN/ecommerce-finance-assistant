/**
 * 商品资料元信息：步骤引导 / 待填成本计数（localStorage）
 */
export const PRODUCT_META_KEY = "pdd-product-master-meta";
export const PRODUCT_IMPORT_MODE_KEY = "pdd-product-import-mode";

export interface ProductMasterMeta {
  lastFileName: string;
  lastImportedAt: string;
  lastExportedAt: string;
  lastMode: "merge" | "replace" | "generated" | "";
  pendingFillCount: number;
  totalCount: number;
  step: number;
}

export function emptyProductMasterMeta(): ProductMasterMeta {
  return {
    lastFileName: "",
    lastImportedAt: "",
    lastExportedAt: "",
    lastMode: "",
    pendingFillCount: 0,
    totalCount: 0,
    step: 0,
  };
}

export function loadProductMasterMeta(): ProductMasterMeta {
  try {
    const raw = localStorage.getItem(PRODUCT_META_KEY);
    if (!raw) return emptyProductMasterMeta();
    const parsed = JSON.parse(raw) as Partial<ProductMasterMeta>;
    return {
      ...emptyProductMasterMeta(),
      ...parsed,
      lastMode:
        parsed.lastMode === "merge" ||
        parsed.lastMode === "replace" ||
        parsed.lastMode === "generated"
          ? parsed.lastMode
          : "",
      pendingFillCount: Math.max(0, Number(parsed.pendingFillCount) || 0),
      totalCount: Math.max(0, Number(parsed.totalCount) || 0),
      step: Math.max(0, Number(parsed.step) || 0),
    };
  } catch {
    return emptyProductMasterMeta();
  }
}

export function saveProductMasterMeta(meta: ProductMasterMeta): void {
  try {
    localStorage.setItem(PRODUCT_META_KEY, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}

export function countPendingCostProducts(
  products: { costPrice?: number; packCost?: number }[],
): number {
  return products.filter((p) => (p.costPrice || 0) + (p.packCost || 0) <= 0).length;
}


/** 商品资料闭环：导入/导出后统一统计 */
export function analyzeProductMasterState(
  products: { costPrice?: number; packCost?: number; skuCode?: string; specName?: string; productCode?: string }[],
): {
  total: number;
  pending: number;
  withCost: number;
  fillRate: number;
} {
  const total = products.length;
  const pending = countPendingCostProducts(products);
  const withCost = Math.max(0, total - pending);
  return {
    total,
    pending,
    withCost,
    fillRate: total > 0 ? Math.round((withCost / total) * 1000) / 10 : 0,
  };
}
