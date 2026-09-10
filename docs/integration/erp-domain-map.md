# ERP Domain Map

Phase 6 — ERP Discovery & Website ↔ ERP Mapping. Entity-by-entity classification of the real ERP (`E:\Engineering\Projects\Jawaher\ERP JAW\prisma\schema.prisma`, 79 models, plus the service/repository code that implements the behavior around each). Classification key: **EXISTS**, **PARTIALLY EXISTS**, **DOES NOT EXIST**, **UNKNOWN**. See `erp-discovery.md` §2 for why ERP-internal docs were not trusted at face value.

Status: Phase 6. Last updated: 2026-09-10.

---

## 1. Product & Catalog

| Entity | Status | Model | Key fields | PK/FK | Status field | Business rule | Service/repo |
|---|---|---|---|---|---|---|---|
| Product | EXISTS | `Product` (schema:733) | `categoryId`, `brandId?`, `productType`, `baseUnitId`, `isLotTracked`, `pickingStrategy` (`fefo`\|`fifo`), `channelMetadata` (Json) | PK `id`; FK `categoryId→ProductCategory`, `brandId?→Brand`, `baseUnitId→UnitOfMeasure` | own `status`: `draft\|active\|discontinued\|archived` (not `recordStatus`) | Is the conceptual master; **not** the sellable/stock-bearing unit — see Product Variant | `src/modules/products/services/product.service.ts` |
| Product Variant | EXISTS | `ProductVariant` (schema:809) | `sku`, `barcode?`, `packQuantity`, `costPrice?`, `sellingPrice?`, `minimumStock?`, `reorderPoint?`, `stockSourceVariantId?`/`stockSourceRatio?` (kitting) | PK `id`; FK `productId→Product` | own `status`, independent of parent Product | **The actual sellable/stock-bearing/priced unit** — every stock, price, cost, PO-line, sales-line, GRN-line, lot, reservation row keys off `productVariantId`, never `productId` | `src/modules/products/services/product-variant.service.ts` |
| SKU | EXISTS | `ProductVariant.sku` | — | `@@unique([companyId, sku])` — **company-scoped unique, not globally unique** | — | Lives on Variant, not Product, deliberately (a 250g jar and 1kg box of the same product need independent SKU/cost/price) | — |
| Barcode | EXISTS, weak | `ProductVariant.barcode` (nullable) | — | **No unique constraint anywhere** — explicit design decision, duplicates are a known, accepted data-quality gap | — | — | — |
| Category | EXISTS | `ProductCategory` (schema:630) | self-referencing tree (`parentCategoryId`) | `recordStatus` + `deletedAt` | Product has exactly one `categoryId` (single-valued, not multi-category) | `src/modules/products/services/category.service.ts` |
| Collection | EXISTS | `ProductCollection` + `ProductCollectionMembership` (schema:664) | many-to-many, Shopify-oriented (`collectionType`: smart\|custom) | `recordStatus` + `deletedAt` | — | No dedicated service found; accessed via the Shopify sync engine |
| Brand | EXISTS | `Brand` (schema:708) | `name` unique per company | `recordStatus` + `deletedAt` | — | `src/modules/products/services/brand.service.ts` |
| Unit of Measure | EXISTS | `UnitOfMeasure` (schema:611) | referenced by `Product.baseUnitId` | — | — | — |
| Product Media | **PARTIALLY EXISTS** | Generic `FileAsset` (schema:307), polymorphic `relatedEntityType="product"` | `category` enum is `supplier_invoice\|purchase_order\|delivery_note\|brand_asset\|pdf_export\|excel_export\|attachment` — **no `"product_image"` category exists** | — | No ordering/primary-image flag; no Shopify-image-sync back into the ERP (`channelMetadata` comments explicitly say images have "no first-class column") | `src/features/products/actions/file.actions.ts` → generic `src/lib/storage/service.ts` |
| Price | **PARTIALLY EXISTS** (field, not a model) | `ProductVariant.sellingPrice` (Decimal, nullable) | — | Snapshotted per-line at order time into `SalesOrderLine.unitPrice` | No temporal/historical/promotional price table exists | — |
| Cost | EXISTS, two layers | (a) `ProductVariant.costPrice` (static, manual); (b) `CostLayer` (schema:2216) — real append-only weighted-average cost ledger, `source: purchase\|repack_output` | PK `id` (uuid v7) | COGS at dispatch uses the weighted-average `CostLayer`, **not** the static `costPrice` | `src/modules/finance/services/cost-accounting.service.ts` |

