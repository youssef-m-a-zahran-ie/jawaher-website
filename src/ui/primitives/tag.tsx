import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export type TagProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
};

/**
 * A selectable filter/variant chip — design-system.md §7's "chip-style
 * selected/unselected states." Controlled: the caller owns `selected` and
 * the click handler, this component only renders the two visual states.
 */
export function Tag({ selected = false, className, ...props }: TagProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex items-center rounded-full border px-4 py-1.5 text-body-sm font-bold transition-colors duration-150 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        "disabled:pointer-events-none disabled:opacity-50",
        selected
          ? "border-cta-bg bg-cta-bg text-cta-text"
          : "border-border bg-surface text-text-primary hover:bg-surface-secondary",
        className,
      )}
      {...props}
    />
  );
}
