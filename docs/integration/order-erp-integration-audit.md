# Website ↔ ERP Order & Fulfillment Integration Audit (Phase 9.6)

Status: audit complete, minimum coherent end-to-end flow implemented. Last updated: 2026-09-13.

This document is a **code-verified audit**, not a documentation summary — every claim cites real file:line evidence from both repositories, gathered fresh this phase (a Phase 7 design doc, `erp-api-contracts.md`, had already proposed a very similar shape from an earlier, docs-only pass — this audit independently re-verified it against the real, current code rather than trusting it, and it turned out to match closely).

---

## 1. Data ownership — field by field, verified against real models

| Field | Owner | Where it lives |
|---|---|---|
| Customer identity/authentication, session, OTP | **Website** | `Customer`, `Session`, `OtpChallenge` (unchanged) |
| Cart, checkout draft state | **Website** | `Cart`, `CartItem`, `CheckoutSession` (unchanged) |
| Order commercial identity, customer-facing status, idempotency | **Website** | `Order.id`, `Order.orderNumber`, `Order.status`, `Order.idempotencyKey` |
| Order line commercial snapshot (name/label/SKU/price/qty at sale time) | **Website** | `OrderItem.*Snapshot` fields — frozen at creation, never re-derived from the live catalog |
| Payment method/status (COD-only today) | **Website** | `Payment` model — ERP has its own, separate `paymentStatus`/`paymentMethod` on `SalesOrder` (see §10) — these are two *independent* records of related facts, not one shared field |
| Product/variant identity, SKU, category, catalog price | **ERP** (already established, Phase 9.4/9.4R/9.5) | unchanged |
| Operational inventory: on-hand, reservation, physical stock movement | **ERP** (already established, Phase 9.5/9.5R) | `StockQuant`, `StockReservation`, `StockMove` |
| Operational order lifecycle (`pending_validation → confirmed → picking → … → delivered`), warehouse assignment | **ERP** | `SalesOrder.primaryStatus`/`subStatus`/`warehouseId` |
| Shipping rate/zone selection and quoted fee | **Website** | `ShippingZone`, `Order.shippingFeeAmountMinor` (snapshot) — ERP has **no courier/shipment entity at all** (verified — see §11) |
| Cross-system order reference | **Shared, one-directional** | `Order.erpOrderReference`/`erpPushStatus`/`pushedToErpAt` (Website, already existed, now populated) ↔ ERP's `ChannelMapping(salesChannelId="website", internalEntityType="sales_order")` (new, this phase) |
| Cross-system customer reference | **Shared, one-directional** | No Website-side column added (not needed — see §9); ERP's `ChannelMapping(internalEntityType="customer")` keyed by phone |

**The rule is respected**: every field above has exactly one owner. The other system, where relevant, holds only a reference (`erpOrderReference`) or an independently-tracked, related-but-not-identical fact (ERP's own `paymentStatus`, informational, never reconciled bidirectionally with the Website's `Payment` model — see §10).

## 2. Order identity — cross-system mapping

