import { cn } from "@/lib/cn";
import { Badge } from "@/ui/primitives/badge";
import { ImagePlaceholder } from "@/ui/primitives/image-placeholder";
import { Link } from "@/ui/primitives/link";
import { PriceDisplay } from "@/ui/commerce/price-display";
import { QuickAddButton } from "@/ui/commerce/quick-add-button";
import type { ProductCardData } from "@/ui/commerce/types";

export type ProductCardProps = {
  product: ProductCardData;
  className?: string;
};

const AVAILABILITY_BADGE: Record<string, { label: string; variant: "warning" | "neutral" } | null> = {
  in_stock: null,
  low_stock: { label: "ينفد قريبًا", variant: "warning" },
  out_of_stock: { label: "غير متوفر حاليًا", variant: "neutral" },
};

/**
 * The whole card is a "stretched link" to the PDP
 * (docs/ux/ux-specification.md §6) — quick-add sits visually inside it but
 * is a separate, higher-stacked control so a <button> never nests inside
 * an <a>. Quick-add only renders for single-SKU, in-stock products
 * (requirements COM-004) — never a variant-picker shortcut on the card.
 *
 * ProductCard itself stays a plain (server-renderable) component — only
 * QuickAddButton, which it renders internally, is a client island. This
 * lets every page that shows a grid of these (Home, Shop, Category,
 * Search, PDP related) stay 100% server-rendered, with Money never
 * needing to cross a Server→Client boundary (see QuickAddButton's comment).
 */
export function ProductCard({ product, className }: ProductCardProps) {
  const isOutOfStock = product.availability === "out_of_stock";
  const canQuickAdd = !product.hasMultipleVariants && !isOutOfStock;
  const availabilityBadge = AVAILABILITY_BADGE[product.availability];

  return (
    <div className={cn("group relative flex flex-col gap-3", isOutOfStock && "opacity-60", className)}>
      <Link
        href={`/product/${product.slug}`}
        className="absolute inset-0 z-10 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="sr-only">{product.name}</span>
      </Link>

      <div className="relative">
        <ImagePlaceholder label={product.imageAlt} className="w-full" />
        {(product.badge ?? availabilityBadge) && (
          <div className="pointer-events-none absolute start-2 top-2 flex flex-col gap-1">
            {product.badge && <Badge variant={product.badge.variant}>{product.badge.label}</Badge>}
            {availabilityBadge && <Badge variant={availabilityBadge.variant}>{availabilityBadge.label}</Badge>}
          </div>
        )}
      </div>

      <div className="pointer-events-none flex flex-1 flex-col gap-1">
        <p className="text-caption text-text-tertiary">{product.category}</p>
        <p className="line-clamp-2 text-body-sm font-bold text-text-primary">{product.name}</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <PriceDisplay price={product.price} compareAtPrice={product.compareAtPrice} size="sm" />
          {canQuickAdd && (
            <div className="pointer-events-auto relative z-20">
              <QuickAddButton productId={product.id} productName={product.name} category={product.category} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
