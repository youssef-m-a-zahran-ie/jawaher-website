# ERP Integration Readiness Assessment

Phase 5 — ERP Integration Readiness & Gap Audit. This is the conclusion document — it answers the question the brief called "the most important": **is the current website architecture ready to connect to an ERP?** Everything below is based on reading the actual codebase and the already-approved canonical docs; no ERP was inspected, none of its behavior was assumed, and nothing was implemented.

Status: Phase 5. Last updated: 2026-09-08.

---

## 1. Integration boundary review

`module-boundaries.md` already approved (Stage 0.9) exactly where ERP integration should live: a dedicated `ERP Integration` module, Layer 1 (integration adapters, alongside Payments/Shipping/Notifications/Analytics), depended on *only* by Catalog (for the projection sync) and Orders (for the push) — never called directly by Storefront, Cart, or Checkout (`ADR-011`: "Nothing outside ERP Integration MUST call the ERP directly").

**Does the current implementation already provide the correct seams?** Checked directly against the real code, not assumed from the docs:

- **The adapter pattern is already proven, twice.** `PaymentProvider`/`CodPaymentAdapter` and `ShippingProvider`/`ManualShippingAdapter` (both Phase 4) are real, working implementations of exactly the interface-plus-adapter shape `blueprint.md` §9 specifies for the ERP Adapter. An `ERPProvider` interface (`getProducts`, `getProduct`, `getPrices`, `getInventory`, `pushOrder`, `getOrderStatus`, `reconcileCustomer`) would follow the identical pattern — `src/modules/erp-integration/provider.ts` + one adapter implementation, consumed through a thin `erpIntegrationService`, exactly like `src/modules/payments/` and `src/modules/shipping/` today.
- **The dependency direction is already correct.** `Catalog` (`src/modules/catalog/`) already owns exactly the data a product/price/inventory sync would write into — `Product`, `Variant`, and the reservation logic sit on top of it, not the other way around. `Orders`/`Checkout` already own exactly the data a `pushOrder()` call would read from — the whole `Order`/`OrderItem` snapshot is already assembled and frozen before any such call would happen (`erp-data-ownership-matrix.md` §4/§6). No module outside these two would need to change to accommodate the ERP Adapter's arrival.
- **The API layer is already correctly excluded.** No route under `src/app/api/v1/**` touches Prisma directly (verified: every route calls a module's service function) — the same discipline (ADR-014) that already keeps the frontend off the database keeps it off any future ERP call too, automatically, without new enforcement.
- **Idempotency infrastructure already exists and is reusable.** `IdempotencyKey` (Phase 4, used today for order creation) is exactly the mechanism `blueprint.md` §8/§9 already calls for on the ERP push ("the website order id is the idempotency key used when pushing to the ERP") — not a new table, a new use of an existing one.
- **What genuinely doesn't exist yet:** the module itself, any sync job, any background-job/scheduler mechanism at all (not ERP-specific — nothing in this project has one yet, not even for the already-built reservation sweep), and a dead-letter/sync-history table (`erp-integration-gap-analysis.md` has the full list).

**Conclusion for this section:** the current architecture does not need to change to accommodate ERP integration — it needs the ERP Integration module *added*, following a pattern the codebase already demonstrates twice.

---

## 2. Duplication and conflict risk audit

For each area the brief named, in the same order:

| Area | Current website behavior | Potential ERP conflict | What must be verified | Recommended integration strategy |
|---|---|---|---|---|
| **Inventory calculations** | `getAvailableQuantity()` = raw projected quantity − active reservations (`src/modules/catalog/inventory.ts`) | If the ERP performs its own allocation/hold at order-push time, there's a window where both systems believe the same unit is available | Whether the ERP has its own reservation/hold concept, and its timing relative to the website's own | Keep the website's reservation as a *pre*-push safety margin only (already true today); the moment `pushOrder()` succeeds, the website's reservation is already `CONSUMED` — the real question is what happens in the gap between "website reserves" and "ERP push succeeds," which is currently as short as one transaction. Do not let the website's reservation try to *represent* ERP-side allocation — it never should, per the already-approved "ERP always wins" rule (`blueprint.md` §6) |
| **Stock reservation** | Website-local only, no ERP awareness (`InventoryReservation`, Phase 4) | None currently — the mechanism doesn't claim to represent ERP state at all | Confirm this remains true once real sync exists (i.e., the reservation should never be "reconciled against" the ERP — it's not that kind of entity) | No change needed — this is already correctly scoped as website-only |
| **Pricing** | `Variant.priceAmountMinor`, seeded; never computed independently by the website beyond arithmetic (subtotal, discount, tax, total) | If the ERP also computes a "final price" (e.g. with its own promotions), a customer could see two different totals across systems | Whether the ERP has margin-impacting pricing rules beyond a flat price-per-SKU (`blueprint.md` §7 already anticipates this: "Promotion/pricing rule with margin impact... Projection... website surfaces it, never invents or overrides it") | Already-approved strategy holds: the website computes the customer-facing total from the ERP-projected base price plus website-owned coupon logic; it never invents a competing pricing engine. No change needed, only inspection to confirm the projection includes anything margin-relevant |
| **Discounts / Promotions** | `PromotionsService` — simple coupon codes only, website-owned (`commerce-completeness-audit.md` §11) | If the ERP has its own promotion engine, a website coupon and an ERP promotion could theoretically both apply to the same order with no coordination | Whether the ERP has any promotion concept at all, and whether order push needs to report the website's applied discount as a line the ERP should *respect* rather than *recompute* | The order push payload should carry the discount as an already-applied, immutable fact (it already is, per the order snapshot) — the ERP should receive it as history, not be asked to validate or reapply it |
| **Order status** | `Order.status`: `CONFIRMED`/`CANCELLED` only, website-owned, never derived from anything ERP-side (`commerce-completeness-audit.md` §14) | None by design — `blueprint.md` §8 already draws this line clearly (website owns the commercial envelope, ERP owns the operational envelope) and the schema respects it (separate fields, no shared enum) | Nothing — this separation is already correct and needs no further verification, only the ERP's own operational-status vocabulary once inspected (a separate field, not a merge) | No change needed |
| **Payment status** | `Payment.status`, entirely website/provider-owned, orthogonal to any ERP concept (`erp-data-ownership-matrix.md` §2) | None — `blueprint.md` §7 already states payment is not an ERP entity | Confirm this holds (i.e., the ERP doesn't have its own "paid/unpaid" flag that could contradict the website's) | If the ERP *does* track a payment flag internally, treat it as informational only in the push payload, never as a second source of truth the website reads back |
| **Shipping status** | `Shipment.trackingStatus`, currently unpopulated (`ManualShippingAdapter` has no real courier) | If the ERP dispatches to a courier itself, its status and any independent Shipping Adapter's status could disagree | Whether the ERP or a separate courier integration is the actual tracking source (flagged in the gap analysis as the one real architectural fork) | Undecided until the ERP is inspected — do not build a second, competing tracking mechanism before knowing which one is authoritative |
| **Customer creation** | Website creates `Customer` rows on OTP verification only; `reconcileCustomer()` is not implemented | If the ERP also auto-creates a customer record on order receipt without matching against what the website already sent, duplicate ERP-side customer records could accumulate | Whether the ERP's own order-create operation auto-creates a customer, or whether an explicit `reconcileCustomer()` call must precede it | Follow the already-approved order: reconcile first (match-or-create), then push the order referencing the resolved ERP customer id — never let order creation implicitly create a second, unmatched customer record |
| **Tax calculation** | `ZeroTaxPolicy`, explicitly temporary (Phase 4 review) | If the ERP computes tax independently, the website's snapshot (zero, today) would disagree with whatever the ERP calculates | Whether the ERP owns tax/e-invoicing entirely, partially, or not at all | Do not resolve now — this is flagged as both a business decision and an ERP-inspection question in the gap analysis; whichever party owns it, the *other* must treat its number as authoritative, never average or reconcile the two |
| **Cancellation** | Website-side transition works; no ERP-communication design exists yet, in this phase or any prior approved doc | A website cancellation with no ERP notification could leave the ERP still fulfilling a cancelled order | Whether/how the ERP needs to be told | Flagged as a real, if small, architecture gap (not just an implementation one) in the gap analysis — worth a short `blueprint.md` addendum once designed, not before |
| **Returns / Refunds** | Not modeled (Phase 1's New Finding #2) | N/A — nothing exists to conflict yet | The return/refund policy itself, and separately whether the ERP has any returns concept | Business decision must precede any ERP-side design — do not let ERP inspection alone answer a policy question that's actually the business's to make |

**No case above found the website silently duplicating ERP business logic today.** Every area where a conflict is *possible* is possible only in the future, contingent on facts about the real ERP this phase cannot observe — the current implementation does not assume an answer in any of them.

---

## 3. Security boundaries for the future ERP connection

Restates and confirms against the current codebase, per `technical-architecture.md` §12/§23/§26 (already approved, not revised here):

- **Credential isolation**: the pattern already exists twice (Payment/Shipping adapters hold their own provider credentials, read via `src/lib/env.ts`, never passed through Checkout/Orders). An ERP Adapter would follow the identical pattern — credentials live only inside `src/modules/erp-integration/`'s adapter implementation and `env.ts`.
- **Least privilege**: not yet applicable — no ERP credential exists to scope. When it does, the adapter should request only what `getProducts/getPrices/getInventory/pushOrder/getOrderStatus/reconcileCustomer` actually need — **requires ERP inspection** to know what granularity the ERP's own credential model even offers.
- **Internal-only endpoints**: the pattern already exists — `/api/v1/internal/inventory/sweep-expired-reservations` (Phase 4's review) is shared-secret protected, fails closed in production if unconfigured. Any future ERP-sync-trigger endpoint (for the "external scheduler hits an internal endpoint" pattern) should follow the identical protection, not a new one.
- **Request signing**: not applicable to outbound calls the website makes *to* the ERP unless the ERP requires it (**requires ERP inspection**); applicable to *inbound* webhooks if the ERP ever sends one — the website's existing webhook-verification discipline (designed for Payments, `technical-architecture.md` §5: "verifies the provider's signature before trusting the payload") is the pattern to reuse, not reinvent.
- **Rate limiting**: `src/lib/rate-limit.ts` already exists and is already used per-identity (OTP, coupon-apply, order-tracking) — the same mechanism applies to any inbound ERP webhook endpoint once one exists.
- **Replay protection**: covered by the same webhook-verification + idempotency discipline already established for Payments — a future ERP webhook handler processing the same delivery twice must be a no-op, exactly like the already-documented payment-webhook requirement.
- **Idempotency**: already covered — see §1.
- **Audit logs**: `AuditLog` (Phase 4) already exists for order/payment/reservation state changes; a future ERP push/reconcile call should log an entry the same way, not invent a separate mechanism.
- **PII handling**: `src/lib/logger.ts`'s redaction list already covers phone/address fields generically (extended in Phase 4) — a future ERP payload/response would need the same discipline applied to whatever it contains, confirmed once its real shape is known.
- **Failure logging**: the existing error-category model (`technical-architecture.md` §22) already reserves `erp_integration` specifically, with the rule that it's "never surfaced as a checkout-blocking error... logged/alerted internally only" — already correct, needs no change.

**No new security pattern needs to be invented.** Every requirement above is already satisfied by an existing, working pattern elsewhere in the codebase — the work, once the ERP is inspected, is applying that pattern, not designing a new one.

---

## 4. Observability requirements

| Requirement | MVP or later | Current status |
|---|---|---|
| Sync success/failure | MVP | Not yet built (no sync job exists) — but the logging/error-category infrastructure it would use already exists |
| ERP request id | MVP | Not applicable yet (no ERP calls exist); the website's own request-id propagation mechanism (`src/lib/request-id.ts`, Phase 1) already exists and is already specified (`technical-architecture.md` §21) to extend to "any ERP Adapter... call it triggers" |
| Website request id | MVP | **Already fully working**, website-wide, since Phase 1 |
| ERP entity reference | MVP | Columns already reserved (`erpProductId`, `erpCustomerId`, `erpOrderReference`) — just unpopulated |
| Retry count | MVP | Not yet built — same reasoning as sync success/failure |
| Latency | MVP | Not yet built, but the structured-logging pattern (`src/lib/logger.ts`) already captures duration for other operations and would extend trivially |
| Error category | MVP | **Already exists** — `erp_integration` is a reserved category in the existing error model (`technical-architecture.md` §22), unused only because nothing calls it yet |
| Reconciliation status | Later (once a reconciliation job exists) | Not built — mirrors the already-approved-but-unbuilt Payment reconciliation job |
| Last successful sync timestamp | MVP | Not built — needs the sync-run-history table flagged in the gap analysis |
| Failed sync records | MVP | Not built — same table |

Nothing here requires new architectural decisions — every MVP-tier requirement either already exists generically (request id, error category) or is a straightforward extension of an existing pattern (structured logging, audit log) once the sync job itself is built.

---

## 5. The verdict

> **Is the current website architecture ready to connect to an ERP?**

**Yes — with a short, genuinely minimal preparation list, not a redesign.**

This is not a hedge. Every seam the brief asked to evaluate — the adapter boundary pattern, the module dependency direction, the Website Order / ERP Order Reference split, idempotency infrastructure, error categorization, credential isolation, snapshot immutability, inventory-reservation independence — was found, on direct inspection of the real code, to already be correctly shaped by decisions made and implemented in Phases 1 through 4, before this ERP-focused phase even began. The gap analysis found zero BLOCKER-severity items. Nothing needs to be torn out or redesigned.

**What genuinely should happen before real ERP work begins** (not because the architecture is wrong, but because these are cheap, low-risk, and remove ambiguity for whoever inspects the real ERP next):

1. **Decide the scheduler mechanism** (platform cron, a scheduled GitHub Actions workflow, or an external service hitting the already-existing internal-endpoint pattern) — this blocks *any* future scheduled job, ERP-related or not, and is answerable today without the ERP.
2. **Have the actual ERP inspection ready to answer a short, specific list of questions**, rather than a vague "what does the ERP do" — the exact list is: variant/option structure, category concept, inventory-allocation timing (the single highest-value question), cancellation-communication requirement, customer-match semantics, and whether product media exists.
3. **Nothing else.** No schema migration, no module refactor, no API contract change is required to *start* building the ERP Integration module — it slots into an already-correctly-shaped boundary.

**What should explicitly wait**, per this phase's own instruction and good sequencing: the ERP Integration module itself, the sync job, `pushOrder()`/`reconcileCustomer()`, the dead-letter/sync-history table (its correct shape depends on what's being inspected), and any resolution of the tax/returns/cancellation-communication open questions that are genuinely gated on either a business decision or the ERP inspection itself.
