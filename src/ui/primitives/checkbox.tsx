import { Check } from "lucide-react";
import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
};

/**
 * A visually custom checkbox with zero client JS: the native input drives
 * state via :checked; the box and check glyph are its siblings and react
 * to it via plain CSS in globals.css (.checkbox-box / .checkbox-icon —
 * see that file's comment for why this is plain CSS rather than
 * Tailwind's peer-checked:* utilities). The surrounding <label> makes
 * clicking the box, the glyph, or the text, and tabbing + space, all work
 * exactly like a native checkbox — because it is one.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, className, id, ...props },
  ref,
) {
  return (
    <label htmlFor={id} className={cn("inline-flex cursor-pointer items-center gap-2.5", className)}>
      <span className="relative inline-flex size-5 shrink-0">
        <input ref={ref} type="checkbox" id={id} className="form-control-input" {...props} />
        <span
          className="form-control-visual checkbox-box pointer-events-none absolute inset-0 rounded-sm border border-border bg-surface"
          aria-hidden="true"
        />
        <Check
          className="checkbox-icon pointer-events-none relative m-auto size-3.5 text-cta-text"
          aria-hidden="true"
        />
      </span>
      <span className="text-body-sm text-text-primary">{label}</span>
    </label>
  );
});
