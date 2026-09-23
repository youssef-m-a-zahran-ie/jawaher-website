# Shop/Search Presentation Availability Snapshot

Status: implemented. Companion to `docs/integration/inventory-integration-audit.md` (the live PDP/Cart/Checkout ERP integration, unchanged by this document) — read that one first for the full inventory-ownership picture; this document covers only the Shop/Search listing gap it left open (§18 there).

## 1. The problem this closes

`Variant.inventoryQuantity` defaults to `0` and catalog-sync deliberately never writes it (an explicit, correct non-goal — ERP is the sole inventory authority, and catalog sync is a *catalog* sync, not an inventory sync). Before this document's implementation, Shop/category/search listing pages read this column directly: the practical effect was that **every real, ERP-synced product showed as unavailable on every listing page, unconditionally**, regardless of real ERP stock — confirmed live against ERP staging + Website staging before this fix. PDP already asked ERP live and was correct; listing pages were not.

## 2. What this is, precisely

A scheduled, **non-authoritative** Website-side cache: `VariantAvailabilitySnapshot`, one row per ERP-linked variant, refreshed by a background job that calls the same, already-existing, already-batched ERP availability endpoint every other part of this integration uses (`POST /api/v1/integrations/website/inventory/availability`).

**It exists ONLY to improve customer-facing presentation on Shop/category/search listing surfaces.** It is read by exactly one place: `catalog/service.ts`'s `buildAvailabilityMap()`, which backs `listAllProducts()`/`listProductsByCategory()`/`searchProducts()`, and (as the PDP's own pre-overlay base value only — see §6) `getProduct()`.

## 3. What it is allowed to do

- Provide a listing page's displayed availability badge (`in_stock` / `low_stock` / `out_of_stock` / `unknown`) without a live ERP call on every page view.
- Serve as PDP's fallback base value, before the existing live ERP overlay (`applyErpAvailabilityOverlay`) replaces it for any variant it can reach.

## 4. What it is FORBIDDEN to do — hard boundary

The snapshot **MUST NEVER** be read by:

