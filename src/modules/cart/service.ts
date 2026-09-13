import { Money } from "@/domain/money";
import { db } from "@/lib/db";
import { catalogService } from "@/modules/catalog";
import { cartRepository } from "@/modules/cart/repository";

export class CartItemUnavailableError extends Error {
  constructor(readonly variantId: string, readonly reason: "not_found" | "out_of_stock" | "insufficient_stock") {
    super(`Cart item unavailable: ${variantId} (${reason})`);
    this.name = "CartItemUnavailableError";
  }
}

export type CartLineView = {
  variantId: string;
  sku: string;
  productName: string;
  variantLabel: string;
  quantity: number;
  unitPrice: Money;
  lineTotal: Money;
  priceChangedSinceAdded: boolean;
  /** "unknown" (Phase 9.5R) — ERP could not be verified for this line; `availableQuantity` is then a non-authoritative, best-effort display number only. */
  availability: "in_stock" | "low_stock" | "out_of_stock" | "unknown";
  availableQuantity: number;
};

export type CartView = {
  cartId: string;
  lines: CartLineView[];
  subtotal: Money;
  itemCount: number;
};

/** Public interface — module-boundaries.md's Cart row (getCart/addItem/updateQuantity/removeItem/mergeGuestCart). */
export const cartService = {
  async getOrCreateCartForSession(sessionId: string, customerId: string | null) {
    if (customerId) {
      const existing = await cartRepository.findActiveCartByCustomer(customerId);
      if (existing) return existing;
    }
    const existing = await cartRepository.findActiveCartBySession(sessionId);
    if (existing) return existing;
    return cartRepository.createCart(sessionId, customerId);
  },

  /**
   * Clamps to live availability server-side (technical-architecture.md
   * §8) — the client's requested quantity is never trusted outright.
   *
   * Phase 9.5R: when ERP could not be verified (`availability ===
   * "unknown"`), this does NOT clamp against the local, non-authoritative
   * `availableQuantity` — that would silently present stale local data
   * as if it were a real stock check. Instead the customer's requested
   * quantity is preserved as-is (this is a reversible cart action; real
   * safety is enforced fail-closed at checkout confirmation — see
   * docs/integration/inventory-integration-audit.md §5/§16).
   */
  async addItem(cartId: string, variantId: string, requestedQuantity: number) {
    const purchaseInfo = await catalogService.getVariantForPurchase(variantId);
    if (!purchaseInfo) throw new CartItemUnavailableError(variantId, "not_found");
    if (purchaseInfo.availability === "out_of_stock") throw new CartItemUnavailableError(variantId, "out_of_stock");

    if (purchaseInfo.availability === "unknown") {
      await cartRepository.upsertItem(cartId, variantId, requestedQuantity, purchaseInfo.price.amountMinor);
      return { addedQuantity: requestedQuantity, clamped: false };
    }

    // Still add what's actually available rather than reject outright — the caller's response surfaces `clamped` so the UI can say so.
    const clamped = Math.min(requestedQuantity, purchaseInfo.availableQuantity);
    if (clamped <= 0) throw new CartItemUnavailableError(variantId, "insufficient_stock");

    await cartRepository.upsertItem(cartId, variantId, clamped, purchaseInfo.price.amountMinor);
    return { addedQuantity: clamped, clamped: clamped < requestedQuantity };
  },

  async updateQuantity(cartId: string, variantId: string, requestedQuantity: number) {
    if (requestedQuantity <= 0) {
      await cartRepository.removeItem(cartId, variantId);
      return { quantity: 0 };
    }
    const purchaseInfo = await catalogService.getVariantForPurchase(variantId);
    if (!purchaseInfo) throw new CartItemUnavailableError(variantId, "not_found");

    if (purchaseInfo.availability === "unknown") {
      await cartRepository.setItemQuantity(cartId, variantId, requestedQuantity);
      return { quantity: requestedQuantity, clamped: false };
    }

    const clamped = Math.min(requestedQuantity, purchaseInfo.availableQuantity);
    await cartRepository.setItemQuantity(cartId, variantId, clamped);
    return { quantity: clamped, clamped: clamped < requestedQuantity };
  },

  async removeItem(cartId: string, variantId: string) {
    await cartRepository.removeItem(cartId, variantId);
  },

  /**
   * Every read re-fetches live price/availability (technical-architecture.md
   * §8/§9) — a cart never stores a trusted total. `priceChangedSinceAdded`
   * is a UX flag only, computed by comparing the live price to the
   * add-time snapshot; it never affects the returned subtotal.
   */
  async getCartView(cartId: string): Promise<CartView> {
    const cart = await cartRepository.findCartById(cartId);
    if (!cart) throw new Error("Cart not found");

    const lines: CartLineView[] = [];
    for (const item of cart.items) {
      const purchaseInfo = await catalogService.getVariantForPurchase(item.variantId);
      if (!purchaseInfo) continue; // discontinued/deactivated since add-time — simply excluded from totals, still flaggable by the caller via a separate "was removed" check if ever needed.

      const unitPrice = purchaseInfo.price;
      lines.push({
        variantId: item.variantId,
        sku: purchaseInfo.variant.sku,
        productName: purchaseInfo.variant.product.name,
        variantLabel: purchaseInfo.variant.label,
        quantity: item.quantity,
        unitPrice,
        lineTotal: unitPrice.multiply(item.quantity),
        priceChangedSinceAdded: unitPrice.amountMinor !== item.addedPriceAmountMinor,
        availability: purchaseInfo.availability,
        availableQuantity: purchaseInfo.availableQuantity,
      });
    }

    const subtotal = lines.reduce((sum, line) => sum.add(line.lineTotal), Money.zero());
    return { cartId, lines, subtotal, itemCount: lines.reduce((n, l) => n + l.quantity, 0) };
  },

  /**
   * Combines an *existing* authenticated customer's cart with the guest
   * cart's items, per SKU, prices always re-fetched live
   * (technical-architecture.md §8) — distinct from the guest→account
   * conversion case (customers/service.ts), where no separate account
   * cart exists yet.
   */
  async mergeCarts(guestCartId: string, customerCartId: string) {
    return db.$transaction(async (tx) => {
      const guestCart = await tx.cart.findUnique({ where: { id: guestCartId }, include: { items: true } });
      if (!guestCart) return;

      for (const item of guestCart.items) {
        const existing = await tx.cartItem.findUnique({
          where: { cartId_variantId: { cartId: customerCartId, variantId: item.variantId } },
        });
        const combinedQuantity = (existing?.quantity ?? 0) + item.quantity;
        await tx.cartItem.upsert({
          where: { cartId_variantId: { cartId: customerCartId, variantId: item.variantId } },
          create: { cartId: customerCartId, variantId: item.variantId, quantity: combinedQuantity, addedPriceAmountMinor: item.addedPriceAmountMinor },
          update: { quantity: combinedQuantity },
        });
      }

      await tx.cart.update({ where: { id: guestCartId }, data: { status: "CONVERTED" } });
    });
  },
};
