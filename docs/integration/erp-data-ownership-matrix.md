# ERP Data Ownership Matrix

> **Phase 6 update (2026-09-10):** the real ERP has since been inspected. Every "ERP verification required" note below is now resolved in `erp-website-real-mapping.md` — notably: compare-at price and product media are both now resolved as website-owned (the ERP has neither concept), the inventory-allocation-timing question is resolved as a real, currently-unbounded risk (see `erp-inventory-analysis.md`), and variant structure is confirmed flat (not option×value pairs), matching this project's existing choice. This document is kept as-is below for its historical Phase 5 record.

Phase 5 — ERP Integration Readiness & Gap Audit. No ERP codebase or database was available to inspect this phase; every conclusion below comes from the current website implementation (`prisma/schema.prisma`, `src/modules/*`, `src/app/api/v1/*`) and the already-approved canonical docs (`blueprint.md` §5–§9, `data-ownership.md`, `technical-architecture.md` §3–§13, `module-boundaries.md`). Anywhere this document cannot determine an answer without seeing the real ERP, it says so explicitly — **"ERP verification required"** — rather than guessing.

Status: Phase 5. Last updated: 2026-09-08.

---

## 1. Method

Every entity below was checked against the actual `prisma/schema.prisma` (not a description of it) to confirm what's really persisted today, then cross-referenced against `blueprint.md` §5–§9's already-approved ownership rules and `data-ownership.md`'s conceptual model. Where the schema and the docs agree, that's stated plainly. Where this phase found a genuine open question the ERP itself must answer, it's flagged, not resolved.

---

## 2. Entity-by-entity audit

Columns: **Exists today?** (is it a real Prisma model, persisted) · **Current owner** (per the already-approved rules) · **Future ERP role** · **Notes**.