- checkout authorization or fail-closed verification (`checkout/service.ts`'s pre-check — unchanged, still calls `fetchErpAvailability` live)
- inventory reservation (`reserveInventoryForItems` — unchanged, still gated on the live ERP pre-check number for ERP-linked variants, per the Inventory Integration milestone's own fix)
- order confirmation, stock deduction, or payment authorization (none of these ever read Website inventory data of any kind — ERP owns this end to end)
- any decision `getVariantForPurchase()` makes (Cart's live-availability read — unchanged, still calls ERP live, still returns `"unknown"` on failure, never falls back to this snapshot)

If a future PR ever imports `VariantAvailabilitySnapshot` (or `getSnapshotsForVariantIds`) from anywhere outside `src/modules/availability-snapshot` or `catalog/service.ts`'s listing path, treat that as a bug report against this document, not a precedent to follow.

## 5. Freshness semantics — fresh / stale / unknown

Computed at READ time by `resolveListingAvailability()` (`availability-snapshot/presentation.ts`), never stored:

| State | Meaning | Presented as |
|---|---|---|
| **fresh** | A snapshot row exists and `lastSuccessAt` is within the configured freshness window | The stored status, as-is |
| **stale** | A snapshot row exists but is older than the freshness window | The stored status, as-is — still a real, ERP-derived signal, more useful than nothing, but the `freshness` field lets any future caller treat it differently if needed |
| **unknown** | No snapshot row exists for this variant at all (never yet successfully refreshed) | `"unknown"` — the product-card UI already has a correct, existing label for this (`product-card.tsx`'s `AVAILABILITY_BADGE.unknown`), and already correctly excludes it from quick-add |

A stored row's `presentationStatus` is **never** `"unknown"` — that value only exists at read time, computed from the row's *absence* or *age*, never written. This makes it structurally impossible for a stored row to be mistaken for a fresh, verified answer just by existing.

**Freshness window**: `AVAILABILITY_SNAPSHOT_FRESHNESS_MINUTES` (`src/lib/env.ts`), defaults to **15 minutes** (the approved target). Configurable with no code change — this is a presentation freshness target, not a sales guarantee, matching the exact same "tunable constant, not a locked business decision" convention `LOW_STOCK_THRESHOLD`/`INVENTORY_RESERVATION_TTL_MINUTES` already use.

## 6. PDP/Cart/Checkout authority — unchanged

| Surface | Data source | Changed by this document? |
|---|---|---|
| PDP | Live ERP overlay (`applyErpAvailabilityOverlay`), one batched call per product page | No — still live, still authoritative. Only its overlay-*failure* fallback quality improves (a recent snapshot instead of a permanently-wrong local zero) |
| Cart | Live ERP (`getVariantForPurchase`/`fetchErpAvailability`), `"unknown"` on failure | No |
| Checkout | Live ERP pre-check, fail-closed | No |
| Reservation | Live ERP pre-check number (Inventory Integration milestone's own fix) | No |
| Shop/category/search listing | **This snapshot** | Yes — this is the fix |

## 7. Why Shop/Search does not query ERP per visitor

Listing pages are, by a wide margin, the highest-traffic pages on the storefront (homepage, every category, every search). A live ERP call there would make ERP load scale with **visitor traffic**, unlike every other integration point in this system, which is bounded by a single product page, a single cart mutation, or a single checkout attempt. The architecture decision analysis that preceded this implementation (see the milestone's own execution report) compared this against a live-per-page-load alternative and chose the scheduled-snapshot approach specifically so ERP load scales with **catalog size and refresh frequency instead** — flat regardless of traffic. This is the primary reason this design was chosen over extending the PDP overlay pattern to listings directly.

## 8. Bundle / stock-source handling — resolved entirely by ERP, never re-derived here

The refresh job never re-implements bundle/BOM or `stockSourceVariantId` resolution. It calls the exact same ERP endpoint PDP/Cart/Checkout already call, which has already fully resolved both (Inventory Integration milestone) before the number ever reaches the Website. If ERP says a bundle's sellable quantity is `5`, this job records the presentation state corresponding to `5` — nothing more.

## 9. Data model

```
VariantAvailabilitySnapshot   — one row per ERP-linked variant
  variantId, erpVariantId (denormalized, diagnostic only)
  presentationStatus: "in_stock" | "low_stock" | "out_of_stock"  (never "unknown" — see §5)
  source: "erp_snapshot"       — explicit non-authoritative marker
  lastSuccessAt, lastAttemptAt, lastError

AvailabilitySnapshotRun       — one row per refresh, mirrors CatalogSyncRun exactly
  status: RUNNING | SUCCEEDED | PARTIAL | FAILED
  variantsAttempted / variantsSucceeded / variantsFailed, errorSummary

AvailabilitySnapshotLock      — single-row mutual-exclusion guard, mirrors CatalogSyncLock exactly
                                 (a separate lock row so a catalog sync and an availability
                                 refresh never block each other — they are independent)
```

This table can be dropped and fully rebuilt from ERP at any time with zero loss of truth — it is a cache, never a ledger.

## 10. Refresh job

`runAvailabilitySnapshotRefresh()` (`availability-snapshot/service.ts`):

1. Acquires the lock (same atomic-conditional-UPDATE pattern as catalog-sync's own lock — no Redis/advisory-lock infra).
2. Loads every active, ERP-linked variant.
3. Chunks them itself at the ERP adapter's own documented per-request limit (`MAX_IDS_PER_REQUEST`, exported from `erp-integration/inventory.ts` specifically so this job doesn't hand-duplicate that number) — one real HTTP call per chunk.
4. Per chunk: on success, upserts each variant's snapshot (status + `lastSuccessAt` + clears any prior error). On failure (network error, ERP 5xx, timeout, malformed response), marks every variant in that chunk as a failed *attempt* only — `lastAttemptAt`/`lastError` update, **`presentationStatus`/`lastSuccessAt` are never touched**. A variant ERP itself reports as not-found this cycle is treated identically (never fabricated as a zero).
5. Records run-level counters and an overall status (`SUCCEEDED` if nothing failed, `PARTIAL` if some succeeded and some failed, `FAILED` if nothing succeeded).

This chunk-level isolation is *why* the job chunks itself instead of handing the whole variant list to `erpInventoryAdapter.getAvailability()` in one call: that function has no such isolation (correct for its own callers — PDP/Cart/Checkout, which must fail closed on *any* failure) — but would discard every already-successful chunk's results the moment a later chunk failed, which is exactly wrong for a cache whose whole point is "partial success is still useful, never erase what worked."

**Verified live against ERP/Website staging** (not simulated): a real successful run (7/7) followed by a real failed run (`ErpTimeoutError`, 0/7) left every variant's `presentationStatus`/`lastSuccessAt` from the successful run completely untouched, only `lastAttemptAt`/`lastError` updated — proving §4/this section's own safety claim against an actual failure, not a contrived one.

## 11. Scheduling

- **Manual/CI**: `npm run availability-snapshot:refresh` (mirrors `catalog-sync:full`'s own script exactly).
- **HTTP**: `GET`/`POST /api/v1/internal/availability-snapshot/refresh`, protected by the existing `checkInternalRequestAuthorized` (same convention as the two pre-existing internal routes) — reusable by any authenticated external scheduler, not just Vercel Cron.
- **Vercel Cron**: `vercel.json` declares `0 4 * * *` (daily).

### Platform limitation — documented, not silently worked around

The approved target is a **15-minute** cycle. **Vercel's Hobby plan rejects any cron schedule more frequent than daily** — confirmed directly against this project's real deployment (`vercel deploy` failed with: *"Hobby accounts are limited to daily cron jobs... Upgrade to the Pro plan to unlock all Cron Jobs features"*). The job's own logic has zero dependency on this constraint — `runAvailabilitySnapshotRefresh()`/the internal route are equally callable from an external scheduler (GitHub Actions on a cron trigger, cron-job.org, or any other caller that can send the correct internal-auth header) at the true 15-minute cadence, or from a future Vercel Pro plan's own Cron at that cadence, with **zero code change** either way — only the trigger source changes. Until one of those is set up, the *daily* Vercel Cron entry is the closest safe default on the current plan; the milestone's own execution report flags this as an open decision for the project owner (external scheduler vs. Pro plan vs. accept daily for now).

## 12. Listing integration

`catalog/service.ts`'s `buildAvailabilityMap()` splits variants by whether they have an `erpVariantId`:

- **ERP-linked**: resolved via `getSnapshotsForVariantIds()` + `resolveListingAvailability()` — the fix.
- **Website-only** (no `erpVariantId` — there is no ERP claim to snapshot for these at all): untouched, still the pre-existing `inventoryQuantity`-derived local path.

No UI/component change was needed: `product-card.tsx` already had a correct `"unknown"` badge (label + `variant: "neutral"`) and already correctly excluded `"unknown"` from quick-add eligibility — it had simply never been fed a real `"unknown"` value from a listing page before.

## 13. Future migration considerations

- If catalog size grows enough that a single refresh cycle's total duration approaches the refresh interval, the chunk loop is already the natural place to parallelize (bounded concurrency, not unbounded) without changing the data model.
- If Vercel Pro (or a move off Vercel) is adopted, only `vercel.json`'s schedule string changes — the job/route/script are already scheduler-agnostic (§11).
- If a second presentation-only ERP-derived signal is ever needed (e.g., a numeric "only 3 left" count rather than a three-state badge), it belongs as an additional column on this same table, not a second cache mechanism — `source: "erp_snapshot"` already anticipates a future second, distinct source value without a schema redesign.
