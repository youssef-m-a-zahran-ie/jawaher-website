import { useId, type ReactNode } from "react";

export type TooltipProps = {
  content: string;
  children: ReactNode;
};

/**
 * CSS-only (group-hover/group-focus-within) — no client JS, no
 * positioning library. Matches docs/ux/ux-specification.md §3: "a
 * lightweight hover tooltip only" for header icons. Not meant for rich
 * content — text only.
 *
 * Centered via flexbox (justify-center on a full-width wrapper) rather
 * than the common left-50%-then-translateX(-50%) trick — that trick needs
 * a direction-aware correction to stay centered under RTL, and flexbox
 * centering doesn't, so there's nothing here to get wrong per document
 * direction.
 */
export function Tooltip({ content, children }: TooltipProps) {
  const id = useId();

  return (
    <span className="group relative inline-flex">
      <span aria-describedby={id}>{children}</span>
      <span className="pointer-events-none absolute inset-x-0 bottom-full z-[var(--z-tooltip)] mb-2 flex justify-center">
        <span
          id={id}
          role="tooltip"
          className="whitespace-nowrap rounded-sm bg-surface-dark px-2.5 py-1 text-caption text-text-on-dark opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          {content}
        </span>
      </span>
    </span>
  );
}
