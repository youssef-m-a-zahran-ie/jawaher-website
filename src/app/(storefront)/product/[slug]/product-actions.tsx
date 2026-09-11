"use client";

import { useEffect, useState } from "react";

import { track } from "@/lib/analytics";
import { Button } from "@/ui/primitives/button";
import { useToast } from "@/ui/primitives/toast";
import type { ProductAvailability } from "@/ui/commerce/types";

export type ProductActionsProps = {
  /**
   * Phase 9.1 — renamed from `productId`: this must be the real
   * `Variant.id` (what `POST /api/v1/cart/items` actually keys on), not
   * the parent Product's id. For a single-SKU product the PDP resolves
   * this to that one real variant's id (see page.tsx's `pickPrimaryVariant`).
   */
  variantId: string;
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
 *
 * Multi-variant products still don't get a working Add to Cart here —
 * real variant data now exists (Phase 9.1), but rendering a real picker is
 * a UI addition this phase's brief explicitly excludes ("do not redesign
 * UI... do not implement Products Experience"); this honestly says a
 * choice is needed instead of faking or half-building a picker.
 *
 * Phase 9.1 — single-SKU Add to Cart now calls the real, already-existing
 * `POST /api/v1/cart/items` (session-cookie based, no new endpoint or
 * business logic added — this is exactly "connect to the existing
 * boundary where already supported" per that phase's brief §6/§10). The
 * grid's own quick-add (`quick-add-button.tsx`) is deliberately NOT wired
 * here — out of this phase's explicitly-named scope (only the PDP is
 * named), left toast-only, flagged in
 * docs/integration/catalog-inventory-gap-analysis.md.
 */
export function ProductActions({ variantId, productName, category, availability, hasMultipleVariants }: ProductActionsProps) {
  const { show } = useToast();
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    track("view_item", { item_id: variantId, item_category: category });
  }, [variantId, category]);

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

  async function handleAddToCart() {
    setIsPending(true);
    try {
      const response = await fetch("/api/v1/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId, quantity: 1 }),
      });
      if (!response.ok) {
        show({ title: "تعذّرت الإضافة إلى السلة — حاول مرة أخرى", variant: "danger" });
        return;
      }
      track("add_to_cart", { item_id: variantId, item_category: category });
      show({ title: `أُضيف "${productName}" إلى السلة`, variant: "success" });
    } catch {
      show({ title: "تعذّرت الإضافة إلى السلة — تحقق من الاتصال", variant: "danger" });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Button fullWidth disabled={isPending} onClick={handleAddToCart}>
      أضف إلى السلة
    </Button>
  );
}
