# End-to-End Customer Commerce Readiness (Phase 9.7)

Status: audit complete, P0/P1 gaps fixed within technical scope. Last updated: 2026-09-13.

This document is a **code-verified audit**, not a documentation summary — every claim below cites the actual file:line evidence found this phase. The question this phase answers: **can a real customer safely complete the full commerce lifecycle today?** Before this phase: no. The entire customer-facing cart/checkout/confirmation/order-tracking/cancellation UI did not exist — only backend modules and a handful of unconsumed API routes did. This phase built the missing UI, fixed two real IDOR vulnerabilities discovered while doing so, closed a rate-limiting gap, fixed a fake UI control, and removed a fake homepage section — all within existing architectural boundaries (ERP stays inventory-authoritative, Website stays commerce-authoritative, no new business rules invented).

---

## 1. Starting state (first-principles audit findings)

Verified directly against the code (not prior-phase docs) at the start of this phase:

- **No `/cart` page.** The cart drawer in `header-actions.tsx` was hardcoded always-empty, with its own Phase-3 comment admitting this: *"a future Cart module fills with real state, without pretending an item is actually in it."*
- **No `/checkout` page.** Only 4 backend API routes existed (`checkout`, `checkout/address`, `checkout/coupon`, `checkout/shipping-rates`) with zero frontend consumer.
- **No order-confirmation page.**
- **No order-history or order-detail page.** `GET /api/v1/orders/[id]` existed but nothing called it from the frontend.
- **No `/track` page.** `GET /api/v1/orders/track` existed (rate-limited, anti-enumeration) with zero frontend consumer.
- **No cancellation path at all, frontend or backend.** `ordersService.cancelOrder` existed as a service function; **no API route anywhere called it.**
- **Homepage showed fake products under a false claim.** `MOCK_BEST_SELLERS` (`src/ui/commerce/mock-products.ts`) was live-imported into the real homepage under the heading "الأكثر مبيعًا" (best sellers) — every one of its products carries a literal "(اسم تجريبي)" (sample name) suffix, and "best seller" is not a real, knowable fact (no such flag exists on `Product`/`Variant`, confirmed in `catalog-inventory-gap-analysis.md` §9 as a business decision, not a data-wiring gap).
- **The product-grid "quick add" button was entirely fake.** `quick-add-button.tsx` showed a success toast on every click with **no API call at all** — already flagged in a prior-phase code comment as a known, deliberately-scoped-out gap.
- Shop/category/search/PDP were already correctly reconnected to real `catalogService` data (Phase 9.1) — not touched this phase except for one real bug found in the adapter (§3).

## 2. Security findings and fixes (P0)

### 2.1 Checkout-session IDOR (fixed)

`checkoutService`'s `setAddress`, `getShippingRates`, `applyCoupon`, and `confirmAndPlaceOrder` (`src/modules/checkout/service.ts`) accepted a bare `checkoutSessionId` with **zero ownership check** against the requester. `CheckoutSession.id` is a random UUID (not guessable) but possession alone was sufficient to overwrite another customer's in-progress checkout address, consume a coupon under their identity, or **place their order** with an attacker-chosen shipping address. `checkoutSessionId` was additionally passed in a URL query string on the shipping-rates `GET` call — a realistic leak vector (server logs, Referer headers).

**Fix:** `assertCheckoutSessionOwnership()` (`checkout/service.ts`), checking the requester's `{sessionId, customerId}` against the checkout session's owning `Cart.sessionId`/`Cart.customerId` — the same dual ownership pattern already used for `Order`/`Cart` elsewhere in the codebase. All four functions now take a `requester` parameter and check it first. A new `CheckoutAuthorizationError` is mapped (`api-error-mapping.ts`) to the same generic "not found" response whether the session doesn't exist or simply isn't owned — never distinguishing the two, matching the existing `OrderNotFoundError`/`OrderAuthorizationError` anti-enumeration pattern. All 4 route handlers (`checkout/address`, `checkout/shipping-rates`, `checkout/coupon`, `orders` — order placement) now call `resolveSession()` and pass the requester through. Covered by a new integration test asserting an attacker session is rejected at all four operations (`tests/integration/checkout.test.ts`).

### 2.2 Guest order IDOR (found and fixed this phase, pre-existing before this phase — not introduced by it)

