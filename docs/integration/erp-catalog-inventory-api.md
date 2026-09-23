# ERP Catalog & Inventory Integration API (Phase 9.3)

The ERP-side API boundary the Website will consume in a future, separately-reviewed phase. **Not consumed by the Website yet** — this phase built the ERP side only; no Website sync job, no Website code change, exists as of this document.

Status: Phase 9.3 implemented; **Phase 9.3R (review correction) applied — see §17**; **Phase 9.5R (inventory identity correction) applied — see §18**. Last updated: 2026-09-13.

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
| `status` | `draft` \| `active` \| `discontinued` \| `archived` | — (see below) | **Corrected in Phase 9.3R — see §17.1.** When omitted, defaults to excluding `draft` (a technical safety default, not a final business decision). `status=draft` MAY now be requested explicitly and returns real draft data — it is no longer hard-rejected with `400`. |
| `updatedSince` | ISO 8601 datetime | — | Filters on the real `Product.updatedAt` column — incremental-sync support, no new versioning mechanism |

### `GET /catalog/categories`

No parameters. The category set is small and bounded for this business (a handful of top-level categories) — pagination would be speculative complexity for a set this size.

### `POST /inventory/availability`

**Updated in Phase 9.5R.** Body: EITHER `{ "variantIds": string[] }` (preferred — ERP's own stable internal variant id, never changes once assigned) OR `{ "skus": string[] }` (kept for backward compatibility only). Exactly one of the two, 1 to 200 entries. `POST`, not `GET`, chosen specifically because a batch of ids/SKUs doesn't fit safely into a query string at this size (URL length limits) — this is still a pure read; no mutation occurs.

**Why `variantIds` was added**: SKU is a mutable, ERP-owned business field (established in Phase 9.4R), not a stable identity — a lookup keyed by SKU risks a real drift-window bug if ERP renames a SKU after the Website's last catalog sync but before its next one (the stale cached SKU would report `notFoundSkus` for a variant that plainly exists). The Website's `Variant.erpVariantId` (added Phase 9.4R) closes this gap; the Website's inventory adapter uses `variantIds` since Phase 9.5R. `skus` remains valid for any caller that genuinely only has a SKU, but is no longer the recommended path.

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

See §17.2 for the structured per-field breakdown (current ERP capability / current API behavior / classification) for variant label, media, and currency specifically, as requested in the Phase 9.3 review.

**Money representation**: `sellingPrice`/`packQuantity` are **decimal strings**, never JS numbers — preserves ERP's authoritative `Decimal(14,4)` representation exactly, per this phase's explicit §9 instruction ("do not convert money to floating-point numbers"). Converting to the Website's own integer-minor-units representation is left to whichever future adapter consumes this, exactly as already planned (`erp-website-real-mapping.md` §2: "conversion happens once, inside the adapter"). The two fields do **not** share the same formatting guarantee, corrected here after a real bug the first live catalog sync found (both are backed by the same `Decimal(14,4)` column type, but ERP's serialization treats them differently on purpose):

- **`sellingPrice` (monetary — real money, exposed to a downstream price-conversion adapter): guaranteed exactly 4 decimal places**, e.g. `"185.0000"`, `"99.0000"` — never `"185"` or `"99"`. Serialized via `decimalToMoneyString()` (`website-catalog.service.ts`, ERP JAW repo), which calls decimal.js's own `.toFixed(4)` — never a bare `String()`/`.toString()`, which strips insignificant trailing zeros (decimal.js's default behavior) and previously produced exactly this violation in practice, not just in theory. The Website's `erpDecimalPriceToMinorUnits()` mapper strictly requires this fixed 4-decimal shape (`^\d+\.\d{1,4}$`) and correctly rejects anything else — that strictness is intentional and must never be loosened to "fix" a future recurrence of this bug; the fix belongs on the ERP side, where it was actually made.
- **`packQuantity` (a quantity/ratio, not money): decimal string, never a float, but *not* guaranteed a fixed decimal-place count** — trailing zeros may or may not be present (e.g. `"1"` or `"1.0000"` are both possible for the same stored value). Serialized via the plainer `decimalToString()`, unchanged. Safe because its only consumer (`deriveFallbackVariantLabel`) already normalizes trailing zeros itself and never assumed a fixed width — this is an intentional, narrower contract than `sellingPrice`'s, not an oversight.

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

