# Website ERP Catalog Sync (Phase 9.4)

Status: implemented and tested on the Website side. Last updated: 2026-09-12.

**Scope**: catalog synchronization only. **Inventory is not synced by this module** — see §17.

---

## 1. Purpose

Populates the Website's catalog projection (`Category`/`Product`/`Variant`) from the ERP Catalog API built in Phase 9.3/9.3R, closing the last prerequisite `catalog-inventory-gap-analysis.md` named for real ERP-backed catalog data on the storefront. Before this phase, those tables held only hand-seeded sample data (`prisma/seed.ts`).

## 2. Architecture

```
ERP  ->  ERP Catalog API (Phase 9.3/9.3R)  ->  Website ERP Adapter (src/modules/erp-integration/catalog.ts)
     ->  Website Catalog Sync Service (src/modules/catalog-sync/)
     ->  Website Catalog Projection (Category/Product/Variant tables)
     ->  catalogService (unchanged)  ->  Customer UI (unchanged)
```

No new path exists from the customer/frontend to the ERP, and none from the Website's Prisma layer to the ERP's own database — the sync module only ever calls the same HTTP boundary Phase 8/9.3 already built. `catalogService`, its repository, and every customer-facing route are **unmodified** by this phase — they already read from the same tables the sync now populates, so a synced product is visible to them by construction (see §19 for the specific proof).

## 3. ERP authority

Unchanged from `docs/architecture/data-ownership.md`: ERP remains authoritative for product/variant identity, SKU, category relationship, price, and operational status. This phase's sync always overwrites those fields from ERP; nothing here changes that ownership model.

## 4. Website projection role — field ownership table

| Model.field | Owner | Sync behavior |
|---|---|---|
| `Category.name` | ERP | Always overwritten |
| `Category.erpCategoryId` | ERP (identity) | Set once, matched on |
| `Category.slug` | Website (placeholder until a real decision exists — §18) | Set only at creation, **never** overwritten |
| `Category.sortOrder` | Website (presentation) | Never touched |
| `Product.name` | ERP | Always overwritten |
| `Product.status` | ERP (mapped — §9) | Always overwritten, plus the full-sync deactivation sweep (§8) |
| `Product.categoryId` | ERP (relationship) | Always overwritten |
| `Product.erpProductId` | ERP (identity) | Set once, matched on |
| `Product.slug` | Website (placeholder — §18) | Set only at creation, **never** overwritten |
| `Product.description` | Website (rich content) | **Never** touched — left `null` on create |
| `Product.sortOrder`, `Product.attributes` | Website | Never touched |
| `Variant.sku` | ERP (identity) | Set once, matched on — SKU never becomes a *website-assigned* value |
| `Variant.active` | ERP (mapped — §9) | Always overwritten, plus the full-sync deactivation sweep (§8) |
| `Variant.priceAmountMinor` | ERP | Overwritten only when ERP returned a real price (a `null` ERP price is never faked as 0 — §16) |
| `Variant.label` | Website (presentation, but NOT NULL) | Fallback-derived **only at creation** (§18); **never** overwritten afterwards |
| `Variant.compareAtAmountMinor`, `Variant.currency` | Website / Promotions | Never touched — ERP has no equivalent concept for either |
| `Variant.inventoryQuantity` | — | **Never touched by this module at all** (§17, strict non-goal) |
| `Variant.sortOrder` | Website | Never touched |

## 5. Adapter

`src/modules/erp-integration/catalog.ts` — `erpCatalogAdapter.listProducts()`/`listCategories()`. Built directly on Phase 8's unmodified `callErpIntegrationApi()` (same auth, same timeout, same error classes, same request-id propagation) — no second ERP client or auth mechanism exists. Adds exactly two things: typed query-string construction, and Zod response-shape validation (`ErpInvalidResponseError` on a malformed/unexpected response, so bad data fails loudly instead of silently entering the projection). Server-only: this file is never imported by any client component or route reachable from the browser (verified — see §20).

`getInventory()` is **deliberately not implemented here** — see §17.

## 6. API contract used

Exactly the three endpoints `erp-catalog-inventory-api.md` documents: `GET catalog/products` (paginated, `limit`/`skip`/`status`/`updatedSince`), `GET catalog/categories` (unpaginated), and — **not called by this module at all** — `POST inventory/availability`. This sync never requests `status=draft` (§9).

## 7. Identity mapping

| ERP identifier | Website reference | Why |
|---|---|---|
| ERP Category id | `Category.erpCategoryId` (new column, nullable+unique — see below) | ERP's category DTO has no other stable field; `name`/`slug` are both explicitly unsafe (Arabic text, no existing slug convention) |
| ERP Product id | `Product.erpProductId` (already existed, unique — added in an earlier phase for exactly this purpose) | Same reasoning |
| ERP Variant id | **Not used** | The Website's `Variant` model has no `erpVariantId` column and none was added — see next row |
| ERP SKU | `Variant.sku` (already existed, globally unique) | Reuses the exact precedent Phase 9.3 already established for the inventory API (SKU as the one cross-system identity for variants) — consistent, not reinvented |

