import { useEffect, useRef } from "react";
import { CheckCircle, AlertCircle, XCircle, X } from "lucide-react";

export interface ToastMessage {
  id: string;
  type: "success" | "warning" | "error";
  message: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export default function Toast({ toasts, onDismiss }: ToastProps) {
  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex max-w-[min(26rem,calc(100vw-2rem))] flex-col gap-2"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: string) => void }) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const timer = setTimeout(() => onDismissRef.current(toast.id), 3000);
    return () => clearTimeout(timer);
  }, [toast.id]);

  const icons = {
    success: <CheckCircle size={16} className="text-green-500" aria-hidden />,
    warning: <AlertCircle size={16} className="text-yellow-500" aria-hidden />,
    error: <XCircle size={16} className="text-red-500" aria-hidden />,
  };

  const bg = {
    success: "bg-green-50 border-green-200",
    warning: "bg-yellow-50 border-yellow-200",
    error: "bg-red-50 border-red-200",
  };

  return (
    <div
      className={`flex min-w-64 items-start gap-2 rounded-lg border px-4 py-3 shadow-lg ${bg[toast.type]}`}
      role={toast.type === "error" ? "alert" : "status"}
    >
      {icons[toast.type]}
      <span className="min-w-0 flex-1 break-words text-sm text-gray-700">{toast.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 rounded text-gray-400 hover:text-gray-600"
        aria-label="关闭通知"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}
