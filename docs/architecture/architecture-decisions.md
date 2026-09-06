# Architecture Decision Records — Jawaher Al Khair Website

Stage: 0.5 — Architecture Refinement (frozen prior to Sprint 1)
Last updated: 2026-09-06

Status legend: **Accepted** = frozen for implementation. **Open** = business decision still pending (tracked, not blocking the architecture itself).

---

### ADR-001 — Website ↔ ERP direct integration
**Status:** Accepted
**Decision:** The customer website integrates directly with the ERP. Shopify is not part of the runtime path.
**Consequence:** No feature may be built that requires Shopify to be online.

### ADR-002 — Shopify is migration-only
**Status:** Accepted
**Decision:** Shopify is read from once (or on a short controlled window) to migrate historical products/customers/orders into the ERP/website, then disconnected.
**Consequence:** No new integration code targets the Shopify API for ongoing operation.

### ADR-003 — ERP is authoritative for ERP-owned business facts
**Status:** Accepted
**Decision:** SKU, variant, price, inventory, stock availability, fulfillment, warehouse operations, and operational order state are owned by the ERP.
**Consequence:** The website never edits these facts; it only displays a synced copy.

### ADR-004 — Website database is not a duplicate ERP
**Status:** Accepted
**Decision:** The website database primarily models website-specific and customer-facing concerns (identity, sessions, cart, addresses, content, merchandising, analytics, integration/idempotency logs) — not the ERP's full business domain.
**Consequence:** Any table that mirrors ERP-owned data must be clearly marked as a projection (ADR-005), never treated as a second business system.

### ADR-005 — Catalog projection is read-optimized, not authoritative
**Status:** Accepted
**Decision:** The website may cache a read-optimized projection of ERP product/price/inventory data for fast storefront rendering. On conflict, the ERP value always wins.
**Consequence:** The projection can lag briefly (eventual consistency); the UI is designed to tolerate that (e.g. a stock threshold shown before true zero) rather than assume real-time accuracy.

### ADR-006 — Website owns customer identity
**Status:** Accepted
**Decision:** Customer authentication (phone/OTP → website session → secure httpOnly cookie) is owned entirely by the website and does not depend on Shopify or ERP accounts.
**Consequence:** The ERP customer record is reconciled from the website at order time (match on phone/email, create if absent), not the other way around.

### ADR-007 — Guest checkout is supported
**Status:** Accepted
**Decision:** Customers are never forced to create an account before purchasing. Account creation is offered, never required.
**Consequence:** Checkout, order, and payment models must work fully for an unauthenticated session identity.

### ADR-008 — Orders split into Website Order + ERP Order Reference
**Status:** Accepted
**Decision:** The website owns checkout state, payment state, customer-facing status, idempotency, and communication state for an order. The ERP owns inventory allocation, warehouse operations, fulfillment, and operational order state, linked 1:1 via an ERP Order Reference.
**Consequence:** Website and ERP are never treated as two competing sources of truth for the same order; each owns a distinct slice.

### ADR-009 — Payment Provider Adapter
**Status:** Accepted
**Decision:** Checkout calls an internal Payment Service, which calls a Payment Provider Interface, which is implemented by one adapter per gateway. Checkout never calls a gateway SDK directly.
**Consequence:** Adding, replacing, or A/B‑testing a gateway means writing one new adapter, not touching checkout logic. The actual gateway is a business decision (§ Remaining Business Decisions), not an architectural one.

### ADR-010 — Shipping Provider Adapter
**Status:** Accepted
**Decision:** Checkout calls an internal Shipping Service, which calls a Shipping Provider Interface (serviceability, rate quote, delivery estimate, tracking, COD support), implemented by one adapter per courier.
**Consequence:** Multiple couriers can be supported per delivery zone without checkout logic branching on courier identity. The actual courier(s) are a business decision.

