import DataTable from "./DataTable";

export interface MappingTabProps {
  opProductsCount: number;
  opOrdersCount: number;
  skuMappingsCount: number;
  hasMappingFile: boolean;
  mappingFileName?: string;
  desktopReady: boolean;
  mappingResult: any[][];
  onImportMapping: () => void;
  onSyncFromProducts: () => void;
  onApplyMapping: () => void;
  onClearMapping: () => void;
  onGoOperating: () => void;
}

export default function MappingTab({
  opProductsCount,
  opOrdersCount,
  skuMappingsCount,
  hasMappingFile,
  mappingFileName,
  desktopReady,
  mappingResult,
  onImportMapping,
  onSyncFromProducts,
  onApplyMapping,
  onClearMapping,
  onGoOperating,
}: MappingTabProps) {
  const hasRules = hasMappingFile || skuMappingsCount > 0;
  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="font-semibold text-gray-800 mb-1">🏷️ SKU 映射表</h2>
          <p className="text-sm text-gray-500 mb-4">
            平台品名 / 规格 → 内部编码。优先对接经营分析的商品资料与订单。
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 text-sm">
            <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2">
              <div className="text-xs text-violet-600">经营分析商品</div>
              <div className="font-semibold text-violet-900">{opProductsCount} 规格</div>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
              <div className="text-xs text-blue-600">经营分析订单</div>
              <div className="font-semibold text-blue-900">{opOrdersCount} 单</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-xs text-slate-500">当前映射规则</div>
              <div className="font-semibold text-slate-800">{skuMappingsCount} 条</div>
            </div>
          </div>
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center mb-4">
            {hasRules ? (
              <div className="text-green-600">
                <div className="text-2xl mb-2">✅</div>
                <div className="font-medium">{mappingFileName || "已加载映射规则"}</div>
                <div className="text-sm text-gray-500 mt-1">{skuMappingsCount} 条规则</div>
                <button
                  type="button"
                  onClick={onClearMapping}
                  className="mt-2 text-xs text-red-500 hover:underline"
                >
                  清空映射
                </button>
              </div>
            ) : (
              <>
                <div className="text-3xl mb-2">📤</div>
                <div className="text-gray-600 mb-2">导入映射文件，或从商品资料同步</div>
              </>
            )}
            <div className="flex flex-wrap gap-2 justify-center mt-3">
              <button
                type="button"
                onClick={onImportMapping}
                disabled={!desktopReady}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-40"
              >
                选择映射文件
              </button>
              <button
                type="button"
                onClick={onSyncFromProducts}
                disabled={opProductsCount === 0}
                className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 text-sm disabled:opacity-40"
                title="用经营分析已导入的商品资料生成映射"
              >
                从商品资料同步
              </button>
            </div>
          </div>
          {opOrdersCount === 0 && (
            <div className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              尚未导入经营分析订单。映射将无法应用；请先到「经营分析」导入订单。
              <button type="button" className="ml-2 underline" onClick={onGoOperating}>
                去导入
              </button>
            </div>
          )}
          {skuMappingsCount > 0 && (
            <button
              type="button"
              onClick={onApplyMapping}
              disabled={opOrdersCount === 0}
              className="w-full px-4 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 text-sm font-medium disabled:opacity-40"
            >
              应用映射到经营分析订单 →
            </button>
          )}
        </div>
        {mappingResult.length > 0 && (
          <div className="bg-white rounded-xl shadow p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-gray-800 text-sm">映射结果</h3>
              <span className="text-xs text-gray-500">{Math.max(0, mappingResult.length - 1)} 行</span>
            </div>
            <DataTable
              data={mappingResult}
              headers={(mappingResult[0] || []).map(String)}
              stickyCols={2}
            />
          </div>
        )}
      </div>
    </div>
  );
}
