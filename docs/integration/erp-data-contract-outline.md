# ERP Data Contract Outline (Preliminary)

Phase 5 — ERP Integration Readiness & Gap Audit. A skeleton for the future integration contract, derived entirely from the current website's confirmed requirements and implementation — **not** from any inspection of the real ERP, which was not available this phase. Every endpoint name, payload field, and identifier below is a deliberate placeholder in `[BRACKETS]`, marked **"Requires ERP inspection."** None of this is implemented; none of it should be treated as a real API contract until the actual ERP is inspected.

Status: Phase 5 — outline only, not implementable as-is. Last updated: 2026-09-08.

---

## How to read this document

Each section states, in order:
1. **Confirmed from website** — what the website's current implementation/requirements definitely need, independent of the ERP's actual shape.
2. **Requires ERP inspection** — what cannot be specified until the real ERP is seen.
3. **Business decision required** — what depends on a decision no one has made yet, regardless of the ERP.

This split matches `blueprint.md` §9's own framing: "the exact protocol depends on what the existing ERP can expose — this section defines the target shape."

---

## 1. Authentication

- **Confirmed from website:** the ERP Adapter (`blueprint.md` §9, `module-boundaries.md`'s ERP Integration row) is the *only* module ever allowed to hold ERP credentials — `technical-architecture.md` §23: "Provider credentials/secrets live only inside the specific adapter implementation and the environment configuration — never in the core [module], never in the frontend." This matches the pattern already built for Payments (`CodPaymentAdapter`) and Shipping (`ManualShippingAdapter`): a `src/modules/erp-integration/` module (not yet created) would hold this exclusively.
- **Requires ERP inspection:** `[ERP AUTHENTICATION METHOD]` — API key, OAuth, mutual TLS, IP allowlisting, or something else entirely. `[ERP CREDENTIAL ROTATION POLICY]`.
- **Business decision required:** none identified beyond standard secret-management practice, already covered by `technical-architecture.md` §23's existing environment-configuration categories (which already reserve an `ERP` category with `endpoint/connection details, timeout/retry settings` — unpopulated, per `.env.example`).

---

## 2. Products

- **Confirmed from website:** needs, per product — `[ERP PRODUCT IDENTIFIER]`, name, category reference, status (active/discontinued), and whatever base description the ERP considers canonical (rich content stays website-owned regardless, per the ownership matrix §3). Sync is pull-based, scheduled (`blueprint.md` §9), never called inline on a customer page request (`technical-architecture.md` §3's hard rule).
- **Requires ERP inspection:** `[ERP PRODUCT LIST OPERATION]`, whether it supports incremental ("changed since X") queries or only full pulls, `[ERP PRODUCT STATUS VOCABULARY]`.
- **Business decision required:** none beyond what's already tracked (category/attribute taxonomy — see Variants below).

## 3. Variants / SKUs

- **Confirmed from website:** SKU is the stable cross-system identity the website already keys everything off (`Variant.sku`, unique). Needs, per variant — `[ERP VARIANT IDENTIFIER]` (if distinct from SKU), SKU itself, a label/size description, price, compare-at price if applicable, and inventory quantity.
- **Requires ERP inspection:** `[ERP VARIANT STRUCTURE]` — whether the ERP models variants as a flat label (matching the website's current `Variant.label` choice) or as structured option/value pairs (size × color × etc.) — this directly determines whether the projection sync is a 1:1 field copy or needs a mapping layer. Also: `[ERP UNIT-OF-MEASURE CONCEPT]` if any.
- **Business decision required:** the deferred per-category attribute taxonomy (`commerce-completeness-audit.md` §2's `Product.attributes Json?` escape valve, `website-functional-requirements.md` §25) — unresolved regardless of the ERP, but the ERP's own variant shape (once inspected) would directly inform how that taxonomy should finally be structured.

## 4. Prices

- **Confirmed from website:** integer minor units (piasters), EGP only currently (`src/domain/money.ts`). One current price + one optional compare-at price per variant, no temporal pricing modeled.
- **Requires ERP inspection:** `[ERP PRICE OPERATION]`, whether the ERP expresses promotional/temporary pricing (which would map to `data-ownership.md`'s already-anticipated but unbuilt "optional valid-from/valid-to" price fields), `[ERP CURRENCY HANDLING]` if the ERP is multi-currency internally even though the storefront is EGP-only.
- **Business decision required:** whether "compare-at price" is even an ERP-sourced fact or a website/Promotions-module decision (ownership matrix §3 flags this as genuinely unclear either way).

## 5. Inventory

- **Confirmed from website:** the website needs a raw quantity per SKU/variant, pulled on the same schedule as products/prices. The website's own `InventoryReservation` mechanism (Phase 4, see the ownership matrix §5) is *not* something the ERP needs to know about or participate in — it's a purely website-local safety margin.
- **Requires ERP inspection:** `[ERP INVENTORY OPERATION]`, `[ERP INVENTORY GRANULARITY]` (per-warehouse? single pooled number?), and — the single most important open question from this phase's inventory review — **whether the ERP performs its own allocation/hold at order-push time**, and if so, how that interacts with the website's already-consumed reservation for the same order. This cannot be answered without inspecting the real ERP.
- **Business decision required:** none beyond what's already tracked (the 15-minute reservation TTL default, `commerce-completeness-audit.md` §5).

## 6. Customers

- **Confirmed from website:** website owns identity (phone-based, E.164); at order time, a reconcile-or-create operation is the only customer-related ERP interaction the approved architecture calls for (`blueprint.md` §9, ADR-006) — not continuous two-way sync.
- **Requires ERP inspection:** `[ERP CUSTOMER MATCH/CREATE OPERATION]`, `[ERP CUSTOMER IDENTIFIER]`, exact match semantics (phone only? phone + email? fuzzy?).
- **Business decision required:** none identified — the match-at-order-time model is already approved and this phase found no reason to revisit it.

## 7. Orders

- **Confirmed from website:** every field the push would need already exists on `Order`/`OrderItem` today (ownership matrix §4/§6) — order number, customer info, address snapshot, line items with SKU/qty/unit price/line total, discount, shipping fee, tax, total, currency, payment method + status. Pushed once, immediately on confirmed checkout (COD) or captured payment (online, not yet reachable), idempotent on the website's own order id.
- **Requires ERP inspection:** `[ERP ORDER CREATE OPERATION]`, the exact payload shape the ERP expects, whether it returns a reference synchronously or asynchronously.
- **Business decision required:** none beyond what's already tracked.

## 8. Order status

- **Confirmed from website:** the website needs a small, stable set of *customer-facing* stages to map any ERP status onto (`blueprint.md` §8: "preparing → out_for_delivery → delivered" is the *example* shape already in the approved docs, not confirmed final). The mapping table is explicitly required to live in the Orders module, "not in each Shipping adapter" (`technical-architecture.md` §6), so adding/changing the ERP's real vocabulary later never touches the storefront's display logic.
- **Requires ERP inspection:** `[ERP OPERATIONAL STATUS VOCABULARY]` — the real list of statuses the ERP actually reports, which this phase explicitly does not invent.
- **Business decision required:** none — the mapping-table pattern is already architecturally settled; only its *contents* await inspection.

## 9. Fulfillment

- **Confirmed from website:** `Order.erpPushStatus` already tracks the website's own push attempt (`NOT_PUSHED`/`PENDING`/`SUCCEEDED`/`FAILED`) — deliberately *not* the ERP's fulfillment stages themselves (ownership matrix §2/§4).
- **Requires ERP inspection:** everything about the real fulfillment vocabulary and whether it's pull- or webhook-delivered.
- **Business decision required:** none identified.

## 10. Shipping

- **Confirmed from website:** the website already has a real `ShippingProvider` interface + `ManualShippingAdapter` (zone → fee lookup), matching `blueprint.md` §11's adapter pattern. Whether a future courier integration happens *through* the ERP or as an independent Shipping Adapter is the one significant architectural fork this phase identified.
- **Requires ERP inspection:** `[ERP/COURIER RELATIONSHIP]` — does the ERP itself dispatch to a courier, or does the website need its own separate courier integration alongside the ERP one? Not assumable either way.
- **Business decision required:** the courier/provider itself remains an open business decision, unchanged from Phase 1.

## 11. Cancellation

- **Confirmed from website:** website-initiated cancellation is a real, working `Order.status = CANCELLED` transition today, ownership-checked, tested.
- **Requires ERP inspection:** `[ERP ORDER CANCEL OPERATION]` — whether the ERP needs an explicit call, or detects cancellation via the website simply not proceeding, or something else. **This is currently undefined in the approved architecture too** (`blueprint.md` doesn't specify it) — not just an ERP-inspection gap but a genuine design gap, flagged in the gap analysis.
- **Business decision required:** the cancellation *policy* itself (time window, who can cancel when) — Phase 1's open items, unchanged.

## 12. Returns / Refunds

- **Confirmed from website:** not modeled at all (Phase 1's New Finding #2). `Payment.status` has room for `REFUND_INITIATED`/`REFUND_COMPLETED` but no return/RMA workflow exists.
- **Requires ERP inspection:** entirely — whether returns are even an ERP concern or a separate operational process.
- **Business decision required:** the return/refund policy itself, unchanged from Phase 1, still open.

## 13. Errors

- **Confirmed from website:** the website already has a complete, consistent error-category model (`technical-architecture.md` §22) including an `erp_integration` category specifically reserved for this — "never surfaced as a checkout-blocking error to the customer... logged/alerted internally only." A future ERP Adapter's errors would map into this existing model, not invent a new one.
- **Requires ERP inspection:** `[ERP ERROR RESPONSE SHAPE]` — what a failure actually looks like on the wire.
- **Business decision required:** none.

## 14. Idempotency

- **Confirmed from website:** the website's `IdempotencyKey` ledger (Phase 4) already generalizes to this — `blueprint.md` §8/§9's rule that "the website order id is the idempotency key used when pushing to the ERP" was already the approved design before this phase, and the mechanism to satisfy it already exists and is tested for the order-creation case.
- **Requires ERP inspection:** whether the ERP itself *honors* an idempotency key on its create-order operation, or whether the website's adapter would need its own additional de-duplication logic on top.
- **Business decision required:** none.

## 15. Retries

- **Confirmed from website:** the approved pattern (`blueprint.md` §9, `technical-architecture.md` §4) — exponential backoff, capped attempts, dead-letter table, human alert — is fully specified and consistent with how the website already handles other failure modes (e.g. `IdempotencyConflictError` for a concurrent request). Nothing here needs to change.
- **Requires ERP inspection:** `[ERP RATE LIMITS]`, `[ERP TRANSIENT-VS-PERMANENT ERROR DISTINCTION]` — needed to correctly decide what's retry-eligible.
- **Business decision required:** none.

## 16. Webhooks

- **Confirmed from website:** the website's existing webhook-handling discipline (established for a future Payment provider, `technical-architecture.md` §5: "verifies the provider's signature before trusting the payload... itself idempotent") is the pattern any future ERP webhook would follow — no new pattern needs inventing.
- **Requires ERP inspection:** `[DOES THE ERP SUPPORT WEBHOOKS AT ALL]` — if not, everything falls back to scheduled polling, which the architecture already supports as the baseline (`blueprint.md` §9 lists polling as the primary mechanism, webhook as conditional).
- **Business decision required:** none.

## 17. Reconciliation

- **Confirmed from website:** the website already runs a directly analogous reconciliation pattern for Payments (`technical-architecture.md` §5: "a periodic job compares the Payments module's local state against the provider's queryable status for any payment stuck in a non-terminal state") — the same shape would apply to orders stuck in `erpPushStatus = PENDING` beyond a threshold.
- **Requires ERP inspection:** `[ERP STATUS QUERY OPERATION]` for a reconciliation poll to call.
- **Business decision required:** the reconciliation frequency/threshold — a tunable, not a business policy question.

---

## Required ERP capabilities — summary, by area

| Area | Capability | Status |
|---|---|---|
| Catalog | Product sync | CONFIRMED FROM WEBSITE (need), REQUIRES ERP INSPECTION (shape) |
| Catalog | Variant/SKU sync | Same |
| Catalog | Category sync | Same |
| Catalog | Price sync | Same |
| Catalog | Inventory sync | Same |
| Catalog | Availability/status sync | Same |
| Orders | Create/push order | CONFIRMED FROM WEBSITE (payload exists), REQUIRES ERP INSPECTION (operation shape) |
| Orders | Receive ERP order reference | Same |
| Orders | Receive status changes | Same |
| Orders | Cancellation sync | REQUIRES ERP INSPECTION + genuine architecture gap (not even specified in `blueprint.md`) |
| Orders | Fulfillment/shipping updates | REQUIRES ERP INSPECTION |
| Orders | Return/refund information | BUSINESS DECISION REQUIRED first (policy doesn't exist) — ERP inspection is secondary here |
| Customers | Create/update in ERP | CONFIRMED FROM WEBSITE (reconcile-at-order-time model already approved), REQUIRES ERP INSPECTION (exact operation) |
| Customers | ERP customer reference | Same |
| Inventory | Available quantity | CONFIRMED FROM WEBSITE |
| Inventory | Reservation implications | CONFIRMED FROM WEBSITE — no ERP-side change needed, per the ownership matrix §5 |
| Inventory | Post-order inventory updates | REQUIRES ERP INSPECTION |
| Inventory | Website/ERP concurrency | REQUIRES ERP INSPECTION — the single highest-value question to ask once the ERP is available |

---

## Outcome

Every section above is structured to be *directly answerable* once the real ERP is inspected — nothing here needs to be rewritten wholesale, only filled in. The bracketed placeholders are the complete list of what inspection needs to resolve. No endpoint name, field name, or identifier format was invented anywhere in this document.
