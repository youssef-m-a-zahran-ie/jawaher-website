import type { Money } from "@/domain/money";
import { formatPrice } from "@/lib/format-price";
import { cn } from "@/lib/cn";

export type PriceDisplayProps = {
  price: Money;
  /** The pre-discount price, if this product is on offer. */
  compareAtPrice?: Money;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const CURRENT_SIZE = { sm: "text-body-sm", md: "text-h4", lg: "text-h2" } as const;
const COMPARE_SIZE = { sm: "text-caption", md: "text-body-sm", lg: "text-body" } as const;

/**
 * Extra-Bold current price + smaller struck-through compare-at price —
 * directly evidenced by the brand's own app mockup
 * (docs/design/design-system.md §7). Never renders raw numbers without
 * going through formatPrice/Money, so a stray float can never reach the UI.
 */
export function PriceDisplay({ price, compareAtPrice, size = "md", className }: PriceDisplayProps) {
  const onSale = compareAtPrice && compareAtPrice.amountMinor > price.amountMinor;

  return (
    <div className={cn("flex items-baseline gap-2", className)}>
      <span className={cn("font-extrabold text-text-primary tabular-nums", CURRENT_SIZE[size])}>
        {formatPrice(price)}
      </span>
      {onSale && (
        <span className={cn("text-text-tertiary tabular-nums line-through", COMPARE_SIZE[size])}>
          {formatPrice(compareAtPrice)}
        </span>
      )}
    </div>
  );
}