| Entity | Exists today? | Current owner | Future ERP role | Notes |
|---|---|---|---|---|
| Product | Yes (`Product`) | Website (seeded sample data — `prisma/seed.ts`) | **ERP-owned** for core facts (name, category, status); website-owned for rich content | `erpProductId String? @unique` already reserved as the reference column (never reused as the website's own primary key, per `technical-architecture.md` §13's identifier convention). See §3. |
| Product Variant / SKU | Yes (`Variant`) | Website (seeded) | **ERP-owned entirely** (projection only) per `blueprint.md` §5 | SKU (`Variant.sku`, unique) is the stable cross-system identity — cart items, order items, and (eventually) the ERP link all key off it, never off the website's internal UUID. No `erpVariantId` column exists separately from `sku` — **ERP verification required**: confirm the real ERP exposes a SKU as *the* stable identifier, or a separate internal id that must also be stored. |
| Category | Yes (`Category`) | Website (seeded) | **ERP-owned** for hierarchy; website adds display metadata only (`blueprint.md` §7) | No `erpCategoryId` column exists yet. Not a gap for *this* phase (nothing reads/writes it), but a real field to add once the ERP's category concept is inspected. |
| Product Media | **No dedicated model** | N/A | Not modeled | No `ProductMedia`/image table exists in the schema at all — Phase 3's storefront uses `ImagePlaceholder`, not real assets (`docs/design/asset-manifest.md`, still true). This is a genuine gap for ERP readiness *if* the ERP is expected to supply image references — **requires ERP inspection** to know whether it does. |
| Price | **Not a separate model** — fields on `Variant` (`priceAmountMinor`, `compareAtAmountMinor`, `currency`) | Website (seeded) | **ERP-owned** (projection) per `blueprint.md` §5/§7 | No temporal/historical price table exists (matches `data-ownership.md`'s "optional valid-from/valid-to if the ERP expresses temporary pricing" — deliberately not built since no such requirement was confirmed). |
| Inventory | **Not a separate model** — `Variant.inventoryQuantity` (raw) | Website (seeded) | **ERP-owned** (projection) per `blueprint.md` §5 | The raw quantity is never exposed to the API/storefront directly — only a derived `in_stock`/`low_stock`/`out_of_stock` state (`src/modules/catalog/inventory.ts`'s `deriveAvailability`). See §5. |
| Inventory Reservation | Yes (`InventoryReservation`) | **Website-owned, entirely** | **Not an ERP concept at all** — see below | This is the one inventory-adjacent entity that is *not* a projection candidate. It's a website-local, temporary, additive safety margin layered on top of whatever `Variant.inventoryQuantity` says — closing Phase 1's New Finding #1. It does not decrement real stock and has no ERP equivalent to sync against. **ERP verification required** only insofar as: does the ERP itself do its own reservation/allocation at order-push time, and if so, could the two reservation windows conflict? Not answerable without inspection. |
| Customer | Yes (`Customer`) | **Website-owned** (identity) | **Shared** — website owns identity, ERP record is reconciled at order time (`blueprint.md` §7/§12, ADR-006) | `erpCustomerId String?` already reserved. `reconcileCustomer()` (the conceptual ERP Adapter operation) is not implemented — no code calls it. |
| Customer Address | Yes (`Address`) | **Website-owned, entirely** | Sent to ERP as part of the order payload only (`blueprint.md` §7) | Never has, and per the approved model never should, live independently in the ERP as a synced entity — it travels *inside* the order push, not as its own sync target. |
| Cart / CartItem | Yes | **Website-owned, entirely** | **Never sent to ERP** (`blueprint.md` §7) | Confirmed: no code path anywhere sends cart state anywhere near an ERP concept. |
| CheckoutSession | Yes | **Website-owned, entirely** | Not an ERP concept | The pre-order draft (Phase 4's reconciliation of `data-ownership.md` vs `technical-architecture.md` §9 — see `docs/architecture/data-ownership.md`'s Phase 4 note). Exists only until it becomes an `Order` or expires. |
| Order | Yes (`Order`) | **Website-owned** (commercial envelope) | **Shared** — website owns checkout/payment/customer-facing status; ERP owns the operational/fulfillment envelope via the ERP Order Reference (`blueprint.md` §8) | `erpOrderReference`, `erpPushStatus`, `pushedToErpAt` already reserved, unpopulated (no push code exists). See §4/§6. |
| OrderItem | Yes | **Website-owned, immutable snapshot** | ERP receives this data as part of the order push payload; never reads it back | `skuSnapshot`, `productNameSnapshot`, `variantLabelSnapshot`, `unitPriceAmountMinor`, `quantity`, `lineTotalAmountMinor` — frozen at order creation, `variantId` kept only for traceability (nullable-on-delete, never read by pricing/display logic). See §4. |
| Payment | Yes (`Payment`) | **Website-owned** (provider-agnostic state machine) | Not an ERP entity — a payment provider concern, orthogonal to the ERP | `blueprint.md` §7 confirms this explicitly. The ERP push payload would include payment *method* and *status* as informational fields, not a live link. |
| Shipment | Yes (`Shipment`) | **Website-owned** (rate/selection); courier's tracking state is mirrored, not owned | Not directly an ERP entity in this project's approved model — a Shipping Adapter concern | `blueprint.md` §7's row: "Shipping/delivery record — Website-owned... courier's own tracking state is mirrored, not owned." Whether the *courier* is contacted through the ERP or a separate Shipping Adapter is itself open — see the gap analysis. |
| Promotion / Coupon | Yes (`Coupon`, `CouponRedemption`) | **Website-owned** for simple codes | Promotions *with real margin impact* would be **ERP-owned (projection, surfaced only)** — none exist yet | `blueprint.md` §7's distinction: simple website coupon vs. margin-impacting promotion. Only the former is built; the schema does not model the latter at all yet (correctly — no such requirement is confirmed). |
| Tax | Yes — `taxAmountMinor` columns on `CheckoutSession`/`Order` | **Website-owned column, policy unresolved** | **Requires ERP inspection AND a business decision** | `ZeroTaxPolicy` (`src/modules/checkout/tax-policy.ts`) is an explicitly temporary placeholder. Whether tax calculation should eventually be ERP-driven (many ERPs own tax/e-invoicing) is genuinely unknown without inspecting the real ERP — this is *not* assumed either way. |
| Notifications | Yes (interface + `LogNotificationProvider`) | **Website-owned** | Not an ERP entity | `blueprint.md` §7 lists "notification state" as purely operational to the website. |
| Audit / Event records | Yes (`AuditLog`) | **Website-owned, entirely** | Not an ERP entity | Operational/security audit trail, distinct from any future ERP-side audit log — no sync relationship. |
| Idempotency records | Yes (`IdempotencyKey`) | **Website-owned, entirely** | Not an ERP entity, but its *pattern* is reused for the ERP push itself | `blueprint.md` §8/§9: "the website order id is the idempotency key used when pushing to the ERP" — the same `IdempotencyKey` table/pattern this phase's Phase 4 work already built is the natural mechanism, not a new one. |

---

## 3. Product / Variant field-level ownership matrix

Classification key: **1** Website-owned · **2** ERP-owned · **3** ERP → Website projection · **4** Website → ERP command/input · **5** Immutable order snapshot · **6** Requires ERP verification · **7** Future / not MVP.

| Field | Classification | Basis |
|---|---|---|
| Product identity (internal UUID) | 1 | Website-generated primary key, never sent to or accepted from the ERP (`technical-architecture.md` §13's identifier rule) |
| Product identity (ERP reference) | 3 | `Product.erpProductId` — reserved column, unpopulated |
| Name | 3 | `blueprint.md` §7: "Product core facts... Projection" |
| Description (short/base) | 3 (base) | Same row — but see next |
| Description (rich story, photography) | 1 | `blueprint.md` §7: "Product rich content... Website-owned. No ERP concept of this exists" — a confident claim already in the approved docs, not new to this phase |
| Category | 3 | `blueprint.md` §7: "Category/collection structure... ERP owns hierarchy" |
| Brand | 7 | No `brand` field exists anywhere in the schema or any doc — this business appears to be single-brand (Jawaher Al Khair itself), so a per-product brand field has never been a requirement. Not a gap; genuinely out of scope unless the business says otherwise. |
| SKU | 3 | `Variant.sku`, unique — the stable cross-system identity |
| Barcode | 6 | No barcode field exists. Whether the ERP tracks barcodes and whether the website needs to display/use one (e.g. in-store pickup, future POS unification) is unknown — **requires ERP inspection** |
| Variant (size/weight label) | 3, with a caveat | `Variant.label` is a plain string, not a structured option system (Phase 4's deliberate choice — see `commerce-completeness-audit.md` §2/§3: "do not over-generalize... EAV system"). Whether the ERP models variants the same way (one flat label) or as structured option/value pairs is **6 — requires ERP inspection**, since that shapes how the projection sync would map ERP variant data onto this column |
| Unit (piece/kg/etc.) | 7 | Not modeled — no requirement has ever specified it distinctly from the label string |
| Weight (for shipping calculation) | 7 | Not modeled — the current `ManualShippingAdapter` prices by governorate zone only, never by weight (`commerce-completeness-audit.md` §9); if the real ERP or a future courier needs weight, this is new schema work, not currently blocked by anything |
| Price | 3 | `Variant.priceAmountMinor` |
| Compare-at price | 3 | `Variant.compareAtAmountMinor` — `data-ownership.md`'s Price entity already notes this may be website-adjacent promotional data rather than strictly ERP-sourced; **6 — requires ERP inspection** to know whether the real ERP even expresses a compare-at concept, or whether this stays a website/Promotions-module concern |
| Cost (wholesale/COGS) | 7 | Not modeled anywhere — no requirement has ever asked the website to know or display cost; if the ERP exposes it, there is currently no reason for the website's own database to store it at all (an internal-margin concern, not customer-facing) |
| Inventory quantity | 3 | `Variant.inventoryQuantity` (raw) — never exposed directly, only the derived state |
| Availability (in/low/out of stock) | 1, derived from 3 | Computed by `deriveAvailability()` from the projection minus active reservations — the *derivation* is website logic, the *input* is a projection |
| Media | 6 | No model exists; whether the ERP supplies image references at all is unknown — **requires ERP inspection**. Until then, `blueprint.md` §7's silence on this + `technical-architecture.md` §16's statement that photography is "website-owned content, supplied via `_reference/products/images/`" suggests media may end up **1 (website-owned)**, not a projection — but this is inference, not confirmed, hence classification 6 |
| SEO title / description | 1 | No canonical doc has ever attributed SEO metadata to the ERP; Phase 3 already implements this as website-owned (`generateMetadata` per route) |
| Slug | 1 | Website-generated (Phase 3), used for routing — not an ERP concept in any doc |
| Website visibility (published/hidden) | 1, informed by 3 | `Product.status` (`ACTIVE`/`DISCONTINUED`) exists and is website-queried, but its *source* is the ERP's own status per `blueprint.md` §5 ("operational order state" and by extension product status are ERP-authoritative facts) — so this is really classification 3, with the website's `status` enum being the projected value, not an independent website decision |
| Featured status | 7 | Not modeled. `docs/architecture/technical-architecture.md` §15 describes Content/Merchandising as owning homepage curation (a website-owned concern, separate from the catalog projection) — a "featured" flag, if it ever exists, would most likely be **1 (website-owned, Content module)**, not ERP-sourced. Not built because nothing has required it yet. |

---

## 4. Order field-level ownership matrix

| Field | Classification | Basis |
|---|---|---|
| Website order ID (internal UUID) | 1 | Never sent to the ERP as *the* identifier for cross-referencing beyond being the idempotency key value itself |
| Public order number (`JAK-XXXXXX`) | 1 | Customer-facing, website-generated (`node:crypto`'s `randomInt`, Phase 4) |
| ERP order reference | 3 | `Order.erpOrderReference` — reserved, unpopulated. **6 — requires ERP inspection** for its actual shape (numeric? alphanumeric? multi-part?) |
| Customer | 1, with 4 at push time | The linked `Customer.id` (website-owned) plus, at ERP-push time, whatever customer-identifying payload the ERP needs (name/phone) — classification 4 for that outbound slice |
| Address | 5 | Fully snapshotted onto the `Order` row at creation (`shippingRecipientName`, `shippingGovernorate`, etc.) — never a live reference. Sent to the ERP as part of the push payload (classification 4 for that specific outbound moment), but the website's own copy is permanently classification 5 |
| Items (SKU, quantity, price) | 5 | `OrderItem`'s snapshot fields — see §2's Order/OrderItem row. This is the one place `data-ownership.md`/`technical-architecture.md` §9 are most explicit: "once an order exists, its historical total must never change even if the catalog price later changes" |
| Discounts | 5 | `Order.discountAmountMinor`, frozen at creation |
| Taxes | 5, policy is 6+D | The *amount* actually applied is an immutable snapshot the moment it's true — but the *policy* that produced it (`ZeroTaxPolicy`) is both **6 (requires ERP inspection)** and **D (business decision required)**, per §3's Tax row |
| Shipping fee | 5 | `Order.shippingFeeAmountMinor`, frozen at creation, computed by the `ManualShippingAdapter` (website-owned, zone-lookup based) at the time of order placement |
| Total | 5 | Computed server-side, never client-supplied (verified during Phase 4's review — no API route accepts a price/total field from a client, at all) |
| Payment state | 1 | Lives on the linked `Payment` record's own state machine, entirely website/provider-owned — not an ERP concept (§2's Payment row) |
| Fulfillment state | 3 | Explicitly *not* populated yet (`Order.erpPushStatus` tracks only the website's own push attempt, never real ERP fulfillment stages — a deliberate Phase 4 choice to avoid guessing the ERP's stage vocabulary) |
| Order state (website lifecycle) | 1 | `Order.status`: `CONFIRMED → CANCELLED` only — see `commerce-completeness-audit.md` §14 for why "refunded" isn't a third value here |
| Timestamps | 1 | `createdAt`/`updatedAt`/`cancelledAt` — website-generated |
| Cancellation | 1, with 4 at push time | A website-initiated cancellation is a website `OrderStatus` transition; whether/how it must also be communicated to the ERP (to stop fulfillment) is **6 — requires ERP inspection** |
| Return information | 7 | Not modeled at all yet (Phase 1's New Finding #2, still open — no return/RMA workflow exists) |

---

## 5. Inventory architecture — what "stock" actually means today

- **"Stock" (raw)**: `Variant.inventoryQuantity` — an integer column, currently populated only by `prisma/seed.ts`'s sample data. In a real system this would be written exclusively by the ERP Adapter's sync job (`blueprint.md` §6, `technical-architecture.md` §3) — no such job exists yet, and no code other than the seed script writes this column.
- **"Available stock"**: never the raw column directly. `getAvailableQuantity()` (`src/modules/catalog/inventory.ts`) computes `raw quantity − sum(ACTIVE InventoryReservation rows for that variant)`. This is the *only* function every other "is this purchasable" check in the codebase calls.
- **Reservation lifecycle**: `ACTIVE → CONSUMED` (order placed) or `ACTIVE → RELEASED`/`EXPIRED` (failure, cancellation, or TTL — `INVENTORY_RESERVATION_TTL_MINUTES`, default 15, centrally configurable per Phase 4's review). A released/expired reservation is simply excluded from the sum going forward — it can never *add* to available stock beyond the raw quantity, by construction (verified by `tests/integration/inventory-concurrency.test.ts`).
- **Concurrency protection**: row-level locking (`SELECT ... FOR UPDATE` inside a Prisma transaction) on the `Variant` row before computing available quantity and inserting a reservation — verified under real concurrent load (10 simultaneous attempts at 3 available units → exactly 3 succeed).
- **What happens once the ERP becomes the real inventory source of truth**: the reservation mechanism does **not** need to change. It is deliberately a website-local *safety margin* layered on top of whatever `inventoryQuantity` currently says, not a replacement for or competitor to ERP-owned inventory — see §2's Inventory Reservation row. The only change needed is that `inventoryQuantity` starts being written by a real sync job instead of the seed script; every reservation/availability calculation downstream is already correct against "whatever the projection currently says." **ERP verification required**: does the ERP perform its *own* allocation/hold at the moment an order is pushed to it, and if so, is there a window where the website believes stock is available (reservation active, not yet consumed) while the ERP simultaneously allocates the same unit to a different channel (in-store, another sales channel)? This can only be answered by inspecting the real ERP's own concurrency model — flagged, not resolved.

---

## 6. Pricing architecture — where prices originate and how they're protected

- **Origin today**: `Variant.priceAmountMinor`/`compareAtAmountMinor`, seeded sample data. In the approved model, these become an ERP projection (`blueprint.md` §5/§7) once a real sync exists.
- **Representation**: integer minor units (piasters) throughout — `src/domain/money.ts`'s `Money` class, never a float, `technical-architecture.md` §13's binding convention. Confirmed still true everywhere: no `Float`/`Decimal` field exists anywhere in `prisma/schema.prisma`.
- **Browser trust**: confirmed, not assumed — every `zod` schema across `src/app/api/v1/**` was re-checked during Phase 4's review pass and accepts no price/amount/total field from the client anywhere. Every price used in a calculation is read live from `Variant`/`Coupon`/`ShippingZone` inside the server-side service layer.
- **Order-time snapshotting**: `OrderItem.unitPriceAmountMinor`/`lineTotalAmountMinor`, `Order.subtotalAmountMinor`/`discountAmountMinor`/`shippingFeeAmountMinor`/`taxAmountMinor`/`totalAmountMinor` — all written once, at order creation, inside the single checkout transaction, and never recomputed or overwritten afterward. **Directly verified by a dedicated test** (`tests/integration/checkout.test.ts`'s "order monetary snapshots never change when the current product price changes afterward," added during Phase 4's review): an order's total and its `OrderItem.unitPriceAmountMinor` are asserted unchanged after the underlying `Variant.priceAmountMinor` is mutated. This is the concrete mechanism that protects historical order prices from future catalog price changes — not just a documented intention.
- **Promotions/coupons**: `PromotionsService.calculateDiscount()` — percentage (rounded to the nearest piaster) or fixed (capped at the subtotal so a discount can never make a line negative), applied to the live subtotal at checkout confirmation, then frozen into the order snapshot like everything else above.
- **Tax**: see §3's Tax row and §7 below — a real column, a real policy interface, a temporary zero implementation, explicitly not a compliance decision.
- **Shipping fee**: computed by `ManualShippingAdapter` from `ShippingZone` (governorate → fee lookup, website-maintained data, explicitly labeled as placeholder fees in `prisma/seed.ts` — never presented as confirmed real pricing).
- **What will likely become ERP-driven**: base price, compare-at price (pending §3's flagged uncertainty), and possibly tax (pending inspection) — coupons/promotions (simple codes) and shipping fee (zone lookup) are website-owned by design and have no reason to move, per the already-approved `blueprint.md` §7 rows for Coupon and Shipping.

---

## 7. Customer architecture — identity, guest checkout, and what might sync

- **Identity**: phone number (E.164-normalized — `src/domain/phone.ts`), the sole identity primitive. `Customer.phoneE164` is unique; no email-based or username-based identity exists or has ever been specified.
- **OTP boundary**: `src/modules/customers/otp.ts` — code is hashed (never stored raw), rate-limited, time-boxed. No real SMS/WhatsApp provider is wired (`LogNotificationProvider` only) — this is unrelated to ERP integration specifically, but is a real gap for production readiness generally (already tracked, not new to this phase).
- **Guest checkout**: fully supported — `Customer` records are only created for phone-verified (OTP-completed) users; a guest order carries `guestPhoneE164` directly on the `Order`/`CheckoutSession` with `customerId: null`. Confirmed by reading the schema and the checkout service, not assumed.
- **Addresses**: website-owned entirely, never synced independently — see §2/§4.
- **Persistence**: `Customer`, `Session`, `Address`, `OtpChallenge` are all real, persisted models today (schema-verified).
- **Order association**: `Order.customerId` (nullable) — a guest order has no `Customer` row at all, only the phone captured directly on the order.
- **What may need to sync with the ERP**: `reconcileCustomer()` is the conceptual operation already named in `blueprint.md` §9/`module-boundaries.md` (match on phone/email, create if absent in the ERP, store the returned reference on `Customer.erpCustomerId`) — **not implemented**, no code calls anything resembling it. This phase does **not** invent what fields the ERP's customer record actually needs beyond what's already approved (phone/email match) — anything more specific is **6 — requires ERP inspection**.

---

## Outcome

Every entity the brief asked to audit has a row above. The pattern that emerges is consistent with what `blueprint.md`/`data-ownership.md` already approved back in Stage 0.9 — nothing in this phase's inspection contradicts that approved model. The genuinely new information this phase adds is: (a) confirmation of exactly which reserved ERP-reference columns already exist in the real schema vs. which don't yet (media, category reference, barcode), and (b) a small set of fields that cannot be classified without seeing the real ERP (variant option structure, compare-at semantics, cancellation-push requirement, ERP's own inventory-allocation timing) — each flagged individually rather than guessed.
