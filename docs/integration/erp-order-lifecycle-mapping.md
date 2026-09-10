# ERP Order Lifecycle Mapping

Phase 6. The real `SalesOrder` state machine, as implemented (not as diagrammed — see `erp-domain-map.md` §6 for where the ERP's own diagram disagrees with its own code), mapped against the Website's already-approved `Order`/`erpPushStatus` model.

Status: Phase 6. Last updated: 2026-09-10.

---

## 1. Real ERP order lifecycle (traced from `sales-order.service.ts`)

```
pending_validation
   │  confirmOrder()  [CAS: pending_validation → confirmed]  — GATED BY A HUMAN MODERATOR
   │  requireModeratorAccess("order.validate") in order-validation.actions.ts
   │  - ValidationRule flags: duplicate_order, high_order_value, custom (overridable)
   │  - creates StockReservation per line (allowOversell=true — never hard-blocked by low stock)
   │  - creates one receivable Invoice
   ▼
confirmed
   │  startFulfillment() → fulfillOrder()   [confirmed → picking → packing → ready_for_delivery]
   │  - resumable by design (re-derives "remaining" qty from the StockMove ledger, not a flag)
   ▼
ready_for_delivery
   │  dispatchOrder()   [CAS: ready_for_delivery → out_for_delivery]
   │  - StockReservation is consumed HERE (release happens only at Dispatch, by design)
   │  - posts revenue/COGS/shipping/discount JournalEntries
   │  - best-effort push of fulfillment to Shopify (non-blocking)
   ▼
out_for_delivery ──► markDelivered()   [CAS → delivered]
   │                    - paymentStatus unpaid → awaiting_confirmation (best-effort, non-fatal)
   │
   └──► markReturned()   [CAS → returned — a PEER of markDelivered, not a transition FROM delivered]
            - reverses revenue/COGS JournalEntries, voids the invoice if unpaid
            - restocks physically via postStockMove(reason:"return") into returns_intake
            - pushes the return to Shopify

pending_validation ──► rejectOrder()  [CAS → rejected]  (always pushes cancellation to Shopify)
any pre-out_for_delivery status ──► cancelOrder()  [CAS → cancelled]
    — BLOCKED if the invoice already has any payment allocated (InvoicePaymentExistsError)
cancelled/rejected ──► revertCancelOrder()  [→ confirmed, re-reserves stock, re-invoiced]
```

**Dead enum values — do not map anything onto these**: `qc` and `failed_delivery` both appear in `primaryStatus`'s allowed values and in some queue-filter arrays, but **no service function ever transitions an order into or out of either**. `fulfillOrder()` goes `packing → ready_for_delivery` directly, with no QC branch; there is no `markFailedDelivery()` anywhere. The ERP's own `ERP_Order_Workflow_State_Diagram_v2.mermaid` depicts both as real, live states with a `failed_delivery → out_for_delivery` redelivery loop — this is aspirational/stale, not the running system.

**Undo functions exist for the forward path only** (`unconfirmOrder`, `revertStartFulfillment`, `revertFulfillOrder`, `revertDispatchOrder`, `revertMarkDelivered`, `revertToPreviousStep`) — cancelled/returned are explicitly excluded, "exception paths with their own distinct recovery semantics" (code comment).

**Payment status — a genuinely independent axis**, per an explicit schema-level business requirement: "delivery status and payment status must remain independent (an order can be 'delivered' while still 'awaiting_confirmation')." Transitions: `unpaid → awaiting_confirmation` (at `markDelivered()`, best-effort) `→ paid` (`confirmCashCollection()`/`markDeliveredAndCollectPayment()`, a human recording COD/InstaPay collection after the fact — no payment gateway exists anywhere).

**Price/discount snapshotting**: `SalesOrderLine.unitPrice` frozen at line-create time; whole-order `discountAmount`/`discountPercent` computed and frozen atomically inside `confirmOrder()`'s transaction. `externalTotalPrice` (Shopify's own total, including shipping) is captured once at import as a snapshot — with one narrow, disclosed exception: `orders/updated` webhooks are allowed to auto-correct it, added after a live revenue-reconciliation audit found 19 drifted orders. **Tax**: no explicit field found — UNKNOWN whether folded into price fields or genuinely unmodeled; needs direct clarification, not resolvable from code alone.

**Returns/refunds — real gap, both sides immature**: returns exist only for `out_for_delivery → returned` (driver brings goods back before delivery completes) — explicit code comment: "this platform has no concept yet of a customer returning goods after actually accepting them." Refunds are unhandled beyond a log line on the Shopify `refunds/create` webhook.

