/**
 * The wire (JSON) shape of `GET /api/v1/cart`'s `cart` payload — shared by
 * every client component that reads it (cart drawer, checkout page).
 * Deliberately NOT the same type as `cartService.getCartView`'s return
 * value: that one carries live `Money` instances, which cannot cross the
 * Server→Client boundary as-is (see cart-drawer-content.tsx's original
 * comment on this exact issue) — this is its plain-JSON counterpart,
 * reconstructed into `Money` via `Money.fromMinor()` only at render time.
 */
export type CartLineJson = {
  variantId: string;
  productName: string;
  variantLabel: string;
  quantity: number;
  unitPrice: { amountMinor: number; currency: "EGP" };
  lineTotal: { amountMinor: number; currency: "EGP" };
  availability: "in_stock" | "low_stock" | "out_of_stock" | "unknown";
  availableQuantity: number;
};

export type CartViewJson = {
  cartId: string;
  lines: CartLineJson[];
  subtotal: { amountMinor: number; currency: "EGP" };
  itemCount: number;
};
