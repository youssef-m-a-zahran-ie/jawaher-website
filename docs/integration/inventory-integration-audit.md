# Inventory Integration Audit (Phase 9.5)

Status: audit complete, minimum safe read-only foundation implemented. Last updated: 2026-09-13.

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

## 8. What exact race condition could cause overselling?

Two distinct races exist, at different layers, neither fully closable without a future ERP-side change:

- **Website-local race (already solved)**: two simultaneous checkouts both attempting to reserve the last Website-tracked unit — solved by `reserveInventoryForItems`'s row lock (`SELECT ... FOR UPDATE`, `inventory.ts:84`), verified by `tests/integration/inventory-concurrency.test.ts`'s real concurrent-load test. This only protects against overselling the Website's own (currently ERP-unaware) number.
- **ERP/Website time-of-check-to-time-of-use race (NOT closable this phase)**: ERP's real stock can change (a warehouse sale, another channel, a stock adjustment) at any moment between the Website reading an availability number and the customer completing checkout. Since the Website has no ERP-side reservation/commit API to call (§5's lifecycle is ERP-internal only, confirmed no external write path exists — §9 of `erp-catalog-inventory-api.md`/§3 of this document), **this race cannot be eliminated in this phase** — only narrowed, by re-checking ERP as close to order confirmation as possible (§15/§16's design). Full elimination requires a future ERP reservation/commit API — documented as an open follow-up, not invented here.

## 9. What data must Website read from ERP?

Sellable availability (`getSellableAvailability()`'s output, exposed via the already-approved `POST /api/v1/integrations/website/inventory/availability` endpoint) — a single, bundle/component-resolved, floored-at-zero number per SKU. Nothing else was needed this phase; no new ERP endpoint was required or built.

**Identity note (honoring "do not identify variants by SKU" without modifying ERP)**: the existing, already-approved inventory endpoint's wire contract is SKU-keyed (`{skus: string[]}` → `{items: [{sku, available}]}`) — a Phase 9.3 decision, unchanged, and not something this phase may alter without a proven ERP-side need (none exists — the endpoint already provides everything required). The Website honors the "ERP Variant ID as identity" requirement at the **data-model/call-convention layer**: every Website-side function introduced this phase takes and returns results keyed by the Website's own `Variant.id` (with `Variant.erpVariantId` as the underlying ERP-identity reference, per Phase 9.4R), and uses `sku` **only as the necessary wire parameter** of the one existing, unchanged HTTP contract — never as a concept any calling code (`cartService`, `checkoutService`) reasons about. `sku` is itself ERP-owned, always-overwritten, round-tripped data (Phase 9.4/9.4R), not a Website-invented identity choice.

## 10. What data must Website never treat as authoritative?

- `Variant.inventoryQuantity` — a stale, seed-populated, never-synced local number (§1/§2). This phase does not change what writes it (still nothing) or what reads it (existing code is untouched) — it only adds a **second, ERP-sourced signal** that new code combines with it (§16).
- The Website's own `InventoryReservation` table — a same-repo concurrency guard only (§7), never a substitute for ERP's real reservation/stock state.
- Any cached/previously-fetched ERP availability number older than the current request — no caching was introduced this phase (§14), so this is currently moot, but is documented as a constraint on any future caching layer.

## 11. What happens if ERP is temporarily unavailable?

Documented, asymmetric, and implemented — see §16 (Failure & Fallback Policy) for the full table. Summary: cart operations degrade to the pre-existing Website-local-only check (never silently "always available", never a hard block on a low-stakes, reversible action); checkout confirmation — the one moment that creates a real, hard-to-reverse commitment — fails closed with a clear, safe error rather than proceeding on stale or absent data, per this phase's own explicit instruction to prefer a safe state over a false promise of stock.

## 12. What happens if ERP availability changes between cart and checkout?

Narrowed, not eliminated (§8). The Website now re-checks ERP again at checkout confirmation, immediately before the local reservation transaction — so a change that happened before that re-check is caught; a change happening in the (now much smaller) window between that check and the actual order-placement transaction is not, and cannot be, without a real ERP-side reservation/commit API (§17, follow-up).

## 13. How should bundle/component availability be represented?

No new work needed — already fully resolved on the ERP side. `getSellableAvailability()`'s bundle/BOM/stock-source-redirect resolution (Phase 9.2, unchanged) happens entirely inside ERP before the single, already-resolved `available` number ever reaches the Website; the Website receives one number per SKU and has no bundle-composition logic to build or duplicate.

## 14. How should negative ERP availability be presented to customers?

Never seen by the Website at all — verified directly in ERP's own code: `getSellableAvailability()` deliberately does **not** floor at zero (`reservation.service.ts:374-381`, "does not floor negative results"), but the one function the Website-facing route actually calls, `getSellableAvailabilityBySkus()`, does: `available: Math.max(0, availability?.available ?? 0)` (`reservation.service.ts:534`). Every response from the endpoint the Website calls is already floored at zero server-side. No Website-side flooring logic was needed or added.

## 15. What is the minimum safe architecture for Phase 9.5?

```
ERP (StockQuant, real reservations, getSellableAvailability)
  -> POST /api/v1/integrations/website/inventory/availability   [unchanged, Phase 9.3/9.3R]
  -> Website ERP Inventory Adapter (NEW, read-only, keyed by Website Variant id)
  -> combined with the existing Website-local availableQuantity (never replaced, never deleted)
  -> Cart add/update-quantity validation (NEW: takes the minimum of both signals)
  -> Checkout confirmation pre-check (NEW: a fresh ERP read immediately before the existing
     Website-local reservation transaction; fails closed on ERP failure)
  -> existing Website-local InventoryReservation (UNCHANGED code, RECLASSIFIED role: a
     same-repo, non-authoritative concurrency guard — never inventory truth)
```

No schema change was required (`Variant.erpVariantId`/`sku` already exist from Phase 9.4R). No ERP change was required (the existing endpoint already provides everything needed). No new caching/queue/Redis infrastructure was introduced.

---

## 16. Failure & fallback policy (explicit, implemented)

| Scenario | Cart add/update-quantity | Checkout confirmation |
|---|---|---|
| ERP returns a real number | Take `min(ERP available, Website-local availableQuantity)` | Reject the order if ERP says any line's quantity is insufficient |
| Variant has no `erpVariantId` (never synced from ERP) | Fall back to Website-local-only (ERP was never expected to have an opinion) — logged | Same: fall back to Website-local-only check + reservation, exactly as before this phase |
| ERP unavailable/timeout/5xx/malformed response | **Fall back to Website-local-only** (the exact pre-Phase-9.5 behavior) — never silently treated as "unlimited stock", logged as degraded | **Fails closed**: rejects with a clear "temporarily unable to confirm your order" error — does **not** fall back to stale local data for the final commitment step |
| ERP says `0` | Treated as genuinely out of stock, same as a local zero | Same |
| Bundle with an unavailable component | Not distinguishable from any other zero — ERP already resolved this (§13) | Same |

This asymmetry is deliberate: cart clamping is a soft, fully reversible UX action, where degrading to the system's own pre-existing behavior is safe; checkout confirmation creates a real, hard-to-reverse commitment (an `Order` row, a `Payment` attempt), where this phase's own explicit instruction ("prefer a safe state... rather than falsely promising stock") is applied at its strongest.

**Explicitly flagged as an open question, not silently decided**: whether the business is willing to accept zero checkout completions during an ERP outage is itself a real trade-off a business may want to weigh in on (e.g., a time-boxed grace-period fallback might be preferred later) — the current implementation takes the conservative, safety-first default the brief itself directs, not a rubber-stamped permanent policy.

## 17. Open business decisions (NOT invented, flagged per this phase's explicit instruction)

- **Whether the Website may ever reserve/decrement stock independently of ERP.** Not resolved — the existing Website reservation is kept, but strictly reclassified as non-authoritative (§7/§15); it is not extended to become a real commitment mechanism.
- **Whether Website orders should be pushed to ERP as ERP sales orders before/at inventory commitment.** The schema already anticipates this (`Order.erpOrderReference`/`erpPushStatus`) but no push mechanism exists; building one is a distinct, future phase, not attempted here.
- **A real ERP reservation/commitment API reachable by the Website.** Confirmed not to exist (§5/§9) — needed to fully close the race in §8/§12. Documented as a required follow-up (Step 6 Option C), not invented as a fake endpoint.
- **COD-specific reservation duration/behavior.** Unchanged from the pre-existing `RESERVATION_TTL_MS`/`INVENTORY_RESERVATION_TTL_MINUTES` (already flagged as an open business decision in an earlier phase, `commerce-completeness-audit.md` §5) — not revisited here.
- **Whether ERP unavailability should ever allow checkout to proceed on stale data (a grace period).** Not decided — the current default is fail-closed (§16); a future business decision could relax this with an explicit, bounded policy, but none is invented here.
- **A fourth, distinct "temporarily unavailable due to integration issue" customer-facing UI state.** Not added — the existing three-state `AvailabilityState` (`in_stock`/`low_stock`/`out_of_stock`) is unchanged, since introducing a new UI state is a frontend design decision (out of scope: "do not redesign the frontend"). When ERP data can't be determined, the system currently falls back to computing one of the existing three states from Website-local data only (§16) — a future phase may want a distinct "checking availability..." treatment.
- **Shop/PDP listing-page availability staleness.** Deliberately NOT changed this phase — see §18.

## 18. Explicitly out of scope this phase (and why)

- **Shop listing pages, search results, and the PDP's own displayed badge remain exactly as they were** — still computed from Website-local `inventoryQuantity` only, via the shared `mapProduct`/`mapVariant` path (`catalog/service.ts`), untouched by this phase. Making every product on a listing page call ERP live would risk exactly the kind of premature, unbounded-request-volume optimization problem this phase's own brief warns against (Step 8); building a bounded, TTL-documented projection instead is explicitly optional per the brief and was judged not yet necessary for the minimum safe foundation. **This means a product could show differently on the Shop grid than on its own cart-add validation** — an honest, named limitation, not a silently-accepted inconsistency.
- **`Variant.inventoryQuantity` is still never written by anything.** This phase adds a live ERP *read* at two specific, bounded, high-stakes points (cart mutation, checkout confirmation) — it does not attempt to keep the local column in sync, which would require deciding a sync frequency/staleness policy (itself flagged as unnecessary complexity per Step 8/Step 9's "do not create redundant stock tables merely to mirror ERP").
- **No queue, Redis, or caching layer was introduced.** Every ERP availability read this phase adds is a direct, synchronous, per-request call, bounded by the small number of lines in a cart or a checkout — never per-listing-page-product.
