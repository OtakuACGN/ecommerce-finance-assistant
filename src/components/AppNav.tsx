import { PRIMARY_TABS, SECONDARY_TABS, type AppTab } from "../types/appTab";

export interface AppNavProps {
  activeTab: AppTab;
  onChange: (tab: AppTab) => void;
}

export default function AppNav({ activeTab, onChange }: AppNavProps) {
  return (
    <div className="app-header px-4 py-2.5 flex items-center gap-3 flex-wrap">
      <div className="brand-badge mr-1">
        <div className="brand-mark">通</div>
        <div className="leading-tight">
          <div className="text-sm font-bold text-slate-800">店财通</div>
          <div className="text-[11px] text-slate-500">拼多多经营分析 · 毛利对账</div>
        </div>
      </div>

      <div className="h-8 w-px bg-slate-200 hidden md:block" />

      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
        {PRIMARY_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`tab-pill ${activeTab === tab.key ? "tab-pill-active" : "tab-pill-idle"}`}
          >
            {tab.label}
          </button>
        ))}
        <span
          className="mx-1 h-5 w-px bg-slate-200 hidden sm:inline-block"
          aria-hidden
        />
        {SECONDARY_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`tab-pill ${activeTab === tab.key ? "tab-pill-active" : "tab-pill-idle"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1" />
    </div>
  );
}
