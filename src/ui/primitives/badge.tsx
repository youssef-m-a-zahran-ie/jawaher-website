import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export type BadgeVariant = "accent" | "dark" | "success" | "warning" | "danger" | "neutral";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

const VARIANT: Record<BadgeVariant, string> = {
  accent: "bg-accent text-brand-brown",
  dark: "bg-surface-dark text-text-on-dark",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
  neutral: "bg-surface-secondary text-text-secondary",
};

/** Small solid-fill pill — merchandising badges (best seller, new, sale) or availability/status indicators. */
export function Badge({ variant = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-caption font-bold",
        VARIANT[variant],
        className,
      )}
      {...props}
    />
  );
}
