"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { IconButton } from "@/ui/primitives/icon-button";

export type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
};

/**
 * Same native-<dialog> foundation as Modal (focus trap, Escape,
 * top-layer), pinned to the inline-start edge (logical, via the inline
 * style below) and sliding in from there — the reading-start side, i.e.
 * the right edge under RTL (docs/ux/ux-specification.md §9), never a
 * hardcoded physical side. The slide transition is the `js-drawer-panel`
 * rule in globals.css (@starting-style — plain CSS, not a Tailwind
 * arbitrary variant, since that syntax isn't confirmed for this Tailwind
 * version). Falls back to an instant, still-fully-functional appearance
 * on browsers that don't support @starting-style yet — a deliberate,
 * graceful degradation, not a bug.
 */
export function Drawer({ open, onClose, title, children, className }: DrawerProps) {
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
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        "js-drawer-panel m-0 h-full max-h-none w-full max-w-sm rounded-none border-0 bg-surface p-0 shadow-xl",
        "backdrop:bg-brand-brown/40",
        className,
      )}
      style={{ position: "fixed", insetInlineStart: 0, insetBlockStart: 0 }}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <p className="text-h4 font-bold text-text-primary">{title}</p>
          <IconButton icon={<X className="size-5" />} aria-label="إغلاق" onClick={onClose} size="sm" />
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </dialog>
  );
}
