# Catalog & Inventory Integration — Gap Analysis (Phase 9 / Step 9.0)

Audit and design-mapping only — no business code was implemented to produce this document. Every claim below is verified against the real, current source of both repositories as of this phase (ERP `HEAD=bdd3e60`, Website `HEAD=1727a84`), not against prior-phase documentation alone. Where a prior document's claim was checked and found stale, that is called out explicitly.

Status: Phase 9, Step 9.0, complete. **Phase 9.1 (Website Catalog Reconnection) complete — see §16 addendum. Phase 9.2 (ERP Inventory Availability Resolution) complete — see §17 addendum. Phase 9.3 (ERP Catalog & Inventory Integration API) complete — see §18 addendum. Phase 9.3R (draft/publishing rule correction) complete — see §19 addendum. Phase 9.4 (Website ERP Catalog Sync) complete — see §20 addendum. Phase 9.4R (variant identity & field-ownership correction) complete — see §20's own addendum note.** Last updated: 2026-09-13.

---

## 1. Executive summary

The catalog/inventory data model on both sides is exactly as prior phases described — no surprises there. **The one genuinely new, consequential finding this audit adds**: the Website's customer-facing storefront (shop grid, category pages, product detail page, search) renders **entirely from a hardcoded, in-memory demo dataset** (`src/ui/commerce/mock-products.ts`, `categories.ts`), completely disconnected from the real, database-backed, tested `catalogService`/`Category`/`Product`/`Variant` stack that already exists in parallel. "Add to cart" on the real storefront UI shows a toast and does nothing else — no real cart row is ever created from that flow. This means **ERP → Website catalog sync alone would have zero customer-visible effect** until a second, independent Website-side task — rewiring the storefront UI from the mock layer to the real `catalogService` — is also done. This was already partially known (`feature-completeness-audit.md` flags product data as mock), but not previously stated with this precision: the real backend isn't unbuilt, it's built, tested, and simply never called by any page.

Beyond that: the ERP's product/inventory domain is real and richer than a first read suggests — in particular, **weight-tier variants (`stockSourceVariantId`/`stockSourceRatio`) and bundle/BOM components redirect their real stock elsewhere, and no existing ERP read function resolves this for a generic availability query** (only the order-fulfillment path does, via `resolveOrderLineComponents()`). A naive inventory-read endpoint built against `getStockAvailability()` alone would report **zero stock for every weight-tier variant**, which is likely a large fraction of the real catalog. This is the single most important new technical finding for the inventory sync boundary design (§7).

No BLOCKER prevents proceeding to design/build the Catalog Integration phase, but two real prerequisites were found that don't yet exist: (1) the Website storefront-UI rewiring above, independent of ERP; (2) the ERP-side stock-source-aware availability composition, needed before any inventory read endpoint is built. Both are named as required, sequenced work in §12, not silently deferred.

---

## 2. Actual ERP findings

All confirmed by direct code read this phase (file:line-level detail retained in the working notes; summarized here).

### 2.1 Product master data

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `companyId` | String | tenant scope |
| `categoryId` | String, required | single-valued category — **no multi-category support** |
| `brandId` | String, optional | |
| `name` | String | **no `description` field exists on `Product` at all** |
| `productType` | String enum: `raw_material\|finished_product\|repacked_product\|assembly_product\|packaging_material\|consumable\|service\|miscellaneous` | drives BOM/purchasability behavior |
| `baseUnitId` | String, required | FK to `UnitOfMeasure` |
| `isLotTracked` | Boolean | |
| `pickingStrategy` | String enum `fefo\|fifo`, default `fefo` | **not actually enforced in fulfillment code** — confirmed again this phase, unchanged from Phase 6 |
| `status` | String enum `draft\|active\|discontinued\|archived` | real business lifecycle |
| `channelMetadata` | Json?, nullable | Shopify-only presentation fields (vendor, tags, handle, SEO, options) — **no first-class column for any of these** |
| `needsReview` | Boolean | Shopify-import review flag |
| `deletedAt` | DateTime?, nullable | **present but never written by any service function** (confirmed again — `archiveProduct()` sets `status`, not `deletedAt`) |

**No slug, no SEO title/description, no tags-as-a-column (tags exist only via the generic platform-wide `Tag`/`EntityTag` join, usable but not catalog-specific), no attributes JSON field, no photography/media reference.**

**CRUD surface**: `src/modules/products/services/product.service.ts` — `createProduct`, `activateProduct`/`discontinueProduct`/`archiveProduct` (status transitions, each individually audit-logged + activity-logged), `updateProduct` (descriptive fields only, never touches `status`), `getProduct`, `listProducts` (paginated, filterable by category/status/search, **excludes "عرض ..." (Shopify offer/bundle) products by default** — a name-substring heuristic, `EXCLUDE_OFFER_PRODUCTS`, not a real flag), `tagProduct`/`getProductTags`. Authorization: `product.view` (read) / `product.manage` (write) — exactly two permission codes cover products, variants, categories, and BOMs together; no finer-grained split exists.

### 2.2 Variants

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `companyId`, `productId` | String | `companyId` deliberately denormalized (not joined through Product) for scale |
| `sku` | String | `@@unique([companyId, sku])` — **company-scoped, not global** |
| `barcode` | String?, nullable | **not unique-constrained anywhere** |
| `packQuantity` | Decimal(14,4), default 1 | |
| `costPrice`, `sellingPrice` | Decimal(14,4)?, nullable | **no currency column — implied single company-wide currency, never stored per row** |
| `minimumStock`, `reorderPoint` | Decimal(14,4)?, nullable | |
| `status` | String enum, independent of parent Product's status | |
| `channelMetadata` | Json?, nullable | weight, compare-at price, option values, images — **no first-class column for any of these**, including no first-class "variant label"/name string |
| `stockSourceVariantId`, `stockSourceRatio` | String?/Decimal(14,4)?, nullable | **weight-tier redirect — see §7, the phase's key inventory finding** |
| `deletedAt` | DateTime?, nullable | same dead-column pattern as Product |

No structured option/value system (confirms Phase 6: variants are flat rows distinguished by fields, not a size×color matrix) — but also, unlike the Website's `Variant.label`, **there is no single human-readable label string anywhere on `ProductVariant`** — a display label would have to be assembled from `channelMetadata` (Shopify-only, often absent for manually-created ERP variants) or derived from `packQuantity`+`UnitOfMeasure`.

**CRUD surface**: `product-variant.repository.ts`/`.service.ts` — `createVariant`, `findVariantById/BySku/ByBarcode`, `updateVariant` (Shopify-sync-safe subset: `sellingPrice`/`barcode`/`status`/`channelMetadata` only — **deliberately cannot touch `costPrice`/`minimumStock`/`reorderPoint`, by type signature, not convention**), `updateVariantManually` (the human-edit counterpart, covers exactly the fields the sync path excludes), `listVariantsForProduct`, `searchVariants`/`searchSellableVariants` (two different exclusion rules — see §2.1's offer-exclusion note; `searchSellableVariants` is the one that does NOT exclude offers, since a moderator must be able to reference anything a customer could actually order), `setVariantStockSource`/`clearVariantStockSource`.

### 2.3 Categories

`ProductCategory`: `id`, `companyId`, `name`, `parentCategoryId` (self-referencing tree, arbitrary depth), `recordStatus` (`active\|disabled\|archived`), `deletedAt`. **No slug, no code, no sort/order field, no description, no image reference.** `listCategories()` filters `recordStatus: "active"` AND `deletedAt: null` (a 2026-09-01 bug fix — previously archived categories leaked into every picker). A **separate, unrelated** `ProductCollection`/`ProductCollectionMembership` pair exists for Shopify's own many-to-many collection concept — not the same thing as `ProductCategory`, and not a Website-relevant entity (no evidence any doc or code expects the Website to consume Collections).

### 2.4 Pricing

Single current `sellingPrice`/`costPrice` per variant, `Decimal(14,4)`, no currency column, **no price history table, no effective-dated pricing, no customer-specific pricing, no discount/offer mechanism at the product/variant level** (order-level `discountAmount`/`discountPercent` exist on `SalesOrder`, unrelated to catalog pricing). `compareAtPrice` has no ERP column at all — it lives only inside Shopify's `channelMetadata`, informally, if present.

### 2.5 Media

**Confirmed again, more precisely this phase**: the `FileAsset.category` schema comment lists `"product_image"` as an illustrative example, but the actual, TypeScript-enforced `FileCategory` union (`src/lib/storage/types.ts`) has exactly seven values — `supplier_invoice\|purchase_order\|delivery_note\|brand_asset\|pdf_export\|excel_export\|attachment` — **`"product_image"` is not one of them.** This is a real, minor doc-vs-code drift inside the ERP's own schema comment (not just a stale external doc) — flagged, not fixed (out of this audit's scope; a one-line comment correction, not a functional change). No ordering/primary-image flag, no variant-level image relation, exists anywhere.

