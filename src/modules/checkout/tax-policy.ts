import { Money } from "@/domain/money";

/**
 * A real policy boundary — the same shape as the Payment/Shipping/
 * Notifications adapter interfaces (technical-architecture.md §5/§6/§18),
 * applied to tax for consistency with the rest of this modular monolith.
 * Checkout calls this interface; it never hardcodes a tax amount itself.
 *
 * Real Egyptian tax/e-invoicing rules are an open business decision,
 * unresolved since Phase 1's New Finding #4 — this file exists so that,
 * once that decision lands, replacing `ZeroTaxPolicy` with a real
 * implementation is a one-file swap (matching this same interface), never
 * a checkout rewrite. See docs/planning/commerce-completeness-audit.md §4.
 */
export interface TaxPolicy {
  readonly name: string;
  calculate(input: { subtotalAfterDiscount: Money; governorate?: string }): Money;
}

/**
 * The only implementation this phase — explicitly temporary, and named to
 * say so. Always returns zero. This is NOT a decision that Egyptian tax
 * is zero, and NOT a tax/compliance decision of any kind — it is a
 * placeholder policy that keeps `Order.taxAmountMinor` (a real column,
 * computed through this same call site on every order) wired end-to-end
 * while the actual policy remains unresolved. Do not delete this
 * indirection to "simplify" checkout — its entire purpose is to exist as
 * the one place a real policy gets plugged in later.
 */
export class ZeroTaxPolicy implements TaxPolicy {
  readonly name = "zero-tax-temporary";

  calculate(input: { subtotalAfterDiscount: Money; governorate?: string }): Money {
    void input; // unused by design — this policy is a placeholder, see the class comment.
    return Money.zero();
  }
}
