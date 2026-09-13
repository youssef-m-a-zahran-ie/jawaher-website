import { useId } from "react";

import { cn } from "@/lib/cn";

export type JawaherPatternProps = {
  className?: string;
  /** 0-1. The source uses this ghosted, tone-on-tone, always low-opacity — never a loud foreground texture (design-system.md §7's "very low opacity" rule for the drawer/empty-state use). */
  opacity?: number;
};

/**
 * The recurring ghosted palm/diamond texture from the brand's own packaging
 * (`_reference/brand/guidelines/Jawaher El khier.pdf` pp.4, 10, 13) — a
 * real, official brand element that existed nowhere in the digital product
 * before this phase. A tiled SVG `<pattern>` of one small diamond and one
 * simplified palm silhouette, in `currentColor` so it adapts to whatever
 * section background it's placed on (dark hero, cream section, etc.),
 * exactly like the source material does across brown/white/cream/black.
 *
 * Decorative only (`aria-hidden`) — per design-system.md §7, this is
 * reserved for section backgrounds and empty-state accents, never placed
 * behind functional content (form fields, prices, CTAs) where it could
 * reduce legibility.
 */
export function JawaherPattern({ className, opacity = 0.06 }: JawaherPatternProps) {
  const patternId = useId();

  return (
    <svg
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
      style={{ opacity }}
    >
      <defs>
        <pattern id={patternId} width="120" height="140" patternUnits="userSpaceOnUse">
          {/* Diamond */}
          <rect x="16" y="20" width="14" height="14" transform="rotate(45 23 27)" fill="currentColor" />
          {/* Simplified palm silhouette: a small frond fan + trunk, reusing the same visual family as JawaherPalmIcon but static/simplified for tiling at small scale. */}
          <g transform="translate(75 15) scale(0.55)">
            <path d="M30 30 Q10 10 -8 20" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M30 30 Q20 4 4 -4" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M30 30 Q30 0 30 -10" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M30 30 Q40 4 56 -4" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M30 30 Q50 10 68 20" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M27 34 C25 55, 27 72, 30 85 C33 72, 35 55, 33 34 Z" fill="currentColor" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}
