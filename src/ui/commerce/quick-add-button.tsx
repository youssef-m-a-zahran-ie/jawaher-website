"use client";

import { ShoppingCart } from "lucide-react";
import { useState } from "react";

import { track } from "@/lib/analytics";
import { IconButton } from "@/ui/primitives/icon-button";
import { useToast } from "@/ui/primitives/toast";

export type QuickAddButtonProps = {
  /** The real `Variant.id` `POST /api/v1/cart/items` keys on — see ProductCardData's own comment on why this is never the Product id. */
  variantId: string;
  productName: string;
  category: string;
};

/**
 * Deliberately takes only plain string props, never a ProductCardData (or
 * its Money fields) — a class instance like Money cannot cross the
 * Server-to-Client prop boundary (React: "Only plain objects... Classes...
 * are not supported"). This surfaced as a real build failure once
 * ProductCard started being rendered from genuine Server Component pages
 * (Phase 2's dev-showcase usage never hit it, because that whole page is
 * one client component importing mock data directly, not receiving it as
 * a prop across a boundary). Self-contained here — ProductCard no longer
 * takes an onQuickAdd callback at all, so every caller gets this for free.
 *
 * Phase 9.7 — now calls the real `POST /api/v1/cart/items`, mirroring
 * product-actions.tsx's PDP add-to-cart exactly. Previously showed the
 * identical success toast on every click with NO API call at all (a real,
 * confirmed-fake control per the Phase 9.7 audit) — the toast now reflects
 * what actually happened.
 */
export function QuickAddButton({ variantId, productName, category }: QuickAddButtonProps) {
  const { show } = useToast();
  const [isPending, setIsPending] = useState(false);

  async function handleQuickAdd() {
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
    <IconButton
      icon={<ShoppingCart className="size-4" />}
      aria-label={`أضف ${productName} إلى السلة`}
      variant="solid"
      size="sm"
      disabled={isPending}
      onClick={() => void handleQuickAdd()}
    />
  );
}
