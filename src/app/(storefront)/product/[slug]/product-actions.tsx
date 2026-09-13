"use client";

import { useEffect, useRef, useState } from "react";

import { track } from "@/lib/analytics";
import { QuantityControl } from "@/ui/commerce/quantity-control";
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
  /**
   * Phase 11 — pre-formatted (server-side `formatPrice()`) price string,
   * for the mobile sticky bar below. A plain string, never the `Money`
   * instance itself — the same Server→Client boundary rule
   * quick-add-button.tsx's own comment documents (a class instance can't
   * cross that boundary; a formatted string can).
   */
  priceLabel: string;
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
 * a UI addition prior phases explicitly excluded ("do not redesign
 * UI... do not implement Products Experience"); this honestly says a
 * choice is needed instead of faking or half-building a picker.
 *
 * Phase 9.1 — single-SKU Add to Cart now calls the real, already-existing
 * `POST /api/v1/cart/items` (session-cookie based, no new endpoint or
 * business logic added). The grid's own quick-add (`quick-add-button.tsx`)
 * mirrors this exact call.
 *
 * Phase 11 — a mobile sticky add-to-cart bar appears once the in-page
 * action area scrolls out of view, for the one case that actually has a
 * working action (in stock/low stock, single variant) —
 * `ux-specification.md` §7's "sticky add-to-cart bar" item, previously
 * undone for lack of a variant-picker (out of scope) and real media
 * (still out of scope) but neither blocks this. A quantity selector
 * (reusing the same `QuantityControl` the cart drawer uses) was added the
 * same phase — this previously always sent `quantity: 1`, forcing a
 * customer who wanted more to add once then adjust from the cart.
 */
export function ProductActions({
  variantId,
  productName,
  category,
  availability,
  hasMultipleVariants,
  priceLabel,
}: ProductActionsProps) {
  const { show } = useToast();
  const [isPending, setIsPending] = useState(false);
  const [stickyVisible, setStickyVisible] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const actionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    track("view_item", { item_id: variantId, item_category: category });
  }, [variantId, category]);

  useEffect(() => {
    const el = actionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setStickyVisible(!entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const canAddToCart = availability !== "out_of_stock" && !hasMultipleVariants;

  async function handleAddToCart() {
    setIsPending(true);
    try {
      const response = await fetch("/api/v1/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId, quantity }),
      });
      if (!response.ok) {
        show({ title: "تعذّرت الإضافة إلى السلة — حاول مرة أخرى", variant: "danger" });
        return;
      }
      track("add_to_cart", { item_id: variantId, item_category: category, quantity });
      show({ title: `أُضيف "${productName}" إلى السلة`, variant: "success" });
    } catch {
      show({ title: "تعذّرت الإضافة إلى السلة — تحقق من الاتصال", variant: "danger" });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <div ref={actionRef}>
        {availability === "out_of_stock" ? (
          <Button variant="secondary" disabled fullWidth>
            غير متوفر حاليًا
          </Button>
        ) : hasMultipleVariants ? (
          <p className="text-body-sm text-text-secondary">
            يتوفر هذا المنتج بأكثر من خيار — اختيار الخيار المناسب متاح قريبًا.
          </p>
        ) : (
          <div className="flex items-center gap-3">
            <QuantityControl value={quantity} onChange={setQuantity} min={1} max={99} disabled={isPending} />
            <Button fullWidth disabled={isPending} onClick={() => void handleAddToCart()}>
              أضف إلى السلة
            </Button>
          </div>
        )}
      </div>

      {canAddToCart && stickyVisible && (
        <div
          role="region"
          aria-label="إضافة سريعة إلى السلة"
          className="fixed inset-x-0 bottom-0 z-[var(--z-sticky)] flex items-center justify-between gap-4 border-t border-border bg-surface p-4 shadow-lg sm:hidden"
        >
          <div className="min-w-0">
            <p className="truncate text-body-sm font-bold text-text-primary">{productName}</p>
            <p className="text-body font-extrabold text-text-primary tabular-nums">{priceLabel}</p>
          </div>
          <Button disabled={isPending} onClick={() => void handleAddToCart()} className="shrink-0">
            أضف إلى السلة
          </Button>
        </div>
      )}
    </>
  );
}
