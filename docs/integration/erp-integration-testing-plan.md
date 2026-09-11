# ERP Integration — Testing Plan

Phase 7. Tests defined before implementation, per the brief. Nothing here is implemented — this is the test *plan*, not test code.

Status: Phase 7. Last updated: 2026-09-11.

---

## 1. Unit tests

| Area | What's tested |
|---|---|
| Mapping | ERP status enum → Website customer-facing stage (including that `qc`/`failed_delivery` are never mapped, and produce a defined fallback/alert if ever received, since they're supposed to be unreachable); price `Decimal`→integer-minor-units conversion and rounding; category-tree-to-Website-shape mapping (once the flat-vs-hierarchical decision is made) |
| Validation | Every new Zod schema on both the Website adapter (outbound) and the ERP route (inbound) — malformed SKU, negative quantity/price, invalid phone, missing required address fields |
| State transitions | `Order.erpPushStatus` transitions (`NOT_PUSHED→PENDING→SUCCEEDED/FAILED`); the dead-letter table's retry-count increment logic |
| Idempotency | The ERP-side `ChannelMapping` dedup logic in isolation (pre-check → transactional re-check → catch-P2002 recovery) — mirrors the existing test coverage pattern already used for the Shopify import path, applied to the new "website" channel |

## 2. Integration tests

| Area | What's tested |
|---|---|
| Website ↔ ERP API | Each new endpoint (`erp-api-contracts.md`) tested against a real (test/sandbox) ERP company — not a mock — for at least one success and one of each documented error path |
| Database transactions | The new order-create transaction (customer resolve → warehouse resolve → `SalesOrder`+lines → optional auto-confirm) commits or rolls back atomically — no partial order ever visible |
| Inventory | `StockReservation` is created exactly when the confirm-gate decision says it should be (immediately, if auto-confirm; only after moderation, if queued) — a direct test of `erp-inventory-analysis.md`'s traced behavior, now exercised against the new entry point rather than only the Shopify path |
| Order creation | Full path from a Website-side confirmed checkout through to a real `SalesOrder` existing in the ERP test company, with correct line items, customer link, and warehouse |

## 3. Contract tests

- Request/response shape compatibility for every operation in `erp-api-contracts.md`, run against either a real ERP sandbox/staging company or a set of recorded fixtures — matching the already-approved Website testing principle (`technical-architecture.md` §24: "contract tests against a sandbox or recorded fixtures") applied to the ERP boundary specifically, not just payment/shipping providers.
- A contract-test failure should be treated as a real integration break, not a flaky test — since the ERP's own schema/enum values are the ground truth this integration depends on (e.g., if `primaryStatus`'s real values ever change, the contract test should fail loudly, not be silently tolerant).

## 4. End-to-end tests

| Flow | Coverage |
|---|---|
| Browse → cart → checkout → COD | Full customer journey, ending in a confirmed Website order and (once pushed) a real ERP `SalesOrder` |
| Browse → cart → checkout → online payment | Same, once an online payment provider exists (deferred — see `erp-integration-implementation-plan.md` §12 item 4); do not write this test before the provider is chosen |
| ERP order creation | Verify the pushed order's fields match the source Website order exactly (no silent truncation/rounding drift) |
| Inventory | A purchase that should (per the projected quantity) succeed, does; one that shouldn't, is blocked by the Website's own reservation gate — independent of ERP behavior, confirming the two layers don't interfere with each other |
| Fulfillment | A status change made on the ERP side (e.g. via the ERP's own UI, simulating an operator) is correctly reflected in the Website's next poll, mapped to the right customer-facing stage |

## 5. Failure tests

| Test | Expected result |
|---|---|
| Timeout | Order push retried with the same idempotency key; no duplicate `SalesOrder` created; eventually resolves to `SUCCEEDED` |
| Duplicate request | Two concurrent pushes with the same idempotency key resolve to exactly one `SalesOrder` — direct test of the `ChannelMapping` unique-constraint race, mirroring the existing Shopify-import concurrency test's shape |
| ERP unavailable | Order stays valid Website-side; push dead-lettered; customer sees no error at any point in the checkout flow |
| Partial failure | Simulate the ERP transaction failing partway through (e.g. customer resolves but `SalesOrder` creation fails) — confirm the whole transaction rolls back, no orphaned `BusinessPartner`-only-no-order state (only relevant if customer-reconcile and order-create are *not* combined into one transaction — depends on the final build-phase transaction boundary choice, flagged here as a test that must exist regardless of which boundary is chosen) |
| Ambiguous response (response lost after ERP commit) | Simulated by killing the connection after the ERP-side transaction commits but before the response is sent; confirm the Website's retry resolves via dedup, not a duplicate |
| Reservation expiry | Confirm this scenario is genuinely unreachable in the designed sequence (§`erp-integration-implementation-plan.md` §4.5, case 4) — the test should assert the reservation is always already `CONSUMED` by the time any ERP call could occur, not just assume it |

## 6. Concurrency tests

| Test | Expected result |
|---|---|
| Overselling | N simultaneous checkout attempts against a Website-projected quantity of M (N > M) — exactly M succeed, matching the already-verified Website-side behavior (`tests/integration/inventory-concurrency.test.ts`, 10 attempts/3 units → exactly 3 succeed); this integration must not weaken that guarantee |
| Simultaneous checkout across channels | A Website order and a (simulated) Shopify order for the last unit of the same SKU, submitted concurrently — confirm the ERP's own existing `StockReservation`/oversell behavior governs the outcome (it may allow both to succeed, per its own `allowOversell: true` design — the test's purpose is to **confirm this known, accepted ERP behavior**, not to assert a guarantee the ERP doesn't actually provide) |

## 7. Reconciliation tests

| Test | Expected result |
|---|---|
| Mismatched inventory | Projection intentionally made stale (skip a sync cycle); confirm the next reconciliation run detects and corrects the drift, and that no false "out of stock" or false "in stock" was shown to a customer during the gap beyond the already-accepted staleness window |
| Mismatched order status | An order's real ERP status changes without the Website's poll having run yet; confirm the reconciliation job (not just the regular poll) eventually catches it |
| Missing references | An order stuck in `erpPushStatus = PENDING` with no `erpOrderReference` (simulating a lost-response scenario, §`erp-integration-failure-recovery.md` §1.1) — confirm the reconciliation job's by-idempotency-key lookup (not just by-reference lookup) resolves it |

## 8. What is explicitly out of scope for MVP testing

- Load/performance testing beyond confirming no ERP call blocks checkout latency in the common case — deferred until real traffic volume justifies it, consistent with `erp-integration-implementation-plan.md` §11's position on caching/infrastructure.
- Returns/refunds test coverage — not modeled on either side yet (§`erp-integration-implementation-plan.md` §12), nothing to test.
- Online-payment-specific failure modes — deferred until a provider is chosen.
