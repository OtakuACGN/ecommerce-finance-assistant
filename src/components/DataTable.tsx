import { useState, useMemo, useEffect, useRef, useCallback } from "react";

interface DataTableProps {
  data: any[][];
  headers: string[];
  stickyCols?: number;
  maxHeightClass?: string;
}

type SortDirection = "asc" | "desc" | null;

/**
 * 阅读优先：
 * - 纵向只走页面总滚动，不在表格里再开一套上下滚
 * - 横向用悬浮底条（固定在可视区底部）
 * - 表头不做纵向 sticky（避免「表头卡在中间行」）
 * - 左侧冻结列仅横向 sticky
 * - data 约定：第 0 行为表头，与 headers 一致；body 从第 1 行起
 */
export default function DataTable({
  data,
  headers,
  stickyCols = 2,
  maxHeightClass = "",
}: DataTableProps) {
  const [sortColumn, setSortColumn] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [tableWidth, setTableWidth] = useState(0);
  const [needHScroll, setNeedHScroll] = useState(false);
  const [floatBar, setFloatBar] = useState<{
    left: number;
    width: number;
    bottom: number;
    visible: boolean;
  }>({ left: 0, width: 0, bottom: 0, visible: false });

  const rowsPerPage = 100;
  const rootRef = useRef<HTMLDivElement>(null);
  const hWrapRef = useRef<HTMLDivElement>(null);
  const floatBarRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const syncing = useRef(false);

  useEffect(() => {
    setCurrentPage(1);
    setSortColumn(null);
    setSortDirection(null);
    if (hWrapRef.current) hWrapRef.current.scrollLeft = 0;
    if (floatBarRef.current) floatBarRef.current.scrollLeft = 0;
  }, [data, headers]);

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

  /** 从 data 抽出数据行：若首行与 headers 一致则跳过首行，否则兼容「仅 body」传入 */
  const bodyRows = useMemo(() => {
    if (!data || data.length === 0) return [];
    const first = data[0] || [];
    const hdrs = displayHeaders;
    if (hdrs.length === 0) return data.slice(1);
    const sameAsHeader =
      hdrs.length > 0 &&
      hdrs.every((h, i) => String(first[i] ?? "") === String(h ?? ""));
    if (sameAsHeader) return data.slice(1);
    // 兼容：首格等于 headers[0] 且第二列也一致（报表表头）
    if (
      hdrs.length >= 2 &&
      String(first[0] ?? "") === String(hdrs[0] ?? "") &&
      String(first[1] ?? "") === String(hdrs[1] ?? "")
    ) {
      return data.slice(1);
    }
    // 首行不像表头时整表当 body（避免误删第一行数据）
    const numericLike = first.filter((c) => {
      const s = String(c ?? "").trim();
      if (!s) return false;
      return !isNaN(Number(s.replace(/[,%￥¥]/g, "")));
    }).length;
    if (numericLike >= Math.max(1, Math.floor(first.length / 3))) {
      return data;
    }
    // 默认约定：第 0 行是表头
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

  const totalPages = Math.max(1, Math.ceil(sortedData.length / rowsPerPage));
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return sortedData.slice(start, start + rowsPerPage);
  }, [sortedData, currentPage]);

  const measureTable = useCallback(() => {
    const el = tableRef.current;
    const wrap = hWrapRef.current;
    if (!el || !wrap) return;
    const tw = Math.max(el.scrollWidth || 0, el.offsetWidth || 0);
    setTableWidth(tw);
    setNeedHScroll(tw > wrap.clientWidth + 2);
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
  }, [paginatedData, displayHeaders, freezeN, measureTable]);

  /** 悬浮横条钉在表格可见区域底部 */
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
    const t = window.setInterval(updateFloatBar, 400);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      window.clearInterval(t);
    };
  }, [updateFloatBar, paginatedData, tableWidth]);

  const syncFromWrap = useCallback(() => {
    if (syncing.current) return;
    const wrap = hWrapRef.current;
    if (!wrap) return;
    syncing.current = true;
    if (floatBarRef.current) floatBarRef.current.scrollLeft = wrap.scrollLeft;
    requestAnimationFrame(() => {
      syncing.current = false;
    });
    updateFloatBar();
  }, [updateFloatBar]);

  const syncFromFloat = useCallback(() => {
    if (syncing.current) return;
    const wrap = hWrapRef.current;
    const flt = floatBarRef.current;
    if (!wrap || !flt) return;
    syncing.current = true;
    wrap.scrollLeft = flt.scrollLeft;
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  }, []);

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

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center bg-white min-h-[200px]">
        <div className="text-center text-slate-400">
          <p className="text-lg">暂无数据</p>
          <p className="text-sm mt-2">请导入文件或生成报表</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`data-table-root w-full bg-white ${maxHeightClass}`}
    >
      {/* 仅横向滚动，纵向交给页面；表头不纵向 sticky，避免「表头跑到中间行」 */}
      <div
        ref={hWrapRef}
        className="data-table-hwrap"
        onScroll={syncFromWrap}
      >
        <table
          ref={tableRef}
          className="border-collapse text-sm w-max min-w-full"
        >
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
                    className={`px-3 py-2.5 text-left text-xs font-semibold text-slate-600 cursor-pointer hover:bg-blue-50 border-b border-slate-200 bg-slate-50 ${
                      frozen ? "z-40 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]" : "z-30"
                    }`}
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
            {paginatedData.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="hover:bg-slate-50/90 border-b border-slate-100 group"
              >
                <td
                  className="px-2 py-2 text-xs text-slate-400 whitespace-nowrap align-top sticky left-0 bg-white group-hover:bg-slate-50 z-20"
                  style={{ minWidth: COL_NUM_W, width: COL_NUM_W }}
                >
                  {(currentPage - 1) * rowsPerPage + rowIndex + 1}
                </td>
                {displayHeaders.map((_, cellIndex) => {
                  const cell = row?.[cellIndex];
                  const text =
                    cell === null || cell === undefined ? "" : String(cell);
                  const frozen = cellIndex < freezeN;
                  return (
                    <td
                      key={cellIndex}
                      className={`px-3 py-2 text-sm text-slate-700 align-top ${
                        frozen
                          ? "bg-white group-hover:bg-slate-50 z-20 font-medium shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]"
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
                        {text}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-slate-200 px-4 py-2 flex items-center justify-between bg-slate-50 text-sm text-slate-600 gap-2">
        <div className="break-words pr-3 min-w-0">
          共 <strong>{sortedData.length}</strong> 行
          {displayHeaders.length > 0 && (
            <span className="text-slate-400"> · {displayHeaders.length} 列</span>
          )}
          <span className="text-slate-400 text-xs ml-2">
            页面上下滚 · 底栏悬浮左右滑 · 前 {freezeN} 列左右冻结
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 border rounded-lg hover:bg-white disabled:opacity-40"
          >
            上一页
          </button>
          <span>
            第 {currentPage} / {totalPages} 页
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
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
          title="悬浮横向滚动（固定在可视区底部）"
        >
          <div
            ref={floatBarRef}
            className="data-table-floatbar-track"
            onScroll={syncFromFloat}
          >
            <div
              style={{ width: Math.max(tableWidth, 1), height: 1 }}
              aria-hidden
            />
          </div>
          <div className="data-table-floatbar-label">左右滑动查看更多列</div>
        </div>
      )}
    </div>
  );
}