---

## 2. Inventory & Warehouse

| Entity | Status | Model | Key fields | Business rule | Service/repo |
|---|---|---|---|---|---|
| Inventory | EXISTS | `StockQuant` (schema:1152) | `onHandQuantity`, `reservedQuantity` per (variant, lot?, location) | "The ONE deliberate exception to never store what can be computed" — a rebuildable cache; `available = onHand − reserved`, computed on every read, never stored | `src/modules/warehouse/services/stock-move.service.ts` |
| Warehouse | EXISTS, single-instance in practice | `Warehouse` (schema:1029) | — | Schema comment: "only one exists today; nothing here assumes that." Multi-warehouse **is** creatable via UI and **is** genuinely used by Purchasing (PO warehouse picker), but Sales Orders are hardcoded to one company-wide default — see `erp-order-lifecycle-mapping.md` | `src/modules/warehouse/services/warehouse.service.ts` |
| Location | EXISTS | `StorageLocation` (schema:1054) | self-referencing tree, `warehouseId` nullable for virtual locations (Supplier/Customer/Scrap) | No bin/zone-aware picking logic — `findDefaultPickLocation()` just picks the oldest non-virtual location | `src/modules/warehouse/services/storage-location.service.ts` |
| Stock Movement | EXISTS | `StockMove` (schema:1116) — append-only ledger, UUID v7 | `quantity`, `fromLocationId?`, `toLocationId?`, `reason`, `referenceDocumentType/Id` | The **single write path** for all stock changes: `postStockMove()` — every module (receiving, pick/pack/dispatch/repack, adjustments, cycle counts) calls this one function; nothing else writes `StockMove`/`StockQuant` | `stock-move.service.ts:149-189` |
| Reservation | EXISTS | `StockReservation` (schema:1178) — a soft hold, distinct from a `StockMove` | `status`: `active\|released\|fulfilled` | Created at `confirmOrder()`, released only at `dispatchOrder()` — see `erp-inventory-analysis.md` for the full trace | `src/modules/warehouse/services/reservation.service.ts` |
| Lot | EXISTS | `Lot` (schema:1090) | `lotNumber`, `expiryDate?`, `supplierId?` | `@@unique([companyId, productVariantId, lotNumber])`. **Documented as mandatory when `Product.isLotTracked=true`, but this is NOT actually enforced in code** — `postStockMove()` never checks `isLotTracked` or requires a `lotId` (schema comment vs. implementation contradiction, confirmed by reading the function) | `src/modules/warehouse/services/lot.service.ts` |
| Inventory Count Session/Line | EXISTS (not deeply audited this phase) | `InventoryCountSession`/`InventoryCountLine` (schema:1204/1220) | — | UNKNOWN — variance-tolerance-to-adjustment code path not traced this phase | — |

**Confirmed dead/unenforced features** (schema/docs claim it, code does not do it):
- `Product.pickingStrategy` (`fefo`/`fifo`) is stored, editable on the product form, and a FEFO-ordered query (`listLotsForPicking()`) exists — but has **zero callers** anywhere in the fulfillment path. `fulfillOrder()`'s actual pick loop never passes a `lotId` and never consults this field. FEFO picking is specified but not implemented.
- `Product.isLotTracked` is not enforced at the point of stock movement (see Lot row above).
- `Product.deletedAt`/`ProductVariant.deletedAt` columns exist but are only ever *read* (as a query filter), never *written* — "deleting" a product actually calls `archiveProduct()`, which sets `status: "archived"`. These columns are effectively dead.

---

## 3. Purchasing & Suppliers

| Entity | Status | Model | Key fields | Status enum | Service/repo |
|---|---|---|---|---|---|
| Purchase Order | EXISTS | `PurchaseOrder`/`PurchaseOrderLine` (schema:1242/1270) | `supplierId`, `warehouseId` (genuinely user-selectable) | `status`: `draft\|submitted\|approved\|ordered\|partially_received\|fully_received\|closed\|rejected\|cancelled`; `approvalSubStatus` | `src/modules/purchasing/services/purchase-order.service.ts` |
| Goods Receipt Note | EXISTS | `GoodsReceiptNote`/`GrnLine` (schema:1294/1312) | `GrnLine.confirmedAt` — compare-and-swap guard against double-posting | `status`: `draft\|qc_pending\|completed` | `src/modules/purchasing/services/grn.service.ts` |
| Supplier | EXISTS | `BusinessPartner` (shared party model, schema:880) + `SupplierProfile` (schema:927) | `isSupplier`, indexed `email`/`phone` | `SupplierProfile.status`: `active\|on_hold\|under_review\|blacklisted` (enforced) | `src/modules/suppliers/services/supplier.service.ts` |
| Supplier Batch (repacking/kitting-adjacent) | EXISTS (not deeply audited) | `SupplierBatch`/`SupplierBatchReceipt`/`SupplierBatchPayment` (schema:1941/1968/1988) | — | UNKNOWN — out of this phase's product/inventory/order scope | — |

