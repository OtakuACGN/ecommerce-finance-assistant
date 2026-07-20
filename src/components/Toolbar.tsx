import { useState, type ReactNode } from "react";
import {
  Upload,
  Download,
  Merge,
  Trash2,
  Scissors,
  Eraser,
  Undo2,
  Calendar,
  Columns,
  Pill,
  Wand2,
} from "lucide-react";

interface ToolbarProps {
  onImport: () => void;
  onShowExportPanel: () => void;
  onMerge: () => void;
  onDeduplicate: (columnIndex: number) => void;
  onCleanEmpty: () => void;
  onTrimWhitespace: () => void;
  onClear: () => void;
  onUndo: () => void;
  onStandardizeDate: () => void;
  onFillEmpty: (value: string) => void;
  onSelectColumns: (selectedCols: number[]) => void;
  onOneClickClean: () => void;
  hasData: boolean;
  canMerge: boolean;
  headers: string[];
  canUndo: boolean;
  desktopReady: boolean;
}

function ToolBtn({
  onClick,
  disabled,
  className,
  children,
  title,
}: {
  onClick: () => void;
  disabled?: boolean;
  className: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium text-white transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-105 active:scale-[0.98] ${className}`}
    >
      {children}
    </button>
  );
}

export default function Toolbar({
  onImport,
  onShowExportPanel,
  onMerge,
  onDeduplicate,
  onCleanEmpty,
  onTrimWhitespace,
  onClear,
  onUndo,
  onStandardizeDate,
  onFillEmpty,
  onSelectColumns,
  onOneClickClean,
  hasData,
  canMerge,
  headers,
  canUndo,
  desktopReady,
}: ToolbarProps) {
  const [showColPicker, setShowColPicker] = useState(false);
  const [showFillModal, setShowFillModal] = useState(false);
  const [fillValue, setFillValue] = useState("0");
  const [selectedCols, setSelectedCols] = useState<number[]>([]);
  const [dedupCol, setDedupCol] = useState<number>(-1);

  const handleColToggle = (i: number) => {
    setSelectedCols((prev) =>
      prev.includes(i) ? prev.filter((c) => c !== i) : [...prev, i].sort((a, b) => a - b),
    );
  };

  return (
    <>
      <div className="bg-white/90 border-b border-slate-200 px-4 py-2.5 flex items-center gap-2 flex-wrap shadow-soft backdrop-blur">
        <ToolBtn
          onClick={onImport}
          disabled={!desktopReady}
          className="bg-gradient-to-r from-blue-600 to-indigo-600"
          title="导入 CSV / Excel"
        >
          <Upload size={15} />
          <span>导入</span>
        </ToolBtn>

        <div className="h-5 w-px bg-slate-200" />

        <ToolBtn
          onClick={onShowExportPanel}
          disabled={!hasData || !desktopReady}
          className="bg-gradient-to-r from-emerald-500 to-teal-600"
        >
          <Download size={15} />
          <span>导出</span>
        </ToolBtn>

        <div className="h-5 w-px bg-slate-200" />

        <ToolBtn onClick={onMerge} disabled={!canMerge} className="bg-gradient-to-r from-violet-500 to-purple-600">
          <Merge size={15} />
          <span>合并</span>
        </ToolBtn>

        <div className="h-5 w-px bg-slate-200" />

        <div className="relative flex items-center gap-1">
          <ToolBtn
            onClick={() => onDeduplicate(dedupCol)}
            disabled={!hasData}
            className="bg-gradient-to-r from-orange-500 to-amber-500"
          >
            <Scissors size={15} />
            <span>去重</span>
          </ToolBtn>
          {hasData && (
            <select
              value={dedupCol}
              onChange={(e) => setDedupCol(Number(e.target.value))}
              className="text-xs border border-slate-200 rounded-lg px-1.5 py-1 bg-white"
              title="去重列"
            >
              <option value={-1}>全部列</option>
              {headers.map((h, i) => (
                <option key={i} value={i}>
                  {h || `列${i + 1}`}
                </option>
              ))}
            </select>
          )}
        </div>

        <ToolBtn onClick={onCleanEmpty} disabled={!hasData} className="bg-slate-600">
          <Eraser size={15} />
          <span>清空空行</span>
        </ToolBtn>

        <ToolBtn onClick={onTrimWhitespace} disabled={!hasData} className="bg-slate-500">
          <span className="text-xs font-bold">T</span>
          <span>Trim</span>
        </ToolBtn>

        <ToolBtn onClick={onStandardizeDate} disabled={!hasData} className="bg-sky-600">
          <Calendar size={15} />
          <span>日期</span>
        </ToolBtn>

        <ToolBtn onClick={() => setShowFillModal(true)} disabled={!hasData} className="bg-cyan-600">
          <Pill size={15} />
          <span>填充</span>
        </ToolBtn>

        <ToolBtn onClick={() => setShowColPicker(true)} disabled={!hasData} className="bg-indigo-500">
          <Columns size={15} />
          <span>选列</span>
        </ToolBtn>

        <ToolBtn
          onClick={onOneClickClean}
          disabled={!hasData}
          className="bg-gradient-to-r from-fuchsia-500 to-pink-500"
        >
          <Wand2 size={15} />
          <span>一键清洗</span>
        </ToolBtn>

        <div className="flex-1" />

        <ToolBtn onClick={onUndo} disabled={!canUndo} className="bg-slate-700">
          <Undo2 size={15} />
          <span>撤销</span>
        </ToolBtn>

        <ToolBtn onClick={onClear} disabled={!hasData} className="bg-rose-500">
          <Trash2 size={15} />
          <span>清空</span>
        </ToolBtn>
      </div>

      {showColPicker && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 border border-slate-100">
            <h3 className="font-semibold text-slate-800 mb-3">选择保留列</h3>
            <div className="max-h-72 overflow-auto space-y-1 mb-4">
              {headers.map((h, i) => (
                <label key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedCols.includes(i)}
                    onChange={() => handleColToggle(i)}
                  />
                  <span className="truncate">{h || `列${i + 1}`}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-1.5 rounded-xl border text-sm"
                onClick={() => setShowColPicker(false)}
              >
                取消
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  onSelectColumns(selectedCols);
                  setShowColPicker(false);
                }}
              >
                应用
              </button>
            </div>
          </div>
        </div>
      )}

      {showFillModal && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 border border-slate-100">
            <h3 className="font-semibold text-slate-800 mb-3">填充空值</h3>
            <input
              className="soft-input w-full mb-4"
              value={fillValue}
              onChange={(e) => setFillValue(e.target.value)}
              placeholder="填充值"
            />
            <div className="flex justify-end gap-2">
              <button className="px-3 py-1.5 rounded-xl border text-sm" onClick={() => setShowFillModal(false)}>
                取消
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  onFillEmpty(fillValue);
                  setShowFillModal(false);
                }}
              >
                填充
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
