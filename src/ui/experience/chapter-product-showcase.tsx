import { ProductCard } from "@/ui/commerce/product-card";
import type { ProductCardData } from "@/ui/commerce/types";

export type ChapterProductShowcaseProps = { products: ProductCardData[] };

/**
 * ux-specification.md §16 item 4/8: "reuses the same Product Card
 * component as the rest of the site" (never a bespoke showcase card), and
 * "the product showcase becomes a horizontal swipe row instead of a grid"
 * specifically on mobile for Products Experience — unlike the ordinary
 * Shop grid, which stays a grid at every breakpoint. Real catalog data
 * only — never mock/sample products standing in here.
 */
export function ChapterProductShowcase({ products }: ChapterProductShowcaseProps) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0">
      {products.map((product) => (
        <div key={product.id} className="w-40 shrink-0 snap-start sm:w-auto">
          <ProductCard product={product} />
        </div>
      ))}
    </div>
  );
}
