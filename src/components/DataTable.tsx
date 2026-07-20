import { useState, useMemo, useEffect } from "react";

interface DataTableProps {
  data: any[][];
  headers: string[];
}

type SortDirection = "asc" | "desc" | null;

export default function DataTable({ data, headers }: DataTableProps) {
  const [sortColumn, setSortColumn] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 100;

  useEffect(() => {
    setCurrentPage(1);
  }, [data, headers]);

  const displayHeaders =
    headers && headers.length > 0
      ? headers
      : (data[0] || []).map((h, i) => String(h ?? `列${i + 1}`));

  const sortedData = useMemo(() => {
    if (!data || data.length <= 1) return [];
    if (sortColumn === null || sortDirection === null) return data.slice(1);

    const rows = [...data.slice(1)];
    rows.sort((a, b) => {
      const aVal = a?.[sortColumn];
      const bVal = b?.[sortColumn];
      if (aVal === null || aVal === undefined || aVal === "") return 1;
      if (bVal === null || bVal === undefined || bVal === "") return -1;
      const aNum = Number(String(aVal).replace(/[,%]/g, ""));
      const bNum = Number(String(bVal).replace(/[,%]/g, ""));
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
  }, [data, sortColumn, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / rowsPerPage));
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return sortedData.slice(start, start + rowsPerPage);
  }, [sortedData, currentPage]);

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
      <div className="flex-1 flex items-center justify-center bg-white min-h-[200px]">
        <div className="text-center text-slate-400">
          <p className="text-lg">暂无数据</p>
          <p className="text-sm mt-2">请导入文件或生成报表</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-white/95 w-full min-h-[320px] max-h-[min(78vh,860px)]">
      <div className="flex-1 overflow-auto overscroll-contain">
        <table className="border-collapse text-sm min-w-full w-max">
          <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 whitespace-nowrap border-b border-slate-200 bg-slate-50 sticky left-0 z-20 min-w-[3rem]">
                #
              </th>
              {displayHeaders.map((header, index) => (
                <th
                  key={index}
                  onClick={() => handleSort(index)}
                  className={`px-3 py-2.5 text-left text-xs font-semibold text-slate-600 cursor-pointer hover:bg-blue-50 border-b border-slate-200 bg-slate-50 ${
                    index === 0 ? "sticky left-12 z-20 min-w-[10rem]" : "min-w-[6rem]"
                  }`}
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
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="hover:bg-slate-50/90 border-b border-slate-100"
              >
                <td className="px-3 py-2 text-xs text-slate-400 whitespace-nowrap align-top sticky left-0 bg-white z-10">
                  {(currentPage - 1) * rowsPerPage + rowIndex + 1}
                </td>
                {displayHeaders.map((_, cellIndex) => {
                  const cell = row?.[cellIndex];
                  const text =
                    cell === null || cell === undefined ? "" : String(cell);
                  const isFirst = cellIndex === 0;
                  return (
                    <td
                      key={cellIndex}
                      className={`px-3 py-2 text-sm text-slate-700 align-top ${
                        isFirst ? "sticky left-12 bg-white z-10 font-medium" : ""
                      }`}
                      title={text}
                    >
                      <div className="whitespace-pre-wrap break-words min-w-[5rem] max-w-[42rem]">
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

      <div className="border-t border-slate-200 px-4 py-2 flex items-center justify-between bg-slate-50/95 text-sm text-slate-600 flex-shrink-0">
        <div className="break-words pr-3">
          共 <strong>{sortedData.length}</strong> 行
          {displayHeaders.length > 0 && (
            <span className="text-slate-400"> · {displayHeaders.length} 列</span>
          )}
          <span className="text-slate-400 text-xs ml-2">
            （可左右/上下滚动查看完整内容）
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
    </div>
  );
}
