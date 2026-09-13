import { ImageOff } from "lucide-react";

import { cn } from "@/lib/cn";
import { JawaherPattern } from "@/ui/brand/jawaher-pattern";

export type ImagePlaceholderProps = {
  /** What's missing, for screen readers — e.g. "صورة تمر مجدول فاخر". */
  label: string;
  /**
   * "card" (default): the small, honest "no image yet" surface used inside
   * product grids — a dashed border reads correctly at that scale.
   * "feature": a large-format surface for hero/category-tile contexts
   * (docs/planning/feature-completeness-audit.md Phase 3 section) — a
   * dashed border reads as a broken page at that scale, so this uses a
   * brand-toned gradient field instead. Still never a real photo standing
   * in for one (docs/design/brand-to-ui.md §2) — the visible caption makes
   * that explicit rather than relying on aria-label alone.
   */
  variant?: "card" | "feature";
  /** Shown only in "feature" variant — a short, visible "not final" caption. */
  caption?: string;
  className?: string;
};

export function ImagePlaceholder({ label, variant = "card", caption, className }: ImagePlaceholderProps) {
  if (variant === "feature") {
    return (
      <div
        role="img"
        aria-label={label}
        className={cn(
          "relative flex aspect-[4/3] flex-col items-center justify-center gap-3 overflow-hidden rounded-lg",
          "bg-gradient-to-br from-surface-dark via-brand-brown-mid to-surface-dark text-text-on-dark",
          className,
        )}
      >
        <JawaherPattern className="text-text-on-dark" opacity={0.08} />
        <ImageOff className="relative z-10 size-10 text-accent/80" aria-hidden="true" />
        {caption && <p className="relative z-10 px-6 text-center text-caption text-text-on-dark/80">{caption}</p>}
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "flex aspect-square items-center justify-center rounded-md bg-surface-secondary",
        className,
      )}
    >
      <ImageOff className="size-8 text-text-tertiary/70" aria-hidden="true" />
    </div>
  );
}
