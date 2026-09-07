import NextLink from "next/link";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";
import { buttonVariants, type ButtonSize, type ButtonVariant } from "@/ui/primitives/button-variants";

type NextLinkProps = ComponentProps<typeof NextLink>;

export type LinkProps = NextLinkProps & {
  /** Renders as a styled inline text link (default) instead of a button-shaped one. */
  variant?: ButtonVariant | "text";
  size?: ButtonSize;
};

export function Link({ variant = "text", size, className, ...props }: LinkProps) {
  if (variant === "text") {
    return (
      <NextLink
        className={cn(
          "text-text-primary underline decoration-transparent underline-offset-4 transition-colors duration-150",
          "hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:rounded-xs",
          className,
        )}
        {...props}
      />
    );
  }

  return <NextLink className={buttonVariants({ variant, size, className })} {...props} />;
}
