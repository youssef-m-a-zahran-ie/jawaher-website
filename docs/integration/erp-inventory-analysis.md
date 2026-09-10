# ERP Inventory Analysis — Website Reservation vs. ERP Allocation

Phase 6. This document answers the single question `erp-data-ownership-matrix.md` §5 and `erp-integration-gap-analysis.md` flagged as **the highest-value open question** from Phase 5: *"whether the ERP performs its own allocation/hold at order-push time, and if so, how that interacts with the website's already-consumed reservation for the same order."* It now has a concrete, code-verified answer — see §2.

Status: Phase 6. Last updated: 2026-09-10. No code changed to produce this document.

---

## 1. The two mechanisms, side by side

| | Website `InventoryReservation` | ERP `StockReservation` |
|---|---|---|
| Purpose | Pre-purchase safety margin only — never claims to represent ERP truth | A real, workflow-integrated soft hold against `StockQuant.reservedQuantity` |
| Created when | Cart → checkout, before order creation (`reserveInventoryForItems()`) | **At `confirmOrder()`** — i.e., when a `SalesOrder` transitions `pending_validation → confirmed` |
| Consumed/released when | `ACTIVE → CONSUMED` the moment the website's own `Order` row is created (same transaction); `ACTIVE → RELEASED`/`EXPIRED` on failure/cancellation/15-min TTL | **Only released at `dispatchOrder()`** — the ERP's own schema comment states this as a deliberate business rule, and `fulfillReservation()` decrements `onHandQuantity` and `reservedQuantity` together, in the same transaction as the physical `StockMove` |
| Can it block the action it guards? | Yes — row-level lock + transaction, verified under real concurrent load (10 attempts at 3 units → exactly 3 succeed) | **No, deliberately** — `confirmOrder()` calls `reserveStock(..., allowOversell: true)`; a moderator confirming an order is never hard-blocked by insufficient stock (explicit code comment) |
| Can the underlying quantity go negative? | N/A (website never writes real stock) | **Yes, deliberately, with no DB constraint** — `allowNegative: true` is passed at receiving, at confirm-with-oversell, at pick/pack, and at dispatch. The only guard is an app-level `WHERE` clause on the decrement UPDATE, bypassed by that flag at every one of those points |
| Concurrency protection | Prisma transaction + row lock | `FOR UPDATE SKIP LOCKED` raw-SQL CTEs for reservation claims; atomic guarded UPDATE for on-hand decrements; compare-and-swap (`updateMany` with an expected prior status) for order-status transitions. No optimistic-version column anywhere. |

---

## 2. The exact point ERP inventory becomes unavailable for another sale

Traced directly in `src/modules/orders/services/sales-order.service.ts` and `src/modules/warehouse/services/reservation.service.ts`:

1. `createSalesOrder()` — **does not touch inventory at all.** ("Editing never touches inventory: `reserveStock()` is only ever called from `confirmOrder()`.")
2. **`confirmOrder()`** — inside one `prisma.$transaction`, after a compare-and-swap claim (`pending_validation → confirmed`), calls `reserveStock(ctx, { ..., allowOversell: true }, tx)` for every resolved line. This atomically increments `StockQuant.reservedQuantity` and inserts an `active` `StockReservation` row. **This is the exact moment stock becomes committed/unavailable to another sale.**
3. The reservation is held — not released, not converted — through `picking`, `packing`, and `ready_for_delivery`.
4. It is released only at **`dispatchOrder()`**, which posts the real `StockMove` (physical decrement, `toLocationId: virtual_customer`) and calls `fulfillReservation()` in the same transaction — decrementing `onHandQuantity` and `reservedQuantity` together. (This joint-decrement behavior was itself a 2026-08-21 bug fix; a real production drift of 280.55 units was found and backfilled before the fix — direct evidence this exact mechanism has already caused a real incident once.)
5. If cancelled before dispatch, `releaseReservation()` decrements `reserved_quantity` only — `on_hand` was never physically touched.

**The critical, second-order fact this phase adds**: `confirmOrder()` is not an automatic system step today. It is gated behind `requireModeratorAccess("order.validate")` in `src/features/moderator/actions/order-validation.actions.ts` — a human with the right permission must act. Orders land in `pending_validation` (with `ValidationRule` flags for duplicate-order/high-value/custom conditions) and sit there, **with zero reservation and zero unavailability signal to any other channel**, until a moderator confirms them. Today this queue exists because Shopify-imported orders can have SKU-mapping ambiguity or fraud signals; nothing about it is specific to Shopify, so it would apply equally to any new "website" order-creation path unless a business decision explicitly routes website orders differently.

