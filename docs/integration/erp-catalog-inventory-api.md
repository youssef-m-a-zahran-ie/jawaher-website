# ERP Catalog & Inventory Integration API (Phase 9.3)

The ERP-side API boundary the Website will consume in a future, separately-reviewed phase. **Not consumed by the Website yet** — this phase built the ERP side only; no Website sync job, no Website code change, exists as of this document.

Status: Phase 9.3, implemented and tested on the ERP side. Last updated: 2026-09-12.

---

## 1. Purpose

Exposes the ERP's authoritative product/category/inventory data to the Website's future ERP Adapter, closing the last technical prerequisite named in `catalog-inventory-gap-analysis.md` (§11: "no reusable ERP API exists") and `erp-integration-final-gap-analysis.md` (the ERP-side BLOCKER items). Read-only. Nothing here syncs data *into* the ERP.

## 2. Ownership

ERP owns and remains authoritative for every field this API returns: product identity, variant identity, SKU, category relationship, price, operational status, and inventory availability — per the already-approved model (`blueprint.md` §5-§7, unchanged). The Website cannot send any of these values back through this API; there is no write operation here at all.

## 3. Authentication

Unchanged from Phase 8/8.5 — reused exactly as built, not re-implemented:

- `Authorization: Bearer <api-key>` + `X-ERP-Connection-Id: <connection-id>` headers, verified by `verifyWebsiteIntegrationRequest()` (`src/lib/integration-auth/service.ts`).
- Missing either header → `401 unauthorized`. Wrong key for a valid connection id → `401 unauthorized`. Unknown/disconnected connection id → `401 unauthorized`. All three cases return the identical response body — the specific reason is logged (`AppLog`, via `src/lib/logger.ts`) but never distinguishable from the response, unchanged from Phase 8's own design decision.
- No second authentication system was created. No new credential type was introduced.

## 4. Tenant resolution

Every route calls `verifyWebsiteIntegrationRequest(request)` first, which resolves a `TenantContext` from the connection id + key — never from any request body, query parameter, or client-supplied header claiming a `companyId`. Every downstream query (`productRepo.listProducts`, `getSellableAvailability`, etc.) hand-writes `companyId: ctx.companyId` in its `where` clause, per the unchanged, existing `TenantContext`/ADR-0001 mechanism (re-verified this phase, see §12).

**Explicitly verified, not assumed**: a request cannot select an arbitrary tenant by any client input — the only way a request resolves to a company at all is through the connection id's own stored mapping, established once at provisioning time (`scripts/provision-website-integration.ts`, unchanged).

## 5. Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/integrations/website/catalog/products` | Paginated product + nested variant listing |
| `GET` | `/api/v1/integrations/website/catalog/categories` | Full category list (small, unpaginated) |
| `POST` | `/api/v1/integrations/website/inventory/availability` | Batch sellable-availability lookup, by SKU |

**Deliberately not built**: a single-product-by-id endpoint. The Website's own approved `ERPProvider` interface (`blueprint.md` §9) only names bulk operations (`getProducts`, `getPrices`, `getInventory`) for the pull direction — a single-item lookup isn't a real, named requirement, and adding one now would be exactly the "unnecessary endpoint" this phase's brief warns against. The bulk endpoint's `updatedSince` filter already covers incremental re-pull of a changed item.

## 6. Request parameters

### `GET /catalog/products`

