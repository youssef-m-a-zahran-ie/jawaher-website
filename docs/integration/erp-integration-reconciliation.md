# ERP Integration — Reconciliation Strategy

Phase 7. Design only — no job, table, or schedule is implemented.

Status: Phase 7. Last updated: 2026-09-11.

---

## 1. Why reconciliation is needed, beyond the regular sync/push flow

The regular scheduled pull (catalog/inventory) and the regular push (orders) are the primary mechanisms, but per `erp-integration-failure-recovery.md` §1.1, a Website-side crash or a lost response can leave state ambiguous in a way the primary flow alone won't self-heal — someone has to periodically ask "does what I believe match what's actually true," independent of whether the original operation's own retry ever runs again.

---

## 2. What is periodically compared

| Domain | Compared | Detection method | Frequency (recommended, not decided) |
|---|---|---|---|
| Catalog | Full product/variant set, ERP vs. Website projection | A full pull (not just incremental) compared against the current projection, row by row | Daily — matches the ERP's own precedent of a "daily" cron cadence for its heavier Shopify sync jobs (`cron/shopify-sync-daily`) |
| Prices | Same pass as catalog (price is a field on the same row) | Same | Same |
| Inventory | Aggregated available quantity, ERP vs. Website projection | Compare the last-synced projection value against a fresh read; flag any variant whose drift exceeds a small tolerance (exact tolerance is a build-phase tuning decision, not decided here) | More frequent than catalog — matches the ERP's own "hourly" cadence for its Shopify inventory-adjacent sync (`cron/shopify-sync-hourly`) as a starting point |
| Customers | `Customer.erpCustomerId` populated vs. null for every customer with at least one order | Any order with a resolved `erpCustomerId` on the order but a customer record still missing its own `erpCustomerId` indicates a partial/inconsistent reconcile — flag for review | Daily |
| Orders | Every `Order` with `erpPushStatus IN (PENDING, FAILED)` older than a threshold | Query by idempotency key against the ERP (§`erp-integration-failure-recovery.md` §1.1.2's required by-key lookup capability) — resolves ambiguous/lost-response cases even without a known `erpOrderReference` | Frequent — this is the highest-value reconciliation target, since it directly closes the "unknown outcome" gap; recommend running alongside the retry sweep itself (e.g. every 15 minutes, matching the ERP's own `shopify-retry-sweep` cadence) |
| Fulfillment | `Order.erpPushStatus = SUCCEEDED` orders whose last-known ERP status poll is older than a threshold | Re-poll `GET /orders/{ref}` for any order not yet in a terminal customer-facing stage | Matches the regular status-poll cadence — reconciliation here is really just "don't let a poll silently stop happening," not a separate comparison logic |

---

## 3. What triggers reconciliation

- **Scheduled** (primary mechanism): a periodic job, same infrastructure decision as the rest of the integration (recommended: GitHub Actions, per `erp-integration-failure-recovery.md` §3).
- **On dead-letter**: an order that exhausts its retry budget is immediately eligible for the next reconciliation pass, not just the next scheduled window — avoids waiting a full cycle for a known-stuck case.
- **Not customer-triggered**: reconciliation never runs synchronously inside a customer-facing request — matches the already-approved rule that nothing customer-facing blocks on ERP state.

---

## 4. How mismatches are detected and resolved

| Mismatch | Detection | Resolution |
|---|---|---|
| Catalog/price drift | Row-by-row diff against a fresh pull | Overwrite the projection with the fresh ERP value — ERP always wins, no merge logic, matches the already-approved rule |
| Inventory drift beyond tolerance | Threshold comparison | Overwrite the projection with the fresh value; no alert needed for ordinary drift (this is expected, eventual-consistency behavior) — only alert if the *sync itself* is failing repeatedly (a job-health signal, not a per-row mismatch) |
| Order stuck in `PENDING`/`FAILED` beyond threshold | By-idempotency-key lookup against the ERP | If found: record the returned `erpOrderReference`, mark `SUCCEEDED` — this is the normal "actually it did go through" resolution. If genuinely not found after a reasonable number of attempts: escalate to a human via the dead-letter alert — never auto-retry indefinitely without a cap |
| Customer without `erpCustomerId` despite having ERP-linked orders | Cross-reference query | Flag for human review — do not auto-create a second `BusinessPartner` guess; this is exactly the kind of ambiguity `SyncConflict`-style manual review exists for on the Shopify side, and the same posture applies here |
| Fulfillment status stale | Poll timestamp check | Re-poll; if the ERP itself is unreachable, treat as an ERP-outage case (`erp-integration-failure-recovery.md`), not a data mismatch |

---

## 5. Audit trail

Every reconciliation run logs: what was compared, how many mismatches found, how many auto-resolved vs. escalated, and duration — to the Website's structured logger (`src/lib/logger.ts`), with a summary written to the new dead-letter/sync-run-history table (`erp-integration-implementation-plan.md` §13) so a human reviewing integration health has one place to look, mirroring the ERP's own `ConnectorSyncRun.summary` (`{created, updated, skipped, failed, warnings[]}`) shape — a proven, directly reusable pattern, not a new invention.

---

## 6. Manual intervention

- Escalated mismatches (order genuinely not found after retries; customer-reconcile ambiguity) require a human to look at the dead-letter/sync-run-history record and decide — this plan does not propose an auto-resolution for genuinely ambiguous cases, consistent with the ERP's own `SyncConflict.manual_review` precedent.
- No admin UI for this is designed in this phase — out of scope; the dead-letter table's existence is sufficient for a human to query directly (e.g. via `prisma studio` or a simple future admin view) until real volume justifies building one.
