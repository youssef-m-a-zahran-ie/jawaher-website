import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export type RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
};

/** Same zero-JS, hand-written-CSS pattern as Checkbox — see its comment and globals.css. */
export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { label, className, id, ...props },
  ref,
) {
  return (
    <label htmlFor={id} className={cn("inline-flex cursor-pointer items-center gap-2.5", className)}>
      <span className="relative inline-flex size-5 shrink-0">
        <input ref={ref} type="radio" id={id} className="form-control-input" {...props} />
        <span
          className="form-control-visual radio-ring pointer-events-none absolute inset-0 rounded-full border border-border bg-surface"
          aria-hidden="true"
        />
        <span
          className="radio-dot pointer-events-none relative m-auto size-2.5 rounded-full bg-cta-bg"
          aria-hidden="true"
        />
      </span>
      <span className="text-body-sm text-text-primary">{label}</span>
    </label>
  );
});
