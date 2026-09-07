import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/**
 * Neutral pulse only — never a gold shimmer (docs/design/design-system.md
 * §7: "a shimmering gold skeleton would read as a loading gimmick").
 * Size the skeleton to match the real content's shape via className.
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-surface-secondary", className)}
      {...props}
    />
  );
}
