# ERP Sync Map & Order Lifecycle Trace

> **Phase 6 update (2026-09-10):** the real ERP has since been inspected. The website-side order-lifecycle trace below is unchanged and still accurate. The ERP-side sync direction/payload placeholders are now resolved in `erp-order-lifecycle-mapping.md` and `erp-website-real-mapping.md` — most importantly, the ERP's real order-create operation does not exist for any non-Shopify caller yet (it must be built, not just mapped to), and the real status vocabulary (including two dead enum values, `qc`/`failed_delivery`, not to map onto) is now known. This document is kept as-is below for its historical Phase 5 record.

Phase 5 — ERP Integration Readiness & Gap Audit. Preliminary synchronization directions and a full trace of the current website order lifecycle, marking every point a future ERP interaction would attach. Nothing here is final — every flow that depends on the real ERP's actual behavior is marked accordingly. No code changes, no external calls, no implementation.

Status: Phase 5. Last updated: 2026-09-08.

---

## 1. Preliminary sync direction map

Restates and elaborates `blueprint.md` §6/§9's already-approved direction — this phase did not invent a new shape, only added the operational columns (trigger, payload concept, idempotency, failure/retry, reconciliation) those sections don't spell out at this level of detail.

### ERP → Website

| Flow | Source of truth | Trigger | Payload concept | Idempotency | Failure behavior | Retry | Reconciliation |
|---|---|---|---|---|---|---|---|
| Products (core facts) | ERP | Scheduled pull (interval TBD — `technical-architecture.md` §3: "likely minutes") | `[ERP PRODUCT IDENTIFIER]`, name, category, status — **requires ERP inspection** for exact shape | Not applicable to a read — each pull simply overwrites the projection row | Previous projection state retained untouched; alert on repeated failure | Exponential backoff (`blueprint.md` §9) | Periodic full-catalog diff against a fresh pull (`technical-architecture.md` §3) |
| Variants / SKUs | ERP | Same scheduled pull | `[ERP VARIANT IDENTIFIER]`, SKU, label/options — **requires ERP inspection** for whether variants are flat or structured | Same as above | Same as above | Same | Same |
| Prices | ERP | Same scheduled pull | Amount, currency — **requires ERP inspection** for whether temporal/promotional pricing is expressed | Same | Same — "never partially written (all-or-nothing per record)" per `technical-architecture.md` §3 | Same | Same |
| Inventory | ERP | Same scheduled pull | Raw quantity — **requires ERP inspection** for whether the ERP exposes a raw number or its own derived state | Same | Stale projection tolerated by design (derived availability state absorbs a few minutes of lag) | Same | Same |
| Product/operational status (discontinued, etc.) | ERP | Same scheduled pull | Status enum — **requires ERP inspection** for the ERP's actual vocabulary | Same | Row marked `DISCONTINUED`, never hard-deleted (preserves order history references) | Same | Same |
| ERP order reference + fulfillment/operational status | ERP | Scheduled pull, or webhook **if the ERP supports one — requires ERP inspection** | `[ERP ORDER REFERENCE]`, `[ERP OPERATIONAL STATUS CODE]` | Read-only pull; a webhook (if it exists) would need its own delivery-id-based idempotency — **requires ERP inspection** | Stale status shown as "جاري التحديث" (calm, not an error) per `technical-architecture.md` §21/UX spec §21 | Same backoff pattern | A periodic reconciliation poll for any order stuck in a non-terminal state beyond a threshold (mirrors the existing Payment reconciliation pattern already approved in `technical-architecture.md` §5) |

### Website → ERP

