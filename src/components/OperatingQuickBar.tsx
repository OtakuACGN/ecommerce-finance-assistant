import type { CostSettings, OperatingReport } from "../services/pddBusiness";
import type { OrderTableFilter } from "../services/opCostSettings";

export interface OperatingQuickBarProps {
  opReport: OperatingReport;
  opView: string;
  orderTableFilter: OrderTableFilter;
  opCostSettings: CostSettings;
  onFilterOrders: (f: OrderTableFilter) => void;
  onShowView: (view: string) => void;
  onOpenBrandPoint: () => void;
}

export default function OperatingQuickBar({
  opReport,
  opView,
  orderTableFilter,
  opCostSettings,
  onFilterOrders,
  onShowView,
  onOpenBrandPoint,
}: OperatingQuickBarProps) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-slate-400 mr-1">快捷</span>
      {[
        {
          key: "all",
          label: "全部订单",
          n: opReport.summary.orderCount,
          run: () => onFilterOrders("all"),
        },
        {
          key: "partial",
          label: "部分退",
          n: opReport.summary.partialRefundCount || 0,
          run: () => onFilterOrders("partial"),
        },
        {
          key: "full",
          label: "全额退",
          n: opReport.summary.fullRefundCount || 0,
          run: () => onFilterOrders("full"),
        },
        {
          key: "neg",
          label: "负毛利",
          n: Math.max(0, (opReport.anomalyNegProfitTable?.length || 1) - 1),
          run: () => onFilterOrders("neg"),
        },
        {
          key: "unmatched",
          label: "待补成本",
          n: opReport.unmatchedSkus?.length || 0,
          run: () => onShowView("unmatched"),
        },
        {
          key: "brand",
          label:
            (opCostSettings.brandPointPct || 0) > 0
              ? `品牌扣点 ${opCostSettings.brandPointPct}%`
              : "填写品牌扣点",
          n: null as number | null,
          run: () => onOpenBrandPoint(),
        },
      ].map((b) => (
        <button
          key={b.key}
          type="button"
          onClick={b.run}
          className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
            (b.key === "partial" ||
              b.key === "full" ||
              b.key === "neg" ||
              b.key === "all") &&
            opView === "orders" &&
            orderTableFilter === b.key
              ? "bg-blue-600 text-white border-blue-600"
              : b.key === "brand"
                ? "bg-violet-50 text-violet-800 border-violet-200 hover:bg-violet-100"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
          }`}
        >
          {b.label}
          {b.n != null ? (
            <span className="ml-1 tabular-nums opacity-80">{b.n}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