**Schema change made, documented before implementation** (per this phase's own §5 instruction): `Category.erpCategoryId String? @unique` was added — mirroring `Product.erpProductId`'s existing exact pattern. This was the only field genuinely missing for safe idempotent sync; nothing else required a schema change. No `prisma/migrations` exist in this project yet (it uses `prisma db push`, per the README's own documented convention) — this sandbox has no reachable Postgres to run `db push` against, so the schema change is written and `prisma generate` was run (confirmed clean), but **not yet applied to a real database**; a developer/CI with real DB access must run `npx prisma db push` before the sync can actually write.

Two more small, additive tables were also added for observability/concurrency — see §12/§14.

## 8. Upsert rules / catalog deactivation

Every write is an upsert keyed by the identifiers above — never by name/slug. `Category`/`Product` upserts happen per-record; a product's own variants are upserted together with it inside one `$transaction` (§7 of the original brief) so a product is never left half-written.

**Deactivation**: a **full sync**, after every page succeeds, computes the full set of `erpProductId`s / SKUs actually returned by ERP this run, then marks **DISCONTINUED**/`active: false` any ERP-managed `Product`/`Variant` (i.e. `erpProductId` not null) that was *not* in that set — this is the "Website must not keep a product purchasable when ERP no longer surfaces it" rule (§8 of the original brief), implemented as the existing, safe `DISCONTINUED`/`active:false` convention, never a new status and never a physical delete. Seed/manual rows (`erpProductId` null) are structurally excluded from this sweep — they were never ERP's to manage.

**This sweep never runs on a failed or partial run** — see §13.

## 9. Status handling

ERP's `active`/`discontinued`/`archived`/`draft` collapse onto the Website's own, smaller `ProductStatus` enum (`ACTIVE`/`DISCONTINUED` only — no member was added). `archived` collapses onto `DISCONTINUED` (the existing safe convention, not a new status). This sync **never requests `status=draft`** — matching Phase 9.3R's own default (draft stays excluded by default) and sidestepping the still-unresolved publishing-policy business decision entirely: this module does not decide whether draft products should ever be visible, it simply never asks for them.

**Limitation, not silently glossed over**: because draft is never fetched, a product that transitions **active -> draft** in ERP will simply stop appearing in any fetch (full or incremental) — from this sync's point of view it looks identical to a product that was hard-deleted or discontinued. The full-sync sweep (§8) correctly reacts to this either way (marks it `DISCONTINUED`, safe), but an **incremental** sync cannot detect it at all, since it only ever receives *changed* records, never a "this disappeared" signal (§11).

## 10. Full sync

`runFullSync()` (`src/modules/catalog-sync/service.ts`): fetches all categories, then paginates every product page (bounded page size, `MAX_PAGES` defensive cap), upserting as it goes, then runs the deactivation sweep only if every page succeeded. Repeatable, idempotent (every write is a keyed upsert), observable (a `CatalogSyncRun` row per attempt — §12), and safe to retry (re-running the identical payload creates nothing new — proven by a dedicated test). Triggered manually via `npm run catalog-sync:full` (`scripts/run-catalog-sync.ts`) — **no HTTP route and no Website Admin UI was built for this**, deliberately (§17.4/§31 of the original brief); it is invoked the same deliberate way `prisma/seed.ts` is.

## 11. Incremental sync

`runIncrementalSync()`: uses the most recent **successful** sync run's own `startedAt` (not `completedAt` — avoids a race where a record changes in ERP *during* a long-running sync window) as the `updatedSince` watermark, fetches only changed records, and upserts them — no deactivation sweep runs. Requires at least one prior successful full sync (throws a clear `IncrementalSyncRequiresPriorFullSyncError` otherwise, rather than guessing an epoch). No event bus, Redis, or queue was introduced — the watermark lives in the same `CatalogSyncRun` table already used for observability (§12).

**Documented limitation**: incremental sync can detect a new or updated record, but — as in §9 — it structurally cannot detect a record that dropped out of ERP's default view (deactivated, archived, or moved to draft). Only a full sync's sweep detects that. Until/unless ERP exposes an explicit deletion/status-change feed, running a full sync periodically is the only way to catch this class of change — documented here as a real, known gap, not solved by this phase.

## 12. Observability

A minimal `CatalogSyncRun` table (not a large sync platform) records: `type` (FULL/INCREMENTAL), `status` (RUNNING/SUCCEEDED/FAILED), `startedAt`/`completedAt`, a `correlationId` (propagated as the ERP request id too, so an ERP-side log and a Website-side row can be correlated), and counts (`categoriesFetched`, `productsFetched/Created/Updated/Deactivated`, `variantsDeactivated`). `errorSummary` stores only a short label (an error class name) — **never** a stack trace or a raw ERP response body. No secrets are ever written to this table. Every sync step also logs through the existing structured `logger` (Pino), whose `authorization`-header redaction already covers this module without any extra work.

## 13. Failure handling

Any failure — ERP unavailable/timeout/auth failure, a malformed/invalid-schema response, an unknown category reference, or a database error — aborts the run immediately: the page loop stops, the run is marked `FAILED` with a short `errorSummary`, **the deactivation sweep is skipped entirely**, and **the watermark is not advanced** (only a `SUCCEEDED` run's `startedAt` is ever read back as the next incremental cursor). This is what prevents a partial/failed run from ever making the Website catalog look more authoritative than ERP, or from falsely deactivating products that simply weren't reached yet. Rows already upserted by earlier pages in the same failed run are left as-is — each of those individual writes was independently correct; they are not rolled back, and re-running the sync (full or incremental) safely re-upserts them (§14).

A single bad row (a product referencing a category ID that wasn't in the categories list) is logged and skipped rather than aborting the whole run — a data-consistency anomaly, not a systemic failure.

## 14. Retry behavior / concurrency guard

**Retries**: every write is a keyed upsert, so re-fetching and re-writing the same ERP page after a transient failure is naturally idempotent — no duplicate-prevention bookkeeping was needed beyond that (proven directly by a "repeated identical payload creates no duplicates" test).

**Concurrency**: a single-row `CatalogSyncLock` table is claimed via an atomic conditional `UPDATE ... WHERE isRunning = false` (not a SELECT-then-INSERT race) before any sync work begins, and released in a `finally` block. A second concurrent attempt gets a clear `SyncAlreadyRunningError` and never starts. This is a best-effort, same-database mutual-exclusion guard — not a distributed/advisory lock, and no Redis was introduced, per the original brief's own guidance to prefer "a simple existing-safe mechanism." Documented honestly: this guards against the two ordinary ways someone might accidentally start two syncs (two manual runs, or a cron overlap), not against exotic distributed-systems races.

## 15. Cache / revalidation

**No cache invalidation logic was added, because none was needed.** Every storefront route that reads the catalog (`/shop`, `/shop/[category]`, `/product/[slug]`, `/search`) already runs `export const dynamic = "force-dynamic"` (set in Phase 9.1) and this codebase has zero `unstable_cache`/`revalidateTag`/cached-`fetch` usage anywhere — confirmed by a full source search this phase. Every request already reads the projection tables live; a sync's writes are visible on the very next request with no additional step.

## 16. Security

- Same server-only ERP credential handling as Phase 8 — nothing new to secure, nothing modified.
- No browser-reachable code path touches `erp-integration` or `catalog-sync` — confirmed by searching every `src/app` route for an import of either module (zero matches) and confirming neither module contains a `"use client"` file.
- No secrets appear in `CatalogSyncRun` rows or logs (§12); the existing Pino redaction list already covers `authorization` headers.
- Money: ERP's `Decimal(14,4)` price strings are converted to Website integer piasters using `BigInt`-only arithmetic (§16 of the original brief's "no floating-point" instruction) — never `parseFloat`, never JS `/` on the raw decimal.

## 17. Non-goals (this phase) — strict

- **Inventory is not synced.** `erpCatalogAdapter` has no `getInventory()` method; `Variant.inventoryQuantity` is never written by anything in this module; the ERP inventory endpoint (`POST inventory/availability`) is never called here. Inventory integration is an explicitly separate, future phase.
- No cart/checkout/order/payment/shipping code was touched.
- No Shopify code was touched.
- No Website Admin UI or new HTTP route was built for triggering a sync — `npm run catalog-sync:full`/`:incremental` (a script, mirroring `prisma/seed.ts`'s own precedent) is the only way to run one.
- No Redis, queue, or event-bus infrastructure was introduced.
- No search redesign — the existing `ILIKE`-based search (Phase 9.1) is unmodified and automatically indexes synced Arabic product/category names, since it queries the same `Product`/`Category` tables (verified — §19).

## 18. Known limitations

- **`Category.slug`/`Product.slug` fallback**: ERP provides no slug for either, and this codebase has no existing mechanical slug-generation rule to reuse (the seed data's slugs are hand-picked English words, not derived from the Arabic `name`). Rather than invent an Arabic-transliteration/slugify convention, a brand-new ERP-sourced category/product gets `slug = "erp-<erp-id>"` — deterministic, fabricates nothing, but is not a real, curated URL. **Open decision, not resolved here**: the business/design team should define a real slug/URL-naming convention; once one exists, existing `erp-*` slugs can be relabeled without touching identity (the `erpCategoryId`/`erpProductId` columns are untouched by any slug change).
- **`Variant.label` fallback**: ERP has no display-label field at all (a gap Phase 9.3R already documented). A brand-new variant gets a fallback label mechanically derived from `packQuantity` + `baseUnitCode` (e.g. "0.5 kg") — real ERP data, not fabricated, but plainer than a curated label (e.g. seed data's "500 جم"). Never overwritten once set, so a human can always improve it later without the next sync clobbering it.
- **Category hierarchy is dropped, not decided**: ERP's category DTO carries a real `parentCategoryId`, but the Website's `Category` model has no hierarchy field at all (and none was added — the flat-vs-hierarchical presentation decision remains explicitly unresolved, `catalog-inventory-gap-analysis.md` §9/§19). Every ERP category is synced flat. This is an honest limitation of the current schema, not a permanent encoding of "flat" as the chosen design.
- **Draft-transition detection gap** (§9/§11): incremental sync cannot detect a product that moved to draft; only a full sync's sweep can. No reconciliation system was built to close this — periodic full syncs are the only mitigation available today.
- **Unpriced variants**: if ERP returns a variant with no `sellingPrice` at all, a **brand-new** variant is skipped entirely this run (never written with a fabricated price of 0) rather than fail the whole sync; an **existing** variant's last-known price is preserved rather than overwritten with nothing. Both are logged.
- **`barcode`** (present in the ERP variant DTO) is not persisted anywhere — the Website's `Variant` model has no column for it, and adding one wasn't necessary for anything this phase required.

## 19. Verification

- **Unit** (`tests/unit/catalog-sync-mapper.test.ts`, 18 tests; `tests/unit/erp-catalog-adapter.test.ts`, 12 tests): pure mapping/derivation logic (price rounding incl. the 4-to-2-digit carry case, label/slug fallback derivation, status/active mapping) and adapter behavior (success, query-string construction, schema-validation failure, auth failure, timeout, unavailable, not-configured) — all **EXECUTED**, all passing (confirmed: `npx vitest run` on both files, 30/30).
- **Integration** (`tests/integration/catalog-sync.test.ts`, 9 real-database scenarios covering: new category/product/variant creation with real identity matching; repeated-payload idempotency; ERP-owned-vs-website-owned field update correctness; the full-sync deactivation sweep; sweep scoping (seed/manual rows untouched); failed-run safety (no sweep, no watermark advance, earlier data intact); the concurrency lock; the incremental-sync precondition error; and a synced product's visibility through the real, unmodified `catalogService`) — **SKIPPED, not executed**, in this sandbox (no local Postgres reachable — the same disclosed, pre-existing limitation every other integration test in this repo already has, per `tests/integration/helpers/db-availability.ts`). Written to run for real in CI or on a developer machine with Postgres reachable; not claimed as passing here.
- **Full suite regression**: `npx vitest run` — 123 passed, 41 skipped (0 failed) across the whole repo, confirming no existing test broke.
- `npm run typecheck` — clean. `npm run lint` — clean. `npm run build` — succeeded (no new route added; the sync module doesn't appear in the route manifest, as expected for a script-only trigger).
- `npx prisma generate` — succeeded against the updated schema (schema-only validity check; no live database was touched, matching this sandbox's known limitation — see §7).

## 20. Future inventory integration boundary

Named explicitly, not left implicit: a future, separately-reviewed phase would add `erpCatalogAdapter.getInventory()` (calling the already-built `POST inventory/availability` endpoint) and a corresponding sync/read path that writes availability into whatever the Website's inventory model looks like at that time. That phase would need to decide, and this phase deliberately did **not** decide: whether `Variant.inventoryQuantity` becomes ERP-owned-and-overwritten the same way price is here, or whether availability stays a live, on-demand read rather than a projected/cached number; how it interacts with `InventoryReservation` (unchanged by this phase); and how sync frequency for inventory (likely much higher than catalog) is bounded. Nothing in this phase's schema, service, or repository code assumes an answer to any of that — `Variant.inventoryQuantity` is untouched, and no inventory-shaped field was added anywhere.

## Appendix — dependency added

`tsx` (devDependency only) was added, for one specific, verified reason: `scripts/run-catalog-sync.ts` needs to execute the real `@/modules/...` application code (not a reimplementation, unlike `prisma/seed.ts`), and plain Node's native TypeScript support (type-stripping only) was empirically confirmed to fail on this codebase's existing constructor-parameter-property syntax (used throughout `src/modules/erp-integration/client.ts` already, before this phase) with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. `tsx` performs a real TS->JS transform and resolves the `tsconfig.json` `@/` path alias natively. No production dependency, no effect on the Next.js app or its build output — confirmed by the clean `npm run build` in §19.
