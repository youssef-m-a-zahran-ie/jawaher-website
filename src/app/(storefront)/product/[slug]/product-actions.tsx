"use client";

import { useEffect } from "react";

import { track } from "@/lib/analytics";
import { Button } from "@/ui/primitives/button";
import { useToast } from "@/ui/primitives/toast";
import type { ProductAvailability } from "@/ui/commerce/types";

export type ProductActionsProps = {
  productId: string;
  productName: string;
  category: string;
  availability: ProductAvailability;
  hasMultipleVariants: boolean;
};

/**
 * Only plain fields, never the whole ProductCardData (its Money fields
 * can't cross the Server→Client boundary — see
 * src/ui/commerce/quick-add-button.tsx's comment for the full
 * explanation; this component hit the exact same bug). Fires `view_item`
 * on mount (docs/ux/ux-specification.md §24) and renders Add to Cart.
 * Multi-variant products don't get a working Add to Cart here — there's
 * no real variant option data anywhere in ProductCardData (inventing
 * sizes/weights would be fabricating a product specification, which this
 * phase's brief forbids), so this honestly says a choice is needed
 * instead of faking a picker. Toast-only feedback, no real cart
 * persistence, matching the cart-drawer's always-empty state in
 * src/ui/site/header-actions.tsx.
 */
export function ProductActions({ productId, productName, category, availability, hasMultipleVariants }: ProductActionsProps) {
  const { show } = useToast();

  useEffect(() => {
    track("view_item", { item_id: productId, item_category: category });
  }, [productId, category]);

  if (availability === "out_of_stock") {
    return (
      <Button variant="secondary" disabled fullWidth>
        غير متوفر حاليًا
      </Button>
    );
  }

  if (hasMultipleVariants) {
    return (
      <p className="text-body-sm text-text-secondary">
        يتوفر هذا المنتج بأكثر من خيار — اختيار الخيار المناسب متاح قريبًا.
      </p>
    );
  }

  return (
    <Button
      fullWidth
      onClick={() => {
        track("add_to_cart", { item_id: productId, item_category: category });
        show({ title: `أُضيف "${productName}" إلى السلة`, variant: "success" });
      }}
    >
      أضف إلى السلة
    </Button>
  );
}