The response mirrors whichever identifier the request used (Phase 9.5R):

```json
// request { "variantIds": [...] } -> response:
{
  "items": [
    { "variantId": "<uuid>", "available": 17 }
  ],
  "notFoundVariantIds": ["<uuid-that-does-not-exist>"],
  "requestId": "<uuid>"
}
```

```json
// request { "skus": [...] } -> response (unchanged, backward-compatible):
{
  "items": [
    { "sku": "DATES-MAJDOOL-500", "available": 17 }
  ],
  "notFoundSkus": ["SKU-THAT-DOES-NOT-EXIST"],
  "requestId": "<uuid>"
}
```

**Deliberately minimal, per this phase's own explicit brief §3**: on-hand, reserved, and the physical source-variant identity (all real, computed internally by `getSellableAvailability()`) are **not exposed** — only the derived `available` count, floored at zero at this boundary. `notFoundSkus`/`notFoundVariantIds` is not an error — a valid, useful partial result distinguishing "resolved to zero, genuinely out of stock" from "this identifier doesn't exist in this company's catalog."

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

---

## 17. Phase 9.3R — review correction (draft/publishing rule + contract-gap documentation)

Phase 9.3 was reviewed and returned with one required correction. This section records what was found, what changed, and what remains genuinely open.

### 17.1 Draft/publishing rule — investigation verdict and correction

Phase 9.0 explicitly classified "visibility/publishing rules for unpublished products" as an **open business decision** (`catalog-inventory-gap-analysis.md` §4/§9). Phase 9.3's original implementation unconditionally excluded `draft` from every read and **hard-rejected** an explicit `status=draft` request with `400`.

**Investigation finding (code + git history, not assumption):** this was **not** an already-established ERP rule. No pre-Phase-9.3 code anywhere in the ERP — not the Products module, not the Shopify sync (which is inbound-only: Shopify → ERP, never the reverse, so there is no existing "what do we export externally" precedent at all), not any permission check — ever gated an external surface on `draft` status. `draft` in the ERP is purely an internal data-entry/workflow starting state (a product "is created as Draft," `product.service.ts`), unrelated to any concept of publishing or customer visibility. The exclusion was introduced in the same Phase 9.3 commit that built the API, and `erp-integration-implementation-plan.md` §12 had already self-classified it one phase earlier as a **"technical default... reversible later,"** not a business-approved rule. **Verdict: Case B — an invented integration policy**, reasonable as an inference but never a real, adopted ERP rule.

**Correction applied (smallest safe change, not a new final rule):**

- The **default** behavor is unchanged and remains safe: a request with no `status` filter still excludes `draft` (`listProductsForWebsiteIntegration`, `product.service.ts`). This is kept as a technical default, explicitly labeled as such in the route's own doc comment — not asserted as a business decision.
- The **hard `400` rejection of an explicit `status=draft` request was removed.** `draft` is now a valid value for the `status` query parameter (`src/app/api/v1/integrations/website/catalog/products/route.ts`), returning real ERP data — nothing fabricated. This is the part that previously "permanently encoded" an unresolved business decision into the API contract (a categorical, un-reversible "the Website can never learn about draft products through this API, ever") — removing it restores the ability for the still-unbuilt future adapter to make its own decision later, without ERP unilaterally deciding on the business's behalf.
- Why not: the correction does **not** remove draft records from every read forever, and it does **not** build any new sync/notification mechanism — it simply stops actively blocking a legitimate, explicit, authenticated request for real data that a future reconciliation process would need (§17.3).

### 17.2 Three distinct concepts — do not conflate

