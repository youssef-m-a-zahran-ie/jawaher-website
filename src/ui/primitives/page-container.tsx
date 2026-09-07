import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/**
 * Consistent page max-width + gutters (docs/design/design-system.md §6:
 * "extra width becomes whitespace, not more columns"). Every top-level
 * section should be wrapped in this rather than repeating max-w-[...] px-*
 * combinations across the codebase.
 */
export function PageContainer({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mx-auto w-full max-w-[var(--container-page)] px-4 sm:px-6 lg:px-8", className)}
      {...props}
    />
  );
}
