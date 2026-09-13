# ERP Order Integration API (Phase 9.6)

The ERP-side API boundary for pushing a confirmed Website order into ERP's real order/fulfillment lifecycle, pulling its status back, and propagating a cancellation. Full architectural reasoning lives in [`order-erp-integration-audit.md`](./order-erp-integration-audit.md) — this document is the contract reference.

Status: implemented and tested on both sides. Last updated: 2026-09-13.

---

## 1. Purpose

Closes the last prerequisite `order-erp-integration-audit.md` named: the Website's own order-creation flow now has a real, working path into ERP's order/fulfillment lifecycle, reusing ERP's existing, proven Shopify-order-import pattern rather than inventing a new one.

## 2. Ownership

ERP remains authoritative for operational order lifecycle, inventory commitment, and fulfillment (unchanged, Phase 9.5/9.5R). The Website remains authoritative for commercial order identity, customer-facing status, and the historical commercial snapshot. See the audit doc §1 for the full field-by-field table.

## 3. Authentication

Unchanged from Phase 8 — reused exactly, same as every other `integrations/website/*` route: `Authorization: Bearer <api-key>` + `X-ERP-Connection-Id: <connection-id>`, verified by `verifyWebsiteIntegrationRequest()`. No second auth mechanism.

## 4. Tenant resolution

Company resolved solely from the connection id, exactly as every other route in this family — never from the request body. Every downstream write (`BusinessPartner`, `SalesChannel`, `SalesOrder`, `ChannelMapping`) is scoped through the resolved `TenantContext`.

## 5. Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/integrations/website/orders` | Idempotent order create/ingest |
| `GET` | `/api/v1/integrations/website/orders/{websiteOrderId}` | Status pull-back |
| `POST` | `/api/v1/integrations/website/orders/{websiteOrderId}/cancel` | Cancellation |

All three are keyed by the Website's own order id (`websiteOrderId`) — never a raw ERP id supplied by the caller.

## 6. Request / response — create

```
POST /api/v1/integrations/website/orders
Authorization: Bearer <PLACEHOLDER_API_KEY>
X-ERP-Connection-Id: <PLACEHOLDER_CONNECTION_ID>
Content-Type: application/json

{
  "websiteOrderId": "<uuid>",
  "customer": { "phoneE164": "+201001234567", "name": "عميل الاختبار" },
  "lines": [
    { "erpVariantId": "<uuid>", "quantity": 2, "unitPrice": "185.0000" }
  ],
  "contactPhone": "+201001234567",
  "shippingAddress": "شارع الاختبار، القاهرة",
  "paymentMethod": "cod"
}
```

`lines[].erpVariantId` is ERP's own internal `ProductVariant.id` (the Website's `Variant.erpVariantId`, Phase 9.4R) — **never a SKU**. `unitPrice` is a decimal string, matching ERP's own `Decimal(14,4)` wire convention — never a raw float.

Response (200):

```json
{ "erpOrderReference": "<erp sales order id>", "primaryStatus": "pending_validation", "deduplicated": false, "requestId": "<uuid>" }
```

A retried request with the same `websiteOrderId` returns the SAME `erpOrderReference` with `deduplicated: true` — never a second order.

**`primaryStatus` will always be a `pending_validation`-family value on a fresh create** — this endpoint never auto-confirms (see the audit doc §3 for the exact technical reason). On a dedup hit, `primaryStatus` reflects the order's REAL current status, which may have already progressed if a moderator acted since the first push.

## 7. Request / response — status pull-back

```
GET /api/v1/integrations/website/orders/{websiteOrderId}
```

```json
{ "primaryStatus": "confirmed", "subStatus": "ready_to_confirm", "paymentStatus": "unpaid", "cancelledAt": null }
```

Real ERP enum values, verbatim — the Website adapter maps these to customer-facing stages (audit doc §10); this endpoint does not pre-decide that mapping. `404 not_found` if no ERP order is mapped to this website order id yet.

## 8. Request / response — cancel

```
POST /api/v1/integrations/website/orders/{websiteOrderId}/cancel
{ "reason": "customer_requested" }
```

Reuses ERP's existing, unmodified `cancelOrder()` — its real rules apply verbatim: blocked if the order's invoice already has payment allocated, blocked once the order is at/past `out_for_delivery`. Both surface as `422 business_rule_violation` with a specific message, not a generic failure. `404 not_found` if no ERP order is mapped yet.

## 9. Pagination / filtering

Not applicable — every operation here addresses exactly one order.

## 10. Idempotency

**Hard requirement, satisfied by construction**: `websiteOrderId` is the idempotency key on create, resolved through a `ChannelMapping(salesChannelId=<website channel>, internalEntityType="sales_order", externalId=websiteOrderId)` row — the same mechanism, same race-recovery shape, already proven correct for Shopify order import. Status pull-back and cancel are naturally idempotent (a read, and a CAS-guarded state transition respectively).

## 11. Error contract

Reuses Phase 8's `IntegrationErrorCode` taxonomy, extended this phase with one new code:

| Code | HTTP | When |
|---|---|---|
| `validation_error` | 400 | Malformed request body |
| `unauthorized` | 401 | Missing/invalid credentials |
| `not_found` | 404 | **New this phase.** No ERP order mapped to the given `websiteOrderId` |
| `business_rule_violation` | 422 | A real ERP rule blocked the operation (no active warehouse, unknown variant id, payment already allocated, order already dispatched) |
| `server_error` | 500 | Unexpected failure — never a stack trace or internal detail |

## 12. Security

Same server-only credential handling, tenant isolation, and no-secret-logging as every other route in this family. No client-submitted price/quantity/inventory is ever trusted — the Website only ever sends its own already-server-computed, already-frozen order snapshot (audit doc §6/§18).

## 13. Observability

Structured logs (`logger.info`/`warn`/`error` under the `website_integration` namespace) on every call, correlated by `requestId`; ERP-side `AuditLog`/`ActivityTimeline` entries record every create/cancel with `source: "website"` (a new, correctly-attributed value — previously any non-human caller was mislabeled `"shopify"`).

## 14. Examples

See §6-8 above — all payloads shown use placeholder values only; no real API key appears anywhere in this document.

## 15. Non-goals

No payment gateway, no courier/3PL integration, no Shopify runtime coupling (an order pushed by the Website is never forwarded to Shopify — verified directly: `cancelOrder()`'s existing Shopify-push step only fires when a Shopify `ChannelMapping` exists for the order, which a Website-originated order never has), no ERP Website Administration module, no Redis/queue/event bus, no automatic order-push retry job (see the audit doc §17).

## 16. Known limitations

- Orders always land in `pending_validation` — no auto-confirm path exists or was built (audit doc §3).
- No inventory reservation happens until a human moderator confirms the order (audit doc §9).
- A push that fails is not automatically retried by anything yet (audit doc §17) — the state is tracked (`Order.erpPushStatus: FAILED`) and safely retryable, but nothing currently re-attempts it on its own.
- Historical (pre-Phase-9.6) Website orders are never retroactively pushed (audit doc §24).

## 17. Future capability boundary

A real ERP reservation/commitment API reachable at push time (rather than only at moderator confirmation) does not exist and was not invented — if the business ever wants inventory reserved the instant a Website order is placed (bypassing moderation for this one channel), that requires a genuine, separate ERP-side capability decision, not something this phase's contract can retrofit.
