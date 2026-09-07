import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonVariantsOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
};

/**
 * Shared visual language for anything that acts like a button — the
 * <Button> element itself and any <Link> styled to look like one
 * (docs/design/design-system.md §7: "Buttons (primary)" / "(secondary)").
 * Exactly one primary (solid) style exists sitewide — see
 * docs/ux/ux-specification.md §17's CTA-hierarchy rule.
 */
export function buttonVariants({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: ButtonVariantsOptions = {}): string {
  return cn(
    // Base — every button/button-like link shares these.
    "inline-flex items-center justify-center gap-2 rounded-md font-bold",
    "transition-colors duration-150 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
    "disabled:pointer-events-none disabled:opacity-50",
    fullWidth && "w-full",
    // Size
    size === "sm" && "h-9 px-3.5 text-body-sm",
    size === "md" && "h-11 px-5 text-body",
    size === "lg" && "h-13 px-7 text-body-lg",
    // Variant — evidenced by the brand's own app mockup (design-system.md §1/§7):
    // solid dark-brown fill + white text for primary.
    variant === "primary" && "bg-cta-bg text-cta-text hover:bg-brand-brown-dark active:bg-brand-brown-dark",
    variant === "secondary" &&
      "border border-text-primary text-text-primary bg-transparent hover:bg-surface-secondary",
    variant === "ghost" && "text-text-primary bg-transparent hover:bg-surface-secondary",
    variant === "danger" && "bg-danger text-white hover:opacity-90",
    className,
  );
}
