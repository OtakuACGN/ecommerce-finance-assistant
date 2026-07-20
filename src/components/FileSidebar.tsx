import { FileText, X, Users, FolderOpen } from "lucide-react";
import { FileData } from "../utils/excel";

interface FileSidebarProps {
  files: FileData[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onRemove: (index: number) => void;
  isMerged: boolean;
}

export default function FileSidebar({
  files,
  selectedIndex,
  onSelect,
  onRemove,
  isMerged,
}: FileSidebarProps) {
  if (isMerged) {
    return (
      <div className="w-60 bg-white/80 border-r border-slate-200 p-4 backdrop-blur">
        <div className="flex items-center gap-2 text-violet-700 mb-3">
          <Users size={18} />
          <span className="font-semibold">已合并视图</span>
        </div>
        <div className="text-sm text-slate-500 panel-card p-3">
          {files.length} 个文件已合并为一张表
        </div>
      </div>
    );
  }

  return (
    <div className="w-60 bg-white/75 border-r border-slate-200 flex flex-col backdrop-blur">
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-center gap-2 text-slate-700">
          <FolderOpen size={16} className="text-blue-600" />
          <h2 className="font-semibold">文件列表</h2>
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            {files.length}
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {files.length === 0 ? (
          <div className="text-center text-slate-400 py-10 px-3">
            <FileText size={40} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">暂无文件</p>
            <p className="text-xs mt-1 leading-relaxed">导入 CSV / Excel 后在此切换</p>
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((file, index) => (
              <div
                key={index}
                onClick={() => onSelect(index)}
                className={`p-3 rounded-xl cursor-pointer transition-all border ${
                  selectedIndex === index
                    ? "bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-300 shadow-sm"
                    : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <FileText size={14} className="text-slate-500" />
                    </div>
                    <span className="text-sm text-slate-700 truncate font-medium" title={file.name}>
                      {file.name}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(index);
                    }}
                    className="text-slate-300 hover:text-rose-500 flex-shrink-0"
                  >
                    <X size={15} />
                  </button>
                </div>
                <div className="text-[11px] text-slate-400 mt-2 ml-9">
                  {Math.max(0, file.data.length - 1)} 行 · {file.headers.length} 列
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
