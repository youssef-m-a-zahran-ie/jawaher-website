# Proposed Integration Architecture (Design Only — Not Implemented)

Phase 6. This adapts the Website's already-approved integration shape (`blueprint.md` §9, `module-boundaries.md`) to what the real ERP actually is. **Nothing in this document is implemented.** No module, endpoint, migration, or dependency was created this phase.

Status: Phase 6. Last updated: 2026-09-10.

---

## 1. The shape, adapted to the real ERP

```
Customer
  ↓
Website Frontend
  ↓
Website API / Server layer
  ↓
Website Commerce Domain (Catalog, Orders — unchanged, already correctly shaped)
  ↓
ERP Adapter  (src/modules/erp-integration/ — Website-owned, does not exist yet, but the pattern
              is already proven twice: Payment/Shipping adapters)
  ↓
  ══════════ NEW BOUNDARY — does not exist on either side today ══════════
  ↓
[NEW] ERP-side authenticated API surface  (does not exist — see §3)
  ↓
ERP Service layer (SalesOrder/Product/Customer services — reused, not duplicated)
  ↓
ERP Repository layer → Postgres (tenant-scoped via TenantContext — unchanged)
```

The double line marks the one genuinely new piece: everything above it was already correctly designed on the Website side (confirmed, not just assumed, by this phase's inspection), and everything below the ERP service layer already exists and works for Shopify. **The gap is the boundary itself** — there is no existing ERP-side entry point a website adapter could call.

---

## 2. What stays exactly as already approved (Website side — no change)

- The `ERPProvider` interface shape (`getProducts`, `getProduct`, `getPrices`, `getInventory`, `pushOrder`, `getOrderStatus`, `reconcileCustomer`) — confirmed compatible with the real ERP's actual entities once the new boundary exists.
- Catalog projection direction and "ERP always wins" rule — confirmed correct; the real ERP genuinely is the operational source of truth for SKU/price/inventory, and genuinely has no equivalent of the Website's rich content, media, coupons, or shipping-zone pricing.
- `IdempotencyKey` reuse for the order push — confirmed directly compatible: the ERP's own `ChannelMapping`-unique-constraint dedup pattern is structurally the same idea, just on the other side of the boundary.
- Credential isolation (adapter-only secrets, never in Checkout/Orders/frontend) — unchanged, already correct.
- Error categorization (`erp_integration`, never checkout-blocking) — unchanged, already correct.
- Dead-letter + exponential backoff + human alert for a failed push — unchanged, already correct; no ERP-side retry mechanism is needed for this direction, since retries are Website-initiated.

## 3. What must be newly built — ERP side (does not exist today, confirmed by direct code inspection)

1. **A new `IntegrationConnector` row** (e.g. `key: "website"`) + one `CompanyIntegrationConnection` per tenant + `IntegrationSecret` row(s) for whatever credential is chosen — schema-level, small, directly modeled on the working Shopify pattern (`prisma/schema.prisma:1631-1664, 2504-2545`).
2. **A new inbound authentication path.** Today, `src/middleware.ts` gates everything except four prefixes (`webhooks/`, `cron/`, `jobs/`, `health`), each with its own bespoke auth. A generic API-key verification path — validating a bearer/API-key credential against an `IntegrationSecret` row and resolving it to a `companyId` via `getSystemTenantContext()` (the primitive already exists at `src/lib/db/tenant-context.ts:77-79`, just never called from a generic path) — does not exist and must be built. `IntegrationConnector.authType` already reserves `api_key` as a schema value; nothing validates one today.
3. **A generalized order-create entry point.** `createSalesOrder()` has exactly three call sites, all Shopify-specific. A new path needs: a `SalesChannel` row with a new `channelType` value (e.g. `"website"`), a customer/variant/warehouse resolution step mirroring `shopify-mapping.service.ts`'s proven idempotent-create pattern, and — critically — a decision on whether the resulting order lands in `pending_validation` (moderated, like Shopify) or bypasses that gate (see `erp-inventory-analysis.md` §2-3; this single decision determines the size of the inventory-timing risk).
4. **A new outbound read surface** for the Website's scheduled pull: aggregated inventory (`StockQuant` summed across locations/lots, floored at zero), prices, product/category facts, and order status. This is mostly a thin new route wrapping existing service-layer queries (`getStockAvailability()` etc. already compute the right shape) — low risk, no new business logic.
5. **A cancellation-acceptance path** that calls the *same* `cancelOrder()` service Shopify uses (reuse, not reinvent), respecting the same "blocked once any payment is allocated" rule — and surfacing that rule to the Website so it can decide when to still offer a cancel button.
6. **A payment-status acceptance path**, if/when the Website ever processes real online payment — the ERP has zero precedent for this (payment is 100% manual today); this needs new, deliberate design, not a field mapping.

None of items 1-6 should be built this phase. They are named here because "requires ERP inspection" from Phase 5 has now become "requires new ERP-side implementation," which is a materially different and larger scope than Phase 5 could have anticipated.

## 4. Auth mechanism recommendation

Given §3.2 and the disclosed inconsistency in `erp-shopify-integration-analysis.md` §4 (client-credentials-grant vs. OAuth-authorization-code already coexisting for two different connectors): recommend a **third, simplest option** for the website connector — a long-lived API key (`IntegrationSecret.secretType = "api_key"`), rotated manually or on a schedule, validated by the new middleware path in §3.2. This avoids adding a third distinct auth flow to a platform that already has two, and matches the trust model (a single first-party website the business itself controls, not a multi-tenant third-party app needing OAuth consent screens).

## 5. Where things live, ownership, and mechanics

| Concern | Owner | Mechanism |
|---|---|---|
| Product/price/inventory facts | ERP (unchanged) | Projection, pulled on a schedule, ERP always wins |
| Rich content, media, coupons, shipping-zone fee | Website (unchanged, now confirmed — ERP has no equivalent of any of these) | Website-owned tables |
| Order confirm-gate (moderation vs. auto-confirm) | **Business decision**, then ERP-owned once decided | New logic in the new order-create entry point (§3.3) |
| Idempotency | Both sides, same pattern | Website: `IdempotencyKey`. ERP: `ChannelMapping` unique constraint. Already symmetric in design, just needs the ERP side wired to a new channel |
| Retries | Website only, for this direction | Exponential backoff + dead-letter, already-approved design, unchanged |
| Reconciliation | Website-initiated poll | New small ERP read endpoint (§3.4) is the only new piece; the polling job itself is already-approved Website design |
| Audit logs | Both sides, independently, already exist | Website: existing `AuditLog`. ERP: existing `AuditLog`/`AppLog`/`ActivityTimeline`, extended to the new endpoints the same way Shopify webhook processing is already logged |
| Failure handling | Website: never customer-blocking (unchanged). ERP: new endpoints should reuse the same service functions Shopify uses (`confirmOrder`, `cancelOrder`, etc.), inheriting their existing error/validation behavior rather than reimplementing it | — |

## 6. What this phase deliberately does not decide

Per the brief's explicit instruction, this document stops at design. It does not choose: whether website orders auto-confirm or queue (§3.3), the exact payload/field names for the new endpoints, the tax/returns/refund policy, or the guest-customer ERP-record policy. Each is named as its own item in `erp-integration-final-gap-analysis.md`, tagged **D** (business decision) or **B** (implement during integration, once the D items are settled).
