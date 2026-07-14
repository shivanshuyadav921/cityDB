import { useEffect, useRef, useState, useCallback } from "react";

export type ToastVariant = "success" | "error" | "info";

export interface ToastMessage {
  id: number;
  message: string;
  variant: ToastVariant;
}

let toastIdCounter = 0;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      const id = ++toastIdCounter;
      setToasts((prev) => [...prev, { id, message, variant }]);
    },
    []
  );

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}

// ─── Component ────────────────────────────────────────────────────────────────

const DURATION_MS = 4000;

export function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts: ToastMessage[];
  onRemove: (id: number) => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 80,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 1000,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onRemove={onRemove} />
      ))}
    </div>
  );
}

function Toast({
  toast,
  onRemove,
}: {
  toast: ToastMessage;
  onRemove: (id: number) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    timerRef.current = setTimeout(() => onRemove(toast.id), DURATION_MS);
    return () => clearTimeout(timerRef.current);
  }, [toast.id, onRemove]);

  const bgColor =
    toast.variant === "error"
      ? "#7a1a2a"
      : toast.variant === "success"
      ? "#1a4a2a"
      : "#1a2340";
  const borderColor =
    toast.variant === "error"
      ? "#ff5a6e"
      : toast.variant === "success"
      ? "#4aff8a"
      : "#4d7cff";

  return (
    <div
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        padding: "10px 16px",
        color: "#e8ecff",
        fontSize: 13,
        maxWidth: 420,
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        pointerEvents: "auto",
        animation: "toast-in 0.2s ease-out",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span style={{ color: borderColor }}>
        {toast.variant === "error"
          ? "✕"
          : toast.variant === "success"
          ? "✓"
          : "ℹ"}
      </span>
      {toast.message}
      <button
        onClick={() => onRemove(toast.id)}
        style={{
          marginLeft: "auto",
          background: "transparent",
          border: "none",
          color: "#5a6a8f",
          cursor: "pointer",
          fontSize: 14,
          padding: 0,
          lineHeight: 1,
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