---

## 3. Recommended sequence (based on what actually exists, not preference)

Website's already-approved design already gets the *shape* right — this phase confirms it, and adds the one missing piece (the confirm-order gate) that Phase 5 could not have known about without ERP inspection:

```
Customer
  → Website reservation (ACTIVE, 15-min TTL, safety margin — unchanged, already correct)
  → Checkout confirmed → Website Order created, reservation CONSUMED (unchanged, already correct;
    the website's own reservation is never at risk of expiring mid-push, since it's consumed at
    order-creation time, before any ERP call would ever be made)
  → pushOrder() to ERP (NEW capability, does not exist yet — see erp-integration-architecture.md)
  → ERP creates a new SalesOrder in `pending_validation` (mirrors exactly how Shopify orders land today)
  → [OPEN BUSINESS DECISION] — does a website-originated order:
       (a) auto-confirm immediately (skip the moderation queue, since it already passed the website's
           own reservation/payment gates), or
       (b) queue for the same human moderation Shopify orders go through?
  → Only at confirm (whichever path) does ERP `StockReservation` get created — this is the true point
    of ERP-side stock commitment, and only from here does ERP inventory become unavailable to
    Shopify/other channels
  → Website reads back status via a scheduled poll (or webhook, if later built) — its own reservation
    is irrelevant by this point, already consumed
```

**What this resolves from Phase 5's open questions**: the "reservation vs. ERP-side allocation" conflict *cannot* be ruled out — it is real. There is a genuine window between "website order created / pushed" and "ERP reservation created," whose length is **unbounded today** (however long an order sits in the moderation queue) unless decision (a) above is made. This is the single biggest inventory-integration risk this phase found — see `erp-integration-final-gap-analysis.md` Q2.

**What does not need to change**: the Website's `InventoryReservation` mechanism itself. It was already correctly scoped as a pre-push safety margin with no ERP awareness, and nothing found this phase changes that — it should keep working exactly as designed regardless of how the confirm-gate decision above is resolved.

---

## 4. Race conditions and failure cases (per the brief's explicit list)

| Case | Analysis |
|---|---|
| Website reservation succeeds / ERP push fails | LOW risk, already handled by existing design: order stays valid website-side, dead-letter + retry, no ERP-side reservation was ever created (nothing to roll back) |
| ERP order succeeds / Website confirmation fails | LOW–MEDIUM: if the new ERP order-create endpoint replicates the proven `ChannelMapping`-unique-constraint + P2002-recovery idempotency pattern (required — see `erp-integration-architecture.md`), a retried push resolves to the same ERP order instead of creating a duplicate |
| Payment succeeds / ERP order fails | LOW if retried successfully; MEDIUM if it never is — already-approved design makes this never customer-visible (dead-letter + alert), consistent with the ERP's own finance model (payment status is independent of ERP push status on both sides) |
| Reservation expires while ERP request in progress | **Not applicable** — by the time a push would happen, the website's own reservation is already `CONSUMED` (order already created), not still `ACTIVE` and subject to TTL expiry |
| Duplicate order submission | Covered on the website side (`Idempotency-Key` header + ledger, tested). **Required on the ERP side**: the new order-create endpoint must apply the same `ChannelMapping`-dedup pattern Shopify import already uses — not a new invention, a direct copy |
| ERP unavailable | Already-approved dead-letter + backoff + alert design covers this from the website side; no ERP-side retry mechanism is needed for this direction (retries are website-initiated, not ERP-initiated) |
| Network timeout after ERP accepted order / retry after timeout | Same idempotency requirement as "duplicate order submission" above — this is exactly the scenario that mechanism exists to solve |

---

## 5. Additional inventory-projection requirements found this phase (feeds `erp-website-real-mapping.md`)

- ERP inventory is per (variant, lot, location); the Website wants one raw number per SKU. The ERP already has the aggregation capability (`getStockAvailability()` computes `onHand − reserved`); a new read endpoint needs to expose the **sum across all locations/lots for a variant**, not a raw per-row dump.
- Because ERP `onHandQuantity` can go negative by design, any new inventory-read endpoint (or the Website's own consumption of it) **must floor at zero before display** — a customer must never see negative stock. This is a new requirement to state explicitly; nothing in the existing ERP code does this floor, since internally negative on-hand is a legitimate, monitored state, not a display value.
