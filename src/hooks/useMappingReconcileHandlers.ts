import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { FileData } from "../utils/excel";
import { processFile } from "../utils/excel";
import { openDataFiles } from "../utils/desktop";
import type { SKUMapping } from "../services/businessLogic";
import type { PddOrder, ProductSku } from "../services/pddBusiness";
import {
  ingestForOperating,
  ordersToTable,
  productsToSkuMappings,
} from "../services/pddBusiness";
import {
  applySkuMappingsToTable,
  resolveMappingSourceTable,
  buildMappingFileFromProducts,
  summarizeReconcile,
  runPaymentReconcile,
} from "../services/mappingReconcile";
import type { ToastMessage } from "../components/Toast";

type ShowToast = (message: string, type?: ToastMessage["type"]) => void;

export interface MappingReconcileDeps {
  skuMappings: SKUMapping[];
  setSkuMappings: Dispatch<SetStateAction<SKUMapping[]>>;
  setMappingFile: Dispatch<SetStateAction<FileData | null>>;
  setMappingResult: Dispatch<SetStateAction<any[][]>>;
  opProducts: ProductSku[];
  setOpProducts: Dispatch<SetStateAction<ProductSku[]>>;
  opOrders: PddOrder[];
  currentData: any[][];
  paymentFile: FileData | null;
  setPaymentFile: Dispatch<SetStateAction<FileData | null>>;
  setReconcileResult: Dispatch<SetStateAction<any[][]>>;
  setCurrentData: Dispatch<SetStateAction<any[][]>>;
  setCurrentHeaders: Dispatch<SetStateAction<string[]>>;
  showToast: ShowToast;
  reportError: (action: string, error: unknown) => void;
}

export function useMappingReconcileHandlers(deps: MappingReconcileDeps) {
  const {
    skuMappings,
    setSkuMappings,
    setMappingFile,
    setMappingResult,
    opProducts,
    setOpProducts,
    opOrders,
    currentData,
    paymentFile,
    setPaymentFile,
    setReconcileResult,
    setCurrentData,
    setCurrentHeaders,
    showToast,
    reportError,
  } = deps;

  const handleImportMapping = useCallback(async () => {
    try {
      const result = await openDataFiles();
      if (!result.canceled && result.filePaths.length > 0) {
        const fileData = await processFile(result.filePaths[0]);
        if (fileData) {
          const ingested = ingestForOperating(fileData);
          setMappingFile(ingested.normalized);
          if (ingested.kind === "product_master" && ingested.skuMappings) {
            setSkuMappings(ingested.skuMappings);
            setOpProducts(ingested.products);
            showToast(
              `已识别商品资料：${ingested.products.length} 个规格，已生成 SKU 映射`,
              "success",
            );
          } else {
            const mappings: SKUMapping[] = ingested.normalized.data
              .slice(1)
              .map((row) => ({
                platformName: String(row[0] || "").trim(),
                internalCode: String(row[1] || "").trim(),
                price:
                  parseFloat(String(row[2] || 0).replace(/[¥$,]/g, "")) || 0,
              }))
              .filter((m) => m.platformName && m.internalCode);
            setSkuMappings(mappings);
          }
        }
      }
    } catch (error) {
      reportError("导入映射表", error);
    }
  }, [reportError, setMappingFile, setOpProducts, setSkuMappings, showToast]);

  const handleSyncMappingsFromProducts = useCallback(() => {
    if (opProducts.length === 0) {
      showToast("请先在经营分析导入商品资料或从订单生成", "warning");
      return;
    }
    const maps = productsToSkuMappings(opProducts);
    setSkuMappings(maps);
    setMappingFile(buildMappingFileFromProducts(opProducts));
    showToast(`已从商品资料同步 ${maps.length} 条映射规则`, "success");
  }, [opProducts, setMappingFile, setSkuMappings, showToast]);

  const handleApplyMapping = useCallback(() => {
    if (skuMappings.length === 0) {
      showToast("请先导入映射表或从商品资料同步", "warning");
      return;
    }
    if (opOrders.length === 0) {
      showToast("请先在经营分析导入订单（映射已对接主数据）", "warning");
      return;
    }
    const resolved = resolveMappingSourceTable(opOrders, []);
    if (!resolved) {
      showToast("请先在经营分析导入订单", "warning");
      return;
    }
    const newData = applySkuMappingsToTable(resolved.table, skuMappings);
    setMappingResult(newData);
    setCurrentData(newData);
    setCurrentHeaders(newData[0] as string[]);
    showToast(
      `映射完成：${Math.max(0, newData.length - 1)} 行（来源：${resolved.sourceLabel}）`,
      "success",
    );
  }, [
    skuMappings,
    opOrders,
    currentData,
    setMappingResult,
    setCurrentData,
    setCurrentHeaders,
    showToast,
  ]);

  const handleImportPayment = useCallback(async () => {
    try {
      const result = await openDataFiles();
      if (!result.canceled && result.filePaths.length > 0) {
        const fileData = await processFile(result.filePaths[0]);
        if (fileData) {
          setPaymentFile(fileData);
          setReconcileResult([]);
        }
      }
    } catch (error) {
      reportError("导入收款流水", error);
    }
  }, [reportError, setPaymentFile, setReconcileResult]);

  const handleReconcile = useCallback(() => {
    if (!paymentFile) {
      showToast("请先导入收款流水", "warning");
      return;
    }
    if (opOrders.length === 0) {
      showToast("请先在经营分析导入订单（收款对账已对接主数据）", "warning");
      return;
    }
    const orderTable = ordersToTable(opOrders);
    const reconciled = runPaymentReconcile(orderTable, paymentFile.data);
    if (!reconciled.length) {
      showToast("对账结果为空", "warning");
      return;
    }
    setReconcileResult(reconciled);
    setCurrentData(reconciled);
    setCurrentHeaders(reconciled[0] as string[]);
    const { matched, unmatched, unclaimed, byId } =
      summarizeReconcile(reconciled);
    showToast(
      `对账完成：已核销 ${matched}（其中单号/备注匹配 ${byId}）· 未匹配 ${unmatched} · 未认领 ${unclaimed}（订单：${
        `经营分析 ${opOrders.length} 单`
      }）`,
      "success",
    );
  }, [
    paymentFile,
    opOrders,
    currentData,
    setReconcileResult,
    setCurrentData,
    setCurrentHeaders,
    showToast,
  ]);

  return {
    handleImportMapping,
    handleSyncMappingsFromProducts,
    handleApplyMapping,
    handleImportPayment,
    handleReconcile,
  };
}
