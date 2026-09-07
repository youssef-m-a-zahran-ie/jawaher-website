import { cn } from "@/lib/cn";
import { ProductCard } from "@/ui/commerce/product-card";
import type { ProductCardData } from "@/ui/commerce/types";

export type ProductGridProps = {
  products: ProductCardData[];
  className?: string;
};

/**
 * A plain server-rendered grid — ProductCard's own internal QuickAddButton
 * is the only client piece involved (see its comment for why this can't
 * be one wrapping "use client" component here: Money can't cross a
 * Server→Client prop boundary). Responsive columns per
 * docs/ux/ux-specification.md §20 (2 / 3 / 4 / 5 by breakpoint).
 */
export function ProductGrid({ products, className }: ProductGridProps) {
  return (
    <div className={cn("grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4 xl:grid-cols-5", className)}>
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
