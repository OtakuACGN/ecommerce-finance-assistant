export interface SkuMappingRule {
  platformName: string;
  internalCode: string;
}

function norm(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function mappingColumnPriority(header: unknown): number {
  const h = norm(header).replace(/[\s_-]/g, "");
  if (/商家编码规格|规格编码|sku编码|skucode/.test(h)) return 0;
  if (/商品规格|规格名称|sku信息|销售属性|规格/.test(h)) return 1;
  if (/商品编码|商家编码商品|spu编码|spucode/.test(h)) return 2;
  if (/商品名称|品名|商品/.test(h)) return 3;
  return 10;
}

/**
 * 将映射规则应用到表格。
 *
 * 具体规格编码/规格名称优先于商品名称，避免同一商品的多个规格
 * 被第一条商品名称规则覆盖。重复平台键若指向不同内部编码则视为歧义。
 */
export function applySkuMappingRows(
  source: any[][],
  rules: SkuMappingRule[],
): any[][] {
  if (!source.length || !rules.length) return source;

  const headers = source[0] || [];
  const internalCodeIdx = headers.findIndex(
    (h) => String(h ?? "").trim() === "内部编码",
  );
  const ruleMap = new Map<string, string | null>();
  for (const rule of rules) {
    const key = norm(rule.platformName);
    const code = String(rule.internalCode ?? "").trim();
    if (!key || !code) continue;
    const previous = ruleMap.get(key);
    if (previous === undefined) ruleMap.set(key, code);
    else if (previous !== code) ruleMap.set(key, null);
  }

  const orderedColumns = headers
    .map((header, index) => ({
      index,
      priority: mappingColumnPriority(header),
    }))
    .filter(({ index }) => index !== internalCodeIdx)
    .sort((a, b) => a.priority - b.priority || a.index - b.index);

  const mappedRows = source.slice(1).map((row) => {
    const next = [...row];
    let internalCode =
      internalCodeIdx >= 0 ? String(next[internalCodeIdx] ?? "").trim() : "";

    for (const { index } of orderedColumns) {
      const matched = ruleMap.get(norm(next[index]));
      if (matched) {
        internalCode = matched;
        break;
      }
    }

    if (internalCodeIdx >= 0) next[internalCodeIdx] = internalCode;
    else next.push(internalCode);
    return next;
  });

  return [
    internalCodeIdx >= 0 ? [...headers] : [...headers, "内部编码"],
    ...mappedRows,
  ];
}