| Concept | What it is | Owner |
|---|---|---|
| **ERP product status** (`draft`/`active`/`discontinued`/`archived`) | ERP's own internal business lifecycle for a product record — confirmed to have zero existing connection to external visibility before this API existed | ERP |
| **Website publication/visibility** | Whether a product should be shown to a customer on the storefront at all (and, potentially in future, a "coming soon" preview state for drafts) | **Undecided** — this is the actual open business decision Phase 9.0 flagged, still open |
| **Integration read behavior** (this API) | What this API returns by default vs. what it permits on explicit request | ERP, but scoped narrowly: a *default* (safe, non-binding) plus an *explicit opt-in* (real data, no gate) — deliberately not an assertion about visibility policy |

The correction in §17.1 exists precisely to keep these three separate: the API no longer pretends that "ERP status = draft" settles "Website visibility" — it now only encodes a safe default for the common case, leaving the actual visibility policy for the Website/business to decide whenever they choose to.

### 17.3 Field-level contract gaps — current capability, current behavior, classification

**Variant Label**
- *Current ERP capability*: no display-label/name field exists on `ProductVariant` at all — confirmed by schema inspection, unchanged since Phase 9.0 (`catalog-inventory-gap-analysis.md` §4/§9).
- *Current API behavior*: `sku`, `packQuantity`, and the parent product's `baseUnitCode` are returned as-is; no label is synthesized or guessed by the API.
- *Why the Website cannot yet rely on it*: any per-variant display string (e.g. "500g", "1kg jar") would have to be derived — either by the ERP inventing a formatting rule it doesn't own, or by a future Website-side convention. Neither exists today.
- *Classification*: **open business/data-model decision**, unchanged — not resolved by this phase or 9.3R.

**Media**
- *Current ERP capability*: no reliable image/media representation exists for a product (`FileAsset` has no working `"product_image"` category — confirmed again, `catalog-inventory-gap-analysis.md` §2.5).
- *Current API behavior*: no media field is returned at all — omitted, not defaulted to a placeholder/empty string/fake URL.
- *Classification*: **ERP capability gap** — not a business decision to make, a build gap (ERP would need a real media system before this API could expose one). Documented, not invented.

**Currency**
- *Current ERP capability*: no currency concept exists anywhere in the ERP schema — confirmed again this phase by a full schema grep (zero matches).
- *Current API behavior*: money fields (`sellingPrice`, `packQuantity`) are returned as bare decimal strings with no accompanying currency code; the API makes no claim about what currency they're denominated in.
- *Classification*: **open business/data-model decision** — the Website's own current fixed assumption (EGP) is a Website-side convention, not something this API confirms or depends on. If the business ever operates in more than one currency, this gap becomes load-bearing and must be resolved before that happens — flagged, not solved.

### 17.4 Future reconciliation — what the current design allows and what it doesn't

Without implementing any sync mechanism now, per the review's explicit instruction:

- **New product**: detectable. A newly-created `active`/`discontinued`/`archived` product appears in the next default (or `updatedSince`-filtered) pull like any other row.
- **Updated product** (same status, changed fields): detectable via `updatedSince` — `Product.updatedAt` is real and authoritative.
- **Product transitioning `active` → `discontinued`/`archived`**: detectable. Both statuses remain inside the default `statusIn` set, so the row still appears in a default or `updatedSince` pull with its new status visible.
- **Product transitioning to `draft`** (unpublished/pulled back for edits): **NOT detectable via the default pull** — since the default excludes `draft`, a product that moves to `draft` simply stops appearing in the result set, with no signal that it was removed rather than merely unchanged-and-not-returned-this-page. This is a real, documented **future integration gap**: a default-only incremental sync can create/update a local Website record but can never learn, by itself, that the corresponding ERP product was pulled back to draft.
- **What §17.1's correction enables, without building sync**: because `status=draft` is no longer hard-blocked, a *future* reconciliation process **could** explicitly query `status=draft` (or all four statuses) to build a complete picture, or explicitly re-check a specific product's status. **This capability is documented here as available, not implemented as a mechanism** — no polling job, no webhook, no queue was added. If/when Website sync is built, the sync design will need to explicitly decide how to detect "went missing from the default view" (e.g., always querying all four statuses and diffing locally, or periodically polling `status=draft` for known SKUs) — an open design question for that future phase, not this one.