| Flow | Source of truth | Trigger | Payload concept | Idempotency | Failure behavior | Retry | Reconciliation |
|---|---|---|---|---|---|---|---|
| Confirmed order push | Website (the just-created `Order` row) | Immediately after `checkoutService.confirmAndPlaceOrder()` commits (COD: immediately; online: after capture — see §2 below) | `[ERP ORDER CREATE OPERATION]` — order number, customer info, address, line items (SKU/qty/unit price/line total), totals, payment method+status, shipping method+fee. **Every one of these fields already exists on `Order`/`OrderItem` today** (confirmed by reading the schema, not assumed) | Website order id/`idempotencyKey` used as the ERP-side idempotency key (`blueprint.md` §8/§9's already-approved rule) — the same `IdempotencyKey` pattern Phase 4 already built for order creation itself is the natural mechanism for the push, not a new one | Dead-letter table + alert; **the order remains valid website-side regardless** — an ERP push failure is never customer-visible (`technical-architecture.md` §22's `erp_integration` error category: "never surfaced as a checkout-blocking error") | Exponential backoff, capped attempts | Nightly/periodic sweep of `erpPushStatus = PENDING`/`FAILED` orders older than a threshold |
| Customer reconciliation | Website (`Customer.phoneE164`/name) | At order-time only, not continuous (`blueprint.md` §9) | `[ERP CUSTOMER MATCH/CREATE OPERATION]` — phone/email match, create-if-absent. **Requires ERP inspection** for exact match semantics (phone only? phone+email? fuzzy matching?) | Match-then-create is naturally idempotent if the ERP itself de-duplicates on the same key — **requires ERP inspection** to confirm | If reconciliation fails, the order is still created website-side and retried per the order-push failure handling (`technical-architecture.md` §4) | Same backoff | None needed beyond the order-push reconciliation itself |
| Cancellation | Website (`Order.status = CANCELLED`) | A website-initiated cancellation | `[ERP ORDER CANCEL OPERATION]` — **requires ERP inspection**: does the ERP need an explicit cancel call, or does it detect cancellation via a status pull? Not assumed either way | Same idempotency pattern as the original push | **Undefined without ERP inspection** — flagged in the gap analysis as a real open question, not resolved here | N/A until designed | N/A until designed |

**What this phase deliberately did not do:** invent the actual field names, endpoint shapes, or payload structure the real ERP expects — every bracketed placeholder above (`[ERP ...]`) is exactly that, a placeholder, per this phase's explicit instruction.

---

## 2. Order lifecycle trace — current website behavior, step by step

Traces the *actual implemented* lifecycle (`src/modules/checkout/service.ts`, `src/modules/orders/service.ts`, `src/modules/payments/*`), not a re-description of the architecture docs.

