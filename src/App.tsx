import { useState, useCallback, useEffect } from "react";
import DataTable from "./components/DataTable";
import Toast, { ToastMessage } from "./components/Toast";
import ConfirmDialog from "./components/ConfirmDialog";
import OpViewNav from "./components/OpViewNav";
import OperatingDashboard from "./components/OperatingDashboard";
import OperatingQuickBar from "./components/OperatingQuickBar";
import OperatingSettingsPanel from "./components/OperatingSettingsPanel";
import MappingTab from "./components/MappingTab";
import ReconcileTab from "./components/ReconcileTab";
import BillTab from "./components/BillTab";
import SalesRankTab from "./components/SalesRankTab";
import ZtcTab from "./components/ZtcTab";
import ProfitCalcTab from "./components/ProfitCalcTab";
import ExpressReconcileTab from "./components/ExpressReconcileTab";
import AfterSaleTab from "./components/AfterSaleTab";
import AppNav from "./components/AppNav";
import OperatingImportPanel from "./components/OperatingImportPanel";
import MonthlySummary from "./components/MonthlySummary";
import {
  FileData,
  processFile,
  exportWorkbook,
  xlsxOutputToArrayBuffer,
} from "./utils/excel";
import {
  hasElectronAPI,
  openDataFiles,
  saveDataFile,
  readLocalFile,
  writeLocalFile,
} from "./utils/desktop";
import {
  BillRecord,
  RefundOrder,
  SKUMapping,
  CommissionDetail,
} from "./services/businessLogic";
import {
  AdDay,
  AdProduct,
  CostSettings,
  ShopFeeOverride,
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
  productMasterPendingRowIndexes,
  productsToSkuMappings,
  mergeProductMasters,
  formatBossOnePagerText,
  guessShopNameFromFile,
  ingestForOperating,
  billRecordFromPdd,
  normalizeShopName,
  sourceKindLabel,
} from "./services/pddBusiness";
import {
  cloneDefaultCostSettings,
  loadOpCostSettings,
  saveOpCostSettings,
  normalizeCostSettings,
  filterOrderTable,
  type OrderTableFilter,
} from "./services/opCostSettings";

import {
  PRODUCT_IMPORT_MODE_KEY,
  loadProductMasterMeta,
  saveProductMasterMeta,
  countPendingCostProducts,
  analyzeProductMasterState,
  type ProductMasterMeta,
} from "./services/productMasterMeta";
import OperatingActionBar from "./components/OperatingActionBar";
import { useBillRefundHandlers } from "./hooks/useBillRefundHandlers";
import { useMappingReconcileHandlers } from "./hooks/useMappingReconcileHandlers";
import type { AppTab } from "./types/appTab";
import {
  formatOpBillPeriod,
  formatOpOrdersPeriod,
  uniqueShopNames,
} from "./utils/opPeriod";

type Tab = AppTab;

