# ERP ↔ Website Integration — Final Implementation Plan

Phase 7 — final design gate before implementation. Everything below builds directly on Phase 6's real ERP discovery (`erp-discovery.md`, `erp-domain-map.md`, `erp-website-real-mapping.md`, `erp-inventory-analysis.md`, `erp-order-lifecycle-mapping.md`, `erp-shopify-integration-analysis.md`, `erp-integration-architecture.md`, `erp-integration-final-gap-analysis.md`) and the Website's already-approved architecture (`blueprint.md`, `module-boundaries.md`, `data-ownership.md`, `technical-architecture.md`). **No code was written or modified to produce this document.** ERP JAW was not touched — see §0.

Companion documents (this plan cross-references rather than duplicates): `erp-api-contracts.md`, `erp-integration-security-plan.md`, `erp-integration-failure-recovery.md`, `erp-integration-testing-plan.md`, `erp-integration-reconciliation.md`, `erp-website-admin-boundary.md`.

Status: Phase 7. Last updated: 2026-09-11.

---

## 0. ERP safety record

- ERP git status at Phase 7 start: clean, `HEAD = d0cbfa1` — identical to the state recorded at the end of Phase 6.
- ERP git status at Phase 7 end: confirmed clean, `HEAD` unchanged (see the final report). No ERP file was read-modified, formatted, linted, or otherwise touched.

---

## 1. Objective, restated

Answer, precisely and only from what the real ERP supports: **what must we build, where, in what order, and why** — without inventing ERP capability that Phase 6 did not find. Where Phase 6 left something genuinely unknown or undecided, it is repeated here as an open item, not resolved by assumption.

---

## 2. Target architecture

### 2.1 Topology decision

Four options were on the table (per the brief): (A) Website → ERP API directly; (B) Website → a separate Integration Layer service → ERP; (C) Website's own ERP Adapter (inside the Website's modular monolith) → a new ERP API; (D) something else.

**Decision: (C), with the ERP-side counterpart being a new, narrow API surface inside the existing ERP app — not a new standalone service.**

Why, based on what actually exists:
- The Website's modular monolith already has a proven, working adapter pattern used twice (`PaymentProvider`/`CodPaymentAdapter` in `src/modules/payments/`, `ShippingProvider`/`ManualShippingAdapter` in `src/modules/shipping/`). A third adapter (`ERPProvider` in a new `src/modules/erp-integration/`) is a direct extension of an already-proven shape, not a new architectural pattern (`blueprint.md` §9, confirmed compatible in Phase 6).
- The ERP is itself already a modular monolith (Next.js app, `src/modules/*`, Repository→Service→Action/Route layering) with an existing, working precedent for exposing a bounded external surface: the Shopify webhook receiver (`src/app/api/v1/webhooks/[connector]/route.ts`) and its supporting connector infrastructure (`IntegrationConnector`/`CompanyIntegrationConnection`/`IntegrationSecret`). Adding new `/api/v1/integrations/website/*` routes that call the **same existing service-layer functions** Shopify already uses (`confirmOrder()`, `cancelOrder()`, `getStockAvailability()`, etc.) is a direct extension of that precedent — not a new service, not a new deployment topology, not a new database.
- Option (B) — a separate integration-layer service — would introduce a third deployable, a third place for tenant/auth logic to live, and a new data-consistency boundary, with no evidence anywhere in either codebase that this is needed at current scale (ERP: single company today per `erp-discovery.md` §4; Website: one storefront). Rejected as unjustified complexity, consistent with both codebases' own stated engineering principles (ERP's Constitution rule 9: "smallest mechanism, no speculative abstraction"; Website's `blueprint.md` §19: infrastructure decisions deferred until real pressure exists).
- Option (A) — Website calling ERP "directly" with no adapter boundary — is rejected because it already contradicts the Website's own approved, enforced rule (`module-boundaries.md`: "Nothing outside ERP Integration MUST call the ERP directly," ADR-011) and would let ERP-specific concerns (auth, payload shape, retry) leak into Catalog/Orders. Not a real option given what's already approved and working.

### 2.2 The boundary, drawn precisely

```
Customer
  ↓
Website Frontend  (never touches Postgres, ERP, or any provider directly — unchanged, ADR-014)
  ↓
Website API / Server layer
  ↓
Website Commerce Domain — Catalog, Orders, Checkout, Customers  (UNCHANGED by this integration)
  ↓
src/modules/erp-integration/  ← NEW, Website-owned, holds ERP credentials exclusively
  ↓
  ═══ the integration boundary — the only place ERP-specific detail crosses process lines ═══
  ↓
[NEW] ERP JAW: src/app/api/v1/integrations/website/*  ← NEW, ERP-owned, thin routes
  ↓
Existing ERP Service layer (confirmOrder, cancelOrder, createSalesOrder-generalized,
  getStockAvailability, resolveShopifyCustomer-generalized, etc.) — REUSED, not duplicated
  ↓
Existing ERP Repository layer → Postgres, tenant-scoped via the existing TenantContext
  (a new `getSystemTenantContext()`-style resolution from an API key, not a new isolation
  mechanism)
```

