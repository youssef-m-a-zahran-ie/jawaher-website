# Inventory Integration Audit (Phase 9.5)

Status: audit complete, minimum safe read-only foundation implemented; **Phase 9.5R (authority/identity/PDP correction) applied — see §19**. Last updated: 2026-09-13.

This document is a **code-verified audit**, not a documentation summary — every claim below cites the actual file:line evidence found this phase (both repositories re-inspected directly; nothing here is inferred from prior-phase docs alone).

---

## 1. Where is inventory currently stored?

**Two separate, disconnected places — this is the core problem this phase addresses.**

- **ERP** (authoritative): `StockQuant` (`ERP JAW/prisma/schema.prisma:1152-1167`), a per-`(companyId, productVariantId, lotId, locationId)` row carrying `onHandQuantity` and `reservedQuantity` directly as physical columns — a deliberately-cached, transactionally-maintained value, always rebuildable from `StockMove` history (`rebuildStockQuant()`, `stock-move.service.ts:360`).
- **Website** (currently disconnected from ERP): `Variant.inventoryQuantity` (`WEB JAW/prisma/schema.prisma`), a single integer column with no location/lot concept, populated only by `prisma/seed.ts`'s hand-written sample data. The Phase 9.4/9.4R catalog sync **never writes this column** (confirmed by design and by the field-ownership table in `website-erp-catalog-sync.md` §4) — it remains exactly what the seed script put there, forever, regardless of any real sale or ERP stock movement.

## 2. Which system currently mutates inventory?

**ERP mutates real physical stock; the Website mutates nothing.**

ERP: every physical write funnels through `postStockMove()` (`stock-move.service.ts:149-189`), called by receiving/putaway/transfer/pick/dispatch (`warehouse-operations.service.ts:19,54,62,70,99,142,203`), manual adjustments (`adjustment.service.ts:25,93,134`), supplier receiving (`supplier-delivery-log.service.ts:217`, `supplier-batch.service.ts:309`), and sales-order fulfillment/returns (`sales-order.service.ts:2441,2642,2656,2709`).

Website: **`Variant.inventoryQuantity` is never written anywhere in the Website codebase** — confirmed by a full-repository grep; the only three matches for `inventoryQuantity` outside `inventory.ts` itself are comments explicitly documenting that catalog sync never touches it. The Website's checkout flow places real orders (§4) without ever decrementing this column — see §8 for why this is a real, pre-existing correctness gap, not a Phase 9.5 regression.

## 3. Which system currently calculates customer-facing availability?

**The Website, entirely locally, with zero ERP input — until this phase.**

`getAvailableQuantity()` (`WEB JAW/src/modules/catalog/inventory.ts:51-58`): `Variant.inventoryQuantity` minus the sum of that variant's currently-`ACTIVE` `InventoryReservation` rows. Every "is this in stock" surface in the Website — the PDP, the Shop listing, search results, cart lines — ultimately calls this function (via `catalogService`'s `mapVariant`/`getVariantForPurchase`), and none of it has ever consulted ERP before this phase.

## 4. Does Website checkout currently reserve/decrement Website inventory?

**Reserves (soft, TTL-based), but never decrements.**

`checkoutService.confirmAndPlaceOrder()` (`checkout/service.ts:143-147`) calls `reserveInventoryForItems()` (`catalog/inventory.ts:75-110`) inside its transaction: this takes a `SELECT ... FOR UPDATE` row lock on the variant (line 84), re-checks `getAvailableQuantity`, and inserts an `InventoryReservation` row with `status: "ACTIVE"` and a TTL-based `expiresAt`. On successful order placement, `consumeReservationsForCheckoutSession()` (line 211 of checkout/service.ts) flips that reservation to `status: "CONSUMED"`.

**Verified gap**: `getAvailableQuantity` only sums reservations with `status: "ACTIVE"` (`inventory.ts:53-56`). Once a reservation becomes `CONSUMED`, it stops being subtracted — and since `inventoryQuantity` itself is never decremented (§2), **a unit sold in a completed order becomes available again to the next customer**, purely because nothing in the current codebase performs a permanent stock commitment. This is a real, pre-existing gap in the Website's own reservation model (not introduced by this phase, and not fixed by it either — see §15/Open Decisions) that is directly relevant to this phase's central question: it demonstrates the Website's own reservation system was never a true inventory-commitment ledger, only a **temporary, same-checkout-window concurrency guard**, reinforcing that it should not be asked to act as an authority now.

