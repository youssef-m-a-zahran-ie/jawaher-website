/**
 * The single `track(event, params)` abstraction every future client
 * interaction calls — docs/architecture/blueprint.md §14. No module or
 * component may import a GA4/GTM SDK directly; this file is the only
 * allowed call site for that, once a real destination is wired up.
 *
 * Phase 3 intentionally does NOT integrate GA4/GTM (per this phase's
 * brief) — this function currently has no real destination. It exists so
 * every interaction that will eventually need tracking already calls it,
 * making the later swap a one-file change instead of a codebase-wide
 * refactor. Analytics must never break the caller (blueprint.md §14): this
 * function never throws.
 *
 * Event names match docs/ux/ux-specification.md §24's mapping exactly —
 * do not invent a new event name here; add it to that table first.
 */
export type AnalyticsEvent =
  | "page_view"
  | "view_category"
  | "view_item"
  | "select_item"
  | "add_to_cart"
  | "remove_from_cart"
  | "view_cart"
  | "begin_checkout"
  | "add_shipping_info"
  | "add_payment_info"
  | "purchase"
  | "refund"
  | "hero_cta_clicked"
  | "offer_clicked"
  | "whatsapp_clicked"
  | "coupon_applied"
  | "delivery_option_selected"
  | "checkout_abandoned"
  | "product_experience_started"
  | "product_experience_chapter_viewed"
  | "product_experience_cta_clicked"
  | "search";

export type AnalyticsParams = Record<string, string | number | boolean | undefined>;

export function track(event: AnalyticsEvent, params?: AnalyticsParams): void {
  try {
    if (process.env.NODE_ENV !== "production") {
      console.debug(`[analytics] ${event}`, params ?? {});
    }
  } catch {
    // Analytics must never break the caller.
  }
}
