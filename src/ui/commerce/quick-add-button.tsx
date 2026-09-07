"use client";

import { ShoppingCart } from "lucide-react";

import { track } from "@/lib/analytics";
import { IconButton } from "@/ui/primitives/icon-button";
import { useToast } from "@/ui/primitives/toast";

export type QuickAddButtonProps = {
  productId: string;
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
 */
export function QuickAddButton({ productId, productName, category }: QuickAddButtonProps) {
  const { show } = useToast();

  return (
    <IconButton
      icon={<ShoppingCart className="size-4" />}
      aria-label={`أضف ${productName} إلى السلة`}
      variant="solid"
      size="sm"
      onClick={() => {
        track("add_to_cart", { item_id: productId, item_category: category });
        show({ title: `أُضيف "${productName}" إلى السلة`, variant: "success" });
      }}
    />
  );
}
