import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode;
  /** Required, not optional — an icon-only control with no accessible name is a screen-reader dead end. */
  "aria-label": string;
  variant?: "solid" | "ghost";
  size?: "sm" | "md";
};

const SIZE = { sm: "size-9", md: "size-11" } as const;

export function IconButton({
  icon,
  variant = "ghost",
  size = "md",
  className,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center rounded-md transition-colors duration-150 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        "disabled:pointer-events-none disabled:opacity-50",
        SIZE[size],
        variant === "solid" && "bg-cta-bg text-cta-text hover:bg-brand-brown-dark",
        variant === "ghost" && "text-text-primary hover:bg-surface-secondary",
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  );
}