`Order.erpOrderReference`/`erpPushStatus`/`pushedToErpAt` (`schema.prisma`, `Order` model) already exist as columns, explicitly reserved for a future order-push-to-ERP flow, and are never populated by any code today (`erpPushStatus` stays `NOT_PUSHED` always) — the architecture already anticipated that a Website order becoming an ERP commitment is a distinct, not-yet-built step.

## 5. Does ERP checkout/order processing reserve/decrement ERP inventory?

**Yes — a real, two-stage lifecycle, entirely internal to ERP, verified directly in ERP's own code:**

1. **Confirm** (`sales-order.service.ts:1516`, inside `confirmOrder`'s transaction): calls `reserveStock()` with `allowOversell: true` — increments `StockQuant.reservedQuantity` only; `onHandQuantity` is untouched. `allowOversell` is deliberate: "a moderator confirming an order must never be hard-blocked by insufficient stock" (`reservation.service.ts:51-61`) — a shortage becomes a non-blocking alert, not a rejection.
2. **Dispatch** (`warehouse-operations.service.ts:142-187`): `dispatchStock()` calls `postStockMove()` (decrements real `onHandQuantity`) **and**, in the same transaction, `fulfillReservation()` (releases the reservation's hold on `reservedQuantity`) — the actual physical commitment happens here, not at order confirmation.
3. **Cancel before dispatch**: `releaseReservation()` decrements `reservedQuantity` without touching `onHand`.

This lifecycle is entirely internal to ERP's own sales-order module and has **no external trigger** — nothing the Website can call today creates, confirms, or cancels an ERP sales order or its reservation.

## 6. Can both systems currently mutate stock independently?

**No — only ERP mutates real stock at all.** The Website has never had a code path that decrements its own `inventoryQuantity` (§2/§4), so there is no live "two systems both changing the same number" conflict today. The risk this phase must guard against is the opposite one: the Website's customer-facing availability number is currently **completely disconnected** from ERP's real, moving stock — a Website customer could be shown "in stock" for an item ERP has zero of, or vice versa, with no relationship between the two numbers at all.

## 7. Is there currently one reservation authority or two?

**Two, but only one of them commits anything.** ERP has a real reservation lifecycle tied to actual stock (§5). The Website has its own, separate `InventoryReservation` table (§4) that only ever holds against the Website's own stale, ERP-unaware `inventoryQuantity` column — it has never communicated with, and cannot currently communicate with, ERP's reservation system. Per this phase's engineering rule (no second hidden inventory authority, no fake ERP reservation), the Website's reservation is reclassified explicitly in §15/§16 as a **non-authoritative customer/cart hold**, never as inventory truth.

**Real bug found and fixed (Inventory Integration milestone)**: `reserveInventoryForItems()` (`catalog/inventory.ts`) — the row-locked reservation step inside checkout's own transaction — gated *every* variant, ERP-linked ones included, on the local `inventoryQuantity` column. Since that column is permanently `0` for any ERP-synced product (catalog-sync never writes it, by design — §2/§4), checkout could never actually succeed for a single real ERP-backed product: even after the pre-check (§8's own paragraph below) correctly confirmed real ERP stock, this second, later check would unconditionally reject it. Fixed by passing the pre-check's own ERP numbers through to this function: an ERP-linked variant is now gated on `erpAvailable - activeLocalReservations` (still row-locked, still a real concurrency guard — just against the correct number), never against the local column. A variant with no ERP answer is untouched, exactly the pre-existing local-only path.

## 8. What exact race condition could cause overselling?

Two distinct races exist, at different layers, neither fully closable without a future ERP-side change:

- **Website-local race (already solved)**: two simultaneous checkouts both attempting to reserve the last Website-tracked unit — solved by `reserveInventoryForItems`'s row lock (`SELECT ... FOR UPDATE`, `inventory.ts:84`), verified by `tests/integration/inventory-concurrency.test.ts`'s real concurrent-load test. This only protects against overselling the Website's own (currently ERP-unaware) number.
- **ERP/Website time-of-check-to-time-of-use race (NOT closable this phase)**: ERP's real stock can change (a warehouse sale, another channel, a stock adjustment) at any moment between the Website reading an availability number and the customer completing checkout. Since the Website has no ERP-side reservation/commit API to call (§5's lifecycle is ERP-internal only, confirmed no external write path exists — §9 of `erp-catalog-inventory-api.md`/§3 of this document), **this race cannot be eliminated in this phase** — only narrowed, by re-checking ERP as close to order confirmation as possible (§15/§16's design). Full elimination requires a future ERP reservation/commit API — documented as an open follow-up, not invented here.

## 9. What data must Website read from ERP?

Sellable availability, exposed via `POST /api/v1/integrations/website/inventory/availability` — a single, bundle/component-resolved, floored-at-zero number per identifier. **Correction (Inventory Integration milestone — see §13/§14/§19.5 for the full history):** this paragraph originally named an ERP-side function, `getSellableAvailability()`, that never actually existed. The real, current implementation is `getAvailabilityForWebsite()` (`website-inventory.service.ts`, ERP repo), which resolves bundle/redirect components via the existing `resolveOrderLineComponents()` (`product-variant.service.ts`) — real ERP code that already served order-stock touchpoints, reused here rather than duplicated.

**Identity — corrected in Phase 9.5R.** The Phase 9.5 first draft used the endpoint's only-then-available SKU-keyed wire shape with a client-side re-keying trick and described this as "honoring ERP Variant ID as identity at the call-convention layer" — the review correctly rejected that as insufficient, since the wire call itself still depended on a mutable field. The real fix (§18/§19, and `erp-catalog-inventory-api.md` §18) added a `variantIds` request/response shape to the existing endpoint, reusing Phase 9.2's variant-id-keyed `getSellableAvailability()` directly. The Website's adapter (`erp-integration/inventory.ts`) now sends and receives ERP's own variant id end to end — `sku` is not sent by this adapter at all, anywhere.

## 10. What data must Website never treat as authoritative?

- `Variant.inventoryQuantity` — a stale, seed-populated, never-synced local number (§1/§2). **Corrected in Phase 9.5R**: this phase's first draft combined it with ERP's number via `min()`, which the review correctly identified as creating a false second authority. It is no longer combined with ERP's answer at all — when ERP has an answer, ERP's number is used alone; local data is used only when there is no ERP answer to defer to (see §16/§19).
- The Website's own `InventoryReservation` table — a same-repo concurrency guard only (§7), never a substitute for ERP's real reservation/stock state.
- Any cached/previously-fetched ERP availability number older than the current request — no caching was introduced this phase (§14), so this is currently moot, but is documented as a constraint on any future caching layer.

## 11. What happens if ERP is temporarily unavailable?

Documented, asymmetric, and implemented — see §16 (Failure & Fallback Policy) for the full table. Summary: cart operations degrade to the pre-existing Website-local-only check (never silently "always available", never a hard block on a low-stakes, reversible action); checkout confirmation — the one moment that creates a real, hard-to-reverse commitment — fails closed with a clear, safe error rather than proceeding on stale or absent data, per this phase's own explicit instruction to prefer a safe state over a false promise of stock.

## 12. What happens if ERP availability changes between cart and checkout?

Narrowed, not eliminated (§8). The Website now re-checks ERP again at checkout confirmation, immediately before the local reservation transaction — so a change that happened before that re-check is caught; a change happening in the (now much smaller) window between that check and the actual order-placement transaction is not, and cannot be, without a real ERP-side reservation/commit API (§17, follow-up).

## 13. How should bundle/component availability be represented?

**Corrected — Inventory Integration milestone.** This section previously claimed bundle/BOM/stock-source-redirect resolution was "already fully resolved on the ERP side" via a function (`getSellableAvailability()`) that a direct code audit found **never actually existed** in the ERP codebase (no `reservation.service.ts` function or any other function by that name does this). Before this milestone, the real ERP endpoint (`getAvailabilityForWebsite()`, then in `website-inventory.service.ts`) queried `StockQuant` directly for the *requested* variant id with no redirect/BOM resolution at all — meaning every weight-tier variant (`stockSourceVariantId` set) reported 0, and every bundle reported its own (never-stocked) row instead of its components' constraint. This was a real, confirmed bug, found and fixed by this milestone, not a pre-existing correct behavior.

**Current, real implementation**: `getAvailabilityForWebsite()` first resolves each requested variant through `resolveOrderLineComponents()` (`product-variant.service.ts`) — the same, already-existing function every other order-stock touchpoint (alert/reserve/pick/dispatch/return) uses to redirect "what was sold" to "what actually carries stock," reused here rather than duplicated. This correctly handles both a single stock-source redirect (weight-tier variants) and a multi-component assembly `BillOfMaterial` (real bundles), one level of redirect deep on each bundle component. The final arithmetic (pure, unit-tested) lives in `website-inventory-availability.ts`'s `computeSellableAvailability()`: sellable quantity = the **minimum**, across every resolved component, of `floor(component's raw available / units of that component consumed per 1 unit sold)` — never the bundle's own row.

## 14. How should negative ERP availability be presented to customers?

**Corrected — Inventory Integration milestone.** This section previously attributed negative-availability floor-at-zero behavior to the same nonexistent `getSellableAvailability()`/`reservation.service.ts:374-381` claim (§13). The real behavior, verified directly in the current code: `getAvailabilityForWebsite()`'s `rawAvailable()` helper floors `sum(onHandQuantity - reservedQuantity)` at zero for every stock-bearing component **before** it is used in the sellable-quantity division, and `computeSellableAvailability()` floors the final result at zero again (`Math.max(0, Math.min(...))`) — double-clamped, so a negative on-hand/reserved imbalance can never surface through this contract. Verified both by unit tests (`website-inventory-availability.test.ts`, ERP repo) and live against ERP staging: a variant seeded with `onHand=2, reserved=5` (raw -3) correctly returned `available: 0` through the real, deployed endpoint. The Website will structurally never receive a negative number from this endpoint, so there is no "how do we display negative stock to a customer" question left open on the Website side.

## 15. What is the minimum safe architecture for Phase 9.5 (corrected in 9.5R)?

```
ERP (StockQuant, real reservations, getAvailabilityForWebsite / resolveOrderLineComponents)
  -> POST /api/v1/integrations/website/inventory/availability   [variantIds shape added, Phase 9.5R]
  -> Website ERP Inventory Adapter (read-only, keyed by ERP's own variant id end to end)
  -> ERP's number used ALONE when available — never combined with Website-local data
  -> Cart add/update-quantity: honors ERP's number outright; preserves the customer's
     requested quantity (marked "unknown", not silently "in stock") when ERP cannot be reached
  -> PDP (getProduct): a single batched ERP overlay per product page, replacing the
     Website-local availability outright when ERP answers (Phase 9.5R) — Shop/search
     listings deliberately still do not call ERP (§18, unbounded-fan-out risk)
  -> Checkout confirmation pre-check: a fresh ERP read immediately before the existing
     Website-local reservation transaction; fails closed on ERP failure
  -> existing Website-local InventoryReservation (UNCHANGED code, RECLASSIFIED role: a
     same-repo, non-authoritative concurrency guard — never inventory truth, and never
     blended with an ERP answer)
```

No schema change was required (`Variant.erpVariantId` already exists from Phase 9.4R). One minimal, additive ERP-side change was required and made in Phase 9.5R — see `erp-catalog-inventory-api.md` §18 — because the existing SKU-keyed endpoint alone did not provide a stable-identity lookup. No new caching/queue/Redis infrastructure was introduced.

---

## 16. Failure & fallback policy (corrected in Phase 9.5R)

| Scenario | Cart add/update-quantity | PDP display | Checkout confirmation |
|---|---|---|---|
| ERP returns a real number | **ERP's number alone is authoritative** — never blended with Website-local data | ERP's number alone, overlaid onto the page | Reject the order if ERP says any line's quantity is insufficient |
| Variant has no `erpVariantId` (never synced from ERP) | Website-local-only (no ERP claim exists to defer to — not a fallback from failure) | Same | Same: Website-local-only check + reservation, exactly as before this phase |
| ERP unavailable/timeout/5xx/malformed response | **Explicit `"unknown"` state.** The customer's requested quantity is preserved as cart state (never clamped against local data, which would silently present it as verified) | Falls back to the Website-local number for display only — logged, never claimed as ERP-verified | **Fails closed**: rejects with a clear "temporarily unable to confirm your order" error — does **not** fall back to stale local data for the final commitment step |
| ERP says `0` | Treated as genuinely out of stock (an authoritative answer, not a failure) | Same | Same |
| Bundle with an unavailable component | Not distinguishable from any other zero — ERP already resolved this (§13) | Same | Same |

**The Phase 9.5 first draft's cart-failure behavior — "fall back to Website-local-only, as if verified" — was exactly the false-second-authority pattern this correction removes.** The corrected behavior never presents an unverified number as if it were checked; it either uses ERP's real answer, uses local data honestly (only when no ERP claim exists at all), or says explicitly that verification failed.

This asymmetry is deliberate: cart clamping is a soft, fully reversible UX action, where degrading to the system's own pre-existing behavior is safe; checkout confirmation creates a real, hard-to-reverse commitment (an `Order` row, a `Payment` attempt), where this phase's own explicit instruction ("prefer a safe state... rather than falsely promising stock") is applied at its strongest.

**Explicitly flagged as an open question, not silently decided**: whether the business is willing to accept zero checkout completions during an ERP outage is itself a real trade-off a business may want to weigh in on (e.g., a time-boxed grace-period fallback might be preferred later) — the current implementation takes the conservative, safety-first default the brief itself directs, not a rubber-stamped permanent policy.

## 17. Open business decisions (NOT invented, flagged per this phase's explicit instruction)

- **Whether the Website may ever reserve/decrement stock independently of ERP.** Not resolved — the existing Website reservation is kept, but strictly reclassified as non-authoritative (§7/§15); it is not extended to become a real commitment mechanism.
- **Whether Website orders should be pushed to ERP as ERP sales orders before/at inventory commitment.** The schema already anticipates this (`Order.erpOrderReference`/`erpPushStatus`) but no push mechanism exists; building one is a distinct, future phase, not attempted here.
- **A real ERP reservation/commitment API reachable by the Website.** Confirmed not to exist (§5/§9) — needed to fully close the race in §8/§12. Documented as a required follow-up (Step 6 Option C), not invented as a fake endpoint.
- **COD-specific reservation duration/behavior.** Unchanged from the pre-existing `RESERVATION_TTL_MS`/`INVENTORY_RESERVATION_TTL_MINUTES` (already flagged as an open business decision in an earlier phase, `commerce-completeness-audit.md` §5) — not revisited here.
- **Whether ERP unavailability should ever allow checkout to proceed on stale data (a grace period).** Not decided — the current default is fail-closed (§16); a future business decision could relax this with an explicit, bounded policy, but none is invented here.
- **Shop listing-page availability staleness.** Deliberately NOT changed this phase — see §18 (PDP was corrected in 9.5R; Shop remains local-only).

## 18. Explicitly out of scope this phase (and why)

- **Shop listing pages and search results remain exactly as they were** — still computed from Website-local `inventoryQuantity` only, via the shared `mapProduct`/`mapVariant`/listing path (`catalog/service.ts`), untouched by this phase. Making every product on a listing page call ERP live would risk exactly the kind of premature, unbounded-request-volume optimization problem this phase's own brief warns against (Step 8/§2 of the 9.5R review); a bounded, TTL-documented projection would be the eventual answer but is explicitly optional and was judged not yet necessary. **This means a product can show differently on the Shop grid than on its own PDP or cart-add validation** — an honest, named limitation, not a silently-accepted inconsistency. **The PDP itself was corrected in Phase 9.5R** (§19) to use a live, batched ERP overlay — per the review's explicit "PDP is more important than Shop if only one can be safely completed" instruction, since a single product page's variant count is always small and bounded (unlike a listing page's fan-out across many products).

  **Sharper finding (Inventory Integration milestone) — this was not just "can differ," it was "always wrong" for real products.** `Variant.inventoryQuantity` defaults to `0` (`schema.prisma`) and catalog-sync never writes it (§2/§4, unchanged, correctly preserving the catalog-sync/inventory boundary) — confirmed the only writer of this column anywhere in the codebase is `prisma/seed.ts`'s own hand-picked sample data. The practical consequence WAS: every real, ERP-synced product showed as out of stock on every Shop/category/search listing page, unconditionally, regardless of real ERP stock.

  **RESOLVED — Shop/Search Presentation Availability Snapshot milestone.** Listing pages now read a scheduled, explicitly non-authoritative ERP-derived snapshot instead of this column — see `docs/integration/shop-search-availability-snapshot.md` for the full design (freshness semantics, refresh job, failure behavior, and why this was chosen over a live per-listing-page ERP call). PDP/Cart/Checkout are entirely unchanged by that milestone; `Variant.inventoryQuantity` itself is still never written by anything (unchanged, correctly preserving the boundary this paragraph already established).
- **`Variant.inventoryQuantity` is still never written by anything.** This phase adds a live ERP *read* at bounded, high-stakes points (cart mutation, PDP display, checkout confirmation) — it does not attempt to keep the local column in sync, which would require deciding a sync frequency/staleness policy (itself flagged as unnecessary complexity per Step 8/Step 9's "do not create redundant stock tables merely to mirror ERP").
- **No queue, Redis, or caching layer was introduced.** Every ERP availability read this phase adds is a direct, synchronous, per-request call, bounded by the small number of lines in a cart/checkout or variants on one product page — never per-listing-page-product.

## 19. Phase 9.5R — review correction (authority, PDP, identity, cart fallback)

Phase 9.5 was reviewed and returned four issues to correct.

### 19.1 ERP as the ONLY authority (was: `min(local, ERP)`)

**Finding**: the first draft combined ERP's answer with the Website-local `inventoryQuantity` via `Math.min()` — technically safe in the specific direction of never *exceeding* ERP's real number, but conceptually wrong: it treated local data as a second vote in the decision, which is exactly the "false second inventory authority" this phase's whole premise (§1) argues against.

**Correction**: `fetchErpAvailability()`/`getVariantForPurchase()` (`catalog/inventory.ts`, `catalog/service.ts`) no longer reference the local number at all once ERP has answered. ERP's number is used alone. Local data is used only in the one case where no ERP answer exists to defer to (no `erpVariantId`) — not narrowed, not widened, not touched by any comparison. Verified directly by new tests: ERP=50/local=0 → 50 (`erp-inventory-checkout.test.ts`); ERP=0/local=100 → rejected as out of stock, not silently allowed through on the local count.

### 19.2 Cart fallback no longer masquerades as verified stock

**Finding**: on ERP failure, the first draft silently fell back to the Website-local number and clamped the customer's cart quantity against it — presenting unverified, stale data as if it were a real check.

**Correction**: `AvailabilityState` (and the presentation-layer `ProductAvailability`) gained an explicit `"unknown"` value (Phase 9.5R). When ERP cannot be reached for a variant that does have an `erpVariantId`, `getVariantForPurchase()` returns `"unknown"`, and `cartService.addItem`/`updateQuantity` (`modules/cart/service.ts`) preserve the customer's requested quantity exactly, without clamping against local data. Final safety is still enforced at checkout, which remains fail-closed (§19.3 — unchanged from Phase 9.5, re-verified).

### 19.3 Checkout fail-closed behavior — unchanged, re-verified

No change was needed here; the first draft's checkout pre-check already never referenced local data in its insufficiency check. Re-verified directly (code inspection + the existing tests, now updated for the new adapter identity) that a checkout confirmation still fails closed (`CheckoutValidationError: availability_check_unavailable`) when ERP cannot be reached, and still does not eliminate the ERP/Website time-of-check-to-time-of-use race (§8/§12) — narrows it only, exactly as already documented; no reservation/commit API was invented.

### 19.4 PDP now uses live ERP availability (Shop remains deferred)

**Finding**: the first draft left the PDP on the same Website-local-only path as Shop listings.

**Correction**: `catalogService.getProduct()` (the PDP's data source) now makes one batched ERP call per page load, covering every variant of that one product (always small, bounded — never the listing-page fan-out risk), and overlays ERP's number onto the page's displayed availability, again with no `min()` blending. Shop/search listings are unchanged and still local-only — named explicitly in §18, per the review's own "PDP is more important than Shop if only one can be safely completed" guidance.

### 19.5 ERP Variant ID identity — corrected, this section was never real

**This entire subsection, as originally written, described ERP-side work that never happened.** It claimed a "Phase 9.5R" ERP-side correction — a `getSellableAvailability()` function, a SKU-vs-id regression test at `route.test.ts` in the ERP repo — none of which a direct audit of the real ERP codebase (Inventory Integration milestone) could find any trace of. This section was written, and phrased as verified fact, at a time when the Website's `erp-integration`/`catalog-sync` code was already fully built but had never actually been connected to or audited against a real ERP instance — the claims here describe what the author expected/assumed ERP would eventually do, not something that was checked.

**What is actually true, verified directly**: the endpoint has always been id-keyed on the wire (`{ variantIds: string[] }` in, `{ items: [{variantId, available}], notFoundVariantIds }` out — `website-inventory/availability/route.ts`, ERP repo) since Phase 6 built it; SKU is never sent or read anywhere in this path, on either side. There was never a SKU-keyed version of this specific endpoint to migrate away from. The real, confirmed bug this milestone found and fixed was the bundle/redirect resolution gap described in §13, not an identity/SKU problem.

### 19.6 Verification

**Corrected** — the previous version of this line cited specific ERP-repo test counts and a named test file that do not exist; removed. See this document's own top-level status and the Inventory Integration milestone's own execution report for real, current verification results (unit tests, live ERP-staging smoke tests, and a full Website-staging <-> ERP-staging PDP-level check for the normal/zero-stock/weight-tier/bundle cases).