### 2.6 Inventory

`StockQuant` (onHandQuantity, reservedQuantity per variant+lot+location, computed-on-read `available = onHand − reserved`), `StockMove` (append-only ledger, the single write path via `postStockMove()`), `StockReservation` (created only at `confirmOrder()`, released only at `dispatchOrder()`), `Warehouse`/`StorageLocation` (multi-warehouse modeled, but Sales Orders hardcoded to one company-wide default warehouse — unchanged from Phase 6). **Negative on-hand is allowed by design, no DB constraint, guarded only by an application-level `WHERE` clause bypassed via `allowNegative: true`** at several call sites — unchanged from Phase 6.

**New this phase**: neither `getStockAvailability(ctx, variantId)` nor `getStockAvailabilityForVariants(ctx, warehouseId, variantIds)` (the two existing read functions) resolve `stockSourceVariantId` — see §7 for the full analysis. This is the phase's key new inventory finding.

### 2.7 Existing APIs reusable for catalog/inventory sync

**None, directly.** `/api/v1/products/export` is a session-cookie-gated (`product.view`), CSV-only, product-level (not variant-level — it only counts variants, never lists SKU/price/barcode per variant) export — wrong auth model, wrong granularity, wrong format for a machine-consumable catalog sync. No `/api/v1/inventory*` route of any kind exists. Confirms and sharpens Phase 6/7's "no reusable ERP API" finding — it's not just "no auth path," the one product-adjacent endpoint that does exist is also the wrong shape even ignoring auth.

### 2.8 Tenant isolation

Every repository function above takes `ctx: TenantContext` as its first parameter and hand-writes `where: { companyId: ctx.companyId, ... }` — re-confirmed by `npm run check:tenant-scope` (137 files, 0 violations, re-run this phase). No exception found in the products/warehouse modules.

### 2.9 Authorization

