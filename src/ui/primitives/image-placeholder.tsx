import { ImageOff } from "lucide-react";

import { cn } from "@/lib/cn";

export type ImagePlaceholderProps = {
  /** What's missing, for screen readers — e.g. "صورة تمر مجدول فاخر". */
  label: string;
  className?: string;
};

/**
 * A deliberate, neutral "no image yet" surface — never a fake product
 * photo. Used only where a real asset genuinely isn't available yet
 * (docs/design/asset-manifest.md: no product photography supplied as of
 * this phase). Rendered inline (not a file under public/) specifically so
 * it can never be mistaken for, or accidentally ship as, real content.
 */
export function ImagePlaceholder({ label, className }: ImagePlaceholderProps) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "flex aspect-square items-center justify-center rounded-md border border-dashed border-border bg-surface-secondary",
        className,
      )}
    >
      <ImageOff className="size-8 text-text-tertiary" aria-hidden="true" />
    </div>
  );
}
