import { useEffect, useMemo, useState } from "react";

export type OpViewKey = string;

export interface OpViewItem {
  key: OpViewKey;
  label: string;
  badge?: string | number;
  danger?: boolean;
}

export interface OpViewGroup {
  id: string;
  label: string;
  items: OpViewItem[];
}

export const DEFAULT_OP_VIEW_GROUPS: OpViewGroup[] = [
  {
    id: "overview",
    label: "总览",
    items: [
      { key: "summary", label: "汇总" },
      { key: "bossOnePager", label: "老板一页纸" },
      { key: "lossDiagnosis", label: "本月亏在哪" },
      { key: "anomalies", label: "异常找坑" },
    ],
  },
  {
    id: "rank",
    label: "排行",
    items: [
      { key: "spuRank", label: "SPU毛利" },
      { key: "skuRank", label: "规格毛利" },
      { key: "salesRankSku", label: "规格销售" },
      { key: "salesRankSpu", label: "编码销售" },
      { key: "productReturn", label: "产品退货率" },
    ],
  },
  {
    id: "ops",
    label: "运营",
    items: [
      { key: "rates", label: "退款率" },
      { key: "period", label: "时段对比" },
      { key: "shops", label: "店铺对比" },
      { key: "ads", label: "推广" },
      { key: "express", label: "分快递运费" },
      { key: "expressAlert", label: "快递未匹配" },
    ],
  },
  {
    id: "detail",
    label: "明细",
    items: [
      { key: "orders", label: "订单毛利" },
      { key: "shipLoss", label: "损耗运费" },
      { key: "billTypes", label: "账务类型" },
      { key: "billWide", label: "账务按单" },
      { key: "products", label: "商品成本" },
      { key: "unmatched", label: "待补SKU" },
      { key: "matchMethod", label: "匹配方式" },
    ],
  },
];

function groupIdForView(view: string, groups: OpViewGroup[]): string {
  if (view.startsWith("anomaly")) return "overview";
  for (const g of groups) {
    if (g.items.some((it) => it.key === view)) return g.id;
  }
  return groups[0]?.id || "overview";
}

interface OpViewNavProps {
  value: string;
  onChange: (key: string) => void;
  groups?: OpViewGroup[];
  badges?: Record<string, string | number | undefined>;
}

export default function OpViewNav({
  value,
  onChange,
  groups = DEFAULT_OP_VIEW_GROUPS,
  badges = {},
}: OpViewNavProps) {
  const derived = useMemo(() => groupIdForView(value, groups), [value, groups]);
  const [groupId, setGroupId] = useState(derived);

  useEffect(() => {
    setGroupId(derived);
  }, [derived]);

  const activeGroup = groups.find((g) => g.id === groupId) || groups[0];

  return (
    <div className="op-view-nav space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium text-slate-400 mr-1">视图</span>
        {groups.map((g) => {
          const active = g.id === groupId;
          const cls = active
            ? "px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150 bg-slate-900 text-white border-slate-900 shadow-sm"
            : "px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150 bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50";
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                setGroupId(g.id);
                const inGroup = g.items.some(
                  (it) =>
                    it.key === value ||
                    (value.startsWith("anomaly") && g.id === "overview"),
                );
                if (!inGroup) {
                  const first = g.items[0];
                  if (first) onChange(first.key);
                }
              }}
              className={cls}
            >
              {g.label}
            </button>
          );
        })}
      </div>

      {activeGroup && (
        <div className="flex flex-nowrap gap-1.5 overflow-x-auto pb-0.5">
          {activeGroup.items.map((it) => {
            const badge = badges[it.key] ?? it.badge;
            const isActive =
              value === it.key ||
              (it.key === "anomalies" && String(value).startsWith("anomaly"));
            const dangerActive = isActive && (it.danger || it.key === "anomalies");
            const cls = isActive
              ? dangerActive
                ? "shrink-0 px-3 py-1.5 rounded-lg text-xs border transition-all duration-150 bg-rose-600 text-white border-rose-600 shadow-sm"
                : "shrink-0 px-3 py-1.5 rounded-lg text-xs border transition-all duration-150 bg-blue-600 text-white border-blue-600 shadow-sm"
              : "shrink-0 px-3 py-1.5 rounded-lg text-xs border transition-all duration-150 bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300";
            const badgeCls = isActive ? "ml-1 tabular-nums text-white/90" : "ml-1 tabular-nums text-slate-400";
            return (
              <button
                key={it.key}
                type="button"
                onClick={() => onChange(it.key)}
                className={cls}
              >
                {it.label}
                {badge != null && badge !== "" && (
                  <span className={badgeCls}>{badge}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