---

## 4. Sales, Customers & Payments

| Entity | Status | Model | Key fields | Status enum (verbatim) | Business rule | Service/repo |
|---|---|---|---|---|---|---|
| Customer | EXISTS | `CustomerProfile` (schema:951) — a **thin 1:1 extension** of `BusinessPartner` (schema:880) | `partnerId` unique FK; `customerGroup?`, `creditLimit?` | `CustomerProfile` has no lifecycle of its own — all identity lives on `BusinessPartner` (`recordStatus`) | `email`/`phone` are real indexed columns on `BusinessPartner`, promoted specifically because "Customer Sync's duplicate-avoidance genuinely needs to QUERY by email" — but **no unique constraint** on either, so duplicates are matched, not DB-prevented | `src/modules/customers/services/customer.service.ts` |
| Sales Order | EXISTS | `SalesOrder` (schema:1461) | `customerId` (bare id, **no Prisma relation** — cross-module boundary choice), `salesChannelId?`, `warehouseId`, `primaryStatus`, `subStatus?`, `paymentStatus`, `externalOrderNumber?`, `externalTotalPrice?` | `primaryStatus`: `pending_validation, confirmed, picking, packing, qc, ready_for_delivery, out_for_delivery, delivered, failed_delivery, returned, rejected, cancelled` — **`qc` and `failed_delivery` are dead enum values, never actually transitioned to/from by any service function**; `paymentStatus`: `unpaid, awaiting_confirmation, paid` | `totalAmount` deliberately not stored — computed from lines. Full lifecycle trace in `erp-order-lifecycle-mapping.md` | `src/modules/orders/services/sales-order.service.ts` (2,878 lines) |
| Sales Order Line | EXISTS | `SalesOrderLine` (schema:1577) | `productVariantId`, `quantity`, `unitPrice` | — | `unitPrice` snapshotted at line-create time — "a later price change must never retroactively alter a historical order" | same file |
| Payment | **PARTIALLY EXISTS** | `Payment` (schema:2044) | `partnerId`, `direction` (`outgoing\|incoming`), `amount`, `accountId` | **`Payment` itself has no status field** — status lives on `Invoice.status` (`open\|partially_paid\|paid\|voided`) and independently on `SalesOrder.paymentStatus` | Payment capture is **entirely manual** — a human ERP operator (Operations/Admin) confirms cash (COD) or InstaPay transfer *after the fact*; there is no payment gateway, no payment webhook, anywhere in the codebase | `src/modules/orders/services/cash-collection.service.ts` |
| Payment Allocation | EXISTS | `PaymentAllocation` (schema:2067) | many-to-many join, `paymentId`+`invoiceId`+`amount` | — | Sum of allocations vs. invoice amount is how paid/partially-paid is derived | — |
| Invoice | EXISTS, deliberately simplified | `Invoice` (schema:2018) | `partnerId`, `invoiceType` (`payable\|receivable`), single `amount` (**no `InvoiceLine`**), `referenceDocumentType/Id` | `status`: `open, partially_paid, paid, voided` | One receivable Invoice per confirmed SalesOrder, linked by convention (`referenceDocumentType="sales_order"`), **no FK** | created inside `confirmOrder()`, voided inside `cancelOrder()`/`markReturned()` |
| Shipment | **DOES NOT EXIST** | — | — | — | No dedicated Shipment/tracking/courier-integration model was found anywhere in the 79-model schema or in the modules inspected. Fulfillment/delivery is tracked entirely through `SalesOrder.primaryStatus` (`out_for_delivery`, `delivered`) plus `StockMove` — terminology in the code ("خروج مع المندوب" = "goes out with the delivery rep") suggests an own-delivery-rep model, not a third-party courier API integration. Not exhaustively searched for a hidden courier connector; treat as a strong inference from absence, not a proven negative. | — |
| Return | **PARTIALLY EXISTS** | Handled via `markReturned()`, a peer transition to `markDelivered()` | — | Scoped **only** to `out_for_delivery → returned` (driver brings goods back before delivery completes) | Explicit code comment: "this platform has no concept yet of a customer returning goods after actually accepting them" — **no post-delivery RMA workflow exists** | `sales-order.service.ts` |
| Refund | **DOES NOT EXIST** as a real entity/flow | — | — | — | The Shopify `refunds/create` webhook handler only logs a warning ("ERP has no automated money-back path yet… needs manual reconciliation") — no `RefundLine`/`CreditNote` model, no automated cash-back mechanism anywhere | `shopify-webhook-router.service.ts:338-357` |
| Promotion / Coupon | **DOES NOT EXIST** | — | — | — | No `Promotion`/`Coupon`/`Discount` model in the 79-model schema. `SalesOrder.discountAmount`/`discountPercent` are plain manual fields computed and frozen inside `confirmOrder()` — not backed by a rules engine | — |
| Tax | **UNKNOWN** | — | — | — | No explicit tax field was found on `SalesOrder`/`SalesOrderLine`. Unclear whether tax is folded into `unitPrice`/`externalTotalPrice` or genuinely absent from the model — needs direct business/ERP-owner clarification, not resolvable by further code reading alone | — |

