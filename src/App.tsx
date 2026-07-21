import { useState, useCallback, useMemo, useEffect } from "react";
import Toolbar from "./components/Toolbar";
import FileSidebar from "./components/FileSidebar";
import DataTable from "./components/DataTable";
import StatusBar from "./components/StatusBar";
import Toast, { ToastMessage } from "./components/Toast";
import ConfirmDialog from "./components/ConfirmDialog";
import MonthlySummary from "./components/MonthlySummary";
import ExportPanel from "./components/ExportPanel";
import MergePreview from "./components/MergePreview";
import {
  FileData,
  processFile,
  exportToExcel,
  exportToCSV,
} from "./utils/excel";
import {
  hasElectronAPI,
  openDataFiles,
  saveDataFile,
  readLocalFile,
  writeLocalFile,
} from "./utils/desktop";
import {
  smartMergeHeaders,
  executeSmartMerge,
  MergeColumnInfo,
} from "./services/dataProcessor";

interface HistoryState {
  data: any[][];
  headers: string[];
  fileIndex: number | null;
  isMerged: boolean;
}

import {
  BillRecord,
  RefundOrder,
  SKUMapping,
  CommissionDetail,
  detectPlatform,
  findAmount,
  findCol,
  parseBill,
  parseCommissionDetails,
  calculateRefundLossWithMatching,
} from "./services/businessLogic";
import {
  AdDay,
  CostSettings,
  ShopFeeOverride,
  DEFAULT_COST_SETTINGS,
  COST_SETTING_TEMPLATES,
  applyCostTemplate,
  DEFAULT_EXPRESS_RULES,
  ExpressShipRule,
  OperatingReport,
  PddBillLine,
  PddOrder,
  ProductSku,
  ProductMasterBuildMode,
  buildOperatingReport,
  buildProductMasterFromOrders,
  productMasterImportTable,
  productMasterWorkTable,
  productsToSkuMappings,
  mergeProductMasters,
  formatBossOnePagerText,
  guessShopNameFromFile,
  ingestForOperating,
  normalizeShopName,
  sourceKindLabel,
} from "./services/pddBusiness";

const OP_COST_STORAGE_KEY = "pdd-operating-cost-settings";
const PRODUCT_META_KEY = "pdd-product-master-meta";
const PRODUCT_IMPORT_MODE_KEY = "pdd-product-import-mode";

interface ProductMasterMeta {
  lastFileName: string;
  lastImportedAt: string;
  lastExportedAt: string;
  lastMode: "replace" | "merge" | "generated";
  pendingFillCount: number;
  totalCount: number;
  step: 1 | 2 | 3;
}

function loadProductMasterMeta(): ProductMasterMeta {
  try {
    const raw = localStorage.getItem(PRODUCT_META_KEY);
    if (!raw) {
      return {
        lastFileName: "",
        lastImportedAt: "",
        lastExportedAt: "",
        lastMode: "replace",
        pendingFillCount: 0,
        totalCount: 0,
        step: 1,
      };
    }
    const p = JSON.parse(raw);
    return {
      lastFileName: String(p.lastFileName || ""),
      lastImportedAt: String(p.lastImportedAt || ""),
      lastExportedAt: String(p.lastExportedAt || ""),
      lastMode:
        p.lastMode === "merge" || p.lastMode === "generated" ? p.lastMode : "replace",
      pendingFillCount: Math.max(0, Number(p.pendingFillCount) || 0),
      totalCount: Math.max(0, Number(p.totalCount) || 0),
      step: p.step === 2 || p.step === 3 ? p.step : 1,
    };
  } catch {
    return {
      lastFileName: "",
      lastImportedAt: "",
      lastExportedAt: "",
      lastMode: "replace",
      pendingFillCount: 0,
      totalCount: 0,
      step: 1,
    };
  }
}


function cloneDefaultCostSettings(): CostSettings {
  return {
    ...DEFAULT_COST_SETTINGS,
    expressRules: DEFAULT_EXPRESS_RULES.map((r) => ({ ...r })),
    shopFeeOverrides: (DEFAULT_COST_SETTINGS.shopFeeOverrides || []).map((o) => ({
      ...o,
    })),
  };
}

function loadOpCostSettings(): CostSettings {
  try {
    const raw = localStorage.getItem(OP_COST_STORAGE_KEY);
    if (!raw) return cloneDefaultCostSettings();
    const parsed = JSON.parse(raw) as Partial<CostSettings>;
    const rules =
      Array.isArray(parsed.expressRules) && parsed.expressRules.length > 0
        ? parsed.expressRules.map((r) => ({ ...r }))
        : DEFAULT_EXPRESS_RULES.map((r) => ({ ...r }));
    return {
      ...cloneDefaultCostSettings(),
      ...parsed,
      expressRules: rules,
      adAllocateMode:
        parsed.adAllocateMode === "by_order_count" ||
        parsed.adAllocateMode === "none" ||
        parsed.adAllocateMode === "by_gmv"
          ? parsed.adAllocateMode
          : "by_gmv",
      matchBySpecWhenNoCode: parsed.matchBySpecWhenNoCode !== false,
      anomalyHighRefundRate: Math.min(
        1,
        Math.max(0, Number.isFinite(Number(parsed.anomalyHighRefundRate)) ? Number(parsed.anomalyHighRefundRate) : 0.3),
      ),
      anomalyHighRefundMinShipped: Math.max(
        1,
        Math.round(Number(parsed.anomalyHighRefundMinShipped) || 3),
      ),
      brandPointPct: Math.max(0, Number(parsed.brandPointPct) || 0),
      ecommerceTaxPct: Math.max(0, Number(parsed.ecommerceTaxPct) || 0),
      feeBaseMode:
        parsed.feeBaseMode === "goodsTotal" ||
        parsed.feeBaseMode === "merchantReceived" ||
        parsed.feeBaseMode === "revenue"
          ? parsed.feeBaseMode
          : "revenue",
      shopFeeOverrides: Array.isArray(parsed.shopFeeOverrides)
        ? parsed.shopFeeOverrides.map((o: any) => ({
            shopName: String(o?.shopName || ""),
            brandPointPct:
              o?.brandPointPct === null || o?.brandPointPct === ""
                ? null
                : o?.brandPointPct === undefined
                  ? null
                  : Math.max(0, Number(o.brandPointPct) || 0),
            ecommerceTaxPct:
              o?.ecommerceTaxPct === null || o?.ecommerceTaxPct === ""
                ? null
                : o?.ecommerceTaxPct === undefined
                  ? null
                  : Math.max(0, Number(o.ecommerceTaxPct) || 0),
            feeBaseMode:
              o?.feeBaseMode === "revenue" ||
              o?.feeBaseMode === "merchantReceived" ||
              o?.feeBaseMode === "goodsTotal"
                ? o.feeBaseMode
                : "",
          }))
        : [],
    };
  } catch {
    return cloneDefaultCostSettings();
  }
}

type Tab =
  | "data"
  | "mapping"
  | "reconcile"
  | "bill"
  | "salesRank"
  | "monthly"
  | "operating";

