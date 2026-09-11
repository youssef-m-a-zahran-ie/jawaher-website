# ERP Integration — Failure Recovery, Idempotency, Retry/Queue, Observability

Phase 7. Covers §12 (order failure recovery), §17 (idempotency strategy), §18 (retry/queue strategy), and §24 (observability) of the brief. Nothing here is implemented.

Status: Phase 7. Last updated: 2026-09-11.

---

## 1. Order failure recovery — scenario by scenario

| Scenario | Detection | Recovery |
|---|---|---|
| ERP unavailable (connection refused/DNS/etc.) | Adapter call throws immediately | Dead-letter the push attempt, schedule a backoff retry; order stays valid Website-side, never customer-visible |
| Timeout (request sent, no response within the adapter's timeout) | Adapter timeout fires | **Ambiguous outcome — see §1.1**, never assumed to be a failure |
| Network failure mid-request | Same as timeout, from the Website's perspective | Same as timeout |
| ERP rejects the request (400/422) | Synchronous error response | Not retried blindly — a validation/business-rule error will fail identically on retry; dead-lettered with the specific error for human review, per the taxonomy in `erp-api-contracts.md` §5 |
| Duplicate request (Website retried, or a duplicate checkout slipped through) | The ERP's `ChannelMapping`-dedup returns the *existing* order's reference, not an error | Treated as success — the Website records the returned reference exactly as if it were the first successful call |
| ERP accepts the request but the response is lost (network drop after ERP committed) | Indistinguishable from a timeout at the Website — **this is exactly why idempotent retry, not raw retry, is mandatory** | Retry with the same idempotency key; the ERP's dedup returns the already-created order's reference; the Website now knows the true outcome |
| Website crashes after sending the request, before recording the outcome | On restart, the order's `erpPushStatus` is still `PENDING` (never got to `SUCCEEDED`) | The reconciliation job (`erp-integration-reconciliation.md`) or a retry with the same idempotency key resolves it — same mechanism as the lost-response case |
| Payment succeeds before an ERP order exists | Normal, expected sequencing for COD (order created before any push) and for online payment (capture happens before push, by design — §`erp-integration-implementation-plan.md` §6) | Not a failure case — this is the designed order. If the *subsequent* push then fails, it falls into the scenarios above; the payment itself is never rolled back for an ERP-push failure |
| ERP order exists but the Website does not know | The lost-response / crash-after-send cases above, generalized | Same resolution: idempotent retry or reconciliation poll — never a second, uncoordinated push |

### 1.1 Ambiguous outcomes — the core design principle

**The system never guesses.** A timeout or lost response means "unknown," not "failed." The only two ways an unknown outcome is resolved:
1. **Idempotent retry** — safe by construction, because the ERP's own `ChannelMapping`-dedup (reused from the proven Shopify-import pattern) makes a retried create-with-the-same-key either create the order (if it truly never landed) or return the existing one (if it did) — never a duplicate.
2. **Reconciliation poll** — if retries are exhausted or paused, a periodic job queries `GET /orders/{ref}` — but since the Website may not yet *have* a `ref` for an unknown-outcome order, the reconciliation job must also support a lookup by the Website's own idempotency key, not only by ERP reference. **This is a required capability of the reconciliation design**, not optional — see `erp-integration-reconciliation.md`.

**Client retries alone are not relied upon** — the reconciliation job (§1.1.2) exists specifically because a client (the Website's own background job) can itself crash, be redeployed, or have its retry queue lost, and the system must still be able to detect and resolve a stuck `PENDING` push independently of whether the original retry loop ever runs again.

---

## 2. Idempotency strategy

| Operation | Idempotency key | Scope | Persistence | TTL | Duplicate behavior |
|---|---|---|---|---|---|
| Product/catalog sync (read) | N/A — reads have no idempotency concern | — | — | — | — |
| Inventory read | N/A | — | — | — | — |
| Customer reconcile | `phoneE164` (the natural match key) | Per company | ERP: `BusinessPartner.phone` (existing column, queried); Website: nothing new needed, the call is naturally re-runnable | N/A (not TTL'd — a phone number is a durable key) | Returns the same `erpCustomerId` on every call with the same phone, per §`erp-api-contracts.md` §2.1 |
| Order creation | Website `Order.id` (already the existing idempotency-key convention, `blueprint.md` §8/§9) | Per company, per `SalesChannel="website"` | ERP: new `ChannelMapping(salesChannelId, internalEntityType="sales_order", externalId=orderId)` row, `@@unique` enforced — reused table, not a new one. Website: existing `IdempotencyKey` ledger | Not TTL'd on the ERP side (an order's identity is permanent); Website's own `IdempotencyKey` TTL policy (already decided in an earlier phase) applies unchanged | A retried create with the same key returns the existing order's reference, never creates a second `SalesOrder` |
| Status updates (read/poll) | N/A | — | — | — | — |
| Cancellation | ERP order reference (already resolved by this point) | Per order | Reuses the existing CAS (`updateMany` with expected prior status) pattern — cancelling an already-cancelled order is a no-op success | N/A | Idempotent no-op on repeat |
| Webhooks | Not proposed for this integration's MVP (§`erp-api-contracts.md` §4 — no push direction from ERP to Website is designed yet); if ever added, would reuse the ERP's own proven `WebhookReceipt(connectorKey, webhookId)` dedup pattern unchanged |
| Retries (general) | Always the *same* key as the original attempt — a retry must never mint a new idempotency key, or the entire mechanism is defeated | — | — | — | — |

**Where idempotency physically lives**: the *check* lives on the ERP side (it's the only party that can authoritatively say "this already exists") via the reused `ChannelMapping` unique constraint; the *key* is generated and owned by the Website (its own order id), matching the already-approved design (`blueprint.md` §8: "the website order id is the idempotency key used when pushing to the ERP").

---

## 3. Retry / queue strategy

Per the brief's explicit instruction: **do not introduce Redis or a queue merely because it is fashionable.** The Website's own architecture already states background jobs are deferred until "the ERP Integration phase" specifically — that phase is now. The question is what's actually needed, not what's available.

| Need | MVP requirement | Justification |
|---|---|---|
| Synchronous calls acceptable? | No, for the order push — it must not block the checkout response (confirmed already-designed behavior: order commits before any ERP call) | Correctness/latency separation, already established |
| Background job execution | **Yes, required** — something must execute the push *after* the checkout request has already returned to the customer | This is the minimum viable async mechanism, not a queue product |
| A dedicated queue product (Redis-backed, etc.) | **Not required for MVP** | The volume at this business's current scale (per `erp-discovery.md` §8: 5 categories, ~50 SKUs today, one channel) does not justify it. The ERP itself runs its own background-job system as a **DB-backed job table** (`BackgroundJob` model, `scripts/process-jobs-once.ts`) — not Redis, not a third-party queue — and this is a directly applicable, already-working precedent at comparable scale |
| Retry worker | **Yes, required**, but as a simple scheduled sweep, not a persistent worker process | Mirrors the ERP's own `shopify-retry-sweep` cron pattern exactly — a periodic job that queries "what's due for retry" and fans out, not a long-running queue consumer |
| Dead-letter mechanism | **Yes, required** — a table recording pushes that exhausted retries, for human review/alert | Already flagged as a genuine, small gap in Phase 5/6 (`erp-integration-gap-analysis.md`); this is new but deliberately minimal — one new table, not new infrastructure |
| Scheduler | **Yes, required**, mechanism TBD by business/infra decision — **recommended: GitHub Actions on a schedule**, directly informed by the ERP's own real-incident history (moved off Vercel Cron after a 2026-08-19 retry-storm incident, `erp-shopify-integration-analysis.md` §2) | Reuses a proven answer from the sibling codebase rather than re-deriving one |

**Conclusion**: MVP needs a scheduled job runner (cron-triggered HTTP endpoint, matching the Website's own existing internal-endpoint-behind-a-shared-secret pattern, `/api/v1/internal/inventory/sweep-expired-reservations`) plus one new dead-letter table. It does not need Redis, a message broker, or a persistent worker process. This can be revisited later purely as a scale decision, if/when order volume grows enough to matter — not before.

---

## 4. Observability plan

| Field | Where it's captured | Notes |
|---|---|---|
| Request/correlation id | Website: `src/lib/request-id.ts` (existing) propagated into every ERP call, per `technical-architecture.md` §21's already-approved rule. ERP: echoed back in every response (per `erp-api-contracts.md` §0), logged to `AppLog` alongside the request | Joins a Website log line to an ERP log line for the same call |
| ERP reference | `Order.erpOrderReference` (Website), `SalesOrder.id` (ERP) | Populated once a push succeeds |
| Website reference | `Order.id`/idempotency key | Already exists |
| Operation | e.g. `push_order`, `reconcile_customer`, `sync_catalog`, `poll_status`, `cancel_order` | New, small enum on the Website side |
| Latency | Captured by the existing structured-logging pattern (`src/lib/logger.ts` already records duration for other operations — extended, not reinvented) | |
| Success/failure | Standard log field | |
| Error category | Existing `erp_integration` category (`technical-architecture.md` §22) — reused unchanged | Never surfaced as checkout-blocking |
| Retry count | New field, attached to the dead-letter/sync-run-history table (§3) | |
| Reconciliation status | New field — see `erp-integration-reconciliation.md` | |

**PII masking**: the Website's existing logger redaction list (`src/lib/logger.ts`, already covers phone/address generically) is extended to cover whatever the new ERP payloads/responses actually contain, once their real shapes are finalized during the build phase — cannot be fully specified before that, flagged as a build-phase checklist item, not a design gap.

**Logs vs. audit records vs. database — where each thing belongs**:
- **Database** (`Order.erpOrderReference`, `erpPushStatus`, `pushedToErpAt`, and the new dead-letter table): the durable record of *what state each order's ERP sync is in* — queried by the reconciliation job and any future admin UI.
- **Audit records** (Website's existing `AuditLog`; ERP's existing `AuditLog`/`ActivityTimeline`): a human-readable record of *what happened to a specific business entity* — a customer created, an order pushed, a cancellation processed. Tenant-data-scoped, compliance-relevant.
- **Logs** (`src/lib/logger.ts`; ERP's `AppLog`): the technical/operational trace — every attempt, every latency measurement, every retry — high-volume, not tenant-data, not meant for a business user to read directly. Matches the ERP's own existing three-way separation (`AuditLog`/`AppLog`/`ActivityTimeline`) exactly, and the Website should adopt the same discipline for its own new logging rather than conflating an audit entry with a debug log line.
