# Website ↔ ERP Real Data Mapping

Phase 6. This is the document `erp-data-contract-outline.md` was explicitly written to be filled in by — every `[BRACKETED PLACEHOLDER]` in that document is resolved (or explicitly still open) here, now that the real ERP has been read. Order-specific mapping lives in `erp-order-lifecycle-mapping.md` §3 (referenced, not duplicated); inventory-timing mapping lives in `erp-inventory-analysis.md` (referenced, not duplicated). This document covers Product/Variant/Category/Price/Inventory/Media and Customer.

Status: Phase 6. Last updated: 2026-09-10.

---

## 1. How to read this

Columns: **Website entity → ERP entity**, **Match quality** (GOOD / PARTIAL / NONE), **Mapping** (how the two connect), **Conflict**, **Required change**, **Open question**.

---

## 2. Product mapping

| Website | ERP | Match | Mapping | Conflict | Required change | Open question |
|---|---|---|---|---|---|---|
| `Product` (`erpProductId` reserved, unique) | `Product` (schema:733) — but note the ERP's real sellable unit is `ProductVariant`, not `Product` | GOOD, with a caveat | `Product.erpProductId` ↔ `ERP Product.id` | None structural | None for MVP | None — resolved |
| `Variant` (`sku` unique, `label` flat string) | `ProductVariant` (schema:809) — also flat (no structured option×value model found anywhere in the 79-model schema) | GOOD — resolves Phase 5's flagged uncertainty | `Variant.sku` ↔ `ProductVariant.sku` | ERP has **no single "label" field** — variant identity is attribute-based (`packQuantity`, etc.) plus a Shopify-only `channelMetadata` blob for option values | The projection sync must construct a display label from ERP fields/`channelMetadata`, or the business must define one | What should the constructed label actually say, when the ERP has no single source string for it? |
| SKU | `ProductVariant.sku` | GOOD, one caveat | Direct | ERP SKU is **unique per company**, not globally — compatible only because one website maps to exactly one ERP `Company` (confirmed in `erp-discovery.md` §4) | None, given the one-website-one-company assumption | Confirm that assumption formally if it isn't already written down as a decision |
| Barcode (not modeled on the website) | `ProductVariant.barcode` — exists, **not** unique-constrained | Resolves Phase 5's "requires ERP inspection" flag | If needed, a straightforward projection field | ERP itself allows duplicate barcodes (accepted data-quality gap) | Add a `barcode` column to `Variant` only if a real requirement (e.g. future POS/in-store) emerges — not needed for MVP | None |
| `Category` (flat, seeded) | `ProductCategory` — self-referencing **tree** | PARTIAL | New `erpCategoryId` column needed on `Category` (doesn't exist yet — confirmed gap on both sides) | ERP category is hierarchical; Website's is flat | Decide: does Website need to become hierarchical to mirror ERP faithfully, or just store the ERP leaf category id and flatten for display? | Business/design decision — not resolvable by further code reading |
| `Variant.priceAmountMinor`/`compareAtAmountMinor` (integer minor units, never Float/Decimal) | `ProductVariant.sellingPrice` (Prisma `Decimal`) — **no compare-at/promotional price field exists anywhere on `ProductVariant`** | PARTIAL | Projection sync converts ERP `Decimal` EGP → integer piasters | Type/precision conversion required; rounding must be handled deliberately, once, in the adapter | Compare-at price is **resolved**: classify as **website-owned (1)**, not an ERP projection — the ERP has no such concept at all | None — resolved, contrary to Phase 5's uncertainty |
| `Variant.inventoryQuantity` (raw, single number per SKU) | `StockQuant.onHandQuantity − reservedQuantity`, computed per (variant, lot, location) | PARTIAL — granularity mismatch | The read endpoint must **sum across all locations/lots for a variant** into one number (the ERP's existing `getStockAvailability()` query already computes this shape internally) | ERP allows negative on-hand by design; the projection **must floor at zero** before it ever reaches the Website — a customer must never see negative stock | New aggregation logic in the read endpoint; floor-at-zero in the adapter or the endpoint (pick one, document it) | None — resolved; see `erp-inventory-analysis.md` for the full timing analysis |
| Product Media (no model; `ImagePlaceholder` only) | **No dedicated model** — generic `FileAsset`, `category="attachment"`, no `"product_image"` category, no ordering/primary flag, no Shopify-image-sync | Resolves Phase 5's "requires ERP inspection" flag — **the ERP does not supply real product images either** | N/A — nothing to project | Both sides are genuinely gap-equal here | Classify media as **website-owned (1)** on both sides of this integration; if real photography is needed, source/host it independently of the ERP | Who supplies/manages product photography, if not the ERP? — business decision, not an ERP-inspection question |
| Website visibility (`Product.status: ACTIVE/DISCONTINUED`) | `Product.status: draft/active/discontinued/archived` | GOOD | Map `active→ACTIVE`, `discontinued/archived→DISCONTINUED`, `draft→` (exclude from projection entirely — a draft product shouldn't reach the storefront) | None real | Add the three-way mapping in the adapter | None |

---

## 3. Customer mapping

| Website | ERP | Match | Mapping | Conflict | Required change | Open question |
|---|---|---|---|---|---|---|
| `Customer` (phone-identity, `erpCustomerId` reserved) | `BusinessPartner` + `CustomerProfile` (1:1 thin extension) | GOOD structurally | `Customer.erpCustomerId` ↔ `BusinessPartner.id` | ERP has **no unique constraint** on `email`/`phone` — duplicates are matched, not DB-prevented. More importantly: the only real match-or-create logic that exists (`resolveShopifyCustomer`/`ShopifyCustomerSyncModule`) is **Shopify-import-specific code**, not a callable, general-purpose service | A `reconcileCustomer()`-equivalent must be **generalized/extracted** from the Shopify-specific matching logic (or rebuilt) into something a non-Shopify caller can invoke — this is new ERP-side work, not a mapping | — |
| `Customer.phoneE164` | `BusinessPartner.phone` (real, indexed, non-unique) | GOOD for lookup, weak for uniqueness | Match by phone | Duplicate risk exists on the ERP side regardless of how clean the Website's own model is, unless the generalized reconcile logic is careful | Same as above | — |
| Guest checkout (`customerId: null`, `guestPhoneE164` on the order) | No guest concept — **every** Shopify customer becomes a real `BusinessPartner`, even with minimal/no email | CONFLICT | If a guest order is ever reconciled into the ERP, it will create a permanent `BusinessPartner` row, matching Shopify's own precedent | None technical — but a policy question | Decide the reconciliation trigger for guest orders | Does the business want every guest web order to create a permanent ERP customer record, or a distinct "walk-in"/anonymous bucket? — **business decision (D)**, not resolvable from code |
| `Address` (website-owned entirely, never synced as its own entity) | **No independent Address model found anywhere in the ERP's 79-model schema** | GOOD — confirms Website's existing plan needs no change | Address travels inside the order push payload only | None | None | None — resolved, matches what was already approved |
| Create vs. update vs. reference | ERP's own working, proven pattern (Shopify path): **create-if-absent, non-destructive update/merge if matched, logged either way** | GOOD | This is almost exactly the Website's already-approved reconcile-at-order-time design (`blueprint.md` §9, ADR-006) | None in shape — only in the fact that it must be rebuilt as a generalized capability, not reused directly | Reuse the *pattern*, not the code (the code is Shopify-import-specific) | — |

---

## 4. Order, payment, shipping mapping

Covered in full in `erp-order-lifecycle-mapping.md` §3 (field/state table) and `erp-inventory-analysis.md` §2-4 (timing, race conditions). Summary of what's newly resolved here that Phase 5 could not know:

- **The ERP order-create operation Phase 5 asked about does not exist for any non-Shopify caller.** This is the single biggest correction to the Phase 5 documents' framing — they assumed *some* operation existed whose shape merely needed inspecting; it needs to be *built*.
- **The ERP's real operational status vocabulary** is now known (`erp-order-lifecycle-mapping.md` §1) — including which enum values are dead and must not be mapped onto.
- **Payment is, and has always been, entirely manual/human on the ERP side** — no gateway, no webhook, ever. This is stronger than Phase 5's "confirm this holds" framing; it is confirmed, and it means the future push payload needs a *new* acceptance path for payment status, not just a field mapping.
- **No Shipment/courier entity exists in the ERP** — resolving Phase 5's flagged "significant architectural fork": the Website's own Shipping Adapter can most likely remain fully independent (inference from absence, not exhaustively proven — see `erp-domain-map.md` §4).

---

## 5. Outcome

Every `[BRACKETED PLACEHOLDER]` in `erp-data-contract-outline.md` is now either resolved above, or explicitly named as a business decision in `erp-integration-final-gap-analysis.md`. Nothing here was invented — every ERP-side fact traces to a specific file:line found by direct code reading (see the three audit source reports summarized in `erp-domain-map.md`, `erp-inventory-analysis.md`, and `erp-order-lifecycle-mapping.md`).
