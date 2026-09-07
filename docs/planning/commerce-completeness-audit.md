# Commerce Completeness Audit — Phase 4

Performed before writing the Prisma schema, per this phase's brief ("we previously had a problem in the ERP project where important requirements were discovered only after implementation — do not repeat that"). This document is the single place that reconciles the conceptual domain model (`docs/architecture/data-ownership.md`), the engineering spec (`docs/architecture/technical-architecture.md` §3–§13), and real implementation decisions this phase had to make to turn "conceptual" into "a real schema and real services."

Classification legend: **MVP** (built this phase) · **Production-required** (needed before real traffic, not built now) · **Later** (deliberately post-launch) · **Out of scope** (this phase or this project) · **Open decision** (business input needed) · **Already covered** (an existing doc/prior phase already addresses it).

Status: Phase 4. Last updated: 2026-09-07.

---

## 1. A reconciliation this audit had to make before writing any schema

`data-ownership.md`'s Order entity lists the transition `created → payment_pending → paid → pushed_to_erp → ...`, which reads as if an Order row exists in a `payment_pending` state. `technical-architecture.md` §9 is more specific and more recent (Stage 0.9 engineering-level): *"Order creation | Created by the Checkout module the moment payment is confirmed (online payment) or immediately (COD) — never before the customer has committed."* These two read as in tension.

**Resolution:** `technical-architecture.md` §9 governs the implementation — no Order row exists during online-payment's pending window. This isn't a coin-flip: it's the only reading that actually closes the gap described in the Phase 1 audit's **New Finding #1** ("inventory hold during the payment window" — see §8 below), since an Order row that exists in `payment_pending` state would still need *something* to represent the pre-order draft during that window regardless. What `data-ownership.md`'s conceptual `payment_pending` step maps onto in the real schema is a separate, explicit `CheckoutSession` entity (§10 below), not the Order table. This reconciliation should be folded back into `data-ownership.md` as a small wording clarification the next time that document is touched — recorded here rather than silently patched, per this phase's own instruction not to silently resolve architecture documents.

---

## 2. Product / Catalog