function App() {
  const desktopReady = hasElectronAPI();
  const [currentData, setCurrentData] = useState<any[][]>([]);
  const [currentHeaders, setCurrentHeaders] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("operating");

  const [skuMappings, setSkuMappings] = useState<SKUMapping[]>([]);
  const [mappingFile, setMappingFile] = useState<FileData | null>(null);
  const [paymentFile, setPaymentFile] = useState<FileData | null>(null);
  const [reconcileResult, setReconcileResult] = useState<any[][]>([]);
  const [mappingResult, setMappingResult] = useState<any[][]>([]);
  const [pendingOpAction, setPendingOpAction] = useState<null | "build" | "export_missing" | "jump_unmatched" | "jump_unmatched_only">(null);
  const [billRecords, setBillRecords] = useState<BillRecord[]>([]);
  const [showBillDetail, setShowBillDetail] = useState<BillRecord | null>(null);

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
  const [opAdProducts, setOpAdProducts] = useState<AdProduct[]>([]);
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
    | "anomalyPartial"
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
  /** 订单毛利快捷筛选 */
  const [orderTableFilter, setOrderTableFilter] =
    useState<OrderTableFilter>("all");
  /** 经营参数默认折叠，减少干扰；点「填写品牌扣点」会展开 */
  const [opSettingsOpen, setOpSettingsOpen] = useState(false);
  const [opSettingsHighlight, setOpSettingsHighlight] = useState<
    null | "brand"
  >(null);

  useEffect(() => {
    setOpSettingsLoaded(true);
  }, []);

  useEffect(() => {
    if (!opSettingsLoaded) return;
    saveOpCostSettings(opCostSettings);
  }, [opCostSettings, opSettingsLoaded]);

  useEffect(() => {
    saveProductMasterMeta(productMasterMeta);
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

  const showToast = useCallback((message: string, type: ToastMessage["type"] = "success") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // 佣金计提
  const [accrualData, setAccrualData] = useState<any[][]>([]);

  const saveHistory = useCallback((data: any[][], headers: string[]) => {
    setCurrentData(data);
    setCurrentHeaders(headers);
  }, []);

  const reportError = useCallback((action: string, error: unknown) => {
    const message = error instanceof Error ? error.message : `${action}失败`;
    console.error(`${action}失败:`, error);
    setRuntimeNotice(`${action}失败：${message}`);
  }, []);

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
        productPending: 0,
        productTotal: 0,
        ads: 0,
        adProducts: 0,
        unknown: 0,
        skippedOrders: 0,
        names: [] as string[],
      };
      // 本地工作副本，避免循环内 setState 竞态 + 支持冲突选择
      let localOrders = opOrders.slice();
      let localProducts = opProducts.slice();
      let localBill = opBillLines.slice();
      let localAds = opAds.slice();
      let localAdProducts = opAdProducts.slice();

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
            const pending = countPendingCostProducts(localProducts);
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
            stats.productPending = pending;
            stats.productTotal = localProducts.length;
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
          } else if (kind === "ad_product") {
            const stamped = (ingested.adProducts || []).map((a) => ({
              ...a,
              shopName: shop,
            }));
            const map = new Map(
              localAdProducts
                .filter((a) => normalizeShopName(a.shopName) === shop)
                .map((a) => [a.productId || `name:${a.productName}`, a]),
            );
            const others = localAdProducts.filter(
              (a) => normalizeShopName(a.shopName) !== shop,
            );
            for (const a of stamped) {
              map.set(a.productId || `name:${a.productName}`, a);
            }
            localAdProducts = [...others, ...Array.from(map.values())];
            pushOpSource(kind, fileData.name, stamped.length, shop);
            stats.adProducts += stamped.length;
          } else {
            stats.unknown += 1;
            showToast(
              `无法识别：${fileData.name}（需含订单/账务/商品资料/推广分天/商品推广汇总）`,
              "warning",
            );
          }
        }
        setOpOrders(localOrders);
        setOpProducts(localProducts);
        setOpBillLines(localBill);
        setOpAds(localAds);
        setOpAdProducts(localAdProducts);
        setOpReport(null);
        const parts = [
          stats.orders ? `订单${stats.orders}单` : "",
          stats.bill ? `账务${stats.bill}行` : "",
          stats.products
            ? `商品${stats.products}规格(${productImportMode === "merge" ? "合并" : "替换"})`
            : "",
          stats.ads ? `推广分天${stats.ads}天` : "",
          stats.adProducts ? `商品推广${stats.adProducts}个` : "",
          stats.skippedOrders ? `跳过订单文件` : "",
          stats.unknown ? `未识别${stats.unknown}个` : "",
        ].filter(Boolean);
        showToast(
          parts.length
            ? `已导入 ${filePaths.length} 个文件：${parts.join(" · ")}`
            : "未导入有效数据",
          parts.length && !stats.unknown ? "success" : "warning",
        );
        if (stats.products > 0) {
          const pending = stats.productPending;
          const total = stats.productTotal || stats.products;
          const st = analyzeProductMasterState(localProducts);
          let orderMissing = 0;
          try {
            if (localOrders.length > 0) {
              orderMissing = buildProductMasterFromOrders(
                localOrders,
                localProducts,
                "missing_cost",
              ).length;
            }
          } catch {
            orderMissing = 0;
          }
          const filled = st.withCost;
          setConfirmDialog({
            title: "商品资料已回导",
            message:
              pending > 0 || orderMissing > 0
                ? `共 ${total} 个规格：已有成本 ${filled} · 资料仍待填 ${pending} · 订单侧仍缺成本 ${orderMissing}。完整率 ${st.fillRate}%。\n可一键跳转待补 SKU，或导出仍缺规格。`
                : `共 ${total} 个规格，成本已齐全（完整率 100%）。可直接生成经营报表。`,
            onConfirm: () => setConfirmDialog(null),
            cancelLabel: "关闭",
            confirmLabel: pending > 0 || orderMissing > 0 ? "稍后" : "好的",
            actions: [
              ...(pending > 0 || orderMissing > 0
                ? [
                    {
                      label: "一键跳转待补SKU",
                      primary: true,
                      className:
                        "px-3 py-2 text-white rounded-lg text-sm bg-violet-600 hover:bg-violet-700",
                      onClick: () => {
                        setConfirmDialog(null);
                        setActiveTab("operating");
                        setPendingOpAction("jump_unmatched");
                      },
                    },
                    {
                      label: "导出仍缺规格",
                      className:
                        "px-3 py-2 text-white rounded-lg text-sm bg-amber-500 hover:bg-amber-600",
                      onClick: () => {
                        setConfirmDialog(null);
                        setActiveTab("operating");
                        setPendingOpAction("export_missing");
                      },
                    },
                  ]
                : []),
              {
                label: "生成经营报表",
                primary: !(pending > 0 || orderMissing > 0),
                className:
                  "px-3 py-2 text-white rounded-lg text-sm bg-blue-600 hover:bg-blue-700",
                onClick: () => {
                  setConfirmDialog(null);
                  setActiveTab("operating");
                  setPendingOpAction("build");
                },
              },
            ],
          });
        }
      } catch (error) {
        reportError("经营分析导入", error);
      }
    },
    [
      opOrders,
      opProducts,
      opBillLines,
      opAds,
      opAdProducts,
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
      setOpCostSettings(
        normalizeCostSettings({
          ...raw,
          expressRules: rules,
          shopFeeOverrides: overrides,
        }),
      );
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
        ["部分退比对", opReport.anomalyPartialRefundTable || []],
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
        await writeLocalFile(result.filePath, xlsxOutputToArrayBuffer(out as any));
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

  const handleBuildOperatingReport = useCallback((nextView: typeof opView = "summary") => {
    if (
      opOrders.length === 0 &&
      opBillLines.length === 0 &&
      opProducts.length === 0 &&
      opAds.length === 0 &&
      opAdProducts.length === 0
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
      opAdProducts,
    );
    setOpReport(report);
    const view = nextView || "summary";
    setOpView(view);
    if (view === "summary") {
      setCurrentData(report.summaryTable);
      setCurrentHeaders(report.summaryTable[0] || []);
    } else if (view === "unmatched") {
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
        ...report.unmatchedSkus.map((u) => [
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
      const table =
        report.unmatchedTable && report.unmatchedTable.length
          ? report.unmatchedTable
          : unmatchedFallback;
      setCurrentData(table);
      setCurrentHeaders(table[0] || []);
    } else {
      setCurrentData(report.summaryTable);
      setCurrentHeaders(report.summaryTable[0] || []);
    }
    setOrderTableFilter("all");
    const partialN = report.summary.partialRefundCount || 0;
    const fullN = report.summary.fullRefundCount || 0;
    const pendingSku = report.unmatchedSkus?.length || 0;
    const bp = opCostSettings.brandPointPct || 0;
    const tech = report.summary.techFee || 0;
    let msg = `报表已生成：毛利(扣广告) ¥${report.summary.estimatedProfitAfterAd.toFixed(2)} | 确认收入 ¥${(report.summary.confirmedRevenue ?? 0).toFixed(0)} | 全额退${fullN}/部分退${partialN} | 待补SKU ${pendingSku}`;
    if (bp <= 0 && tech > 0) {
      msg += " | 平台费已扣、品牌扣点未填(可选)";
    } else if (bp > 0) {
      msg += ` | 品牌扣点${bp}%`;
    }
    showToast(msg, "success");
    // 仅主流程「生成报表」(summary)时弹引导；指定其它视图跳转时不打断
    if (
      nextView === "summary" &&
      (pendingSku > 0 || (report.summary.costUnmatchedOrders || 0) > 0)
    ) {
      const costUn = report.summary.costUnmatchedOrders || 0;
      const costAll = report.summary.orderCount || 0;
      const rate =
        costAll > 0
          ? Math.round(((costAll - costUn) / costAll) * 1000) / 10
          : 100;
      setConfirmDialog({
        title: "报表已生成 · 成本待补",
        message:
          `待补SKU ${pendingSku} 个 · 未匹配成本订单 ${costUn}/${costAll}（匹配率 ${rate}%）。\n` +
          "建议：导出待补商品资料填成本后回导，再重新生成报表。",
        onConfirm: () => setConfirmDialog(null),
        cancelLabel: "稍后",
        confirmLabel: "知道了",
        actions: [
          {
            label: "查看待补SKU",
            primary: true,
            className:
              "px-3 py-2 text-white rounded-lg text-sm bg-violet-600 hover:bg-violet-700",
            onClick: () => {
              setConfirmDialog(null);
              setPendingOpAction("jump_unmatched_only");
            },
          },
          {
            label: "导出待补商品资料",
            className:
              "px-3 py-2 text-white rounded-lg text-sm bg-amber-500 hover:bg-amber-600",
            onClick: () => {
              setConfirmDialog(null);
              setPendingOpAction("export_missing");
            },
          },
        ],
      });
    }
  }, [opOrders, opBillLines, opProducts, opAds, opAdProducts, opCostSettings, showToast]);

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
        anomalyPartial: opReport.anomalyPartialRefundTable || [],
      };
      let table = tableMap[view] || opReport.summaryTable;
      if (view === "orders" && orderTableFilter !== "all") {
        table = filterOrderTable(opReport.orderTable, orderTableFilter);
      }
      if (view !== "orders") setOrderTableFilter("all");
      setCurrentData(table);
      setCurrentHeaders(table[0] || []);
    },
    [opReport, opRankSort, applyRankSort, orderTableFilter],
  );

  const showFilteredOrders = useCallback(
    (filter: OrderTableFilter) => {
      if (!opReport?.orderTable?.length) {
        showToast("请先生成经营报表", "warning");
        return;
      }
      setOrderTableFilter(filter);
      setOpView("orders");
      const table = filterOrderTable(opReport.orderTable, filter);
      setCurrentData(table);
      setCurrentHeaders(table[0] || []);
      const n = Math.max(0, table.length - 1);
      const label =
        filter === "partial"
          ? "部分退"
          : filter === "full"
            ? "全额退"
            : filter === "neg"
              ? "负毛利"
              : filter === "unmatched"
                ? "未匹配成本"
                : filter === "ship_loss"
                  ? "有损耗运费"
                  : "全部订单";
      showToast(`${label}：${n} 单`, "success");
    },
    [opReport, showToast],
  );

  const openBrandPointSettings = useCallback(() => {
    setOpSettingsOpen(true);
    setOpSettingsHighlight("brand");
    window.setTimeout(() => {
      const el = document.getElementById("op-settings-brand");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      const input = document.getElementById(
        "op-brand-point-input",
      ) as HTMLInputElement | null;
      input?.focus();
    }, 80);
  }, []);

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
        const importSheet = productMasterImportTable(rows);
        const workSheet = productMasterWorkTable(rows);
        if (!importSheet.length || !importSheet[0]?.length) {
          showToast("生成商品资料表头失败，请重试", "error");
          return;
        }
        const guide: any[][] = [
          ["说明", "内容"],
          ["用途", "本文件用于填写成本后回传导入店财通"],
          [
            "步骤",
            "①在「商品资料」表填写「参考成本价/包材成本价/重量」→ ②保存 → ③回到店财通导入该文件",
          ],
          [
            "注意",
            "「规格编码」优先保留；「对照明细」仅供参考，导入时只读「商品资料」表",
          ],
          ["生成规格数", rows.length],
          ["待填成本数", rows.filter((r) => !r.hasCost).length],
          ["已有成本数", rows.filter((r) => r.hasCost).length],
          ["来源订单数", opOrders.length],
          ["导出时间", new Date().toLocaleString("zh-CN")],
        ];
        const pendingIdx = productMasterPendingRowIndexes(rows);
        const pendingOnlyRows = rows.filter((r) => !r.hasCost);
        const pendingSheet = productMasterImportTable(pendingOnlyRows);
        await exportWorkbook(
          [
            {
              name: "待填成本",
              data: pendingSheet.length > 1 ? pendingSheet : [["填写标记", "说明"], ["", "无待填项"]],
              highlightRowIndexes: pendingOnlyRows.map((_, i) => i),
            },
            {
              name: "商品资料",
              data: importSheet,
              highlightRowIndexes: pendingIdx,
            },
            { name: "对照明细", data: workSheet },
            { name: "使用说明", data: guide },
          ],
          result.filePath,
        );
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
          pending > 0
            ? `已导出（${tag}）${rows.length} 规格 · 待填 ${pending} 已置顶/独立成表「待填成本」。填完「参考成本价」后回导（步骤③）`
            : `已导出（${tag}）${rows.length} 规格，成本已齐全。可回导或直接生成报表`,
          "success",
        );
      } catch (error) {
        reportError("导出商品资料", error);
      }
    },
    [opOrders, opProducts, reportError, showToast],
  );

  useEffect(() => {
    if (pendingOpAction == null) return;
    const action = pendingOpAction;
    setPendingOpAction(null);
    if (action === "build") {
      setTimeout(() => {
        try { handleBuildOperatingReport(); } catch { /* ignore */ }
      }, 0);
      return;
    }
    if (action === "export_missing") {
      setTimeout(() => { void handleExportProductMaster("missing_cost"); }, 0);
      return;
    }
    if (action === "jump_unmatched") {
      setTimeout(() => {
        try {
          handleBuildOperatingReport("unmatched");
        } catch { /* ignore */ }
      }, 0);
      return;
    }
    if (action === "jump_unmatched_only") {
      setTimeout(() => {
        try {
          // 报表已存在：直接切到待补视图，避免二次弹窗
          handleShowOperatingView("unmatched" as any);
        } catch { /* ignore */ }
      }, 0);
    }
  }, [pendingOpAction, handleBuildOperatingReport, handleExportProductMaster, handleShowOperatingView]);

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
    setOpAdProducts([]);
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
        ["部分退比对", opReport.anomalyPartialRefundTable || []],
      ];
      for (const [name, rows] of sheets) {
        if (!rows || rows.length === 0) continue;
        const ws = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
      }
      const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        await writeLocalFile(result.filePath, xlsxOutputToArrayBuffer(out as any));
      showToast('经营分析 Excel 已导出', 'success');
    } catch (error) {
      reportError('导出经营分析', error);
    }
  }, [opReport, reportError, showToast]);


  
  const handleSyncBillsFromOperating = useCallback(() => {
    if (opBillLines.length === 0) {
      showToast("请先在经营分析导入账务明细", "warning");
      return;
    }
    const record = billRecordFromPdd(
      {
        name: "经营分析账务",
        path: "",
        headers: [],
        data: [],
      },
      opBillLines,
    );
    setBillRecords((prev) => {
      const rest = prev.filter((b) => b.fileName !== "经营分析账务");
      return [...rest, record];
    });
    showToast(
      `已从经营分析同步账务：${opBillLines.length} 行 · ${record.date} · ${record.orderCount} 单`,
      "success",
    );
  }, [opBillLines, showToast]);

