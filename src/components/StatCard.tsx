import type { ReactNode } from "react";

export type StatTone = "slate" | "blue" | "emerald" | "amber" | "rose" | "violet" | "sky";

const TONE: Record<
  StatTone,
  { wrap: string; label: string; value: string; hint: string }
> = {
  slate: {
    wrap: "bg-slate-50 border-slate-200",
    label: "text-slate-600",
    value: "text-slate-900",
    hint: "text-slate-500",
  },
  blue: {
    wrap: "bg-blue-50 border-blue-100",
    label: "text-blue-800",
    value: "text-blue-900",
    hint: "text-blue-700/80",
  },
  emerald: {
    wrap: "bg-emerald-50 border-emerald-100",
    label: "text-emerald-800",
    value: "text-emerald-900",
    hint: "text-emerald-700/80",
  },
  amber: {
    wrap: "bg-amber-50 border-amber-100",
    label: "text-amber-800",
    value: "text-amber-900",
    hint: "text-amber-700/80",
  },
  rose: {
    wrap: "bg-rose-50 border-rose-100",
    label: "text-rose-800",
    value: "text-rose-900",
    hint: "text-rose-700/80",
  },
  violet: {
    wrap: "bg-violet-50 border-violet-100",
    label: "text-violet-800",
    value: "text-violet-900",
    hint: "text-violet-700/80",
  },
  sky: {
    wrap: "bg-sky-50 border-sky-100",
    label: "text-sky-800",
    value: "text-sky-900",
    hint: "text-sky-700/80",
  },
};

export interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatTone;
  className?: string;
  onClick?: () => void;
}

/** 统一 KPI / 指标卡片 */
export default function StatCard({
  label,
  value,
  hint,
  tone = "slate",
  className = "",
  onClick,
}: StatCardProps) {
  const t = TONE[tone];
  const clickable = typeof onClick === "function";
  const wrapClass =
    "stat-card rounded-xl border p-3 transition-all duration-150 " +
    t.wrap +
    " " +
    (clickable ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5 " : "") +
    className;

  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={wrapClass}
    >
      <div className={"text-xs font-medium " + t.label}>{label}</div>
      <div className={"text-xl font-bold tabular-nums tracking-tight mt-1 " + t.value}>
        {value}
      </div>
      {hint != null && hint !== "" && (
        <div className={"text-xs mt-1 leading-relaxed " + t.hint}>{hint}</div>
      )}
    </div>
  );
}