function App() {
  const desktopReady = hasElectronAPI();
  const [files, setFiles] = useState<FileData[]>([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(
    null,
  );
  const [currentData, setCurrentData] = useState<any[][]>([]);
  const [currentHeaders, setCurrentHeaders] = useState<string[]>([]);
  const [_mergedData, setMergedData] = useState<any[][] | null>(null);
  const [isMerged, setIsMerged] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [activeTab, setActiveTab] = useState<Tab>("data");

  const [skuMappings, setSkuMappings] = useState<SKUMapping[]>([]);
  const [mappingFile, setMappingFile] = useState<FileData | null>(null);
  const [paymentFile, setPaymentFile] = useState<FileData | null>(null);
  const [billRecords, setBillRecords] = useState<BillRecord[]>([]);
  const [showBillDetail, setShowBillDetail] = useState<BillRecord | null>(null);
  const [orderStats, setOrderStats] = useState<{
    totalOrders: number;
    totalAmount: number;
    platformBreakdown: Record<string, { count: number; amount: number }>;
  } | null>(null);

  // 退款相关
  const [_refundFile, setRefundFile] = useState<FileData | null>(null);
  const [refundRecords, setRefundRecords] = useState<RefundOrder[]>([]);
  const [refundLossData, setRefundLossData] = useState<any[][]>([]);
  const [commissionDetails, setCommissionDetails] = useState<CommissionDetail[]>([]);

  // 拼多多经营分析（订单+账务+商品成本+推广）
  const [opOrders, setOpOrders] = useState<PddOrder[]>([]);
  const [opBillLines, setOpBillLines] = useState<PddBillLine[]>([]);
  const [opProducts, setOpProducts] = useState<ProductSku[]>([]);
  const [opAds, setOpAds] = useState<AdDay[]>([]);
  const [opReport, setOpReport] = useState<OperatingReport | null>(null);
  const [opSources, setOpSources] = useState<
    { kind: string; name: string; rows: number; shop?: string }[]
  >([]);
  const [opDragOver, setOpDragOver] = useState(false);
  const [opView, setOpView] = useState<
    | "summary"
    | "orders"
    | "rates"
    | "shipLoss"
    | "billTypes"
    | "billWide"
    | "ads"
    | "products"
    | "unmatched"
    | "period"
    | "express"
    | "expressAlert"
    | "matchMethod"
    | "shops"
    | "spuRank"
    | "skuRank"
    | "salesRankSku"
    | "salesRankSpu"
    | "productReturn"
    | "anomalies"
    | "anomalyNeg"
    | "anomalyUnmatched"
    | "anomalyFeeFlip"
    | "anomalyHighSku"
    | "lossDiagnosis"
    | "bossOnePager"
  >("summary");
  const [opShopLabel, setOpShopLabel] = useState("");
  const [opRankSort, setOpRankSort] = useState<"profit" | "loss">("profit");
  const [opCostSettings, setOpCostSettings] = useState<CostSettings>(() =>
    loadOpCostSettings(),
  );
  const [opSettingsLoaded, setOpSettingsLoaded] = useState(false);
  const [productImportMode, setProductImportMode] = useState<"replace" | "merge">(
    () => {
      try {
        return localStorage.getItem(PRODUCT_IMPORT_MODE_KEY) === "merge"
          ? "merge"
          : "replace";
      } catch {
        return "replace";
      }
    },
  );
  const [productMasterMeta, setProductMasterMeta] = useState<ProductMasterMeta>(
    () => loadProductMasterMeta(),
  );


  useEffect(() => {
    setOpSettingsLoaded(true);
  }, []);

  useEffect(() => {
    if (!opSettingsLoaded) return;
    try {
      localStorage.setItem(OP_COST_STORAGE_KEY, JSON.stringify(opCostSettings));
    } catch {
      // ignore quota / private mode
    }
  }, [opCostSettings, opSettingsLoaded]);

  useEffect(() => {
    try {
      localStorage.setItem(PRODUCT_META_KEY, JSON.stringify(productMasterMeta));
    } catch {
      /* ignore */
    }
  }, [productMasterMeta]);

  useEffect(() => {
    try {
      localStorage.setItem(PRODUCT_IMPORT_MODE_KEY, productImportMode);
    } catch {
      /* ignore */
    }
  }, [productImportMode]);


  // 返利相关
  const [runtimeNotice, setRuntimeNotice] = useState<string | null>(
    desktopReady
      ? null
      : "当前为浏览器预览模式，可查看界面但无法直接进行本地文件导入导出，请使用桌面应用运行。",
  );

  // Toast 通知
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel?: () => void;
    confirmLabel?: string;
    cancelLabel?: string;
    confirmClassName?: string;
    disabled?: boolean;
    actions?: {
      label: string;
      onClick: () => void;
      className?: string;
      primary?: boolean;
    }[];
  } | null>(null);

  const [showExportPanel, setShowExportPanel] = useState(false);

  const [mergePreview, setMergePreview] = useState<{
    unifiedHeaders: string[];
    columnInfo: MergeColumnInfo[];
    totalRows: number;
  } | null>(null);

  const showToast = useCallback((message: string, type: ToastMessage["type"] = "success") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // 佣金计提
  const [accrualData, setAccrualData] = useState<any[][]>([]);

  const saveHistory = useCallback(
    (data: any[][], headers: string[]) => {
      const newEntry: HistoryState = {
        data: [...data.map((row) => [...row])],
        headers: [...headers],
        fileIndex: selectedFileIndex,
        isMerged,
      };
      setHistory((prev) => {
        const newHistory = prev.slice(0, historyIndex + 1);
        newHistory.push(newEntry);
        return newHistory;
      });
      setHistoryIndex((prev) => prev + 1);
    },
    [selectedFileIndex, isMerged, historyIndex],
  );

  const reportError = useCallback((action: string, error: unknown) => {
    const message = error instanceof Error ? error.message : `${action}失败`;
    console.error(`${action}失败:`, error);
    setRuntimeNotice(`${action}失败：${message}`);
  }, []);

  const handleUndo = useCallback(() => {
    if (historyIndex <= 0) return;
    const prev = history[historyIndex - 1];
    setCurrentData(prev.data);
    setCurrentHeaders(prev.headers);
    setHistoryIndex((prev) => prev - 1);
  }, [history, historyIndex]);

  const handleImportOrders = useCallback(async () => {
    try {
      const result = await openDataFiles();
      if (!result.canceled && result.filePaths.length > 0) {
        const newFiles: FileData[] = [];
        for (const filePath of result.filePaths) {
          const fileData = await processFile(filePath);
          if (fileData) newFiles.push(fileData);
        }
        setFiles((prev) => [...prev, ...newFiles]);
        if (selectedFileIndex === null && newFiles.length > 0) {
          setSelectedFileIndex(files.length);
          setCurrentHeaders(newFiles[0].headers);
          setCurrentData(newFiles[0].data);
          setIsMerged(false);
          saveHistory(newFiles[0].data, newFiles[0].headers);
        }
        computeStats([...files, ...newFiles]);
      }
    } catch (error) {
      reportError("导入订单", error);
    }
  }, [files.length, selectedFileIndex, saveHistory, reportError]);

  const computeStats = (allFiles: FileData[]) => {
    const allRows: any[][] = [];
    const platformMap: Record<string, { count: number; amount: number }> = {};
    allFiles.forEach((file) => {
      const dataRows = file.data.slice(1);
      allRows.push(...dataRows);
      const platform = detectPlatform(file.name);
      if (!platformMap[platform])
        platformMap[platform] = { count: 0, amount: 0 };
      platformMap[platform].count += dataRows.length;
      dataRows.forEach((row) => {
        const amount = findAmount(row);
        if (!isNaN(amount)) platformMap[platform].amount += amount;
      });
    });
    const totalAmount = allRows.reduce((sum, row) => sum + findAmount(row), 0);
    setOrderStats({
      totalOrders: allRows.length,
      totalAmount,
      platformBreakdown: platformMap,
    });
  };

  const handleFileSelect = useCallback(
    (index: number) => {
      setSelectedFileIndex(index);
      if (index < files.length) {
        setCurrentHeaders(files[index].headers);
        setCurrentData(files[index].data);
        setIsMerged(false);
        setSearchText("");
      }
    },
    [files],
  );

  const handleRemoveFile = useCallback(
    (index: number) => {
      setFiles((prev) => prev.filter((_, i) => i !== index));
      if (selectedFileIndex === index) {
        setSelectedFileIndex(null);
        setCurrentData([]);
        setCurrentHeaders([]);
      } else if (selectedFileIndex !== null && selectedFileIndex > index)
        setSelectedFileIndex(selectedFileIndex - 1);
    },
    [selectedFileIndex],
  );

  const handleMergeWithPreview = useCallback(() => {
    if (files.length < 2) return;
    const { unifiedHeaders, columnInfo, totalRows } = smartMergeHeaders(files);
    setMergePreview({ unifiedHeaders, columnInfo, totalRows });
  }, [files]);

  const handleConfirmMerge = useCallback(() => {
    if (!mergePreview || files.length < 2) return;
    const totalRows = mergePreview.totalRows;
    const merged = executeSmartMerge(files, mergePreview.columnInfo);
    setMergedData(merged);
    setCurrentHeaders(mergePreview.unifiedHeaders);
    setCurrentData(merged);
    setIsMerged(true);
    saveHistory(merged, mergePreview.unifiedHeaders);
    computeStats(files);
    setMergePreview(null);
    showToast(`合并完成：${files.length} 个文件，${totalRows} 行数据`, "success");
  }, [mergePreview, files, saveHistory, computeStats, showToast]);

  const handleDeduplicate = useCallback(
    (columnIndex?: number) => {
      if (currentData.length === 0) return;
      const headers = currentData[0];
      const dataRows = currentData.slice(1);
      let uniqueRows: any[][];
      if (columnIndex !== undefined && columnIndex >= 0) {
        const seen = new Set();
        uniqueRows = dataRows.filter((row) => {
          const key = row[columnIndex];
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      } else {
        const seen = new Set();
        uniqueRows = dataRows.filter((row) => {
          const key = JSON.stringify(row);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
      const newData = [headers, ...uniqueRows];
      setCurrentData(newData);
      if (selectedFileIndex !== null && !isMerged) {
        const newFiles = [...files];
        newFiles[selectedFileIndex] = {
          ...files[selectedFileIndex],
          data: newData,
        };
        setFiles(newFiles);
      } else if (isMerged) {
        setMergedData(newData);
      }
      saveHistory(newData, headers);
    },
    [currentData, selectedFileIndex, isMerged, files, saveHistory],
  );

  const handleCleanEmpty = useCallback(() => {
    if (currentData.length === 0) return;
    const headers = currentData[0];
    const dataRows = currentData.slice(1);
    const nonEmptyRows = dataRows.filter((row) =>
      row.some(
        (cell) =>
          cell !== null && cell !== undefined && String(cell).trim() !== "",
      ),
    );
    const nonEmptyCols = headers.map((_, colIndex) =>
      dataRows.some((row) => {
        const cell = row[colIndex];
        return (
          cell !== null && cell !== undefined && String(cell).trim() !== ""
        );
      }),
    );
    const cleanedHeaders = headers.filter((_, i) => nonEmptyCols[i]);
    const cleanedRows = nonEmptyRows.map((row) =>
      row.filter((_, i) => nonEmptyCols[i]),
    );
    const newData = [cleanedHeaders, ...cleanedRows];
    setCurrentData(newData);
    setCurrentHeaders(cleanedHeaders);
    if (selectedFileIndex !== null && !isMerged) {
      const newFiles = [...files];
      newFiles[selectedFileIndex] = {
        ...files[selectedFileIndex],
        headers: cleanedHeaders,
        data: newData,
      };
      setFiles(newFiles);
    } else if (isMerged) {
      setMergedData(newData);
    }
    saveHistory(newData, cleanedHeaders);
  }, [currentData, selectedFileIndex, isMerged, files, saveHistory]);

  const handleTrimWhitespace = useCallback(() => {
    if (currentData.length === 0) return;
    const headers = currentData[0];
    const dataRows = currentData.slice(1);
    const trimmedRows = dataRows.map((row) =>
      row.map((cell) => (typeof cell === "string" ? cell.trim() : cell)),
    );
    const newData = [headers, ...trimmedRows];
    setCurrentData(newData);
    if (selectedFileIndex !== null && !isMerged) {
      const newFiles = [...files];
      newFiles[selectedFileIndex] = {
        ...files[selectedFileIndex],
        data: newData,
      };
      setFiles(newFiles);
    }
    saveHistory(newData, headers);
  }, [currentData, selectedFileIndex, isMerged, files, saveHistory]);

  const handleStandardizeDate = useCallback(() => {
    if (currentData.length === 0) return;
    const headers = currentData[0];
    const dataRows = currentData.slice(1);
    const standardizedRows = dataRows.map((row) =>
      row.map((cell) => {
        if (typeof cell !== "string") return cell;
        const trimmed = cell.trim();
        const patterns = [
          { regex: /^(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})日?$/ },
          { regex: /^(\d{1,2})[月/-](\d{1,2})[日/-](\d{4})$/ },
          { regex: /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/ },
          { regex: /^(\d{4})(\d{2})(\d{2})$/ },
        ];
        for (const p of patterns) {
          const match = trimmed.match(p.regex as any);
          if (match) {
            try {
              let y = "",
                m = "",
                d = "";
              if (match[1].length === 4) {
                y = match[1];
                m = match[2].padStart(2, "0");
                d = match[3].padStart(2, "0");
              } else {
                y = match[3];
                m = match[1].padStart(2, "0");
                d = match[2].padStart(2, "0");
              }
              const date = new Date(`${y}-${m}-${d}`);
              if (!isNaN(date.getTime()))
                return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
            } catch {}
          }
        }
        return cell;
      }),
    );
    const newData = [headers, ...standardizedRows];
    setCurrentData(newData);
    if (selectedFileIndex !== null && !isMerged) {
      const newFiles = [...files];
      newFiles[selectedFileIndex] = {
        ...files[selectedFileIndex],
        data: newData,
      };
      setFiles(newFiles);
    }
    saveHistory(newData, headers);
  }, [currentData, selectedFileIndex, isMerged, files, saveHistory]);

  const handleFillEmpty = useCallback(
    (fillValue: string) => {
      if (currentData.length === 0) return;
      const headers = currentData[0];
      const dataRows = currentData.slice(1);
      const filledRows = dataRows.map((row) =>
        row.map((cell) => {
          if (cell === null || cell === undefined || String(cell).trim() === "")
            return fillValue;
          return cell;
        }),
      );
      const newData = [headers, ...filledRows];
      setCurrentData(newData);
      if (selectedFileIndex !== null && !isMerged) {
        const newFiles = [...files];
        newFiles[selectedFileIndex] = {
          ...files[selectedFileIndex],
          data: newData,
        };
        setFiles(newFiles);
      }
      saveHistory(newData, headers);
    },
    [currentData, selectedFileIndex, isMerged, files, saveHistory],
  );

  const handleSelectColumns = useCallback(
    (selectedCols: number[]) => {
      if (currentData.length === 0) return;
      const headers = currentData[0];
      const dataRows = currentData.slice(1);
      const newHeaders = selectedCols.map((i) => headers[i]);
      const newRows = dataRows.map((row) => selectedCols.map((i) => row[i]));
      const newData = [newHeaders, ...newRows];
      setCurrentData(newData);
      setCurrentHeaders(newHeaders);
      if (selectedFileIndex !== null && !isMerged) {
        const newFiles = [...files];
        newFiles[selectedFileIndex] = {
          ...files[selectedFileIndex],
          headers: newHeaders,
          data: newData,
        };
        setFiles(newFiles);
      } else if (isMerged) {
        setMergedData(newData);
      }
      saveHistory(newData, newHeaders);
    },
    [currentData, selectedFileIndex, isMerged, files, saveHistory],
  );

  // ========== Confirm-wrapped toolbar handlers ==========

  const handleDeduplicateWithConfirm = useCallback(
    (columnIndex: number) => {
      if (currentData.length === 0) return;
      const dataRows = currentData.slice(1);
      const seen = new Set();
      let removed = 0;
      dataRows.forEach((row) => {
        const key = columnIndex >= 0 ? row[columnIndex] : JSON.stringify(row);
        if (seen.has(key)) {
          removed++;
        } else {
          seen.add(key);
        }
      });
      setConfirmDialog({
        title: "确认去重",
        message:
          removed > 0
            ? `将删除 ${removed} 行重复数据，保留 ${dataRows.length - removed} 行。`
            : "没有发现重复行，无需去重。",
        onConfirm: () => {
          setConfirmDialog((prev) => prev ? { ...prev, disabled: true } : null);
          handleDeduplicate(columnIndex);
          setConfirmDialog(null);
          if (removed > 0) {
            showToast(`去重完成：删除了 ${removed} 行`, "success");
          }
        },
        confirmLabel: removed > 0 ? "确认去重" : "好的",
        confirmClassName: "bg-orange-500 hover:bg-orange-600",
      });
    },
    [currentData, handleDeduplicate],
  );

  const handleCleanEmptyWithConfirm = useCallback(() => {
    if (currentData.length === 0) return;
    const dataRows = currentData.slice(1);
    const nonEmptyRows = dataRows.filter((row) =>
      row.some(
        (cell) =>
          cell !== null && cell !== undefined && String(cell).trim() !== "",
      ),
    );
    const removed = dataRows.length - nonEmptyRows.length;
    setConfirmDialog({
      title: "确认清空",
      message:
        removed > 0
          ? `将删除 ${removed} 行空行/空列，保留 ${nonEmptyRows.length} 行。`
          : "没有发现空行空列，无需清空。",
      onConfirm: () => {
        setConfirmDialog((prev) => prev ? { ...prev, disabled: true } : null);
        handleCleanEmpty();
        setConfirmDialog(null);
        if (removed > 0) {
          showToast(`清空完成：删除了 ${removed} 行空行`, "success");
        }
      },
      confirmLabel: removed > 0 ? "确认清空" : "好的",
      confirmClassName: "bg-yellow-500 hover:bg-yellow-600",
    });
  }, [currentData, handleCleanEmpty]);

  const handleTrimWhitespaceWithConfirm = useCallback(() => {
    if (currentData.length === 0) return;
    setConfirmDialog({
      title: "确认 Trim",
      message: "去除所有单元格的首尾空格。",
      onConfirm: () => {
        setConfirmDialog((prev) => prev ? { ...prev, disabled: true } : null);
        handleTrimWhitespace();
        setConfirmDialog(null);
        showToast("Trim 完成", "success");
      },
      confirmClassName: "bg-gray-500 hover:bg-gray-600",
    });
  }, [handleTrimWhitespace]);

  const handleStandardizeDateWithConfirm = useCallback(() => {
    if (currentData.length === 0) return;
    setConfirmDialog({
      title: "确认日期格式规范化",
      message: "将各种日期格式统一为 YYYY-MM-DD。",
      onConfirm: () => {
        setConfirmDialog((prev) => prev ? { ...prev, disabled: true } : null);
        handleStandardizeDate();
        setConfirmDialog(null);
        showToast("日期格式规范化完成", "success");
      },
      confirmClassName: "bg-indigo-500 hover:bg-indigo-600",
    });
  }, [handleStandardizeDate]);

  const handleFillEmptyWithConfirm = useCallback(
    (value: string) => {
      if (currentData.length === 0) return;
      setConfirmDialog({
        title: "确认填充空值",
        message: `将使用 "${value}" 填充所有空单元格。`,
        onConfirm: () => {
          setConfirmDialog((prev) => prev ? { ...prev, disabled: true } : null);
          handleFillEmpty(value);
          setConfirmDialog(null);
          showToast(`已使用 "${value}" 填充空值`, "success");
        },
        confirmClassName: "bg-teal-500 hover:bg-teal-600",
      });
    },
    [handleFillEmpty],
  );

  const handleSelectColumnsWithConfirm = useCallback(
    (selectedCols: number[]) => {
      if (currentData.length === 0) return;
      const headers = currentData[0];
      const currentColCount = headers.length;
      const newColCount = selectedCols.length;
      const removed = currentColCount - newColCount;
      setConfirmDialog({
        title: "确认选列",
        message:
          removed > 0
            ? `将保留 ${newColCount} 列，删除 ${removed} 列。`
            : `将保留全部 ${newColCount} 列。`,
        onConfirm: () => {
          setConfirmDialog((prev) => prev ? { ...prev, disabled: true } : null);
          handleSelectColumns(selectedCols);
          setConfirmDialog(null);
          if (removed > 0) {
            showToast(`选列完成：保留 ${newColCount} 列`, "success");
          }
        },
        confirmLabel: removed > 0 ? "确认选列" : "好的",
        confirmClassName: "bg-pink-500 hover:bg-pink-600",
      });
    },
    [currentData, handleSelectColumns],
  );

  // Combined one-click clean transformation (applies all ops to same data, single state update)
  const applyOneClickClean = useCallback((data: any[]) => {
    if (data.length === 0) return;
    const headers = data[0];
    let dataRows = data.slice(1);

    // 1. Trim whitespace
    dataRows = dataRows.map((row: any[]) =>
      row.map((cell: any) => (typeof cell === "string" ? cell.trim() : cell)),
    );

    // 2. Remove empty rows
    dataRows = dataRows.filter((row: any[]) =>
      row.some(
        (cell: any) =>
          cell !== null && cell !== undefined && String(cell).trim() !== "",
      ),
    );

    // 3. Standardize dates
    dataRows = dataRows.map((row: any[]) =>
      row.map((cell: any) => {
        if (typeof cell !== "string") return cell;
        const trimmed = cell.trim();
        const patterns = [
          { regex: /^(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})日?$/ },
          { regex: /^(\d{1,2})[月/-](\d{1,2})[日/-](\d{4})$/ },
          { regex: /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/ },
          { regex: /^(\d{4})(\d{2})(\d{2})$/ },
        ];
        for (const p of patterns) {
          const match = trimmed.match(p.regex as any);
          if (match) {
            try {
              let y = '', m = '', d = '';
              if (match[1].length === 4) {
                y = match[1];
                m = match[2].padStart(2, '0');
                d = match[3].padStart(2, '0');
              } else {
                y = match[3];
                m = match[1].padStart(2, '0');
                d = match[2].padStart(2, '0');
              }
              const date = new Date(`${y}-${m}-${d}`);
              if (!isNaN(date.getTime()))
                return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            } catch {}
          }
        }
        return cell;
      })
    );

    const newData = [headers, ...dataRows];
    setCurrentData(newData);
    setCurrentHeaders(headers);
    if (selectedFileIndex !== null && !isMerged) {
      const newFiles = [...files];
      newFiles[selectedFileIndex] = { ...files[selectedFileIndex], data: newData, headers };
      setFiles(newFiles);
    } else if (isMerged) {
      setMergedData(newData);
    }
    saveHistory(newData, headers);
  }, [selectedFileIndex, isMerged, files, saveHistory]);

  const handleOneClickCleanWithConfirm = useCallback(() => {
    if (currentData.length === 0) return;
    const dataRows = currentData.slice(1);
    const nonEmptyRows = dataRows.filter(row =>
      row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')
    );
    const removedRows = dataRows.length - nonEmptyRows.length;

    setConfirmDialog({
      title: "确认一键清洗",
      message: `将执行以下操作：\n1. 去除所有单元格的前后空格\n2. 删除 ${removedRows} 行空行\n3. 将日期格式统一为 YYYY-MM-DD`,
      onConfirm: () => {
        setConfirmDialog(prev => prev ? { ...prev, disabled: true } : null);
        applyOneClickClean(currentData);
        setConfirmDialog(null);
        showToast("一键清洗完成", "success");
      },
      confirmClassName: "bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600",
    });
  }, [currentData, applyOneClickClean, showToast]);


  // ========== 拼多多经营分析 ==========
  const pushOpSource = useCallback(
    (kind: string, name: string, rows: number, shop?: string) => {
      setOpSources((prev) => {
        // 同类型+同店铺覆盖；不同类型可并存
        const others = prev.filter(
          (s) => !(s.kind === kind && (s.shop || "") === (shop || "")),
        );
        return [...others, { kind, name, rows, shop }];
      });
    },
    [],
  );

  const handleOperatingImportPaths = useCallback(
    async (filePaths: string[]) => {
      if (!filePaths.length) return;
      const stats = {
        orders: 0,
        bill: 0,
        products: 0,
        ads: 0,
        unknown: 0,
        skippedOrders: 0,
        names: [] as string[],
      };
      // 本地工作副本，避免循环内 setState 竞态 + 支持冲突选择
      let localOrders = opOrders.slice();
      let localProducts = opProducts.slice();
      let localBill = opBillLines.slice();
      let localAds = opAds.slice();

      const askOrderConflict = (payload: {
        shop: string;
        fileName: string;
        existing: number;
        incoming: number;
        overlap: number;
      }) =>
        new Promise<"merge" | "replace_shop" | "append_new" | "skip">((resolve) => {
          setConfirmDialog({
            title: `店铺「${payload.shop}」已有订单`,
            message: `文件：${payload.fileName}\n已有 ${payload.existing} 单，本次 ${payload.incoming} 单，订单号重叠 ${payload.overlap} 单。\n请选择导入策略：`,
            onConfirm: () => {
              setConfirmDialog(null);
              resolve("merge");
            },
            onCancel: () => resolve("skip"),
            cancelLabel: "取消/跳过",
            confirmLabel: "合并(同单覆盖)",
            actions: [
              {
                label: "合并(同单覆盖)",
                primary: true,
                className:
                  "px-3 py-2 text-white rounded-lg text-sm bg-blue-600 hover:bg-blue-700",
                onClick: () => {
                  setConfirmDialog(null);
                  resolve("merge");
                },
              },
              {
                label: "替换本店订单",
                className:
                  "px-3 py-2 text-white rounded-lg text-sm bg-rose-600 hover:bg-rose-700",
                onClick: () => {
                  setConfirmDialog(null);
                  resolve("replace_shop");
                },
              },
              {
                label: "只追加新单",
                className:
                  "px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50",
                onClick: () => {
                  setConfirmDialog(null);
                  resolve("append_new");
                },
              },
              {
                label: "跳过此文件",
                className:
                  "px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50",
                onClick: () => {
                  setConfirmDialog(null);
                  resolve("skip");
                },
              },
            ],
          } as any);
        });

      try {
        for (const filePath of filePaths) {
          const fileData = await processFile(filePath);
          if (!fileData) {
            stats.unknown += 1;
            continue;
          }
          const ingested = ingestForOperating(fileData);
          const kind = ingested.kind;
          const shop = normalizeShopName(
            opShopLabel || guessShopNameFromFile(fileData.name),
          );
          stats.names.push(`${fileData.name}→${sourceKindLabel(kind)}`);

          if (kind === "pdd_orders") {
            const stamped = ingested.orders.map((o) => ({
              ...o,
              shopName: shop,
            }));
            const existingShop = localOrders.filter(
              (o) => normalizeShopName(o.shopName) === shop,
            );
            let mode: "merge" | "replace_shop" | "append_new" | "skip" = "merge";
            if (existingShop.length > 0 && stamped.length > 0) {
              const existIds = new Set(existingShop.map((o) => o.orderId));
              const overlap = stamped.filter((o) => existIds.has(o.orderId)).length;
              mode = await askOrderConflict({
                shop,
                fileName: fileData.name,
                existing: existingShop.length,
                incoming: stamped.length,
                overlap,
              });
            }
            if (mode === "skip") {
              stats.skippedOrders += stamped.length;
              continue;
            }
            if (mode === "replace_shop") {
              localOrders = [
                ...localOrders.filter((o) => normalizeShopName(o.shopName) !== shop),
                ...stamped,
              ];
            } else if (mode === "append_new") {
              const ids = new Set(localOrders.map((o) => o.orderId));
              localOrders = [
                ...localOrders,
                ...stamped.filter((o) => !ids.has(o.orderId)),
              ];
            } else {
              const map = new Map(localOrders.map((o) => [o.orderId, o]));
              for (const o of stamped) map.set(o.orderId, o);
              localOrders = Array.from(map.values());
            }
            pushOpSource(kind, fileData.name, stamped.length, shop);
            setFiles((prev) => [...prev, ingested.normalized]);
            stats.orders += stamped.length;
          } else if (kind === "pdd_bill") {
            const stamped = ingested.billLines.map((l) => ({
              ...l,
              shopName: shop,
            }));
            localBill = [...localBill, ...stamped];
            if (ingested.billRecord) {
              setBillRecords((prev) => [...prev, ingested.billRecord!]);
            }
            pushOpSource(kind, fileData.name, stamped.length, shop);
            stats.bill += stamped.length;
          } else if (kind === "product_master") {
            const incoming = ingested.products;
            if (productImportMode === "merge" && localProducts.length > 0) {
              localProducts = mergeProductMasters(localProducts, incoming);
            } else {
              localProducts = incoming;
            }
            setSkuMappings(productsToSkuMappings(localProducts));
            pushOpSource(kind, fileData.name, localProducts.length, shop);
            const pending = localProducts.filter(
              (p) => (p.costPrice || 0) + (p.packCost || 0) <= 0,
            ).length;
            setProductMasterMeta({
              lastFileName: fileData.name,
              lastImportedAt: new Date().toLocaleString("zh-CN"),
              lastExportedAt: productMasterMeta.lastExportedAt,
              lastMode: productImportMode === "merge" ? "merge" : "replace",
              pendingFillCount: pending,
              totalCount: localProducts.length,
              step: 3,
            });
            stats.products += incoming.length;
          } else if (kind === "ad_daily") {
            const stamped = ingested.adDays.map((d) => ({
              ...d,
              shopName: shop,
            }));
            localAds = [
              ...localAds.filter((d) => normalizeShopName(d.shopName) !== shop),
              ...stamped,
            ];
            pushOpSource(kind, fileData.name, stamped.length, shop);
            stats.ads += stamped.length;
          } else {
            stats.unknown += 1;
            showToast(
              `无法识别：${fileData.name}（需含订单/账务/商品资料/推广分天）`,
              "warning",
            );
          }
        }
        setOpOrders(localOrders);
        setOpProducts(localProducts);
        setOpBillLines(localBill);
        setOpAds(localAds);
        setOpReport(null);
        const parts = [
          stats.orders ? `订单${stats.orders}单` : "",
          stats.bill ? `账务${stats.bill}行` : "",
          stats.products
            ? `商品${stats.products}规格(${productImportMode === "merge" ? "合并" : "替换"})`
            : "",
          stats.ads ? `推广${stats.ads}天` : "",
          stats.skippedOrders ? `跳过订单文件` : "",
          stats.unknown ? `未识别${stats.unknown}个` : "",
        ].filter(Boolean);
        showToast(
          parts.length
            ? `已导入 ${filePaths.length} 个文件：${parts.join(" · ")}`
            : "未导入有效数据",
          parts.length && !stats.unknown ? "success" : "warning",
        );
      } catch (error) {
        reportError("经营分析导入", error);
      }
    },
    [
      opOrders,
      opProducts,
      opBillLines,
      opAds,
      opShopLabel,
      productImportMode,
      productMasterMeta.lastExportedAt,
      pushOpSource,
      reportError,
      showToast,
    ],
  );

  const handleOperatingImport = useCallback(
    async (_expect?: string) => {
      try {
        const result = await openDataFiles();
        if (result.canceled || result.filePaths.length === 0) return;
        await handleOperatingImportPaths(result.filePaths);
      } catch (error) {
        reportError("经营分析导入", error);
      }
    },
    [handleOperatingImportPaths, reportError],
  );

  const handleOperatingDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setOpDragOver(false);
      if (!desktopReady) {
        showToast("请在桌面应用中拖入文件", "warning");
        return;
      }
      const files = Array.from(e.dataTransfer.files || []);
      const paths = files
        .map((f) => (f as File & { path?: string }).path || "")
        .filter(Boolean);
      if (!paths.length) {
        showToast(
          "未拿到本地路径。请用「选择文件」或在桌面应用窗口内拖入",
          "warning",
        );
        return;
      }
      await handleOperatingImportPaths(paths);
    },
    [desktopReady, handleOperatingImportPaths, showToast],
  );

  const handleExportCostSettings = useCallback(async () => {
    try {
      const defaultName = `经营参数_${new Date().toISOString().slice(0, 10)}.json`;
      const result = await saveDataFile(defaultName);
      if (result.canceled || !result.filePath) return;
      const payload = {
        version: 1,
        app: "diancaitong",
        exportedAt: new Date().toISOString(),
        costSettings: opCostSettings,
      };
      await writeLocalFile(
        result.filePath,
        JSON.stringify(payload, null, 2),
      );
      showToast("经营参数已导出 JSON", "success");
    } catch (error) {
      reportError("导出经营参数", error);
    }
  }, [opCostSettings, reportError, showToast]);

  const handleImportCostSettings = useCallback(async () => {
    try {
      const result = await openDataFiles();
      if (result.canceled || !result.filePaths.length) return;
      const fp = result.filePaths[0];
      if (!/\.json$/i.test(fp)) {
        showToast("请选择 .json 经营参数文件", "warning");
        return;
      }
      const read = await readLocalFile(fp);
      if (!read.success || !read.buffer) {
        showToast(read.error || "读取失败", "error");
        return;
      }
      const text = new TextDecoder("utf-8").decode(read.buffer);
      const parsed = JSON.parse(text);
      const raw = (parsed?.costSettings || parsed) as Partial<CostSettings>;
      if (!raw || typeof raw !== "object") {
        showToast("JSON 格式不正确", "error");
        return;
      }
      const rules =
        Array.isArray(raw.expressRules) && raw.expressRules.length > 0
          ? raw.expressRules.map((r) => ({ ...r }))
          : DEFAULT_EXPRESS_RULES.map((r) => ({ ...r }));
      const overrides = Array.isArray(raw.shopFeeOverrides)
        ? raw.shopFeeOverrides.map((o: any) => ({
            shopName: String(o?.shopName || ""),
            brandPointPct:
              o?.brandPointPct === null || o?.brandPointPct === ""
                ? null
                : o?.brandPointPct === undefined
                  ? null
                  : Math.max(0, Number(o.brandPointPct) || 0),
            ecommerceTaxPct:
              o?.ecommerceTaxPct === null || o?.ecommerceTaxPct === ""
                ? null
                : o?.ecommerceTaxPct === undefined
                  ? null
                  : Math.max(0, Number(o.ecommerceTaxPct) || 0),
            feeBaseMode:
              o?.feeBaseMode === "revenue" ||
              o?.feeBaseMode === "merchantReceived" ||
              o?.feeBaseMode === "goodsTotal"
                ? o.feeBaseMode
                : "",
          }))
        : [];
      setOpCostSettings({
        ...cloneDefaultCostSettings(),
        ...raw,
        expressRules: rules,
        shopFeeOverrides: overrides,
        brandPointPct: Math.max(0, Number(raw.brandPointPct) || 0),
        ecommerceTaxPct: Math.max(0, Number(raw.ecommerceTaxPct) || 0),
        feeBaseMode:
          raw.feeBaseMode === "goodsTotal" ||
          raw.feeBaseMode === "merchantReceived" ||
          raw.feeBaseMode === "revenue"
            ? raw.feeBaseMode
            : "revenue",
        adAllocateMode:
          raw.adAllocateMode === "by_order_count" ||
          raw.adAllocateMode === "none" ||
          raw.adAllocateMode === "by_gmv"
            ? raw.adAllocateMode
            : "by_gmv",
        matchBySpecWhenNoCode: raw.matchBySpecWhenNoCode !== false,
        anomalyHighRefundRate: Math.min(
          1,
          Math.max(0, Number.isFinite(Number(raw.anomalyHighRefundRate)) ? Number(raw.anomalyHighRefundRate) : 0.3),
        ),
        anomalyHighRefundMinShipped: Math.max(
          1,
          Math.round(Number(raw.anomalyHighRefundMinShipped) || 3),
        ),
      });
      setOpReport(null);
      showToast("经营参数已导入，请重新生成报表", "success");
    } catch (error) {
      reportError("导入经营参数", error);
    }
  }, [reportError, showToast]);

  const handleExportAnomalies = useCallback(async () => {
    if (!opReport) {
      showToast("请先生成经营报表", "error");
      return;
    }
    try {
      const defaultName = `异常订单_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const result = await saveDataFile(defaultName);
      if (result.canceled || !result.filePath) return;
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const sheets: [string, any[][]][] = [
        ["异常汇总", opReport.anomalySummaryTable || []],
        ["负毛利订单", opReport.anomalyNegProfitTable || []],
        ["未匹配成本订单", opReport.anomalyUnmatchedTable || []],
        ["扣点税后变亏", opReport.anomalyFeeFlipTable || []],
        ["高逆向规格", opReport.anomalyHighRefundSkuTable || []],
        ["待补SKU", opReport.unmatchedTable || []],
      ];
      let any = false;
      for (const [name, rows] of sheets) {
        if (!rows || rows.length <= 1) continue;
        any = true;
        const ws = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
      }
      if (!any) {
        showToast("当前没有可导出的异常数据", "warning");
        return;
      }
      const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      await writeLocalFile(result.filePath, out.buffer);
      const n =
        (opReport.anomalySummaryTable || [])
          .slice(1, 5)
          .map((r) => `${r[0]}${r[1]}`)
          .join(" / ") || "异常";
      showToast(`异常订单已导出（${n}）`, "success");
    } catch (error) {
      reportError("导出异常订单", error);
    }
  }, [opReport, reportError, showToast]);

  const handleBuildOperatingReport = useCallback(() => {
    if (
      opOrders.length === 0 &&
      opBillLines.length === 0 &&
      opProducts.length === 0 &&
      opAds.length === 0
    ) {
      showToast("请先导入至少一种数据（订单/账务/商品/推广）", "error");
      return;
    }
    const report = buildOperatingReport(
      opOrders,
      opBillLines,
      opProducts,
      opAds,
      opCostSettings,
    );
    setOpReport(report);
    setOpView("summary");
    setCurrentData(report.summaryTable);
    setCurrentHeaders(report.summaryTable[0] || []);
    setIsMerged(false);
    showToast(
      `报表已生成：毛利(扣广告) ¥${report.summary.estimatedProfitAfterAd.toFixed(2)} | 广告(仅日报) ¥${report.summary.adSpend.toFixed(0)} ROI ${report.summary.adRoi.toFixed(2)} | 总退款率 ${(report.summary.refundRateByCount * 100).toFixed(1)}%`,
      "success",
    );
  }, [opOrders, opBillLines, opProducts, opAds, opCostSettings, showToast]);

  const applyRankSort = useCallback(
    (table: any[][] | undefined, mode: "profit" | "loss") => {
      if (!table || table.length <= 1) return table || [];
      if (mode === "profit") return table;
      const header = table[0];
      const rows = table.slice(1).slice().reverse();
      const ranked = rows.map((r, i) => {
        const copy = [...r];
        if (typeof copy[0] === "number" || /^\d+$/.test(String(copy[0]))) {
          copy[0] = i + 1;
        }
        return copy;
      });
      return [header, ...ranked];
    },
    [],
  );

  const handleShowOperatingView = useCallback(
    (view: typeof opView, rankSort: "profit" | "loss" = opRankSort) => {
      if (!opReport) return;
      setOpView(view);
      const unmatchedFallback = [
        [
          "待补键",
          "商品名称",
          "规格名称",
          "商家编码-规格",
          "商家编码-商品",
          "商品ID",
          "关联订单数",
          "商家实收合计",
          "样例订单号",
        ],
        ...opReport.unmatchedSkus.map((u) => [
          u.key,
          u.productName,
          u.specName,
          u.merchantSku,
          u.merchantSpu,
          u.productId,
          u.count,
          u.amount.toFixed(2),
          u.sampleOrderIds,
        ]),
      ];
      const tableMap: Record<string, any[][]> = {
        summary: opReport.summaryTable,
        orders: opReport.orderTable,
        rates: opReport.rateTable,
        shipLoss: opReport.shipLossTable,
        billTypes: opReport.billTypeTable,
        billWide: opReport.billWideTable,
        ads: opReport.adTable,
        products: opReport.productMapTable,
        unmatched: opReport.unmatchedTable?.length
          ? opReport.unmatchedTable
          : unmatchedFallback,
        period: opReport.periodTable,
        express: opReport.expressTable,
        expressAlert: opReport.expressAlertTable || [],
        matchMethod: opReport.matchMethodTable || [],
        shops: opReport.shopTable,
        spuRank: applyRankSort(opReport.spuTable, rankSort),
        skuRank: applyRankSort(opReport.skuTable, rankSort),
        salesRankSku: opReport.salesRankSkuTable || [],
        salesRankSpu: opReport.salesRankSpuTable || [],
        productReturn: opReport.productReturnTable || [],
        lossDiagnosis: opReport.lossDiagnosisTable || [],
        bossOnePager: opReport.bossOnePagerTable || [],
        anomalies: opReport.anomalySummaryTable || [],
        anomalyNeg: opReport.anomalyNegProfitTable || [],
        anomalyUnmatched: opReport.anomalyUnmatchedTable || [],
        anomalyFeeFlip: opReport.anomalyFeeFlipTable || [],
        anomalyHighSku: opReport.anomalyHighRefundSkuTable || [],
      };
      const table = tableMap[view] || opReport.summaryTable;
      setCurrentData(table);
      setCurrentHeaders(table[0] || []);
      setIsMerged(false);
    },
    [opReport, opRankSort, applyRankSort],
  );

  const handleCopyUnmatchedSkus = useCallback(async () => {
    if (!opReport || opReport.unmatchedSkus.length === 0) {
      showToast("没有未匹配成本的 SKU", "warning");
      return;
    }
    const table = opReport.unmatchedTable?.length
      ? opReport.unmatchedTable
      : [
          [
            "待补键",
            "商品名称",
            "规格名称",
            "商家编码-规格",
            "商家编码-商品",
            "商品ID",
            "关联订单数",
            "商家实收合计",
            "样例订单号",
          ],
          ...opReport.unmatchedSkus.map((u) => [
            u.key,
            u.productName,
            u.specName,
            u.merchantSku,
            u.merchantSpu,
            u.productId,
            u.count,
            u.amount.toFixed(2),
            u.sampleOrderIds,
          ]),
        ];
    const tsv = table
      .map((row) => row.map((c) => String(c ?? "")).join("\t"))
      .join("\n");
    try {
      await navigator.clipboard.writeText(tsv);
      showToast(
        `已复制 ${opReport.unmatchedSkus.length} 个待补 SKU（可粘贴到 Excel）`,
        "success",
      );
    } catch {
      showToast("复制失败，请手动从「未匹配成本」表导出", "error");
    }
  }, [opReport, showToast]);


  const handleCopyBossOnePager = useCallback(async () => {
    if (!opReport?.bossOnePagerTable?.length) {
      showToast("请先生成经营报表", "error");
      return;
    }
    try {
      const text = formatBossOnePagerText(opReport.bossOnePagerTable);
      await navigator.clipboard.writeText(text);
      showToast("老板一页纸已复制为文本，可粘贴到微信/备忘录", "success");
    } catch {
      showToast("复制失败，请改用导出 Excel 中的「老板一页纸」表", "error");
    }
  }, [opReport, showToast]);

  const handleCopyBossOnePagerTsv = useCallback(async () => {
    if (!opReport?.bossOnePagerTable?.length) {
      showToast("请先生成经营报表", "error");
      return;
    }
    try {
      const tsv = opReport.bossOnePagerTable
        .map((row) => row.map((c) => String(c ?? "")).join("\t"))
        .join("\n");
      await navigator.clipboard.writeText(tsv);
      showToast("老板一页纸已复制为表格(TSV)，可粘贴到 Excel", "success");
    } catch {
      showToast("复制失败", "error");
    }
  }, [opReport, showToast]);

    const handleExportProductMaster = useCallback(
    async (mode: ProductMasterBuildMode = "all") => {
      if (opOrders.length === 0) {
        showToast("请先导入订单，才能从订单生成商品资料", "error");
        return;
      }
      try {
        const rows = buildProductMasterFromOrders(opOrders, opProducts, mode);
        if (rows.length === 0) {
          showToast(
            mode === "missing_cost"
              ? "没有待补成本的规格（已全部匹配或订单无规格）"
              : "未能从订单提取规格",
            "warning",
          );
          return;
        }
        const tag = mode === "missing_cost" ? "待补" : "全部";
        const defaultName = `商品资料_订单去重_${tag}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        const result = await saveDataFile(defaultName);
        if (result.canceled || !result.filePath) return;
        const XLSX = await import("xlsx");
        const wb = XLSX.utils.book_new();
        const importSheet = productMasterImportTable(rows);
        const workSheet = productMasterWorkTable(rows);
        const guide: any[][] = [
          ["说明"],
          ["1. 本文件「商品资料」表头与平台导出一致，填好参考成本价/包材/重量后，可直接再导入店财通。"],
          ["2. 规格编码优先取订单「商家编码-规格」；为空时用商品编码或规格名兜底。"],
          ["3. 「对照明细」含订单数/销量/均价，方便估算成本，导入时不会用到此表。"],
          ["4. 若已导入过商品资料，已有成本会自动带上；待填行成本为空。"],
          ["生成规格数", rows.length],
          ["待填成本数", rows.filter((r) => !r.hasCost).length],
          ["已有成本数", rows.filter((r) => r.hasCost).length],
          ["来源订单数", opOrders.length],
        ];
        for (const [name, data] of [
          ["商品资料", importSheet],
          ["对照明细", workSheet],
          ["使用说明", guide],
        ] as [string, any[][]][]) {
          const ws = XLSX.utils.aoa_to_sheet(data);
          XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
        }
        const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        await writeLocalFile(result.filePath, out.buffer);
        const pending = rows.filter((r) => !r.hasCost).length;
        setProductMasterMeta((m) => ({
          ...m,
          lastExportedAt: new Date().toLocaleString("zh-CN"),
          lastFileName: result.filePath?.split(/[/\\]/).pop() || m.lastFileName,
          pendingFillCount: pending,
          totalCount: rows.length,
          step: 2,
          lastMode: "generated",
        }));
        showToast(
          `已导出商品资料（${tag}）${rows.length} 个规格，其中待填 ${pending}。请填成本后重新导入（步骤③）`,
          "success",
        );
      } catch (error) {
        reportError("导出商品资料", error);
      }
    },
    [opOrders, opProducts, reportError, showToast],
  );

  const handleLoadProductMasterFromOrders = useCallback(
    (mode: ProductMasterBuildMode = "all") => {
      if (opOrders.length === 0) {
        showToast("请先导入订单", "error");
        return;
      }
      const rows = buildProductMasterFromOrders(opOrders, opProducts, mode);
      if (rows.length === 0) {
        showToast("未能生成规格", "warning");
        return;
      }
      const generatedKeys = new Set(
        rows.map((r) => r.skuCode || r.specName || r.productCode),
      );
      const leftovers = opProducts.filter((p) => {
        const k = p.skuCode || p.specName || p.productCode;
        return k && !generatedKeys.has(k);
      });
      const merged: ProductSku[] = [
        ...rows.map((r) => ({
          productCode: r.productCode,
          productName: r.productName,
          skuCode: r.skuCode,
          specName: r.specName,
          salePrice: r.salePrice,
          costPrice: r.costPrice,
          packCost: r.packCost,
          weightKg: r.weightKg,
          stock: r.stock,
        })),
        ...leftovers,
      ];
      setOpProducts(merged);
      setSkuMappings(productsToSkuMappings(merged));
      pushOpSource(
        "product_master",
        mode === "missing_cost" ? "订单生成-待补规格" : "订单生成-全部规格",
        merged.length,
      );
      setOpReport(null);
      const missing = rows.filter((r) => !r.hasCost).length;
      setProductMasterMeta({
        lastFileName: "订单生成",
        lastImportedAt: new Date().toLocaleString("zh-CN"),
        lastExportedAt: productMasterMeta.lastExportedAt,
        lastMode: "generated",
        pendingFillCount: missing,
        totalCount: merged.length,
        step: missing > 0 ? 2 : 3,
      });
      showToast(
        `已载入 ${merged.length} 个规格（新生成 ${rows.length}，待填成本 ${missing}）。填成本请导出 Excel 后回填再导入。`,
        "success",
      );
    },
    [opOrders, opProducts, productMasterMeta.lastExportedAt, pushOpSource, showToast],
  );

  const updateExpressRule = useCallback(
    (index: number, patch: Partial<ExpressShipRule>) => {
      setOpCostSettings((s) => {
        const rules = s.expressRules.map((r, i) =>
          i === index ? { ...r, ...patch } : r,
        );
        return { ...s, expressRules: rules };
      });
    },
    [],
  );

  const handleResetOpCostSettings = useCallback(() => {
    setOpCostSettings(cloneDefaultCostSettings());
    showToast("已恢复默认运费/包材参数", "success");
  }, [showToast]);

  const handleApplyCostTemplate = useCallback(
    (templateId: string) => {
      const t = COST_SETTING_TEMPLATES.find((x) => x.id === templateId);
      setOpCostSettings((s) => applyCostTemplate(s, templateId));
      showToast(t ? `已套用模板：${t.name}` : "模板不存在", t ? "success" : "warning");
    },
    [showToast],
  );

  const handleAddShopFeeOverride = useCallback(() => {
    setOpCostSettings((s) => ({
      ...s,
      shopFeeOverrides: [
        ...(s.shopFeeOverrides || []),
        {
          shopName: "",
          brandPointPct: null,
          ecommerceTaxPct: null,
          feeBaseMode: "",
        } as ShopFeeOverride,
      ],
    }));
  }, []);

  const handleUpdateShopFeeOverride = useCallback(
    (index: number, patch: Partial<ShopFeeOverride>) => {
      setOpCostSettings((s) => {
        const list = [...(s.shopFeeOverrides || [])];
        list[index] = { ...list[index], ...patch };
        return { ...s, shopFeeOverrides: list };
      });
    },
    [],
  );

  const handleRemoveShopFeeOverride = useCallback((index: number) => {
    setOpCostSettings((s) => ({
      ...s,
      shopFeeOverrides: (s.shopFeeOverrides || []).filter((_, i) => i !== index),
    }));
  }, []);

  const handleSyncShopsToOverrides = useCallback(() => {
    const names = new Set<string>();
    for (const o of opOrders) names.add(normalizeShopName(o.shopName));
    if (names.size === 0) {
      showToast("请先导入订单（带店铺名）", "warning");
      return;
    }
    setOpCostSettings((s) => {
      const existing = new Map(
        (s.shopFeeOverrides || []).map((x) => [
          normalizeShopName(x.shopName),
          x,
        ]),
      );
      const merged: ShopFeeOverride[] = [];
      for (const name of Array.from(names).sort()) {
        merged.push(
          existing.get(name) || {
            shopName: name,
            brandPointPct: null,
            ecommerceTaxPct: null,
            feeBaseMode: "",
          },
        );
      }
      // keep manual rows not in orders
      for (const [k, v] of existing) {
        if (!names.has(k) && String(v.shopName || "").trim()) merged.push(v);
      }
      return { ...s, shopFeeOverrides: merged };
    });
    showToast(`已同步 ${names.size} 个店铺到覆盖表`, "success");
  }, [opOrders, showToast]);

  const handleClearOperating = useCallback(() => {
    setOpOrders([]);
    setOpBillLines([]);
    setOpProducts([]);
    setOpAds([]);
    setOpReport(null);
    setOpSources([]);
    showToast('已清空经营分析数据', 'success');
  }, [showToast]);

  const handleExportOperating = useCallback(async () => {
    if (!opReport) {
      showToast('请先生成经营报表', 'error');
      return;
    }
    try {
      const defaultName = `拼多多经营分析_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const result = await saveDataFile(defaultName);
      if (result.canceled || !result.filePath) return;
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const unmatchedRows = opReport.unmatchedTable?.length
        ? opReport.unmatchedTable
        : [
            [
              "待补键",
              "商品名称",
              "规格名称",
              "商家编码-规格",
              "商家编码-商品",
              "商品ID",
              "关联订单数",
              "商家实收合计",
              "样例订单号",
            ],
            ...opReport.unmatchedSkus.map((u) => [
              u.key,
              u.productName,
              u.specName,
              u.merchantSku,
              u.merchantSpu,
              u.productId,
              u.count,
              u.amount.toFixed(2),
              u.sampleOrderIds,
            ]),
          ];
      const sheets: [string, any[][]][] = [
        ["经营汇总", opReport.summaryTable],
        ["退款率", opReport.rateTable],
        ["时段对比", opReport.periodTable],
        ["分快递运费", opReport.expressTable],
        ["订单毛利", opReport.orderTable],
        ["损耗运费", opReport.shipLossTable],
        ["账务类型", opReport.billTypeTable],
        ["账务按单", opReport.billWideTable],
        ["推广分天", opReport.adTable],
        ["推广分析", opReport.adAnalysisTable || []],
        ["商品成本", opReport.productMapTable],
        ["店铺对比", opReport.shopTable],
        ["SPU毛利排行", opReport.spuTable],
        ["规格毛利排行", opReport.skuTable],
        ["匹配方式", opReport.matchMethodTable || []],
        ["快递未匹配", opReport.expressAlertTable || []],
        ["产品退货退款率", opReport.productReturnTable],
        ["亏损诊断", opReport.lossDiagnosisTable],
        ["老板一页纸", opReport.bossOnePagerTable],
        ["待补SKU", unmatchedRows],
        ["异常汇总", opReport.anomalySummaryTable || []],
        ["负毛利订单", opReport.anomalyNegProfitTable || []],
        ["未匹配成本订单", opReport.anomalyUnmatchedTable || []],
        ["扣点税后变亏", opReport.anomalyFeeFlipTable || []],
        ["高逆向规格", opReport.anomalyHighRefundSkuTable || []],
      ];
      for (const [name, rows] of sheets) {
        if (!rows || rows.length === 0) continue;
        const ws = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
      }
      const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      await writeLocalFile(result.filePath, out.buffer);
      showToast('经营分析 Excel 已导出', 'success');
    } catch (error) {
      reportError('导出经营分析', error);
    }
  }, [opReport, reportError, showToast]);


  // SKU映射
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
  }, [reportError, showToast]);

  const handleApplyMapping = useCallback(() => {
    if (currentData.length === 0 || skuMappings.length === 0) return;
    const headers = currentData[0];
    const dataRows = currentData.slice(1);
    const mappedRows = dataRows.map((row) => {
      const newRow = [...row];
      for (let i = 0; i < newRow.length; i++) {
        const cell = String(newRow[i] || "").trim();
        const mapping = skuMappings.find((m) => m.platformName === cell);
        if (mapping && !newRow.includes(mapping.internalCode))
          newRow.push(mapping.internalCode);
      }
      return newRow;
    });
    const newData = [[...headers, "内部编码"], ...mappedRows];
    setCurrentData(newData);
    saveHistory(newData, [...headers, "内部编码"]);
  }, [currentData, skuMappings, saveHistory]);

  // 收款对账
  const handleImportPayment = useCallback(async () => {
    try {
      const result = await openDataFiles();
      if (!result.canceled && result.filePaths.length > 0) {
        const fileData = await processFile(result.filePaths[0]);
        if (fileData) setPaymentFile(fileData);
      }
    } catch (error) {
      reportError("导入收款流水", error);
    }
  }, [reportError]);

  const handleReconcile = useCallback(() => {
    if (currentData.length === 0 || !paymentFile) return;
    const orderRows = currentData.slice(1);
    const paymentRows = paymentFile.data.slice(1);
    const reconciled: any[][] = [["订单金额", "收款金额", "状态", "说明"]];
    const unmatchedPayments = [...paymentRows];
    orderRows.forEach((order) => {
      const orderAmount = findAmount(order);
      if (orderAmount === 0) return;
      const matchIdx = unmatchedPayments.findIndex(
        (pay) => Math.abs(findAmount(pay) - orderAmount) < 0.01,
      );
      if (matchIdx >= 0) {
        reconciled.push([
          orderAmount,
          findAmount(unmatchedPayments[matchIdx]),
          "已核销",
          "匹配成功",
        ]);
        unmatchedPayments.splice(matchIdx, 1);
      } else {
        reconciled.push([orderAmount, "", "未匹配", "无对应收款记录"]);
      }
    });
    unmatchedPayments.forEach((pay) =>
      reconciled.push(["", findAmount(pay), "未认领", "无对应订单"]),
    );
    setCurrentData(reconciled);
    setCurrentHeaders(reconciled[0]);
    setIsMerged(false);
    saveHistory(reconciled, reconciled[0]);
  }, [currentData, paymentFile, saveHistory]);

  // 账单导入
  const handleImportBill = useCallback(async () => {
    try {
      const result = await openDataFiles();
      if (!result.canceled && result.filePaths.length > 0) {
        for (const filePath of result.filePaths) {
          const fileData = await processFile(filePath);
          if (!fileData) continue;
          const ingested = ingestForOperating(fileData);
          if (ingested.kind === "pdd_bill" && ingested.billRecord) {
            setBillRecords((prev) => [...prev, ingested.billRecord!]);
            setOpBillLines((prev) => [...prev, ...ingested.billLines]);
            showToast(`已识别拼多多账务明细：${ingested.billLines.length} 行流水`, "success");
          } else {
            const record = parseBill(ingested.normalized);
            setBillRecords((prev) => [...prev, record]);
          }
        }
      }
    } catch (error) {
      reportError("导入账单", error);
    }
  }, [reportError, showToast]);

  // 佣金明细导入
  const handleImportCommissionDetails = useCallback(async () => {
    try {
      const result = await openDataFiles();
      if (!result.canceled && result.filePaths.length > 0) {
        const fileData = await processFile(result.filePaths[0]);
        if (fileData) {
          const details = parseCommissionDetails(fileData);
          if (details.length === 0) {
            showToast("未找到佣金数据，请检查文件格式", "error");
            return;
          }
          setCommissionDetails(details);
          showToast(`已导入 ${details.length} 条佣金明细`, "success");
        }
      }
    } catch (error) {
      reportError("导入佣金明细", error);
    }
  }, [reportError, showToast]);

  // 佣金计提
  const handleGenerateAccrual = useCallback(() => {
    if (billRecords.length === 0) return;
    const headers = [
      "平台",
      "账期",
      "账单金额",
      "订单笔数",
      "佣金",
      "技术服务费",
      "补贴/返点",
      "净收款",
      "佣金率",
      "技术服务费率",
      "是否跨期",
    ];
    const rows = billRecords.map((b) => {
      const commRate =
        b.totalAmount > 0
          ? ((b.commission / b.totalAmount) * 100).toFixed(2) + "%"
          : "0%";
      const techRate =
        b.totalAmount > 0
          ? ((b.techFee / b.totalAmount) * 100).toFixed(2) + "%"
          : "0%";
      const today = new Date();
      const billDate = new Date(b.date);
      const isCrossPeriod =
        !isNaN(billDate.getTime()) && billDate.getMonth() !== today.getMonth();
      return [
        b.platform,
        b.date,
        b.totalAmount.toFixed(2),
        b.orderCount,
        b.commission.toFixed(2),
        b.techFee.toFixed(2),
        b.subsidy.toFixed(2),
        b.netAmount.toFixed(2),
        commRate,
        techRate,
        isCrossPeriod ? "⚠️跨期" : "当月",
      ];
    });
    const totalRow = [
      "合计",
      "",
      billRecords.reduce((s, b) => s + b.totalAmount, 0).toFixed(2),
      billRecords.reduce((s, b) => s + b.orderCount, 0),
      billRecords.reduce((s, b) => s + b.commission, 0).toFixed(2),
      billRecords.reduce((s, b) => s + b.techFee, 0).toFixed(2),
      billRecords.reduce((s, b) => s + b.subsidy, 0).toFixed(2),
      billRecords.reduce((s, b) => s + b.netAmount, 0).toFixed(2),
      "",
      "",
      "",
    ];
    const data = [headers, ...rows, totalRow];
    setAccrualData(data);
    setCurrentData(data);
    setCurrentHeaders(headers);
    saveHistory(data, headers);
  }, [billRecords, saveHistory]);

  const handleRemoveBill = (idx: number) =>
    setBillRecords((prev) => prev.filter((_, i) => i !== idx));

  // ========== P1: 退款损失还原 ==========
  const handleImportRefund = useCallback(async () => {
    try {
      const result = await openDataFiles();
      if (!result.canceled && result.filePaths.length > 0) {
        const fileData = await processFile(result.filePaths[0]);
        if (fileData) {
          setRefundFile(fileData);
          const headers = fileData.headers;
          const rows = fileData.data.slice(1);
          const idCol = findCol(headers, ["订单号", "order", "编号", "id"]);
          const amtCol = findCol(headers, ["退款", "refund", "金额", "amount"]);
          const dateCol = findCol(headers, ["日期", "time", "date", "时间"]);
          const platformCol = findCol(headers, ["平台", "source", "渠道"]);
          const records: RefundOrder[] = rows.map((row) => ({
            platform:
              platformCol >= 0
                ? String(row[platformCol] || detectPlatform(fileData.name))
                : detectPlatform(fileData.name),
            orderId: idCol >= 0 ? String(row[idCol] || "") : "",
            refundAmount: amtCol >= 0 ? Math.abs(findAmount([row[amtCol]])) : 0,
            refundDate: dateCol >= 0 ? String(row[dateCol] || "") : "",
            commissionLost: 0,
          }));
          // 估算佣金损失：按平均佣金率估算（用账单数据）
          const avgCommRate =
            billRecords.length > 0
              ? billRecords.reduce((s, b) => s + b.commission, 0) /
                Math.max(
                  1,
                  billRecords.reduce((s, b) => s + b.totalAmount, 0),
                )
              : 0.05; // 默认5%
          records.forEach((r) => {
            r.commissionLost = r.refundAmount * avgCommRate;
          });
          setRefundRecords(records);
        }
      }
    } catch (error) {
      reportError("导入退款单", error);
    }
  }, [billRecords, reportError]);

  const handleGenerateRefundLoss = useCallback(() => {
    if (refundRecords.length === 0) return;

    const avgCommissionRate =
      billRecords.length > 0
        ? billRecords.reduce((s, b) => s + b.commission, 0) /
          Math.max(1, billRecords.reduce((s, b) => s + b.totalAmount, 0))
        : 0.05;

    const { results, matchedCount, totalCount } = calculateRefundLossWithMatching(
      refundRecords,
      commissionDetails,
      avgCommissionRate
    );

    const matchedAmount = results
      .filter((r) => r.isMatched)
      .reduce((s, r) => s + r.commission, 0);
    const estimatedAmount = results
      .filter((r) => !r.isMatched)
      .reduce((s, r) => s + r.commission, 0);

    const headers = [
      "平台",
      "退款日期",
      "订单号",
      "退款金额",
      "实际佣金",
      "匹配状态",
      "佣金来源",
      "损失合计",
      "说明",
    ];

    const rows = results.map((r) => [
      r.platform,
      r.refundDate,
      r.orderId,
      r.refundAmount.toFixed(2),
      r.commission.toFixed(2),
      r.isMatched ? "✅已匹配" : "⚠️估算",
      r.matchSource,
      (r.refundAmount + r.commission).toFixed(2),
      r.isMatched ? "退款+佣金双重损失" : "退款+估算佣金损失",
    ]);

    const totalRefund = refundRecords.reduce((s, r) => s + r.refundAmount, 0);
    const totalComm = results.reduce((s, r) => s + r.commission, 0);

    const totalRow = [
      "合计",
      "",
      `${matchedCount}/${totalCount} 笔已匹配`,
      totalRefund.toFixed(2),
      totalComm.toFixed(2),
      matchedCount === totalCount ? "✅100%匹配" : `⚠️${totalCount - matchedCount}笔估算`,
      matchedCount > 0 ? `精确¥${matchedAmount.toFixed(2)}/估算¥${estimatedAmount.toFixed(2)}` : "全部估算",
      (totalRefund + totalComm).toFixed(2),
      `涉及 ${refundRecords.length} 笔退款`,
    ];

    const data = [headers, ...rows, totalRow];
    setRefundLossData(data);
    setCurrentData(data);
    setCurrentHeaders(headers);
    saveHistory(data, headers);
  }, [refundRecords, commissionDetails, billRecords, saveHistory]);

  const handleExportRefundLoss = useCallback(async () => {
    if (refundLossData.length === 0) return;
    try {
      const result = await saveDataFile(
        `退款损失还原_${new Date().toISOString().slice(0, 7)}.xlsx`,
      );
      if (!result.canceled && result.filePath)
        await exportToExcel(refundLossData, result.filePath);
    } catch (error) {
      reportError("导出退款损失表", error);
    }
  }, [refundLossData, reportError]);

  // ========== P1: 品牌阶梯返利计算 ==========
  const handleExportWithPanel = useCallback(() => {
    if (currentData.length === 0) return;
    setShowExportPanel(true);
  }, [currentData]);

  const handleDoExport = useCallback(async (format: "xlsx" | "csv", encoding?: "utf-8" | "gbk", delimiter?: string) => {
    if (currentData.length === 0) return;
    setShowExportPanel(false);
    try {
      const result = await saveDataFile(`清洗后数据.${format === "csv" ? "csv" : "xlsx"}`);
      if (!result.canceled && result.filePath) {
        if (format === "csv") {
          await exportToCSV(
            currentData,
            result.filePath,
            encoding || "utf-8",
            delimiter,
          );
        } else {
          await exportToExcel(currentData, result.filePath);
        }
        showToast(`导出成功`, "success");
      }
    } catch (error) {
      reportError("导出数据", error);
    }
  }, [currentData, reportError]);

  const handleClear = useCallback(() => {
    setFiles([]);
    setSelectedFileIndex(null);
    setCurrentData([]);
    setCurrentHeaders([]);
    setMergedData(null);
    setIsMerged(false);
    setSearchText("");
    setHistory([]);
    setHistoryIndex(-1);
    setOrderStats(null);
    setSkuMappings([]);
    setMappingFile(null);
    setPaymentFile(null);
    setBillRecords([]);
    setAccrualData([]);
    setRefundFile(null);
    setRefundRecords([]);
    setRefundLossData([]);
  }, []);

  const filteredData = useMemo(() => {
    if (!searchText.trim()) return currentData;
    const lower = searchText.toLowerCase();
    return [
      currentData[0],
      ...currentData
        .slice(1)
        .filter((row) =>
          row.some((cell) => String(cell).toLowerCase().includes(lower)),
        ),
    ];
  }, [currentData, searchText]);

  const platformColor: Record<string, string> = {
    淘宝: "bg-orange-100 text-orange-700",
    天猫: "bg-red-100 text-red-700",
    京东: "bg-blue-100 text-blue-700",
    抖音电商: "bg-pink-100 text-pink-700",
    快手电商: "bg-purple-100 text-purple-700",
    拼多多: "bg-yellow-100 text-yellow-700",
  };
  const color = (p: string) => platformColor[p] || "bg-gray-100 text-gray-700";

  return (
    <div className="app-shell">
      {runtimeNotice && (
        <div
          className={`px-4 py-2 text-sm border-b ${desktopReady ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-800 border-amber-200"}`}
        >
          {runtimeNotice}
        </div>
      )}

      <div className="app-header px-4 py-2.5 flex items-center gap-3 flex-wrap">
        <div className="brand-badge mr-1">
          <div className="brand-mark">通</div>
          <div className="leading-tight">
            <div className="text-sm font-bold text-slate-800">店财通</div>
            <div className="text-[11px] text-slate-500">拼多多经营分析 · 毛利对账</div>
          </div>
        </div>

        <div className="h-8 w-px bg-slate-200 hidden md:block" />

        {[
          { key: "operating", label: "经营分析" },
          { key: "data", label: "数据处理" },
          { key: "mapping", label: "SKU映射" },
          { key: "reconcile", label: "收款对账" },
          { key: "bill", label: "账单对账" },
          { key: "salesRank", label: "销售排行" },
          { key: "monthly", label: "月度汇总" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as Tab)}
            className={`tab-pill ${activeTab === tab.key ? "tab-pill-active" : "tab-pill-idle"}`}
          >
            {tab.label}
          </button>
        ))}

        {orderStats && activeTab === "data" && (
          <div className="ml-3 flex items-center gap-3 text-xs text-gray-600">
            <span>
              📦 <strong>{orderStats.totalOrders}</strong>
            </span>
            <span>
              💰 <strong>¥{orderStats.totalAmount.toFixed(0)}</strong>
            </span>
            {Object.entries(orderStats.platformBreakdown).map(([p, s]) => (
              <span
                key={p}
                className={`px-1.5 py-0.5 rounded text-xs ${color(p)}`}
              >
                {p}: {s.count}单
              </span>
            ))}
          </div>
        )}
        <div className="flex-1" />
        <div className="flex items-center gap-1 border border-gray-300 rounded-lg px-2 py-1 bg-gray-50">
          <span className="text-gray-400 text-xs">🔍</span>
          <input
            type="text"
            placeholder="搜索..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="border-none outline-none bg-transparent text-xs w-28"
          />
          {searchText && (
            <button
              onClick={() => setSearchText("")}
              className="text-gray-400 text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>



      {/* ========== 经营分析（拼多多四表） ========== */}
      {activeTab === "operating" && (
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

              {/* 有报表时收起导入/参数区，避免出现「页面滚 + 表格滚」双纵向条 */}
              <div
                className="contents"
              >
              <div className="mb-4 flex flex-wrap items-end gap-3 p-1">
                <label className="flex flex-col gap-1 text-sm min-w-[220px]">
                  <span className="text-xs text-gray-500">
                    当前导入店铺/账号名（多店对比用）
                  </span>
                  <input
                    value={opShopLabel}
                    onChange={(e) => setOpShopLabel(e.target.value)}
                    placeholder="例如：主店 / 小号A / 旗舰店"
                    className="soft-input"
                  />
                </label>
                <div className="text-xs text-gray-500 pb-2">
                  留空则尝试从文件名识别，否则记为「默认店铺」。
                  商品资料全店共用；订单/账务/推广按店铺标签分开。
                </div>
              </div>

              <div
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpDragOver(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpDragOver(false);
                }}
                onDrop={handleOperatingDrop}
                className={`mb-4 rounded-xl border-2 border-dashed p-4 transition-colors ${
                  opDragOver
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 bg-slate-50/80"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">
                      拖入多个文件自动识别类型
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                      支持一次拖入订单/账务/商品资料/推广（csv/xlsx/xls），自动分流；也可点下方按钮选择。
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOperatingImport()}
                    disabled={!desktopReady}
                    className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-40"
                  >
                    选择文件（可多选）
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <button
                  onClick={() => handleOperatingImport("pdd_orders")}
                  className="border border-blue-200/80 bg-gradient-to-br from-blue-50 to-indigo-50 hover:shadow-md hover:-translate-y-0.5 transition rounded-2xl p-4 text-left"
                >
                  <div className="font-medium text-blue-800">1. 订单导出</div>
                  <div className="text-xs text-blue-600 mt-1">
                    orders_export*.csv
                  </div>
                  <div className="text-sm mt-2 text-gray-700">
                    已导入 <strong>{opOrders.length}</strong> 单
                  </div>
                </button>
                <button
                  onClick={() => handleOperatingImport("pdd_bill")}
                  className="border border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-teal-50 hover:shadow-md hover:-translate-y-0.5 transition rounded-2xl p-4 text-left"
                >
                  <div className="font-medium text-emerald-800">2. 账务明细</div>
                  <div className="text-xs text-emerald-600 mt-1">
                    pdd-mall-bill-detail*.csv
                  </div>
                  <div className="text-sm mt-2 text-gray-700">
                    已导入 <strong>{opBillLines.length}</strong> 行流水
                  </div>
                </button>
                                <div className="border border-violet-200/80 bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl p-3 space-y-2">
                  <button
                    onClick={() => handleOperatingImport("product_master")}
                    className="w-full text-left hover:opacity-90 transition"
                  >
                    <div className="font-medium text-violet-800">3. 商品资料</div>
                    <div className="text-xs text-violet-600 mt-1">
                      商品资料*.xlsx（成本）· 或从订单生成
                    </div>
                    <div className="text-sm mt-2 text-gray-700">
                      已导入 <strong>{opProducts.length}</strong> 个规格
                    </div>
                  </button>
                  <div className="flex flex-wrap gap-1.5 pt-1 border-t border-violet-100">
                    <button
                      type="button"
                      onClick={() => handleExportProductMaster("all")}
                      disabled={opOrders.length === 0}
                      className="text-[11px] px-2 py-1 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40"
                      title="从订单去重导出标准商品资料模板"
                    >
                      导出全部规格
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportProductMaster("missing_cost")}
                      disabled={opOrders.length === 0}
                      className="text-[11px] px-2 py-1 rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40"
                      title="仅导出尚未匹配成本的规格"
                    >
                      导出待补规格
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLoadProductMasterFromOrders("all")}
                      disabled={opOrders.length === 0}
                      className="text-[11px] px-2 py-1 rounded border border-violet-300 text-violet-800 bg-white hover:bg-violet-50 disabled:opacity-40"
                      title="把订单去重结果载入为当前商品资料（成本可后补）"
                    >
                      生成并载入
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpCostSettings((s) => ({
                          ...s,
                          matchBySpecWhenNoCode: !s.matchBySpecWhenNoCode,
                        }));
                        setOpReport(null);
                      }}
                      className={`text-[11px] px-2 py-1 rounded border ${
                        opCostSettings.matchBySpecWhenNoCode !== false
                          ? "bg-emerald-600 text-white border-emerald-700"
                          : "bg-white text-slate-600 border-slate-300"
                      }`}
                      title="开启后：订单无商家编码时，用商品规格/品名+规格匹配商品资料（生成的无编码资料也能对上）"
                    >
                      {opCostSettings.matchBySpecWhenNoCode !== false
                        ? "✓ 无编码按规格匹配"
                        : "无编码按规格匹配"}
                    </button>
                  </div>
                  <div className="text-[10px] text-violet-700/80 leading-snug">
                    无商家编码的订单：{opCostSettings.matchBySpecWhenNoCode !== false
                      ? "按「商品规格 / 品名+规格」匹配成本（推荐）"
                      : "不走规格匹配，无编码订单易未匹配"}
                  </div>
                  <div className="rounded-lg bg-white/80 border border-violet-100 p-2 space-y-1.5">
                    <div className="text-[11px] font-medium text-violet-900">商品资料三步</div>
                    <div className="flex flex-wrap gap-1 text-[10px]">
                      {[
                        { n: 1 as const, t: "①导出/生成" },
                        { n: 2 as const, t: "②填成本" },
                        { n: 3 as const, t: "③再导入" },
                      ].map((s) => (
                        <span
                          key={s.n}
                          className={`px-1.5 py-0.5 rounded ${
                            productMasterMeta.step === s.n
                              ? "bg-violet-600 text-white"
                              : productMasterMeta.step > s.n
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {s.t}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <button
                        type="button"
                        onClick={() =>
                          setProductImportMode((m) =>
                            m === "merge" ? "replace" : "merge",
                          )
                        }
                        className={`text-[10px] px-2 py-0.5 rounded border ${
                          productImportMode === "merge"
                            ? "bg-violet-600 text-white border-violet-700"
                            : "bg-white text-slate-600 border-slate-300"
                        }`}
                      >
                        {productImportMode === "merge" ? "✓ 合并导入" : "替换导入"}
                      </button>
                      {productMasterMeta.pendingFillCount > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-medium">
                          还有 {productMasterMeta.pendingFillCount} 个待填成本
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 leading-snug">
                      {productMasterMeta.lastFileName
                        ? `最近：${productMasterMeta.lastFileName} · ${
                            productMasterMeta.lastImportedAt ||
                            productMasterMeta.lastExportedAt ||
                            "-"
                          } · ${productMasterMeta.totalCount}规格`
                        : "尚未导入/导出商品资料"}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleOperatingImport("ad_daily")}
                  className="border border-orange-200/80 bg-gradient-to-br from-orange-50 to-amber-50 hover:shadow-md hover:-translate-y-0.5 transition rounded-2xl p-4 text-left"
                >
                  <div className="font-medium text-orange-800">4. 推广分天</div>
                  <div className="text-xs text-orange-600 mt-1">
                    商品推广*分天数据*.xls
                  </div>
                  <div className="text-sm mt-2 text-gray-700">
                    已导入 <strong>{opAds.length}</strong> 天
                  </div>
                </button>
              </div>

              <div className="border border-gray-200 rounded-xl p-4 mb-4 bg-gray-50 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-gray-800">运费 / 包材 / 退货 / 广告参数</div>
                  <button
                    type="button"
                    onClick={handleResetOpCostSettings}
                    className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-white"
                  >
                    恢复默认
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">默认首重(kg)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={opCostSettings.firstWeightKg}
                      onChange={(e) =>
                        setOpCostSettings((s) => ({
                          ...s,
                          firstWeightKg: Number(e.target.value) || 0,
                        }))
                      }
                      className="border rounded-lg px-2 py-1"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">默认首重运费(元)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={opCostSettings.firstWeightFee}
                      onChange={(e) =>
                        setOpCostSettings((s) => ({
                          ...s,
                          firstWeightFee: Number(e.target.value) || 0,
                        }))
                      }
                      className="border rounded-lg px-2 py-1"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">默认续重(kg)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={opCostSettings.additionalWeightKg}
                      onChange={(e) =>
                        setOpCostSettings((s) => ({
                          ...s,
                          additionalWeightKg: Number(e.target.value) || 1,
                        }))
                      }
                      className="border rounded-lg px-2 py-1"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">默认续重运费(元)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={opCostSettings.additionalWeightFee}
                      onChange={(e) =>
                        setOpCostSettings((s) => ({
                          ...s,
                          additionalWeightFee: Number(e.target.value) || 0,
                        }))
                      }
                      className="border rounded-lg px-2 py-1"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">默认包材价(元/件)</span>
                    <input
                      type="number"
                      step="0.01"
                      value={opCostSettings.defaultPackCost}
                      onChange={(e) =>
                        setOpCostSettings((s) => ({
                          ...s,
                          defaultPackCost: Number(e.target.value) || 0,
                        }))
                      }
                      className="border rounded-lg px-2 py-1"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">缺省单件重量(kg)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={opCostSettings.defaultWeightKg}
                      onChange={(e) =>
                        setOpCostSettings((s) => ({
                          ...s,
                          defaultWeightKg: Number(e.target.value) || 0.1,
                        }))
                      }
                      className="border rounded-lg px-2 py-1"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">退货损耗比例(0-1)</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={opCostSettings.returnRestockRate}
                      onChange={(e) =>
                        setOpCostSettings((s) => ({
                          ...s,
                          returnRestockRate: Math.min(
                            1,
                            Math.max(0, Number(e.target.value) || 0),
                          ),
                        }))
                      }
                      className="border rounded-lg px-2 py-1"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">二次包装/入库(元/单)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={opCostSettings.returnRepackCost}
                      onChange={(e) =>
                        setOpCostSettings((s) => ({
                          ...s,
                          returnRepackCost: Number(e.target.value) || 0,
                        }))
                      }
                      className="border rounded-lg px-2 py-1"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">推广费分摊</span>
                    <select
                      value={opCostSettings.adAllocateMode}
                      onChange={(e) =>
                        setOpCostSettings((s) => ({
                          ...s,
                          adAllocateMode: e.target
                            .value as CostSettings["adAllocateMode"],
                        }))
                      }
                      className="border rounded-lg px-2 py-1 bg-white"
                    >
                      <option value="by_gmv">按成交额占比</option>
                      <option value="by_order_count">按订单数均摊</option>
                      <option value="none">不摊到单(仅汇总扣)</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">高逆向率阈值%</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={Math.round((opCostSettings.anomalyHighRefundRate ?? 0.3) * 100)}
                      onChange={(e) =>
                        setOpCostSettings((s) => ({
                          ...s,
                          anomalyHighRefundRate: Math.min(
                            1,
                            Math.max(0, (Number(e.target.value) || 0) / 100),
                          ),
                        }))
                      }
                      className="border rounded-lg px-2 py-1 bg-white"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">高逆向最少发货单</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={opCostSettings.anomalyHighRefundMinShipped ?? 3}
                      onChange={(e) =>
                        setOpCostSettings((s) => ({
                          ...s,
                          anomalyHighRefundMinShipped: Math.max(
                            1,
                            Math.round(Number(e.target.value) || 3),
                          ),
                        }))
                      }
                      className="border rounded-lg px-2 py-1 bg-white"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">品牌扣点(%)</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={opCostSettings.brandPointPct ?? 0}
                      onChange={(e) =>
                        setOpCostSettings((s) => ({
                          ...s,
                          brandPointPct: Math.min(
                            100,
                            Math.max(0, Number(e.target.value) || 0),
                          ),
                        }))
                      }
                      className="border rounded-lg px-2 py-1"
                      placeholder="如 5 表示 5%"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">电商税(%)</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={opCostSettings.ecommerceTaxPct ?? 0}
                      onChange={(e) =>
                        setOpCostSettings((s) => ({
                          ...s,
                          ecommerceTaxPct: Math.min(
                            100,
                            Math.max(0, Number(e.target.value) || 0),
                          ),
                        }))
                      }
                      className="border rounded-lg px-2 py-1"
                      placeholder="如 1 表示 1%"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">扣点/税计算基数</span>
                    <select
                      value={opCostSettings.feeBaseMode || "revenue"}
                      onChange={(e) =>
                        setOpCostSettings((s) => ({
                          ...s,
                          feeBaseMode: e.target
                            .value as CostSettings["feeBaseMode"],
                        }))
                      }
                      className="border rounded-lg px-2 py-1 bg-white"
                    >
                      <option value="revenue">确认收入（推荐）</option>
                      <option value="merchantReceived">商家实收</option>
                      <option value="goodsTotal">商品总价</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 mt-5">
                    <input
                      type="checkbox"
                      checked={opCostSettings.forceDefaultPack}
                      onChange={(e) =>
                        setOpCostSettings((s) => ({
                          ...s,
                          forceDefaultPack: e.target.checked,
                        }))
                      }
                    />
                    <span className="text-xs text-gray-700">强制统一包材价</span>
                  </label>
                  <label className="flex items-center gap-2 mt-5">
                    <input
                      type="checkbox"
                      checked={opCostSettings.countProductCostOnRefundedShip}
                      onChange={(e) =>
                        setOpCostSettings((s) => ({
                          ...s,
                          countProductCostOnRefundedShip: e.target.checked,
                        }))
                      }
                    />
                    <span className="text-xs text-gray-700">
                      发货后退款仍计全额商品成本
                    </span>
                  </label>
                  <label className="flex items-center gap-2 mt-5">
                    <input
                      type="checkbox"
                      checked={opCostSettings.usePostageIncome}
                      onChange={(e) =>
                        setOpCostSettings((s) => ({
                          ...s,
                          usePostageIncome: e.target.checked,
                        }))
                      }
                    />
                    <span className="text-xs text-gray-700">订单邮费抵扣运费成本</span>
                  </label>
                </div>

                <div className="mt-3 p-3 rounded-xl border border-indigo-100 bg-indigo-50/50">
                  <div className="mb-2">
                    <div className="text-xs font-semibold text-indigo-900">一键参数模板</div>
                    <div className="text-[11px] text-indigo-700/80">
                      只覆盖模板字段，其余设置与店铺覆盖保留
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {COST_SETTING_TEMPLATES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        title={t.desc}
                        onClick={() => handleApplyCostTemplate(t.id)}
                        className="px-2.5 py-1.5 text-xs rounded-lg border border-indigo-200 bg-white text-indigo-800 hover:bg-indigo-100"
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-3 p-3 rounded-xl border border-violet-100 bg-violet-50/40">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div>
                      <div className="text-xs font-semibold text-violet-900">
                        店铺扣点 / 税覆盖
                      </div>
                      <div className="text-[11px] text-violet-700/80">
                        百分比留空=跟随全局默认；多店不同扣点时用这个
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleSyncShopsToOverrides}
                        className="px-2.5 py-1 text-xs rounded-lg border border-violet-200 bg-white text-violet-800 hover:bg-violet-100"
                      >
                        从订单同步店铺
                      </button>
                      <button
                        type="button"
                        onClick={handleAddShopFeeOverride}
                        className="px-2.5 py-1 text-xs rounded-lg bg-violet-600 text-white hover:bg-violet-700"
                      >
                        + 添加店铺
                      </button>
                    </div>
                  </div>
                  {(opCostSettings.shopFeeOverrides || []).length === 0 ? (
                    <div className="text-[11px] text-slate-500">
                      暂无覆盖行。导入订单后点「从订单同步店铺」，再按店填扣点/税。
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="text-left text-slate-500">
                            <th className="py-1 pr-2 font-medium">店铺名</th>
                            <th className="py-1 pr-2 font-medium">扣点%</th>
                            <th className="py-1 pr-2 font-medium">税%</th>
                            <th className="py-1 pr-2 font-medium">基数</th>
                            <th className="py-1 font-medium">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(opCostSettings.shopFeeOverrides || []).map((row, idx) => (
                            <tr key={idx} className="border-t border-violet-100/80">
                              <td className="py-1.5 pr-2">
                                <input
                                  className="border rounded-lg px-2 py-1 w-40 bg-white"
                                  value={row.shopName}
                                  placeholder="店铺名"
                                  onChange={(e) =>
                                    handleUpdateShopFeeOverride(idx, {
                                      shopName: e.target.value,
                                    })
                                  }
                                />
                              </td>
                              <td className="py-1.5 pr-2">
                                <input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  className="border rounded-lg px-2 py-1 w-20 bg-white"
                                  placeholder="全局"
                                  value={row.brandPointPct ?? ""}
                                  onChange={(e) =>
                                    handleUpdateShopFeeOverride(idx, {
                                      brandPointPct:
                                        e.target.value === ""
                                          ? null
                                          : Math.max(0, Number(e.target.value) || 0),
                                    })
                                  }
                                />
                              </td>
                              <td className="py-1.5 pr-2">
                                <input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  className="border rounded-lg px-2 py-1 w-20 bg-white"
                                  placeholder="全局"
                                  value={row.ecommerceTaxPct ?? ""}
                                  onChange={(e) =>
                                    handleUpdateShopFeeOverride(idx, {
                                      ecommerceTaxPct:
                                        e.target.value === ""
                                          ? null
                                          : Math.max(0, Number(e.target.value) || 0),
                                    })
                                  }
                                />
                              </td>
                              <td className="py-1.5 pr-2">
                                <select
                                  className="border rounded-lg px-2 py-1 bg-white"
                                  value={row.feeBaseMode || ""}
                                  onChange={(e) =>
                                    handleUpdateShopFeeOverride(idx, {
                                      feeBaseMode: e.target
                                        .value as ShopFeeOverride["feeBaseMode"],
                                    })
                                  }
                                >
                                  <option value="">跟随全局</option>
                                  <option value="revenue">确认收入</option>
                                  <option value="merchantReceived">商家实收</option>
                                  <option value="goodsTotal">商品总价</option>
                                </select>
                              </td>
                              <td className="py-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveShopFeeOverride(idx)}
                                  className="text-red-600 hover:underline"
                                >
                                  删除
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-sm font-medium text-gray-800 mb-2">
                    分快递运费规则（优先于默认首续重）
                  </div>
                  <div className="overflow-x-auto border border-gray-200 rounded-lg bg-white">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-100 text-gray-600">
                        <tr>
                          <th className="px-2 py-1.5 text-left">快递</th>
                          <th className="px-2 py-1.5 text-left">匹配关键词</th>
                          <th className="px-2 py-1.5 text-left">首重kg</th>
                          <th className="px-2 py-1.5 text-left">首重费</th>
                          <th className="px-2 py-1.5 text-left">续重kg</th>
                          <th className="px-2 py-1.5 text-left">续重费</th>
                        </tr>
                      </thead>
                      <tbody>
                        {opCostSettings.expressRules.map((rule, idx) => (
                          <tr
                            key={rule.label + idx}
                            className="border-t border-gray-100"
                          >
                            <td className="px-2 py-1">
                              <input
                                value={rule.label}
                                onChange={(e) =>
                                  updateExpressRule(idx, {
                                    label: e.target.value,
                                  })
                                }
                                className="w-20 border rounded px-1 py-0.5"
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                value={rule.keywords}
                                onChange={(e) =>
                                  updateExpressRule(idx, {
                                    keywords: e.target.value,
                                  })
                                }
                                className="w-40 border rounded px-1 py-0.5"
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="number"
                                step="0.1"
                                value={rule.firstWeightKg}
                                onChange={(e) =>
                                  updateExpressRule(idx, {
                                    firstWeightKg: Number(e.target.value) || 0,
                                  })
                                }
                                className="w-16 border rounded px-1 py-0.5"
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="number"
                                step="0.1"
                                value={rule.firstWeightFee}
                                onChange={(e) =>
                                  updateExpressRule(idx, {
                                    firstWeightFee:
                                      Number(e.target.value) || 0,
                                  })
                                }
                                className="w-16 border rounded px-1 py-0.5"
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="number"
                                step="0.1"
                                value={rule.additionalWeightKg}
                                onChange={(e) =>
                                  updateExpressRule(idx, {
                                    additionalWeightKg:
                                      Number(e.target.value) || 1,
                                  })
                                }
                                className="w-16 border rounded px-1 py-0.5"
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="number"
                                step="0.1"
                                value={rule.additionalWeightFee}
                                onChange={(e) =>
                                  updateExpressRule(idx, {
                                    additionalWeightFee:
                                      Number(e.target.value) || 0,
                                  })
                                }
                                className="w-16 border rounded px-1 py-0.5"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <p className="text-[11px] text-gray-500">
                  毛利=确认收入-商品成本-包材-净运费(运费-邮费)-平台费用-退货损耗-二次包装-品牌扣点-电商税-(分摊广告)。扣点/税可填百分比，按所选基数计提。
                  参数自动记住（本机 localStorage）。改完参数后请重新点「生成经营报表」。
                </p>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={handleBuildOperatingReport}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
                >
                  生成经营报表
                </button>
                <button
                  onClick={handleExportOperating}
                  disabled={!opReport}
                  className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-40"
                >
                  导出 Excel
                </button>
                <button
                  onClick={handleExportAnomalies}
                  disabled={!opReport}
                  className="px-4 py-2 rounded-lg bg-rose-600 text-white text-sm hover:bg-rose-700 disabled:opacity-40"
                >
                  导出异常订单
                </button>
                <button
                  onClick={handleCopyUnmatchedSkus}
                  disabled={!opReport || opReport.unmatchedSkus.length === 0}
                  className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm hover:bg-amber-600 disabled:opacity-40"
                >
                  复制待补SKU
                </button>
                <button
                  onClick={handleCopyBossOnePager}
                  disabled={!opReport}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm hover:bg-slate-900 disabled:opacity-40"
                >
                  复制老板一页纸
                </button>
                <button
                  onClick={handleCopyBossOnePagerTsv}
                  disabled={!opReport}
                  className="px-4 py-2 rounded-lg border border-slate-400 bg-white text-slate-800 text-sm hover:bg-slate-50 disabled:opacity-40"
                >
                  复制一页纸表格
                </button>
                <button
                  onClick={() => handleExportProductMaster("all")}
                  disabled={opOrders.length === 0}
                  className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-700 disabled:opacity-40"
                >
                  生成商品资料
                </button>
                <button
                  onClick={() => handleExportProductMaster("missing_cost")}
                  disabled={opOrders.length === 0}
                  className="px-4 py-2 rounded-lg bg-violet-500/90 text-white text-sm hover:bg-violet-600 disabled:opacity-40"
                >
                  待补商品资料
                </button>
                <button
                  type="button"
                  onClick={handleExportCostSettings}
                  className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm hover:bg-slate-50"
                >
                  导出参数JSON
                </button>
                <button
                  type="button"
                  onClick={handleImportCostSettings}
                  disabled={!desktopReady}
                  className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-40"
                >
                  导入参数JSON
                </button>
                <button
                  onClick={handleClearOperating}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                >
                  清空
                </button>
              </div>

              {opSources.length > 0 && (
                <div className="text-xs text-gray-500 mb-3">
                  来源：
                  {opSources.map((s) => (
                    <span
                      key={s.kind}
                      className="inline-block mr-2 px-2 py-0.5 bg-gray-100 rounded"
                    >
                      {sourceKindLabel(s.kind as any)}
                      {s.shop ? ` · ${s.shop}` : ""} · {s.name} · {s.rows}行
                    </span>
                  ))}
                </div>
              )}

                            </div>

              {opReport && (
                <div className="mt-2">
                  <div className="contents">
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 mb-4">
                    <div className="bg-slate-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500">商家实收</div>
                      <div className="text-lg font-bold">
                        ¥{opReport.summary.merchantReceived.toFixed(2)}
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500">商品成本</div>
                      <div className="text-lg font-bold text-violet-700">
                        ¥{opReport.summary.costTotal.toFixed(2)}
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500">包材合计</div>
                      <div className="text-lg font-bold text-violet-600">
                        ¥{opReport.summary.packTotal.toFixed(2)}
                      </div>
                    </div>
                    <div className="bg-sky-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500">运费 / 邮费抵扣 / 净运费</div>
                      <div className="text-sm font-bold text-sky-700">
                        ¥{opReport.summary.shippingTotal.toFixed(2)}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        邮费+¥{opReport.summary.postageIncomeTotal.toFixed(2)} · 净¥
                        {opReport.summary.netShippingTotal.toFixed(2)}
                      </div>
                    </div>
                    <div className="bg-red-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500">损耗运费</div>
                      <div className="text-lg font-bold text-red-600">
                        ¥{opReport.summary.shippingLossTotal.toFixed(2)}
                      </div>
                    </div>
                    <div className="bg-rose-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500">退货损耗 / 二次包装</div>
                      <div className="text-sm font-bold text-rose-700">
                        ¥{opReport.summary.returnLossTotal.toFixed(2)}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        二次包装 ¥{opReport.summary.repackCostTotal.toFixed(2)}
                      </div>
                    </div>
                    <div className="bg-violet-50 rounded-xl p-3 min-h-[96px]">
                      <div className="text-xs text-gray-500 leading-snug">
                        品牌扣点 ({opReport.summary.brandPointPct || 0}%)
                      </div>
                      <div className="text-lg font-bold text-violet-700">
                        ¥{(opReport.summary.brandPointTotal || 0).toFixed(2)}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5 leading-relaxed break-words">
                        基数=
                        {opReport.summary.feeBaseMode === "goodsTotal"
                          ? "商品总价"
                          : opReport.summary.feeBaseMode === "merchantReceived"
                            ? "商家实收"
                            : "确认收入"}
                      </div>
                    </div>
                    <div className="bg-indigo-50 rounded-xl p-3 min-h-[96px]">
                      <div className="text-xs text-gray-500 leading-snug">
                        电商税 ({opReport.summary.ecommerceTaxPct || 0}%)
                      </div>
                      <div className="text-lg font-bold text-indigo-700">
                        ¥{(opReport.summary.ecommerceTaxTotal || 0).toFixed(2)}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5 leading-relaxed break-words">
                        与扣点同基数计提 · 可在上方参数区修改%
                      </div>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-3 min-h-[96px]">
                      <div className="text-xs text-gray-500 leading-snug">总退款率(笔/额 · /全部订单)</div>
                      <div className="text-lg font-bold text-amber-700">
                        {(opReport.summary.refundRateByCount * 100).toFixed(1)}%
                        <span className="text-xs font-normal text-gray-500">
                          {" "}/{(opReport.summary.refundRateByAmount * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5 leading-relaxed break-words">
                        {opReport.summary.refundOrderCount}/{opReport.summary.orderCount} 单
                      </div>
                    </div>
                    <div className="bg-orange-50 rounded-xl p-3 min-h-[96px]">
                      <div className="text-xs text-gray-500 leading-snug">发货后退款率(笔/额 · /已发货)</div>
                      <div className="text-lg font-bold text-orange-700">
                        {(opReport.summary.postShipRefundRateByCount * 100).toFixed(1)}%
                        <span className="text-xs font-normal text-gray-500">
                          {" "}/
                          {(opReport.summary.postShipRefundRateByAmount * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5 leading-relaxed break-words">
                        {opReport.summary.postShipRefundCount}/{opReport.summary.shippedOrderCount}
                        {" = "}发货未收货{opReport.summary.shipOnlyRefundCount}
                        +签收退{opReport.summary.signedReturnCount}
                        （=退货退款主口径）
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 min-h-[88px]">
                      <div className="text-xs text-gray-500">广告花费(日报) / 已分摊</div>
                      <div className="text-sm font-bold text-red-600">
                        ¥{opReport.summary.adSpend.toFixed(2)}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        分摊 ¥{opReport.summary.adAllocatedTotal.toFixed(2)}
                      </div>
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500">毛利(扣成本包材净运费等)</div>
                      <div className="text-lg font-bold text-emerald-700">
                        ¥{opReport.summary.estimatedProfitBeforeAd.toFixed(2)}
                      </div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500">毛利(再扣广告)</div>
                      <div className="text-lg font-bold text-green-700">
                        ¥{opReport.summary.estimatedProfitAfterAd.toFixed(2)}
                      </div>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500">毛利率 / 已发货未成交</div>
                      <div className="text-lg font-bold text-blue-700">
                        {(opReport.summary.profitMargin * 100).toFixed(1)}%
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        未成交 {opReport.summary.shipNotDealCount} 单
                      </div>
                    </div>
                    <div className="bg-rose-50 rounded-xl p-3 min-h-[96px]">
                      <div className="text-xs text-gray-500 leading-snug">
                        退货退款率(主 · 发货后全部退/已发货)
                      </div>
                      <div className="text-lg font-bold text-rose-700">
                        {(opReport.summary.returnRefundRateByCount * 100).toFixed(1)}%
                        <span className="text-xs font-normal text-gray-500">
                          {" "}/{(opReport.summary.returnRefundRateByAmount * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-600 mt-0.5 leading-relaxed break-words">
                        {opReport.summary.returnRefundCount}/
                        {opReport.summary.shippedOrderCount} 已发货
                        {" = "}未收货退{opReport.summary.shipOnlyRefundCount}
                        +签收退{opReport.summary.signedReturnCount}
                        <br />
                        对照全部 {(opReport.summary.returnRefundRateOfAllByCount * 100).toFixed(1)}%
                        · 签收后{(opReport.summary.signedReturnRateByCount * 100).toFixed(2)}%
                      </div>
                    </div>
                    <div className="bg-fuchsia-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500">广告ROI(仅推广日报)</div>
                      <div className="text-lg font-bold text-fuchsia-700">
                        {opReport.summary.adRoi.toFixed(2)}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        花费 ¥{opReport.summary.adSpend.toFixed(0)}
                        {opReport.summary.billAdExpenseExcluded > 0
                          ? ` · 账务广告已排除 ¥${opReport.summary.billAdExpenseExcluded.toFixed(0)}`
                          : ""}
                      </div>
                    </div>
                    {opReport.summary.latestMonth && (
                      <div className="bg-indigo-50 rounded-lg p-3 col-span-2 md:col-span-4">
                        <div className="text-xs text-gray-500 mb-1">
                          时段对比（最新月 vs 上月）
                        </div>
                        {(() => {
                          const months = opReport.summary.months || [];
                          const latest = months.find(
                            (m) => m.month === opReport.summary.latestMonth,
                          );
                          const prev = months.find(
                            (m) => m.month === opReport.summary.prevMonth,
                          );
                          if (!latest) {
                            return (
                              <div className="text-sm text-gray-500">暂无分月数据</div>
                            );
                          }
                          const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
                          const delta = (a: number, b?: number) => {
                            if (b === undefined || b === null) return "—";
                            const d = a - b;
                            const sign = d > 0 ? "+" : "";
                            return `${sign}${d.toFixed(2)}`;
                          };
                          return (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                              <div>
                                <div className="text-gray-500">
                                  {latest.month} 退款率(笔)
                                </div>
                                <div className="font-semibold">
                                  {pct(latest.refundRateByCount)}
                                  {prev && (
                                    <span className="text-gray-400 font-normal">
                                      {" "}
                                      (上月 {pct(prev.refundRateByCount)})
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div>
                                <div className="text-gray-500">损耗运费</div>
                                <div className="font-semibold">
                                  ¥{latest.shippingLossTotal.toFixed(2)}
                                  {prev && (
                                    <span className="text-gray-400 font-normal">
                                      {" "}
                                      (
                                      {delta(
                                        latest.shippingLossTotal,
                                        prev.shippingLossTotal,
                                      )}
                                      )
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div>
                                <div className="text-gray-500">毛利(扣广告)</div>
                                <div className="font-semibold text-green-700">
                                  ¥{latest.profitAfterAd.toFixed(2)}
                                  {prev && (
                                    <span className="text-gray-400 font-normal">
                                      {" "}
                                      (
                                      {delta(
                                        latest.profitAfterAd,
                                        prev.profitAfterAd,
                                      )}
                                      )
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div>
                                <div className="text-gray-500">毛利率</div>
                                <div className="font-semibold">
                                  {pct(latest.profitMargin)}
                                  {prev && (
                                    <span className="text-gray-400 font-normal">
                                      {" "}
                                      (上月 {pct(prev.profitMargin)})
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  <div className="bg-gradient-to-r from-rose-50 to-amber-50 border border-rose-100 rounded-xl p-4 mb-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="font-medium text-gray-800 text-sm">本月亏在哪（速览）</div>
                      <button
                        type="button"
                        className="text-xs text-blue-600 hover:underline"
                        onClick={() => handleShowOperatingView("lossDiagnosis")}
                      >
                        查看完整诊断 →
                      </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div className="bg-white/80 rounded-lg p-2">
                        <div className="text-gray-500">广告(日报)</div>
                        <div className="font-semibold text-red-600">¥{opReport.summary.adSpend.toFixed(2)}</div>
                      </div>
                      <div className="bg-white/80 rounded-lg p-2">
                        <div className="text-gray-500">损耗运费</div>
                        <div className="font-semibold text-red-600">¥{opReport.summary.shippingLossTotal.toFixed(2)}</div>
                      </div>
                      <div className="bg-white/80 rounded-lg p-2">
                        <div className="text-gray-500">退货损耗+二次包装</div>
                        <div className="font-semibold text-red-600">
                          ¥{(opReport.summary.returnLossTotal + opReport.summary.repackCostTotal).toFixed(2)}
                        </div>
                      </div>
                      <div className="bg-white/80 rounded-lg p-2">
                        <div className="text-gray-500">未匹配成本</div>
                        <div className="font-semibold text-amber-700">
                          {opReport.summary.costUnmatchedOrders} 单 / ¥{opReport.summary.costUnmatchedAmount.toFixed(0)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 匹配方式可解释 */}
                  {opReport.matchMethodTable && opReport.matchMethodTable.length > 1 && (
                    <div className="mb-4 rounded-xl border border-sky-100 bg-sky-50/60 p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="text-sm font-medium text-sky-900">成本匹配方式</div>
                        <button
                          type="button"
                          className="text-xs text-sky-700 underline"
                          onClick={() => handleShowOperatingView("matchMethod")}
                        >
                          查看明细
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {opReport.matchMethodTable.slice(1).map((row, idx) => {
                          const name = String(row[0] ?? "");
                          const count = row[1];
                          const share = String(row[2] ?? "");
                          const bad = name === "未匹配";
                          return (
                            <span
                              key={idx}
                              className={`text-xs px-2 py-1 rounded-lg border ${
                                bad
                                  ? "bg-amber-100 border-amber-200 text-amber-900"
                                  : "bg-white border-sky-100 text-slate-700"
                              }`}
                            >
                              <strong>{name}</strong> {count}单 ({share})
                            </span>
                          );
                        })}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-2">
                        订单毛利表含「匹配方式」列；无编码命中会显示「商品规格(无编码)」等。
                      </div>
                    </div>
                  )}

                  <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 text-white rounded-xl p-4 mb-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                      <div>
                        <div className="text-sm font-semibold">毛利被谁吃掉了（对照）</div>
                        <div className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                          底座毛利 → 扣退货相关 → 扣扣点税 → 扣广告 = 最终毛利
                        </div>
                      </div>
                      <div className="text-right text-[11px] text-slate-300">
                        合计吃掉{" "}
                        <span className="text-amber-300 font-semibold text-sm">
                          ¥{(opReport.summary.marginEatenTotal || 0).toFixed(0)}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 text-sm">
                      <div className="rounded-lg bg-white/10 p-2.5 border border-white/10">
                        <div className="text-[11px] text-slate-300">① 经营底座</div>
                        <div className="text-lg font-bold text-emerald-300">
                          ¥{(opReport.summary.profitOpsBase || 0).toFixed(0)}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          收入-成本-包材-运费-平台费
                        </div>
                      </div>
                      <div className="rounded-lg bg-white/10 p-2.5 border border-white/10">
                        <div className="text-[11px] text-slate-300">② 退货相关吃掉</div>
                        <div className="text-lg font-bold text-rose-300">
                          -¥{(opReport.summary.returnRelatedCost || 0).toFixed(0)}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          损耗+二次包装 · 另有损耗运费 ¥
                          {(opReport.summary.shippingLossTotal || 0).toFixed(0)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-white/10 p-2.5 border border-white/10">
                        <div className="text-[11px] text-slate-300">③ 品牌扣点</div>
                        <div className="text-lg font-bold text-violet-300">
                          -¥{(opReport.summary.brandPointTotal || 0).toFixed(0)}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          全局 {opReport.summary.brandPointPct || 0}%
                          （可按店覆盖）
                        </div>
                      </div>
                      <div className="rounded-lg bg-white/10 p-2.5 border border-white/10">
                        <div className="text-[11px] text-slate-300">④ 电商税</div>
                        <div className="text-lg font-bold text-indigo-300">
                          -¥{(opReport.summary.ecommerceTaxTotal || 0).toFixed(0)}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          全局 {opReport.summary.ecommerceTaxPct || 0}%
                        </div>
                      </div>
                      <div className="rounded-lg bg-white/10 p-2.5 border border-white/10">
                        <div className="text-[11px] text-slate-300">⑤ 广告吃掉</div>
                        <div className="text-lg font-bold text-amber-300">
                          -¥{(opReport.summary.adSpend || 0).toFixed(0)}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          仅推广日报 · ROI{" "}
                          {(opReport.summary.adRoi || 0).toFixed(2)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-emerald-500/20 p-2.5 border border-emerald-400/30">
                        <div className="text-[11px] text-emerald-200">⑥ 最终毛利</div>
                        <div className="text-lg font-bold text-emerald-200">
                          ¥{opReport.summary.estimatedProfitAfterAd.toFixed(0)}
                        </div>
                        <div className="text-[10px] text-emerald-100/70 mt-0.5">
                          毛利率{" "}
                          {(opReport.summary.profitMargin * 100).toFixed(1)}% · 未扣广告
                          ¥{opReport.summary.estimatedProfitBeforeAd.toFixed(0)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
                      {(() => {
                        const ad = opReport.summary.adSpend || 0;
                        const fee =
                          (opReport.summary.brandPointTotal || 0) +
                          (opReport.summary.ecommerceTaxTotal || 0);
                        const ret =
                          (opReport.summary.returnRelatedCost || 0) +
                          (opReport.summary.shippingLossTotal || 0);
                        const sum = ad + fee + ret || 1;
                        const bar = (v: number, color: string, label: string) => (
                          <div key={label} className="bg-white/5 rounded-lg p-2 border border-white/10">
                            <div className="flex justify-between mb-1">
                              <span className="text-slate-300">{label}</span>
                              <span className="text-white font-medium">
                                ¥{v.toFixed(0)} · {((v / sum) * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div className="h-1.5 rounded bg-white/10 overflow-hidden">
                              <div
                                className={`h-full ${color}`}
                                style={{ width: `${Math.min(100, (v / sum) * 100)}%` }}
                              />
                            </div>
                          </div>
                        );
                        return [
                          bar(ad, "bg-amber-400", "广告占比"),
                          bar(fee, "bg-violet-400", "扣点+税占比"),
                          bar(ret, "bg-rose-400", "退货相关占比"),
                        ];
                      })()}
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-800">退款结构一览（口径对照）</div>
                        <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                          总退款 = 未发货退 + 发货未收货退 + 签收退；退货退款主口径 = 发货后全部退 / 已发货
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleShowOperatingView("rates")}
                        className="text-xs px-3 py-1.5 rounded-lg border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100"
                      >
                        打开退款率明细表
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
                      <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
                        <div className="text-xs text-amber-800 font-medium">① 总退款</div>
                        <div className="text-xl font-bold text-amber-700 mt-1">
                          {(opReport.summary.refundRateByCount * 100).toFixed(1)}%
                        </div>
                        <div className="text-xs text-slate-600 mt-1 break-words leading-relaxed">
                          {opReport.summary.refundOrderCount} / {opReport.summary.orderCount} 单
                          <br />
                          金额率 {(opReport.summary.refundRateByAmount * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                        <div className="text-xs text-slate-700 font-medium">② 未发货退款</div>
                        <div className="text-xl font-bold text-slate-800 mt-1">
                          {opReport.summary.orderCount > 0
                            ? (
                                (opReport.summary.unshippedRefundCount /
                                  opReport.summary.orderCount) *
                                100
                              ).toFixed(1)
                            : "0.0"}
                          %
                        </div>
                        <div className="text-xs text-slate-600 mt-1 break-words leading-relaxed">
                          {opReport.summary.unshippedRefundCount} 单 · ¥
                          {opReport.summary.unshippedRefundAmount.toFixed(0)}
                          <br />
                          分母：全部订单
                        </div>
                      </div>
                      <div className="rounded-lg bg-orange-50 border border-orange-100 p-3">
                        <div className="text-xs text-orange-800 font-medium">③ 发货后退款</div>
                        <div className="text-xl font-bold text-orange-700 mt-1">
                          {(opReport.summary.postShipRefundRateByCount * 100).toFixed(1)}%
                        </div>
                        <div className="text-xs text-slate-600 mt-1 break-words leading-relaxed">
                          {opReport.summary.postShipRefundCount} / {opReport.summary.shippedOrderCount}{" "}
                          已发货
                          <br />
                          其中未收货退 {opReport.summary.shipOnlyRefundCount} + 签收退{" "}
                          {opReport.summary.signedReturnCount}
                        </div>
                      </div>
                      <div className="rounded-lg bg-rose-50 border border-rose-100 p-3">
                        <div className="text-xs text-rose-800 font-medium">④ 退货退款（发货后全部）</div>
                        <div className="text-xl font-bold text-rose-700 mt-1">
                          {(opReport.summary.returnRefundRateByCount * 100).toFixed(1)}%
                        </div>
                        <div className="text-xs text-slate-600 mt-1 break-words leading-relaxed">
                          主：{opReport.summary.returnRefundCount} /{" "}
                          {opReport.summary.shippedOrderCount} 已发货
                          <br />
                          其中未收货退 {opReport.summary.shipOnlyRefundCount} + 签收退{" "}
                          {opReport.summary.signedReturnCount}
                          <br />
                          签收后辅：{(opReport.summary.signedReturnRateByCount * 100).toFixed(2)}% (
                          {opReport.summary.signedReturnCount}/
                          {opReport.summary.receivedRelatedCount})
                        </div>
                      </div>
                    </div>
                  </div>

                  </div>
                  <div className="op-sticky-chrome flex-shrink-0">
                  <div className="flex flex-nowrap gap-2 mb-2 overflow-x-auto pb-1 flex-shrink-0">
                    {[
                      { key: "summary", label: "汇总" },
                      { key: "bossOnePager", label: "老板一页纸" },
                      { key: "anomalies", label: "异常找坑" },
                      { key: "lossDiagnosis", label: "本月亏在哪" },
                      { key: "rates", label: "退款率" },
                      { key: "period", label: "时段对比" },
                      { key: "shops", label: "店铺对比" },
                      { key: "spuRank", label: "SPU毛利排行" },
                      { key: "skuRank", label: "规格毛利排行" },
                      { key: "salesRankSku", label: "规格销售榜" },
                      { key: "salesRankSpu", label: "编码销售榜" },
                      { key: "ads", label: "推广" },
                      { key: "productReturn", label: "产品退货退款率" },
                      { key: "express", label: "分快递运费" },
                      { key: "expressAlert", label: "快递未匹配" },
                      { key: "matchMethod", label: "匹配方式" },
                      { key: "orders", label: "订单毛利" },
                      {
                        key: "shipLoss",
                        label: `损耗运费(${opReport.summary.shipNotDealCount})`,
                      },
                      { key: "billTypes", label: "账务类型" },
                      { key: "billWide", label: "账务按单" },
                      { key: "products", label: "商品成本" },
                      {
                        key: "unmatched",
                        label: `待补SKU(${opReport.summary.costUnmatchedOrders})`,
                      },
                    ].map((v) => (
                      <button
                        key={v.key}
                        onClick={() => handleShowOperatingView(v.key as any)}
                        className={`px-3 py-1.5 rounded-lg text-xs border ${
                          opView === v.key
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>

                  {(opView === "anomalies" ||
                    opView === "anomalyNeg" ||
                    opView === "anomalyUnmatched" ||
                    opView === "anomalyFeeFlip" ||
                    opView === "anomalyHighSku") &&
                    opReport && (
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <span className="text-xs text-gray-500">异常明细：</span>
                      {[
                        { key: "anomalies", label: "汇总" },
                        {
                          key: "anomalyNeg",
                          label: `负毛利(${Math.max(0, (opReport.anomalyNegProfitTable?.length || 1) - 1)})`,
                        },
                        {
                          key: "anomalyUnmatched",
                          label: `未匹配(${Math.max(0, (opReport.anomalyUnmatchedTable?.length || 1) - 1)})`,
                        },
                        {
                          key: "anomalyFeeFlip",
                          label: `扣点税变亏(${Math.max(0, (opReport.anomalyFeeFlipTable?.length || 1) - 1)})`,
                        },
                        {
                          key: "anomalyHighSku",
                          label: `高逆向规格(${Math.max(0, (opReport.anomalyHighRefundSkuTable?.length || 1) - 1)})`,
                        },
                      ].map((v) => (
                        <button
                          key={v.key}
                          type="button"
                          onClick={() => handleShowOperatingView(v.key as any)}
                          className={`px-2.5 py-1 rounded-lg text-xs border ${
                            opView === v.key
                              ? "bg-rose-600 text-white border-rose-600"
                              : "bg-white text-gray-700 border-gray-300"
                          }`}
                        >
                          {v.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={handleExportAnomalies}
                        className="px-2.5 py-1 rounded-lg text-xs bg-rose-50 text-rose-700 border border-rose-200"
                      >
                        导出异常Excel
                      </button>
                    </div>
                  )}

                  {(opView === "spuRank" || opView === "skuRank") && (
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs text-gray-500">排行方向：</span>
                      <button
                        type="button"
                        onClick={() => {
                          setOpRankSort("profit");
                          handleShowOperatingView(opView, "profit");
                        }}
                        className={`px-3 py-1 rounded-lg text-xs border ${
                          opRankSort === "profit"
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-white text-gray-700 border-gray-300"
                        }`}
                      >
                        最赚
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpRankSort("loss");
                          handleShowOperatingView(opView, "loss");
                        }}
                        className={`px-3 py-1 rounded-lg text-xs border ${
                          opRankSort === "loss"
                            ? "bg-red-600 text-white border-red-600"
                            : "bg-white text-gray-700 border-gray-300"
                        }`}
                      >
                        最亏
                      </button>
                    </div>
                  )}
                  </div>{/* op-sticky-chrome */}



                  {opView === "bossOnePager" && opReport && (
                    <div className="mb-3 rounded-xl border border-slate-800/10 bg-gradient-to-br from-slate-900 to-slate-800 text-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                        <div>
                          <div className="text-base font-bold tracking-wide">店财通 · 老板一页纸</div>
                          <div className="text-xs text-slate-300 mt-0.5">
                            {new Date().toLocaleString("zh-CN")} · 截图或复制留档
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={handleCopyBossOnePager}
                            className="text-xs px-2.5 py-1 rounded bg-white text-slate-900 hover:bg-slate-100"
                          >
                            复制文本
                          </button>
                          <button
                            type="button"
                            onClick={handleCopyBossOnePagerTsv}
                            className="text-xs px-2.5 py-1 rounded border border-white/40 hover:bg-white/10"
                          >
                            复制表格
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                        {(opReport.bossOnePagerTable || [])
                          .slice(1)
                          .map((row, idx) => (
                            <div
                              key={idx}
                              className="rounded-lg bg-white/10 px-2.5 py-2 border border-white/10"
                            >
                              <div className="text-[11px] text-slate-300 leading-snug">
                                {String(row[0] ?? "")}
                              </div>
                              <div className="font-semibold text-white mt-0.5 break-words">
                                {String(row[1] ?? "")}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {opView === "ads" && opReport && (
                    <div className="mb-3 rounded-xl border border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-bold text-orange-900">推广中心</div>
                          <div className="text-[11px] text-orange-800/90 mt-0.5">
                            仅统计推广分天日报；账务里的广告费已排除，避免重复扣减。
                          </div>
                        </div>
                        <div className="text-xs text-orange-900 bg-white/70 border border-orange-100 rounded-lg px-2.5 py-1">
                          扣广告毛利 ¥
                          {opReport.summary.estimatedProfitAfterAd.toFixed(0)}
                          {" · "}
                          分摊 ¥{opReport.summary.adAllocatedTotal.toFixed(0)}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
                        <div className="rounded-lg bg-white border border-orange-100 p-2.5">
                          <div className="text-[11px] text-slate-500">广告花费</div>
                          <div className="text-lg font-bold text-orange-700">
                            ¥{opReport.summary.adSpend.toFixed(2)}
                          </div>
                        </div>
                        <div className="rounded-lg bg-white border border-orange-100 p-2.5">
                          <div className="text-[11px] text-slate-500">交易额</div>
                          <div className="text-lg font-bold text-slate-800">
                            ¥{opReport.summary.adGmv.toFixed(2)}
                          </div>
                        </div>
                        <div className="rounded-lg bg-white border border-orange-100 p-2.5">
                          <div className="text-[11px] text-slate-500">净交易额</div>
                          <div className="text-lg font-bold text-slate-800">
                            ¥{Number(opReport.summary.adNetGmv || 0).toFixed(2)}
                          </div>
                        </div>
                        <div className="rounded-lg bg-white border border-orange-100 p-2.5">
                          <div className="text-[11px] text-slate-500">结算交易额</div>
                          <div className="text-lg font-bold text-slate-800">
                            ¥{Number(opReport.summary.adSettledGmv || 0).toFixed(2)}
                          </div>
                        </div>
                        <div className="rounded-lg bg-white border border-emerald-100 p-2.5">
                          <div className="text-[11px] text-slate-500">实际投产比</div>
                          <div className="text-lg font-bold text-emerald-700">
                            {opReport.summary.adRoi.toFixed(2)}
                          </div>
                          <div className="text-[10px] text-slate-400">交易额/花费</div>
                        </div>
                        <div className="rounded-lg bg-white border border-sky-100 p-2.5">
                          <div className="text-[11px] text-slate-500">净实际投产比</div>
                          <div className="text-lg font-bold text-sky-700">
                            {Number(opReport.summary.adNetRoi || 0).toFixed(2)}
                          </div>
                          <div className="text-[10px] text-slate-400">净交易额/花费</div>
                        </div>
                        <div className="rounded-lg bg-white border border-violet-100 p-2.5">
                          <div className="text-[11px] text-slate-500">结算投产比</div>
                          <div className="text-lg font-bold text-violet-700">
                            {Number(opReport.summary.adSettledRoi || 0).toFixed(2)}
                          </div>
                          <div className="text-[10px] text-slate-400">结算交易额/花费</div>
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-600">
                        下表为分天明细（含三项投产比）。表格底部有常驻横向滚动条，前两列已冻结。
                      </div>
                    </div>
                  )}

                  {opView === "express" &&
                    opReport?.expressAlertTable &&
                    opReport.expressAlertTable.length > 1 && (
                      <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        有 {opReport.expressAlertTable.length - 1} 家快递未命中运费规则（走默认首重续重）。
                        <button
                          type="button"
                          className="ml-2 underline"
                          onClick={() => handleShowOperatingView("expressAlert")}
                        >
                          查看未匹配快递
                        </button>
                      </div>
                    )}

                                    <div className="border border-slate-200 rounded-xl bg-white overflow-x-clip">
                    <DataTable
                      data={currentData}
                      headers={
                        currentHeaders.length
                          ? currentHeaders
                          : (currentData[0] || []).map(String)
                      }
                      stickyCols={2}
                      maxHeightClass="max-h-full"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========== SKU映射 ========== */}
      {activeTab === "mapping" && (
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="font-semibold text-gray-800 mb-1">
                🏷️ SKU 映射表
              </h2>
              <p className="text-sm text-gray-500 mb-4">平台品名 → 内部编码</p>
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center mb-4">
                {mappingFile ? (
                  <div className="text-green-600">
                    <div className="text-2xl mb-2">✅</div>
                    <div className="font-medium">{mappingFile.name}</div>
                    <div className="text-sm text-gray-500 mt-1">
                      {skuMappings.length} 条规则
                    </div>
                    <button
                      onClick={() => {
                        setMappingFile(null);
                        setSkuMappings([]);
                      }}
                      className="mt-2 text-xs text-red-500 hover:underline"
                    >
                      移除
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="text-3xl mb-2">📤</div>
                    <div className="text-gray-600 mb-2">选择映射文件</div>
                    <button
                      onClick={handleImportMapping}
                      disabled={!desktopReady}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-40"
                    >
                      选择文件
                    </button>
                  </>
                )}
              </div>
              {skuMappings.length > 0 && (
                <button
                  onClick={handleApplyMapping}
                  disabled={currentData.length === 0}
                  className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm disabled:opacity-40 mb-4"
                >
                  应用到当前数据 ({currentData.length - 1}行)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========== 收款对账 ========== */}
      {activeTab === "reconcile" && (
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="font-semibold text-gray-800 mb-1">🧾 收款对账</h2>
              <p className="text-sm text-gray-500 mb-4">收款流水 vs 订单金额</p>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center">
                  {paymentFile ? (
                    <div className="text-green-600">
                      <div className="text-2xl mb-1">✅</div>
                      <div className="text-sm font-medium">
                        {paymentFile.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {paymentFile.data.length - 1} 条
                      </div>
                      <button
                        onClick={() => setPaymentFile(null)}
                        className="mt-1 text-xs text-red-500 hover:underline"
                      >
                        移除
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="text-2xl mb-1">💳</div>
                      <div className="text-sm text-gray-600 mb-2">收款流水</div>
                      <button
                        onClick={handleImportPayment}
                        disabled={!desktopReady}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-40"
                      >
                        选择文件
                      </button>
                    </>
                  )}
                </div>
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center">
                  <div className="text-2xl mb-1">📦</div>
                  <div className="text-sm text-gray-600 mb-2">当前订单</div>
                  <div className="text-sm font-medium">
                    {currentData.length - 1} 行
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    ¥
                    {currentData
                      .slice(1)
                      .reduce((s, r) => s + findAmount(r), 0)
                      .toFixed(2)}
                  </div>
                </div>
              </div>
              <button
                onClick={handleReconcile}
                disabled={currentData.length === 0 || !paymentFile}
                className="w-full px-4 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 text-sm font-medium disabled:opacity-40"
              >
                开始对账 →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== 账单对账 ========== */}
      {activeTab === "bill" && (
        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-6 max-w-5xl mx-auto">
            {/* 账单列表 */}
            <div className="bg-white rounded-xl shadow">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-gray-800">📄 平台账单</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    导入各平台月末账单，自动解析佣金/扣点/补贴
                  </p>
                </div>
                <button
                  onClick={handleImportBill}
                  disabled={!desktopReady}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-40"
                >
                  + 导入账单
                </button>
              </div>
              {billRecords.length === 0 ? (
                <div className="p-12 text-center text-gray-400">
                  <div className="text-4xl mb-3">📋</div>
                  <div className="text-sm">暂无账单</div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {[
                          "平台",
                          "文件名",
                          "账期",
                          "账单金额",
                          "订单数",
                          "佣金",
                          "技术服务费",
                          "补贴",
                          "净收款",
                          "操作",
                        ].map((h) => (
                          <th
                            key={h}
                            className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {billRecords.map((b, i) => (
                        <tr key={i} className="border-t hover:bg-gray-50">
                          <td className="px-4 py-2.5">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium ${color(b.platform)}`}
                            >
                              {b.platform}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[120px] truncate">
                            {b.fileName}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-500">
                            {b.date}
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium">
                            ¥{b.totalAmount.toFixed(0)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-500">
                            {b.orderCount}
                          </td>
                          <td className="px-4 py-2.5 text-right text-red-600">
                            -¥{b.commission.toFixed(0)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-orange-600">
                            -¥{b.techFee.toFixed(0)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-green-600">
                            +¥{b.subsidy.toFixed(0)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold text-blue-700">
                            ¥{b.netAmount.toFixed(0)}
                          </td>
                          <td className="px-4 py-2.5">
                            <button
                              onClick={() => setShowBillDetail(b)}
                              className="text-xs text-blue-600 hover:underline mr-2"
                            >
                              查看
                            </button>
                            <button
                              onClick={() => handleRemoveBill(i)}
                              className="text-xs text-red-500 hover:underline"
                            >
                              移除
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {billRecords.length > 1 && (
                      <tfoot className="bg-gray-50 font-bold">
                        <tr>
                          <td
                            className="px-4 py-2.5 text-xs text-gray-500"
                            colSpan={3}
                          >
                            合计 ({billRecords.length}个平台)
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            ¥
                            {billRecords
                              .reduce((s, b) => s + b.totalAmount, 0)
                              .toFixed(0)}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {billRecords.reduce((s, b) => s + b.orderCount, 0)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-red-600">
                            -¥
                            {billRecords
                              .reduce((s, b) => s + b.commission, 0)
                              .toFixed(0)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-orange-600">
                            -¥
                            {billRecords
                              .reduce((s, b) => s + b.techFee, 0)
                              .toFixed(0)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-green-600">
                            +¥
                            {billRecords
                              .reduce((s, b) => s + b.subsidy, 0)
                              .toFixed(0)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-blue-700">
                            ¥
                            {billRecords
                              .reduce((s, b) => s + b.netAmount, 0)
                              .toFixed(0)}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>

            {/* 佣金计提 */}
            {billRecords.length > 0 && (
              <div className="bg-white rounded-xl shadow">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-800">
                      📊 佣金自动计提表
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      根据账单自动生成佣金/扣点计提数据
                      {commissionDetails.length > 0 && (
                        <span className="ml-2 text-green-600">
                          ✓ 已导入 {commissionDetails.length} 条佣金明细
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleGenerateAccrual}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
                    >
                      🔄 重新生成
                    </button>
                    <button
                      onClick={handleImportCommissionDetails}
                      disabled={!desktopReady}
                      className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm disabled:opacity-40"
                    >
                      📋 导入佣金明细
                    </button>
                    {accrualData.length > 0 && (
                      <button
                        onClick={async () => {
                          try {
                            const result = await saveDataFile(
                              `佣金计提表_${new Date().toISOString().slice(0, 7)}.xlsx`,
                            );
                            if (!result.canceled && result.filePath)
                              await exportToExcel(accrualData, result.filePath);
                          } catch (error) {
                            reportError("导出佣金计提表", error);
                          }
                        }}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                      >
                        📥 导出Excel
                      </button>
                    )}
                  </div>
                </div>
                {accrualData.length > 0 ? (
                  <div className="overflow-x-auto max-h-80">
                    <table className="w-full text-sm">
                      <thead className="bg-purple-50">
                        <tr>
                          {accrualData[0].map((h: string, i: number) => (
                            <th
                              key={i}
                              className="px-3 py-2 text-left text-xs text-purple-700 font-medium whitespace-nowrap"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {accrualData.slice(1).map((row: any[], i: number) => (
                          <tr
                            key={i}
                            className={`border-t ${i === accrualData.length - 2 ? "bg-yellow-50 font-medium" : ""}`}
                          >
                            {row.map((cell: any, j: number) => (
                              <td
                                key={j}
                                className={`px-3 py-2 text-xs ${j >= 2 && j <= 7 && typeof cell === "string" && cell.startsWith("-") ? "text-red-600" : ""}`}
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-8 text-center text-gray-400 text-sm">
                    点击「重新生成」
                  </div>
                )}
              </div>
            )}

            {/* 退款损失还原 */}
            <div className="bg-white rounded-xl shadow">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-gray-800">
                    🔴 退款损失还原
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {commissionDetails.length > 0
                      ? "已导入佣金明细，可精确计算退款损失"
                      : "导入佣金明细文件后可精确计算损失，否则使用估算"}
                  </p>
                </div>
                <button
                  onClick={handleImportRefund}
                  disabled={!desktopReady}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm disabled:opacity-40"
                >
                  + 导入退款单
                </button>
              </div>
              <div className="p-4">
                {refundRecords.length === 0 ? (
                  <div className="text-center text-gray-400 py-6 text-sm">
                    导入退款单后自动计算佣金损失
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex gap-3 text-xs">
                      <span className="bg-red-50 px-3 py-1.5 rounded">
                        退款笔数: <strong>{refundRecords.length}</strong>
                      </span>
                      <span className="bg-red-50 px-3 py-1.5 rounded">
                        退款总额:{" "}
                        <strong>
                          ¥
                          {refundRecords
                            .reduce((s, r) => s + r.refundAmount, 0)
                            .toFixed(2)}
                        </strong>
                      </span>
                      <span className="bg-orange-50 px-3 py-1.5 rounded">
                        预估佣金损失:{" "}
                        <strong>
                          ¥
                          {(
                            refundRecords.reduce(
                              (s, r) => s + r.refundAmount,
                              0,
                            ) *
                            (billRecords.length > 0
                              ? billRecords.reduce(
                                  (s, b) => s + b.commission,
                                  0,
                                ) /
                                Math.max(
                                  1,
                                  billRecords.reduce(
                                    (s, b) => s + b.totalAmount,
                                    0,
                                  ),
                                )
                              : 0.05)
                          ).toFixed(2)}
                        </strong>
                      </span>
                    </div>
                    {commissionDetails.length > 0 && refundRecords.length > 0 && (
                      <div className="bg-orange-50 px-3 py-1.5 rounded text-xs">
                        💡 已匹配 {commissionDetails.length} 条佣金明细，将用于精确计算
                      </div>
                    )}
                    {commissionDetails.length === 0 && refundRecords.length > 0 && (
                      <div className="bg-gray-100 px-3 py-1.5 rounded text-xs text-gray-600">
                        ⚠️ 未导入佣金明细，使用均摊估算
                      </div>
                    )}
                    <div className="flex gap-3">
                      <button
                        onClick={handleGenerateRefundLoss}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
                      >
                        📊 生成退款损失表
                      </button>
                      {refundLossData.length > 0 && (
                        <button
                          onClick={handleExportRefundLoss}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                        >
                          📥 导出
                        </button>
                      )}
                    </div>
                    {refundLossData.length > 0 && (
                      <div className="mt-3 overflow-x-auto max-h-60 border rounded">
                        <table className="w-full text-xs">
                          <thead className="bg-red-50">
                            <tr>
                              {refundLossData[0].map((h: string, i: number) => (
                                <th
                                  key={i}
                                  className="px-3 py-2 text-left text-red-700"
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {refundLossData
                              .slice(1)
                              .map((row: any[], i: number) => (
                                <tr key={i} className="border-t">
                                  {row.map((cell: any, j: number) => (
                                    <td
                                      key={j}
                                      className={`px-3 py-1.5 ${j >= 3 && j <= 5 ? "text-right text-red-600 font-medium" : ""}`}
                                    >
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== 销售排行（按编码） ========== */}
      {activeTab === "salesRank" && (
        <div className="flex-1 overflow-auto p-4 md:p-6">
          <div className="max-w-[1400px] mx-auto space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <h2 className="font-semibold text-gray-800 text-lg">
                    按编码销售排行总榜
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    以规格编码 / 商品编码汇总销量与实收，分析什么规格更好卖（需先在「经营分析」生成报表）
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!opReport}
                    onClick={() => {
                      if (!opReport) return;
                      setActiveTab("operating");
                      handleShowOperatingView("salesRankSku");
                    }}
                    className="px-3 py-1.5 rounded-lg text-sm bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40"
                  >
                    规格销售榜
                  </button>
                  <button
                    type="button"
                    disabled={!opReport}
                    onClick={() => {
                      if (!opReport) return;
                      setActiveTab("operating");
                      handleShowOperatingView("salesRankSpu");
                    }}
                    className="px-3 py-1.5 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
                  >
                    编码/SPU榜
                  </button>
                </div>
              </div>

              {!opReport ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-sm px-4 py-3">
                  请先切换到「经营分析」导入订单（及商品资料）并点击「生成经营报表」，再查看销售排行。
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div className="rounded-lg bg-slate-50 border p-3">
                      <div className="text-xs text-slate-500">订单数</div>
                      <div className="text-xl font-bold">{opReport.summary.orderCount}</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 border p-3">
                      <div className="text-xs text-slate-500">商品总价 GMV</div>
                      <div className="text-xl font-bold">
                        ¥{opReport.summary.goodsTotal.toFixed(0)}
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-50 border p-3">
                      <div className="text-xs text-slate-500">规格数(销售榜)</div>
                      <div className="text-xl font-bold">
                        {Math.max(0, (opReport.salesRankSkuTable?.length || 1) - 1)}
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-50 border p-3">
                      <div className="text-xs text-slate-500">商品编码数</div>
                      <div className="text-xl font-bold">
                        {Math.max(0, (opReport.salesRankSpuTable?.length || 1) - 1)}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => {
                        const t = opReport.salesRankSkuTable || [];
                        setCurrentData(t);
                        setCurrentHeaders(t[0] || []);
                        setIsMerged(false);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs border bg-violet-50 border-violet-200 text-violet-900"
                    >
                      显示规格编码榜
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const t = opReport.salesRankSpuTable || [];
                        setCurrentData(t);
                        setCurrentHeaders(t[0] || []);
                        setIsMerged(false);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs border bg-indigo-50 border-indigo-200 text-indigo-900"
                    >
                      显示商品编码榜
                    </button>
                  </div>

                  <div className="border border-slate-200 rounded-xl bg-white overflow-x-clip">
                    <DataTable
                      data={
                        currentData.length > 0 &&
                        String(currentData[0]?.[0] || "").includes("排名")
                          ? currentData
                          : opReport.salesRankSkuTable || []
                      }
                      headers={
                        currentData.length > 0 &&
                        String(currentData[0]?.[0] || "").includes("排名")
                          ? currentHeaders
                          : (opReport.salesRankSkuTable || [])[0] || []
                      }
                      stickyCols={3}
                      maxHeightClass="max-h-full"
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    默认按销量（件数）降序；可点列头排序。横向滚动时前几列已冻结，方便对照编码/品名。
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========== 月度汇总Tab ========== */}
      {activeTab === "monthly" && (
        <MonthlySummary
          billRecords={billRecords}
          refundRecords={refundRecords}
          onImportBill={handleImportBill}
          desktopReady={desktopReady}
        />
      )}

      {/* ========== 数据处理Tab ========== */}
      {activeTab === "data" && (
        <>
          <Toolbar
            onImport={handleImportOrders}
            onShowExportPanel={handleExportWithPanel}
            onMerge={handleMergeWithPreview}
            onDeduplicate={handleDeduplicateWithConfirm}
            onCleanEmpty={handleCleanEmptyWithConfirm}
            onTrimWhitespace={handleTrimWhitespaceWithConfirm}
            onClear={handleClear}
            onUndo={handleUndo}
            onStandardizeDate={handleStandardizeDateWithConfirm}
            onFillEmpty={handleFillEmptyWithConfirm}
            onSelectColumns={handleSelectColumnsWithConfirm}
            onOneClickClean={handleOneClickCleanWithConfirm}
            hasData={currentData.length > 0}
            canMerge={files.length >= 2}
            headers={currentHeaders}
            canUndo={historyIndex > 0}
            desktopReady={desktopReady}
          />
          <div className="flex-1 flex overflow-hidden">
            <FileSidebar
              files={files}
              selectedIndex={selectedFileIndex}
              onSelect={handleFileSelect}
              onRemove={handleRemoveFile}
              isMerged={isMerged}
            />
            <DataTable data={filteredData} headers={currentHeaders} />
          </div>
          <StatusBar
            rowCount={currentData.length - 1}
            filteredRowCount={filteredData.length - 1}
            fileCount={files.length}
            selectedFile={
              selectedFileIndex !== null ? files[selectedFileIndex]?.name : null
            }
            isMerged={isMerged}
            isFiltered={searchText.trim().length > 0}
          />
        </>
      )}

      {/* 账单详情弹窗 */}
      {showBillDetail && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowBillDetail(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-[90vw] max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800">
                  {showBillDetail.fileName}
                </h3>
                <p className="text-xs text-gray-500">
                  {showBillDetail.platform} · {showBillDetail.date}
                </p>
              </div>
              <button
                onClick={() => setShowBillDetail(null)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <div className="mb-4 flex gap-4 text-sm flex-wrap">
                <div className="bg-gray-50 rounded-lg px-4 py-2 text-center">
                  <div className="text-xs text-gray-500">账单金额</div>
                  <div className="font-bold text-lg">
                    ¥{showBillDetail.totalAmount.toFixed(2)}
                  </div>
                </div>
                <div className="bg-red-50 rounded-lg px-4 py-2 text-center">
                  <div className="text-xs text-gray-500">佣金</div>
                  <div className="font-bold text-lg text-red-600">
                    -¥{showBillDetail.commission.toFixed(2)}
                  </div>
                </div>
                <div className="bg-orange-50 rounded-lg px-4 py-2 text-center">
                  <div className="text-xs text-gray-500">技术服务费</div>
                  <div className="font-bold text-lg text-orange-600">
                    -¥{showBillDetail.techFee.toFixed(2)}
                  </div>
                </div>
                <div className="bg-green-50 rounded-lg px-4 py-2 text-center">
                  <div className="text-xs text-gray-500">补贴/返点</div>
                  <div className="font-bold text-lg text-green-600">
                    +¥{showBillDetail.subsidy.toFixed(2)}
                  </div>
                </div>
                <div className="bg-blue-50 rounded-lg px-4 py-2 text-center">
                  <div className="text-xs text-gray-500">净收款</div>
                  <div className="font-bold text-lg text-blue-700">
                    ¥{showBillDetail.netAmount.toFixed(2)}
                  </div>
                </div>
              </div>
              <DataTable
                data={showBillDetail.rawData}
                headers={showBillDetail.rawData[0] || []}
              />
            </div>
          </div>
        </div>
      )}
      <Toast toasts={toasts} onDismiss={dismissToast} />
      <ConfirmDialog
        open={confirmDialog !== null}
        title={confirmDialog?.title || ""}
        message={confirmDialog?.message || ""}
        confirmLabel={confirmDialog?.confirmLabel}
        confirmClassName={confirmDialog?.confirmClassName}
        disabled={confirmDialog?.disabled}
        onConfirm={confirmDialog?.onConfirm || (() => {})}
        cancelLabel={confirmDialog?.cancelLabel}
        onCancel={() => {
          try {
            confirmDialog?.onCancel?.();
          } finally {
            setConfirmDialog(null);
          }
        }}
        actions={confirmDialog?.actions}
      />
      <ExportPanel
        open={showExportPanel}
        onExport={handleDoExport}
        onCancel={() => setShowExportPanel(false)}
      />
      {mergePreview && (
        <MergePreview
          files={files}
          unifiedHeaders={mergePreview.unifiedHeaders}
          columnInfo={mergePreview.columnInfo}
          totalRows={mergePreview.totalRows}
          onConfirm={handleConfirmMerge}
          onCancel={() => setMergePreview(null)}
        />
      )}
    </div>
  );
}

export default App;