**`Order.id` (the Website's own UUID) is the ONE identity ERP ever receives, and IS the idempotency key** (blueprint.md §8, already approved: "the website order id is the idempotency key used when pushing to the ERP, so a retried push can never double-create the order").

ERP's side of the mapping: a new `ChannelMapping(salesChannelId=<website channel>, internalEntityType="sales_order", externalId=<website order id>)` row — the exact same, already-proven mechanism `importShopifyOrder()` uses for Shopify orders (`@@unique([salesChannelId, internalEntityType, externalId])`, `ERP JAW/prisma/schema.prisma:1381-1410`). Never SKU, never customer name/phone, never a timestamp, never the order-number string alone.

`Order.erpOrderReference` stores ERP's own internal `SalesOrder.id` once known — **never exposed to the customer** (§18).

## 3. Order creation model — what actually exists, what was built

**Audited first, verified directly**: `createSalesOrder()` (`ERP JAW/src/modules/orders/services/sales-order.service.ts:287-324`) had exactly three call sites before this phase — two internal, one Shopify-only (`importShopifyOrder()`) — confirmed via a full grep of the file; **no generalized, non-Shopify order-creation entry point existed**. Building one was real, new ERP-side work, not a mapping exercise — this phase built it by directly mirroring the proven Shopify import pipeline (webhook route → job → mapping resolvers → `createSalesOrder`), not inventing a new pattern.

**What was built (ERP side, `website-order.service.ts` + 3 new routes)**:
- `POST /api/v1/integrations/website/orders` — idempotent ingest, mirrors `importShopifyOrder()`'s exact pre-check → transactional re-check → catch-P2002-and-recover shape.
- `GET /api/v1/integrations/website/orders/{websiteOrderId}` — status pull-back.
- `POST /api/v1/integrations/website/orders/{websiteOrderId}/cancel` — thin wrapper over the existing, unmodified `cancelOrder()`.

**Orders land in `pending_validation` — never auto-confirmed.** This is not a policy choice made for convenience; it is a **technical constraint verified directly**: `confirmOrder()` (`sales-order.service.ts:1370`) requires a real, non-null `actorUserId: string` parameter (not nullable, unlike `createSalesOrder`/`cancelOrder`) — there is no technically valid non-human actor to pass. Every existing order-import path (Shopify included) lives under this exact same constraint; a Website order gets no special treatment, better or worse. See §12 for the direct inventory-commitment consequence of this.

**Consequence, stated plainly**: no `reserveStock()` runs, and no receivable `Invoice` is created, until a human moderator calls `confirmOrder()` on the order. A newly-placed Website order sits in ERP's moderation queue exactly like a Shopify order does today.

## 4. Idempotency

**A full search found no existing generic idempotency-key mechanism in the ERP** (`grep -rniE "idempoten" src/` — zero matches for a client-supplied-key ledger; the Website's own `tests/unit/idempotency.test.ts` file lives only in the Website repo). The real, reusable mechanism is `ChannelMapping`'s unique constraint (§2) — already proven correct under concurrent retries by the Shopify import path, including its P2002-race-recovery branch, which the new `importWebsiteOrder()` replicates line-for-line (not by calling into Shopify's own function — that one is Shopify-payload-shaped — but by copying its exact transaction/recovery structure).

**On the Website side**: `pushOrderToErp()` (`src/modules/orders/erp-sync.service.ts`) is itself idempotent — it no-ops immediately if `Order.erpPushStatus === "SUCCEEDED"` already, and is safe to call repeatedly regardless (ERP's own dedup is the real backstop either way). Verified directly by a test: calling it twice results in exactly one `fetch()` call.

**The Website's existing generic `IdempotencyKey` ledger (`claimIdempotencyKey`/`completeIdempotencyKey`, `src/lib/idempotency.ts`) was deliberately NOT reused for this** — it has only two states (`IN_PROGRESS`/`COMPLETED`, no `FAILED`), designed for a single in-process Postgres transaction that rolls back entirely on failure (its existing use, checkout confirmation). An ERP push is a genuine cross-system network call that can fail for real and must remain retryable afterward — forcing it through a ledger with no failure state would leave a permanently stuck `IN_PROGRESS` row after any real failure. `Order.erpPushStatus` (already a 4-state enum: `NOT_PUSHED/PENDING/SUCCEEDED/FAILED`) is the correct, already-existing mechanism for this specific job, and is what this phase uses.

## 5. Order snapshot vs. live data

**Nothing new was needed on the Website side** — `OrderItem`'s `skuSnapshot`/`productNameSnapshot`/`variantLabelSnapshot`/`unitPriceAmountMinor`/`quantity`/`lineTotalAmountMinor` were already frozen at order-creation time (Phase 4, unchanged, re-verified this phase). The ERP push payload is built **exclusively from these frozen fields plus the Order's own frozen address/shipping fields** (`buildPushPayload()`, `erp-sync.service.ts`) — never from a fresh catalog/price lookup. A later catalog price change can never retroactively alter what was pushed to ERP, or what the Order/OrderItem rows say was sold.

**One real, load-bearing exception, stated honestly**: the ERP variant id itself is looked up via `OrderItem.variantId → Variant.erpVariantId` **at push time**, not snapshotted onto `OrderItem` at order-creation time. In the near-immediate window between order creation and push (normally milliseconds), this is inert. It is a genuine, if narrow, dependency: **the push requires the ordered variant to still exist and still carry a valid `erpVariantId`** — if a variant were deleted or somehow lost its ERP mapping in that window, the push fails cleanly (`OrderMissingErpVariantIdError`, marks `erpPushStatus: FAILED`, never sends a guessed/wrong id) rather than silently mis-referencing another variant. No `OrderItem.erpVariantId` snapshot column was added — flagged in §17 as a defensible-but-real design choice, not an oversight.

ERP's own snapshot discipline (`SalesOrderLine.unitPrice` frozen at line-create time, `discountAmount` frozen inside `confirmOrder()`) is unmodified and unrelated to this — the Website never reads it back for display; the Website's own snapshot is what the Website shows the customer.

## 6. Price authority

Unchanged, re-confirmed: `checkoutService.confirmAndPlaceOrder()` computes the order total server-side from live, server-trusted variant prices (Phase 4, unmodified by this phase) — never a client-submitted price/discount/tax/total. The ERP push carries this same, already-computed, already-frozen `unitPriceAmountMinor` (converted to a decimal string via the existing `Money.fromMinor(...).toDecimalString()` — no new price-conversion logic was written). ERP never computes or contests this figure; per §7.3 of `erp-order-lifecycle-mapping.md`'s field mapping (`externalTotalPrice`/`externalPaymentMethod` fields on `SalesOrder`), the ERP already has a precedent for accepting a channel's own price as an **informational fact**, not something it independently recalculates — the Website's push follows the same discipline via `unitPrice` on each line.

## 7. Customer identity

**ERP has no external-customer-reference column at all** on `BusinessPartner`/`CustomerProfile` (verified — no `externalCustomerId` field exists; the Shopify↔ERP customer link is, again, done entirely through the generic `ChannelMapping` table). The Website order-ingestion path mirrors this exactly, but keyed by **phone (E.164)** instead of a numeric external id — the Website's own primary identity, covering both guest and account checkout, since every `Order` has a real `shippingPhoneE164` regardless (`resolveWebsiteOrderCustomer()`, `website-order.service.ts`).

**No duplicate `BusinessPartner` is ever created for a repeat phone number** — verified directly by a test: two pushes with the same customer phone reuse the same `BusinessPartner` via the `ChannelMapping` lookup, exactly mirroring `resolveShopifyCustomer()`'s own race-safe shape.

**No Website schema change was needed** for this — `Order.shippingRecipientName`/`shippingPhoneE164` (both already existed, both already frozen snapshots) are exactly what's sent; no new `Customer.erpCustomerId` column was added, since the Website never needs to look anything up in the reverse direction.

## 8. Payment state — kept strictly separate from fulfillment state

Audited both sides:

- **Website**: `Payment.status` (`INITIATED/PENDING/AUTHORIZED/CAPTURED/FAILED/CANCELLED/REFUND_INITIATED/REFUND_COMPLETED/AWAITING_COD_COLLECTION`) is unchanged. COD is the only real adapter; online payment throws `OnlinePaymentNotConfiguredError` and was not touched (no gateway invented, per the explicit non-goal).
- **ERP**: has its own, independent, human-operated payment model — `SalesOrder.paymentStatus` (`unpaid/awaiting_confirmation/paid`) plus a real `Invoice`/`Payment`/`PaymentAllocation` double-entry ledger, entirely COD/InstaPay-oriented (no payment-gateway concept anywhere in ERP — verified directly).

**These are never merged into one field.** The push payload carries `paymentMethod` as an informational fact only (mirroring `externalPaymentMethod`'s existing role for Shopify orders) — ERP is never asked to verify or contest it, and the Website never reads ERP's `paymentStatus` back into its own `Payment` record. If online payment is ever built, per `erp-order-lifecycle-mapping.md` §3's own already-recorded finding, this remains a real, unresolved future integration question (ERP has zero precedent for a gateway-driven payment-status change) — not solved or invented here.

## 9. Fulfillment & shipping

**Inventory commitment, precisely distinguished** (§12 of the original brief's own explicit requirement):

| Stage | What actually happens | Where |
|---|---|---|
| Availability check | A live read, no side effect | `getSellableAvailability()` (Phase 9.2/9.5) |
| Reservation (soft hold) | `reserveStock(allowOversell: true)` | Only at `confirmOrder()` — i.e. **after** a human moderator acts, not at order creation |
| Commitment / physical deduction | `postStockMove()` (decrements real `onHandQuantity`) | Only at `dispatchOrder()` |
| Fulfillment (pick/pack) | `pickStock`/`stageForDispatch` | `fulfillOrder()`, between confirm and dispatch |
| Dispatch | Reservation consumed, revenue/COGS posted | `dispatchOrder()` |

**The system never claims "inventory is reserved" for a freshly-pushed Website order** — because it genuinely isn't, until a moderator confirms it. This is stated here explicitly so no future caller is tempted to set a customer-facing "reserved"/"confirmed-in-stock" message before that's true.

**Shipping**: ERP has **no dedicated Shipment/courier entity at all** (confirmed by this phase's own audit, corroborating `erp-order-lifecycle-mapping.md` §3's earlier inference) — the Website's own `ShippingZone`/`Shipment` model and `ManualShippingAdapter` remain fully independent; there is no competing courier-tracking source to reconcile against. No courier/3PL integration was built or needed (explicit non-goal).

## 10. Website order state vs. ERP order state — three independent dimensions

Per the original brief's explicit instruction, these are never merged into one overloaded field:

1. **`Order.status`** (Website, `CONFIRMED`/`CANCELLED`) — the commercial record's own state, unchanged.
2. **`Payment.status`** (Website) — independent, unchanged; only consulted for the `refunded`/`refund_in_progress` customer-facing states.
3. **ERP fulfillment stage** (new, this phase) — pulled live via `erpOrderAdapter.getOrderStatus()`, mapped through `mapErpStatusToFulfillmentStage()` (`src/modules/orders/service.ts`) onto a small, stable set: `being_prepared | out_for_delivery | delivered | returned | cancelled` — collapsing ERP's real `pending_validation/confirmed/picking/packing/ready_for_delivery` onto `being_prepared` (the customer never sees "awaiting moderation" language, matching `erp-order-lifecycle-mapping.md` §3's own already-reasoned mapping). ERP's dead enum values (`qc`/`failed_delivery` — confirmed via this phase's own audit: no service function ever transitions into either) are mapped defensively rather than left to throw.

`deriveCustomerFacingStatus()` checks each dimension independently and in a fixed precedence order (Website cancellation first, then refund state, then ERP fulfillment stage, then a `"confirmed"` default) — a payment-state change can never read as "shipped," and a warehouse transition can never read as "paid." Verified directly by dedicated unit tests.

## 11. Status synchronization model

**Explicit, on-demand ERP lookup at single-order view time** — chosen from the brief's own named options, and consistent with the exact precedent already set in Phase 9.5R (the PDP's live ERP inventory overlay):

- `ordersService.getOrderForCustomer()` and `.trackOrder()` (both single-order views) call `erpOrderAdapter.getOrderStatus()` live, once, per call — bounded, safe.
- `ordersService.listForCustomer()` (the order-history **list**) deliberately does **not** do this per row — an N-calls-per-page-view risk, the same reasoning that kept Shop/search listings off live ERP inventory reads in Phase 9.5R. This is a real, named, consistent limitation (§17), not an oversight: a customer's order list shows only the Website's own last-known state; opening one order shows the live ERP-informed status.

**No webhook, polling job, or queue was built** — ERP has no outbound webhook capability toward the Website (confirmed: the only inbound-to-ERP webhook infrastructure found is for *Shopify's* webhooks, nothing outbound to arbitrary integration partners), and a scheduled poller was judged unnecessary complexity for this phase's minimum coherent flow (Step 24's explicit "no premature infrastructure" instruction). If real-time status push ever becomes a requirement, that is a genuine future capability gap, not solved here.

**The customer is never told a status ERP hasn't actually confirmed** — a failed/unreachable status pull-back falls back to the Website's own already-true `"confirmed"` (or refund) state, never a fabricated fulfillment claim; verified by a dedicated test.

## 12. Inventory commitment — see §9 above (kept together deliberately, not duplicated)

## 13. Failure states — all eleven, worked through

| # | Scenario | Customer sees | Website stores | ERP stores | Retry-safe? | Manual intervention? |
|---|---|---|---|---|---|---|
| A | Website order created, ERP request never reaches ERP (network down) | Order placed successfully (their commercial commitment is real) | `erpPushStatus: FAILED` | Nothing | Yes — `pushOrderToErp()` is idempotent | Only if never retried by any mechanism (no auto-retry job exists — see §17) |
| B | ERP creates the order, Website times out before the response | Order placed successfully | `erpPushStatus: FAILED` (the Website never learned of the success) | A real `pending_validation` SalesOrder exists | Yes — a retried push hits ERP's own `ChannelMapping` dedup and returns the *same* order, reported as `deduplicated: true` | No — the retry self-heals |
| C | ERP rejects the order (e.g. no active warehouse, unknown variant id) | Order placed successfully | `erpPushStatus: FAILED`, audit log records the real ERP message | Nothing created | Only after the underlying cause is fixed (e.g. a warehouse is created) | Yes — this is a genuine data/config gap, not a transient failure |
| D | ERP accepts the order but inventory "commitment" fails | Cannot happen in the current design | — | — | — | — (see note below) |
| E | Network timeout *after* ERP successfully processed | Order placed successfully | `erpPushStatus: FAILED` | Real `pending_validation` order exists | Yes — identical to B | No |
| F | Retry after an unknown outcome | Unaffected (retry happens server-side, not customer-visible) | Resolves to `SUCCEEDED` once a retry succeeds | Unchanged/same order (dedup) | Yes | No |
| G | Customer refreshes checkout | The existing `Idempotency-Key` header mechanism (§4, unchanged, Phase 4) already prevents a second Order row | Same Order returned | Same ERP order (once pushed) | Yes | No |
| H | Customer double-clicks submit | Same as G — the Website's own `IdempotencyKey` ledger (checkout's own, pre-existing) is the first line of defense, before ERP's own dedup is ever reached | Same Order | Same ERP order | Yes | No |
| I | ERP temporarily unavailable at push time | Order placed successfully | `erpPushStatus: FAILED` | Nothing | Yes | Only if never retried (§17) |
| J | Website DB transaction succeeds, ERP integration fails | (same as A/I) | `erpPushStatus: FAILED` | Nothing | Yes | Only if never retried |
| K | ERP succeeds but Website persistence fails (e.g. the `db.order.update` writing `erpOrderReference` throws) | Order placed successfully (the original transaction already committed) | `erpPushStatus` stuck at whatever it was before this update attempt (likely `PENDING`) — **a real, narrow gap**, see below | A real ERP order now exists, unlinked from the Website's own record until the next successful retry re-discovers it via ERP's dedup | Yes, self-healing — a retried push hits ERP's `ChannelMapping` dedup and correctly reports `deduplicated: true`, at which point the Website-side `erpOrderReference` finally gets written | No, as long as a retry eventually runs |

**Case D cannot currently occur** because commitment (reservation) never happens at push/creation time at all (§9/§12) — it only happens later, at a moderator's explicit `confirmOrder()` action, which is entirely outside this integration's control. There is nothing this integration could observe as "ERP accepted the order but inventory commitment failed" today.

**Case K's gap, stated honestly**: between ERP successfully creating the order and the Website successfully recording `erpOrderReference` locally, a narrow window exists where the two systems disagree about whether the push "fully" succeeded from the Website's own bookkeeping perspective. This is exactly what ERP's own `ChannelMapping` dedup is *for* — a subsequent retry (whenever one runs) always converges to the correct, single ERP order and finally updates the Website's local record. No case in this table ever produces a duplicate ERP order or a Website order that silently vanishes.

**No case above requires inventing an ERP reservation API, a fake reservation, a direct ERP stock decrement, or a second inventory authority** — none of the eleven scenarios needed one.

## 14. Transaction boundaries

No distributed transaction is attempted or pretended. Two genuinely separate local-transaction scopes:

1. **Website's own transaction** (`checkoutService.confirmAndPlaceOrder()`, unmodified) — covers the local invariants: idempotency-key claim, inventory reservation (Website-local, non-authoritative — Phase 9.5), Order/OrderItem/Payment creation. Commits fully before anything ERP-related begins.
2. **The ERP push** (`pushOrderToErp()`) — happens strictly *after* that transaction commits, as its own separate operation, itself relying on ERP's own internal transaction (the `createSalesOrder` + `ChannelMapping` insert, inside ERP's own `prisma.$transaction`) for its own atomicity.

**No outbox/saga pattern was introduced.** Given the actual failure modes worked through in §13 — all of which self-heal via a simple retry against an idempotent operation — the added complexity of a formal outbox table was judged unjustified for this phase's actual scale and failure surface (Step 16's own explicit "do not automatically introduce an elaborate event architecture" guidance). If automatic background retries are ever wanted, an outbox-style "pending pushes" query (`WHERE erpPushStatus IN ('FAILED', 'PENDING')`) is a small, natural next step — not built now (§17).

## 15. Concurrency

- **Duplicate checkout requests / double-click submit**: the existing, unmodified `IdempotencyKey`-guarded transaction in `confirmAndPlaceOrder()` already prevents a second `Order` row (Phase 4) — unchanged by this phase.
- **Simultaneous ERP synchronization for the same order**: `pushOrderToErp()` has no explicit lock of its own — relies entirely on ERP's own `ChannelMapping` unique-constraint race recovery (§4), the same way `importShopifyOrder()` already safely handles concurrent webhook redeliveries. Two near-simultaneous calls to `pushOrderToErp()` for the same order (e.g. a manual retry racing an eventual future auto-retry) would both reach ERP, but only one creates the SalesOrder — the other's insert hits the unique constraint and is recovered as a dedup, exactly like a redelivered Shopify webhook.
- **Cancellation racing with fulfillment**: handled by ERP's own, real, pre-existing rule — `cancelOrder()` hard-blocks once the order's invoice already has payment allocated (`InvoicePaymentExistsError`) or once it's at/past `out_for_delivery` (`UNCANCELLABLE_STATUSES`) — reused verbatim, not reimplemented. The Website's own `cancelOrder()` now checks with ERP *first* (when the order was pushed) and only cancels locally if ERP allows it (§10/`orders/service.ts`) — verified directly by a test that a rejected ERP cancellation leaves the Website order `CONFIRMED`, not silently `CANCELLED`.
- **Payment state racing with order creation**: unaffected/unchanged — Payment creation is already inside the same local transaction as Order creation (Phase 4).

No new locking or queueing infrastructure was introduced.

## 16. Customer order history

`ordersService.listForCustomer()`/`.getOrderForCustomer()`/`.trackOrder()` (all pre-existing, `src/modules/orders/service.ts`) are unmodified in shape — still return the Website's own Order/OrderItem snapshot data, never a raw ERP payload. `Order.erpOrderReference` is **never included in any customer-facing response** (verified — it's a real column on the row but no route/serializer surfaces it; the two single-order view methods only add the derived `customerFacingStatus` string). No ERP database access of any kind happens from a customer-facing code path — every ERP touch goes through `erpOrderAdapter`, itself only ever called from server-side `orders`/`checkout` module code.

## 17. Admin / operations visibility — and open items, together

Reused, not built new: `recordAuditEvent()` (`src/lib/audit-log.ts`, pre-existing, `AuditLog` table) now also records `entityType: "Order"` events for `erp_push_succeeded`/`erp_push_failed`, with `metadata` carrying the ERP order reference (on success) or a short `errorSummary`/`errorMessage` (on failure) — answering "was it sent, when, which ERP order, did it fail, why" directly from the existing audit log, with no new table. No new admin UI/module was built (explicit non-goal).

**Genuinely open items, not invented around**:

- **No automatic retry mechanism exists yet** for a `FAILED`/stuck-`PENDING` push (§13/§14's own honest accounting) — today, recovering from case A/C/I/J/K requires *something* to call `pushOrderToErp(orderId)` again; nothing does this automatically. A minimal future addition (a scheduled sweep over `erpPushStatus IN ('FAILED','PENDING')`, mirroring the existing `expireStaleReservations()` "external scheduler hits an internal endpoint" pattern already used for inventory reservations) is the natural next step — **not built this phase**, flagged as a real, load-bearing gap rather than silently assumed away.
- **`OrderItem.erpVariantId` is not snapshotted** (§5) — a narrow, accepted risk window, not a schema change made this phase.
- **The confirm-gate business decision remains exactly as unresolved as `erp-integration-implementation-plan.md` already recorded it** (§26 below) — this phase did not resolve it; it simply built the ingestion path under the *existing*, already-running rule (moderation, matching Shopify), since no technically valid alternative exists anyway (§3).
- **`cancelOrder()` (the Website's own service function) has no route/UI exposing it to a real customer today** — confirmed by a full search of `src/app/api/`. This phase made its *logic* correctly ERP-aware or a future cancel feature is wired up, but did not add a new customer-facing cancel endpoint/button itself (that would be a new customer-facing capability, arguably out of this integration phase's own scope).

## 18. Security

- Server-side ERP credentials, unchanged (`erp-integration/client.ts`, Phase 8 foundation, reused exactly).
- No browser-reachable code path touches `erp-integration`/the new `orders/erp-sync.service.ts` — verified the same way as every prior phase (no `"use client"` file imports either).
- No client-submitted order total/price/quantity/inventory is ever trusted — the push payload is built exclusively from server-computed, already-frozen Order/OrderItem fields (§5/§6).
- No arbitrary ERP id is ever accepted from a customer — `erpOrderReference` is written only by `pushOrderToErp()` itself, from ERP's own response; no route accepts it as input.
- Tenant safety re-verified: every new ERP-side function (`website-order.service.ts`) either receives a `TenantContext` already resolved by `verifyWebsiteIntegrationRequest()` (never from request body) or is scoped through it transitively (`findVariantIdsExisting`, `channelMapping` lookups, `businessPartner`/`salesOrder` creation) — confirmed via `check:tenant-scope` (0 violations).

## 19. Observability

Existing structured logging conventions reused throughout (Pino on the Website side, the existing `logger`/`AppLog` pattern on the ERP side) — `orderId`/`erpOrderReference`/`requestId`/success-or-failure are logged; no password/API key/OTP/payment secret/full address is ever logged (the Website's existing Pino redaction list already covers `authorization` headers and address fields, unchanged).

## 20. Data model changes — the smallest justified set

**Website: none.** Every field this phase needed (`Order.erpOrderReference`/`erpPushStatus`/`pushedToErpAt`, `IdempotencyKey`, `AuditLog`) already existed, unused, from an earlier phase's own forward-looking design.

**ERP: none to the schema itself** (`channelType`/`ActivitySource` are plain strings/TS unions, not DB enums — adding `"website"` as a value to each required a one-line TypeScript change, not a migration). The one genuinely new capability (`ChannelMapping` rows of `internalEntityType: "sales_order"`/`"customer"` scoped to a new `SalesChannel` row of `channelType: "website"`) reuses existing, already-migrated tables — no `prisma migrate`/`db push` of any kind was required.

## 21. API design

Browser-facing and ERP-adapter-facing APIs remain fully separate, as before: `POST /api/v1/orders` (Website's own customer-facing route, unchanged shape) → `checkoutService` → (new) `pushOrderToErp()` → `erpOrderAdapter` → ERP's `integrations/website/orders/*`. No ERP-specific request/response shape leaks into the public Website API — the customer-facing order response is unchanged; `erpOrderReference`/ERP status codes are never part of it.

## 22. Performance

No Redis, queue, or event bus was introduced. The one added latency cost, stated plainly: `POST /api/v1/orders` now awaits one additional ERP HTTP round-trip (bounded by the existing 5s default timeout) before responding to the customer — chosen deliberately over a fire-and-forget call, since this is a serverless Next.js deployment where work started after a response is sent has no execution-completion guarantee; awaiting it keeps the "did it happen" question answerable without inventing background-job infrastructure. If this latency ever becomes a real problem, moving the push to §17's proposed retry-sweep mechanism (making the initial push best-effort-fast, with the sweep as the guaranteed backstop) is the natural evolution — not built now.

---

## 23. Self-review (Phase 9.6 §32, answered directly)

- **Two inventory authorities?** No — inventory commitment still only ever happens inside ERP's own `confirmOrder()`/`dispatchOrder()` (§9/§12), untouched by this phase.
- **Same Website order → two ERP orders?** No — ERP's `ChannelMapping` unique constraint makes this structurally impossible, verified by a dedicated idempotency test.
- **ERP succeeds, Website times out?** Case B/E in §13 — self-heals via retry + ERP's own dedup.
- **Website succeeds, ERP fails?** Cases A/C/I/J in §13 — the Website order remains valid and customer-visible; `erpPushStatus: FAILED` is tracked and retryable, never silently lost.
- **Can retry safely recover?** Yes, in every case in §13 except the (currently nonexistent) case D.
- **Website/ERP statuses conflated?** No — three independent dimensions, §10, verified by dedicated unit tests.
- **Can historical order prices change?** No — `OrderItem` snapshot fields are frozen at creation (Phase 4, unmodified); the ERP push reads only from them.
- **Can a customer manipulate price/quantity/inventory?** No — the push payload is server-built from already-server-validated data (§6/§18); no client input reaches it.
- **ERP credentials isolated?** Yes, unchanged Phase 8 mechanism, re-verified.
- **Can SKU changes break integration?** No — the order-push identity path uses `Variant.erpVariantId` directly (Phase 9.4R), never SKU, mirroring the same correction already applied to inventory lookups in Phase 9.5R.
- **Are ERP IDs used as stable references?** Yes — `Order.id` (Website→ERP) and ERP's own `SalesOrder.id` (ERP→Website, via `erpOrderReference`) are the only identifiers used; neither is ever substituted with a mutable field.
- **Can cancellation race with fulfillment?** Handled by ERP's own real, reused `UNCANCELLABLE_STATUSES`/`InvoicePaymentExistsError` rules (§15) — not reimplemented, not bypassed.
- **Did I invent a business rule?** No new one was *decided*; the one genuinely open item (confirm-gate) was left exactly as open as it already was, and the implementation follows the only technically valid existing behavior (§3/§26) rather than picking a convenient value.
- **Unnecessary infrastructure introduced?** No — no Redis/queue/event bus/outbox; the retry-sweep gap (§17) is named, not built.
- **ERP modified only where necessary?** Yes — every ERP change (source attribution widening, the `not_found` error code, the new order-ingestion pipeline) directly serves a capability this integration could not otherwise provide safely; nothing else in ERP was touched.
- **Are integration states observable?** Yes — `Order.erpPushStatus`/`erpOrderReference`/`pushedToErpAt` plus `AuditLog` entries answer every question §19/§17 posed.
- **Is the customer ever told something ERP hasn't confirmed?** No — verified directly: an unreachable/failed status pull-back always falls back to the Website's own already-true state, never a fabricated ERP-confirmed claim.

## 24. Migration / existing data

**No historical Website orders were touched or backfilled.** Every existing `Order` row (from before this phase) keeps `erpPushStatus: NOT_PUSHED` and `erpOrderReference: null` forever, unless something explicitly calls `pushOrderToErp()` for it — nothing does, automatically. This is a deliberate, minimal choice: retroactively pushing historical orders into ERP's moderation queue would be a real, customer-invisible but operationally significant action (creating potentially hundreds of `pending_validation` SalesOrders for orders ERP's Operations team may already know about through other means, e.g. a prior Shopify-based flow) — a genuine business decision, not a technical one, and is listed as OPEN in §26. Only NEW orders (placed after this phase ships) are pushed, via the `POST /api/v1/orders` route's own new call.

## 25. Testing — what was executed vs. skipped

- **ERP repo**: 28 new tests (16 order-create route, 5 status-pull-back route, 7 cancel route) — all **EXECUTED**, all passing (`npx vitest run`: 98 passed / 38 skipped — the skipped set is the same pre-existing live-Postgres RLS suite, unrelated). `check:tenant-scope` (139 files, 0 violations), `typecheck`, `lint`, `build` all clean.
- **Website repo**: 22 new unit tests (13 order adapter, 9 status-mapping) — **EXECUTED**, all passing. 11 new integration tests (real DB + mocked ERP fetch) covering: successful push, snapshot integrity, idempotent replay, ERP rejection, ERP unavailable, missing-erpVariantId, status pull-back (success and fallback), cancellation propagation (allowed and blocked), and never-pushed cancellation — written correctly but **SKIPPED** in this sandbox (no local Postgres reachable — the same disclosed, pre-existing limitation every other integration test in this repo already has). Full existing suite re-run with zero regressions (163 passed / 63 skipped total). `typecheck`, `lint`, `build` all clean.

## 26. Open business decisions (NOT invented, flagged explicitly)

- **Order confirm-gate**: whether Website orders should ever be auto-confirmed (skipping ERP's moderation queue) rather than landing in `pending_validation` like Shopify orders. This was **already** an explicitly flagged, unresolved item from an earlier phase (`erp-integration-implementation-plan.md`: "Recommended default: auto-confirm, not adopted without explicit sign-off... If unresolved: Phase D/F cannot be finalized"). This phase did not resolve it — it built the ingestion path under the only currently technically-valid behavior (moderation), since `confirmOrder()` requires a real human actor (§3) and no sign-off for an alternative exists.
- **Retroactive push of historical orders** (§24) — not decided, not performed.
- **Automatic retry for a failed/stuck push** (§17) — the mechanism's shape is sketched but not built; whether it should exist, and on what schedule, is an implementation follow-up more than a business one, but is listed here since it directly affects how visible/urgent case A/C/I/J/K failures are to Operations.
- **Whether a customer-facing cancel feature should exist at all** (§17) — the underlying service logic is now correct and ERP-aware, but no product decision to expose it via a route/UI was made or assumed.
- **Online payment's eventual interaction with ERP's payment model** (§8/§10) — ERP has zero precedent for a gateway-driven payment-status change; deferred exactly as `erp-order-lifecycle-mapping.md` already flagged it, not resolved here.
- **Tax** — remains unmodeled on both sides (already an open item from `erp-order-lifecycle-mapping.md` §3); untouched by this phase.
- **`OrderItem.erpVariantId` snapshotting** (§5/§17) — a real design choice with a narrow accepted risk window, worth revisiting if it ever causes an actual incident, but not changed now.
