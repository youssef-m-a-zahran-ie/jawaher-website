# ERP Integration — Final Gap Analysis & Verdict

Phase 6 — ERP Discovery & Website ↔ ERP Mapping. This is the conclusion document for Phase 6, built on the real ERP audit (`erp-discovery.md`, `erp-domain-map.md`, `erp-website-real-mapping.md`, `erp-inventory-analysis.md`, `erp-order-lifecycle-mapping.md`, `erp-shopify-integration-analysis.md`, `erp-integration-architecture.md`) and the real Website codebase/docs. Action legend: **A** must fix before integration begins · **B** implement during integration · **C** implement after integration · **D** business decision required · **E** ERP behavior clarification required · **F** later/out of scope.

Status: Phase 6. Last updated: 2026-09-10.

---

## 1. Gap table

| Area | Website state | ERP state | Gap | Severity | Action | Dependency |
|---|---|---|---|---|---|---|
| ERP inbound auth mechanism | N/A, not built | **Does not exist at all** for a non-Shopify caller — only session-cookie+RBAC (human) or Shopify-specific HMAC/client-credentials | A generic API-key verification path | **BLOCKER for any integration** | **A** (ERP-side, new work) | None — answerable without further inspection, see `erp-integration-architecture.md` §4 |
| ERP order-create entry point | `pushOrder()` not implemented, payload already ready (`Order`/`OrderItem`) | `createSalesOrder()` has exactly 3 call sites, all Shopify-specific — **no generalized/non-Shopify path exists** | The entry point itself, plus customer/variant/warehouse resolution generalized from Shopify's pattern | **BLOCKER** | **A/B** (ERP-side, new work; contingent on §"order confirm-gate" decision below) | Order confirm-gate decision (D, next row) |
| Order confirm-gate (moderation vs. auto-confirm) | N/A | `confirmOrder()` is gated behind a human moderator permission (`order.validate`) today; this is where `StockReservation` is created | Undecided whether website orders should auto-confirm or queue like Shopify orders — **directly determines the size of the inventory double-sell window** | **HIGH** | **D** | None — answerable today without more code reading |
| Inventory reservation vs. ERP allocation timing | Website reservation correctly scoped as local safety margin, independent of ERP (confirmed correct, no change needed) | ERP reserves only at `confirmOrder()`, releases only at `dispatchOrder()`; allows oversell/negative stock by design | A real, currently-unbounded window exists between "website order created/pushed" and "ERP stock actually committed" — was hypothetical in Phase 5, **confirmed real** this phase | **HIGH** | **E resolved, D pending** (see previous row) | Order confirm-gate decision |
| ERP outbound read API (products/prices/inventory/order status) | Needs a scheduled pull, payload TBD | No route exists; underlying queries (`getStockAvailability()` etc.) already compute the right shape | A new, low-risk read endpoint | MEDIUM | **B** (ERP-side, new work, low risk) | Auth mechanism (row 1) |
| `reconcileCustomer()` | Not implemented, design already approved (match phone/email, create-if-absent) | The only real match-or-create logic is Shopify-import-specific code, not a callable generic service | Must be generalized/rebuilt as a callable ERP capability | MEDIUM | **B** (ERP-side, new work) | Auth mechanism |
| Guest customer → ERP policy | Guest checkout fully supported, `customerId: null` | No guest concept — every synced customer becomes a permanent `BusinessPartner`, even with minimal data | Undecided whether guest web orders should create permanent ERP customer records | MEDIUM | **D** | None |
| Scheduler mechanism (Website's own sync/retry jobs) | None exists, not even for the already-built reservation sweep | ERP already answered this for itself: moved Vercel Cron → GitHub Actions after a real 2026-08-19 incident | Website should adopt the same answer | MEDIUM | **D**, but now backed by a real precedent (recommend GitHub Actions) | None |
| Cancellation → ERP command | Website-side cancel works; no ERP-communication design existed | `cancelOrder()`/`rejectOrder()` real, working, blocked once payment is allocated; **no un-cancel push exists even for Shopify** (permanent asymmetry) | A new acceptance path reusing `cancelOrder()`, plus surfacing the payment-lock rule to the Website before it offers a cancel button past that point | MEDIUM | **B** | ERP order-create entry point |
| Payment status from a future online-payment method | `Payment.status` model-agnostic, orthogonal to ERP by design (confirmed correct) | **Zero precedent for automated/gateway-driven payment status** — 100% manual (human records COD/InstaPay after delivery) | A new acceptance path in the order-create/update endpoint for payment info as an informational fact, not a live link | MEDIUM (LOW until online payment is actually built — Website currently has only a COD adapter) | **B/F** — defer until online payment is real | Online payment method (Website-side, unrelated to this phase) |
| Return / refund workflow | Not modeled at all (Phase 1 finding, still open) | Returns only pre-delivery; refunds unhandled beyond a log line | Both sides genuinely immature — everything is missing | — | **D** first, then **B**/**C** | Return/refund policy — joint business decision, not purely ERP-side |
| Tax policy | `ZeroTaxPolicy`, explicitly temporary | **No tax field found on `SalesOrder`/`SalesOrderLine` at all** — UNKNOWN whether folded into price or genuinely absent | Neither side has resolved this; ERP inspection alone could not answer it (real answer: still unknown, needs the ERP's business owner, not just its code) | — | **D and E together** (E did not fully resolve — escalate to a direct question for the ERP's business owner) | Business decision (is there a tax policy at all) |
| Category hierarchy / `erpCategoryId` | Flat `Category`, no ERP reference column | `ProductCategory` is a real self-referencing tree | Website needs a new column and a decision on flat-vs-hierarchical display | LOW | **B** | Category display decision (D) |
| Compare-at price ownership | Flagged uncertain in Phase 5 | **Resolved**: no compare-at/promotional price field exists anywhere on `ProductVariant` | None — classify as website-owned (1) | — | — (resolved, no action) | — |
| Product media ownership | Flagged uncertain in Phase 5 | **Resolved**: no dedicated image model exists on the ERP side either (`FileAsset`, generic `attachment` category only) | None architecturally — but a real content gap on both sides if real photography is needed | LOW (architecturally); a real content-ops question | **D** (who supplies/hosts product photography) | — |
| Barcode | Not modeled | Exists on `ProductVariant`, not unique-constrained | Add only if a real future requirement (POS/in-store) emerges | LOW | **F** | — |
| Shipping/courier relationship to ERP | Undecided in Phase 5 | **No Shipment/courier entity found anywhere in the schema** — likely own-delivery-rep model, not a 3PL API integration | Resolves the "significant architectural fork" — Website's own `ShippingProvider` can likely stay independent | LOW | **D** (confirm the inference, don't just assume it) | — |
| FEFO/lot-tracking enforcement | N/A — Website has no equivalent concept | **Specified in the ERP's schema/docs but not enforced in code** (dead feature — no caller uses lot-aware picking) | Not a Website-integration gap at all — an internal ERP data-quality/traceability risk, out of this phase's scope beyond flagging it | — | **F** (ERP's own backlog, not integration-blocking) | — |
| `qc`/`failed_delivery` dead status values | N/A | Reserved in the enum, referenced in some filters, never actually transitioned to | Website must not build a mapping for these — they will never actually be received | LOW | **B** (just exclude them from any status-mapping table) | — |
| Auth-flow inconsistency between existing connectors | N/A | Shopify: client-credentials-grant; Google Sheets: OAuth-authz-code — both on the same secret scaffolding | A new website connector should pick one deliberately (recommended: simple API key, see `erp-integration-architecture.md` §4) | LOW | **B** | — |
| Correlation/request-id propagation into a future ERP call | Already exists website-wide | N/A yet | Nothing missing architecturally — just needs to be used once the adapter exists | LOW | **B** | Auth mechanism |
| PII redaction for a future ERP payload | Logger redaction already covers phone/address generically | N/A yet | Cannot fully confirm until real payload shapes exist (§3, §3 of architecture doc) | LOW | **B** | New endpoints' real shapes |
| RLS `FORCE ROW LEVEL SECURITY` status | N/A — pre-existing ERP platform risk, unrelated to this integration | **Confirmed still unresolved** per the ERP's own `PRODUCTION_CHECKLIST.md` §G | Not created by this integration, but worth flagging since a new integration path adds one more caller relying on tenant isolation being real | LOW (for this integration specifically) | **F** — the ERP's own pre-existing backlog item, not newly introduced here | — |

**Zero items above are unresolvable BLOCKERs** — every BLOCKER-severity row has a clear, scoped path to being unblocked (build the auth path; build the order-create entry point; make the confirm-gate decision). This differs from Phase 5's finding of "zero BLOCKERs" in one important way: Phase 5 found zero blockers because it correctly predicted the Website side needed no redesign. This phase finds the **ERP side has two real BLOCKERs that must be built**, not just inspected — a materially different, larger scope than "fill in the placeholders."

---

## 2. Required changes, by category (Section 21)

**WEBSITE CHANGES** (already mostly known from Phase 5, essentially unchanged by this phase): build the `erp-integration` module skeleton/`ERPProvider` interface; implement `pushOrder`/`reconcileCustomer`/`getOrderStatus`/`getProducts`/`getPrices`/`getInventory`; build the sync job + pick a scheduler (recommend GitHub Actions, per the ERP's own precedent); build the dead-letter/sync-run-history table; add `Category.erpCategoryId`; build the customer-facing status-mapping table using the real ERP vocabulary in `erp-order-lifecycle-mapping.md` §1 (excluding dead `qc`/`failed_delivery` values).

**ERP CHANGES** (new — this phase's main finding): a new `IntegrationConnector`/`CompanyIntegrationConnection`/`IntegrationSecret` row set for a "website" connector; a new generic inbound API-key auth-verification path; a generalized order-create entry point (new `SalesChannel`, generalized customer/variant/warehouse resolution); a new outbound read endpoint (aggregated inventory/prices/product facts/order status); a new cancellation-acceptance path reusing `cancelOrder()`; (later) a new payment-status acceptance path once/if online payment exists.

**INTEGRATION LAYER**: the `ChannelMapping`-equivalent linking mechanism (reuse the ERP's existing table with a new channel, don't build a parallel one); idempotency (Website's `IdempotencyKey` ↔ ERP's `ChannelMapping` unique constraint — already symmetric in concept, needs wiring); retries (Website-side only for this direction); reconciliation polling job (Website-side, calling the new ERP read endpoint).

**BUSINESS DECISIONS**: order confirm-gate (auto-confirm vs. moderation queue); guest-customer ERP policy; tax policy (genuinely unresolved on both sides); returns/refund policy; product-media/photography ownership and sourcing; category flat-vs-hierarchical display; courier/shipping-relationship confirmation.

**INFRASTRUCTURE**: scheduler choice for the Website's own jobs (recommend GitHub Actions); nothing new required on the ERP's infrastructure beyond what a new API route/endpoint needs (no new deployment topology implied).

---

## 3. Final verdict

**1. Is the current Website architecture compatible with the actual ERP?**
Yes, at the design/pattern level — the adapter boundary, idempotency design, projection-vs-command split, "ERP always wins" rule, and order/payment snapshot discipline all hold up directly against the real ERP. But the ERP side is **not yet ready to be integrated with**: it has no general-purpose inbound API, no non-Shopify order-creation path, and a human-moderation gate on order confirmation. Compatible in design; not ready in implementation — and the ERP-side gap is larger than Phase 5's "requires ERP inspection" framing anticipated, because inspection revealed missing capability, not just an unknown shape.

**2. What is the biggest integration risk?**
Two, closely tied: (a) the ERP has no existing inbound surface for a non-Shopify caller at all — integration work starts by building ERP capability, not wiring to a contract; (b) the order-confirmation human-moderation gate creates a real, currently-unbounded window between "ERP accepted the order" and "ERP actually reserved stock," during which a double-sell against Shopify or another channel is possible. (a) is named as the single biggest risk because it blocks everything else, including ever observing whether (b) matters in practice.

**3. What is the exact inventory synchronization strategy to pursue?**
Keep the Website's local reservation exactly as already designed — confirmed correct, no change. Add a new ERP read endpoint that aggregates `StockQuant` across all locations/lots per variant into one number, floored at zero before it ever reaches the projection. Resolve the confirm-gate business decision (row above) to bound the double-sell window; until it's resolved, treat that window as real and unbounded, not theoretical.

**4. What is the exact order synchronization strategy to pursue?**
One-way push (Website → ERP) on confirmed checkout, idempotent via a new `ChannelMapping("website")` entry — directly reusing the mechanism already proven for Shopify. Status pulled back via a new small read endpoint on a schedule (webhooks optional/future, since the ERP has no evidence of webhook-*sending* capability toward external systems, only receiving). Cancellation reuses the real `cancelOrder()` service, subject to the same payment-lock rule. Returns/refunds explicitly deferred pending a joint business decision.

**5. What must change in the Website?**
See §2, "WEBSITE CHANGES" — essentially the already-known Phase 5 list, now informed by real ERP field names/status vocabulary/entity shapes instead of placeholders.

**6. What must change in the ERP?**
See §2, "ERP CHANGES" — this is new, substantial, and was not anticipated in this shape by Phase 5: a generic inbound auth path and a generalized order-create entry point are genuinely new capabilities, not configuration or a mapping exercise.

**7. What requires a business decision?**
Order confirm-gate (auto-confirm vs. moderation); guest-customer ERP policy; tax/e-invoicing policy (unresolved on both sides, not just "needs ERP inspection"); returns/refund policy; product-media/photography sourcing; category display model; courier/shipping-relationship confirmation; scheduler choice (though now backed by a strong ERP-side precedent).

**8. What can be implemented immediately in the next phase?**
On the Website side, independent of any ERP work: the `erp-integration` module skeleton, the scheduler decision + mechanism, the dead-letter/sync-history table shape. On the ERP side, the lowest-risk, most clearly-scoped first piece: the new `IntegrationConnector`/`CompanyIntegrationConnection`/`IntegrationSecret` rows for "website" plus the new API-key auth-verification path — pure infrastructure, directly modeled on the already-working Shopify pattern, no business-logic risk.

**9. What must NOT be implemented yet?**
Anything gated on an unresolved business decision above (especially the confirm-gate decision, since it changes the shape of the order-create entry point itself); the real `pushOrder()`/`reconcileCustomer()`/order-create business logic (building it before the confirm-gate and guest-customer decisions are made would encode an undecided policy as false authority — precisely the caution the ERP's own Business Discovery document already gave about its Partner Equity module, and it applies equally here); any real online-payment-to-ERP acceptance path (no online payment method exists on the Website yet either); any return/refund design (policy doesn't exist on either side).

---

## 4. What changed, and what didn't, since Phase 5

Every seam Phase 5 said was already correctly shaped — it still is. The correction this phase makes is narrower but real: Phase 5's framing consistently assumed the ERP already *had* operations (order-create, customer-reconcile, an inbound auth mechanism) whose *shape* merely needed inspecting. For every one of those, inspection found the operation does not exist for a non-Shopify caller at all. This changes several gap-analysis severities from Phase 5's implicit "LOW, just need to look" to this phase's explicit **BLOCKER/HIGH** — not because the Website's architecture is wrong, but because the ERP side of the boundary needs to be built, not just addressed.
