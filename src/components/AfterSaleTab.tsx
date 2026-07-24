import { useMemo, useState } from "react";
import DataTable from "./DataTable";
import type { FileData } from "../utils/excel";
import { exportWorkbook, processFile } from "../utils/excel";
import { openDataFiles, saveDataFile } from "../utils/desktop";
import type { PddOrder } from "../services/pddBusiness";
import {
  afterSalesToTable,
  buildAfterSaleExportSheets,
  parseAndAnalyzeAfterSales,
  type AfterSaleFilter,
  type AfterSaleResult,
} from "../services/afterSaleAnalysis";

export interface AfterSaleTabProps {
  desktopReady: boolean;
  onError: (action: string, error: unknown) => void;
  showToast: (msg: string, type?: "success" | "warning" | "error") => void;
  opOrders?: PddOrder[];
  onGoOperating?: () => void;
}

function HBarList({
  items,
  totalBase,
}: {
  items: { label: string; value: number; sub?: string; color?: string }[];
  /** 分母：成功售后单数；不传则用列表合计 */
  totalBase?: number;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  const base =
    totalBase && totalBase > 0
      ? totalBase
      : items.reduce((sum, i) => sum + (Number(i.value) || 0), 0) || 1;
  return (
    <div className="space-y-2">
      {items.map((i, index) => {
        const pct = Math.round(((Number(i.value) || 0) / base) * 1000) / 10;
        return (
          <div key={`${i.label}-${index}`}>
            <div className="flex items-center justify-between text-xs mb-0.5 gap-2">
              <span className="text-slate-600 truncate">{i.label}</span>
              <span className="tabular-nums text-slate-800 shrink-0">
                {i.value}
                <span className="text-slate-400 ml-1">{pct}%</span>
                {i.sub ? <span className="text-slate-400 ml-1">{i.sub}</span> : null}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, (i.value / max) * 100)}%`,
                  background: i.color || "#f43f5e",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
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
  optional,
}: {
  title: string;
  hint: string;
  icon: string;
  file: FileData | null;
  rowsLabel: string;
  onPick: () => void;
  onClear: () => void;
  disabled: boolean;
  optional?: boolean;
}) {
  return (
    <div className="border-2 border-dashed border-slate-200 rounded-xl p-5 text-center bg-white hover:border-rose-200 transition-colors">
      {file ? (
        <div className="text-emerald-700">
          <div className="text-2xl mb-1">✅</div>
          <div className="text-sm font-medium break-all px-1">{file.name}</div>
          <div className="text-xs text-slate-500 mt-1">{rowsLabel}</div>
          <button type="button" onClick={onClear} className="mt-2 text-xs text-rose-500 hover:underline">
            移除
          </button>
        </div>
      ) : (
        <>
          <div className="text-2xl mb-1">{icon}</div>
          <div className="text-sm font-medium text-slate-700 mb-0.5">
            {title}
            {optional ? <span className="text-slate-400 font-normal">（可选）</span> : null}
          </div>
          <div className="text-xs text-slate-500 mb-3 leading-relaxed px-2">{hint}</div>
          <button
            type="button"
            onClick={onPick}
            disabled={disabled}
            className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-sm hover:bg-rose-700 disabled:opacity-40"
          >
            选择文件
          </button>
        </>
      )}
    </div>
  );
}

const FILTER_BTNS: { key: AfterSaleFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "success", label: "退款成功" },
  { key: "partial", label: "部分退" },
  { key: "full", label: "全额退" },
  { key: "beforeShip", label: "发货前" },
  { key: "afterShip", label: "发货后" },
  { key: "returnRefund", label: "退货退款" },
  { key: "refundOnly", label: "仅退款" },
  { key: "revoked", label: "已撤销" },
  { key: "intercept", label: "有拦截" },
];

export default function AfterSaleTab({
  desktopReady,
  onError,
  showToast,
  opOrders,
  onGoOperating,
}: AfterSaleTabProps) {
  const [afterFile, setAfterFile] = useState<FileData | null>(null);
  const [orderFile, setOrderFile] = useState<FileData | null>(null);
  const [useOpOrders, setUseOpOrders] = useState(true);
  const [result, setResult] = useState<AfterSaleResult | null>(null);
  const [filter, setFilter] = useState<AfterSaleFilter>("success");
  const [rankView, setRankView] = useState<"reason" | "desc" | "cross" | "sku" | "product">("reason");
  const [busy, setBusy] = useState(false);

  const opOrderCount = opOrders?.length || 0;

  const table = useMemo(() => {
    if (!result) return [];
    return afterSalesToTable(result.rows, filter);
  }, [result, filter]);

  const emptyDescStats = useMemo(() => {
    if (!result) return { count: 0, pct: 0 };
    const rows = result.rows.filter((r) => r.isSuccess);
    const empty = rows.filter(
      (r) =>
        r.descClusterKey === 'empty' ||
        r.descClusterLabel === '无有效描述' ||
        !(r.description || '').trim(),
    );
    const base = rows.length || 1;
    return {
      count: empty.length,
      pct: Math.round((empty.length / base) * 1000) / 10,
    };
  }, [result]);

  const filterCount = (k: AfterSaleFilter): number => {
    if (!result) return 0;
    const s = result.summary;
    if (k === "all") return s.total;
    if (k === "success") return s.success;
    if (k === "revoked") return s.revoked;
    if (k === "failed") return s.failed;
    if (k === "processing") return s.processing;
    if (k === "beforeShip") return s.beforeShip;
    if (k === "afterShip") return s.afterShip;
    if (k === "partial") return s.partialRefund;
    if (k === "full") return s.fullRefund;
    if (k === "returnRefund") return s.returnRefund;
    if (k === "refundOnly") return s.refundOnly;
    if (k === "resend") return s.resend;
    if (k === "intercept") return s.intercept;
    return 0;
  };

  const pickFile = async (kind: "after" | "order") => {
    if (!desktopReady) {
      showToast("请在桌面应用中选择文件", "warning");
      return;
    }
    try {
      const opened = await openDataFiles();
      if (opened.canceled || !opened.filePaths?.length) return;
      const fd = await processFile(opened.filePaths[0]);
      if (!fd) {
        showToast("文件读取失败", "error");
        return;
      }
      const h = (fd.headers || []).join("|");
      if (kind === "after") {
        if (!h.includes("售后编号") && !h.includes("退款金额")) {
          showToast("未识别售后表头，请确认是拼多多售后导出", "warning");
        }
        setAfterFile(fd);
        setResult(null);
        showToast(`已载入售后：${fd.name}（${Math.max(0, fd.data.length - 1)} 行）`, "success");
      } else {
        if (!h.includes("订单号") && !h.includes("订单编号")) {
          showToast("未识别订单号列，请确认是订单导出", "warning");
        }
        setOrderFile(fd);
        setResult(null);
        showToast(`已载入订单：${fd.name}（${Math.max(0, fd.data.length - 1)} 行）`, "success");
      }
    } catch (e) {
      onError(kind === "after" ? "导入售后" : "导入订单", e);
    }
  };

  const handleAnalyze = () => {
    if (!afterFile) {
      showToast("请先导入售后导出表", "warning");
      return;
    }
    setBusy(true);
    try {
      const r = parseAndAnalyzeAfterSales(afterFile, {
        orderFile,
        opOrders,
        useOpOrders,
      });
      setResult(r);
      setFilter("success");
      const rate =
        r.summary.refundRateByCount != null
          ? ` · 售后率 ${(r.summary.refundRateByCount * 100).toFixed(1)}%`
          : "";
      showToast(
        `分析完成：成功 ${r.summary.success}/${r.summary.total} · 退款 ¥${r.summary.successRefundAmount.toFixed(0)} · 描述 ${r.summary.descRawUnique}→${r.summary.descClusterCount} 类${rate}`,
        "success",
      );
    } catch (e) {
      onError("售后分析", e);
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    if (!result) {
      showToast("请先完成分析", "warning");
      return;
    }
    if (!desktopReady) {
      showToast("请在桌面应用中导出", "warning");
      return;
    }
    try {
      const name = `售后分析_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const save = await saveDataFile(name);
      if (save.canceled || !save.filePath) return;
      await exportWorkbook(buildAfterSaleExportSheets(result), save.filePath);
      showToast("已导出售后分析全量报表", "success");
    } catch (e) {
      onError("导出售后分析", e);
    }
  };

  const handleExportCurrent = async () => {
    if (!result) {
      showToast("请先完成分析", "warning");
      return;
    }
    if (!desktopReady) {
      showToast("请在桌面应用中导出", "warning");
      return;
    }
    try {
      const data = afterSalesToTable(result.rows, filter);
      const name = `售后分析_当前筛选_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const save = await saveDataFile(name);
      if (save.canceled || !save.filePath) return;
      await exportWorkbook([{ name: "当前筛选", data }], save.filePath);
      showToast("已导出当前筛选明细", "success");
    } catch (e) {
      onError("导出当前筛选", e);
    }
  };

  const s = result?.summary;
  const rankItems = useMemo(() => {
    if (!result) return [];
    if (rankView === "reason") {
      return result.reasonRank.slice(0, 12).map((x) => ({
        label: x.name,
        value: x.count,
        sub: `¥${x.refundAmount.toFixed(0)}`,
        color: "#e11d48",
      }));
    }
    if (rankView === "desc") {
      return result.descClusterRank.slice(0, 12).map((x) => ({
        label: x.name,
        value: x.count,
        sub: `¥${x.refundAmount.toFixed(0)}`,
        color: "#db2777",
      }));
    }
    if (rankView === "cross") {
      return result.reasonDescRank.slice(0, 12).map((x) => ({
        label: x.name,
        value: x.count,
        sub: `¥${x.refundAmount.toFixed(0)}`,
        color: "#c026d3",
      }));
    }
    if (rankView === "product") {
      return result.productRank.slice(0, 10).map((x) => ({
        label: x.productName || x.productId || "未知",
        value: x.successCount,
        sub: `¥${x.refundAmount.toFixed(0)}`,
        color: "#ea580c",
      }));
    }
    return result.skuRank.slice(0, 10).map((x) => ({
      label: x.skuInfo || x.merchantSku || x.productId || "未知规格",
      value: x.successCount,
      sub: `¥${x.refundAmount.toFixed(0)}`,
      color: "#0891b2",
    }));
  }, [result, rankView]);

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className="max-w-[1600px] mx-auto space-y-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-800">售后分析</h2>
              <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-3xl">
                导入拼多多<strong className="text-slate-700">售后导出</strong>
                。原因=大项，描述=小项（自动近似合并）；可看发货前/后、规格排行。
                对接订单后可算<strong className="text-slate-700">售后率</strong>。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleExportCurrent()}
                disabled={!result}
                className="px-3 py-1.5 rounded-lg text-sm border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-40"
              >
                导出当前
              </button>
              <button
                type="button"
                onClick={() => void handleExport()}
                disabled={!result}
                className="px-3 py-1.5 rounded-lg text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                导出全量 Excel
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <FileCard
              title="售后导出"
              hint="支持 ERP/拼多多：售后单号、售后原因、售后描述、申请退款金额等"
              icon="↩️"
              file={afterFile}
              rowsLabel={
                afterFile
                  ? `${Math.max(0, afterFile.data.length - 1)} 行`
                  : ""
              }
              onPick={() => void pickFile("after")}
              onClear={() => {
                setAfterFile(null);
                setResult(null);
              }}
              disabled={!desktopReady}
            />
            <FileCard
              title="订单导出"
              hint="用于计算售后率、补全商品名/编码；可与经营分析订单二选一或合并"
              icon="📦"
              file={orderFile}
              rowsLabel={
                orderFile ? `${Math.max(0, orderFile.data.length - 1)} 行` : ""
              }
              onPick={() => void pickFile("order")}
              onClear={() => {
                setOrderFile(null);
                setResult(null);
              }}
              disabled={!desktopReady}
              optional
            />
            <div
              className={`border-2 rounded-xl p-5 text-center ${
                useOpOrders && opOrderCount > 0
                  ? "border-emerald-300 bg-emerald-50/40"
                  : "border-dashed border-slate-200 bg-white"
              }`}
            >
              <div className="text-2xl mb-1">📋</div>
              <div className="text-sm font-medium text-slate-700 mb-0.5">经营分析订单</div>
              {opOrderCount > 0 ? (
                <>
                  <div className="text-xs text-emerald-700 mt-1">已载入 {opOrderCount} 行</div>
                  <label className="mt-3 inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useOpOrders}
                      onChange={(e) => {
                        setUseOpOrders(e.target.checked);
                        setResult(null);
                      }}
                    />
                    参与基数/补全
                  </label>
                </>
              ) : (
                <>
                  <div className="text-xs text-slate-500 mb-3 px-2 leading-relaxed">
                    经营分析导入订单后可自动算售后率
                  </div>
                  {onGoOperating ? (
                    <button
                      type="button"
                      onClick={onGoOperating}
                      className="px-3 py-1.5 bg-slate-700 text-white rounded-lg text-sm hover:bg-slate-800"
                    >
                      去经营分析导入
                    </button>
                  ) : null}
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!afterFile || busy}
            className="mt-4 w-full px-4 py-3 bg-rose-600 text-white rounded-xl hover:bg-rose-700 text-sm font-medium disabled:opacity-40"
          >
            {busy ? "分析中…" : afterFile ? "开始售后分析 →" : "请先导入售后导出"}
          </button>

          {s && (
            <>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
                {s.afterFileName ? (
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    售后：{s.afterFileName}
                  </span>
                ) : null}
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  订单基数：{s.orderSourceLabel || "未对接"}
                </span>
              </div>
              {emptyDescStats.count > 0 ? (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 leading-relaxed">
                  有 <strong>{emptyDescStats.count}</strong> 笔成功售后（约 {emptyDescStats.pct}%）
                  描述为空，已归入「无有效描述」。排行看<strong>原因大项</strong>即可；
                  小项为空表示大项无补充描述，不是聚类失败。
                </div>
              ) : null}
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <button
                  type="button"
                  onClick={() => setFilter("success")}
                  className={`text-left rounded-xl border p-3 ${
                    filter === "success"
                      ? "border-rose-400 bg-rose-50 ring-2 ring-rose-200"
                      : "border-rose-100 bg-rose-50/50"
                  }`}
                >
                  <div className="text-[11px] text-rose-700">退款成功</div>
                  <div className="text-xl font-bold text-rose-900">{s.success}</div>
                  <div className="text-[11px] text-rose-700/80">¥{s.successRefundAmount.toFixed(0)}</div>
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("beforeShip")}
                  className={`text-left rounded-xl border p-3 ${
                    filter === "beforeShip" ? "border-amber-400 bg-amber-50 ring-2 ring-amber-200" : "border-amber-100 bg-amber-50/50"
                  }`}
                >
                  <div className="text-[11px] text-amber-800">发货前</div>
                  <div className="text-xl font-bold text-amber-950">{s.beforeShip}</div>
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("afterShip")}
                  className={`text-left rounded-xl border p-3 ${
                    filter === "afterShip" ? "border-orange-400 bg-orange-50 ring-2 ring-orange-200" : "border-orange-100 bg-orange-50/50"
                  }`}
                >
                  <div className="text-[11px] text-orange-800">发货后</div>
                  <div className="text-xl font-bold text-orange-950">{s.afterShip}</div>
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("partial")}
                  className={`text-left rounded-xl border p-3 ${
                    filter === "partial" ? "border-violet-400 bg-violet-50 ring-2 ring-violet-200" : "border-violet-100 bg-violet-50/50"
                  }`}
                >
                  <div className="text-[11px] text-violet-800">部分退</div>
                  <div className="text-xl font-bold text-violet-950">{s.partialRefund}</div>
                  <div className="text-[11px] text-violet-700/80">差额 ¥{s.partialGapAmount.toFixed(0)}</div>
                </button>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="text-[11px] text-slate-500">售后率(单)</div>
                  <div className="text-xl font-bold text-slate-800">
                    {s.refundRateByCount != null ? `${(s.refundRateByCount * 100).toFixed(1)}%` : "—"}
                  </div>
                  <div className="text-[11px] text-slate-400">基数 {s.orderBaseCount || "—"}</div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="text-[11px] text-slate-500">售后率(额)</div>
                  <div className="text-xl font-bold text-slate-800">
                    {s.refundRateByAmount != null ? `${(s.refundRateByAmount * 100).toFixed(1)}%` : "—"}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    均退 ¥{s.avgRefundAmount.toFixed(1)}
                  </div>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                <div className="rounded-lg border border-slate-100 bg-white p-2.5">
                  <div className="text-[11px] text-slate-500">仅退款 / 退货退款</div>
                  <div className="font-semibold text-slate-800">
                    {s.refundOnly} / {s.returnRefund}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-100 bg-white p-2.5">
                  <div className="text-[11px] text-slate-500">全额退 / 撤销</div>
                  <div className="font-semibold text-slate-800">
                    {s.fullRefund} / {s.revoked}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-100 bg-white p-2.5">
                  <div className="text-[11px] text-slate-500">售后单总数</div>
                  <div className="font-semibold text-slate-800">{s.total}</div>
                </div>
                <div className="rounded-lg border border-slate-100 bg-white p-2.5">
                  <div className="text-[11px] text-slate-500">拦截标记</div>
                  <div className="font-semibold text-slate-800">{s.intercept}</div>
                </div>
              </div>
            </>
          )}
        </div>

        {result && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-slate-800">排行</h3>
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      ["reason", "原因大项"],
                      ["desc", "描述小项"],
                      ["cross", "原因×描述"],
                      ["sku", "规格"],
                      ["product", "商品"],
                    ] as const
                  ).map(([k, lab]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setRankView(k)}
                      className={`px-2 py-0.5 rounded text-[11px] border ${
                        rankView === k
                          ? "bg-rose-600 text-white border-rose-600"
                          : "bg-white text-slate-600 border-slate-200"
                      }`}
                    >
                      {lab}
                    </button>
                  ))}
                </div>
              </div>
              <HBarList key={rankView} items={rankItems} totalBase={s.success} />
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">退款类型 / 状态</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <HBarList
                  totalBase={s.success}
                  items={result.typeRank.slice(0, 6).map((x) => ({
                    label: x.name,
                    value: x.count,
                    sub: `¥${x.refundAmount.toFixed(0)}`,
                    color: "#f97316",
                  }))}
                />
                <HBarList
                  totalBase={s.success}
                  items={result.statusRank.slice(0, 6).map((x) => ({
                    label: x.name,
                    value: x.count,
                    color: "#64748b",
                  }))}
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
                  明细
                  <span className="ml-2 text-slate-400 font-normal">
                    {Math.max(0, table.length - 1)} 行
                  </span>
                </h3>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {FILTER_BTNS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={`px-2.5 py-1 rounded-lg text-xs border ${
                      filter === key
                        ? "bg-rose-600 text-white border-rose-600"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {label}
                    <span className="ml-1 opacity-80">{filterCount(key)}</span>
                  </button>
                ))}
              </div>
            </div>
            <DataTable data={table} headers={(table[0] || []).map(String)} stickyCols={3} />
          </div>
        )}

        {!result && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 p-6 text-sm text-slate-500 leading-relaxed">
            <div className="font-medium text-slate-700 mb-2">怎么用</div>
            <ol className="list-decimal list-inside space-y-1">
              <li>后台导出售后列表 → 导入本页</li>
              <li>可选：导入同期订单，或先在经营分析导入订单（算售后率更准）</li>
              <li>点「开始售后分析」：原因大项 / 描述小项合并 / 原因×描述 / 规格</li>
              <li>导出全量 Excel 给财务或运营</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