| Param | Type | Default | Notes |
|---|---|---|---|
| `limit` | integer, 1-200 | 50 | Safe maximum enforced by Zod; a request for more is a `400`, not silently clamped |
| `skip` | integer, ≥0 | 0 | Offset pagination — the only pagination style this codebase already has anywhere (`ListProductsFilter`'s existing `skip`/`take`); no cursor scheme was invented |
| `category` | UUID | — | ERP's own `ProductCategory.id` |
| `status` | `active` \| `discontinued` \| `archived` | — | **`draft` is rejected with `400 validation_error`** if requested — not merely omitted, actively refused, since draft products must never reach the Website under any request shape (`erp-integration-implementation-plan.md` §3) |
| `updatedSince` | ISO 8601 datetime | — | Filters on the real `Product.updatedAt` column — incremental-sync support, no new versioning mechanism |

### `GET /catalog/categories`

No parameters. The category set is small and bounded for this business (a handful of top-level categories) — pagination would be speculative complexity for a set this size.

### `POST /inventory/availability`

Body: `{ "skus": string[] }` — 1 to 200 entries. `POST`, not `GET`, chosen specifically because a batch of SKUs doesn't fit safely into a query string at this size (URL length limits) — this is still a pure read; no mutation occurs.

## 7. Response schemas — PROPOSED CONTRACT, implemented exactly as shown

### Product

```json
{
  "products": [
    {
      "id": "<uuid>",
      "name": "تمر مجدول",
      "status": "active",
      "categoryId": "<uuid>",
      "categoryName": "تمور",
      "baseUnitCode": "kg",
      "updatedAt": "2026-09-01T12:00:00.000Z",
      "variants": [
        {
          "id": "<uuid>",
          "sku": "DATES-MAJDOOL-500",
          "barcode": null,
          "status": "active",
          "sellingPrice": "185.0000",
          "packQuantity": "0.5000"
        }
      ]
    }
  ],
  "pagination": { "limit": 50, "skip": 0, "total": 14, "hasMore": false },
  "requestId": "<uuid>"
}
```

**Fields deliberately NOT included, and why** (per §18/§2 of the brief — nothing fabricated):

| Field | Why omitted |
|---|---|
| `description` | No such field exists on ERP's `Product` at all — already-approved as Website-owned content, not an ERP gap (`erp-domain-map.md` §1) |
| `costPrice` | Internal margin data — never customer-facing by design, unrelated to this integration (`erp-domain-map.md` §1's own classification, unchanged) |
| `channelMetadata` | Shopify-only, informal, undocumented shape — not a stable integration contract field |
| `stockSourceVariantId` / `stockSourceRatio` | Purely an ERP-internal inventory-resolution detail — the Website only ever needs the resolved number from the inventory endpoint (§10) |
| variant "label" / display name | **No such field exists anywhere in the ERP.** Confirmed again this phase (unchanged from `catalog-inventory-gap-analysis.md` §4/§9) — this remains an open **business decision**, not resolved or fabricated here. `packQuantity` + the product's `baseUnitCode` are exposed instead — real, raw material a future Website-side derivation could use, without ERP inventing a label format on the Website's behalf |
| `media` / image references | No reliable ERP representation exists (`FileAsset` has no working `"product_image"` category — confirmed again, `catalog-inventory-gap-analysis.md` §2.5) — per §19 of this phase's brief, not invented |
| `currency` | **No currency concept exists anywhere in the ERP schema** (confirmed by a full schema grep this phase — zero matches for "currency") — genuinely undetermined, not fabricated. The Website already treats this as its own fixed assumption (EGP), unrelated to ERP (`catalog-inventory-gap-analysis.md` §4) |
| `brand` | The Website has no brand field/concept at all to receive one (confirmed, `erp-domain-map.md` §2/Phase 6) — nothing to expose it for |

**Money representation**: `sellingPrice`/`packQuantity` are **decimal strings** (e.g. `"185.0000"`), never JS numbers — preserves ERP's authoritative `Decimal(14,4)` representation exactly, per this phase's explicit §9 instruction ("do not convert money to floating-point numbers"). Converting to the Website's own integer-minor-units representation is left to whichever future adapter consumes this, exactly as already planned (`erp-website-real-mapping.md` §2: "conversion happens once, inside the adapter").

### Category

```json
{
  "categories": [
    { "id": "<uuid>", "name": "تمور", "parentCategoryId": null }
  ],
  "requestId": "<uuid>"
}
```

No slug (the ERP has none — the Website already generates its own, per the already-approved plan). `parentCategoryId` is exposed as real, unflattened hierarchy data — the flat-vs-hierarchical *display* decision remains open (`catalog-inventory-gap-analysis.md` §9, unchanged), but this API does not pre-decide it by hiding the real data.

### Inventory availability

```json
{
  "items": [
    { "sku": "DATES-MAJDOOL-500", "available": 17 }
  ],
  "notFoundSkus": ["SKU-THAT-DOES-NOT-EXIST"],
  "requestId": "<uuid>"
}
```

**Deliberately minimal, per this phase's own explicit brief §3**: on-hand, reserved, and the physical source-variant identity (all real, computed internally by `getSellableAvailability()`) are **not exposed** — only the derived `available` count, floored at zero at this boundary. `notFoundSkus` is not an error — a valid, useful partial result distinguishing "resolved to zero, genuinely out of stock" from "this SKU doesn't exist in this company's catalog."

## 8. Pagination

Covered in §6/§7 for products. Deterministic ordering is `createdAt asc` — practically deterministic (Postgres timestamp precision makes an exact tie between independently-created rows vanishingly unlikely at this business's real data volume), not mathematically guaranteed unique. Stated honestly rather than oversold, per this project's own "never write an unverified guarantee as settled fact" convention (ERP `CLAUDE.md` rule 7).

## 9. Filtering

`category`, `status` (products); nothing for categories (unnecessary at this scale); `skus` (inventory, not really a "filter" — a batch key list). **No fuzzy search, no full-text search, no search-engine behavior exists in this API** — per §11 of this phase's brief, the ERP was not turned into the Website's search engine. (The Website's own real search, built in Phase 9.1 against its local catalog projection, remains the Website's own concern entirely.)

## 10. Inventory semantics

Uses `getSellableAvailability()` (Phase 9.2, `src/modules/warehouse/services/reservation.service.ts`) via a new SKU-keyed wrapper, `getSellableAvailabilityBySkus()` — **no second interpretation of `stockSourceVariantId`/assembly-BOM resolution was written**; both delegate to the same, unmodified `resolveOrderLineComponents()` (Products module) Phase 9.2 already established as the one place that logic lives.

- Normal variant: `available = onHand - reserved`, floored at zero.
- Weight-tier redirect (`stockSourceVariantId` set): `available` derives from the real physical source variant's stock at the real schema ratio — verified directly (test: a 0.25 ratio against 10 physical units correctly yields 40).
- Assembly BOM (bundle): `available` = the scarcest real component's own derived count — the mathematically forced consequence of the existing consumption model, not an invented rule (unchanged reasoning from Phase 9.2).
- A SKU with no matching variant in this company's catalog: reported in `notFoundSkus`, never as an error, never silently mixed into `items`.
- Tenant isolation: verified directly (test) — a SKU that only exists under a *different* company can never resolve to that company's real stock; it reports as not-found for the requesting company, exactly like a genuinely nonexistent SKU.

## 11. Error contract

Reuses Phase 8's existing, unmodified `IntegrationErrorCode` shape (`src/lib/integration-http.ts`) — no new error framework:

| Code | HTTP | When |
|---|---|---|
| `unauthorized` | 401 | Missing/invalid/malformed credentials (all three, identical body) |
| `validation_error` | 400 | Bad query param (e.g. `status=draft`, `limit=99999`, a malformed body) |
| `server_error` | 500 | Anything unexpected — never includes a stack trace, exception message, or internal connection detail (verified directly by a test asserting a deliberately-leaky-looking internal error string never reaches the response) |

`403 forbidden` is defined in the shared error-code table (Phase 8) but not triggered by any code path in this API — there is no authorization tier beyond "is this a valid, connected website integration credential at all" (see §12). `404 not_found` does not apply either — there is no single-item lookup endpoint (§5) for a single item to be missing from; a query with no matching rows simply returns an empty `products`/`categories` array or a populated `notFoundSkus`, which is not an error condition.

## 12. Security

- **Least privilege, verified**: the integration credential carries no RBAC role at all (unchanged from Phase 8) — it can reach exactly these three routes and nothing else; there is no write capability anywhere in this API for it to even attempt.
- **No Website-originated mutation is possible.** Confirmed by direct inspection: none of the three routes accept any input that reaches `postStockMove`, `reserveStock`, `releaseReservation`, `fulfillReservation`, or any product/category write function. Only `findMany`/`count`-shaped reads are ever called.
- **Tenant isolation re-verified this phase** (not merely assumed from Phase 8.5): a dedicated cross-tenant test proves a company cannot read another company's products (route test) or resolve inventory through a SKU that only exists under a different company (route test) — both pass against a fake that genuinely filters by `companyId`, not a tautology.
- **No secrets in responses or logs**: verified directly by tests asserting the API key and internal `companyId` never appear in any response body.
- **No internal DB objects leaked**: verified directly by tests asserting `costPrice`, `channelMetadata`, `stockSourceVariantId`, on-hand/reserved internals never appear in any response.

## 13. Observability

Unchanged, reused exactly from Phase 8: `x-request-id` request/response header (mint-if-absent, echo-if-present), structured `AppLog` entries via `src/lib/logger.ts` for every request (success and failure), with `companyId`/`requestId`/operation-specific counts logged — never a secret value, never a raw API key, never an `Authorization` header value.

## 14. Examples (placeholders only — no real API key anywhere in this document)

```
GET /api/v1/integrations/website/catalog/products?limit=50&status=active
Authorization: Bearer <PLACEHOLDER_API_KEY>
X-ERP-Connection-Id: <PLACEHOLDER_CONNECTION_ID>
```

```
POST /api/v1/integrations/website/inventory/availability
Authorization: Bearer <PLACEHOLDER_API_KEY>
X-ERP-Connection-Id: <PLACEHOLDER_CONNECTION_ID>
Content-Type: application/json

{ "skus": ["DATES-MAJDOOL-500", "HONEY-SIDR-250"] }
```

## 15. Non-goals (this phase)

Per the brief: no Website sync job, no Website code change of any kind (confirmed — `git diff` in the Website repo for this addendum is documentation-only), no checkout/payment/shipping change, no Website Admin, no Shopify work, no schema change (confirmed — `prisma/schema.prisma` diff is empty), no new dependency. No rate limiting was implemented — see §16.

### Rate limiting — explicitly deferred, not silently skipped

Per §16 of this phase's brief ("if a reusable mechanism already exists, apply it; if not, document this as a future production-hardening item unless the API would otherwise be unsafe"): the existing `AuthRateLimiterService`/`ConnectorRateLimitState` mechanisms are scoped to specific, different purposes (login-attempt throttling; outbound-retry-after-failure) and would need real adaptation work to reuse here, not a drop-in fit. Judged **not otherwise-unsafe without it**, for the same reasoning already accepted for the Phase 8 health endpoint: the credential space (a random API key + a UUID connection id) makes brute-forcing computationally infeasible regardless, and every route here is read-only with no side effect to abuse. Flagged as a real, future production-hardening item — not silently dropped.

## 16. Future Website sync usage

This API is the ERP-side half of the boundary `erp-integration-implementation-plan.md`/`erp-api-contracts.md` already designed (Phase 7) and `catalog-inventory-gap-analysis.md` (Phase 9.0) confirmed was missing. A future phase (not this one) would build the Website-side `ERPProvider` adapter methods (`getProducts()`, `getInventory()`) calling these exact three endpoints, on a scheduled pull, writing into the Website's existing `Product`/`Variant`/`Category` projection tables — using `updatedSince` for incremental pulls once a full initial sync has run. **Nothing about that future phase was built now** — no Website file was touched, per this phase's own explicit instruction.