**One asymmetric, permanent gap worth flagging early**: `cancelOrder()`/`rejectOrder()` push a cancellation to Shopify, but there is **no "un-cancel" push** — the code's own comment states Shopify's Admin API has no un-cancel/reopen mutation. `revertCancelOrder()` only reopens the order ERP-side. A future website integration needs its own cancel/reopen semantics checked for the same asymmetry up front.

---

## 2. Order creation — the one entry point that exists today, and why it matters

`createSalesOrder()` has exactly **three call sites** in the entire codebase: `sales-order.repository.ts`, `sales-order.service.ts` (internal), and `shopify.service.ts` (the Shopify order-import job). **There is no manual "create order" UI, action, or any non-Shopify caller anywhere.** `SalesOrder.warehouseId` is set exclusively by `resolveDefaultWarehouse()`, whose own doc comment states: *"This platform has no per-channel/per-order warehouse-selection strategy yet… if the company has exactly one active warehouse, use it; otherwise fail loudly."*

**Direct consequence**: a future website integration cannot "call an existing order-creation operation with a different payload." The operation itself, generalized to accept a non-Shopify source, does not exist. Building it means: a new `SalesChannel` row (`channelType` currently only has `shopify` seeded), a generalized customer/variant/warehouse-resolution step mirroring `shopify-mapping.service.ts`'s proven pattern, and a decision on whether it lands in `pending_validation` (moderated, like Shopify) or bypasses that gate (see `erp-inventory-analysis.md` §2-3). None of this exists today; all of it is new ERP-side work, not a mapping exercise.

---

## 3. Website Order ↔ ERP SalesOrder — field/state mapping

| Website field | ERP field/mechanism | Match quality | Notes |
|---|---|---|---|
| `Order.id` (internal, never sent as the cross-system id) | — | GOOD | Already the correct design per both sides |
| `Order.erpOrderReference` (reserved, unpopulated) | `SalesOrder.id`, reached via a new `ChannelMapping(salesChannelId="website", internalEntityType="sales_order", externalId=<website order id>)` row | GOOD, once built | Directly reuses the exact mechanism Shopify order-import dedup already uses — the cleanest point of agreement in this whole audit |
| `Order.idempotencyKey` used as the push idempotency key | The `ChannelMapping` unique constraint (`@@unique([salesChannelId, internalEntityType, externalId])`) is itself the atomic dedup check | GOOD, once built | A retried push with the same website order id resolves to the same ERP order, not a duplicate — assuming the new endpoint replicates the pre-check → transactional re-check → catch-P2002 pattern |
| Customer-facing order status (small, stable set) | `SalesOrder.primaryStatus` real values (excluding dead `qc`/`failed_delivery`) | GOOD, mapping table needed | Suggested mapping: `confirmed/picking/packing → "being prepared"`; `ready_for_delivery/out_for_delivery → "out for delivery"`; `delivered → "delivered"`; `cancelled/rejected → "cancelled"`; `returned → "returned"`. `pending_validation` should map to the same "being prepared" stage — never surface "awaiting moderation" language to a customer |
| `Order.erpPushStatus` (`NOT_PUSHED/PENDING/SUCCEEDED/FAILED`) | Orthogonal to ERP's own status, exactly as Website's ownership matrix already assumed | GOOD, no change needed | This tracks the website's own push attempt, never the ERP's real stages — already correctly scoped |
| Payment status | `SalesOrder.paymentStatus` (`unpaid/awaiting_confirmation/paid`) — entirely manual, human-recorded | **CONFLICT if online payment is ever added** | The ERP has zero precedent for an automated/gateway-driven payment status change. If the website ever processes real online payment, the push payload should carry payment method+status as an **informational fact the ERP records**, not something the ERP is asked to independently verify or contest — this needs a new acceptance path in the ERP's order-create endpoint, not just a mapping |
| Cancellation | `cancelOrder()`/`rejectOrder()`, blocked once any payment is allocated | GOOD pattern, new endpoint needed | The website needs to know the "no cancel after payment allocated" rule *before* offering a cancel button past that point, not discover it as a rejected API call |
| Return/Refund | Pre-delivery-only return; no refund flow | Both sides immature | Joint business decision required before any design (see `erp-integration-final-gap-analysis.md`) |
| Shipping fee / Shipment | No dedicated ERP Shipment/courier entity found | GOOD — resolves an open question | The Website's own `ShippingProvider`/`ManualShippingAdapter` can stay fully independent; there is no competing courier-tracking source to reconcile against (inference from absence — not exhaustively proven, flagged as such in `erp-domain-map.md`) |
| Price/discount/tax snapshot | `SalesOrderLine.unitPrice`, `SalesOrder.discountAmount/discountPercent` frozen at confirm-time | GOOD conceptual match | Both sides independently converged on snapshot-at-commit discipline. Tax remains UNKNOWN/unmodeled on the ERP side too — this is now a joint business decision, not something ERP inspection alone was going to resolve |