| Item | Classification | Decision |
|---|---|---|
| Product, Category | MVP | `Category`, `Product` tables — website-stored projection (see §3 on why it's a real table now) |
| Product status (active/discontinued) | MVP | `ProductStatus` enum on `Product`; discontinued products are excluded from customer-facing queries but never deleted (order history needs them) |
| Product visibility | Already covered | Same field — no separate "visibility" concept beyond status was ever specified, and inventing draft/scheduled-publish states isn't requested anywhere |
| SKU / Variant | MVP | `Variant` table, one or more per `Product`; SKU is globally unique and is the identity cart/order items key off (`data-ownership.md`) |
| Variant options (e.g. weight) | MVP (label only) | A single `label` string field (e.g. "500 جم") — **not** a generalized option/value EAV system. See the note below. |
| Product attributes | Open decision | No confirmed per-category attribute schema exists anywhere in requirements/design docs (dates vs. honey vs. oils genuinely need different facets, but which ones is unconfirmed — requirements §25's subcategory/type dependency). A `Json? attributes` field exists on `Product` so a future phase can populate it once attributes are confirmed, without a migration. Not read or validated by any logic this phase. |
| Product media, descriptions, SEO fields | Already covered | Content ownership (rich description/story/photography = website-owned) was already settled in `data-ownership.md`/`technical-architecture.md` §15; no new schema decision needed here — a `Product.richDescription`/media relation is Content module territory, out of scope for the *commerce engine* specifically |
| Product slug | MVP | `Product.slug` unique, matches Phase 3's route convention |
| Product ordering | MVP | `Product.sortOrder Int` |
| Product availability / out-of-stock behavior | MVP | Derived `AvailabilityState` (§5 below) — never a raw quantity exposed |
| Discontinued / archived products | MVP | One `ProductStatus` enum (`ACTIVE`, `DISCONTINUED`) — "archived" isn't a distinct concept in any doc; adding a third state would be inventing a business rule |
| Price / compare-at price | MVP | `Variant.priceAmountMinor` + `Variant.compareAtAmountMinor?` — both integer minor units (§4) |
| Product-specific restrictions (e.g. age-gating) | Out of scope | Nothing in any requirements doc suggests this business needs it; not modeled |

**Why variant attributes are a plain label, not an EAV system:** the brief explicitly warns against over-generalizing. Dates/honey/oils/nuts/ghee plausibly have different real attributes (variety, source, size, pressing method), but *which* attributes matter for each category is exactly the open dependency `website-functional-requirements.md` §25 already flags ("subcategory/type attributes per category" — critical, unresolved). Building a generic EAV table now would mean guessing a shape for data nobody has supplied yet — precisely the "invent a business rule" trap this phase is warned against. A single human-readable `label` per variant (what Phase 3's mock data already used informally: "تمر مجدول (اسم تجريبي)") is enough to make Cart/Order/Checkout fully real today; a structured attribute system is future-phase work, tracked as an open decision, not built speculatively.

**Why the catalog is a real Postgres table now, not still in-memory mock data (Phase 3's approach):** Cart/Order/Checkout need real foreign keys to real rows with real concurrency-safe inventory columns — in-memory arrays can't participate in a database transaction. The ERP Adapter sync job itself is explicitly out of scope this phase, so the tables are populated by a seed script (`prisma/seed.ts`) with clearly-labeled sample data (same "(اسم تجريبي)" convention as Phase 2/3), simulating what a future ERP sync would eventually write. This is not "a fake ERP client" (forbidden by this phase's brief) — it's a seed script, the standard way any Prisma project bootstraps local data, and it calls no adapter, simulates no protocol, and pretends to talk to nothing.

---

## 3. Variants

| Item | Classification | Decision |
|---|---|---|
| Weight/size, package size | MVP | `Variant.label` (see above) |
| SKU | MVP | `Variant.sku` unique |
| Price per variant | MVP | `Variant.priceAmountMinor` (price is never attached to a bare Product — `data-ownership.md`) |
| Inventory per variant | MVP | `Variant.inventoryQuantity` (raw) + reservations (§8) computed per-variant |
| Availability per variant | MVP | Derived, per variant |
| Image/media per variant | Out of scope | No variant-level imagery exists anywhere yet (Phase 3's asset-manifest gap, unchanged); `Product`-level imagery only |
| Variant ordering | MVP | `Variant.sortOrder` |
| Disabled variants | MVP | `Variant.active Boolean` — independent of the parent product's status, since a specific size can be discontinued while others remain |
| Products without variants | MVP | A product with exactly one variant *is* the single-SKU case (matches Phase 2/3's `hasMultipleVariants` derivation: `product.variants.length > 1`) — no separate "variant-less product" shape, avoiding two parallel code paths for what's structurally the same thing |
| Shared inventory across variants | Confirmed not assumed | Each `Variant` row owns its own `inventoryQuantity` independently — nothing pools inventory across variants of the same product |

---

## 4. Money / Pricing

| Item | Classification | Decision |
|---|---|---|
| Integer minor units, no floats | Already covered | `src/domain/money.ts` (Phase 1) — reused as-is everywhere in this phase, not reimplemented |
| Unit price, line price, subtotal, discount, shipping fee, grand total | MVP | All computed server-side in the Checkout/Order services from live Catalog + Coupon + Shipping data — never trusted from the client (technical-architecture.md §12's explicit "never trusted from the client" list) |
| Taxes | **Open decision — explicitly not resolved here** | No tax rate/policy/e-invoicing requirement exists in any canonical doc (this echoes Phase 1's New Finding #4, still open). `Order.taxAmountMinor` and `CheckoutSession.taxAmountMinor` exist as real integer-minor-unit columns, computed through a `TaxPolicy` interface (`src/modules/checkout/tax-policy.ts`) — the same adapter-boundary shape as Payment/Shipping/Notifications — whose only implementation, `ZeroTaxPolicy`, always returns zero and is named to say so. **Not because tax is decided to be zero**, but because the column and the interface call site exist and are wired end-to-end, so turning on a real rate later means writing one new class implementing the same interface and swapping one assignment, never a schema migration or a checkout-flow rewrite. Upgraded from a bare local function to this named interface in Phase 4's review pass, specifically so the "temporary, not a decision" framing is structural (a class named `ZeroTaxPolicy`), not just a comment. |
| Refunds | MVP (state only) | `PaymentStatus` includes `REFUND_INITIATED`/`REFUND_COMPLETED` (technical-architecture.md §5); no refund *policy* (what's refundable, time window) is decided — see §14 |
| Rounding | MVP | All amounts are integers throughout (piasters) — no rounding step exists because there's never a fractional intermediate value to round; percentage-discount calculation rounds to the nearest piaster (documented in the Money/pricing service, tested explicitly) |
| Currency | Already covered | EGP only, `Money`'s existing `CurrencyCode` union — unchanged |

---

## 5. Inventory — the most important section

The brief is explicit: "stock quantity > 0 = available" is not sufficient. This phase's design:

| Item | Classification | Decision |
|---|---|---|
| Available / reserved / sold quantity | MVP | `Variant.inventoryQuantity` (the projection's raw count) minus the sum of that variant's *active* `InventoryReservation` rows = what's actually offerable. "Sold" isn't a separate counter — it's implicit once an `Order` exists (the reservation that produced it is marked `CONSUMED`, not counted against availability, and the ERP is the eventual authority on the real decrement once fulfillment happens). |
| Inventory sync from ERP | Out of scope this phase | The sync job itself is ERP Integration, explicitly excluded. `Variant.inventoryQuantity` is written by the seed script for now, exactly like the rest of the catalog projection (§2). |
| Temporary reservation + expiration | MVP — **this is the direct fix for Phase 1's New Finding #1** | `InventoryReservation(variantId, checkoutSessionId, quantity, status, expiresAt)`. Created when a `CheckoutSession` is confirmed ready for payment (i.e. at the moment `POST /checkout/payment` or the COD equivalent is invoked), released automatically on expiry, failure, or cancellation. **15-minute default TTL, centrally configurable via `INVENTORY_RESERVATION_TTL_MINUTES`** (`src/lib/env.ts` → `src/modules/catalog/inventory.ts`'s `RESERVATION_TTL_MS`, the single place this value is defined and used) — the exact duration the Phase 1 finding itself suggested as an example; still explicitly an **open decision** for the business to confirm (the finding: *"the hold duration/UX... needs product input"*). Made env-configurable in Phase 4's review pass specifically so confirming a different value later is a deployment-configuration change, never a code or schema change. |
| Reservation → order confirmation | MVP | On successful COD placement or captured online payment, the active reservation(s) for that `CheckoutSession` transition `ACTIVE → CONSUMED` in the *same* database transaction that creates the `Order` (§13 below) |
| Reservation release on payment failure/cancellation/timeout | MVP | `ACTIVE → RELEASED`/`EXPIRED`; a background sweep (a scheduled task per `technical-architecture.md` §19's "no queue at MVP" pattern, not a new job-queue dependency) expires stale reservations whose `expiresAt` has passed and whose `CheckoutSession` never completed |
| Overselling prevention / concurrent checkouts | MVP | See §13 (Concurrency) — reservation creation happens inside a transaction that locks the variant row, so two concurrent checkouts for the last unit cannot both succeed |
| Race conditions | MVP | Same — `SELECT ... FOR UPDATE` (via Prisma's raw-query escape hatch inside `$transaction`) on the variant row before computing available-minus-reserved, not a naive read-then-write |

**Conceptual lifecycle actually implemented** (validated against, not copied blindly from, the brief's example):

```
Catalog available (raw qty − active reservations)
  → Cart (no reservation yet — browsing/holding items is free)
  → Checkout confirmed / payment initiated → InventoryReservation created (15 min TTL)
      ├─ COD → Order created immediately, reservation → CONSUMED
      ├─ Online payment captured → Order created, reservation → CONSUMED
      ├─ Online payment failed/cancelled → reservation → RELEASED
      └─ Reservation TTL exceeded, no resolution → reservation → EXPIRED (sweep job)
```

The cart itself never holds a reservation — only a confirmed checkout does. This matches `technical-architecture.md` §8 ("the cart... never stores a trusted price or stock number") and keeps the reservation window as short as the brief's own finding recommends, rather than reserving stock the moment something is added to a cart (which would let an abandoned cart quietly starve real availability).

---

## 6. Cart

| Item | Classification | Decision |
|---|---|---|
| Guest cart / authenticated cart | MVP | `Cart.sessionId` always set; `Cart.customerId` set once authenticated — matches `technical-architecture.md` §8 exactly |
| Cart identity, persistence | MVP | One active `Cart` per session/customer, hard-deleted only on conversion cleanup — no forced expiration (§8's explicit "no hard cart expiration at MVP") |
| Add/remove/quantity change | MVP | `CartService` — quantity always clamped server-side to live availability, never trusted from the client |
| Invalid quantity / unavailable product | MVP | Rejected with a `business_rule`-category error before any row is written |
| Price/product/variant changes since add-time | MVP | Every cart read re-fetches the live `Variant` row — no frozen price is ever treated as authoritative (`addedPriceAmountMinor` is stored *only* for the "price changed since you added this" UX flag, never for totals) |
| Coupon application, shipping estimate | MVP (coupon) / Production-required (shipping estimate on cart) | Coupon validation lives in the `PromotionsService`, callable from Cart or Checkout; a shipping estimate *before* an address is known isn't specified anywhere (requires a default zone assumption nobody has confirmed) — left to Checkout, where a real address exists |
| Totals recalculation | MVP | Always computed at read time by `CartService.getCartTotals()` — no stored total column on `Cart` itself (would immediately go stale) |
| Merging guest cart with customer cart | MVP | `CartService.mergeCarts()` — per-SKU quantity combination, prices always re-fetched live, per `technical-architecture.md` §8 |
| Duplicate requests / idempotency | MVP | Add-item is naturally idempotent by design (unique constraint on `(cartId, variantId)`, increments rather than duplicates) — no separate idempotency key needed for cart mutations, only for checkout/payment/order (§12) |

---

## 7. Customer

| Item | Classification | Decision |
|---|---|---|
| Phone identity, E.164 normalization | MVP | `Customer.phoneE164` unique; a `normalizePhoneToE164()` pure function (Egyptian local formats → `+20...`), unit-tested directly |
| Guest checkout | MVP | `Order.customerId` and `Cart.customerId` are nullable; a guest completes a full purchase with only a phone number captured at the order/contact step |
| Authenticated customer | MVP | `Customer` + `Session` |
| Customer profile, status | MVP (thin) | Name/email optional fields; no "status" enum beyond existence — nothing in requirements asks for suspended/banned states yet |
| OTP / authentication | MVP (abstraction only, no provider) | `OtpChallenge(phoneE164, codeHash, expiresAt, attempts, maxAttempts, consumedAt)` — the code itself is **never stored raw**, only a salted hash, checked the same way a password would be. `OtpProvider` interface (`send(phone, code)`) with one real implementation: a `LogOtpProvider` that writes the code to the structured logger at `debug` level only outside production (mirrors `src/lib/analytics.ts`'s dev-only console pattern) and refuses to run in production — no real SMS/WhatsApp provider is wired, per this phase's explicit instruction. |
| Guest-OTP-required policy | Open decision | Unchanged (`website-functional-requirements.md` §25) — `CheckoutSession` has an optional OTP-verification step in the service layer that's exercised or skipped based on a config flag, not hard-coded either way |

---

## 8. Address

| Item | Classification | Decision |
|---|---|---|
| Recipient name, phone, structured fields | MVP | `Address` table: `recipientName`, `phoneE164`, `governorate`, `city`, `area?`, `street`, `building?`, `floor?`, `apartment?`, `landmark?`, `notes?` |
| Governorate/city/area taxonomy | **Open decision, extensible structure used** | No finalized Egyptian geographic taxonomy exists in any doc. `governorate`/`city`/`area` are plain validated strings (non-empty, length-bounded), **not** foreign keys into a hard-coded lookup table — so a future confirmed taxonomy (a real governorate/city/area reference table) can be introduced by adding FK columns and backfilling, without breaking existing address rows or requiring every existing row to be re-entered. |
| Default address | MVP | `Address.isDefault Boolean`, enforced unique-per-customer inside the repository's `setDefault()` method (unset-then-set in one transaction). A Postgres partial unique index (`WHERE is_default = true`) would harden this further, but authoring it correctly requires a live database to generate/verify the migration against (unavailable in this sandbox — see the Testing section) — tracked as a production-hardening step for whoever runs the first real migration, not silently claimed as already done. |
| Address status | Out of scope | No "archived/invalid" address status is requested anywhere; a removed address is soft-relevant only insofar as **orders never reference it live** (§9's snapshot rule) |
| Address ownership / IDOR | MVP | Every address read/write is scoped to the authenticated session's customer id server-side — never trusts an address id alone (security requirement, restated in §15) |

---

## 9. Shipping

| Item | Classification | Decision |
|---|---|---|
| Shipping Adapter boundary | MVP | `ShippingProvider` interface (`checkServiceability`, `getRates`, `createShipment`, `getTracking`) — `technical-architecture.md` §6 exactly |
| MVP implementation | MVP | `ManualShippingAdapter` — a `ShippingZone` table (`governorate → feeAmountMinor, estimateLabel, codSupported`), maintained data, not a real courier integration |
| Delivery zone / unavailable zone | MVP | Governorates with no matching `ShippingZone` row are unserviceable — checkout blocks progression with a clear message (matches `requirements.md` §9 / UX spec §10) |
| Exact fees | **Open decision** | No real fee schedule has been supplied by the business. The seed data ships with clearly-labeled placeholder fees (documented as such in the seed script and this doc) — never presented anywhere as confirmed pricing. |
| Real courier integration | Out of scope this phase | Explicitly excluded by the brief |

---

## 10. Payment

| Item | Classification | Decision |
|---|---|---|
| Payment Adapter boundary | MVP | `PaymentProvider` interface (`createPayment`, `authorize?`, `capture?`, `confirm`, `fail`, `refund`, `queryStatus`) — `technical-architecture.md` §5 exactly |
| Payment state machine | MVP | `PaymentStatus`: `INITIATED → PENDING → AUTHORIZED? → CAPTURED`, `FAILED`/`CANCELLED` reachable pre-capture, `REFUND_INITIATED → REFUND_COMPLETED`, plus `AWAITING_COD_COLLECTION` as COD's own first-class terminal-pending state (§5's explicit guidance: COD is a real adapter, not a "no real payment provider" special case) |
| COD adapter | MVP | `CodPaymentAdapter` — a real, complete adapter implementation (not a stub): `createPayment()` returns `AWAITING_COD_COLLECTION` immediately, `capture()` (called on delivery confirmation — a future Orders/ERP-driven event, not built this phase) transitions to `CAPTURED` |
| Online payment adapter | Out of scope this phase | The gateway is an open business decision (unchanged). No real adapter is implemented; the interface exists and is validated by adapter-contract-shaped unit tests using a `TestPaymentAdapter` (in-memory, deterministic, used only in tests — never reachable from a real checkout request), proving the interface itself is implementable and sufficient before a real gateway is chosen |
| Idempotency | MVP | `Payment.idempotencyKey` unique — a retried `createPayment` call for the same order/session returns the existing record |
| Webhook handling | Out of scope this phase | No real provider means no real webhook to verify yet; the `confirm(payload)` interface method exists so a future provider's webhook handler has a stable target to call into |
| Distinguishing states as separate values, not one boolean | MVP | Confirmed — `PaymentStatus` is the enum described above, never collapsed into `paid: boolean` |

---

## 11. Promotions / Discounts

| Item | Classification | Decision |
|---|---|---|
| Percentage discount, fixed discount | MVP | `Coupon.type` (`PERCENTAGE` \| `FIXED`), `Coupon.value` |
| Coupon codes, minimum order, usage limits, per-customer limits, start/end dates | MVP | All modeled as `Coupon` columns and validated by `PromotionsService.validateCoupon()` |
| Product-specific / category discount | Later | No requirement anywhere specifies which products/categories such a discount would target — building the targeting model now means guessing it |
| Order-level discount | MVP | This *is* what the MVP coupon is (applies to the order subtotal) |
| Stacking rules, priority, exclusions | **Open decision — explicitly not invented** | `data-ownership.md`/`ux-specification.md` §14 already fix "exactly one coupon per order at MVP" — enforced structurally (a `CheckoutSession` has at most one `couponCode` field, not a collection), so stacking/priority/exclusion logic has nothing to arbitrate and doesn't need to exist yet. If multi-coupon support is ever approved, this becomes a real design question then, not now. |
| Expired / invalid coupons | MVP | Specific per-case rejection reasons (`expired`, `not_yet_active`, `usage_limit_reached`, `minimum_order_not_met`, `not_found`) — never a generic "invalid coupon" message, matching `ux-specification.md` §14's requirement for case-specific errors |
| Coupon re-validation at order creation | MVP | Checkout re-validates the coupon at final order creation, not only when first applied — an expiring-mid-session coupon is caught (`ux-specification.md` §14) |

---

## 12. Checkout

Implemented as a real, server-authoritative orchestration exactly matching `technical-architecture.md` §10's 6-column table (contact → address → shipping → payment → review → place order), backed by the `CheckoutSession` entity:

| Item | Classification | Decision |
|---|---|---|
| Server-authoritative pricing/discount/inventory/shipping/tax/total | MVP | `CheckoutService.recalculate()` is the single function that produces every number shown to the customer — never a client-supplied number |
| Address/customer validation | MVP | Structural validation (zod) + serviceability check (`ShippingProvider.checkServiceability`) |
| Availability re-check | MVP | Re-run at `CheckoutSession` confirmation (the point a reservation is created, §5) and again inside the order-creation transaction (§13) — the two re-check points `technical-architecture.md` §8/§16 specify |
| Promotion application | MVP | Via `PromotionsService`, re-validated at final order creation |
| Order/payment creation according to method | MVP | COD vs. online-payment branch exactly as `technical-architecture.md` §9 specifies |
| Idempotency | MVP | See §13 |
| Full payment flow (real gateway UI/redirect) | Out of scope this phase | No real gateway exists to redirect to yet |

---

## 13. Idempotency & Concurrency

| Item | Classification | Decision |
|---|---|---|
| Checkout submission / order creation | MVP | `POST /api/v1/orders` requires an `Idempotency-Key` header; the key is recorded in `IdempotencyKey` (scope-tagged) inside the *same* transaction as order creation — a retried request with the same key returns the original order, never a second one |
| Payment initiation | MVP | `Payment.idempotencyKey` unique constraint, same pattern |
| Refund | Structurally supported, not exercised | `PaymentProvider.refund()` accepts an idempotency key in its signature; no real refund flow is triggered this phase (no real payment provider to refund from) |
| Inventory reservation/release | MVP | Reservation creation is wrapped in `prisma.$transaction` with `SELECT ... FOR UPDATE` on the target `Variant` row(s) (raw SQL via `$queryRaw` inside the transaction — Prisma has no first-class row-lock API), so two concurrent requests for the last unit serialize instead of both reading the same pre-decrement count |
| Webhook double-delivery | Out of scope this phase | No real webhook source exists yet; the `IdempotencyKey` table's shape already generalizes to this case when a real provider arrives |
| "Double-click place order" | MVP, tested | A duplicate submission with the same idempotency key is a documented, tested no-op (returns the original order) |

**Race-condition analysis performed (not "solved with a SELECT-then-UPDATE"):** the naive `SELECT stock → check in app code → UPDATE stock` pattern is exactly what this phase's brief calls out as insufficient — two concurrent requests can both pass the check before either writes. The implementation instead does the read, the availability check, and the reservation insert inside one `SERIALIZABLE`-safe unit: a row-level lock (`FOR UPDATE`) is taken on the `Variant` row before the available-quantity arithmetic happens, so the second concurrent transaction blocks until the first commits or rolls back, then re-reads the now-current reserved total. This is verified by a dedicated concurrency test (§17) that fires N parallel reservation attempts at a variant with fewer than N units available and asserts exactly the correct number succeed.

---

## 14. Order domain & state model

Implements `data-ownership.md`'s Order/OrderItem entity with the reconciliation from §1 above.

- **Order lifecycle** (website-owned, `OrderStatus`): `CONFIRMED → CANCELLED`. An order row is only ever created already-confirmed (§1) — there is no `pending` Order state, because the pending window is `CheckoutSession`'s job. `REFUNDED` is **not** a separate `OrderStatus` value — it's derived at read time from the linked `Payment.status`, per `data-ownership.md`'s own instruction that "the order's customer-facing status reflects [the refund], but the order record itself is never... overwritten." Modeling it as a second source of truth would let the two disagree.
- **Payment lifecycle**: the linked `Payment.status` (§10) — entirely independent of `OrderStatus`.
- **Fulfillment lifecycle**: reserved for the ERP Order Reference, genuinely not populated this phase (no ERP Adapter exists) — `Order.erpOrderReference` and `Order.erpPushStatus` (`NOT_PUSHED → PENDING → SUCCEEDED/FAILED`, tracking only whether *the website's own push attempt* succeeded, never the ERP's internal fulfillment stages) exist so the boundary is real in the schema without any code pretending to talk to an ERP.
- **Line-item snapshots**: `OrderItem` stores `skuSnapshot`, `productNameSnapshot`, `variantLabelSnapshot`, `unitPriceAmountMinor`, `quantity`, `lineTotalAmountMinor` — never a live join back to `Variant`/`Product` for anything that affects what the order legally says the customer bought. A `variantId` FK is kept (nullable-on-delete) for traceability/support tooling only, never read by pricing/display logic.
- **Address/shipping snapshots**: inlined directly on `Order` (not a live FK to `Address`) — editing or deleting a saved address can never alter a past order.
- **Public order reference**: `Order.orderNumber` (`JAK-000123`-shaped, sequential-but-not-guessable — see §15) is what's shown to the customer and used for tracking lookups; the UUID primary key is never exposed in a customer-facing URL.
- **Cancellation/refund**: cancellation is an explicit `OrderStatus` transition with a required reason field; refund is purely a `Payment`-side transition (above) — both are additive, auditable (`AuditLog`), and never delete/overwrite the original order record.

---

## 15. COD

| Question the brief asks | Answer this phase gives | Status |
|---|---|---|
| When is the order created? | Immediately on checkout submission — no external confirmation to wait for (`technical-architecture.md` §9) | MVP, implemented |
| When is inventory reserved? | Same reservation mechanism as online payment (§5) — created at checkout confirmation, consumed the instant the Order/Payment row is created in the same transaction | MVP, implemented |
| Is payment state "pending"? | No — `AWAITING_COD_COLLECTION`, a distinct, real, first-class state (not a repurposed "pending") | MVP, implemented |
| Cancellation before delivery | A website-initiated `OrderStatus` transition to `CANCELLED`; releases nothing further (the reservation was already consumed, not held) | MVP, implemented |
| Failed delivery / customer rejection / return-to-sender | **Open decision** | Not modeled — these are operational/courier-driven outcomes with no confirmed policy anywhere; `Payment.status` has room to grow (e.g. a future `RETURNED` value) without a schema rewrite, but nothing invents that policy now |
| Operational confirmation (money actually collected) | **Open decision, structurally ready** | `PaymentProvider.capture()` exists as the seam a future ERP-driven "delivered, cash collected" event would call — not wired to anything yet, since that event source doesn't exist this phase |

---

## 16. ERP boundary (preserved, not implemented)

No ERP Adapter, sync job, or client of any kind is implemented this phase — confirmed absent from the codebase. What crosses the boundary, once a future phase builds the adapter, is documented here so that phase doesn't have to rediscover it:

- **Website → ERP:** `pushOrder(order)` — needs order number, line items (SKU/qty/unit price/line total), customer snapshot (name/phone), address snapshot, shipping method, totals, payment method and status. Every one of these fields already exists on `Order`/`OrderItem` today.
- **ERP → Website:** `getOrderStatus()` — would populate a future fulfillment-stage field this phase deliberately does not add (§14) — adding it now would mean guessing the ERP's actual stage vocabulary.
- **Website → ERP (read-and-match only):** `reconcileCustomer()` — not called this phase; `Customer.erpCustomerId?` exists as the field it would eventually populate.

---

## 17. Returns / Refunds

Not implemented as a workflow (unchanged from Phase 1's New Finding #2 — still **Later**). Verified this phase's Order/Payment model does not foreclose it: a refund is a `Payment.status` transition (`REFUND_INITIATED → REFUND_COMPLETED`) linked to the existing order, additive and non-destructive; a physical return has no schema representation yet and doesn't need one until the workflow itself is scoped. **Open decision:** return/refund policy itself (window, condition, restocking) — not invented here.

---

## 18. Notifications

`NotificationProvider` interface (`notify(type, recipient, payload)`) exists, matching `technical-architecture.md` §18 exactly. One real implementation this phase: `LogNotificationProvider`, which writes a structured log line (never a real SMS/email/WhatsApp send) — used by the OTP flow (§7) and available for order-confirmation notifications, though no code path actually triggers an order-confirmation notification yet (would require deciding what it says, which is content the business hasn't supplied). No provider SDK is integrated, per this phase's explicit instruction.

---

## 19. Customer privacy

- No OTP code, full phone number, full address, or payment credential is ever written to a log line — enforced by extending Phase 1's existing `logger.ts` redaction list (`*.otpCode` was already present; `*.phoneE164`/address fields added this phase) rather than trusting every call site to remember.
- Public order tracking (`GET /api/v1/orders/track`) requires *both* the order number *and* the phone number on the order — knowing only a guessable sequential order number is never sufficient to view another customer's order (§20's IDOR concern).
- Internal UUIDs are never exposed in a customer-facing URL or response where the public order number already serves the purpose.

---

## 20. Security specifics for this phase

- Every address/order/cart read is scoped to the authenticated session's own customer id (or the session id, for a guest cart) server-side — an id in a URL is never sufficient authorization on its own.
- Coupon-apply and OTP-verify endpoints get their own tighter rate limits (reusing `src/lib/rate-limit.ts`, Phase 1), independent of the general API rate limit.
- Order tracking's phone+order-number requirement (§19) is the specific anti-enumeration control for that one public, unauthenticated endpoint.
- Mass assignment: every write path uses an explicit zod schema listing exactly the accepted fields — no `...body` spread into a Prisma `create`/`update` call anywhere in this phase's code.

---

## 21. Architecture risks discovered this phase

1. **The `data-ownership.md` / `technical-architecture.md` §9 tension (§1 above)** — worth a small doc fix next time either file is touched; not blocking, since this audit records the resolution.
2. **`Variant.attributes: Json?` is a pressure-release valve, not a design.** If per-category attributes are confirmed later, the right move is a proper structured table (or at least a validated per-category zod shape read from that JSON column), not accumulating ad hoc reads of an untyped blob. Flagged so a future phase doesn't quietly build on top of the loose column instead of formalizing it.
3. **The reservation-sweep job (§5) has no scheduler wired up yet** — `technical-architecture.md` §19 explicitly allows "an external scheduler hitting an internal endpoint" as the MVP mechanism, and this phase builds that endpoint (`POST /api/v1/internal/inventory/sweep-expired-reservations`), but nothing in this sandbox environment invokes it on a schedule. Documented as a deployment-configuration task, not a code gap.

---

## Outcome

No commerce capability the brief asked to consider was silently skipped without a row above. The one genuine correctness gap carried in from Phase 1 (New Finding #1) is now closed by a real, tested reservation mechanism rather than left as a known risk. Every open business decision already on record elsewhere (tax, exact shipping fees, coupon stacking, COD failure-delivery policy, payment/courier/OTP providers) remains open here too — none was resolved by assumption.
