# ERP Integration — API Surface & Proposed Contracts

Phase 7. Phase 6 confirmed the ERP has **no existing public API surface for a non-Shopify caller** (`erp-discovery.md` §6). Everything in this document is therefore genuinely new — every operation below is a **PROPOSED CONTRACT**, not a description of something that exists. Field names use the real ERP model/field names where Phase 6 established them (e.g. `SalesOrder.primaryStatus`, `ProductVariant.sku`); anything without a confirmed ERP counterpart is marked `[PROPOSED]`. Nothing here is implemented.

Status: Phase 7. Last updated: 2026-09-11.

---

## 0. Conventions used throughout

- All new ERP-side routes live under a new `src/app/api/v1/integrations/website/*` prefix (ERP repo), following the existing `/api/v1/webhooks/[connector]` precedent's location, not the admin-export routes' location.
- Every request carries a correlation/request id (Website's existing `src/lib/request-id.ts` mechanism, propagated through per `technical-architecture.md` §21's already-approved rule).
- Every mutating request carries an idempotency key (Website order id, or a generated key for non-order operations) — see `erp-integration-failure-recovery.md` for the full idempotency design.
- Auth: every request carries the new API-key credential — see `erp-integration-security-plan.md`.
- Every response includes: success/failure, the ERP entity reference (when applicable), a status, an error code (on failure), and the echoed correlation id.

---

## 1. Catalog operations

### 1.1 `GET /api/v1/integrations/website/products` [PROPOSED]