---

## 5. Platform / Cross-cutting

| Entity | Status | Model | Notes |
|---|---|---|---|
| User | EXISTS | `User` (schema:90) | Joined to Supabase Auth identity |
| Role / Permission | EXISTS | `Role`/`Permission`/`RolePermission`/`UserRole` (schema:135-208) | See `erp-discovery.md` §5 |
| Department | EXISTS, organizational only | `Department`/`UserDepartment` (schema:209-260) | No permission logic keyed off Department was found in the auth/session/rbac code paths inspected — appears structural, not an authorization axis. Not exhaustively verified elsewhere in the codebase. |
| Audit Log | EXISTS (schema presence confirmed; behavior not re-audited this phase) | `AuditLog`, `AppLog`, `ActivityTimeline` (schema:583, 351, 451) — three deliberately separate logs per CLAUDE.md's narrative (mechanical diff / technical-operational / human narrative) | Plausible and consistent with what the RBAC/order-lifecycle agents observed (`recordActivity`/`recordAuditLog` calls at order transitions), but not independently re-verified line-by-line this phase |
| Company Settings | EXISTS | `CompanySettings` (schema:391) | Holds tunables referenced elsewhere (e.g. `shopifyConflictPolicy`) |
| Shopify / integration records | EXISTS, extensively | `IntegrationConnector`, `CompanyIntegrationConnection`, `IntegrationSecret`, `ChannelMapping`, `SyncConflict`, `WebhookReceipt`, `ConnectorSyncRun`, `ConnectorSyncCursor`, `ConnectorRateLimitState`, `OAuthAuthorizationRequest` (schema:1631-2771) | Full detail in `erp-shopify-integration-analysis.md` |

---

## 6. Doc-vs-code discrepancies found this phase (beyond the CLAUDE.md/PRODUCTION_CHECKLIST staleness in `erp-discovery.md` §2)

1. `docs/milestones/Sprint4_Warehouse_Operations.md` describes picking as FEFO/FIFO-driven "according to the product's `pickingStrategy`" — not true of the running fulfillment code (§2 above).
2. The same document's multi-warehouse claim ("supported by the existing StorageLocation tree") is true for Purchase Orders but misleading for Sales Orders, which hard-fail the moment a second active warehouse exists (`resolveDefaultWarehouse()` — see `erp-order-lifecycle-mapping.md`).
3. `docs/diagrams/ERP_Order_Workflow_State_Diagram_v2.mermaid` depicts a QC gate and a `failed_delivery → out_for_delivery` redelivery loop, and a `delivered → returned` edge — **none of these transitions exist in the running service code**. Treat this diagram as aspirational/stale, not as ground truth for the real state machine (the real one is in `erp-order-lifecycle-mapping.md`).
4. `docs/reports/Milestone6_Order_Management_Shopify_Report.md` describes a platform-level webhook-secret env var with no OAuth/client-credentials flow — the current code has since moved to per-tenant `IntegrationSecret` rows and a client-credentials-grant token mint. Code wins; the report describes an earlier milestone's state, superseded since.
