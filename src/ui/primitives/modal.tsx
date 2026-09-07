"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { IconButton } from "@/ui/primitives/icon-button";

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
};

/**
 * Built on the native <dialog> element — focus trapping, Escape-to-close,
 * and top-layer stacking all come from the browser for free, instead of a
 * hand-built portal/focus-trap implementation.
 */
export function Modal({ open, onClose, title, children, className }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      onClick={(event) => {
        // Native <dialog> backdrop click lands on the dialog element itself.
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto w-full max-w-md rounded-lg border border-border bg-surface p-0 shadow-xl backdrop:bg-brand-brown/40",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <p className="text-h4 font-bold text-text-primary">{title}</p>
        <IconButton icon={<X className="size-5" />} aria-label="إغلاق" onClick={onClose} size="sm" />
      </div>
      <div className="px-6 py-5">{children}</div>
    </dialog>
  );
}
