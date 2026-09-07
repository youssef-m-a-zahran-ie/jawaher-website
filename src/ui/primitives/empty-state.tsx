import { PackageSearch } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

/**
 * "An icon/illustration plus one clear next action — never blank white
 * space" (docs/ux/ux-specification.md §21). Used for empty cart, empty
 * search results, no offers, etc. — the caller supplies the copy and the
 * action (e.g. a <Button>/<Link> back to Shop).
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-16 text-center", className)}>
      <div className="text-text-tertiary" aria-hidden="true">
        {icon ?? <PackageSearch className="size-10" />}
      </div>
      <p className="text-h4 font-bold text-text-primary">{title}</p>
      {description && <p className="max-w-sm text-body-sm text-text-secondary">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
