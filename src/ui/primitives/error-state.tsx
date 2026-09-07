import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type ErrorStateProps = {
  title: string;
  description?: string;
  /** Internal correlation id for support — shown small, never the primary message (technical-architecture.md §22). */
  reference?: string;
  action?: ReactNode;
  className?: string;
};

/**
 * "Clear, Arabic, actionable, non-technical, non-blaming"
 * (docs/ux/ux-specification.md §21) — never a raw error code or stack
 * trace as the headline. The optional `reference` is the one place a
 * technical id is allowed to surface, and only in small print.
 */
export function ErrorState({ title, description, reference, action, className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn("flex flex-col items-center gap-3 px-6 py-16 text-center", className)}
    >
      <AlertTriangle className="size-10 text-danger" aria-hidden="true" />
      <p className="text-h4 font-bold text-text-primary">{title}</p>
      {description && <p className="max-w-sm text-body-sm text-text-secondary">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
      {reference && <p className="text-caption text-text-tertiary">{reference}</p>}
    </div>
  );
}
