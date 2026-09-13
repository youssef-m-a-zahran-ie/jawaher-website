import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Phase 10 fix — plain `twMerge` doesn't know this project's custom theme
 * tokens (globals.css's `@theme inline`), and both our font-size tokens
 * (`text-h2`, `text-caption`, ...) and our text-color tokens
 * (`text-text-on-dark-strong`, `text-accent`, ...) start with `text-`.
 * Without this extension, twMerge guesses they're the SAME conflicting
 * utility and silently drops whichever came first in the call —
 * discovered via a real, visible bug this phase (category-tile.tsx's
 * category name rendering in the default dark-brown body text color
 * instead of cream, because `text-text-on-dark-strong` was silently
 * dropped in favor of `text-h2`/`text-h4`). Verified empirically
 * (`twMerge("text-text-on-dark-strong text-h2")` returned only
 * `"text-h2"` before this fix) — this is exactly the kind of invisible-
 * text defect a "premium, legible" site cannot ship with, and very
 * plausibly affects other call sites that combine a size + color token
 * in one `cn()` call, not just the one instance this phase happened to
 * catch by screenshotting real pages.
 *
 * Registers our tokens into tailwind-merge's own `font-size`/`text-color`
 * class groups (design-system.md §2/§3's tokens) so it correctly treats
 * them as two independent, non-conflicting properties — while still
 * correctly resolving genuine conflicts (two font sizes, or two text
 * colors, in the same call).
 */
const twMerge = extendTailwindMerge<"font-size" | "text-color">({
  extend: {
    classGroups: {
      "font-size": ["text-display", "text-h1", "text-h2", "text-h3", "text-h4", "text-body-lg", "text-body", "text-body-sm", "text-caption"],
      "text-color": [
        "text-surface",
        "text-surface-secondary",
        "text-surface-dark",
        "text-surface-dark-alt",
        "text-text-primary",
        "text-text-secondary",
        "text-text-tertiary",
        "text-text-on-dark",
        "text-text-on-dark-strong",
        "text-accent",
        "text-cta-bg",
        "text-cta-text",
        "text-border",
        "text-border-dark",
        "text-success",
        "text-warning",
        "text-danger",
      ],
    },
  },
});

/**
 * Combines conditional class names and resolves conflicting Tailwind
 * utilities (e.g. a caller's `className="p-6"` correctly overriding a
 * component's own `p-4`) — every primitive in src/ui/primitives and
 * src/ui/commerce uses this instead of manual string concatenation.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
