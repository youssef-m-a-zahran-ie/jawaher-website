# Website Admin Boundary vs. ERP

Phase 7. Revisits the Website's already-planned internal/admin surface against the real ERP's actual back-office capability (Phase 6), to determine what a future Website Admin module should and should not own. No existing Website document names a standalone "ERP Website Administration module" beyond the `Admin/internal API` row and the `Content / Merchandising` module already present in `blueprint.md`/`technical-architecture.md` — this document treats those as the starting point, not a document this phase failed to find.

Status: Phase 7. Last updated: 2026-09-11.

---

## 1. What the ERP already has as its own admin/back-office — do not duplicate any of it

The ERP **is**, in large part, already a full back-office application — `src/features/*` contains a moderator/warehouse/purchasing/finance/admin UI built directly on top of the service layer audited in Phase 6. Confirmed real and operational (RBAC-gated, Server-Action-driven):

| Function | Owner | Evidence |
|---|---|---|
| Product/variant/category/brand CRUD | ERP | `src/features/products/actions/*` |
| Inventory operations (receiving, counts, adjustments, reservations) | ERP | `src/features/warehouse/actions/*` |
| Purchasing (POs, GRNs, suppliers) | ERP | `src/features/purchasing/actions/*`, `src/features/suppliers/actions/*` |
| Sales order validation/fulfillment/delivery queues | ERP | `src/features/moderator/actions/*`, `src/features/delivery/actions/*`, `src/features/operations/actions/*` |
| Financial/operational data (invoices, payments, cost accounting, chart of accounts) | ERP | `src/features/finance/actions/*` |
| Users/roles/permissions | ERP | `src/features/admin/actions/*`, `src/modules/rbac/` |
| Shopify (and future website) connector management | ERP | `src/features/integrations/actions/*` |
| HR | ERP | `src/features/hr/actions/*` |

**None of this should ever be rebuilt inside a Website Admin module.** Building a parallel product-editing or inventory-adjustment UI on the Website side would directly violate the already-approved "ERP always wins, website never edits ERP-owned facts" rule (`blueprint.md` §6) and would reintroduce exactly the dual-source-of-truth risk this entire integration effort exists to avoid.

---

## 2. What is genuinely Website-specific and has no ERP equivalent

Confirmed by Phase 6: the ERP has **no** concept of any of the following anywhere in its 79-model schema or its `src/features` admin UI:

| Function | Why it's Website-only | Basis |
|---|---|---|
| Homepage sections, offer banners | No equivalent model/UI in the ERP | Already planned as Website's own `Content/Merchandising` module (`technical-architecture.md` line 335/381) |
| Featured products | No `featured` flag anywhere in the ERP schema | Confirmed absent in `erp-domain-map.md`; already anticipated as website-owned in `erp-data-ownership-matrix.md` §3 |
| Website merchandising (curation, cross-sell/rule-based recommendations) | No equivalent in the ERP | `technical-architecture.md` §15, already-approved as website-owned |
| SEO content (titles, meta descriptions, structured data) | No equivalent in the ERP | Already website-owned, Phase 3 implementation confirmed in earlier phases |
| Product presentation / rich content (story copy, long-form description, "Products Experience" content) | Confirmed no ERP concept of this exists (`blueprint.md` §7, reconfirmed against real ERP in Phase 6 — the ERP's product description field, if any, was not found to carry anything beyond basic catalog facts) | — |
| Product media (photography/video) | **Neither side has a real model** — Phase 6's single clearest finding on this topic: the ERP's `FileAsset` has no `"product_image"` category, no ordering/primary flag. Media must be Website-owned by necessity, not just preference | `erp-domain-map.md` §1, `erp-website-real-mapping.md` §2 |
| Customer-facing offers/promotions, if not ERP-owned | Confirmed: **no Promotion/Coupon/Discount model exists in the ERP at all** — the Website's own simple coupon-code `PromotionsService` has no ERP counterpart to duplicate | `erp-domain-map.md` §4 |
| Navigation/menu configuration | No ERP equivalent — a pure presentation concern | — |

---

## 3. The category boundary — the one genuinely mixed case

`ProductCategory` is real, hierarchical, and ERP-owned for its taxonomy (§`erp-website-real-mapping.md` §2) — but the Website already anticipates adding **display metadata** on top of the ERP's hierarchy (`blueprint.md` §7: "website only adds display metadata"). A future Website Admin surface should therefore support: choosing which ERP categories appear in navigation, their display order/labels/imagery — **never** creating, renaming, or restructuring the category tree itself (that stays exclusively an ERP back-office action).

---

## 4. What the future Website Admin module actually needs (scoped, not duplicating anything above)

| Capability | Notes |
|---|---|
| Manage homepage sections, banners, featured-product selection | Already-planned `Content/Merchandising` module — this integration doesn't change its scope, only confirms nothing ERP-side competes with it |
| Manage SEO/product-presentation content per product (keyed by `erpProductId`/`sku`) | Layered on top of the ERP-sourced projection, never editing the projected facts themselves |
| Manage product media | Website-owned by necessity (§2) — a real content-management need this integration surfaces but does not solve; scoping its build is a separate decision from this integration |
| View sync/push health (last successful catalog sync, dead-lettered order pushes, reconciliation status) | **New, directly required by this integration** — someone needs to see the dead-letter table (`erp-integration-failure-recovery.md`) and reconciliation results (`erp-integration-reconciliation.md`) without needing raw database access. This is the one genuinely new admin surface this integration introduces |
| Manage coupons/promotions | Already Website-owned, unaffected by this integration |
| Trigger a manual sync (catalog/inventory) | Matches the already-anticipated `Admin/internal API` row ("manual sync triggers," `blueprint.md` line 77) — a thin action calling the same adapter the scheduled job uses |
| **Explicitly NOT**: manage warehouses, suppliers, purchase orders, inventory adjustments, order fulfillment/delivery, users/roles/permissions, finance/cost accounting, or the Shopify connector itself | All already fully owned and operational in the ERP's own back office (§1) — a Website Admin surface for any of these would be pure, risky duplication |

---

## 5. Summary boundary rule

**If the ERP's `src/features/*` already has a working, RBAC-gated Server Action for it, the Website Admin module does not build a second one — ever.** The Website Admin module's job is: (a) everything with no ERP equivalent (content, media, merchandising, SEO — §2), (b) thin display-metadata layered on ERP-owned taxonomy (§3), and (c) visibility into this integration's own health (§4, new). Nothing else.