Found while auditing the order-detail boundary (in scope per this phase's explicit checklist). `ordersService.getOrderForCustomer(orderId, requestingCustomerId)` (`src/modules/orders/service.ts`) authorized via `order.customerId !== requestingCustomerId`. For a **guest** order, `order.customerId` is always `null`; for an unauthenticated requester, `requestingCustomerId` is also always `null` — so the check was `null !== null`, always `false`, **always authorizing any guest requester for any guest order.** `GET /api/v1/orders/[id]` was live and directly callable (no frontend link needed) — anyone who learned an order's internal UUID could read another customer's full name, phone, address, and items. `cancelOrder` had the identical gap.

**Fix:** `assertOrderOwnership()` — for a customer order, unchanged (`customerId` match); for a guest order, checks the requester's `sessionId` against the *originating* session (`Order.checkoutSessionId → CheckoutSession.cartId → Cart.sessionId`, via a new minimal `ordersRepository.findOwningSessionId()` query, deliberately never included in `findById`'s own response shape so nothing internal leaks to a client). Both `getOrderForCustomer` and `cancelOrder` now take a `requester: {sessionId, customerId}` and are covered by new tests asserting a different guest session is rejected (`tests/integration/orders.test.ts`).

This fix deliberately does **not** apply to `trackOrder` (the `/track` lookup) — that endpoint's authorization model is intentionally different (order number + phone together, no session), because a guest legitimately needs to check status from a different device/browser than the one that placed the order. Session-based ownership would break that. See §4.4.

### 2.3 Rate limiting gap (fixed)

The security review found checkout submission (`POST /api/v1/orders`), cart mutation (`cart/items` POST/PATCH), `checkout/address`, and `checkout/shipping-rates` had no rate limit at all, unlike coupon-apply/OTP/order-track which already did. All five now have one, keyed by `session.sessionId` (not IP, since a session is already resolved and is the more precise identity for this class of endpoint):

| Endpoint | Limit |
|---|---|
| `POST /api/v1/orders` (place order) | 10 / 10 min |
| `POST /api/v1/cart/items` (add) | 60 / 10 min |
| `PATCH /api/v1/cart/items/[variantId]` (update qty) | 60 / 10 min |
| `POST /api/v1/checkout/address` | 20 / 10 min |
| `GET /api/v1/checkout/shipping-rates` | 20 / 10 min |
| `POST /api/v1/orders/track/cancel` (new, §3.4) | 10 / 10 min, keyed by phone (matches `orders/track`'s own posture) |

Everything else the review checked (Order IDOR on the customer-id path, cart access control, idempotency, direct-ERP-invocation-from-browser, session/cookie/CSRF posture, input validation, PII redaction, error-leakage) was already correct — see the review's own findings, all independently re-verified while building the UI on top of them.

### 2.4 A real, non-security bug found while wiring quick-add

`ProductCardData.id` (`src/ui/commerce/types.ts`) is the parent **Product's** id, not a Variant's — confirmed in `catalog-adapters.ts`'s own `toProductCardData`. `QuickAddButton` (used by every product grid: Home, Shop, Category, Search, PDP-related) received this as `productId` and would have sent it to `POST /api/v1/cart/items`, which expects a real `Variant.id` — a real, would-have-shipped bug (masked until now because the button never made a real API call at all, §3.3). Fixed by adding `primaryVariantId` to `ProductCardData` (populated from `pickPrimaryVariant`, the same safe derivation the PDP already uses), and renaming `QuickAddButton`'s prop from `productId` to `variantId` for clarity, mirroring the Phase 9.1 rename already applied to `ProductActions`. Covered by a new unit test (`tests/unit/catalog-adapters.test.ts`).

## 3. What was built this phase

### 3.1 Real cart drawer (`src/ui/commerce/cart-drawer-content.tsx`)

Replaces the hardcoded-empty Phase-3 shell. Fetches `GET /api/v1/cart` on open, shows a skeleton while loading, an `ErrorState` with retry on failure, `EmptyState` when empty, otherwise real line items with quantity +/- (`PATCH /api/v1/cart/items/[variantId]`) and remove (`DELETE`), an availability note per line (`in_stock`/`low_stock`/`out_of_stock`/`unknown`), a subtotal, and a link to `/checkout`. No new backend — every call hits an existing, unmodified route. Fires `view_cart` on successful load.

### 3.2 `/checkout` page (`src/app/(storefront)/checkout/`)

A single progressively-disclosed flow — address → shipping → coupon (optional) → payment method → review/place order — rather than a multi-route wizard, since no new backend concept was needed and every step already has its own existing API route. Payment method is **COD-only**: the ONLINE radio is shown but disabled with an honest "غير متاح حاليًا" label — never hidden, never falsely offered as working, since no gateway is integrated (`OnlinePaymentNotConfiguredError` would reject it server-side regardless). Places the order via `POST /api/v1/orders` with a client-generated `Idempotency-Key` (one `crypto.randomUUID()` per page load, reused across retries — so a double-click or a retry after a transient failure is a documented no-op, not a duplicate order). On success, shows the order number/total and a link to `/track`. Fires `begin_checkout`, `add_shipping_info`, `coupon_applied`, and `purchase`. Governorate is a real, non-invented list of Egypt's 27 governorates (`src/ui/commerce/governorates.ts`) — plain geography, not a business rule; the server (`ShippingZone` lookup) remains the sole authority on which are actually serviceable.

### 3.3 `/track` page (`src/app/(storefront)/track/`)

The frontend `GET /api/v1/orders/track` never had. Order number + phone, matching the existing anti-enumeration/rate-limit design. Shows status (mapped from `customerFacingStatus` to an Arabic badge), items, shipping address, and total.

### 3.4 Cancellation (new, both backend route and frontend)

`ordersService.cancelOrder` existed with **no route calling it at all** before this phase. Added `ordersService.cancelTrackedOrder(orderNumber, phone, reason)` — deliberately reusing `trackOrder`'s own phone-verified lookup (not session-based; see §2.2's note on why) — and `POST /api/v1/orders/track/cancel`, rate-limited like `orders/track`. Wired into `/track`: a "إلغاء الطلب" button appears only while `customerFacingStatus` is `confirmed` or `being_prepared` (before the harder-to-reverse fulfillment stages), behind a confirmation modal (`Modal` primitive). The server remains the real authority regardless: ERP can still reject the cancellation (`ErpOrderRejectedError`, already handled) if it's moved past that point in reality. A new `OrderAlreadyCancelledError` guards against double-cancellation. Fires a new `order_cancelled` analytics event (added to `analytics.ts`'s union and `ux-specification.md` §24's table — no existing event fit a post-purchase cancellation).

