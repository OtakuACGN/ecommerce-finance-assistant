import { Database, FileText, Layers, Filter } from "lucide-react";

interface StatusBarProps {
  rowCount: number;
  filteredRowCount: number;
  fileCount: number;
  selectedFile: string | null;
  isMerged: boolean;
  isFiltered: boolean;
}

export default function StatusBar({
  rowCount,
  filteredRowCount,
  fileCount,
  selectedFile,
  isMerged,
  isFiltered,
}: StatusBarProps) {
  return (
    <div className="bg-white/90 border-t border-slate-200 px-4 py-2 flex items-center gap-5 text-xs text-slate-600 backdrop-blur">
      <div className="flex items-center gap-1.5">
        <Database size={12} className="text-blue-500" />
        <span>
          行数:{" "}
          <strong className="text-slate-800">
            {filteredRowCount}
            {isFiltered ? ` / ${rowCount}` : ""}
          </strong>
        </span>
        {isFiltered && <Filter size={12} className="text-blue-500" />}
      </div>

      <div className="flex items-center gap-1.5">
        <FileText size={12} className="text-slate-400" />
        <span>
          文件: <strong className="text-slate-800">{fileCount}</strong>
        </span>
      </div>

      {isMerged && (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">
          <Layers size={12} />
          <span className="font-medium">已合并</span>
        </div>
      )}

      {selectedFile && !isMerged && (
        <div className="flex-1 text-right truncate text-slate-400">当前: {selectedFile}</div>
      )}
      <div className="text-slate-300">店财通</div>
    </div>
  );
}
