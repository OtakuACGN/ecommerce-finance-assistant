import { useMemo, useState } from "react";
import DataTable from "./DataTable";
import type { FileData } from "../utils/excel";
import { exportWorkbook, processFile } from "../utils/excel";
import { openDataFiles, saveDataFile } from "../utils/desktop";
import type { PddOrder } from "../services/pddBusiness";
import {
  DEFAULT_HIGH_FEE_THRESHOLD,
  buildCurrentViewSheet,
  buildExpressExportSheets,
  buildExpressViz,
  parseAndReconcile,
  resultToTable,
  type ExpressFilter,
  type ExpressReconcileResult,
  type ExpressVizData,
} from "../services/expressReconcile";

export interface ExpressReconcileTabProps {
  desktopReady: boolean;
  onError: (action: string, error: unknown) => void;
  showToast: (msg: string, type?: "success" | "warning" | "error") => void;
  /** 经营分析已导入订单，可与快递账单对账 */
  opOrders?: PddOrder[];
  onGoOperating?: () => void;
}

function FileCard({
  title,
  hint,
  icon,
  file,
  rowsLabel,
  onPick,
  onClear,
  disabled,
}: {
  title: string;
  hint: string;
  icon: string;
  file: FileData | null;
  rowsLabel: string;
  onPick: () => void;
  onClear: () => void;
  disabled: boolean;
}) {
  return (
    <div className="border-2 border-dashed border-slate-200 rounded-xl p-5 text-center bg-white hover:border-sky-200 transition-colors">
      {file ? (
        <div className="text-emerald-700">
          <div className="text-2xl mb-1">✅</div>
          <div className="text-sm font-medium break-all px-1">{file.name}</div>
          <div className="text-xs text-slate-500 mt-1">{rowsLabel}</div>
          <button
            type="button"
            onClick={onClear}
            className="mt-2 text-xs text-rose-500 hover:underline"
          >
            移除
          </button>
        </div>
      ) : (
        <>
          <div className="text-2xl mb-1">{icon}</div>
          <div className="text-sm font-medium text-slate-700 mb-0.5">{title}</div>
          <div className="text-xs text-slate-500 mb-3 leading-relaxed px-2">{hint}</div>
          <button
            type="button"
            onClick={onPick}
            disabled={disabled}
            className="px-3 py-1.5 bg-sky-600 text-white rounded-lg text-sm hover:bg-sky-700 disabled:opacity-40"
          >
            选择文件
          </button>
        </>
      )}
    </div>
  );
}