| | |
|---|---|
| Purpose | Pull product/variant/category/price facts for the projection sync |
| Direction | ERP → Website (read) |
| Caller | Website's scheduled sync job, via the `erp-integration` adapter |
| Auth | New API-key path (see security plan) |
| Authorization | Scoped to the calling credential's one `Company`, via `getSystemTenantContext()` |
| Input | `since` (optional watermark, ISO 8601 or the ERP's own cursor format via `ConnectorSyncCursor`), `cursor`/`limit` (pagination — required, since a full pull at scale must not be one unbounded response) |
| Output | Array of `{ productId, variantId, sku, name, categoryId, categoryPath[], brandId?, status (draft|active|discontinued|archived), sellingPrice, currency, barcode? }` — every field is a real ERP field per `erp-domain-map.md`; there is deliberately **no** `compareAtPrice` or `media` field, since Phase 6 confirmed neither exists on the ERP side |
| Validation | Query params validated (Zod, matching the ERP's existing convention); `draft` status rows excluded server-side, never filtered client-side |
| Idempotency | Not applicable — a read has no side effect |
| Transaction boundary | Single read query (or a small number of paginated reads); no write, no transaction needed |
| Error behavior | 401 (bad/missing key), 403 (key valid but not authorized for requested scope — not expected to occur given one-key-one-company, included for completeness), 400 (bad `since`/pagination params), 500 (unexpected) |
| Retry behavior | Safe to retry unconditionally (pure read) |
| Audit requirement | Log the pull (company, row count, duration) to `AppLog` — not `AuditLog` (this is an operational/technical event, not a tenant-data mutation, per the ERP's own three-log convention) |

### 1.2 `GET /api/v1/integrations/website/inventory` [PROPOSED]

| | |
|---|---|
| Purpose | Pull aggregated, floored-at-zero available stock per variant |
| Direction | ERP → Website (read) |
| Caller | Same sync job as §1.1, likely combined into the same call or a sibling call on the same schedule |
| Auth/Authorization | Same as §1.1 |
| Input | `variantIds[]` or `since` watermark (same pagination requirement) |
| Output | Array of `{ variantId, sku, availableQuantity }` where `availableQuantity = max(0, Σ(onHandQuantity − reservedQuantity) across all locations/lots)` — the floor-at-zero and cross-location sum are **new logic**, not an existing ERP query exposed as-is |
| Validation | Same pattern as §1.1 |
| Idempotency | Not applicable (read) |
| Transaction boundary | Read-only; must read `StockQuant` at a consistent point in time per response (a single query, not N sequential queries that could see different snapshots) |
| Error behavior | Same as §1.1 |
| Retry behavior | Safe to retry unconditionally |
| Audit requirement | `AppLog`, same as §1.1 |

---

## 2. Customer operations

### 2.1 `POST /api/v1/integrations/website/customers/reconcile` [PROPOSED]

| | |
|---|---|
| Purpose | Match-or-create a `BusinessPartner`/`CustomerProfile`, generalized from the ERP's existing Shopify-specific `resolveShopifyCustomer()` pattern |
| Direction | Website → ERP (command) |
| Caller | Website's `erp-integration` adapter, at order-push time only (never on signup/OTP) |
| Auth/Authorization | Same API-key path, scoped to the one `Company` |
| Input | `{ phoneE164, name?, email? }` — phone is the required match key (Website's primary identity); email optional, since the ERP's own precedent matches on email but the Website's primary identity is phone |
| Output | `{ erpCustomerId, matched: boolean }` — `matched: true` if an existing `BusinessPartner` was found and (non-destructively) updated, `false` if newly created — mirrors the existing Shopify path's own distinction |
| Validation | Phone must be valid E.164 (already validated Website-side before the call); reject malformed input with 400 |
| Idempotency | Naturally idempotent by design (match-then-create), **provided** the generalized ERP-side logic replicates the existing non-destructive-merge behavior — this is a hard requirement on the new implementation, not automatic |
| Transaction boundary | Single transaction: match query → create-or-update, same shape as the existing Shopify customer-sync transaction |
| Error behavior | 400 (invalid phone), 409 (an ambiguous multi-match — e.g. two existing partners with conflicting data — should surface as a conflict for a human to review, mirroring `SyncConflict`'s existing role, rather than silently picking one) |
| Retry behavior | Safe to retry — same input should resolve to the same `erpCustomerId` |
| Audit requirement | `AuditLog` (a tenant-data create/update) + `ActivityTimeline` entry, matching the existing Shopify customer-sync convention |

---

## 3. Order operations

### 3.1 `POST /api/v1/integrations/website/orders` [PROPOSED]

| | |
|---|---|
| Purpose | Create a new `SalesOrder` from a confirmed Website order — the generalized counterpart to the Shopify-only `createSalesOrder()` call today |
| Direction | Website → ERP (command) |
| Caller | Website's `erp-integration` adapter, immediately after checkout confirmation (COD) or payment capture (online) |
| Auth/Authorization | Same API-key path |
| Input | `{ idempotencyKey (= website order id), erpCustomerId (from §2.1), items: [{ sku, quantity, unitPriceMinor }], addressSnapshot, discountAmountMinor?, taxAmountMinor?, shippingFeeMinor?, paymentMethod, paymentStatus, currency }` — every field maps to a real ERP field per `erp-order-lifecycle-mapping.md` §3; there is deliberately no field asking the ERP to *compute* price/discount/tax — those arrive as an immutable snapshot, matching both systems' existing discipline |
| Output | `{ erpOrderReference, primaryStatus, paymentStatus }` — `primaryStatus` will be `pending_validation` or `confirmed` depending on the confirm-gate business decision (`erp-integration-implementation-plan.md` §4.3/§12 item 1) |
| Validation | SKU existence, quantity > 0, price fields non-negative, address completeness — matching the ERP's existing Zod-validation convention at the Server Action boundary, applied here at the route boundary instead |
| Idempotency | **Hard requirement**: keyed on `idempotencyKey` via a new `ChannelMapping(salesChannelId="website", internalEntityType="sales_order", externalId=idempotencyKey)` row, using the exact pre-check → transactional re-check → catch-P2002-and-recover pattern already proven in `importShopifyOrder()` |
| Transaction boundary | One transaction: customer resolution (if not already done via §2.1) → warehouse resolution → `SalesOrder`+`SalesOrderLine[]` creation → (if auto-confirm decided) `confirmOrder()`'s own reservation/invoice logic, all inside the same boundary the existing Shopify import already uses |
| Error behavior | 400 (validation), 409 (idempotency conflict — should return the *existing* order's reference, not an error, per the dedup pattern), 422 (business-rule violation, e.g. no active warehouse resolvable — mirrors the existing `resolveDefaultWarehouse()` failure mode), 503 (ERP-side transient failure) |
| Retry behavior | Safe to retry with the same idempotency key; unsafe/meaningless to retry with a new key for the same logical order (would create a duplicate — the Website's own retry logic must always reuse the original key) |
| Audit requirement | `AuditLog` + `ActivityTimeline`, matching the existing order-creation convention |

### 3.2 `GET /api/v1/integrations/website/orders/{erpOrderReference}` [PROPOSED]

| | |
|---|---|
| Purpose | Poll current status — the `getOrderStatus()` operation the Website's `ERPProvider` interface already names |
| Direction | ERP → Website (read), pulled by the Website |
| Caller | Website's reconciliation/status-poll job |
| Auth/Authorization | Same API-key path |
| Input | Path param `erpOrderReference` |
| Output | `{ primaryStatus, subStatus?, paymentStatus, cancelledAt? }` — the real ERP enum values, verbatim (excluding dead `qc`/`failed_delivery` values, which will simply never appear) |
| Validation | 404 if the reference doesn't resolve to an order owned by the calling company |
| Idempotency | Not applicable (read) |
| Error behavior | 404, 401, 500 |
| Retry behavior | Safe to retry unconditionally |
| Audit requirement | Not required (a read of already-audited state) |

### 3.3 `POST /api/v1/integrations/website/orders/{erpOrderReference}/cancel` [PROPOSED]

| | |
|---|---|
| Purpose | Reuse the ERP's existing `cancelOrder()` service function, triggered by a Website-initiated cancellation |
| Direction | Website → ERP (command) |
| Caller | Website's `erp-integration` adapter, on `ordersService.cancelOrder()` |
| Auth/Authorization | Same API-key path |
| Input | `{ reason }` |
| Output | `{ primaryStatus: "cancelled" }` or an error if the ERP's existing rule blocks it |
| Validation | None beyond existence of the order reference |
| Idempotency | Cancelling an already-cancelled order should be a no-op success, not an error (matches CAS-based status-transition convention already used ERP-side) |
| Transaction boundary | Reuses the existing `cancelOrder()` transaction unmodified |
| Error behavior | 409 **specifically** when the ERP's existing rule fires — "cannot cancel, payment already allocated" (`InvoicePaymentExistsError`) — this must be a distinct, documented error code so the Website can explain it to the customer/operator, not a generic failure |
| Retry behavior | Safe to retry (idempotent no-op on an already-cancelled order) |
| Audit requirement | Reuses the existing `cancelOrder()` audit/activity logging, unmodified |

---

## 4. Fulfillment, payments, returns/refunds — deliberately not specified

- **Fulfillment**: no new write operation proposed — fulfillment status is read-only via §3.2. No push-fulfillment-update operation is proposed because nothing in the Website's design calls for the Website to *tell* the ERP about fulfillment; the ERP is the sole source of fulfillment truth.
- **Payments**: no dedicated payment-mutation endpoint proposed for MVP. Payment facts travel *inside* the order-create payload (§3.1) as informational fields. A dedicated payment-status-update endpoint is explicitly deferred until online payment is real (see `erp-integration-implementation-plan.md` §7/§12 item 4) — proposing its exact shape now would be inventing a contract for a capability that doesn't exist on either side yet.
- **Returns/refunds**: no endpoint proposed. Phase 6 confirmed both sides are immature here (ERP: pre-delivery-only returns, no refund flow; Website: unmodeled). Per the brief's explicit instruction ("only if supported/required by the real ERP"), and since neither support nor a business requirement is confirmed, nothing is proposed.

---

## 5. Error taxonomy (applies across all operations above)

| Error | Meaning | Website-side handling |
|---|---|---|
| `validation_error` (400) | Malformed/incomplete input | Should never reach the ERP if Website-side Zod validation is correct — a defensive backstop, not the primary check |
| `unauthorized` (401) | Missing/invalid API key | Alert — this indicates a credential problem, not a transient failure; do not retry blindly |
| `forbidden` (403) | Key valid, scope mismatch | Alert — should not occur under normal operation given one-key-one-company |
| `conflict` (409) | Idempotency dedup return, or a business-rule block (e.g. cancel-after-payment) | Distinguish the two: dedup returns the existing entity's reference as a *success*, not an error; a genuine business-rule conflict is surfaced per operation (§3.3) |
| `inventory_unavailable` | Not proposed as a distinct error — per §4/`erp-integration-implementation-plan.md` §4.2, the ERP never blocks order creation on stock (`allowOversell: true`); this error code does not apply to this integration's design |
| `duplicate` | Folded into `conflict` (409) above, not a separate code |
| `business_rule_violation` (422) | E.g. no resolvable warehouse | Logged, dead-lettered, alerted — not customer-visible |
| `erp_unavailable` (503, or a network-level failure) | ERP down/unreachable | Dead-letter + backoff retry, never customer-visible |
| `unknown_outcome` | Request sent, no response received (timeout) | **Never assumed to be a failure** — treated as ambiguous and resolved via the idempotent retry (§3.1) or a reconciliation poll (§3.2), per `erp-integration-failure-recovery.md` |

Every response echoes the correlation id it received, so a Website-side log entry and an ERP-side `AppLog`/`AuditLog` entry can always be joined for debugging, per `erp-integration-failure-recovery.md` §Observability.
