import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  /**
   * A card always alternates with its parent's background
   * (design-system.md §7) so it never disappears into its container —
   * pick whichever surface the parent is NOT using.
   */
  surface?: "primary" | "secondary";
  padding?: "none" | "sm" | "md" | "lg";
};

const PADDING = { none: "", sm: "p-4", md: "p-6", lg: "p-8" } as const;

export function Card({ surface = "primary", padding = "md", className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border shadow-sm",
        surface === "primary" ? "bg-surface" : "bg-surface-secondary",
        PADDING[padding],
        className,
      )}
      {...props}
    />
  );
}