### 2.3 Data ownership (unchanged from the already-approved model, confirmed compatible)

| Owns | System |
|---|---|
| SKU, price, stock, fulfillment, warehouse ops, operational order state | ERP (authoritative) |
| Rich content, media, coupons, shipping-zone fee, cart, checkout session, customer identity (phone), commercial order envelope | Website |
| Customer master record (shared) | Website owns identity; ERP record is reconciled at order time |
| Order (shared, split) | Website owns commercial/customer-facing envelope; ERP owns operational/fulfillment envelope, linked by `erpOrderReference` |

### 2.4 Auth, validation, idempotency, retries, error handling, observability, reconciliation

Each has its own detailed section below and/or a dedicated companion document. Summary table:

| Concern | Lives in | Detail |
|---|---|---|
| Authentication | New ERP-side API-key verification path + Website's `erp-integration` module holding the credential | `erp-integration-security-plan.md` |
| Authorization | ERP-side, scoped to one `Company` per credential via the existing `TenantContext`/`getSystemTenantContext()` primitive | `erp-integration-security-plan.md` |
| Request validation | Both sides: Website validates before sending (Zod, already the platform convention); ERP validates on receipt (Zod, already the platform convention) — no trust of client-supplied totals/prices (already-enforced rule on both sides) | `erp-api-contracts.md` |
| Idempotency | Website: existing `IdempotencyKey` ledger/pattern (`src/lib/idempotency.ts`). ERP: existing `ChannelMapping` unique-constraint pattern, extended to a new `"website"` channel | `erp-integration-failure-recovery.md` §Idempotency |
| Retries | Website-initiated only, for the push direction; exponential backoff + dead-letter | `erp-integration-failure-recovery.md` |
| Error handling | Website: existing `erp_integration` error category (`technical-architecture.md` §22), never checkout-blocking | `erp-integration-failure-recovery.md` |
| Observability | Request-id propagation (`src/lib/request-id.ts`), structured logging (`src/lib/logger.ts`), audit log (`src/lib/audit-log.ts`) on the Website side; ERP's existing `AuditLog`/`AppLog`/`ActivityTimeline` on the ERP side | `erp-integration-failure-recovery.md` §Observability |
| Reconciliation | A new periodic job on the Website side, calling a new ERP read endpoint | `erp-integration-reconciliation.md` |

---

## 3. Catalog / product sync design

