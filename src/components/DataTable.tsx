import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";

interface DataTableProps {
  data: any[][];
  headers: string[];
  stickyCols?: number;
  maxHeightClass?: string;
  /** 关闭虚拟滚动（仅分页） */
  disableVirtual?: boolean;
}

type SortDirection = "asc" | "desc" | null;

const ROW_H = 40;
const OVERSCAN = 10;
const PAGE_SIZES = [25, 50, 100, 200, 500, 1000];

/**
 * 阅读优先 + 性能：
 * - 默认分页，避免 1k+ 行一次进 DOM
 * - 当前页行数较多时启用窗口虚拟滚动（只挂载可视行）
 * - 横向悬浮底条；左侧冻结列
 * - data 约定：第 0 行为表头
 */
export default function DataTable({
  data,
  headers,
  stickyCols = 2,
  maxHeightClass = "",
  disableVirtual = false,
}: DataTableProps) {
  const [sortColumn, setSortColumn] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [rowsPerPage, setRowsPerPage] = useState(() => {
    try {
      const n = Number(localStorage.getItem("dct_table_page_size") || 100);
      return PAGE_SIZES.includes(n) ? n : 100;
    } catch {
      return 100;
    }
  });
  const [tableWidth, setTableWidth] = useState(0);
  const [needHScroll, setNeedHScroll] = useState(false);
  const [hMetrics, setHMetrics] = useState({ left: 0, max: 0, view: 1, content: 1 });
  const [floatBar, setFloatBar] = useState<{
    left: number;
    width: number;
    bottom: number;
    visible: boolean;
  }>({ left: 0, width: 0, bottom: 0, visible: false });
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(480);

  const rootRef = useRef<HTMLDivElement>(null);
  const hWrapRef = useRef<HTMLDivElement>(null);
  const vWrapRef = useRef<HTMLDivElement>(null);
  const floatTrackRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const dragRef = useRef<{ active: boolean; startX: number; startLeft: number } | null>(null);

  useEffect(() => {
    setCurrentPage(1);
    setPageInput("1");
    setSortColumn(null);
    setSortDirection(null);
    setScrollTop(0);
    if (hWrapRef.current) hWrapRef.current.scrollLeft = 0;
    if (vWrapRef.current) vWrapRef.current.scrollTop = 0;
    setHMetrics((m) => ({ ...m, left: 0 }));
  }, [data, headers, rowsPerPage]);

  useEffect(() => {
    try {
      localStorage.setItem("dct_table_page_size", String(rowsPerPage));
    } catch {
      /* ignore */
    }
  }, [rowsPerPage]);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const displayHeaders =
    headers && headers.length > 0
      ? headers
      : (data[0] || []).map((h, i) => String(h ?? `列${i + 1}`));

  const freezeN = Math.max(0, Math.min(stickyCols, displayHeaders.length));
  const COL_NUM_W = 48;
  const COL_STICKY_W = [168, 200, 150, 140];
  const stickyLeft = (dataColIndex: number) => {
    let left = COL_NUM_W;
    for (let i = 0; i < dataColIndex && i < freezeN; i++) {
      left += COL_STICKY_W[i] ?? 140;
    }
    return left;
  };
  const stickyWidth = (dataColIndex: number) => COL_STICKY_W[dataColIndex] ?? 140;

  const bodyRows = useMemo(() => {
    if (!data || data.length === 0) return [];
    const first = data[0] || [];
    const hdrs = displayHeaders;
    if (hdrs.length === 0) return data.slice(1);
    const sameAsHeader =
      hdrs.length > 0 &&
      hdrs.every((h, i) => String(first[i] ?? "") === String(h ?? ""));
    if (sameAsHeader) return data.slice(1);
    if (
      hdrs.length >= 2 &&
      String(first[0] ?? "") === String(hdrs[0] ?? "") &&
      String(first[1] ?? "") === String(hdrs[1] ?? "")
    ) {
      return data.slice(1);
    }
    const numericLike = first.filter((c) => {
      const s = String(c ?? "").trim();
      if (!s) return false;
      return !isNaN(Number(s.replace(/[,%￥¥]/g, "")));
    }).length;
    if (numericLike >= Math.max(1, Math.floor(first.length / 3))) {
      return data;
    }
    return data.slice(1);
  }, [data, displayHeaders]);

  const sortedData = useMemo(() => {
    if (!bodyRows.length) return [];
    if (sortColumn === null || sortDirection === null) return bodyRows;
    const rows = [...bodyRows];
    rows.sort((a, b) => {
      const aVal = a?.[sortColumn];
      const bVal = b?.[sortColumn];
      if (aVal === null || aVal === undefined || aVal === "") return 1;
      if (bVal === null || bVal === undefined || bVal === "") return -1;
      const aNum = Number(String(aVal).replace(/[,%￥¥]/g, ""));
      const bNum = Number(String(bVal).replace(/[,%￥¥]/g, ""));
      if (
        !isNaN(aNum) &&
        !isNaN(bNum) &&
        String(aVal).trim() !== "" &&
        String(bVal).trim() !== ""
      ) {
        return sortDirection === "asc" ? aNum - bNum : bNum - aNum;
      }
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      return sortDirection === "asc"
        ? aStr.localeCompare(bStr, "zh-CN")
        : bStr.localeCompare(aStr, "zh-CN");
    });
    return rows;
  }, [bodyRows, sortColumn, sortDirection]);

  const isNumericLike = (raw: unknown): boolean => {
    if (raw === null || raw === undefined || raw === "") return false;
    const s = String(raw).trim();
    if (!s) return false;
    if (/^[-+]?\d{1,3}(,\d{3})*(\.\d+)?%?$/.test(s)) return true;
    if (/^[-+]?\d+(\.\d+)?%?$/.test(s)) return true;
    if (/^[¥￥$]?\s*[-+]?\d{1,3}(,\d{3})*(\.\d+)?$/.test(s)) return true;
    if (/^[¥￥$]?\s*[-+]?\d+(\.\d+)?$/.test(s)) return true;
    const n = Number(s.replace(/[,%￥¥$\s]/g, ""));
    return Number.isFinite(n) && /\d/.test(s) && s.length <= 18;
  };

  const isNegativeValue = (raw: unknown): boolean => {
    if (!isNumericLike(raw)) return false;
    const n = Number(String(raw).replace(/[,%￥¥$\s]/g, ""));
    return Number.isFinite(n) && n < 0;
  };

  const numericCols = useMemo(() => {
    const sample = bodyRows.slice(0, 40);
    return displayHeaders.map((_, colIdx) => {
      let hits = 0;
      let total = 0;
      for (const row of sample) {
        const v = row?.[colIdx];
        if (v === null || v === undefined || String(v).trim() === "") continue;
        total += 1;
        if (isNumericLike(v)) hits += 1;
      }
      return total > 0 && hits / total >= 0.6;
    });
  }, [bodyRows, displayHeaders]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedData = useMemo(() => {
    const start = (safePage - 1) * rowsPerPage;
    return sortedData.slice(start, start + rowsPerPage);
  }, [sortedData, safePage, rowsPerPage]);

  // 页内虚拟滚动：当前页 > 60 行时只渲染可视窗口
  const useVirtual = !disableVirtual && paginatedData.length > 60;
  const virtual = useMemo(() => {
    if (!useVirtual) {
      return {
        start: 0,
        end: paginatedData.length,
        padTop: 0,
        padBottom: 0,
        rows: paginatedData,
      };
    }
    const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
    const visible = Math.ceil(viewportH / ROW_H) + OVERSCAN * 2;
    const end = Math.min(paginatedData.length, start + visible);
    return {
      start,
      end,
      padTop: start * ROW_H,
      padBottom: Math.max(0, (paginatedData.length - end) * ROW_H),
      rows: paginatedData.slice(start, end),
    };
  }, [useVirtual, paginatedData, scrollTop, viewportH]);

  const measureTable = useCallback(() => {
    const el = tableRef.current;
    const wrap = hWrapRef.current;
    if (!el || !wrap) return;
    const view = wrap.clientWidth || 1;
    const content = Math.max(
      el.scrollWidth || 0,
      el.offsetWidth || 0,
      wrap.scrollWidth || 0,
    );
    const max = Math.max(0, content - view);
    const left = Math.min(Math.max(0, wrap.scrollLeft || 0), max);
    setTableWidth(content);
    setNeedHScroll(max > 2);
    setHMetrics({ left, max, view, content });
    if (wrap.scrollLeft !== left) wrap.scrollLeft = left;
  }, []);

  useEffect(() => {
    measureTable();
    const el = tableRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measureTable());
    ro.observe(el);
    if (hWrapRef.current) ro.observe(hWrapRef.current);
    window.addEventListener("resize", measureTable);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measureTable);
    };
  }, [paginatedData, displayHeaders, freezeN, measureTable, virtual.rows.length]);

  useEffect(() => {
    const v = vWrapRef.current || hWrapRef.current;
    if (!v || !useVirtual) return;
    const ro = new ResizeObserver(() => {
      setViewportH(v.clientHeight || 480);
    });
    ro.observe(v);
    setViewportH(v.clientHeight || 480);
    return () => ro.disconnect();
  }, [useVirtual, paginatedData.length]);

  const updateFloatBar = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const visibleTop = Math.max(rect.top, 0);
    const visibleBottom = Math.min(rect.bottom, vh);
    const visibleH = visibleBottom - visibleTop;
    const visible =
      needHScroll &&
      visibleH > 100 &&
      rect.right > 0 &&
      rect.left < vw &&
      rect.bottom > 60 &&
      rect.top < vh - 40;
    const bottom = Math.max(12, vh - visibleBottom + 12);
    setFloatBar({
      left: Math.max(8, rect.left + 8),
      width: Math.max(160, rect.width - 16),
      bottom,
      visible,
    });
  }, [needHScroll]);

  useEffect(() => {
    updateFloatBar();
    const onScroll = () => updateFloatBar();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [updateFloatBar, paginatedData, tableWidth]);

  const setWrapScrollLeft = useCallback((next: number) => {
    const wrap = hWrapRef.current;
    if (!wrap) return;
    const view = wrap.clientWidth || 1;
    const content = Math.max(
      wrap.scrollWidth || 0,
      tableRef.current?.scrollWidth || 0,
      view,
    );
    const max = Math.max(0, content - view);
    const left = Math.min(Math.max(0, next), max);
    wrap.scrollLeft = left;
    setHMetrics({ left, max, view, content });
    setNeedHScroll(max > 2);
    setTableWidth(content);
  }, []);

  const syncFromWrap = useCallback(() => {
    const wrap = hWrapRef.current;
    if (!wrap) return;
    const view = wrap.clientWidth || 1;
    const content = Math.max(
      wrap.scrollWidth || 0,
      tableRef.current?.scrollWidth || 0,
      view,
    );
    const max = Math.max(0, content - view);
    setHMetrics({ left: wrap.scrollLeft || 0, max, view, content });
    setNeedHScroll(max > 2);
    setTableWidth(content);
    updateFloatBar();
  }, [updateFloatBar]);

  const onFloatPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const track = floatTrackRef.current;
      if (!track || hMetrics.max <= 0) return;
      const rect = track.getBoundingClientRect();
      const trackW = Math.max(1, rect.width);
      const thumbRatio = Math.min(1, hMetrics.view / Math.max(hMetrics.content, 1));
      const thumbW = Math.max(28, trackW * thumbRatio);
      const travel = Math.max(1, trackW - thumbW);
      const x = e.clientX - rect.left;
      const thumbLeft = (hMetrics.left / hMetrics.max) * travel;
      const hitThumb = x >= thumbLeft - 2 && x <= thumbLeft + thumbW + 2;
      let nextLeft = hMetrics.left;
      if (!hitThumb) {
        nextLeft = ((x - thumbW / 2) / travel) * hMetrics.max;
        setWrapScrollLeft(nextLeft);
      }
      dragRef.current = {
        active: true,
        startX: e.clientX,
        startLeft: hitThumb ? hMetrics.left : nextLeft,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    [hMetrics, setWrapScrollLeft],
  );

  const onFloatPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      const track = floatTrackRef.current;
      if (!drag?.active || !track || hMetrics.max <= 0) return;
      const trackW = Math.max(1, track.getBoundingClientRect().width);
      const thumbRatio = Math.min(1, hMetrics.view / Math.max(hMetrics.content, 1));
      const thumbW = Math.max(28, trackW * thumbRatio);
      const travel = Math.max(1, trackW - thumbW);
      const dx = e.clientX - drag.startX;
      setWrapScrollLeft(drag.startLeft + (dx / travel) * hMetrics.max);
    },
    [hMetrics, setWrapScrollLeft],
  );

  const onFloatPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.active) {
      dragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const onFloatWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (hMetrics.max <= 0) return;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!delta) return;
      e.preventDefault();
      setWrapScrollLeft(hMetrics.left + delta);
    },
    [hMetrics, setWrapScrollLeft],
  );

  const handleSort = (columnIndex: number) => {
    if (sortColumn === columnIndex) {
      if (sortDirection === "asc") setSortDirection("desc");
      else if (sortDirection === "desc") {
        setSortColumn(null);
        setSortDirection(null);
      }
    } else {
      setSortColumn(columnIndex);
      setSortDirection("asc");
    }
  };

  const goPage = (p: number) => {
    const next = Math.max(1, Math.min(totalPages, p));
    setCurrentPage(next);
    setScrollTop(0);
    if (vWrapRef.current) vWrapRef.current.scrollTop = 0;
  };

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center bg-gradient-to-b from-white to-slate-50 min-h-[240px] rounded-xl border border-dashed border-slate-200">
        <div className="text-center px-6 py-8 max-w-sm">
          <div className="mx-auto mb-3 w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl font-bold">
            表
          </div>
          <p className="text-base font-semibold text-slate-700">暂无数据</p>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            导入订单 / 账单 / 商品资料后，在「经营分析」生成报表，结果会显示在这里。
          </p>
        </div>
      </div>
    );
  }

  const colSpan = displayHeaders.length + 1;
  const renderRow = (row: any[], _rowIndex: number, absoluteIndex: number) => {
    const pendingCost = (row || []).some((c) => {
      const s = String(c ?? "");
      return s === "待填成本" || s === "待填" || s.includes("【待填】");
    });
    const partialRefund = (row || []).some(
      (c) => String(c ?? "") === "部分退" || String(c ?? "").startsWith("部分退："),
    );
    const rowTint = pendingCost
      ? "bg-amber-50/90"
      : partialRefund
        ? "bg-orange-50/70"
        : absoluteIndex % 2 === 1
          ? "bg-slate-50/70"
          : "bg-white";
    return (
      <tr
        key={absoluteIndex}
        className={`border-b border-slate-100 group transition-colors ${rowTint} hover:bg-blue-50/50`}
        style={useVirtual ? { height: ROW_H } : { contentVisibility: "auto", containIntrinsicSize: "0 40px" }}
        title={pendingCost ? "待填成本" : partialRefund ? "部分退款订单" : undefined}
      >
        <td
          className={`px-2 py-2 text-xs text-slate-400 whitespace-nowrap align-top sticky left-0 z-20 group-hover:bg-blue-50/80 ${rowTint}`}
          style={{ minWidth: COL_NUM_W, width: COL_NUM_W }}
        >
          {(safePage - 1) * rowsPerPage + absoluteIndex + 1}
        </td>
        {displayHeaders.map((_, cellIndex) => {
          const cell = row?.[cellIndex];
          const text = cell === null || cell === undefined ? "" : String(cell);
          const frozen = cellIndex < freezeN;
          const numeric = numericCols[cellIndex];
          const negative = isNegativeValue(cell);
          return (
            <td
              key={cellIndex}
              className={`px-3 py-2 text-sm align-top ${
                numeric ? "text-right tabular-nums" : "text-left"
              } ${negative ? "text-rose-600 font-medium" : "text-slate-700"} ${
                frozen
                  ? `${rowTint} group-hover:bg-blue-50/80 z-20 font-medium shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]`
                  : ""
              }`}
              style={
                frozen
                  ? {
                      position: "sticky",
                      left: stickyLeft(cellIndex),
                      minWidth: stickyWidth(cellIndex),
                      maxWidth: stickyWidth(cellIndex) + 100,
                    }
                  : undefined
              }
              title={text}
            >
              <div
                className={
                  frozen
                    ? "whitespace-nowrap overflow-hidden text-ellipsis max-w-full"
                    : "whitespace-pre-wrap break-words min-w-[5rem] max-w-[36rem]"
                }
              >
                {text === "否" && displayHeaders[cellIndex]?.includes("匹配") ? (
                  <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-900">
                    否
                  </span>
                ) : text === "待填成本" || text === "待填" ? (
                  <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-amber-200/80 text-amber-950">
                    {text}
                  </span>
                ) : (
                  text
                )}
              </div>
            </td>
          );
        })}
      </tr>
    );
  };

  const tableEl = (
    <table ref={tableRef} className="border-collapse text-sm w-max min-w-full">
      <thead className="bg-slate-50 z-30 shadow-sm">
        <tr>
          <th
            className="px-2 py-2.5 text-left text-xs font-semibold text-slate-500 whitespace-nowrap border-b border-slate-200 bg-slate-50 sticky left-0 z-40"
            style={{ minWidth: COL_NUM_W, width: COL_NUM_W }}
          >
            #
          </th>
          {displayHeaders.map((header, index) => {
            const frozen = index < freezeN;
            return (
              <th
                key={index}
                onClick={() => handleSort(index)}
                className={`px-3 py-2.5 text-xs font-semibold text-slate-600 cursor-pointer hover:bg-blue-50 border-b border-slate-200 bg-slate-50 ${
                  numericCols[index] ? "text-right" : "text-left"
                } ${frozen ? "z-40 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]" : "z-30"}`}
                style={
                  frozen
                    ? {
                        position: "sticky",
                        left: stickyLeft(index),
                        minWidth: stickyWidth(index),
                        maxWidth: stickyWidth(index) + 100,
                      }
                    : { minWidth: "6.5rem" }
                }
                title={String(header || "")}
              >
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                  {String(header || `列${index + 1}`)}
                  {sortColumn === index && (
                    <span className="text-blue-500">
                      {sortDirection === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </span>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {useVirtual && virtual.padTop > 0 && (
          <tr aria-hidden style={{ height: virtual.padTop }}>
            <td colSpan={colSpan} style={{ padding: 0, border: 0, height: virtual.padTop }} />
          </tr>
        )}
        {virtual.rows.map((row, i) =>
          renderRow(row, i, virtual.start + i),
        )}
        {useVirtual && virtual.padBottom > 0 && (
          <tr aria-hidden style={{ height: virtual.padBottom }}>
            <td colSpan={colSpan} style={{ padding: 0, border: 0, height: virtual.padBottom }} />
          </tr>
        )}
      </tbody>
    </table>
  );

  return (
    <div ref={rootRef} className={`data-table-root w-full bg-white ${maxHeightClass}`}>
      <div
        ref={(node) => {
          hWrapRef.current = node;
          vWrapRef.current = node;
        }}
        className={`data-table-hwrap ${useVirtual ? "data-table-hwrap--virtual" : ""}`}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (useVirtual) setScrollTop(el.scrollTop);
          syncFromWrap();
        }}
      >
        {tableEl}
      </div>

      <div className="border-t border-slate-200 px-4 py-2 flex items-center justify-between bg-slate-50 text-sm text-slate-600 gap-2 flex-wrap">
        <div className="break-words pr-3 min-w-0">
          共 <strong>{sortedData.length}</strong> 行
          {displayHeaders.length > 0 && (
            <span className="text-slate-400"> · {displayHeaders.length} 列</span>
          )}
          <span className="text-slate-400 text-xs ml-2">
            本页 {paginatedData.length} 行
            {useVirtual ? " · 虚拟滚动" : ""} · 前 {freezeN} 列冻结
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          <label className="flex items-center gap-1 text-xs text-slate-500">
            每页
            <select
              value={rowsPerPage}
              onChange={(e) => {
                setRowsPerPage(Number(e.target.value) || 100);
                setCurrentPage(1);
              }}
              className="border rounded-lg px-1.5 py-1 bg-white text-xs"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => goPage(safePage - 1)}
            disabled={safePage <= 1}
            className="px-3 py-1 border rounded-lg hover:bg-white disabled:opacity-40"
          >
            上一页
          </button>
          <span className="text-xs flex items-center gap-1">
            第
            <input
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value.replace(/[^\d]/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") goPage(parseInt(pageInput, 10) || 1);
              }}
              onBlur={() => goPage(parseInt(pageInput, 10) || 1)}
              className="w-12 border rounded px-1 py-0.5 text-center bg-white"
            />
            / {totalPages} 页
          </span>
          <button
            type="button"
            onClick={() => goPage(safePage + 1)}
            disabled={safePage >= totalPages}
            className="px-3 py-1 border rounded-lg hover:bg-white disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      </div>

      {floatBar.visible && (
        <div
          className="data-table-floatbar"
          style={{
            position: "fixed",
            left: floatBar.left,
            width: floatBar.width,
            bottom: floatBar.bottom,
            zIndex: 60,
          }}
          title="拖动滑块横向浏览更多列"
          onWheel={onFloatWheel}
        >
          {(() => {
            const trackW = Math.max(1, floatBar.width - 20);
            const thumbRatio = Math.min(1, hMetrics.view / Math.max(hMetrics.content, 1));
            const thumbW = Math.max(28, trackW * thumbRatio);
            const travel = Math.max(1, trackW - thumbW);
            const thumbLeft =
              hMetrics.max > 0 ? (hMetrics.left / hMetrics.max) * travel : 0;
            return (
              <div
                ref={floatTrackRef}
                className="data-table-floatbar-track"
                onPointerDown={onFloatPointerDown}
                onPointerMove={onFloatPointerMove}
                onPointerUp={onFloatPointerUp}
                onPointerCancel={onFloatPointerUp}
                role="slider"
                aria-valuemin={0}
                aria-valuemax={Math.round(hMetrics.max)}
                aria-valuenow={Math.round(hMetrics.left)}
                aria-label="表格横向滚动"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (hMetrics.max <= 0) return;
                  const step = Math.max(40, hMetrics.view * 0.2);
                  if (e.key === "ArrowRight" || e.key === "PageDown") {
                    e.preventDefault();
                    setWrapScrollLeft(hMetrics.left + step);
                  } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
                    e.preventDefault();
                    setWrapScrollLeft(hMetrics.left - step);
                  } else if (e.key === "Home") {
                    e.preventDefault();
                    setWrapScrollLeft(0);
                  } else if (e.key === "End") {
                    e.preventDefault();
                    setWrapScrollLeft(hMetrics.max);
                  }
                }}
              >
                <div
                  className="data-table-floatbar-thumb"
                  style={{ width: thumbW, transform: `translateX(${thumbLeft}px)` }}
                />
              </div>
            );
          })()}
          <div className="data-table-floatbar-label">
            拖动滑块查看更多列
            {hMetrics.max > 0
              ? ` · ${Math.round((hMetrics.left / hMetrics.max) * 100)}%`
              : ""}
          </div>
        </div>
      )}
    </div>
  );
}
