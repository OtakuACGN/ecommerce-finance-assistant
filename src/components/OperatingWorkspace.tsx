import type { Dispatch, SetStateAction } from "react";
import OperatingDashboard from "./OperatingDashboard";
import OperatingSettingsPanel from "./OperatingSettingsPanel";
import OperatingImportPanel from "./OperatingImportPanel";
import OperatingActionBar from "./OperatingActionBar";
import type {
  AdDay,
  AdProduct,
  CostSettings,
  ExpressShipRule,
  OperatingReport,
  PddBillLine,
  PddOrder,
  ProductSku,
  ProductMasterBuildMode,
  ShopFeeOverride,
} from "../services/pddBusiness";
import type { ProductMasterMeta } from "../services/productMasterMeta";

export interface OperatingWorkspaceProps {
  desktopReady: boolean;
  opShopLabel: string;
  setOpShopLabel: Dispatch<SetStateAction<string>>;
  opDragOver: boolean;
  setOpDragOver: Dispatch<SetStateAction<boolean>>;
  onDrop: (e: React.DragEvent) => void;
  onImport: () => void;
  opOrders: PddOrder[];
  opProducts: ProductSku[];
  opBillLines: PddBillLine[];
  opAds: AdDay[];
  opAdProducts: AdProduct[];
  opReport: OperatingReport | null;
  opSources: { kind: string; name: string; rows: number; shop?: string }[];
  opCostSettings: CostSettings;
  setOpCostSettings: Dispatch<SetStateAction<CostSettings>>;
  productImportMode: "replace" | "merge";
  setProductImportMode: Dispatch<SetStateAction<"replace" | "merge">>;
  productMasterMeta: ProductMasterMeta;
  onExportProductMaster: (mode?: ProductMasterBuildMode) => void | Promise<void>;
  onLoadProductMasterFromOrders: (mode?: ProductMasterBuildMode) => void;
  onClearOperating: () => void;
  onBuildReport: () => void;
  onExportOperating: () => void | Promise<void>;
  onExportCostSettings: () => void | Promise<void>;
  onImportCostSettings: () => void | Promise<void>;
  onInvalidateReport: () => void;
  sourceKindLabel: (k: string) => string;
  opSettingsOpen: boolean;
  setOpSettingsOpen: Dispatch<SetStateAction<boolean>>;
  opSettingsHighlight: null | "brand";
  setOpSettingsHighlight: Dispatch<SetStateAction<null | "brand">>;
  onOpenBrandPoint: () => void;
  onResetCostSettings: () => void;
  onApplyCostTemplate: (id: string) => void;
  onAddShopOverride: () => void;
  onUpdateShopOverride: (index: number, patch: Partial<ShopFeeOverride>) => void;
  onRemoveShopOverride: (index: number) => void;
  onSyncShops: () => void;
  onUpdateExpressRule: (index: number, patch: Partial<ExpressShipRule>) => void;
  onExportAnomalies: () => void | Promise<void>;
  onCopyUnmatchedSkus: () => void | Promise<void>;
  onCopyBossOnePager: () => void | Promise<void>;
  onCopyBossOnePagerTsv: () => void | Promise<void>;
  onJumpUnmatched: () => void;
  onShowOperatingView: (view: string) => void;
  /** 视图切换后的表格区域（由 App 根据 opView 计算） */
  tableSection: React.ReactNode;
}

/**
 * 经营分析主工作区：导入 / 参数 / 动作条 / 看板 + 外部注入的明细表
 * 明细表逻辑仍在 App，避免一次搬迁 1k 行视图切换。
 */
