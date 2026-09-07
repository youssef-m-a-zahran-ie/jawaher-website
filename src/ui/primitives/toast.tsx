"use client";

import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/cn";

export type ToastVariant = "neutral" | "success" | "danger";

export type ToastOptions = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Milliseconds before auto-dismiss. Default 4000. */
  duration?: number;
};

type ToastRecord = ToastOptions & { id: string };

type ToastContextValue = {
  show: (options: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const ICON: Record<ToastVariant, ReactNode> = {
  neutral: <Info className="size-5 text-text-secondary" aria-hidden="true" />,
  success: <CheckCircle2 className="size-5 text-success" aria-hidden="true" />,
  danger: <TriangleAlert className="size-5 text-danger" aria-hidden="true" />,
};

/**
 * Global toast provider — mount once near the root (see src/app/layout.tsx).
 * `useToast().show(...)` is the only public API; consumers never touch the
 * viewport or timers directly.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (options: ToastOptions) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current, { id, ...options }]);
      const duration = options.duration ?? 4000;
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[var(--z-toast)] flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border border-border bg-surface px-4 py-3 shadow-lg",
            )}
          >
            {ICON[toast.variant ?? "neutral"]}
            <div className="flex-1">
              <p className="text-body-sm font-bold text-text-primary">{toast.title}</p>
              {toast.description && (
                <p className="text-body-sm text-text-secondary">{toast.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="إغلاق الإشعار"
              className="text-text-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