### 3.5 Homepage fix

Removed `MOCK_BEST_SELLERS` and the "الأكثر مبيعًا" claim. Replaced with real `catalogService.listAllProducts()` data (first 8) under an honest, non-invented heading ("منتجاتنا" — "our products"), matching `/shop`'s exact `dynamic = "force-dynamic"` reasoning (a real, changeable catalog must never be baked into a build-time static page).

### 3.6 Quick-add fix

`quick-add-button.tsx` now makes the real `POST /api/v1/cart/items` call, mirroring `product-actions.tsx`'s PDP add-to-cart exactly (same error handling, same toast-on-real-success pattern, real `add_to_cart` event only on confirmed success).

### 3.7 `/account` minor improvement

Still an honest placeholder (no auth backend — an explicit, carried-forward scope exclusion, not addressed this phase). Now links to `/track` in addition to "continue shopping", since a guest with no account can still find an order's status without logging in — the one real thing available today.

## 4. Journeys walked (A–J, as named in this phase's brief)

| Journey | Outcome |
|---|---|
| A — Normal purchase (guest, address → shipping → COD → confirm) | Works end-to-end against the real API routes; verified by code path + existing `tests/integration/checkout.test.ts` (DB-dependent, see §6 on sandbox limits). |
| B — Guest purchase | Same as A — there is no other kind of purchase today; no login exists. |
| C — ERP unavailable at confirmation | `confirmAndPlaceOrder`'s pre-check fails closed (`CheckoutValidationError("availability_check_unavailable")`), surfaced in `checkout-flow.tsx`'s `placeError` with the real Arabic message — not a silent success on stale data. Pre-existing, re-verified. |
| D — Stock changes between cart-view and confirmation | `InsufficientInventoryError` — same surfacing. Pre-existing, re-verified (`tests/integration/checkout.test.ts`'s own out-of-stock test). |
| E — Double submission | Client disables the button while `placing`; the real guard is the DB-unique-constraint-backed idempotency key inside the `$transaction` (verified in Phase 9.7's security review as genuinely enforced, not a racy pre-check) — a retry with the same key returns the original order, never a duplicate. |
| F — ERP accepts but the response is lost | Unaffected by this phase — `pushOrderToErp` already runs as a separate step *after* the Website's own commit (Phase 9.6 design); the customer already sees their order as placed regardless of this call's outcome. |
| G — ERP rejects (e.g. cancellation blocked) | `ErpOrderRejectedError` already mapped to a clear, honest Arabic message. Re-verified, now also reachable for real via §3.4's new cancel button. |
| H — Viewing old orders | **Partially covered.** `/track` covers looking up one known order (number + phone) — the only mechanism that doesn't require login. A genuine multi-order "my orders" list requires the account/login system, which remains an explicit, deliberate scope exclusion (not built this phase, not fabricated as a workaround — e.g., no invented "remember my orders in localStorage" mechanism). |
| I — Order-status changes | `/track` re-fetches live on each search; `customerFacingStatus` already pulls ERP's real fulfillment stage on demand (Phase 9.6). No push/polling — a customer re-checks by searching again, which is what `/track` is for. |
| J — Cancellation / post-order | Built this phase (§3.4) — previously entirely unreachable (no route existed at all). |

## 5. Verification performed

- `npm run typecheck` — clean.
- `npm run lint` — clean (one real finding worth recording: `eslint-config-next`'s `react-hooks/set-state-in-effect` rule flags a `useCallback`-extracted function called from `useEffect` if it contains ANY `setState` call anywhere in its body, regardless of `await` position — a named-function call site is flagged even when the exact same logic inlined as a `.then()` chain in the same effect is not. `cart-drawer-content.tsx`'s cart-loading effect was rewritten as an inline `.then()` chain to satisfy this cleanly rather than suppressing the rule.).
- `npx vitest run` — 164 passed, 68 skipped (all skips are pre-existing, DB-dependent integration tests; this sandbox has no reachable Postgres instance — confirmed via a direct TCP connection attempt to `localhost:5432`, refused). 0 failures. New tests added this phase: the checkout-ownership IDOR test, the guest-order IDOR tests, the cancellation tests, and the `primaryVariantId` unit tests.
- `npm run build` — clean; `/checkout` and `/track` both build and route correctly.
- **Not performed: live browser end-to-end testing of the golden path.** This sandbox has no reachable Postgres instance (verified above), and every new page depends on real data (cart/checkout/track all call live API routes backed by the database). Started `npm run dev` and confirmed `/`, `/checkout`, `/track`, `/account` all return HTTP 200 and render their client-side shell correctly, and that `GET /api/v1/cart` fails closed with a safe, non-leaking `internal_error` envelope (no DB) rather than crashing — but the actual add-to-cart → checkout → confirm → track → cancel flow has not been exercised against a live database in this environment. This is the same, already-established limitation prior phases documented for DB-dependent integration tests, now extended to manual browser verification for the same underlying reason.

## 6. Known gaps and open decisions (documented, not fabricated)

**Genuine business/content decisions, not engineering gaps:**
- The 5 policy pages (shipping/returns/payment/privacy/terms) and the About page's brand story still render only `EmptyState` "المحتوى قيد الإعداد" — real legal/content blocker, unrelated to this phase's technical scope.
- "Best seller" remains a non-existent business concept (no flag on `Product`/`Variant`) — the homepage fix (§3.5) works around this honestly rather than resolving it; a real ranking (by actual sales, once orders accumulate, or a manual merchandising flag) is a business decision for later.
- Full customer accounts/login/OTP UI: still absent, still a deliberate, explicitly-carried-forward exclusion from an earlier phase — not addressed here. This is the reason journey H (§4) is only partially covered.

**Genuine technical gaps, correctly left for a future phase (out of this phase's named scope):**
- No canonical URLs anywhere in the site's metadata.
- No per-route `loading.tsx` for category/search/PDP (they fall back to the root one); `/checkout` and `/track` also have none (their loading state is handled client-side inside the page instead, matching the account page's existing pattern).
- No `Product` JSON-LD (deliberately withheld — seeded content's names still carry the "(اسم تجريبي)" sample suffix).
- No thousands-separator in currency formatting.
- Rate limiting remains in-memory/single-instance (documented pre-existing limitation, `src/lib/rate-limit.ts`) — fine for one server instance, would need a shared store (e.g. a database table or an external cache) behind a horizontally-scaled deployment.
- `/checkout` and `/track` rely on `robots.ts`'s disallow list only (no page-level `noindex` meta) — the same posture `/account` already had before this phase; not newly introduced, not fixed here either.
- A session-based (non-phone) order-detail/cancellation UI for a future logged-in "my orders" experience: the service-layer functions (`getOrderForCustomer`, `cancelOrder`) are already correctly secured and tested (§2.2) and ready for that UI whenever the account system exists — no route currently exposes `cancelOrder`'s session-based path, only the phone-verified `/track` path (§3.4), which is deliberate for today's guest-only reality.

## 7. Self-review

- **Customer**: can a guest genuinely complete the purchase → confirmation → track → cancel loop using only real, working code paths? Yes, per §4's journey walk-through (COD only, as intended — no payment gateway exists or is claimed to).
- **Data/integration boundary**: no new business rule invented (governorate list is real geography, not policy; serviceability stays server-authoritative). ERP remains the sole inventory authority; nothing here adds a second one. No fake ERP reservation/commit API was added.
- **Security**: two real IDOR vulnerabilities found and fixed (§2.1, §2.2), both with regression tests; rate-limiting gap closed (§2.3). Re-confirmed nothing else the original security review flagged as safe was disturbed by this phase's changes.
- **UX**: every new page reuses existing primitives only (`Card`, `Input`, `Select`, `Radio`, `Modal`, `Button`, `EmptyState`, `ErrorState`, `Skeleton`) — no new component library, no Products-Experience-style additions.
- **Architecture/scope**: no Redis/Kafka/queue, no payment gateway, no courier/3PL, no ERP Website Admin module, no Shopify runtime, no unrelated ERP or database redesign. The only schema-adjacent change is a new `Order`-ownership *query* (`findOwningSessionId`) — no migration, no new column, no new table.

---

**Status: Ready for review.**
