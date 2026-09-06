# Jawaher Al Khair — Domain Model & Data Ownership

Conceptual domain model (entities, invariants, state transitions) and the detailed data-ownership matrix. Elaborates [`blueprint.md`](./blueprint.md) §7 with the operational columns this stage requires (sync direction, conflict authority, update trigger, failure behavior). No Prisma models or code — conceptual only.

Status: **Draft for review — Stage 0.9.** Last updated: 2026-09-06.

---

## 1. Domain entities

### Product
- **Identity:** ERP product id (reference) + website UUID.
- **Invariants:** a product always belongs to exactly one category; a discontinued product is never shown in listings/search but remains resolvable by direct link (for historical order references).
- **State transitions:** `active → discontinued` (one-way; an ERP-side "un-discontinue" is treated as a new sync creating/reactivating the row, not a manual website action).
- **Ownership:** core facts (name, category, status) — projection from ERP; rich content (description, story, photography) — website-owned.
- **External dependency:** ERP Adapter (projection sync).

### Variant (SKU)
- **Value object-like fields:** size/weight, attributes (e.g. date variety, honey source) where the ERP exposes them.
- **Invariants:** SKU is globally unique and stable — it is the identity used by cart items and order items, never the product's own id.
- **State transitions:** `in_stock → low_stock → out_of_stock` (derived from projected inventory, not stored as a separate manual flag); `active → discontinued` mirrors the parent product.
- **Ownership:** ERP-owned entirely (projection only).

### Price
- **Value object:** amount (integer minor units) + currency (EGP) + optional valid-from/valid-to if the ERP expresses temporary pricing.
- **Invariants:** always attached to a specific variant/SKU, never to a product in the abstract (a product with multiple sizes has multiple prices).
- **Ownership:** ERP-owned (projection only) for the base price; a promotional/discounted price may be a Promotions-module overlay (website-owned) applied at checkout time, never written back into the projected price field.

### Inventory
- **Value object:** an availability state derived from a raw quantity (`in_stock`/`low_stock`/`out_of_stock`), not the raw quantity itself, exposed to the storefront.
- **Invariants:** never negative from the website's perspective; a projection showing negative or nonsensical inventory is treated as a sync data-quality failure (logged, not displayed).
- **Ownership:** ERP-owned (projection only).

### Customer
- **Entity:** phone (normalized, unique), name, email (optional), notification preferences.
- **Invariants:** phone number is the unique identity — two customer records can never share a verified phone.
- **State transitions:** `guest (session only) → registered (phone verified)`.
- **Ownership:** website owns the identity/auth fields; a corresponding ERP customer reference is created/matched at order time (reconciliation) and stored as a reference on the website record — the ERP never originates a website customer.
- **External dependency:** ERP Adapter's `reconcileCustomer()`, called only at order time.

### Address
- **Value object attached to a customer:** label, recipient, structured fields (governorate/city/area/street/building/floor/apartment), free-text landmark/notes, default flag.
- **Invariants:** a customer may have zero (guest) to many saved addresses; exactly one may be marked default at a time.
- **Ownership:** website-owned entirely. **Never referenced live from an Order** — an order stores an address *snapshot* (see Order below), so editing/deleting a saved address never alters a past order's record.

### Cart / CartItem
- **Entity:** one active cart per session (guest) or customer (authenticated); items keyed by SKU with a quantity.
- **Invariants:** quantity is always clamped server-side to current projected inventory; a cart never stores a price — it always defers to Catalog at read time (technical-architecture.md §8).
- **State transitions:** `active → converted (became an order) | abandoned (implicit — no explicit state, just inactivity)`.
- **Ownership:** website-owned entirely; never sent to the ERP until checkout produces an order.

### Order / OrderItem
- **Entity:** the Website Order (blueprint §8) — order items are **snapshots** of SKU, quantity, and price at creation time (the one place price is intentionally frozen, technical-architecture.md §9).
- **Invariants:** once created, historical totals never change even if the catalog price later changes; an order always has exactly one address snapshot, one shipping snapshot, and links to at most one active payment record (additional payment attempts after a failure are still one-per-order in sequence, not parallel).
- **State transitions:** `created → payment_pending → paid → pushed_to_erp → (cancelled | refunded)`, with the ERP Order Reference separately carrying `preparing → out_for_delivery → delivered` (mapped one-way into the same customer-facing record).
- **Ownership:** website-owned for the commercial envelope; ERP-owned for the operational/fulfillment envelope (ERP Order Reference) — see blueprint §8, restated in full below.