const {
    handleImportMapping,
    handleSyncMappingsFromProducts,
    handleApplyMapping,
    handleImportPayment,
    handleReconcile,
  } = useMappingReconcileHandlers({
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
  });

  const {
    handleImportBill,
    handleImportCommissionDetails,
    handleGenerateAccrual,
    handleRemoveBill,
    handleImportRefund,
    handleGenerateRefundLoss,
    handleExportRefundLoss,
  } = useBillRefundHandlers({
    billRecords,
    setBillRecords,
    setOpBillLines,
    commissionDetails,
    setCommissionDetails,
    refundRecords,
    setRefundRecords,
    setRefundFile,
    refundLossData,
    setRefundLossData,
    setAccrualData,
    setCurrentData,
    setCurrentHeaders,
    saveHistory,
    showToast,
    reportError,
  });

  return (
    <div className="app-shell">
      {runtimeNotice && (
        <div
          className={`px-4 py-2 text-sm border-b ${desktopReady ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-800 border-amber-200"}`}
        >
          {runtimeNotice}
        </div>
      )}

      <AppNav activeTab={activeTab} onChange={setActiveTab} />



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
              <OperatingImportPanel
                opShopLabel={opShopLabel}
                setOpShopLabel={setOpShopLabel}
                opDragOver={opDragOver}
                setOpDragOver={setOpDragOver}
                onDrop={handleOperatingDrop}
                onImport={handleOperatingImport}
                desktopReady={desktopReady}
                opOrders={opOrders}
                opProducts={opProducts}
                opBillLines={opBillLines}
                opAds={opAds}
                opAdProducts={opAdProducts}
                opReport={opReport}
                opSources={opSources}
                opCostSettings={opCostSettings}
                setOpCostSettings={setOpCostSettings}
                productImportMode={productImportMode}
                setProductImportMode={setProductImportMode}
                productMasterMeta={productMasterMeta}
                onExportProductMaster={handleExportProductMaster}
                onLoadProductMasterFromOrders={handleLoadProductMasterFromOrders}
                onClearOperating={handleClearOperating}
                onBuildReport={() => handleBuildOperatingReport()}
                onExportOperating={handleExportOperating}
                onExportCostSettings={handleExportCostSettings}
                onImportCostSettings={handleImportCostSettings}
                onInvalidateReport={() => setOpReport(null)}
                sourceKindLabel={sourceKindLabel}
              />

              <OperatingSettingsPanel
                settings={opCostSettings}
                setSettings={setOpCostSettings}
                open={opSettingsOpen}
                setOpen={setOpSettingsOpen}
                highlight={opSettingsHighlight}
                setHighlight={setOpSettingsHighlight}
                onOpenBrandPoint={openBrandPointSettings}
                onReset={handleResetOpCostSettings}
                onApplyTemplate={handleApplyCostTemplate}
                onAddShopOverride={handleAddShopFeeOverride}
                onUpdateShopOverride={handleUpdateShopFeeOverride}
                onRemoveShopOverride={handleRemoveShopFeeOverride}
                onSyncShops={handleSyncShopsToOverrides}
                onUpdateExpressRule={updateExpressRule}
              />
              <OperatingActionBar
                opReport={opReport}
                opOrdersLen={opOrders.length}
                productMasterMeta={productMasterMeta}
                onBuildReport={() => handleBuildOperatingReport()}
                onExportOperating={handleExportOperating}
                onExportAnomalies={handleExportAnomalies}
                onCopyUnmatchedSkus={handleCopyUnmatchedSkus}
                onCopyBossOnePager={handleCopyBossOnePager}
                onCopyBossOnePagerTsv={handleCopyBossOnePagerTsv}
                onExportProductMaster={(mode) => void handleExportProductMaster(mode)}
                onExportCostSettings={handleExportCostSettings}
                onImportCostSettings={handleImportCostSettings}
                onJumpUnmatched={() => handleShowOperatingView("unmatched" as any)}
              />



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
                  <OperatingDashboard
                    opReport={opReport}
                    onOpenBrandPoint={openBrandPointSettings}
                    onShowView={(view) => handleShowOperatingView(view as any)}
                  />

                  </div>
                  <div className="op-sticky-chrome flex-shrink-0">
                  {opReport && (
                    <OperatingQuickBar
                      opReport={opReport}
                      opView={opView}
                      orderTableFilter={orderTableFilter}
                      opCostSettings={opCostSettings}
                      onFilterOrders={showFilteredOrders}
                      onShowView={(view) => handleShowOperatingView(view as any)}
                      onOpenBrandPoint={openBrandPointSettings}
                    />
                  )}

                  <OpViewNav
                    value={opView}
                    onChange={(key) => handleShowOperatingView(key as any)}
                    badges={{
                      shipLoss: opReport.summary.shipNotDealCount,
                      unmatched: opReport.summary.costUnmatchedOrders,
                      anomalies: Math.max(
                        0,
                        (opReport.anomalySummaryTable?.length || 1) - 1,
                      ),
                    }}
                  />
                  <div className="mt-2" />

                  {(opView === "anomalies" ||
                    opView === "anomalyNeg" ||
                    opView === "anomalyUnmatched" ||
                    opView === "anomalyFeeFlip" ||
                    opView === "anomalyHighSku" ||
                    opView === "anomalyPartial") &&
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
                        {
                          key: "anomalyPartial",
                          label: `部分退比对(${Math.max(0, (opReport.anomalyPartialRefundTable?.length || 1) - 1)})`,
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
        <MappingTab
          opProductsCount={opProducts.length}
          opOrdersCount={opOrders.length}
          opOrdersPeriod={formatOpOrdersPeriod(opOrders)}
          skuMappingsCount={skuMappings.length}
          hasMappingFile={!!mappingFile}
          mappingFileName={mappingFile?.name}
          desktopReady={desktopReady}
          mappingResult={mappingResult}
          onImportMapping={handleImportMapping}
          onSyncFromProducts={handleSyncMappingsFromProducts}
          onApplyMapping={handleApplyMapping}
          onClearMapping={() => {
            setMappingFile(null);
            setSkuMappings([]);
            setMappingResult([]);
          }}
          onGoOperating={() => setActiveTab("operating")}
        />
      )}

      {/* ========== 收款对账 ========== */}
      {activeTab === "reconcile" && (
        <ReconcileTab
          opOrdersCount={opOrders.length}
          opOrdersReceivedTotal={opOrders.reduce(
            (s, o) => s + (o.merchantReceived || 0),
            0,
          )}
          opOrdersPeriod={formatOpOrdersPeriod(opOrders)}
          opShopNames={uniqueShopNames(opOrders)}
          desktopReady={desktopReady}
          paymentFile={paymentFile}
          reconcileResult={reconcileResult}
          onImportPayment={handleImportPayment}
          onReconcile={handleReconcile}
          onClearPayment={() => setPaymentFile(null)}
          onClearResult={() => setReconcileResult([])}
          onGoOperating={() => setActiveTab("operating")}
        />
      )}

      {/* ========== 账单对账 ========== */}
      {activeTab === "bill" && (
        <BillTab
          billRecords={billRecords}
          refundRecords={refundRecords}
          refundLossData={refundLossData}
          commissionDetails={commissionDetails}
          accrualData={accrualData}
          desktopReady={desktopReady}
          showBillDetail={showBillDetail}
          setShowBillDetail={setShowBillDetail}
          opBillLinesCount={opBillLines.length}
          opBillPeriod={formatOpBillPeriod(opBillLines)}
          opOrdersCount={opOrders.length}
          opOrdersPeriod={formatOpOrdersPeriod(opOrders)}
          onSyncFromOperating={handleSyncBillsFromOperating}
          onGoOperating={() => setActiveTab("operating")}
          onImportBill={handleImportBill}
          onImportCommission={handleImportCommissionDetails}
          onGenerateAccrual={handleGenerateAccrual}
          onImportRefund={handleImportRefund}
          onGenerateRefundLoss={handleGenerateRefundLoss}
          onExportRefundLoss={handleExportRefundLoss}
          onRemoveBill={handleRemoveBill}
          onError={reportError}
        />
      )}

      
      {/* ========== 快递对账 ========== */}
      {activeTab === "express" && (
        <ExpressReconcileTab
          desktopReady={desktopReady}
          onError={reportError}
          showToast={showToast}
          opOrders={opOrders}
          onGoOperating={() => setActiveTab("operating")}
        />
      )}

      {/* ========== 售后分析 ========== */}
      {activeTab === "aftersale" && (
        <AfterSaleTab
          desktopReady={desktopReady}
          onError={reportError}
          showToast={showToast}
          opOrders={opOrders}
          onGoOperating={() => setActiveTab("operating")}
        />
      )}

      {/* ========== 直通车细分 ========== */}
      {activeTab === "ztc" && (
        <ZtcTab
          opReport={opReport}
          opAdProducts={opAdProducts}
          desktopReady={desktopReady}
          onGoOperating={() => setActiveTab("operating")}
          onError={reportError}
          showToast={showToast}
        />
      )}

      {/* ========== 利润测算 ========== */}
      {activeTab === "profit" && (
        <ProfitCalcTab
          desktopReady={desktopReady}
          opProducts={opProducts}
          onError={reportError}
          showToast={showToast}
          onGoOperating={() => setActiveTab("operating")}
        />
      )}

      {/* ========== 销售排行（按编码） ========== */}
      {activeTab === "salesRank" && (
        <SalesRankTab
          opReport={opReport}
          currentData={currentData}
          currentHeaders={currentHeaders}
          onShowSkuRank={() => {
            setActiveTab("operating");
            handleShowOperatingView("salesRankSku");
          }}
          onShowSpuRank={() => {
            setActiveTab("operating");
            handleShowOperatingView("salesRankSpu");
          }}
          onShowSkuTable={() => {
            if (!opReport) return;
            const t = opReport.salesRankSkuTable || [];
            setCurrentData(t);
            setCurrentHeaders(t[0] || []);
          }}
          onShowSpuTable={() => {
            if (!opReport) return;
            const t = opReport.salesRankSpuTable || [];
            setCurrentData(t);
            setCurrentHeaders(t[0] || []);
          }}
          onGoOperating={() => setActiveTab("operating")}
        />
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

      {/* 账单详情弹窗 */}
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
    </div>
  );
}

export default App;


