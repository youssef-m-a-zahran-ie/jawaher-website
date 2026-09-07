import type { Money } from "@/domain/money";

const CURRENCY_SUFFIX: Record<Money["currency"], string> = {
  EGP: "ج.م.",
};

/**
 * Display formatting for a Money value — Western Arabic numerals per
 * docs/design/design-system.md §12's accessibility recommendation, not
 * locale-formatted beyond that (no thousands separator yet; revisit once
 * real prices are in play and a specific format is confirmed).
 */
export function formatPrice(money: Money): string {
  return `${money.toDecimalString()} ${CURRENCY_SUFFIX[money.currency]}`;
}
