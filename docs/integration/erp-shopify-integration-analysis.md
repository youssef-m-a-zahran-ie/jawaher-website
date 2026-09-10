# ERP Shopify Integration — Lessons for the Website Integration

Phase 6. The ERP's existing Shopify connector is real, working, and the single best source of proven patterns for a future website integration. This document extracts what to reuse and what not to, based only on what was directly observed in the code — not speculation.

Status: Phase 6. Last updated: 2026-09-10.

---

## 1. Where it lives

`src/modules/integrations/{services,sync-engine,repositories}/`, the shared connector runtime in `src/modules/connectors/` (also used by an unrelated Google Sheets connector), `src/app/api/v1/webhooks/[connector]/route.ts`, and `src/app/api/v1/cron/shopify-*`.

---

## 2. Reusable patterns

- **`ChannelMapping(salesChannelId, internalEntityType, externalId)` as a universal identity/idempotency primitive.** One generic table serves product, customer, order, and fulfillment identity linkage at once, enforced by a single `@@unique` constraint. This is the single most reusable piece of infrastructure in the codebase and should be the mechanism a "website" channel uses too — not a new invention.
- **The idempotent-import pattern**: pre-check for an existing mapping → open a transaction → re-check inside the transaction → catch a unique-constraint violation (P2002) and recover as a dedup rather than an error. This closes real races that a naive "check then insert" misses under at-least-once delivery — proven by two cited real incident numbers (#1182/#1183) in the code's own comments, not a theoretical concern.
- **Non-destructive customer matching with a logged warning**: matching an incoming customer by email and *updating* the existing party rather than creating a duplicate, with an explicit warning recorded either way — avoids both duplicate-record accumulation and silent data loss.
- **Webhook-route ordering discipline**: verify the signature *before* touching the rate-limit budget or any DB lookup keyed on public/attacker-controlled data (the shop domain) — a real, disclosed 2026-08 audit finding, not a defensive-programming guess.
- **"ERP remains source of truth; compare-and-log rather than auto-overwrite" as the default policy** for anything touching a live internal workflow (payment, fulfillment, inventory) — with auto-apply reserved only for genuinely descriptive, duplicate-safe fields (product/customer master data). The one disclosed, narrow exception (`externalTotalPrice` auto-correction, added after a measured 19-order revenue-reconciliation drift) shows how to widen that policy deliberately and safely when there's a real, quantified cost to not doing so — not by default.
- **Audit/activity logging at every transition** (`recordActivity`/`recordAuditLog`) — a new integration gets a ready-made timeline for free by following the same convention.
- **Compare-and-swap status transitions** (`updateOrderStatus(..., expectedCurrentStatus)`) guard every mutation against double-click/concurrent-webhook races — cheap and worth copying verbatim.
- **The scheduler decision itself**: the ERP moved its own cron jobs from Vercel Cron to GitHub Actions after a disclosed **2026-08-19 retry-storm incident**. The Website's own Phase 5 gap analysis flagged "which scheduler mechanism" as an open, unresolved decision (`erp-integration-gap-analysis.md`) — this is a directly transferable, real-incident-informed answer: prefer GitHub Actions on a schedule over a platform cron product, for the same reasons that already burned this codebase once.

---

## 3. What NOT to copy

- **The inconsistent dual auth pattern.** Shopify uses a client-credentials-grant token mint (not classic OAuth-authorization-code); the Google Sheets connector uses OAuth-authorization-code; both are bolted onto the same `IntegrationSecret`/connector-runtime scaffolding. A new website integration should pick one deliberately, not inherit this split — see `erp-integration-architecture.md` for the recommendation.
- **The permanent cancel/un-cancel asymmetry.** `cancelOrder()`/`rejectOrder()` push a cancellation to Shopify, but there is no symmetric "un-cancel" push — the code's own comment states Shopify's API has no such mutation. `revertCancelOrder()` only reopens the order ERP-side, silently diverging from Shopify's own state. A new integration's cancel/reopen semantics must be checked for the same asymmetry before go-live, not discovered after.
- **Refunds handled by "log and hope a human notices."** `handleRefundCreated` does nothing but warn. Don't treat this as evidence that leaving money-movement unhandled is an acceptable pattern to reuse for a channel where refunds might be more central than they are for Shopify today.
- **Reserved-but-unwired status enum values.** `qc` and `failed_delivery` sit in `primaryStatus`'s allowed values and even appear in some queue-filter arrays, with zero actual transition logic — a real, confirmed source of confusion (the ERP's own diagram documents them as live). A new integration should not add "for future use" status values to a shared enum without either wiring them immediately or leaving them out until they are.
- **Bare cross-module id references with no DB-level referential integrity.** `SalesOrder.customerId` and similar ids are deliberately plain strings, not Prisma relations (a module-boundary choice, consistent within this codebase's own conventions) — but it means anything writing to these tables must replicate the application-level existence checks by hand; there is no foreign-key safety net to lean on.

---

## 4. One structural inconsistency worth naming explicitly

Two connectors (Shopify, Google Sheets) already exist on this platform and already use two different auth flows on the same underlying secret-storage table. This is not itself a blocker for a website integration, but it means "follow the existing pattern" is ambiguous — there are two existing patterns. `erp-integration-architecture.md` recommends which one to follow and why, rather than treating the ERP's own precedent as self-evidently singular.