`product.view`/`product.manage` (products/variants/categories/BOMs, undifferentiated). Inventory has its own separate module permissions (`warehouse.*`, not re-enumerated here — out of this audit's product/category focus, unchanged from Phase 6).

### 2.10 Audit/Activity

Every product mutation calls both `recordAuditLog()` (mechanical before/after diff) and `recordActivity()` (human narrative) — confirmed directly in `product.service.ts`, consistent with the platform-wide two-call convention documented in Phase 6.

---

## 3. Actual Website findings

### 3.1 Prisma schema — real, but not customer-facing yet (see §3.2)

| Model | Fields |
|---|---|
| `Category` | `id`, `slug` (unique), `name`, `sortOrder`, timestamps. **No `erpCategoryId` column** (confirmed gap, unchanged from Phase 6/7). |
| `Product` | `id`, `erpProductId` (reference, unique, unpopulated), `categoryId`, `slug` (unique), `name`, `description` (nullable — Website HAS a description field ERP does not), `status` (`ProductStatus` — a real Prisma **enum**, `ACTIVE\|DISCONTINUED`, unlike ERP's plain string), `sortOrder`, `attributes` (Json?, "deliberately loose... never read/validated by this phase's code"), timestamps. |
| `Variant` | `id`, `productId`, `sku` (**globally unique**, not per-company — safe only under the one-website-one-ERP-company assumption already documented), `label` (String, required — a field ERP has no equivalent of at all, see §2.2), `priceAmountMinor`/`compareAtAmountMinor` (Int, minor units), `currency` (default `"EGP"`), `inventoryQuantity` (Int, raw projected quantity, "never exposed directly to the storefront"), `active` (Boolean), `sortOrder`, timestamps. **No `erpVariantId` — SKU is the entire cross-system identity for variants.** |
| `InventoryReservation` | `id`, `variantId`, `checkoutSessionId`, `quantity`, `status` (`ACTIVE\|CONSUMED\|RELEASED\|EXPIRED`), `expiresAt`, `createdAt`, `releasedAt`. |

All of the above are **real, migrated Prisma tables** — not mock in the schema/database sense. They are currently populated only by `prisma/seed.ts`'s labeled sample data (confirmed, unchanged from Phase 5/6).

### 3.2 The storefront UI is not wired to any of the above — the phase's key new finding

Direct inspection of every customer-facing catalog page:

| Page | Route | Data source |
|---|---|---|
| Shop (all products) | `src/app/(storefront)/shop/page.tsx` | `MOCK_PRODUCTS` (`src/ui/commerce/mock-products.ts`) |
| Shop by category | `.../shop/[category]/page.tsx` | `CATEGORIES` + `getMockProductsByCategoryName()` (`src/ui/commerce/categories.ts`, `mock-products.ts`) |
| Product detail (PDP) | `.../product/[slug]/page.tsx` | `MOCK_PRODUCTS`, `getMockProductBySlug()`, `CATEGORIES` |
| Search | `.../search/page.tsx` | `MOCK_PRODUCTS.filter(...)`, plain in-memory substring match — no real search index, no ILIKE/trigram query despite `blueprint.md`'s own stated intent ("indexed Postgres query") |

**Zero customer-facing page imports `catalogService` or queries `Product`/`Variant`/`Category` through Prisma.** `mock-products.ts`'s own header comment is explicit and honest about this: *"DEV/DEMO DATA ONLY — not real Jawaher Al Khair product information... Never imported from anywhere outside `src/app/(storefront)` and the dev showcase."* `generateStaticParams()` on both the category and PDP pages returns from `CATEGORIES`/`MOCK_PRODUCTS` (static in-memory arrays), so these pages are pre-rendered at build time (SSG) against the mock set, with no runtime database dependency at all today.

**"Add to Cart" does not add to a real cart.** `product-actions.tsx`'s `ProductActions` component (the PDP's buy button) fires an analytics event and shows a success toast — its own doc comment: *"Toast-only feedback, no real cart persistence, matching the cart-drawer's always-empty state in `src/ui/site/header-actions.tsx`."* Multi-variant products don't even get a working button — they show "يتوفر هذا المنتج بأكثر من خيار — اختيار الخيار المناسب متاح قريبًا" ("available soon"), by design, rather than fabricate a variant picker against data that doesn't model real variants.

**Meanwhile, a real, separate, tested commerce stack exists and works — just isn't called by any page**: `catalogService` (`src/modules/catalog/service.ts`) — `getCategory`/`listCategories`/`getProduct`/`listProductsByCategory`/`listAllProducts`/`getVariantForPurchase` — all real Prisma queries, real `Money` handling, real availability derivation (`deriveAvailability`/`getAvailableQuantity`). Exposed via real, tested JSON APIs: `GET /api/v1/products` (list, optional `?category=` filter — **no text-search parameter exists**), `GET /api/v1/products/[slug]`. `getVariantForPurchase` is explicitly the function Cart/Checkout call to "re-validate a line item against live data — never trust a client-supplied price/availability" — meaning the **cart/checkout backend is real and correctly wired to the real catalog tables; only the browse/PDP/search UI layer is not.**

### 3.3 SEO / structured data

`feature-completeness-audit.md` §5 (re-confirmed still accurate): `Product` JSON-LD is deliberately not emitted, specifically because the catalog is still mock — "a crawler reading JSON-LD has no way to know a price is a placeholder." `Organization`/`WebSite`/`BreadcrumbList` JSON-LD exist and are real (mechanically derived from actual routes).

### 3.4 Tests

Real, passing tests exist for the *real* stack: `tests/unit/inventory-availability.test.ts`, `tests/unit/money.test.ts`, `tests/integration/cart.test.ts`, `tests/integration/checkout.test.ts`, `tests/integration/inventory-concurrency.test.ts` (all against real Prisma models). `tests/unit/categories.test.ts` tests the **mock** `CATEGORIES` constant's own internal consistency (five categories, unique slugs, one featured) — a legitimate test of real UI-config code, but not a catalog-sync-relevant test. **No test exists for `catalogService` being called from any actual page component**, because no page calls it.

---

## 4. Entity/field mapping (ERP → Website)

Legend: **P** projection (ERP→Website, read), **W** website-owned, **S** immutable order-time snapshot (not applicable to catalog itself, noted for completeness), **MISSING IN ERP**, **MISSING IN WEBSITE**, **SEMANTIC CONFLICT**.

| Entity/field | ERP source | Website field | Transformation | Ownership | Sync behavior | Required for MVP? | Notes |
|---|---|---|---|---|---|---|---|
| Product identity | `Product.id` | `Product.erpProductId` | direct copy | P | upsert on pull | Yes | Column already reserved, unpopulated |
| Product name | `Product.name` | `Product.name` | direct copy | P | upsert | Yes | |
| Product description | **none** | `Product.description` | — | **MISSING IN ERP** | N/A | No (already resolved Website-owned, Phase 6/7) | Confirmed again: no ERP field of any kind |
| Product status | `Product.status` (`draft\|active\|discontinued\|archived`) | `Product.status` (`ACTIVE\|DISCONTINUED` enum) | `active→ACTIVE`; `discontinued\|archived→DISCONTINUED`; `draft→` excluded from pull entirely | P | upsert/exclude | Yes | **SEMANTIC narrowing, not conflict** — Website's 2-value enum can't distinguish discontinued from archived; both collapse to DISCONTINUED, which is an acceptable, already-intentional simplification, not a bug |
| Category (single) | `Product.categoryId → ProductCategory` | `Product.categoryId → Category` | ERP category id → new `Category.erpCategoryId` (does not exist yet) | P | upsert, requires new column | Yes | **MISSING IN WEBSITE**: `erpCategoryId` column |
| Category hierarchy | `ProductCategory.parentCategoryId` (real tree) | `Category` (flat, no parent field) | flatten to leaf, or add hierarchy | P, decision pending | — | Decision-gated | **MISSING IN WEBSITE** structurally — flat vs. hierarchical display remains an open business/design decision (unchanged from Phase 7) |
| Category name/slug | `ProductCategory.name` (no slug) | `Category.name`/`slug` | ERP has no slug — Website must generate one (from name, or a stable transliteration) if not already assigned | P + W (slug generation) | upsert | Yes | **MISSING IN ERP**: no slug field to project directly |
| Category sort order | **none** | `Category.sortOrder` | — | W | never synced | No | Already website-owned, no ERP equivalent, no conflict |
| Variant identity | `ProductVariant.id` | (none — SKU is the identity) | N/A | — | — | — | Website deliberately has no `erpVariantId` column; confirmed still correct given SKU is the stable identity on both sides |
| SKU | `ProductVariant.sku` (company-scoped unique) | `Variant.sku` (globally unique) | direct copy | P | upsert, match key | Yes | Safe only under one-website-one-company; already documented |
| Variant label | **none** (no first-class label field) | `Variant.label` (required) | Must be derived/assembled — **MISSING IN ERP** | P (once derived) + W (derivation logic) | upsert | Yes | Sharper than Phase 6/7's finding: ERP has no label at all, not even for non-Shopify variants. Candidate derivation: `packQuantity` + `UnitOfMeasure.name`, or `channelMetadata` option values when present, or a business decision to require ERP operators to fill in a display name |
| Barcode | `ProductVariant.barcode` (not unique) | **none** | — | — | not synced | No | Confirmed still not needed for MVP |
| Price | `ProductVariant.sellingPrice` (`Decimal(14,4)`, no currency column) | `Variant.priceAmountMinor` (`Int`, minor units) + `Variant.currency` (`String`, default `"EGP"`) | `round(sellingPrice * 100)` → minor units; currency is **not sourced from ERP at all** — Website's `currency` field would have to stay a fixed assumed value (`"EGP"`) unless ERP gains a currency concept | P (amount) / W (currency, by necessity) | upsert | Yes | Rounding rule must be explicit and applied once, in the adapter — unchanged recommendation from Phase 7 |
| Compare-at price | **none** | `Variant.compareAtAmountMinor` | — | **MISSING IN ERP** | not synced | No | Already resolved website-owned (Phase 6/7), reconfirmed: truly no ERP field, not even in `channelMetadata`'s documented shape |
| Variant status | `ProductVariant.status` (`draft\|active\|discontinued\|archived`) | `Variant.active` (`Boolean`) | `active→true`; everything else `→false` | P | upsert | Yes | **SEMANTIC narrowing** — same class as Product.status, acceptable |
| Inventory (raw) | `StockQuant` (per variant+lot+location) | `Variant.inventoryQuantity` (`Int`, single number) | **Must resolve `stockSourceVariantId` first (§7), then sum across locations/lots, then floor at zero** | P | scheduled pull | Yes | The single most technically involved projection in this whole table — see §7 |
| Media | **no real column** (`channelMetadata` informal only) | **no real model** (`ImagePlaceholder` only) | — | Neither side has one — **MISSING IN ERP and MISSING IN WEBSITE** | not synced | No (already resolved website-owned-by-necessity, Phase 6/7) | Confirmed again: ERP's own schema comment mentioning `"product_image"` is aspirational, not implemented (§2.5) |
| Primary image / sort | N/A | N/A | — | — | — | No | Moot until a media model exists on either side |
| Sort/order (product) | **none** | `Product.sortOrder` | — | W | never synced | No | Website-owned merchandising concern, no ERP equivalent — unchanged |
| Sort/order (variant) | **none** | `Variant.sortOrder` | — | W | never synced | No | Same |
| Attributes | **none** (no structured attribute system; `channelMetadata` is Shopify-only and informal) | `Product.attributes` (`Json?`, "deliberately loose... never read/validated") | — | **MISSING IN ERP and effectively unused in Website** | not synced | No | Both sides have deliberately deferred a real attribute system — consistent, not a conflict |
| Available quantity (derived) | Computed (`onHand − reserved`, after stock-source resolution) | Computed (`inventoryQuantity − active reservations`) | Two independent derivations, on two independent raw numbers — by design (Website's reservation is a safety margin over the *projected* quantity, never a live ERP read) | Both, independently | N/A — this is a derived read, not synced directly | Yes | Already-approved design, reconfirmed unchanged |
| Reserved quantity (ERP) | `StockQuant.reservedQuantity` | **not projected at all** | — | ERP-only | never synced | No | Correct and unchanged — the Website's own reservation is intentionally not a representation of ERP's reservation state |
| Warehouse | `Warehouse`/`StorageLocation` | **none** | Aggregated away entirely — the Website only ever wants one pooled number per SKU | ERP-only, aggregated before projection | N/A | Yes (aggregation happens ERP-side) | Unchanged from Phase 7 |

**Nothing above was invented.** Every "MISSING IN ERP" and "MISSING IN WEBSITE" marking was confirmed by direct field-list inspection this phase, not carried forward by assumption.

---

## 5. Ownership validation

Checked the approved model (ERP owns product master data/variants/SKUs/pricing/inventory/operational state; Website owns presentation/read-optimized projection/UX/search) against **actual current behavior**, not just schema intent:

- **No violation found in the schema or the real (`catalogService`) code path.** `Variant.priceAmountMinor`/`inventoryQuantity` are written only by `prisma/seed.ts` today (confirmed by grep, unchanged from Phase 5/6) — no application code path claims to be an independent source of truth for either.
- **However, the mock/demo UI layer (§3.2) is, in effect, a third, undocumented "source" of product presentation data — not a violation of the ERP/Website ownership split (it doesn't claim to be authoritative, and is explicitly labeled as fake), but it is a real, current inconsistency the approved architecture didn't anticipate needing to name**: today, "what a customer sees" and "what the real catalog tables say" are two completely unrelated things. This isn't ERP-Website ownership confusion — it's Website-internal: presentation code answering to nobody's data model at all yet. Flagged as a required fix (§12), not a silent architecture violation to paper over.
- **Search** (§3.2) does not use "indexed Postgres query (trigram/ILIKE)" as `blueprint.md`'s own stack-decisions table states — it's an in-memory JS `.filter()` over the mock array. This is not yet a real violation (nothing real to search yet), but the moment real data exists, this must be rebuilt against the real tables per the already-approved plan, not extended in place.

---

## 6. Catalog integration boundary — what the codebase supports today

Per the proposed boundary (`ERP → ERP Catalog API → Website ERP Adapter → Website Catalog Sync Service → Website Catalog Projection → Website API → Customer UI`):

| Capability | ERP-side support today | Website-side support today |
|---|---|---|
| Full catalog sync | No endpoint exists (§2.7) | No sync job exists; `catalogRepository`'s query shape is ready to be a write target |
| Incremental sync | No cursor/watermark mechanism exposed for products (the `ConnectorSyncCursor` table exists generically, unused for this) | No `since`-aware pull logic exists |
| Upsert | `createProduct`/`updateProduct` exist as ERP-internal operations; no external-facing upsert-by-external-key operation | `catalogRepository` has no upsert-by-`erpProductId` method yet — only `create`-shaped seed logic exists |
| Delete/deactivate | ERP never hard-deletes (confirmed again) — `status: discontinued/archived` is the real "removal" signal | Website's own `Product.status` enum already anticipates mirroring this (2-value narrowing, §4) |
| Category sync | No slug/hierarchy-export shape exists | `Category.erpCategoryId` column missing (§4) |
| Variant sync | `listVariantsForProduct` exists but is scoped per-product, not a bulk/paginated all-variants read | Ready to receive, no write path built |
| Media sync | N/A — neither side has a real media model (§4) | N/A |
| Price sync | Raw `sellingPrice` readable per-variant; no bulk/paginated price-only read | Ready to receive |
| Inventory sync | **Not ready as-is — see §7, the stock-source resolution gap** | Ready to receive an aggregated number |
| Idempotency | `ChannelMapping`'s unique-constraint pattern is proven and reusable (Shopify precedent) — not yet wired to a "website" channel | Read-only pulls need no idempotency key (a read has no side effect) |
| Retry | No ERP-side retry needed for this direction (Website pulls, ERP doesn't push) | No scheduler/retry-worker exists yet (unchanged from Phase 7/8 — still an open infra decision, recommended GitHub Actions) |
| Reconciliation | N/A yet | No reconciliation job exists yet (designed in Phase 7's `erp-integration-reconciliation.md`, not built) |
| Sync logging | `ConnectorSyncRun`/`AppLog` patterns exist and are directly reusable | `src/lib/logger.ts` exists and is directly reusable |
| Correlation IDs | `src/lib/request-id.ts` (ERP) exists, proven live in Phase 8/8.5 | `src/lib/request-id.ts` (Website) exists, proven live in Phase 8/8.5 |
| Partial failure handling | Not designed for this flow yet — a read pull failing partway through (e.g., page 3 of 10 fails) needs a defined behavior: **not yet decided** (flag for the build phase, not invented here) | Same |

**Nothing in this table required code changes to determine — it is a reading of what already exists.**

---

## 7. Inventory integration boundary — treated separately, per the brief

### 7.1 Why catalog and inventory sync cannot be the same operation

Catalog facts (name, category, price) change rarely and tolerate minutes of staleness with zero customer harm. Inventory must never let the Website believe more stock exists than the ERP actually has, because that directly causes overselling — a correctness property, not a UX one. They need different pull frequencies at minimum, and arguably different failure-handling postures (a stale catalog row is cosmetically wrong; a stale inventory row is a real business risk once volume grows).

### 7.2 The key finding: does ERP already expose enough data?

**No — not correctly, for a real fraction of the catalog.** Traced precisely this phase:

- `getStockAvailability(ctx, variantId)` and `getStockAvailabilityForVariants(ctx, warehouseId, variantIds)` both query `StockQuant` **directly by the given variant id**, with no resolution of `ProductVariant.stockSourceVariantId`.
- But a weight-tier variant (e.g., a "250 جم" SKU that redirects to its product's "1 كجم" base variant at some ratio) **never carries its own `StockQuant` rows at all** — by design, all real stock lives on the source variant (per `ProductVariant.stockSourceVariantId`'s own schema comment, confirmed in §2.2).
- Therefore, calling either existing function for a redirected variant returns **`onHand: 0, reserved: 0, available: 0`** — not because the product is actually out of stock, but because the function looked in the wrong place.
- The resolution logic **does exist**, just not composed with an availability read: `resolveOrderLineComponents()` (`product-variant.service.ts`) already converts "what was sold" (any variant, including a weight-tier redirect or a bundle/BOM assembly) into "what to actually check/move" — used today only by the order-confirm/fulfillment path (alerts, reservation, pick, dispatch, returns), never by a read-only availability check.

**What's missing, precisely**: a new function/composition — call it conceptually `getAvailabilityForCustomerFacingVariant(ctx, variantId)` — that calls `resolveOrderLineComponents()` (or an equivalent read-only resolution) first, THEN sums `StockQuant` across the resolved real stock-bearing variant(s), THEN divides back by the redirect ratio to express availability in terms of the ORIGINAL (sold) variant's own unit. **This does not exist today, on either side, in any form.** It is a genuinely new, small piece of ERP-side logic — not a config change, not a redesign, a real gap.

### 7.3 What exact response the Website requires

Per Phase 7's already-designed contract (`erp-api-contracts.md` §1.2, unchanged): `{ variantId, sku, availableQuantity }` where `availableQuantity = max(0, resolved-available)`. The resolution step above must happen **before** the floor-at-zero step, not after — floor-at-zero is about hiding a legitimately-negative on-hand balance from customers, not about masking a wrong-variant lookup.

### 7.4 Push vs. pull — reconfirmed, unchanged

Pull, scheduled, from the Website — the ERP has no evidence anywhere of an outbound-push capability toward a non-Shopify system (unchanged finding from Phase 6/7). Nothing this phase's code inspection found changes that conclusion.

### 7.5 How reservation truth remains in ERP, and how Website checkout stays consistent

Unchanged from Phase 6/7/8's already-thorough analysis (`erp-inventory-analysis.md`): the Website's own `InventoryReservation` remains a local safety margin over the *projected* `inventoryQuantity`, never a representation of ERP truth; ERP's own `StockReservation` is created only at `confirmOrder()` (still gated behind human moderation today, per Phase 6 — unchanged, still an open business decision, §9). This audit adds nothing new to that analysis beyond confirming it's still accurate against current code, and layering the stock-source-resolution requirement (§7.2) on top of it as a prerequisite for the *projection* to even be correct, independent of the *timing* question that analysis already covered.

---

## 8. Customer-facing invariants — where each is actually enforced today

| # | Invariant | Enforced where, today |
|---|---|---|
| 1 | ERP remains source of truth | Architecturally true (nothing writes `Variant.priceAmountMinor`/`inventoryQuantity` except `seed.ts`); **not yet mechanically enforced**, since no sync job exists to test this against real drift |
| 2 | Website cannot manufacture authoritative price | `mapDomainErrorToApiResponse`/checkout service never accept a client-supplied price (re-confirmed by code read, unchanged from Phase 4/5 review); `catalogService.getVariantForPurchase()` always re-reads the DB row |
| 3 | Website cannot manufacture authoritative stock | Same mechanism — `getAvailableQuantity()` always re-reads `Variant.inventoryQuantity` live, never trusts a cached/client value |
| 4 | No overselling | `reserveInventoryForItems()`'s `FOR UPDATE` row lock + transaction (verified previously by `tests/integration/inventory-concurrency.test.ts`, re-confirmed present, not re-run this phase since nothing changed here) |
| 5 | Order price snapshots immutable | `OrderItem.unitPriceAmountMinor` frozen at order-creation time, verified by a dedicated existing test (`tests/integration/checkout.test.ts`, per Phase 4/5's own citation, unchanged) |
| 6 | Catalog projection can go stale without corrupting ERP | Structurally true — the projection is a one-way read; **not yet exercisable**, since nothing writes it from a real source yet |
| 7 | Deactivated products cannot remain purchasable | `catalogService.getProduct()`/`getVariantForPurchase()` both check `status !== "ACTIVE"`/`!variant.active` and refuse — **but this only matters once real ERP status values are actually projected**; today, "deactivated" only ever means "the seed script's own hardcoded value" |
| 8 | Variant identity stable | SKU-as-identity is structurally stable on both sides (ERP: company-unique; Website: global-unique) — no code path renames or reuses a SKU found |
| 9 | SKU identity stable | Same mechanism as #8 |
| 10 | Tenant isolation intact | Re-verified this phase: ERP's `check:tenant-scope` (137 files, 0 violations) and Phase 8.5's live RLS/`TenantContext` verification — nothing in this audit's own inspection touched or risked either |

**Honest gap**: invariants 1, 6, and 7 are currently true only in the narrow sense that "nothing exists yet to violate them" — they have not been exercised against a real sync, because no sync exists. This is not a defect; it is simply the accurate current state, stated plainly rather than implied as "tested and verified" when it isn't yet.

---

## 9. Business decisions

Classification key: **A** technically resolvable now · **B** security/integration requirement · **C** requires business decision · **D** future-dependent · **E** deferred/out of scope.

| Decision | Class | Notes |
|---|---|---|
| Are unpublished (`draft`) ERP products ever visible to the Website? | **A** | Already technically resolved by the design in §4: `draft` is excluded from the pull entirely. No business input needed — this is a technical default consistent with "ERP owns operational state," reversible later if the business wants a "coming soon" feature |
| Category publishing rules (does every ERP category appear, or a curated subset?) | **C** | Genuine open business/merchandising question — not decidable from code |
| Product/variant activation rules for Website visibility | **A** | Already resolved by the status-mapping in §4 (`active`→visible, everything else→not) — consistent with existing ERP lifecycle semantics, no new rule invented |
| Inventory visibility threshold (exact low-stock number shown to customers) | **A** | Already resolved and working (`LOW_STOCK_THRESHOLD = 5`, Website-side constant, unrelated to ERP) — not reopened by this audit |
| Do out-of-stock products remain visible (vs. hidden entirely)? | **C** | Genuine open UX/business decision — current mock UI shows out-of-stock products with a disabled button, but this was never validated against real ERP inventory patterns (e.g., permanently-discontinued-but-not-yet-marked-so items) |
| Backorder policy | **C** | Unchanged from Phase 6/7 — the ERP itself allows oversell/negative stock as an internal operational choice; whether the Website should ever suggest "available for backorder" to a customer is a distinct, undecided business question |
| Reservation ownership | **A** | Already resolved architecturally (Website's reservation is local-only, never represents ERP truth) — re-confirmed unchanged this phase, not reopened |
| Stock sync frequency | **A**, pending **D** | A technical/ops tuning choice, not a business one (recommend inheriting the ERP's own precedent — hourly-class cadence — from Phase 7); blocked only on the scheduler mechanism existing at all (still not built, §6) |
| Product media sourcing | **C** | Unchanged from Phase 6/7 — neither system has a real model; who supplies/hosts real photography remains a content-operations decision, independent of this integration |
| Product photography status | **C** | Same decision as above, not a separate one |
| Price/tax display relationship | **C**, gated on a separate **C** | Tax policy itself remains unresolved on both sides (Phase 6/7, unchanged) — this audit found nothing new on the ERP side to change that; still a joint business decision, not decidable now |
| Variant display label (§4) | **C** | New to this audit: since ERP has no label field at all, the business must decide whether ERP operators are expected to fill in a display-worthy value (in `channelMetadata` or a new field) or whether the Website derives one algorithmically (e.g., from pack quantity + unit) — a real, previously-unstated open question |
| Category flat-vs-hierarchical display | **C** | Unchanged from Phase 7 — still open |
| Storefront UI rewiring (mock → real `catalogService`) | **A** | Not a business decision at all — a known, scoped Website-side engineering task, independent of ERP integration, and a hard prerequisite for catalog sync to have any visible effect (§1, §12) |

---

## 10. Completeness matrix

| Area | ERP status | Website status | Integration status | Gap | Classification | Required action |
|---|---|---|---|---|---|---|
| Products | Real, rich, working | Real schema, unpopulated by any real source, **not rendered by any page** | Not started | Storefront UI wiring + sync endpoint, both missing | A (UI wiring) / E (sync endpoint, future phase) | See §12 sequence |
| Variants | Real, working, no label field | Real schema, requires a label | Not started | Label-derivation decision (§9) | C then A | Decide, then implement in the sync adapter |
| Categories | Real tree, no slug | Real, flat, has slug | Not started | `erpCategoryId` column; flat-vs-hierarchy decision | E (column, trivial) / C (display model) | Decide before building |
| Attributes | None (informal `channelMetadata` only) | Present but unused (`Json?`, unread) | N/A | Neither side has a real system | E | No action until a real requirement exists |
| Pricing | Real, single current value, no currency field | Real, minor-units + currency | Conversion needed, no conflict | Rounding rule must be explicit | A | Define once, in the adapter, at build time |
| Media | No real model (schema comment aspirational only) | No real model | N/A | Both sides gap-equal | E | Business decision on sourcing (§9), not an integration task |
| Inventory | Real ledger, **stock-source resolution gap for reads** (§7) | Real projection field, unpopulated | **Not ready** | New ERP-side composition function needed | B/A (technical, but must be built before the read endpoint) | Build the resolution-aware availability read before exposing any inventory endpoint |
| Reservations | Real, ERP-side, confirm-gate still undecided | Real, Website-local, already correct and independent | Design complete (Phase 7), not built | Confirm-gate business decision still open | C (unchanged) | Decide before building the order-push path (not this phase's concern) |
| Warehouses | Real, multi-warehouse modeled, Sales hardcoded to one | N/A (aggregated away) | No gap — aggregation happens ERP-side | None new | H | None |
| Search | N/A (ERP has no customer-facing search concept) | In-memory `.filter()` over mock data, not the "indexed Postgres query" the architecture doc specifies | Not started | Must be rebuilt against real tables once real data exists | A (rebuild, once catalog is real) | Sequence after catalog projection exists |
| SEO | N/A | `Product` JSON-LD deliberately withheld (correctly) until real data exists | Blocked on catalog being real | None new | D | Add once catalog projection is real |
| APIs | No reusable endpoint exists (§2.7) | Real, tested, unused-by-UI endpoints exist | New ERP endpoints needed | Confirmed, unchanged | E (future phase) | Build per Phase 7's `erp-api-contracts.md` |
| Authentication | Real (Phase 8, live-verified) | Real (Phase 8, live-verified) | **Done** | None | H | None — reuse as-is |
| Tenant isolation | Real, verified live (Phase 8.5) | N/A (single-tenant Website) | **Done** | None | H | None |
| Authorization | `product.view`/`product.manage`, undifferentiated | N/A for a read-only integration credential | Adequate for a read-only pull | None new | H | None |
| Audit | Real (`recordAuditLog`+`recordActivity` on every product mutation) | Real (`AuditLog`, unused by catalog reads since reads aren't audited anywhere in this codebase, correctly) | Adequate — a read pull needs no audit trail, only an operational log entry | None | H | Log pulls to `AppLog`/`src/lib/logger.ts` (both exist), not `AuditLog` |
| Logging | Real (`AppLog`, live-verified Phase 8.5) | Real (`src/lib/logger.ts`) | Ready to extend | None | H | Extend to the new endpoints when built |
| Idempotency | `ChannelMapping` pattern proven, not wired to "website" | `IdempotencyKey` pattern proven | Not applicable to a read-only pull; needed only for the future order-push direction | None new for catalog/inventory specifically | E | Out of this phase's scope (order integration) |
| Error handling | Existing per-route conventions, reusable | `erp_integration` category already reserved | Ready | None | H | Reuse |
| Retry/reconciliation | Designed (Phase 7), not built | Designed (Phase 7), not built | Not started | Scheduler mechanism still not built | E | Build per Phase 7's `erp-integration-reconciliation.md` |
| Testing | Real tests for adjacent modules; none for catalog-sync specifically (doesn't exist yet) | Real tests for the real (unused) catalog stack; none for a sync job (doesn't exist yet) | Not started | — | E | Write per `erp-integration-testing-plan.md` once building |
| Documentation | This document + Phase 6-8 set | Same | Current | None | H | Keep current as implementation proceeds |

---

## 11. Technical gaps — summary list

1. **ERP: no stock-source-aware availability read function** (§7.2) — the single most important technical gap found this phase. Must be built before any inventory endpoint.
2. **ERP: no reusable catalog/inventory read API** (§2.7, unchanged from Phase 6/7) — confirmed again, sharper (the one product-adjacent endpoint that exists is the wrong shape regardless of auth).
3. **Website: storefront UI is 100% disconnected from the real catalog stack** (§3.2) — new, precise finding this phase. A real prerequisite, independent of ERP.
4. **Website: `Category.erpCategoryId` column does not exist** (unchanged from Phase 6/7).
5. **Website: no real search implementation** (§3.2/§10) — currently in-memory filtering over mock data; must be rebuilt, not extended, once real data exists.
6. **Neither side has a variant display-label concept ERP can supply** (§4) — sharper than previously documented; requires a business decision (§9), not just a technical mapping.
7. **Neither side has a real media/photography model** (unchanged, reconfirmed with a note on the ERP's own schema-comment/code drift, §2.5).
8. **No scheduler mechanism exists on the Website side** (unchanged from Phase 7/8) — blocks building any sync job regardless of catalog/inventory readiness otherwise.

---

## 12. Recommended implementation sequence

Design-only — nothing below is built by this phase.

1. **Decide** the open business/design questions in §9 that gate the rest (category display model, variant label policy, out-of-stock visibility) — these determine the shape of steps 2+, so deciding late risks rework.
2. **Website-side, independent of ERP**: rewire the storefront UI (shop/category/PDP/search pages) from `MOCK_PRODUCTS`/`CATEGORIES` to `catalogService`, against the existing seeded sample data first (no ERP dependency needed to do this step — it makes the real stack customer-visible using what already exists in the database today). This is the single highest-leverage, lowest-risk next step: it doesn't wait on any ERP work at all.
3. **ERP-side**: build the stock-source-aware availability composition (§7.2) as a standalone, unit-testable function, before building any endpoint around it.
4. **ERP-side**: build the new read endpoints per `erp-api-contracts.md` §1.1/§1.2 (products/categories/prices, then inventory), using the auth foundation already built and live-verified in Phase 8/8.5.
5. **Website-side**: build the scheduled pull job + projection writer, using the endpoints from step 4, writing into the *same* real tables step 2 already wired the UI to.
6. **Website-side**: rebuild search against the now-real tables (indexed Postgres query, per the original architecture intent) — not before, since there's nothing real to search until step 5.
7. Add `Product` JSON-LD once the catalog is genuinely real (per `feature-completeness-audit.md`'s own already-stated condition).

Step 2 deliberately does not wait for any ERP work — it is pure Website-side value, usable and testable today.

---

## 13. Risks

- **Silent overselling if the stock-source gap (§7.2) is missed**: building an inventory endpoint directly on `getStockAvailability()` without the resolution step would not oversell (it would report *zero* stock, the safe direction) — but it would make every weight-tier product appear permanently out of stock, a severe, customer-visible correctness bug in the opposite direction. Flagged explicitly so it cannot be missed when that endpoint is eventually built.
- **Rewiring the storefront (step 2) touching customer-facing behavior**: this phase does not implement it, but flags that when it is implemented, it is real behavior change (unlike ERP integration's backend-only nature so far) and should go through the same customer-facing review rigor as any other UI change — not treated as "just wiring."
- **Search rebuild risk**: replacing an in-memory filter with a real indexed query is a genuine implementation task with its own performance/relevance considerations — not a trivial swap, flagged so it isn't underestimated in sequencing.
- **The variant-label decision (§9) arriving late**: if deferred too long, ad hoc label logic may get built ad hoc inside the sync adapter without a real decision behind it — the recommendation is to decide this specifically before step 4/5 of §12, not after.

---

## 14. Explicit non-goals (this step)

Per the brief: no Catalog API, no Inventory API, no sync job, no changes to checkout/cart/order/payment/shipping logic, no Shopify migration work, no Website Admin, no change to current customer-facing catalog behavior. **None of these were done.** The only artifacts produced are this document and (if any) minor doc corrections noted in §15.

---

## 15. Final readiness assessment

**Design mapping: READY.** Every entity/field this phase was asked to map has a documented, code-verified answer — nothing was left to guess, and every "MISSING IN ERP"/"MISSING IN WEBSITE" marking is a confirmed fact, not an assumption.

**Technical readiness to BEGIN building Catalog Integration: NOT YET** — two concrete, scoped prerequisites stand in the way, neither of which is a business decision: (1) the ERP-side stock-source-aware availability composition (§7.2/§11.1), and (2) the Website storefront-UI rewiring (§3.2/§11.3), which is actually independent of ERP and can start immediately, in parallel with ERP-side design.

**Business readiness: PARTIALLY BLOCKED** — §9's genuine `C`-classified decisions (category display model, variant label policy, out-of-stock visibility, media sourcing, tax/price-display relationship) should be resolved before the sync job's exact contract is finalized, though none of them block starting step 2 of §12.

**No BLOCKER-severity item was found.** No security defect was found in this audit's scope (it did not re-examine auth/RLS, already closed in Phase 8.5/8.5R). No schema change was made or found necessary to merely document this audit's findings.

---

## 16. Phase 9.1 addendum — Website Catalog Reconnection (implemented)

Prerequisite (2) above is now done. ERP is not involved in any way in this section — confirmed by `git diff` showing zero ERP repository changes.

### 16.1 What changed

- `/shop`, `/shop/[category]`, `/product/[slug]`, `/search` now call `catalogService` directly (Server Components calling the service, not a self-fetch through `/api/v1/products` — the existing JSON API routes remain untouched, available for any real client-side/external consumer, unused by these pages by design). `MOCK_PRODUCTS`/`getMockProductBySlug`/`getMockProductsByCategoryName` no longer appear anywhere in these four files.
- New `src/ui/commerce/catalog-adapters.ts` — the one place a `ProductView`/`VariantView` gets reshaped into the existing `ProductCardData` contract. `ProductCard`/`ProductGrid`/`PriceDisplay`/`QuickAddButton` were **not modified** — every adaptation the real catalog's richer shape required (genuine multiple variants, no media, no bestseller flag) lives in the adapter, not in a UI redesign.
- New `catalogService.searchProducts()`/`catalogRepository.searchActiveProducts()` — the one new capability added (§3's "genuinely required minimal addition," not a new module, not a new architecture). Case-insensitive Postgres `contains` against product name and category name, replacing the old in-memory `Array.includes()` scan. **No Arabic-specific normalization was added** — none was found already implemented or specified anywhere in this codebase to preserve, and inventing one would have been exactly the "fuzzy search" this phase's brief forbade introducing.
- PDP "Add to Cart" (`product-actions.tsx`) now calls the real, already-existing `POST /api/v1/cart/items` for single-SKU products — the prop was renamed `productId → variantId` (cart keys on the real `Variant.id`, not the product id). This is connecting to an existing, working boundary, not new cart business logic. The grid's own quick-add (`quick-add-button.tsx`) was deliberately **not** wired — only the PDP was named in this phase's scope; it remains toast-only.
- **A real build-time bug was found and fixed**: `/shop` (no dynamic segment) was, by Next.js's default behavior, attempting to statically prerender at build time — confirmed directly (`npm run build` tried to query the real database mid-build). `export const dynamic = "force-dynamic"` was added to all four pages to guarantee per-request rendering, never a build-time snapshot of price/availability. This was not a hypothetical risk flagged in review; it was reproduced.
- `generateStaticParams` removed from `/shop/[category]` and `/product/[slug]` for the same reason (was baking a listing/lookup shape around static params, now meaningless once the underlying data is live and changeable).
- `sitemap.ts` and `structured-data.ts`'s Product-JSON-LD withholding: **kept, deliberately, with updated reasoning**. The original comments justified withholding by "the catalog is mock." That's no longer true (the pipe is real), but the seeded content itself still carries a literal `" (اسم تجريبي)"` suffix on every name — the actual reason for withholding (don't tell search engines a placeholder price is real) is unchanged. Updated both comments to say so precisely rather than leaving a now-inaccurate justification in place.
- Home page's "best sellers" section (`MOCK_BEST_SELLERS`) was **deliberately left unreconnected** — not named in this phase's explicit scope (only /shop, /shop/[category], /product/[slug], /search were), and "best seller" has no backing concept in the real schema to reconnect to (confirmed absent, per §9's own **C** classification) — substituting an arbitrary stand-in (e.g. "first N products") would have silently invented a ranking policy nobody asked for.

### 16.2 Data-contract audit outcome (§2 of the Phase 9.1 brief)

| Mock field | Real source | Transformation | Classification |
|---|---|---|---|
| `ProductCardData.price`/`availability` (flat, one per product) | `VariantView.price`/`availability`, per real variant | `pickPrimaryVariant()`: first active variant, else first at all | **A** — safe derivation, not a business decision |
| `imageAlt` | none (no media on either side) | Generic `صورة المنتج — ${name}` string | **A** |
| `badge` (bestseller) | none (confirmed absent from schema) | Omitted entirely | **B** classification resolved to "don't fabricate" — no backend field exists to expose even if wired |
| PDP description accordion text | `Product.description` (real column) | Direct use; the mock version's hardcoded template text is, not coincidentally, identical to what `seed.ts` actually seeds | **A** |
| Search match fields | `Product.name` OR `Category.name`, same two fields the mock matched | Postgres `contains`, case-insensitive | **A** |
| Arabic search normalization | **none found to preserve** | Not invented | **D** — deferred; would require a real specification first, none exists |
| Category display (flat vs. `ProductCategory`'s real ERP hierarchy) | Not applicable to this phase — the Website's own `Category` table is already flat, matching `CATEGORIES`' nav config exactly | N/A | Resolved — this question only applies to the *ERP* sync (§9 of the main document), not this Website-internal reconnection |

Nothing was silently invented; every **C**/**D** item above is named, not implemented.

### 16.3 Cart boundary determination (§10 of the Phase 9.1 brief)

- Can the PDP call the existing cart API? **Yes — confirmed and wired.** `POST /api/v1/cart/items` is real, session-cookie-based, already tested (`tests/integration/cart.test.ts`), and required no new business logic.
- Was product/variant identity previously wrong? **Yes — a real, fixed defect.** The mock components passed `Product.id` where the cart API requires `Variant.id`; for single-SKU products these are different real ids. Fixed by resolving and passing the primary variant's id.
- Does authoritative data come from the real catalog? **Yes**, via `catalogService.getProduct()`.
- Remaining blocker: **the grid's quick-add button remains unwired** (deliberately, out of this phase's named scope — see §16.1) — not a technical blocker, a scope boundary. Multi-variant "Add to Cart" also remains unbuilt (needs a real variant-picker UI, explicitly excluded from this phase).

### 16.4 Testing

| Layer | File | Result |
|---|---|---|
| Unit (pure, no DB) | `tests/unit/catalog-adapters.test.ts` | 9/9 passing |
| Integration (real DB, `skipIf`) | `tests/integration/catalog-storefront.test.ts` | 10 tests written against the established `isDatabaseAvailable()`/fixture pattern; **skipped in this sandbox** (confirmed `ECONNREFUSED` — no local Postgres/Docker available here, same disclosed, pre-existing limitation as every other integration test in this repo) — will run for real in CI or on a machine with the local database up |
| Full suite | `npm test` | 92 passed, 32 skipped (was 83/22 before this phase — net +9 real, +10 honestly-skipped), 0 failed |
| Typecheck/lint | `npm run typecheck` / `npm run lint` | Clean |
| Production build | `npm run build` | **Failed once for a real reason (§16.1's build-time DB call), fixed, then succeeded** — route manifest confirms `/shop`, `/shop/[category]`, `/product/[slug]`, `/search` are all `ƒ` (dynamic, server-rendered on demand), not statically prerendered |

No test result in this document is asserted without having actually been run.

---

## 17. Phase 9.2 addendum — ERP Inventory Availability Resolution (implemented, ERP-side only)

Closes technical gap #11.1/§7.2/§11 above: **ERP now has a stock-source-redirect-aware availability read**, built ahead of exposing any inventory API to the Website (which remains not built — no Website change was made this phase, confirmed by `git diff` in the Website repo showing zero changes for this addendum beyond this documentation).

### 17.1 Root cause (confirmed, not assumed)

`getStockAvailability()`/`getStockAvailabilityForVariants()` (ERP `src/modules/warehouse/services/{stock-move,reservation}.service.ts`) both query `StockQuant` directly by the variant id they're given. A weight-tier variant with `ProductVariant.stockSourceVariantId` set never carries its own `StockQuant` rows — all physical stock lives on the source variant. The ERP's own order-alert path (`computeStockAlertsBatch`, `sales-order.service.ts`) already avoided this correctly, but only because it happens to pre-resolve via `resolveOrderLineComponents()` before calling the availability function — no equivalent existed as a standalone, reusable read.

### 17.2 Corrected resolution path

New function `getSellableAvailability(ctx, productVariantIds)` in the same file as `getStockAvailabilityForVariants` (`reservation.service.ts`) — composes, rather than reimplements:

```
sellable variant ids
  -> resolveOrderLineComponents(ctx, ids.map(id => ({productVariantId: id, quantity: 1})))   [Products module, UNMODIFIED]
  -> unique real component variant ids + their per-unit ratio
  -> listStockQuantsForVariants(ctx, {productVariantIds: componentIds})   [Warehouse module, UNMODIFIED, company-wide]
  -> per component: floor((onHand - reserved) / unitsPerSellableUnit)
  -> per requested variant: min(...) across its components (== itself for the ordinary 1-component case)
```

Neither `resolveOrderLineComponents` nor either existing availability function was modified — this is purely additive (confirmed: `git diff` shows 0 deletions in `reservation.service.ts`). The cross-module import (Warehouse importing from Products) follows an already-established precedent (`warehouse-operations.service.ts` already imports `@/modules/products/repositories/bom.repository` directly) — not a new architectural direction.

### 17.3 Classification of read paths found (§3 of the brief)

| Function | Classification | Disposition |
|---|---|---|
| `getStockAvailability` (single variant, company-wide) | Authoritative for a real, stock-bearing variant's own physical numbers | Unchanged — still correct for its own narrow job |
| `getStockAvailabilityForVariants` (batch, per-warehouse) | Authoritative, but requires pre-resolved component ids (as its own doc comment already stated) | Unchanged — its one real caller (`computeStockAlertsBatch`) already pre-resolves correctly |
| `listStockQuants` / `listLowStockVariants` | Authoritative, direct physical-stock views for Warehouse Ops (by variant/location) | Out of scope — these are correctly variant-id-literal (a redirected variant has nothing to show here by design; nothing to fix) |
| `resolveOrderLineComponents` | Authoritative resolution logic (the one place `stockSourceVariantId`/assembly-BOM composition is interpreted) | Unchanged, reused as-is |
| `aggregateStockLines` | Derived (consumption-total helper, packing slips) | Unrelated to availability; not touched |
| **`getSellableAvailability` (new)** | **Authoritative for "is this sellable variant in stock," redirect-aware** | New this phase |

### 17.4 Invariant confirmed

For a sellable variant with `stockSourceVariantId`, availability is now computed from the physical source variant's real inventory, subject to the schema's actual `stockSourceRatio` (or `BomLine.quantity` for a bundle) — never an assumed 1:1 ratio. Verified directly: a redirect at ratio 0.25 against 10 physical units correctly reports 40 sellable units (test 2b), not 10.

### 17.5 Edge cases — documented, not invented (§6/§13)

| Case | Behavior | Basis |
|---|---|---|
| Missing/dangling source | Reports `available: 0` | The company-scoped `StockQuant` query simply matches nothing — same safe path as any real "no stock" case, no special-casing added |
| Inactive/discontinued source variant | Physical stock still counts, unchanged | Confirmed: neither the existing resolver nor the new function ever reads the source variant's `status` — preserving exactly the existing order-consumption behavior, not a new rule |
| Cyclic reference (A→B, B→A at the data level) | Resolves in exactly one hop; never recurses | Structural property of the reused, non-recursive `resolveOrderLineComponents` — inherited, not newly added |
| Non-positive `stockSourceRatio`/BOM quantity | Treated as zero contribution (the safe, never-overselling direction) + logged via the existing `AppLog`-backed `logger` | No existing write-path validation exists for this either (§13: preserving convention, not inventing a stricter one); logging reuses the existing mechanism, no new error code |
| Multiple sellable variants redirecting to the same source | Each independently reads the source's full real total — never double-counted or split | Verified directly (test 3) |
| Assembly BOM (bundle) | `available` = `min` across every real component's own derived count — the standard, forced "how many can be assembled" formula | Not an invented business rule — the direct mathematical consequence of the existing consumption model, applied to a read instead of a write; flagged in §17.7 for business awareness, not held back on it |

### 17.6 Tenant isolation — verified, not assumed

Test 9 (`reservation.service.test.ts`) constructs a real scenario: Company A's variant has `stockSourceVariantId` pointing to an id that genuinely has stock — but under Company B. Result: `available: 0`, not Company B's real 500 units. This holds structurally because every query in the composition (`findStockSourcesByIds`, `listStockQuantsForVariants`) already filters by `companyId: ctx.companyId` — there is no code path in this composition that can cross the boundary, with or without a hostile/malformed `stockSourceVariantId` value. Test 9b confirms the positive case (Company A correctly resolves through its own same-id source) isn't broken by the same fix.

### 17.7 Business decisions — none invented, one flagged for awareness

No business decision was required to build this fix (it's a pure correctness/domain-arithmetic correction, not a policy choice). One item is flagged for awareness, not blocking: **assembly-BOM (bundle) availability now follows the mathematically-forced "min across real components" rule** (§17.5) — correct per the existing schema/consumption model, but never previously exercised by any read path. If the business has additional real-world constraints on bundle availability beyond raw component math (e.g., packaging capacity, assembly labor time), those are out of this model entirely and would need to be raised separately — not assumed here either way.

### 17.8 Future Inventory API readiness

The internal contract this phase establishes (`SellableVariantAvailability` — requested variant, physical source(s), on-hand, reserved, derived available) is exactly what a future Website-facing inventory endpoint should be built on, per `erp-api-contracts.md` §1.2 and `erp-inventory-analysis.md` §7.3 (both already anticipated "the resolution step must happen before the floor-at-zero step" — now a real, tested function, not just a design note). That future endpoint would additionally floor `available` at zero before returning it to the Website (this function deliberately does not, to stay maximally informative internally) and would never expose `sources` (an ERP-internal detail). **Still not built this phase, per its own explicit instruction** — no Website Inventory API, no ERP Catalog API, no sync job.

---

## 18. Phase 9.3 addendum — ERP Catalog & Inventory Integration API (implemented, ERP-side only)

Closes §17.8's own forward pointer and technical gap #11 (§11 above: "no reusable ERP API exists"). **The ERP now exposes the actual API boundary** the Website's future adapter will consume — three endpoints, read-only, built exactly on top of the unmodified §17 `getSellableAvailability()` composition. Full contract documented separately: [`erp-catalog-inventory-api.md`](./erp-catalog-inventory-api.md).

### 18.1 What was built (ERP repo only)

| Endpoint | Method | Backs onto |
|---|---|---|
| `/api/v1/integrations/website/catalog/products` | `GET` | `product.service.ts`'s new `listProductsForWebsiteIntegration`, unmodified `productRepo.listProducts` |
| `/api/v1/integrations/website/catalog/categories` | `GET` | `category.service.ts`'s new `listCategoriesForWebsiteIntegration`, unmodified `categoryRepo.listCategories` |
| `/api/v1/integrations/website/inventory/availability` | `POST` | new `getSellableAvailabilityBySkus()` — a SKU-keyed wrapper around §17's own, still-unmodified `getSellableAvailability()` |

Reused, not reinvented: Phase 8's `verifyWebsiteIntegrationRequest()` auth, the existing `TenantContext`/ADR-0001 tenant mechanism, and §17's inventory-resolution logic. No schema change, no new dependency, no second auth system (confirmed by `git diff --stat` on both repos — the ERP diff is 5 additively-modified files + 3 new routes + 3 new test files; the Website diff is documentation-only).

### 18.2 Cross-system identity gap resolved: SKU, not internal id

The Website's `Variant` model carries no `erpVariantId` column (confirmed by schema inspection this phase) — SKU is the only shared identifier between the two systems. This forced the inventory endpoint to be SKU-keyed rather than ERP-variant-id-keyed, which in turn required one new repository function, `findVariantsBySkus()` (`product-variant.repository.ts`), to resolve SKU → internal variant id before calling §17's function. Documented here because it's a real, load-bearing integration-shape decision, not an incidental implementation detail.

### 18.3 Fields deliberately not exposed (data-quality gaps, not fabricated)

Per §4/§9 above (variant label, media, currency — all previously flagged as open/missing), this phase did **not** invent values for any of them. `erp-catalog-inventory-api.md` §7 documents each omission and why. None of these gaps were resolved by this phase — they remain open business/data-model decisions, now with a concrete, documented point (the catalog API's product/variant DTOs) where a future decision would need to land.

### 18.4 Rate limiting — deferred, documented as future hardening

No reusable rate-limiting mechanism fit this API's shape without real adaptation work; judged not-otherwise-unsafe without it (read-only, high-entropy credential space, same reasoning already accepted for Phase 8's health endpoint). See `erp-catalog-inventory-api.md` §15 for the full justification. Not implemented — flagged, not silently dropped.

### 18.5 Verification

63/63 ERP tests passing (16 Phase 8 + 15 Phase 9.2 + 32 new this phase — 15 catalog/products, 4 catalog/categories, 13 inventory/availability), `npm run check:tenant-scope` (138 files, 0 violations), `npm run typecheck`, `npm run lint`, `npm run build` all clean. No live-Postgres integration test was needed or written this phase — every new test uses the same module-mock (`vi.mock("@/lib/prisma")`) pattern already established in Phase 8/9.2, with genuine `where`-clause-filtering fakes proving tenant isolation is real rather than assumed.

### 18.6 Still not built (unchanged from §17.8's own caveat)

No Website code was touched (confirmed by `git status` on the Website repo showing zero changes beyond this documentation). No Website ERP-adapter, no sync job, no scheduled pull — that remains the next, separately-reviewed phase.

### 17.9 Testing (§10/§15 of the brief) — what was actually executed

| Test | File | Result |
|---|---|---|
| All 10 required scenarios (+3 supplementary: ratio≠1, non-positive ratio, empty input) | `ERP JAW/src/modules/warehouse/services/reservation.service.test.ts` | **15/15 passing, actually executed** — no real database touched (module-level mock of `@/lib/prisma`, filtering by `companyId`/`id in (...)` exactly like the real queries, so the tenant-isolation test is a genuine proof, not a tautology) |
| Regression: existing Phase 8/8.5 ERP unit tests | `integration-auth/service.test.ts`, `.../health/route.test.ts` | 16/16 still passing, run together with the new suite |
| ERP typecheck / lint / tenant-scope check | `npm run typecheck` / `lint` / `check:tenant-scope` | All clean (138 files scanned, 0 violations) |
| ERP production build | `npm run build` | Succeeded |
| Website-side tests | — | **Not run — no Website file was touched this phase**, so there was nothing to re-verify there |

Nothing in this addendum is asserted without having been actually executed, per the brief's explicit instruction to distinguish executed/skipped/unavailable — everything above was executed; nothing was skipped or unavailable this phase (no live-database dependency exists in the new code at all, by design, since it's mocked at the Prisma-module level).

---

## 19. Phase 9.3R addendum — draft/publishing rule corrected; contract gaps re-documented

Phase 9.3's review found that its draft-exclusion behavior (§18) had drifted from this document's own §4/§9 classification of "visibility/publishing rules for unpublished products" as an **open business decision** — Phase 9.3 had implemented it as a hard, un-reversible `400`-on-`status=draft` rule instead. Investigation (code + git history) confirmed this was never an existing ERP rule; it was invented during the integration work itself (self-flagged one phase earlier in `erp-integration-implementation-plan.md` §12 as a "technical default... reversible later," not a business-approved rule).

**Correction**: the safe default (excluding `draft` when no `status` filter is given) is unchanged; the hard `400` rejection of an explicit `status=draft` request was removed — the API no longer forecloses a future reconciliation process's ability to ever learn that a product transitioned to `draft`. Full rationale, the ERP-status/Website-visibility/integration-read three-way distinction, the per-field (variant label/media/currency) capability-vs-behavior-vs-classification breakdown, and the reconciliation-gap analysis all now live in `erp-catalog-inventory-api.md` §17 — not duplicated here to avoid the two documents drifting apart again.

This remains **still open**, unchanged: whether draft/unpublished products should ever be visible to the Website (e.g. a future "coming soon" feature) — this phase corrected the API's contract to stop pre-deciding that question, not answered it.

---

## 20. Phase 9.4 addendum — Website ERP Catalog Sync (implemented, catalog only)

Closes the last item §11 flagged as missing: the Website side of the boundary now actually exists. Full design: [`website-erp-catalog-sync.md`](./website-erp-catalog-sync.md). Summary only, here, to avoid the two documents drifting apart (the same discipline §18/§19 already followed).

Built: `erpCatalogAdapter` (typed `listProducts`/`listCategories` on top of Phase 8's unmodified client), a catalog sync service (`runFullSync`/`runIncrementalSync`) with idempotent upserts keyed by stable ERP identifiers, a full-sync deactivation sweep, and a DB-native concurrency guard. **One schema change was required and is documented before being made** (per this phase's own instruction): `Category.erpCategoryId String? @unique`, mirroring `Product.erpProductId`'s pre-existing pattern — ERP's category DTO has no other field the Website could safely match on. Two small additional tables (`CatalogSyncRun`, `CatalogSyncLock`) back observability, the incremental watermark, and the concurrency guard — deliberately minimal, not a sync platform.

**Inventory was not touched** — `Variant.inventoryQuantity` is never written by this code, and the ERP inventory endpoint is never called from it. That remains the next, separately-reviewed phase (see `website-erp-catalog-sync.md` §20 for the explicit boundary).

**Business decisions not resolved, consistent with §4/§9/§17/§19 above**: category hierarchy is dropped (not encoded as "flat" permanently — the Website schema simply has no field for it yet), variant label and category/product slugs use deterministic, non-fabricated ERP-id-based fallbacks pending a real presentation decision, and draft/publishing visibility is untouched (this sync never requests `status=draft`, matching §19's correction rather than reopening it).

**Verification**: 31 unit tests (mapper + adapter), both EXECUTED and passing; 11 real-database integration tests, written but SKIPPED in this sandbox (no local Postgres — same disclosed limitation as every other integration test in this repo); full existing suite re-run with no regressions (124 passed/43 skipped, 0 failed); typecheck/lint/build all clean.

**Phase 9.4R correction** (same document, `website-erp-catalog-sync.md` §21): review found variant sync was matching on `sku` instead of ERP's own stable variant id (already present in the API contract but not used for identity) — corrected by adding `Variant.erpVariantId String? @unique` and re-keying the upsert/sweep on it; SKU is now synced as a plain ERP-owned field, never the match key. Field ownership (§4) was reviewed and classified explicitly per field rather than summarized as one blanket rule. Money conversion was verified to already use correct EGP "piaster" terminology (no "baisa" or other mismatched term found anywhere) and was tightened to derive its minor-unit scale from `Money`'s own shared definition instead of a second hardcoded value. Tenant safety was verified (not assumed): all three ERP identifiers are globally-unique UUIDs, and the Website's ERP integration is structurally single-connection, so no cross-tenant collision is possible.