/** 简易环形图 */
function DonutChart({
  items,
  size = 132,
}: {
  items: { label: string; count: number; color: string }[];
  size?: number;
}) {
  const total = items.reduce((s, i) => s + i.count, 0) || 1;
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const strokes = items
    .filter((i) => i.count > 0)
    .map((i) => {
      const len = (i.count / total) * c;
      const dash = `${len} ${c - len}`;
      const el = (
        <circle
          key={i.label}
          r={r}
          cx="50"
          cy="50"
          fill="transparent"
          stroke={i.color}
          strokeWidth="14"
          strokeDasharray={dash}
          strokeDashoffset={-offset}
          strokeLinecap="butt"
        />
      );
      offset += len;
      return el;
    });
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" width={size} height={size} className="shrink-0 -rotate-90">
        <circle r={r} cx="50" cy="50" fill="transparent" stroke="#e2e8f0" strokeWidth="14" />
        {strokes}
      </svg>
      <div className="space-y-1.5 text-xs min-w-0">
        {items.map((i) => (
          <div key={i.label} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: i.color }} />
            <span className="text-slate-600 truncate">{i.label}</span>
            <span className="ml-auto font-semibold tabular-nums text-slate-800">
              {i.count}
              <span className="text-slate-400 font-normal ml-1">
                {Math.round((i.count / total) * 100)}%
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 横向条形图 */
function HBarList({
  items,
  valueLabel,
}: {
  items: { label: string; value: number; color?: string; sub?: string }[];
  valueLabel?: (v: number) => string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  const fmt = valueLabel || ((v: number) => String(v));
  return (
    <div className="space-y-2">
      {items.map((i) => (
        <div key={i.label}>
          <div className="flex items-center justify-between text-xs mb-0.5 gap-2">
            <span className="text-slate-600 truncate">{i.label}</span>
            <span className="tabular-nums text-slate-800 font-medium shrink-0">
              {fmt(i.value)}
              {i.sub ? <span className="text-slate-400 font-normal ml-1">{i.sub}</span> : null}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.max(2, (i.value / max) * 100)}%`,
                background: i.color || "#6366f1",
              }}
            />
          </div>
        </div>
      ))}
      {!items.length && (
        <div className="text-xs text-slate-400 py-4 text-center">暂无数据</div>
      )}
    </div>
  );
}

const FILTER_BTNS: { key: ExpressFilter; label: string }[] = [
  { key: "unmatched", label: "真对不上" },
  { key: "otherExpress", label: "其他快递" },
  { key: "multi", label: "多件" },
  { key: "highFee", label: "高运费" },
  { key: "all", label: "全部" },
  { key: "matched", label: "已匹配" },
  { key: "billOnly", label: "仅账单" },
  { key: "shipOnly", label: "仅发货未入账" },
];

function countOpWaybills(orders: PddOrder[] | undefined): number {
  if (!orders?.length) return 0;
  const set = new Set<string>();
  for (const o of orders) {
    const w = String(o.expressNo || "")
      .trim()
      .replace(/[\s\u00a0]/g, "")
      .toUpperCase();
    if (w) set.add(w);
  }
  return set.size;
}

export default function ExpressReconcileTab({
  desktopReady,
  onError,
  showToast,
  opOrders,
  onGoOperating,
}: ExpressReconcileTabProps) {
  const [billFile, setBillFile] = useState<FileData | null>(null);
  const [shipFile, setShipFile] = useState<FileData | null>(null);
  const [result, setResult] = useState<ExpressReconcileResult | null>(null);
  const [filter, setFilter] = useState<ExpressFilter>("unmatched");
  const [busy, setBusy] = useState(false);
  const [highFeeInput, setHighFeeInput] = useState(String(DEFAULT_HIGH_FEE_THRESHOLD));
  const [showViz, setShowViz] = useState(true);
  const [useOpOrders, setUseOpOrders] = useState(true);

  const highFeeThreshold = useMemo(() => {
    const n = parseFloat(highFeeInput);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_HIGH_FEE_THRESHOLD;
  }, [highFeeInput]);

  const opWaybillCount = useMemo(() => countOpWaybills(opOrders), [opOrders]);
  const hasShipSide = Boolean(shipFile) || (useOpOrders && opWaybillCount > 0);
  const canReconcile = Boolean(billFile) && hasShipSide && !busy;

  const viz: ExpressVizData | null = useMemo(() => {
    if (!result) return null;
    return buildExpressViz(result, highFeeThreshold);
  }, [result, highFeeThreshold]);

  const table = useMemo(() => {
    if (!result) return [];
    return resultToTable(result.rows, filter, highFeeThreshold);
  }, [result, filter, highFeeThreshold]);

  const filterCount = (k: ExpressFilter): number => {
    if (!result) return 0;
    const s = result.summary;
    if (k === "all") return result.rows.length;
    if (k === "matched") return s.matched;
    if (k === "billOnly") return s.billOnly;
    if (k === "shipOnly") return s.shipOnly;
    if (k === "otherExpress") return s.otherExpress;
    if (k === "unmatched") return s.unmatched;
    if (k === "multi") return s.multiCount;
    if (k === "highFee") {
      return result.rows.filter(
        (r) => r.totalFee != null && (r.totalFee as number) >= highFeeThreshold,
      ).length;
    }
    return 0;
  };

  const runParse = (
    bill: FileData,
    ship: FileData | null,
    thr: number,
  ): ExpressReconcileResult =>
    parseAndReconcile(bill, ship, {
      highFeeThreshold: thr,
      opOrders: useOpOrders ? opOrders : undefined,
    });

  const resolveResult = (): ExpressReconcileResult | null => {
    if (!result) return null;
    if (result.highFeeThreshold === highFeeThreshold) return result;
    if (billFile && hasShipSide) {
      return runParse(billFile, shipFile, highFeeThreshold);
    }
    return { ...result, highFeeThreshold };
  };

  const pickFile = async (kind: "bill" | "ship") => {
    if (!desktopReady) {
      showToast("请在桌面应用中选择文件", "warning");
      return;
    }
    try {
      const opened = await openDataFiles();
      if (opened.canceled || !opened.filePaths?.length) return;
      const filePath = opened.filePaths[0];
      const fd = await processFile(filePath);
      if (!fd) {
        showToast("文件读取失败", "error");
        return;
      }
      const headersJoined = (fd.headers || []).join("|");
      if (kind === "bill") {
        if (!headersJoined.includes("运单号") && !headersJoined.includes("快递单号")) {
          showToast("未识别到运单号列，请确认是快递账单明细", "warning");
        }
        setBillFile(fd);
        setResult(null);
        showToast(
          `已载入快递账单：${fd.name}（${Math.max(0, fd.data.length - 1)} 行）`,
          "success",
        );
      } else {
        if (!headersJoined.includes("运单号") && !headersJoined.includes("快递单号")) {
          showToast("未识别到运单号列，请确认是发货订单导出", "warning");
        }
        setShipFile(fd);
        setResult(null);
        showToast(
          `已载入发货订单：${fd.name}（${Math.max(0, fd.data.length - 1)} 行）`,
          "success",
        );
      }
    } catch (e) {
      onError(kind === "bill" ? "导入快递账单" : "导入发货订单", e);
    }
  };

  const handleReconcile = () => {
    if (!billFile) {
      showToast("请先导入快递账单", "warning");
      return;
    }
    if (!hasShipSide) {
      showToast("请导入发货订单，或先在经营分析导入含运单号的订单", "warning");
      return;
    }
    setBusy(true);
    try {
      const r = runParse(billFile, shipFile, highFeeThreshold);
      setResult(r);
      setFilter("unmatched");
      setShowViz(true);
      const otherTip =
        r.summary.otherExpress > 0 ? ` · 其他快递 ${r.summary.otherExpress}` : "";
      showToast(
        `对账完成：真对不上 ${r.summary.unmatched}${otherTip} · 多件 ${r.summary.multiCount} · 高运费 ${r.summary.highFeeCount}`,
        "success",
      );
    } catch (e) {
      onError("快递对账", e);
    } finally {
      setBusy(false);
    }
  };

  const handleExportAll = async () => {
    const r = resolveResult();
    if (!r) {
      showToast("请先完成对账", "warning");
      return;
    }
    if (!desktopReady) {
      showToast("请在桌面应用中导出", "warning");
      return;
    }
    try {
      const name = `快递对账_全量_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const save = await saveDataFile(name);
      if (save.canceled || !save.filePath) return;
      await exportWorkbook(buildExpressExportSheets(r), save.filePath);
      showToast("已导出全量：汇总+可视化表+异常清单+明细", "success");
    } catch (e) {
      onError("导出快递对账", e);
    }
  };

  const handleExportCurrent = async () => {
    const r = resolveResult();
    if (!r) {
      showToast("请先完成对账", "warning");
      return;
    }
    if (!desktopReady) {
      showToast("请在桌面应用中导出", "warning");
      return;
    }
    try {
      const sheet = buildCurrentViewSheet(r, filter, highFeeThreshold);
      const name = `快递对账_${sheet.name}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const save = await saveDataFile(name);
      if (save.canceled || !save.filePath) return;
      await exportWorkbook([sheet], save.filePath);
      showToast(`已导出当前视图：${sheet.name}`, "success");
    } catch (e) {
      onError("导出当前视图", e);
    }
  };

  const handleExportAnomalies = async () => {
    const r = resolveResult();
    if (!r) {
      showToast("请先完成对账", "warning");
      return;
    }
    if (!desktopReady) {
      showToast("请在桌面应用中导出", "warning");
      return;
    }
    try {
      const thr = highFeeThreshold;
      const sheets = [
        buildCurrentViewSheet(r, "unmatched", thr),
        buildCurrentViewSheet(r, "otherExpress", thr),
        buildCurrentViewSheet(r, "multi", thr),
        buildCurrentViewSheet(r, "highFee", thr),
      ];
      const name = `快递对账_异常清单_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const save = await saveDataFile(name);
      if (save.canceled || !save.filePath) return;
      await exportWorkbook(sheets, save.filePath);
      showToast("已导出异常清单：真对不上 / 其他快递 / 多件 / 高运费", "success");
    } catch (e) {
      onError("导出异常清单", e);
    }
  };

  const s = result?.summary;

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className="max-w-[1600px] mx-auto space-y-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-800">快递对账</h2>
              <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-3xl">
                运单号核对快递账单与发货侧。发货侧可用
                <strong className="text-slate-700">发货订单文件</strong>
                和/或
                <strong className="text-slate-700">经营分析订单</strong>
                。未匹配拆成
                <strong className="text-rose-700">真对不上</strong>
                与
                <strong className="text-slate-600">其他快递</strong>
                （承运商不同，不计入本账缺口）。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-slate-500 flex items-center gap-1.5">
                高运费阈值
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={highFeeInput}
                  onChange={(e) => setHighFeeInput(e.target.value)}
                  className="w-16 px-1.5 py-1 border border-slate-200 rounded-md text-sm text-slate-800"
                />
                <span>元</span>
              </label>
              <button
                type="button"
                onClick={() => setShowViz((v) => !v)}
                disabled={!result}
                className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
              >
                {showViz ? "收起图表" : "展开图表"}
              </button>
              <button
                type="button"
                onClick={() => void handleExportCurrent()}
                disabled={!result}
                className="px-3 py-1.5 rounded-lg text-sm border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-40"
              >
                导出当前表
              </button>
              <button
                type="button"
                onClick={() => void handleExportAnomalies()}
                disabled={!result}
                className="px-3 py-1.5 rounded-lg text-sm border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 disabled:opacity-40"
              >
                导出异常
              </button>
              <button
                type="button"
                onClick={() => void handleExportAll()}
                disabled={!result}
                className="px-3 py-1.5 rounded-lg text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                导出全量 Excel
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <FileCard
              title="快递账单"
              hint="含运单号、面单费/运费/合计费用的明细表"
              icon="📦"
              file={billFile}
              rowsLabel={
                billFile
                  ? `${Math.max(0, billFile.data.length - 1)} 行 · 表头含：${(billFile.headers || [])
                      .slice(0, 4)
                      .join(" / ")}`
                  : ""
              }
              onPick={() => void pickFile("bill")}
              onClear={() => {
                setBillFile(null);
                setResult(null);
              }}
              disabled={!desktopReady}
            />
            <FileCard
              title="店铺发货订单（可选）"
              hint="ERP/店铺导出的发货单，需含运单号；可与经营分析订单合并"
              icon="🚚"
              file={shipFile}
              rowsLabel={
                shipFile
                  ? `${Math.max(0, shipFile.data.length - 1)} 行 · 表头含：${(shipFile.headers || [])
                      .slice(0, 4)
                      .join(" / ")}`
                  : ""
              }
              onPick={() => void pickFile("ship")}
              onClear={() => {
                setShipFile(null);
                setResult(null);
              }}
              disabled={!desktopReady}
            />
            <div
              className={`border-2 rounded-xl p-5 text-center transition-colors ${
                useOpOrders && opWaybillCount > 0
                  ? "border-emerald-300 bg-emerald-50/40"
                  : "border-dashed border-slate-200 bg-white"
              }`}
            >
              <div className="text-2xl mb-1">📋</div>
              <div className="text-sm font-medium text-slate-700 mb-0.5">经营分析订单</div>
              {opWaybillCount > 0 ? (
                <>
                  <div className="text-xs text-emerald-700 mt-1">
                    已载入 {opOrders?.length || 0} 行订单 · {opWaybillCount} 个运单
                  </div>
                  <label className="mt-3 inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useOpOrders}
                      onChange={(e) => {
                        setUseOpOrders(e.target.checked);
                        setResult(null);
                      }}
                    />
                    参与本次对账
                  </label>
                </>
              ) : (
                <>
                  <div className="text-xs text-slate-500 mb-3 leading-relaxed px-2">
                    经营分析导入含「快递单号」的订单后，可免导发货表直接对账
                  </div>
                  {onGoOperating ? (
                    <button
                      type="button"
                      onClick={onGoOperating}
                      className="px-3 py-1.5 bg-slate-700 text-white rounded-lg text-sm hover:bg-slate-800"
                    >
                      去经营分析导入
                    </button>
                  ) : (
                    <div className="text-xs text-slate-400">请先在经营分析导入订单</div>
                  )}
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleReconcile}
            disabled={!canReconcile}
            className="mt-4 w-full px-4 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm font-medium disabled:opacity-40"
          >
            {busy
              ? "对账中…"
              : !billFile
                ? "请先导入快递账单"
                : !hasShipSide
                  ? "请导入发货订单或启用经营分析运单"
                  : "开始对账 →"}
          </button>

          {s && (
            <>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
                {s.billCarrierLabel ? (
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    账单承运商：{s.billCarrierLabel}
                  </span>
                ) : null}
                {s.shipSourceLabel ? (
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    发货来源：{s.shipSourceLabel}
                  </span>
                ) : null}
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <button
                  type="button"
                  onClick={() => setFilter("unmatched")}
                  className={`text-left rounded-xl border p-4 transition-shadow hover:shadow-md ${
                    filter === "unmatched"
                      ? "border-rose-400 bg-rose-50 ring-2 ring-rose-200"
                      : "border-rose-100 bg-rose-50/60"
                  }`}
                >
                  <div className="text-xs font-medium text-rose-700">⚠ 真对不上</div>
                  <div className="text-2xl font-bold text-rose-900 mt-1">{s.unmatched}</div>
                  <div className="text-[11px] text-rose-700/80 mt-1">
                    仅账单 {s.billOnly} · 仅发货未入账 {s.shipOnly}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("otherExpress")}
                  className={`text-left rounded-xl border p-4 transition-shadow hover:shadow-md ${
                    filter === "otherExpress"
                      ? "border-slate-400 bg-slate-100 ring-2 ring-slate-300"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="text-xs font-medium text-slate-600">🚚 其他快递</div>
                  <div className="text-2xl font-bold text-slate-800 mt-1">{s.otherExpress}</div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    承运商≠{s.billCarrierLabel || "账单"}，不计入缺口
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("multi")}
                  className={`text-left rounded-xl border p-4 transition-shadow hover:shadow-md ${
                    filter === "multi"
                      ? "border-amber-400 bg-amber-50 ring-2 ring-amber-200"
                      : "border-amber-100 bg-amber-50/60"
                  }`}
                >
                  <div className="text-xs font-medium text-amber-800">📦 多件</div>
                  <div className="text-2xl font-bold text-amber-950 mt-1">{s.multiCount}</div>
                  <div className="text-[11px] text-amber-800/80 mt-1">数量&gt;1 或同运单多行</div>
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("highFee")}
                  className={`text-left rounded-xl border p-4 transition-shadow hover:shadow-md ${
                    filter === "highFee"
                      ? "border-violet-400 bg-violet-50 ring-2 ring-violet-200"
                      : "border-violet-100 bg-violet-50/60"
                  }`}
                >
                  <div className="text-xs font-medium text-violet-800">
                    💰 高运费 ≥¥{highFeeThreshold}
                  </div>
                  <div className="text-2xl font-bold text-violet-950 mt-1">
                    {filterCount("highFee")}
                  </div>
                  <div className="text-[11px] text-violet-800/80 mt-1">
                    均价 ¥{s.avgBillFee.toFixed(2)} · P90 ¥{s.p90BillFee.toFixed(2)}
                  </div>
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">账单运单</div>
                  <div className="font-semibold text-slate-800 mt-0.5">{s.billCount}</div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">发货运单</div>
                  <div className="font-semibold text-slate-800 mt-0.5">
                    {s.shipUniqueWaybills}
                    <span className="text-xs font-normal text-slate-400 ml-1">
                      / {s.shipRowCount}行
                    </span>
                  </div>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                  <div className="text-xs text-emerald-700">账单匹配率</div>
                  <div className="font-semibold text-emerald-900 mt-0.5">
                    {viz ? `${(viz.matchRate * 100).toFixed(1)}%` : "—"}
                  </div>
                  <div className="text-[11px] text-emerald-700/80">已匹配 {s.matched}</div>
                </div>
                <div className="rounded-xl border border-sky-100 bg-sky-50 p-3">
                  <div className="text-xs text-sky-700">账单费用合计</div>
                  <div className="font-semibold text-sky-950 mt-0.5">
                    ¥{s.billFeeTotal.toFixed(2)}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {result && viz && showViz && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-800">匹配结构</h3>
                <span className="text-[11px] text-slate-400">点击图例下方筛选</span>
              </div>
              <DonutChart items={viz.matchPie} />
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(
                  [
                    ["matched", "已匹配"],
                    ["billOnly", "仅账单"],
                    ["shipOnly", "仅发货未入账"],
                    ["otherExpress", "其他快递"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setFilter(k)}
                    className="px-2 py-0.5 rounded text-[11px] border border-slate-200 hover:bg-slate-50"
                  >
                    看{label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-800">异常 / 其他快递</h3>
                <button
                  type="button"
                  onClick={() => void handleExportAnomalies()}
                  className="text-[11px] text-indigo-600 hover:underline"
                >
                  导出异常表
                </button>
              </div>
              <HBarList
                items={viz.anomalyBars.map((a) => ({
                  label: a.label,
                  value: a.count,
                  color: a.color,
                }))}
              />
              <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 space-y-1">
                <div className="flex justify-between">
                  <span>多件运单</span>
                  <span className="tabular-nums text-slate-800">
                    {viz.multiVsSingle.multi} · ¥{viz.multiVsSingle.multiFee.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>单件(有费用)</span>
                  <span className="tabular-nums text-slate-800">
                    {viz.multiVsSingle.single} · ¥{viz.multiVsSingle.singleFee.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-800">费用区间分布</h3>
                <span className="text-[11px] text-slate-400">按合计费用</span>
              </div>
              <HBarList
                items={viz.feeBuckets
                  .filter((b) => b.count > 0)
                  .map((b) => ({
                    label: b.label,
                    value: b.count,
                    color: b.min >= highFeeThreshold ? "#7c3aed" : "#0ea5e9",
                    sub: `¥${b.feeSum.toFixed(0)}`,
                  }))}
              />
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 lg:col-span-3">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-800">目的省份费用 TOP10</h3>
                <span className="text-[11px] text-slate-400">有账单费用的运单</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1">
                <HBarList
                  items={viz.topProvinces.slice(0, 5).map((p) => ({
                    label: p.province,
                    value: p.feeSum,
                    color: "#6366f1",
                    sub: `${p.count}单 · 均¥${p.avgFee.toFixed(2)}`,
                  }))}
                  valueLabel={(v) => `¥${v.toFixed(2)}`}
                />
                <HBarList
                  items={viz.topProvinces.slice(5, 10).map((p) => ({
                    label: p.province,
                    value: p.feeSum,
                    color: "#8b5cf6",
                    sub: `${p.count}单 · 均¥${p.avgFee.toFixed(2)}`,
                  }))}
                  valueLabel={(v) => `¥${v.toFixed(2)}`}
                />
              </div>
            </div>
          </div>
        )}

        {result && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="font-medium text-slate-800 text-sm">
                  {filter === "unmatched"
                    ? "异常清单 · 真对不上"
                    : filter === "otherExpress"
                      ? "清单 · 其他快递（非本账单承运商）"
                      : filter === "multi"
                        ? "异常清单 · 多件"
                        : filter === "highFee"
                          ? `异常清单 · 高运费（≥¥${highFeeThreshold}）`
                          : filter === "shipOnly"
                            ? "明细 · 仅发货未入账"
                            : "对账明细"}
                  <span className="ml-2 text-slate-400 font-normal">
                    {Math.max(0, table.length - 1)} 行
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  可用「导出当前表」只导出现在这张筛选结果
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {FILTER_BTNS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={`px-2.5 py-1 rounded-lg text-xs border ${
                      filter === key
                        ? key === "unmatched"
                          ? "bg-rose-600 text-white border-rose-600"
                          : key === "otherExpress"
                            ? "bg-slate-600 text-white border-slate-600"
                            : key === "multi"
                              ? "bg-amber-600 text-white border-amber-600"
                              : key === "highFee"
                                ? "bg-violet-600 text-white border-violet-600"
                                : "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {label}
                    <span className="ml-1 opacity-80">{filterCount(key)}</span>
                  </button>
                ))}
              </div>
            </div>
            <DataTable
              data={table}
              headers={(table[0] || []).map(String)}
              stickyCols={
                filter === "unmatched" ||
                filter === "otherExpress" ||
                filter === "multi" ||
                filter === "highFee"
                  ? 3
                  : 2
              }
            />
          </div>
        )}

        {!result && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 p-6 text-sm text-slate-500 leading-relaxed">
            <div className="font-medium text-slate-700 mb-2">使用说明</div>
            <ol className="list-decimal list-inside space-y-1">
              <li>导入快递账单（自动读「明细」）</li>
              <li>
                发货侧任选其一或合并：
                <strong>发货订单文件</strong>、
                <strong>经营分析订单</strong>（含快递单号）
              </li>
              <li>设高运费阈值后点「开始对账」</li>
              <li>
                结果拆分：
                <strong className="text-rose-700">真对不上</strong>
                （仅账单 / 同承运商未入账）与
                <strong>其他快递</strong>
                （承运商不同，不当缺口）
              </li>
              <li>
                导出：
                <strong>当前表</strong> /
                <strong>异常</strong>（含其他快递）/
                <strong>全量</strong>
              </li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