### Payment
- **Entity:** one or more attempts linked to an order.
- **State transitions:** `initiated → pending → authorized (optional) → captured → refund_initiated → refund_completed`, with `failed`/`cancelled` reachable pre-capture (technical-architecture.md §5).
- **Invariants:** exactly one payment may be in a non-terminal state per order at a time (a new attempt after a failure supersedes the failed one, rather than running concurrently).
- **Ownership:** website-owned (provider-agnostic state machine); the provider's own ledger is the provider's concern, not mirrored in full.

### Shipment
- **Entity:** the selected method, computed fee/estimate, and tracking state linked to an order.
- **Invariants:** fee/estimate are snapshotted at order creation, like other order-time facts.
- **Ownership:** rate/selection is website-owned; the courier's own tracking state is mirrored (read-only), never authored by the website.

### Promotion / Coupon
- **Entity:** a website-owned code with a simple rule (percentage/fixed amount, validity window, usage limit) — no complex pricing-rule engine.
- **Invariants:** at most one manual coupon applied per order at MVP (requirements §12 — a business rule, confirmed as a UX default in `ux-decisions.md`, not re-litigated here).
- **Ownership:** website-owned for simple codes; any promotion with real margin impact is ERP-defined and only ever *surfaced*, never authored, by the website (blueprint §7).

---

## 2. Data ownership matrix

| Data object | Source of truth | Website storage | Sync direction | Conflict authority | Update trigger | Failure behavior |
|---|---|---|---|---|---|---|
| Products (core facts) | ERP | Projection table | ERP → Website (one-way) | ERP | Scheduled sync | Stale projection retained; alert on repeated failure (technical-architecture.md §3) |
| Variants/SKUs | ERP | Projection table | ERP → Website | ERP | Scheduled sync | Same as above |
| Prices | ERP | Projection table | ERP → Website | ERP | Scheduled sync | Same as above; never partially written (all-or-nothing per record, §3) |
| Inventory | ERP | Projection table (derived availability state) | ERP → Website | ERP | Scheduled sync | Same as above; derived state tolerates a few minutes of staleness by design |
| Product rich content (story, photography) | Website | Content table | N/A — website-authored | Website | Content edit | N/A |
| Customers | Website (identity) / ERP (operational mirror) | Customers table (website) + ERP reference | Website → ERP (one-way, at order time only) | Website for identity; ERP's copy is a mirror only | Order creation | If reconciliation fails, the order is still created website-side and retried per the ERP Adapter's failure handling (§4) |
| Addresses | Website | Addresses table | N/A | Website | Customer edit | N/A |
| Orders (commercial envelope) | Website | Orders/OrderItems tables | Website → ERP (one-way, order push) | Website | Order creation | ERP push failure → dead-letter + retry (§4/§9); the order remains valid website-side regardless |
| ERP Order Reference (operational envelope) | ERP | Reference + mapped status field | ERP → Website (one-way, status pull) | ERP | Scheduled pull or webhook | Stale status shown as "جاري التحديث," never as an error (technical-architecture.md §21/UX spec §21) |
| Payment state | Website (provider-agnostic) / Provider (source for the raw event) | Payments table | Provider → Website (webhook or poll) | Provider's reported state, mapped into the website's state machine | Payment attempt, webhook, reconciliation poll | Missed webhook caught by periodic reconciliation (§5) |
| Shipping state | Website (rate/selection) / Courier (tracking) | Shipments table | Website → Shipment created; Courier → Website for tracking | Website for rate/selection; courier for tracking status | Order creation; tracking poll | Tracking unavailable shown calmly, not as an error (§6) |
| Coupons/Promotions (simple) | Website | Promotions table | N/A | Website | Admin/content edit | N/A |
| Promotions with margin impact | ERP | Projection (surfaced only) | ERP → Website | ERP | Scheduled sync | Same as prices |
| Analytics events | Website | Event log table | N/A — generated by website interactions | Website | User/system interaction | A failed write is logged and dropped — never retried in a way that could block the triggering action (ADR-012) |
| Cart/CartItems | Website | Cart tables | N/A | Website | Customer interaction | N/A |

**The rule that prevents accidental bidirectional ownership:** every row above has exactly one arrow direction for a given field. Nowhere does the website write back into an ERP-owned field, and nowhere does the ERP read a website-owned field except the two explicitly one-way exceptions that exist by design — order push (website → ERP) and customer reconciliation (website → ERP, read-and-match only, never overwriting an existing ERP customer's other fields).