### 17.5 Security — unchanged, re-confirmed

Authentication, tenant binding (`TenantContext`/`companyId` resolved solely from the connection id, never from client input), read-only boundary, and no-secret-logging are all unmodified by this correction. The new test `"explicit status=draft still respects tenant isolation"` (`catalog/products/route.test.ts`) confirms a draft product belonging to a different company is never returned even when `status=draft` is explicitly requested — tenant isolation applies identically regardless of which status is requested.

### 17.6 Verification

48 tests passed across the four affected files (17 catalog/products — 2 new/changed for this correction, 4 catalog/categories, 13 inventory/availability, 15 warehouse `reservation.service`), plus the full existing suite unaffected (64 tests passed / 38 skipped — the skipped set is the same pre-existing live-Postgres RLS suite, unavailable in this sandbox, unrelated to this change; explicitly not claimed as passing). `npm run check:tenant-scope` (138 files, 0 violations), `npm run typecheck`, `npm run lint`, and `npm run build` all clean.

---

## 18. Phase 9.5R — inventory identity correction (`variantIds` added)

The Website's Phase 9.5 review caught that the inventory adapter conceptually treated the Website's own variant id as the sync identity, while the wire call underneath still had to send `sku` — because this endpoint, as built in Phase 9.3, only accepted SKUs. Phase 9.4R had since established SKU as a mutable, ERP-owned business field, not a stable sync identity, and this endpoint had not been revisited since.

### 18.1 What was found

`getSellableAvailability(ctx, productVariantIds)` (Phase 9.2, unmodified this whole time) was ALWAYS variant-id-keyed internally — the SKU-keying only existed in the thin wrapper this endpoint calls, and that wrapper's own doc comment gave the exact reason: "the Website's own catalog model has no `erpVariantId` column at all." That reason stopped being true the moment Phase 9.4R shipped `Variant.erpVariantId` on the Website side — nothing on the ERP side was ever updated to reflect it. Left as-is, this created a real, demonstrable bug: if a SKU is renamed in ERP after the Website's last catalog sync but before its next one, a lookup using the Website's stale cached SKU value would report `notFoundSkus` for a variant that plainly still exists.

### 18.2 What changed

`POST /inventory/availability` now accepts EITHER `{ variantIds: string[] }` (new, preferred) or `{ skus: string[] }` (unchanged, kept for backward compatibility) — a Zod union, mutually exclusive. The `variantIds` path is a new, minimal function, `getSellableAvailabilityByVariantIds()` (`reservation.service.ts`), which composes the exact same, still-unmodified `getSellableAvailability()` — the only new code is `findVariantIdsExisting()` (`product-variant.repository.ts`), a tenant-scoped existence check mirroring `findVariantsBySkus()`'s own pattern exactly, just id-keyed instead of sku-keyed. Response shape mirrors whichever identifier the request used (§7).

### 18.3 Why this was judged a required, minimal ERP change (not scope creep)

Per the review's own instruction ("STOP before modifying ERP unless the change is demonstrably required... if a minimal ERP-side change is clearly required and safe, implement only that change"): the drift-window bug above is real and directly caused by an ERP-side design choice (SKU-keying) whose own stated justification had become false. The fix is the smallest possible one — one additive request/response shape on one existing route, reusing Phase 9.2's core function completely unmodified, with the old path kept working exactly as before. No ERP schema change, no new business logic, no redesign of inventory.

### 18.4 Verification

6 new tests added to `route.test.ts` (resolves by variant id; a SKU rename does not break a variant-id-keyed lookup, and is shown to break the old SKU-keyed lookup by contrast; not-found reporting; tenant isolation; zero-floor; rejects a body with neither shape) — 19/19 tests in that file passing. Full ERP suite: 70 passed / 38 skipped (the same pre-existing live-Postgres RLS suite, unrelated) — 0 unexpected failures. `check:tenant-scope` (138 files, 0 violations), `typecheck`, `lint`, `build` all clean.
