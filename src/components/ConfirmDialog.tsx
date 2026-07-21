import { AlertTriangle } from "lucide-react";

export interface ConfirmAction {
  label: string;
  onClick: () => void;
  className?: string;
  primary?: boolean;
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmClassName?: string;
  disabled?: boolean;
  /** 多按钮模式（导入冲突等）；提供时优先渲染 */
  actions?: ConfirmAction[];
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "确认",
  cancelLabel = "取消",
  onConfirm,
  onCancel,
  confirmClassName = "bg-blue-600 hover:bg-blue-700",
  disabled = false,
  actions,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onCancel}>
      <div
        className="bg-white rounded-xl shadow-2xl w-[min(28rem,92vw)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle size={20} className="text-yellow-500 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold text-gray-800">{title}</h3>
            <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{message}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          {actions && actions.length > 0 ? (
            <>
              <button
                onClick={onCancel}
                disabled={disabled}
                className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50"
              >
                {cancelLabel}
              </button>
              {actions.map((act) => (
                <button
                  key={act.label}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) return;
                    act.onClick();
                  }}
                  className={
                    act.className ||
                    (act.primary
                      ? "px-3 py-2 text-white rounded-lg text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                      : "px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50")
                  }
                >
                  {act.label}
                </button>
              ))}
            </>
          ) : (
            <>
              <button
                onClick={onCancel}
                disabled={disabled}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50"
              >
                {cancelLabel}
              </button>
              <button
                onClick={() => {
                  if (disabled) return;
                  onConfirm();
                }}
                disabled={disabled}
                className={`px-4 py-2 text-white rounded-lg text-sm ${confirmClassName}`}
              >
                {disabled ? "处理中..." : confirmLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
