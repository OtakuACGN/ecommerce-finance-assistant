import { useEffect, useId, useRef } from "react";
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(onCancel);
  const titleId = useId();
  const messageId = useId();
  cancelRef.current = onCancel;

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable?.[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !disabled) {
        event.preventDefault();
        cancelRef.current();
      }
      if (event.key !== "Tab" || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [open, disabled]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overscroll-contain p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/40"
        onClick={onCancel}
        aria-label="关闭确认对话框"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="relative w-[min(28rem,92vw)] rounded-xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle size={20} className="text-yellow-500 mt-0.5 shrink-0" aria-hidden />
          <div className="min-w-0">
            <h3 id={titleId} className="text-pretty font-semibold text-gray-800">{title}</h3>
            <p id={messageId} className="mt-1 whitespace-pre-line break-words text-sm text-gray-600">{message}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          {actions && actions.length > 0 ? (
            <>
              <button
                type="button"
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
                type="button"
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
                {disabled ? "处理中…" : confirmLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
