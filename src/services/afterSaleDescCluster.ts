/**
 * 售后描述（非标准文本）近似合并
 * 策略：规则多信号打分（具体信号优先） + 同大项内相似归并
 * 规则面向通用电商售后，不绑定具体店铺/品类
 */

export interface DescClusterResult {
  /** 稳定 key，用于统计 */
  key: string;
  /** 展示名 */
  label: string;
  /** rule=关键词命中；norm=归一后精确；fuzzy=相似归并；raw=保留原文 */
  method: "rule" | "norm" | "fuzzy" | "raw" | "empty";
  /** 归一后的原文 */
  normalized: string;
}

type DescRule = {
  key: string;
  label: string;
  /** 越大越优先；同命中时取高分 */
  priority: number;
  patterns: RegExp[];
  /** 命中后若再命中这些词，额外加分（复合句） */
  boost?: RegExp[];
  /** 若命中这些词则否决本规则（避免泛词吞并） */
  exclude?: RegExp[];
};

/**
 * 小项聚类规则
 * 设计原则：
 * 1) 先抓“具体信号”（拍错/破损/物流），再抓“体验/尺寸/质量”
 * 2) 纯“不合适/用不上”不并进尺寸
 * 3) 同时出现“不想要 + 太硬/质量差”时，归到更有分析价值的原因
 */
const DESC_RULES: DescRule[] = [
  {
    key: "empty",
    label: "无有效描述",
    priority: 100,
    patterns: [/^$/, /^其他原因$/, /^其它原因$/, /^其他$/, /^其它$/, /^[,，.。、\s]+$/, /^\d{1,3}$/],
  },
  {
    key: "negotiate",
    label: "协商一致退款",
    priority: 95,
    patterns: [/协商一致/, /与商家协商/, /和商家协商/, /协商好了/, /谈好了/, /协商退/],
  },
  {
    key: "no_reason_7",
    label: "七天无理由",
    priority: 94,
    patterns: [/七天无理由/, /7天无理由/, /无理由退/],
  },
  {
    key: "wrong_buy",
    label: "拍错/选错/买重",
    priority: 90,
    patterns: [
      /拍错/,
      /买错/,
      /点错/,
      /选错/,
      /买重/,
      /买多/,
      /买重复/,
      /重复买/,
      /多拍/,
      /错拍/,
      /重新拍/,
      /没看好/,
      /下错/,
      /地址.*错/,
      /手机号.*错/,
      /型号.*错/,
      /规格.*错/,
    ],
  },
  {
    key: "wrong_item",
    label: "发错货/少件",
    priority: 89,
    patterns: [/发错/, /寄错/, /漏发/, /少发/, /少件/, /缺件/, /少东西/, /没发齐/, /发漏/],
  },
  {
    key: "damage",
    label: "破损/裂痕/坏损",
    priority: 88,
    patterns: [
      /破损/,
      /裂痕/,
      /裂开/,
      /撕裂/,
      /坏了/,
      /烂成/,
      /凹陷/,
      /有裂/,
      /破了/,
      /损坏/,
      /破洞/,
      /断裂/,
      /开裂/,
      /破口/,
      /烂了/,
    ],
  },
  {
    key: "logistics",
    label: "物流/未收货/拒收",
    priority: 86,
    patterns: [
      /快递一直未送达/,
      /物流.*未/,
      /没收到货/,
      /未收到货/,
      /没有收到货/,
      /拒收/,
      /已拒收/,
      /拦截/,
      /来来回回/,
      /等不了/,
      /超时未/,
      /揽件/,
      /在途/,
      /转院.*快递/,
      /拿不到快递/,
      /派送/,
      /丢件/,
      /快递丢/,
      /运单/,
    ],
    // 仅出现“快递/物流”但实际在讲试穿/尺寸时，不当物流
    exclude: [/试了|试一下|太[大小高低]|偏[大小]|尺寸|不舒服|太硬|质量/],
  },
  {
    key: "quality",
    label: "质量差/材质差",
    priority: 82,
    patterns: [
      /质量太差/,
      /质量不好/,
      /质量不行/,
      /质量问题/,
      /劣质/,
      /材质差/,
      /材质太差/,
      /掉渣/,
      /仿冒/,
      /假货/,
      /次品/,
      /做工太差/,
      /做工差/,
      /做工瑕疵/,
      /出厂就有/,
    ],
    boost: [/塌陷/, /断裂/, /掉渣/, /仿冒/],
  },
  {
    key: "mismatch",
    label: "与描述/实物不符",
    priority: 80,
    patterns: [
      /与.*描述.*不符/,
      /描述不符/,
      /货不对板/,
      /实物与/,
      /与视频/,
      /和视频/,
      /店宣/,
      /规格不符/,
      /说的和.*不一样/,
      /和之前.*不一样/,
      /和.*买的.*不一样/,
      /实物不符/,
      /与商品描述不符/,
    ],
  },
  {
    key: "size_fit",
    label: "尺寸/大小不合适",
    priority: 78,
    // 必须有尺寸/尺度信号，禁止单独“不合适/用不上”
    patterns: [
      /太大/,
      /太小/,
      /偏大/,
      /偏小/,
      /有点大/,
      /有点小/,
      /尺寸/,
      /大小.*不/,
      /高度/,
      /高低/,
      /太高/,
      /太低/,
      /高了/,
      /低了/,
      /矮了/,
      /长了/,
      /短了/,
      /宽了/,
      /窄了/,
      /洞太[大小]/,
      /中间.*洞/,
      /厘米/,
      /\dcm\b/i,
      /码数/,
      /尺码/,
    ],
  },
  {
    key: "comfort",
    label: "软硬度/舒适度",
    priority: 76,
    patterns: [
      /太硬/,
      /硬了/,
      /不软/,
      /太软/,
      /软和/,
      /不柔软/,
      /睡着/,
      /不舒服/,
      /坐不了/,
      /坐上/,
      /坐着.*疼/,
      /疼/,
      /塌陷/,
      /塌下去/,
      /透气/,
      /支撑/,
      /弹性/,
      /往下滑/,
      /不好用/,
      /用不了/,
      /躺着/,
    ],
    exclude: [/^疼$/],
  },
  {
    key: "smell",
    label: "气味/过敏",
    priority: 74,
    patterns: [/气味/, /味道/, /异味/, /臭/, /刺鼻/, /过敏/, /皮疹/, /皮肤.*红/],
  },
  {
    key: "care",
    label: "清洗/保养问题",
    priority: 72,
    patterns: [/清洗/, /洗不/, /不好洗/, /不易晒/, /不容易晒/, /发霉/, /潮湿/],
  },
  {
    key: "fit_general",
    label: "不合适/不适合",
    priority: 60,
    // 仅泛词“不合适”，没有尺寸/舒适/质量具体信号时落入此类
    patterns: [/不合适/, /不适合/, /使用不合适/, /坐着不合适/],
    exclude: [
      /太大|太小|偏大|偏小|尺寸|高低|高了|低了|矮了|长了|短了|宽了|窄了|洞/,
      /太硬|太软|不舒服|塌陷|支撑|透气/,
      /质量|材质|破损|裂|坏了/,
    ],
  },
  {
    key: "dont_want",
    label: "不想要/不需要",
    priority: 50,
    patterns: [
      /不想要/,
      /不要了/,
      /不需要/,
      /先不要/,
      /用不上了/,
      /用不上/,
      /不要啦/,
      /先不买/,
      /暂时不要/,
    ],
    // 若同时有更具体信号，由更高 priority 的规则吃掉
  },
];