### ADR-011 — ERP Adapter
**Status:** Accepted
**Decision:** All ERP communication passes through one isolated adapter exposing conceptual operations: `getProducts`, `getProduct`, `getPrices`, `getInventory`, `pushOrder`, `getOrderStatus`, `reconcileCustomer`.
**Consequence:** The rest of the platform is indifferent to whether the ERP eventually speaks REST, SOAP, GraphQL, database views, or file exchange — only the adapter's internals change if that protocol changes.

### ADR-012 — Analytics abstraction
**Status:** Accepted
**Decision:** Product/UI code calls one internal `track(event, params)` function only. It fans out to GA4/GTM and an internal event log. No feature code imports an analytics SDK directly.
**Consequence:** Analytics is strictly observational — a failure in `track()` can never break cart, checkout, payment, or order creation.

### ADR-013 — Modular monolith first
**Status:** Accepted
**Decision:** One repository, one deployable Next.js application. Internal modules — Storefront, Catalog, Cart, Checkout, Orders, Customers, Payments, Shipping, Promotions, Analytics, Content/Merchandising, ERP Integration, Notifications, Infrastructure — are architectural boundaries, not services.
**Consequence:** No module reaches into another module's database tables directly; all cross-module access goes through the owning module's interface. This is what keeps future extraction into separate services possible without a rewrite.

### ADR-014 — Frontend never directly accesses DB/ERP/external providers
**Status:** Accepted
**Decision:** Browser → Website API/server layer → domain logic → repositories/adapters → database/ERP/external providers. The frontend never imports Prisma, a Postgres client, or a provider SDK, and never calls the ERP, a payment gateway, or a courier directly.
**Consequence:** This is a core, non‑negotiable rule enforced at code‑review time in every phase from Sprint 1 onward.

### ADR-015 — Redis is conditional
**Status:** Accepted
**Decision:** Redis is not introduced until a concrete need exists (shared session store across instances, cart/catalog read cache under real load, rate limiting at scale).
**Consequence:** Not present in Sprint 1 or the early commerce phases.

### ADR-016 — Background jobs are conditional
**Status:** Accepted
**Decision:** A job queue is introduced when ERP sync, notification sending, or webhook/retry workloads actually exist (ERP Integration phase), not before.
**Consequence:** No queue infrastructure in Sprint 1.

### ADR-017 — Canvas/WebGL is deferred
**Status:** Accepted
**Decision:** The Products Experience page is built first with GSAP + ScrollTrigger, Motion, Lottie, and optimized images/video. Canvas/WebGL is only reconsidered if a specific visual beat genuinely fails with that stack.
**Consequence:** No WebGL dependency or renderer is introduced in the Products Experience phase by default.

### ADR-018 — Phased development with review/approval gates
**Status:** Accepted
**Decision:** Development proceeds in the phases defined in the Stage 0/0.5 blueprint. Each phase is implemented, tested, reviewed, and committed before the next begins.
**Consequence:** Sprint 1 is strictly a foundation phase (see Sprint 1 Definition) and requires explicit human authorization before it starts.

---

## Open business decisions tracked against these ADRs

These do not block the architecture above — they plug into the adapters/interfaces already defined:

- Payment gateway(s), supported methods, COD policy, refund/webhook behavior → plugs into ADR-009.
- Courier/shipping provider(s), delivery zones, pricing, tracking, COD handling → plugs into ADR-010.
- ERP API protocol, documentation, and sandbox access → shapes the internals of ADR-011, not its interface.
- OTP/authentication provider → plugs into ADR-006.
- Analytics provider confirmation (GA4 assumed) → plugs into ADR-012.
- WhatsApp integration depth, notification (SMS/email) provider, brand visual assets, domain name, hosting ownership, returns/refund and tax/invoice policy, Shopify customer‑data migration consent scope.

Full architectural context is in [`blueprint.md`](./blueprint.md). Full context for the open business decisions above, plus the additional open questions surfaced during the Stage 0.75 functional audit (guest OTP, COD approval, delivery zones/fees, minimum order value, testimonials, URL slug style, session duration, marketing consent, mobile bottom nav, Buy Now, restock notifications, mobile app), is in [`../requirements/website-functional-requirements.md`](../requirements/website-functional-requirements.md) §Open questions.
