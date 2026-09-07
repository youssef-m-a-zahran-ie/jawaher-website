import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export type SwitchProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
};

/**
 * Zero-JS toggle switch (native checkbox underneath — it intentionally
 * reads to screen readers as a checkbox with a label, which is an
 * accessible and honest representation of what it actually is; HTML has
 * no native switch role for a plain input).
 *
 * The thumb's slide direction is plain CSS in globals.css (.switch-thumb,
 * with an explicit [dir="rtl"] override) rather than Tailwind's
 * peer-checked:rtl:/ltr: variants — see that file's comment. The point
 * still stands regardless of mechanism: a document-direction-agnostic
 * transform is exactly the RTL bug docs/ux/ux-specification.md §22 warns
 * against — this rule pair is what actually prevents it.
 */
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { label, className, id, ...props },
  ref,
) {
  return (
    <label htmlFor={id} className={cn("inline-flex cursor-pointer items-center gap-2.5", className)}>
      <span className="relative inline-flex h-6 w-11 shrink-0">
        <input ref={ref} type="checkbox" id={id} className="form-control-input" {...props} />
        <span
          className="form-control-visual switch-track pointer-events-none absolute inset-0 rounded-full border border-border bg-surface-secondary"
          aria-hidden="true"
        />
        <span
          className="switch-thumb pointer-events-none absolute start-0.5 top-0.5 size-5 rounded-full bg-surface shadow-sm"
          aria-hidden="true"
        />
      </span>
      <span className="text-body-sm text-text-primary">{label}</span>
    </label>
  );
});