export default function OperatingWorkspace(props: OperatingWorkspaceProps) {
  const p = props;
  return (
    <div className="flex-1 min-h-0 overflow-auto p-4 md:p-6 bg-transparent">
      <div className="max-w-[1680px] mx-auto w-full space-y-4">
        <div className="panel-card p-4 md:p-6">
          <div className="mb-3 flex items-start justify-between gap-3 flex-shrink-0">
            <div>
              <h2 className="text-lg font-bold text-slate-800 tracking-tight">
                拼多多经营分析
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                适配订单/账务/商品/推广四表。支持多店铺对比、SPU/规格毛利排行、待补SKU带品名规格导出。
              </p>
            </div>
          </div>

          <div className="contents">
            <OperatingImportPanel
              opShopLabel={p.opShopLabel}
              setOpShopLabel={p.setOpShopLabel}
              opDragOver={p.opDragOver}
              setOpDragOver={p.setOpDragOver}
              onDrop={p.onDrop}
              onImport={p.onImport}
              desktopReady={p.desktopReady}
              opOrders={p.opOrders}
              opProducts={p.opProducts}
              opBillLines={p.opBillLines}
              opAds={p.opAds}
              opAdProducts={p.opAdProducts}
              opReport={p.opReport}
              opSources={p.opSources}
              opCostSettings={p.opCostSettings}
              setOpCostSettings={p.setOpCostSettings}
              productImportMode={p.productImportMode}
              setProductImportMode={p.setProductImportMode}
              productMasterMeta={p.productMasterMeta}
              onExportProductMaster={p.onExportProductMaster}
              onLoadProductMasterFromOrders={p.onLoadProductMasterFromOrders}
              onClearOperating={p.onClearOperating}
              onBuildReport={p.onBuildReport}
              onExportOperating={p.onExportOperating}
              onExportCostSettings={p.onExportCostSettings}
              onImportCostSettings={p.onImportCostSettings}
              onInvalidateReport={p.onInvalidateReport}
              sourceKindLabel={p.sourceKindLabel}
            />

            <OperatingSettingsPanel
              settings={p.opCostSettings}
              setSettings={p.setOpCostSettings}
              open={p.opSettingsOpen}
              setOpen={p.setOpSettingsOpen}
              highlight={p.opSettingsHighlight}
              setHighlight={p.setOpSettingsHighlight}
              onOpenBrandPoint={p.onOpenBrandPoint}
              onReset={p.onResetCostSettings}
              onApplyTemplate={p.onApplyCostTemplate}
              onAddShopOverride={p.onAddShopOverride}
              onUpdateShopOverride={p.onUpdateShopOverride}
              onRemoveShopOverride={p.onRemoveShopOverride}
              onSyncShops={p.onSyncShops}
              onUpdateExpressRule={p.onUpdateExpressRule}
            />
            <OperatingActionBar
              opReport={p.opReport}
              opOrdersLen={p.opOrders.length}
              productMasterMeta={p.productMasterMeta}
              onBuildReport={p.onBuildReport}
              onExportOperating={p.onExportOperating}
              onExportAnomalies={p.onExportAnomalies}
              onCopyUnmatchedSkus={p.onCopyUnmatchedSkus}
              onCopyBossOnePager={p.onCopyBossOnePager}
              onCopyBossOnePagerTsv={p.onCopyBossOnePagerTsv}
              onExportProductMaster={(mode) => void p.onExportProductMaster(mode)}
              onExportCostSettings={p.onExportCostSettings}
              onImportCostSettings={p.onImportCostSettings}
              onJumpUnmatched={p.onJumpUnmatched}
            />

            {p.opSources.length > 0 && (
              <div className="text-xs text-gray-500 mb-3">
                来源：
                {p.opSources.map((s) => (
                  <span
                    key={s.kind + s.name}
                    className="inline-block mr-2 px-2 py-0.5 bg-gray-100 rounded"
                  >
                    {p.sourceKindLabel(s.kind)}
                    {s.shop ? ` · ${s.shop}` : ""} · {s.name} · {s.rows}行
                  </span>
                ))}
              </div>
            )}
          </div>

          {p.opReport && (
            <div className="mt-2">
              <div className="contents">
                <OperatingDashboard
                  opReport={p.opReport}
                  onOpenBrandPoint={p.onOpenBrandPoint}
                  onShowView={(view) => p.onShowOperatingView(view)}
                />
              </div>
            </div>
          )}

          {p.tableSection}
        </div>
      </div>
    </div>
  );
}
