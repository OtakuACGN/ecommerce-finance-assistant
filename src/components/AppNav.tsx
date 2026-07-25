import { PRIMARY_TABS, SECONDARY_TABS, type AppTab } from "../types/appTab";
import {
  BarChart3,
  Calculator,
  CalendarRange,
  GitMerge,
  Megaphone,
  Receipt,
  RotateCcw,
  ShoppingBag,
  TrendingUp,
  Truck,
  type LucideIcon,
} from "lucide-react";

export interface AppNavProps {
  activeTab: AppTab;
  onChange: (tab: AppTab) => void;
}

export default function AppNav({ activeTab, onChange }: AppNavProps) {
  const icons: Record<AppTab, LucideIcon> = {
    operating: BarChart3,
    ztc: Megaphone,
    profit: Calculator,
    salesRank: TrendingUp,
    monthly: CalendarRange,
    mapping: GitMerge,
    reconcile: RotateCcw,
    bill: Receipt,
    express: Truck,
    aftersale: ShoppingBag,
  };
  const renderTab = (
    tab: { key: AppTab; label: string },
    secondary = false,
  ) => {
    const Icon = icons[tab.key];
    const active = activeTab === tab.key;
    return (
      <button
        key={tab.key}
        type="button"
        onClick={() => onChange(tab.key)}
        aria-current={active ? "page" : undefined}
        className={`tab-pill ${
          active ? "tab-pill-active" : "tab-pill-idle"
        } ${secondary ? "tab-pill-secondary" : ""}`}
      >
        <Icon size={15} strokeWidth={active ? 2.4 : 2} aria-hidden />
        <span>{tab.label}</span>
      </button>
    );
  };

  return (
    <header className="app-header px-4 py-2.5 flex items-center gap-3">
      <div className="brand-badge shrink-0">
        <div className="brand-mark">
          <BarChart3 size={18} aria-hidden />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-extrabold tracking-tight text-slate-900">
            店财通
          </div>
          <div className="text-[10px] font-medium tracking-wide text-slate-500">
            PROFIT COMMAND CENTER
          </div>
        </div>
      </div>

      <nav
        aria-label="主功能"
        className="app-nav-track flex items-center gap-1.5 min-w-0 flex-1 overflow-x-auto"
      >
        {PRIMARY_TABS.map((tab) => renderTab(tab))}
        <span
          className="mx-1 h-5 w-px bg-slate-200 shrink-0"
          aria-hidden
        />
        {SECONDARY_TABS.map((tab) => renderTab(tab, true))}
      </nav>
    </header>
  );
}