| Step | Current website owner | Current persistence | External dependency today | Idempotency requirement | Future ERP interaction point |
|---|---|---|---|---|---|
| **Product selection** | Catalog module (`src/modules/catalog`) | Read-only — `Product`/`Variant` rows (seeded) | None | N/A (read) | This is the read side of the ERP → Website product/price/inventory sync (§1) once real |
| **Cart** | Cart module | `Cart`/`CartItem` | None | Naturally idempotent (unique `(cartId, variantId)` constraint — adding twice increments, never duplicates) | None directly — cart is never sent to the ERP (`blueprint.md` §7) |
| **Inventory reservation** | Catalog module's `reserveInventoryForItems()` | `InventoryReservation` | None | Required and enforced — row-level lock + transaction (Phase 4, verified under concurrency) | See §1's Inventory row and the ownership matrix's §5 — the reservation itself has no ERP equivalent, but the *raw quantity it reserves against* would come from the ERP sync |
| **Checkout (address/shipping/coupon)** | Checkout module | `CheckoutSession` | `ShippingProvider` (currently `ManualShippingAdapter`, zone lookup) | Each step is idempotent by construction (re-running `setAddress`/`applyCoupon` just overwrites the same session's fields) | Serviceability/rate calculation could eventually be ERP-driven if the real ERP owns delivery zones — **requires ERP inspection**, not assumed |
| **Payment** | Payments module | `Payment` | `PaymentProvider` (currently `CodPaymentAdapter` only; no online adapter configured) | `Payment.idempotencyKey` unique constraint | Not an ERP concern per the approved model (§2 of the ownership matrix — payment is provider-agnostic, orthogonal to the ERP) |
| **Order creation** | Checkout module, inside one transaction | `Order` + `OrderItem[]` | None (no ERP call happens here — by design, per this phase's explicit instruction not to implement anything) | `Order.idempotencyKey` unique constraint, claimed via the shared `IdempotencyKey` ledger before any row is written — verified by a dedicated duplicate-submission test | **This is the exact moment the future `pushOrder()` call would be triggered** — see §1's "Confirmed order push" row. Nothing calls it today. |
| **Confirmation** | Orders module (read) | Reads the just-created `Order` | None | N/A (read) | None additional — confirmation is a read of website-owned data |
| **Fulfillment** | **Not implemented** | `Order.erpPushStatus` exists (`NOT_PUSHED` always, today) but nothing populates real fulfillment stages | None | N/A | This entire step is where the ERP → Website status-pull flow (§1) would live — currently a complete gap, correctly so per this phase's brief (no ERP integration to be implemented) |
| **Shipping** | Shipping module (`ManualShippingAdapter`) creates a local `Shipment` record at order time; no external courier call | `Shipment` | None | Shipment creation is part of the same order-creation transaction, so it inherits that transaction's idempotency | Whether a real courier is contacted directly or *through* the ERP is genuinely undecided — flagged in the gap analysis |
| **Completion** | **Not implemented** — no "delivered" event source exists | N/A | None | N/A | Would arrive via the ERP → Website fulfillment-status pull, mapped to a customer-facing "delivered" stage (`blueprint.md` §8) |
| **Cancellation** | Orders module — `ordersService.cancelOrder()` | `Order.status = CANCELLED`, `cancellationReason`, `cancelledAt` | None | Ownership-checked (IDOR-safe, tested), but not itself idempotency-keyed beyond the natural idempotency of setting the same status twice | See §1's Cancellation row — whether this needs to notify the ERP is unresolved |
| **Return / Refund** | **Not implemented** | Only `Payment.status` has room for `REFUND_INITIATED`/`REFUND_COMPLETED` values; no return/RMA model exists at all (Phase 1's New Finding #2, still open) | None | N/A | Entirely future scope — this phase does not attempt to design it |

### Specific attention points from the brief

- **COD vs. online payment**: confirmed in code (not just docs) — `checkoutService.confirmAndPlaceOrder()` branches on `method`. COD's `CodPaymentAdapter.createPayment()` returns `AWAITING_COD_COLLECTION` immediately and the order is created in the same transaction. `ONLINE` throws `OnlinePaymentNotConfiguredError` *before* the transaction can complete, so no order is ever left half-created for a payment method that can't actually process (this rolls back the inventory reservation too, verified behavior from Phase 4).
- **Inventory reservation**: see the dedicated row above and the ownership matrix's §5 — this is the most-scrutinized part of the current architecture precisely because it's the part most likely to interact with a future ERP-side allocation system.
- **Order creation**: single transaction, confirmed by reading `src/modules/checkout/service.ts` directly — reservation, order row, order items, and payment record are created together or not at all.
- **Duplicate requests**: protected by `Idempotency-Key` header requirement + the shared `IdempotencyKey` ledger, tested with an actual duplicate-submission integration test.
- **Failed ERP calls**: **not applicable yet** — no ERP call exists in the codebase to fail. The *design* for how a future failure would be handled (dead-letter + retry, order remains valid) is already fully specified in `blueprint.md` §9/`technical-architecture.md` §4 and was not changed by this phase.
- **Partial failures**: the order-creation transaction is atomic (reservation + order + order items + payment succeed together or roll back together) — verified by the "an item that goes out of stock... blocks the whole order" integration test. A *future* partial failure specific to the ERP push itself (order created website-side, push to ERP fails) is explicitly designed to be non-blocking and recoverable (dead-letter + retry), per the already-approved architecture — not newly designed here.

---

## Outcome

The sync map above is a direct elaboration of already-approved architecture, not a new design. The order-lifecycle trace found no place where the current implementation contradicts that approved model, and confirmed (by reading the actual transaction code, not just the docs describing it) that the one genuinely hard part — atomic order creation with inventory safety — is real and tested. Every open question is marked as either **requires ERP inspection** or a named, already-tracked business decision — nothing was resolved by assumption.