export function normalizeDescText(raw: unknown): string {
  let s = String(raw ?? "")
    .trim()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ");
  // 全角数字/字母转半角
  s = s.replace(/[\uff01-\uff5e]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  );
  s = s.replace(/[，。！？；：""''、]/g, (ch) => {
    const map: Record<string, string> = {
      "，": ",",
      "。": ".",
      "！": "!",
      "？": "?",
      "；": ";",
      "：": ":",
      "、": ",",
    };
    return map[ch] || ch;
  });
  // 常见口语归一，提升跨店一致性
  s = s
    .replace(/不想要了+/g, "不想要了")
    .replace(/不要了+/g, "不要了")
    .replace(/不需要了+/g, "不需要了")
    .replace(/太硬了+/g, "太硬了")
    .replace(/质量太差。?/g, "质量太差")
    .replace(/[!.。~…]+$/g, "")
    .trim();
  return s;
}

function bigrams(s: string): Set<string> {
  const t = s.replace(/\s+/g, "");
  const set = new Set<string>();
  if (t.length <= 1) {
    if (t) set.add(t);
    return set;
  }
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1;
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function scoreRule(rule: DescRule, text: string): number {
  if (rule.exclude?.some((p) => p.test(text))) return 0;
  let hit = false;
  let patternBoost = 0;
  for (const p of rule.patterns) {
    if (p.test(text)) {
      hit = true;
      // 更长模式略加分，减少短词误伤
      const src = p.source || "";
      patternBoost = Math.max(patternBoost, Math.min(8, Math.floor(src.length / 3)));
    }
  }
  if (!hit) return 0;
  let score = rule.priority * 10 + patternBoost;
  if (rule.boost) {
    for (const b of rule.boost) if (b.test(text)) score += 5;
  }
  return score;
}

/** 单条描述 → 规则/空值聚类（不含 fuzzy） */
export function clusterDescByRules(
  descRaw: unknown,
  reasonRaw?: unknown,
): DescClusterResult {
  const normalized = normalizeDescText(descRaw);
  const reason = normalizeDescText(reasonRaw);

  // 空/占位描述
  if (
    !normalized ||
    /^其他原因$|^其它原因$|^其他$|^其它$|^[,.，。、\s]+$|^\d{1,3}$/.test(normalized)
  ) {
    return {
      key: "empty",
      label: "无有效描述",
      method: "empty",
      normalized,
    };
  }

  // 描述与大项原因相同/几乎相同 → 无补充
  if (
    normalized === reason ||
    (reason &&
      (normalized.includes(reason) || reason.includes(normalized)) &&
      normalized.length <= reason.length + 2)
  ) {
    return {
      key: "empty",
      label: "无有效描述",
      method: "empty",
      normalized,
    };
  }

  let best: DescRule | null = null;
  let bestScore = 0;
  for (const rule of DESC_RULES) {
    if (rule.key === "empty") continue;
    const sc = scoreRule(rule, normalized);
    if (sc > bestScore) {
      bestScore = sc;
      best = rule;
    }
  }

  if (best && bestScore > 0) {
    return {
      key: best.key,
      label: best.label,
      method: "rule",
      normalized,
    };
  }

  return {
    key: `raw:${normalized}`,
    label: normalized.length > 24 ? `${normalized.slice(0, 24)}…` : normalized,
    method: "raw",
    normalized,
  };
}

/**
 * 批量聚类：先规则，再对 raw 在同售后原因内做相似归并
 * @param items [{ id, desc, reason }]
 */
export function clusterDescriptionsBatch(
  items: { id: string; desc: string; reason: string }[],
): Map<string, DescClusterResult> {
  const out = new Map<string, DescClusterResult>();
  const rawPool: {
    id: string;
    reason: string;
    normalized: string;
    grams: Set<string>;
  }[] = [];

  for (const it of items) {
    const r = clusterDescByRules(it.desc, it.reason);
    if (r.method === "raw") {
      rawPool.push({
        id: it.id,
        reason: normalizeDescText(it.reason) || "未填写",
        normalized: r.normalized,
        grams: bigrams(r.normalized),
      });
    } else {
      out.set(it.id, r);
    }
  }

  // 按大项原因分组 fuzzy
  const byReason = new Map<string, typeof rawPool>();
  for (const x of rawPool) {
    const list = byReason.get(x.reason) || [];
    list.push(x);
    byReason.set(x.reason, list);
  }

  // 抬高阈值，并要求足够公共 bigram，避免“字像意思反”
  const FUZZY = 0.58;
  const MIN_SHARED = 2;

  for (const [, list] of byReason) {
    type Cl = { key: string; label: string; grams: Set<string>; count: number };
    const clusters: Cl[] = [];
    // 高频短句优先作代表（更可读）
    const ordered = [...list].sort((a, b) => {
      if (a.normalized.length !== b.normalized.length) {
        return a.normalized.length - b.normalized.length;
      }
      return a.normalized.localeCompare(b.normalized, "zh");
    });

    for (const item of ordered) {
      let best: Cl | null = null;
      let bestScore = 0;
      for (const c of clusters) {
        let shared = 0;
        for (const g of item.grams) if (c.grams.has(g)) shared++;
        if (shared < MIN_SHARED && item.normalized.length > 4) continue;
        const lenRatio =
          Math.min(item.normalized.length, c.label.length) /
          Math.max(item.normalized.length, c.label.length, 1);
        if (lenRatio < 0.35 && item.normalized.length > 6) continue;
        const sc = jaccard(item.grams, c.grams);
        if (sc > bestScore) {
          bestScore = sc;
          best = c;
        }
      }
      if (best && bestScore >= FUZZY) {
        best.count += 1;
        // 代表标签取更短可读
        if (item.normalized.length < best.label.length) {
          best.label =
            item.normalized.length > 24
              ? `${item.normalized.slice(0, 24)}…`
              : item.normalized;
          best.key = `fuzzy:${best.label}`;
        }
        out.set(item.id, {
          key: best.key,
          label: best.label,
          method: "fuzzy",
          normalized: item.normalized,
        });
      } else {
        const label =
          item.normalized.length > 24
            ? `${item.normalized.slice(0, 24)}…`
            : item.normalized;
        const cl: Cl = {
          key: `fuzzy:${label}`,
          label,
          grams: item.grams,
          count: 1,
        };
        clusters.push(cl);
        out.set(item.id, {
          key: cl.key,
          label: cl.label,
          method: list.length === 1 ? "raw" : "fuzzy",
          normalized: item.normalized,
        });
      }
    }
  }

  return out;
}

/** 大项原因规范化展示 */
export function normalizeReasonLabel(reason: unknown): string {
  const s = normalizeDescText(reason);
  if (!s) return "未填写";
  return s;
}
