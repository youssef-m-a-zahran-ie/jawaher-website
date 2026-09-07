"use client";

import { Minus, Plus } from "lucide-react";

import { cn } from "@/lib/cn";
import { clampQuantity } from "@/lib/quantity";
import { IconButton } from "@/ui/primitives/icon-button";

export type QuantityControlProps = {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
};

/**
 * Client-side clamping only (clampQuantity) — the authoritative check
 * against real stock happens server-side when this value is actually
 * submitted (docs/architecture/technical-architecture.md §8). This
 * control never invents a max on its own; the caller passes it (e.g. from
 * the catalog projection once that exists).
 */
export function QuantityControl({
  value,
  onChange,
  min = 1,
  max = 99,
  disabled,
  className,
}: QuantityControlProps) {
  function set(next: number) {
    onChange(clampQuantity(next, min, max));
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border p-1",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      <IconButton
        icon={<Minus className="size-4" />}
        aria-label="إنقاص الكمية"
        size="sm"
        onClick={() => set(value - 1)}
        disabled={disabled || value <= min}
      />
      <span className="w-8 text-center text-body font-bold tabular-nums text-text-primary" aria-live="polite">
        {value}
      </span>
      <IconButton
        icon={<Plus className="size-4" />}
        aria-label="زيادة الكمية"
        size="sm"
        onClick={() => set(value + 1)}
        disabled={disabled || value >= max}
      />
    </div>
  );
}