**Direction**: ERP → Website, pull-based, scheduled. No push and no webhook exists or is proposed for this direction — the ERP has no evidence anywhere of an outbound-webhook-sending capability toward external, non-Shopify systems (its only outbound calls are to Shopify's own API).

| Aspect | Decision |
|---|---|
| Initial full sync | A first pull retrieves every active `Product`/`ProductVariant` for the company — same endpoint as incremental, just without a `since` cursor |
| Incremental sync | Requires a `since`/watermark parameter on the new read endpoint. The ERP already has this exact mechanism for its own connector sync (`ConnectorSyncCursor`, schema:2697) — the new website read path should use the same table with a new `connectorKey`/channel value, not invent a second cursor mechanism |
| Trigger | Scheduled pull, interval TBD (start conservative, e.g. every 5-15 minutes; not customer-request-triggered — matches `technical-architecture.md` §3's existing rule) |
| Identifiers | `Website Product.erpProductId` ↔ `ERP Product.id`; `Website Variant.sku` ↔ `ERP ProductVariant.sku` (company-scoped unique — safe given one-website-per-company) |
| Category mapping | `ERP ProductCategory` (hierarchical tree) → new `Website Category.erpCategoryId` (column does not exist yet, must be added). **Open design decision**: mirror the full hierarchy on the Website or flatten to the leaf category only — see §Business Decisions |
| Price mapping | `ERP ProductVariant.sellingPrice` (Prisma `Decimal`) → `Website Variant.priceAmountMinor` (integer piasters) — conversion happens once, inside the adapter, never left ambiguous; rounding rule must be explicit (round-half-up recommended, stated here as a **default**, confirmable by the business) |
| Status mapping | `active → ACTIVE`; `discontinued`/`archived → DISCONTINUED`; `draft →` excluded from the pull entirely (never projected) |
| Media handling | **No sync** — confirmed in Phase 6 that neither side has a real product-image model. Media stays Website-owned/sourced independently of the ERP, permanently, unless a future business decision changes this |
| Deletion/deactivation | The ERP never hard-deletes a `Product`/`ProductVariant` (its own `deletedAt` columns are dead/unused — Phase 6 finding); it archives. The Website projection should mirror this: never hard-delete a projected row, only mark `DISCONTINUED`, preserving order-history references (matches the Website's own already-stated intent in `erp-sync-map.md`) |
| Conflict resolution | Not applicable in this direction — the ERP is the sole source for every projected field; there is no Website-side edit to conflict with (unlike the Shopify↔ERP direction, which does have `SyncConflict` because both sides can edit) |
| Idempotency | Each pull overwrites the projection row-by-row; naturally idempotent (a read, not a mutation with side effects) |
| Reconciliation | See `erp-integration-reconciliation.md` — a periodic full-catalog diff catches any drift the incremental cursor missed |

**What must be newly built on the ERP side**: a new read endpoint aggregating `Product`/`ProductVariant`/`ProductCategory` facts, filterable by `since` watermark, authenticated via the new API-key path. See `erp-api-contracts.md` for the full operation spec.

---

## 4. Inventory synchronization — highest risk, full detail

Full timing trace and race-condition analysis already exists in `erp-inventory-analysis.md` (Phase 6) — this section restates the decisions that follow from it, does not re-derive them.

### 4.1 Core decision: the Website reservation stays exactly as designed, unchanged

`InventoryReservation` (ACTIVE/CONSUMED/RELEASED/EXPIRED, 15-min TTL default, row-level-locked, verified under concurrency) is **not** replaced, weakened, or made "smarter" about the ERP. It remains a pre-purchase safety margin against the Website's own cached projection of `Variant.inventoryQuantity` — never a representation of ERP truth, never reconciled against the ERP as if it were the same kind of fact. This was already correct in Phase 5's design and confirmed still correct in Phase 6's inspection of the real ERP.

### 4.2 Core decision: the ERP does NOT receive a reservation/allocation command from the Website

The ERP has no API concept of "hold N units without creating an order" — its only allocation mechanism (`StockReservation`) is created as a side effect of `confirmOrder()`, on a real `SalesOrder`. There is nothing to call standalone. **The Website never asks the ERP to reserve stock ahead of order creation** — it pushes a real order, and the ERP's own existing reservation mechanism (unmodified, reused) handles allocation from that point, exactly as it already does for Shopify orders.

### 4.3 The confirmed sequence

```
1. Customer adds to cart, proceeds to checkout
2. Website reserveInventoryForItems() — ACTIVE reservation against the PROJECTED quantity
   (unchanged, existing mechanism)
3. Checkout confirmed → Website Order + OrderItem[] created in one transaction;
   Website reservation → CONSUMED (unchanged, existing mechanism, already tested)
4. [NEW] pushOrder() call to the new ERP endpoint — idempotent on website order id
5. [NEW] ERP creates a new SalesOrder, source="website", status=pending_validation
   (reuses the existing createSalesOrder() code path, generalized — see erp-api-contracts.md)
6. [BUSINESS DECISION — see §Business Decisions] — does this order auto-confirm immediately,
   or queue for the same human moderation Shopify orders go through?
   6a. If auto-confirm: confirmOrder() runs immediately → ERP StockReservation created →
       this is the real point ERP-side stock becomes unavailable to other channels
   6b. If queued: stock remains uncommitted ERP-side until a moderator acts — a real,
       currently-unbounded window during which Shopify (or any other channel) could sell
       the same unit. This is a known, accepted risk only if the business explicitly
       chooses 6b with this consequence understood.
7. Website polls order status on a schedule (getOrderStatus, new endpoint) and maps the
   real ERP primaryStatus vocabulary to its own customer-facing stages (erp-order-lifecycle-
   mapping.md §3)
```

**Recommended default** (stated as a recommendation, not a silent decision): **6a, auto-confirm**, because a website order has already passed the Website's own payment/reservation gates before it's ever pushed — the moderation queue exists to catch problems (SKU-mapping ambiguity, fraud signals) that are specific to Shopify's less-controlled import path, and a website order does not carry the same risk profile. This recommendation is not adopted by this document; it is flagged for the business decision, with its reasoning stated so the decision can be made informed.

### 4.4 Projection aggregation and floor-at-zero (unchanged from Phase 6's finding)

The new inventory read endpoint must sum `StockQuant.onHandQuantity − reservedQuantity` across every location/lot for a variant into one number, and floor negative results at zero before they ever reach the Website. Both are new logic in the new endpoint; the underlying aggregation query pattern already exists in the ERP (`getStockAvailability()`).

### 4.5 Race conditions — planned behavior, from `erp-inventory-analysis.md` §4, restated for implementation

| # | Scenario | Planned behavior |
|---|---|---|
| 1 | Website reservation succeeds / ERP push fails | Order valid website-side; dead-letter + retry; no ERP-side reservation was ever created, nothing to undo |
| 2 | ERP accepts order / Website request times out | Website retries `pushOrder()` with the same idempotency key; ERP's `ChannelMapping`-dedup returns the already-created order's reference instead of creating a second one — **this is a hard requirement on the new ERP endpoint**, not optional |
| 3 | Payment succeeds / ERP order creation fails | Never customer-visible; order remains valid and paid website-side; dead-letter + alert; retried until it succeeds or a human intervenes |
| 4 | Website reservation expires while ERP request is in progress | Not reachable — the website reservation is already `CONSUMED` at order-creation time, before any ERP call is ever made |
| 5 | Duplicate checkout request | Covered website-side by the existing `Idempotency-Key` header + ledger (tested); the ERP push inherits the same website order id as its own idempotency key, so a duplicate checkout can never produce two ERP orders either |
| 6 | ERP temporarily unavailable | Dead-letter + exponential backoff, website-initiated; order stays valid and fulfillable-once-pushed; no customer-facing failure |
| 7 | Inventory changes in ERP while Website has cached/projected stock | Expected and tolerated — the projection is explicitly eventually-consistent (`blueprint.md` §6); the Website's own reservation is the safety margin that absorbs this lag until the next scheduled pull catches up |

Full detail, including which of these were newly confirmed vs. already assumed in Phase 5, is in `erp-inventory-analysis.md`.

---

## 5. Customer synchronization

| Aspect | Decision |
|---|---|
| Website remains identity owner | Yes, unchanged — phone (E.164) stays the Website's own primary identity primitive; nothing about ERP inspection changes this |
| When ERP customer is created | At order-push time only (reconcile-then-push), not on Website signup/OTP-verification — matches the already-approved design (`blueprint.md` §9, ADR-006), now confirmed as the only pattern the ERP itself uses (Shopify's own `resolveShopifyCustomer()` also creates lazily, on first order) |
| External reference | New `Customer.erpCustomerId` (column already reserved, unpopulated) ↔ `ERP BusinessPartner.id` |
| Duplicate handling | Match on phone (primary) — mirroring the ERP's own Shopify-path match-on-email logic, adapted since the Website's primary identity is phone, not email. **The ERP-side match logic must be generalized from its current Shopify-specific implementation** (`resolveShopifyCustomer()`/`ShopifyCustomerSyncModule`) into a callable service usable by a non-Shopify caller — this is new ERP work, confirmed in Phase 6, not a mapping exercise |
| Phone normalization | Already done Website-side (`src/domain/phone.ts`, E.164) before any ERP call — the ERP call always receives an already-normalized number |
| Guest customer behavior | **Business decision required** (Phase 6 finding, unresolved): does a guest web order create a permanent `BusinessPartner` row in the ERP (matching Shopify's own precedent of creating even minimal-data customers), or does it need a distinct "walk-in"/anonymous bucket? Recommended default only if the business wants one: reuse the Shopify precedent (create a real, minimal `BusinessPartner`) for consistency, since the ERP has no alternative mechanism today and building one would be new, unjustified-until-asked-for scope |
| Update synchronization | One-way, Website → ERP, at order-push time only — never continuous, never ERP → Website (the Website never reads back ERP-side customer edits; no evidence the ERP needs to push customer changes to the Website, and nothing in either codebase's design calls for it) |

---

## 6. Order synchronization

Full field/state mapping already exists in `erp-order-lifecycle-mapping.md` §3 (Phase 6) — this section states the sequencing/timing decisions specifically.

| Aspect | Decision |
|---|---|
| When the Website sends the order | Immediately after `checkoutService.confirmAndPlaceOrder()` commits — for COD, that's immediately (COD is considered "confirmed" at order creation, matching current Website behavior); for online payment (not yet built), after capture succeeds, never before |
| What qualifies as "confirmed" for push purposes | A Website `Order` row existing — COD and online payment both push only once the Website itself considers the order real and paid-or-payable, never a pending/abandoned cart |
| COD vs. online payment | COD: order pushed with `paymentMethod: "cod"`, `paymentStatus` informational only (ERP's own `paymentStatus` stays `unpaid` until its own human-recorded collection happens — unchanged ERP behavior, not overridden by the push). Online: order pushed only after capture, `paymentMethod: "online"`, `paymentStatus: "paid"` as an informational fact — **this requires a new ERP-side acceptance path since the ERP has zero precedent for a non-manual payment status today** (Phase 6 finding); flagged, not built |
| Idempotency key | Website order id (existing `Order.id`/`idempotencyKey`), reused as the `ChannelMapping.externalId` for a new `internalEntityType="sales_order"`, `salesChannelId` = a new "website" `SalesChannel` row |
| Website Order ID / ERP reference | `Order.erpOrderReference` (already reserved, unpopulated) ↔ `ERP SalesOrder.id`, resolved via the `ChannelMapping` row above |
| Order line mapping | `Website OrderItem` (SKU/qty/unit-price snapshot) → `ERP SalesOrderLine` (variant/qty/unitPrice snapshot) — both sides already snapshot at commit time; direct 1:1 mapping, no conflict |
| Customer mapping | Resolved via §5's reconcile step, immediately before order creation, same call |
| Address mapping | Sent as part of the order payload only, on both sides — neither system persists Address as an independently synced entity (confirmed identical design on both sides in Phase 6) |
| Price/discount snapshot | Both sides already freeze at commit time — direct mapping, no conflict |
| Tax | **Unresolved on both sides** (Website: `ZeroTaxPolicy`, explicitly temporary; ERP: no tax field found at all). Push payload should carry whatever the Website's `TaxPolicy` computes (currently zero) as an informational amount; this is explicitly a placeholder, not a real tax integration — see §Business Decisions |
| Shipping fee | Website-computed (`ManualShippingAdapter`, zone lookup), sent as an informational snapshot — the ERP has no shipping-fee concept of its own (no Shipment/courier model found) |
| Payment state — kept separate, never collapsed | `Website Payment.status` stays entirely Website/provider-owned, orthogonal to ERP, exactly as already approved. The push payload carries payment method + status as **information the ERP records**, never as something the ERP is asked to independently verify |
| Fulfillment state — kept separate, never collapsed | `Website Order.erpPushStatus` (`NOT_PUSHED/PENDING/SUCCEEDED/FAILED`) tracks only the push attempt. The real ERP fulfillment vocabulary (`primaryStatus`) is pulled back separately and mapped to customer-facing stages per `erp-order-lifecycle-mapping.md` §3 — three genuinely separate dimensions (order/commercial state, payment state, fulfillment state), never merged into one field on either side |

---

## 7. Payment integration

| | COD | Online (not yet built on the Website) |
|---|---|---|
| Payment state | `AWAITING_COD_COLLECTION` at order creation (existing `CodPaymentAdapter.createPayment()`, unchanged) | Would be `AUTHORIZED`/`CAPTURED` before order push, per whatever provider is eventually chosen — **no provider is chosen yet**; this document does not invent one |
| Capture | Not applicable — cash collected on delivery, recorded manually in the ERP by a human (`cash-collection.service.ts`, unchanged, confirmed Phase 6) | Provider-specific, out of scope until a provider exists |
| Failure | COD has no "failed payment" concept before delivery | Provider-specific; order push should not happen until capture succeeds, so a failed online payment never reaches the ERP at all |
| Cancellation | Website `cancelOrder()` (existing) triggers the new ERP cancel-push (reusing `cancelOrder()` ERP-side, per §6) | Same, plus a refund consideration — see Returns/Refunds below |
| Refund | Not modeled on either side (Phase 6 finding, confirmed unchanged) — **business decision required** before any design |
| ERP financial reference | None exists today — `ERP Payment` has no status field, and no FK links `SalesOrder` to `Invoice`/`Payment` (convention-only linkage via `referenceDocumentType/Id`). The push payload informs the ERP of payment facts; it does not create or reference an `ERP Payment` row directly — that remains the ERP's own manually-triggered `confirmCashCollection()` flow, unmodified |
| Order creation timing | COD: immediately on checkout confirm (unchanged Website behavior). Online: after capture, never before (prevents an ERP order existing for a payment that never completes) |

**Tax**: per the brief's explicit instruction, this document does not invent Egyptian tax rules. The Website's `ZeroTaxPolicy` abstraction (`src/modules/checkout/tax-policy.ts`) stays exactly as it is; the ERP push simply carries whatever it currently computes (zero). **Marked BUSINESS DECISION REQUIRED** — see §Business Decisions.

---

## 8. Shipping / fulfillment integration

The Website's `ShippingProvider`/`ManualShippingAdapter` boundary (`src/modules/shipping/`) is **not replaced or wrapped by the ERP** — Phase 6 found no dedicated Shipment/courier/tracking entity anywhere in the ERP's 79-model schema, and fulfillment terminology in the ERP code ("خروج مع المندوب") suggests an own-delivery-rep model, not a third-party courier API. This is treated as a strong inference from absence (not exhaustively proven — flagged in `erp-domain-map.md`), and **should be explicitly confirmed as a decision, not just assumed permanent**.

| Aspect | Decision |
|---|---|
| Shipping zone/fee ownership | Stays Website-owned (`ShippingZone`, `ManualShippingAdapter`) — unchanged, no ERP equivalent exists |
| Shipment creation | Website creates its own local `Shipment` record at order time, unchanged — not synced to/from the ERP as a distinct entity |
| Fulfillment status | Pulled from `ERP SalesOrder.primaryStatus` (real values, per `erp-order-lifecycle-mapping.md` §1), mapped to the Website's small customer-facing stage set — this is the *only* fulfillment-status source, since no separate courier system was found |
| Courier information / tracking number | Not available from the ERP today — no tracking-number field, no courier-integration code found. If the business ever adds a real courier, that is a **separate, independent integration decision**, not something this ERP integration should assume or block on |
| Dispatch / delivery / failed delivery | `out_for_delivery`/`delivered` map directly. **`failed_delivery` is a dead ERP enum value — never actually emitted by any service function (Phase 6 finding) — the Website must not build a mapping expecting to receive it** |
| Return-to-sender | Not supported — the ERP's own return flow only covers pre-delivery driver-returns (`out_for_delivery → returned`); nothing resembling "attempted delivery, returned to sender" exists |

---

## 9. Shopify migration / coexistence

The ERP's existing Shopify integration is **not touched, replaced, or deleted** by this plan, at any phase. Website and Shopify become two independent, simultaneous `SalesChannel` sources into the same ERP, exactly as the ERP's own architecture already supports (it was explicitly designed as "one instance of a generic Sales Channel Connector pattern," per the ERP's own Business Discovery document, §4 point 6).

| Aspect | Decision |
|---|---|
| Cutover strategy | No hard cutover is required or proposed — Website and Shopify can run in parallel indefinitely, each as its own `SalesChannel` row, each with its own `ChannelMapping` rows. This is a genuine advantage of reusing the ERP's existing multi-channel-ready design rather than building something Shopify-shaped |
| Source of truth during transition | ERP remains authoritative for both channels' orders/inventory, unchanged — this was already true before any website integration exists |
| Duplicate orders | Not possible by construction — Website orders and Shopify orders are different `SalesChannel`s with independently-scoped `ChannelMapping` identity; there is no shared external-id space where a collision could occur |
| Inventory synchronization | Both channels read the same `StockQuant` aggregate — the "double-sell across channels" risk already exists today between Shopify and any future channel (it's inherent to the ERP's oversell-allowed, moderation-gated design, per `erp-inventory-analysis.md`), not newly introduced by the Website integration |
| Customer mapping | Independent per channel — a customer who orders via both Shopify and the Website would (absent a deliberate cross-channel match rule, which does not exist and is not proposed here) resolve to two separate `BusinessPartner` rows, matched only within each channel's own sync logic. **This is a real, disclosed limitation, not a gap to silently close** — flagged for awareness, not for this phase to solve |
| Rollback strategy | Since nothing about the Shopify integration is modified, "rollback" for the Website integration means: stop calling the new `/api/v1/integrations/website/*` endpoints, disable the `CompanyIntegrationConnection` row for the website connector. The Shopify integration is entirely unaffected in either direction |
| Final Shopify shutdown point | Out of scope for this phase — a future business decision, entirely independent of whether/when the Website integration ships. Nothing in this plan assumes or requires Shopify's eventual retirement |

---

## 10. Implementation sequence

Full phase-by-phase detail (files, dependencies, risk, tests, rollback) is a separate concern from this summary table — see the phase breakdown below. Phases are **not** all separate releases; several can ship together where the dependency graph allows (noted per phase).

| Phase | Scope | Project(s) | Depends on | Risk | Can combine with |
|---|---|---|---|---|---|
| A | ERP foundation: new `IntegrationConnector`("website")/`CompanyIntegrationConnection`/`IntegrationSecret` rows, new API-key auth-verification middleware path, new `SalesChannel`("website") row | ERP | Auth mechanism decided (`erp-integration-security-plan.md`) | LOW — pure infrastructure, models an existing working pattern | — (foundational, nothing else can start before this) |
| B | Website integration layer: `src/modules/erp-integration/` skeleton, `ERPProvider` interface, credential storage in `env.ts`/adapter | Website | Phase A (needs real or stubbed credentials to configure against) | LOW | Can ship alongside Phase A |
| C | Catalog sync: new ERP read endpoint (products/variants/categories/prices), Website scheduled pull job + projection write | ERP + Website | Phase A, B; scheduler mechanism decided | MEDIUM — first real cross-system data flow | — |
| D | Inventory: extend Phase C's read endpoint with aggregated/floored stock; confirm-gate business decision resolved; (if 6a) auto-confirm wiring in the new order-create path | ERP + Website | Phase C; confirm-gate decision (**business, blocking**) | HIGH — the highest-risk area per `erp-inventory-analysis.md` | Ships with Phase C's endpoint, but the confirm-gate logic depends on Phase F |
| E | Customers: generalized ERP-side reconcile-customer capability; Website adapter call at order-push time | ERP + Website | Phase A; guest-customer policy decided (**business**) | MEDIUM | Ships together with Phase F (customer reconcile happens inside the order-push flow) |
| F | Orders: new ERP order-create endpoint (generalized `createSalesOrder`), Website `pushOrder()`, idempotency wiring, status pull-back | ERP + Website | Phase D (confirm-gate), Phase E | HIGH — the second highest-risk area | — |
| G | Payments: informational payment-status acceptance in the order-create payload; refund/online-payment paths deferred | ERP + Website | Phase F; tax policy decision; online payment provider decision (**business, if pursued**) | MEDIUM (LOW if COD-only for MVP) | Ships with Phase F for COD; online payment is a later, independent increment |
| H | Fulfillment: status pull-back mapping, confirmed against real ERP vocabulary | ERP + Website | Phase F | LOW | Ships with Phase F |
| I | Reconciliation: periodic jobs (catalog, inventory, orders) — see `erp-integration-reconciliation.md` | Website | Phases C, D, F | MEDIUM | Can ship slightly after F/D go live, not before |
| J | End-to-end testing against a real or sandboxed ERP company | Both | All of the above | — | Gate before production traffic, not a separate ship |
| K | Shopify coexistence verification (confirm no interference, per §9) | ERP | Phase F live | LOW | Verification pass, not new code |

---

## 11. Performance / availability

| Rule | Rationale |
|---|---|
| No ERP call blocks the customer-facing checkout request | Order creation (Website-side) already commits without any ERP call in the same transaction (confirmed Phase 5/6) — `pushOrder()` happens after, asynchronously from the customer's perspective, exactly as already designed |
| Catalog/inventory reads are always served from the Website's own projection, never a live ERP call per page request | Unchanged, already-approved rule (`technical-architecture.md` §3) — confirmed still correct given the ERP has no fast, cheap "read one SKU's live price" endpoint proposed or needed |
| Acceptable staleness | Catalog/price: minutes (matches the scheduled-pull interval). Inventory: same, absorbed by the Website's own reservation safety margin — not a correctness risk, a UX one (a "low stock" label shown slightly early) |
| ERP outage behavior | Catalog/inventory: stale projection served, never a storefront error. Orders: dead-lettered and retried, never a checkout-blocking error, per the existing `erp_integration` error category |
| Caching | The catalog projection itself already functions as the cache — no additional caching layer (Redis, etc.) introduced by this integration; consistent with the Website's own stated position that Redis is "conditional," not automatic (`blueprint.md` §19) |
| Correctness over speed | Inventory and order correctness are never sacrificed for latency — e.g., the confirm-gate decision (§4.3) is evaluated on correctness/risk grounds, not on how fast an order can be pushed |

---

## 12. Business decisions — full list

See `erp-integration-final-gap-analysis.md` (Phase 6) for the originally-identified set; this phase adds no new categories but sharpens two of them with the implementation-level detail now available. Full write-up with question/why-it-matters/affected-modules/default/consequence-if-unresolved is in this document's own dedicated companion section — see §26 cross-reference below; the canonical list lives in this file to avoid duplicating it a third time:

1. **Order confirm-gate**: auto-confirm website orders vs. queue them for moderation like Shopify orders. Affects: Orders (ERP), Inventory timing. Recommended default: auto-confirm (§4.3), not adopted without explicit sign-off. **If unresolved**: Phase D/F cannot be finalized — the order-create endpoint's behavior literally depends on this.
2. **Guest-customer ERP policy**: create a permanent `BusinessPartner` for every guest order, or a distinct bucket. Affects: Customers (ERP), Orders. Recommended default: reuse the Shopify precedent (create real, minimal records) for consistency and lowest new-build cost. **If unresolved**: Phase E cannot be finalized.
3. **Tax policy**: whether/how real tax applies at all — genuinely unresolved on both sides, not just "needs ERP inspection." Affects: Checkout (Website), Orders (both). No default offered — this is a compliance question, not an engineering one. **If unresolved**: `ZeroTaxPolicy` remains permanently in place; the integration can still ship, carrying zero as an explicit, informational placeholder.
4. **Online payment provider**: none chosen yet. Affects: Payments (Website), Phase G. **If unresolved**: MVP ships COD-only, which is already the Website's current real capability — not a blocker to the rest of the integration.
5. **Shipping provider / courier**: confirmed no ERP-side courier integration exists; decision needed on whether the Website's own `ManualShippingAdapter` stays permanent or a real courier gets added later, independently of the ERP. Affects: Shipping (Website). **If unresolved**: current zone-based manual shipping continues to work exactly as today.
6. **Delivery zones/fees**: already Website-owned and functioning (seed data, explicitly labeled placeholder pricing) — not blocked by this integration, but worth a real-pricing pass independent of it.
7. **Returns/refunds policy**: unresolved on both sides. Affects: Orders, Payments, Inventory (both systems). **If unresolved**: returns/refunds stay unbuilt on both sides — no regression, since neither side has this today.
8. **Guest OTP policy / marketing consent**: pre-existing Website-only concerns, not newly raised by ERP integration — out of this document's scope, noted only for completeness since the brief asked for a full checklist (see `erp-integration-final-gap-analysis.md` for their original context if any existed; not found as an open item in Phase 5/6 documents, so likely already settled or not yet raised by the business).
9. **Reservation duration**: already decided and working (15-minute TTL, centrally configurable) — not reopened by this integration; included here only because the brief's checklist named it explicitly.
10. **Inventory allocation timing**: this *is* decision #1 (order confirm-gate) — same decision, not a separate one; listed once to avoid the false impression of two independent unresolved items.

---

## 13. Final gap analysis

| Gap | Project | Severity | Type | Dependency | Required action |
|---|---|---|---|---|---|
| ERP inbound API-key auth path does not exist | ERP | BLOCKER | ERP | Auth mechanism decision (already made — see `erp-integration-security-plan.md`) | Build Phase A |
| ERP generalized order-create entry point does not exist | ERP | BLOCKER | ERP | Confirm-gate decision (#1 above) | Build Phase F, gated on the decision |
| ERP generalized customer-reconcile capability does not exist | ERP | HIGH | ERP | Guest-customer decision (#2 above) | Build Phase E |
| ERP inventory-aggregation read endpoint does not exist | ERP | HIGH | ERP | None — answerable today | Build Phase C/D |
| Order confirm-gate undecided | Both | HIGH | BUSINESS | None | Decide before Phase D/F |
| Website `erp-integration` module does not exist | Website | HIGH | WEBSITE | Phase A | Build Phase B |
| Website scheduler mechanism undecided/unbuilt | Website | MEDIUM | INFRASTRUCTURE | None — GitHub Actions recommended, per ERP's own precedent | Decide + build before Phase C |
| Website dead-letter/sync-history table does not exist | Website | MEDIUM | WEBSITE | None | Build in Phase B or C |
| Guest-customer ERP policy undecided | Both | MEDIUM | BUSINESS | None | Decide before Phase E |
| Tax policy unresolved | Both | MEDIUM | BUSINESS | None | Does not block MVP; carries as an explicit zero placeholder |
| Online payment provider unchosen | Website | LOW (for MVP) | BUSINESS | None | Does not block MVP; COD-only ships first |
| Returns/refunds unmodeled | Both | LOW (for MVP) | BUSINESS | None | Does not block MVP; stays unbuilt |
| `Category.erpCategoryId` column missing | Website | LOW | WEBSITE | Category display decision | Add in Phase C |
| RLS `FORCE ROW LEVEL SECURITY` unconfirmed | ERP | LOW (for this integration specifically) | INFRASTRUCTURE | ERP's own pre-existing backlog | Verify per `erp-integration-security-plan.md` §RLS, independent timeline |
| Courier/shipping-ERP relationship not formally confirmed | Both | LOW | BUSINESS | None | Confirm the Phase 6 inference as a decision, not just an assumption |

---

## 14. Ready-to-build checklist

| Item | Status |
|---|---|
| Architecture approved | READY — §2, reuses proven patterns on both sides |
| ERP behavior understood | READY — Phase 6 exhaustive audit, file:line cited |
| API boundary defined | READY (design) — see `erp-api-contracts.md`; NOT READY (build) — endpoints don't exist yet |
| Authentication defined | READY (design) — see `erp-integration-security-plan.md`; REQUIRES ERP CHANGE to build |
| Product mapping defined | READY — §3, `erp-website-real-mapping.md` |
| Inventory strategy defined | READY (design) — §4; REQUIRES DECISION (#1, confirm-gate) before Phase D/F can be finalized |
| Customer mapping defined | READY (design) — §5; REQUIRES DECISION (#2, guest policy) before Phase E can be finalized |
| Order mapping defined | READY (design) — §6, `erp-order-lifecycle-mapping.md` §3 |
| Payment mapping defined | READY (design) — §7; REQUIRES DECISION (tax, online-provider) for anything beyond COD |
| Fulfillment mapping defined | READY — §8 |
| Idempotency defined | READY — `erp-integration-failure-recovery.md` |
| Failure recovery defined | READY — `erp-integration-failure-recovery.md` |
| Reconciliation defined | READY — `erp-integration-reconciliation.md` |
| Security acceptance criteria defined | READY — `erp-integration-security-plan.md` |
| Testing strategy defined | READY — `erp-integration-testing-plan.md` |
| Business decisions identified | READY (identified) — §12; NOT YET DECIDED (that's the business's next step, not this phase's) |

**Overall**: the plan itself is complete and implementation-ready. Actual coding cannot begin on Phase D/F/E until decisions #1 and #2 (§12) are made — everything else (Phase A, B, C, and the design of every later phase) can proceed immediately.
