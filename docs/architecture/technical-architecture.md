# Jawaher Al Khair — Technical Architecture & Engineering Specification

Answers "how should this be engineered?" Builds on [`blueprint.md`](./blueprint.md) (system shape), [`architecture-decisions.md`](./architecture-decisions.md) (ADRs), [`../requirements/website-functional-requirements.md`](../requirements/website-functional-requirements.md) (what), and [`../ux/ux-specification.md`](../ux/ux-specification.md) (how it feels). Companion files: [`module-boundaries.md`](./module-boundaries.md), [`data-ownership.md`](./data-ownership.md), [`technical-decisions.md`](./technical-decisions.md).

Status: **Draft for review — Stage 0.9.** Last updated: 2026-09-06. No code, packages, migrations, or infrastructure were created while writing this.

---

## 0. Baseline recap

```
Customer → Next.js Frontend → Website API → Website-owned PostgreSQL
                                    ↕
                              ERP Adapter → ERP (source of truth)
                                    ↕
                     Payment Adapter · Shipping Adapter · Analytics boundary
```

Unchanged from `blueprint.md`: modular monolith first, capable of future service extraction; ERP is authoritative for product master data/variants/SKUs/prices/inventory/operational order data; the website owns customer-facing presentation, identity/session, cart, website order representation, analytics interaction, and website content where allowed; catalog data is a read-optimized projection where ERP always wins on conflict; Shopify is migration-only. Nothing in this document changes any of that — it specifies how to build it.

---

## 1. Tech stack

| Layer | Recommendation | Purpose | Alternatives considered | Why not chosen | MVP? |
|---|---|---|---|---|---|
| Frontend framework | Next.js (App Router) + React + TypeScript | SSR/ISR, file-system routing, RTL/i18n maturity | Remix, plain Vite+React SPA | Remix has a smaller ecosystem for this team's needs; a SPA loses SSR/SEO benefits that matter for an Arabic-first catalog site | MVP |
| Styling | Tailwind CSS | Utility-first, fast to build consistent RTL-safe layouts, small runtime cost | CSS Modules, styled-components | Tailwind's logical-property utilities map directly onto the RTL requirement (UX spec §22); styled-components adds runtime CSS-in-JS cost for no real benefit here | MVP |
| Animation (storefront) | Framer Motion / Motion | Component-level and route-transition micro-interactions | react-spring | Motion has better Next.js/React 19 alignment and simpler declarative API for this team's needs | MVP (lightweight use only — see blueprint §17) |
| Animation (Products Experience) | GSAP + ScrollTrigger, Lottie | Scroll-linked scene choreography, lightweight vector motion | Framer Motion alone, WebGL/Three.js | Framer Motion is not built for scrubbed scroll timelines the way ScrollTrigger is; WebGL is explicitly not justified (ADR-017) | Post-MVP (Products Experience phase) |
| Backend | Next.js Route Handlers inside the same app (modular monolith, ADR-013) | Avoids a second deployable before scale/team size justifies it | A separate Node/Nest.js API service | Adds a second deployment, a second repo boundary, and network hops for no current benefit; revisit only if a module needs independent scaling or a non-JS team takes it over | MVP |
| Language | TypeScript, strict mode, end-to-end (frontend + backend + shared types) | Compile-time safety across the module boundaries in §6 | Plain JavaScript | Loses type safety exactly at the seams (adapters, API contracts) where mistakes are most costly | MVP |
| Database | PostgreSQL | Relational integrity for orders/inventory-projection/coupons | MySQL, MongoDB | MySQL offers no advantage here; a document store weakens the referential integrity checkout/orders need (ADR-004) | MVP |
| ORM / data access | Prisma | TypeScript-first schema + migrations + query builder, fastest onboarding for a small team | Drizzle ORM, Kysely, raw SQL | Drizzle is a legitimate lighter-weight alternative (closer to SQL, less "magic") and may be revisited if query-performance control becomes important; not chosen now because Prisma's migration workflow and ecosystem maturity reduce Sprint 1–5 friction | MVP — **recommended, not yet formally approved** (see `technical-decisions.md`) |
| Validation | zod | Runtime schema validation at every API boundary (ADR/security requirement), shares types with TypeScript | Yup, io-ts | zod has the best TypeScript inference and is the de facto standard in the Next.js ecosystem | MVP |
| Authentication | Server-side sessions (DB-backed), secure httpOnly cookies, phone/OTP (ADR-006) | Matches the approved identity model exactly | JWT-only sessions, NextAuth.js with a generic provider | Stateless JWTs make "log out everywhere" and session revocation awkward (already rejected in `blueprint.md` §2); NextAuth is built around OAuth/email providers and would need heavy customization for phone/OTP, adding more complexity than it saves | MVP |
| Testing | Vitest (unit/domain), Playwright (E2E) | Fast, ESM-native, strong TypeScript support | Jest, Cypress | Jest works but is slower to configure for a Next.js+ESM stack; Playwright has better multi-browser and network-mocking support than Cypress for the adapter-mocking needs in §24 | MVP |
| Infrastructure (target) | Docker, reverse proxy (Traefik/Nginx), Cloudflare, self-hosted; Vercel for preview only | Matches the long-term self-hosting intent (blueprint §18) | Full managed PaaS (e.g. Vercel production, Railway) | Contradicts the stated self-hosting intent for production; acceptable only for preview/staging | Deferred — Infrastructure phase, not Sprint 1 |

No technology above is adopted "because it's popular" — each row's alternatives column exists specifically so this can be challenged.

---

## 2. Repository structure

**Recommendation: (A) a Next.js-centric modular monolith, not an apps/+packages/ monorepo.**

A full monorepo (Turborepo/Nx with separate `apps/` and `packages/`) is justified once there are genuinely multiple deployable apps (e.g. a separate admin app, a separate mobile app) or multiple teams needing independent release cadences. Neither is true yet — introducing one now would be exactly the kind of premature complexity the architecture repeatedly warns against (ADR-013). The structure below keeps the *internal* module boundaries just as strict, without a second build system.

```
jawaher-al-khair-website/
├── docs/                        # canonical planning & architecture docs (this tree)
├── _reference/                  # real business-supplied assets/content (not code)
├── src/
│   ├── app/                     # Next.js App Router — routes only, thin
│   │   ├── (storefront)/        # Home, Shop, Category, PDP, Search, Offers, About, Contact...
│   │   ├── (experience)/        # Products Experience hub + 5 chapters
│   │   ├── (account)/           # Login, Account, Orders, Addresses
│   │   ├── (checkout)/          # Cart, Checkout, Confirmation, Tracking
│   │   └── api/                 # Route Handlers — the Website API surface (§11)
│   ├── modules/                 # the 14 modules from blueprint.md §4 — see module-boundaries.md
│   │   ├── catalog/
│   │   ├── cart/
│   │   ├── checkout/
│   │   ├── orders/
│   │   ├── customers/
│   │   ├── payments/
│   │   ├── shipping/
│   │   ├── promotions/
│   │   ├── analytics/
│   │   ├── content/
│   │   ├── erp-integration/
│   │   ├── notifications/
│   │   └── infrastructure/
│   ├── domain/                  # shared domain types/value objects — see data-ownership.md
│   ├── ui/                      # shared, presentation-only components (no data access)
│   └── lib/                     # cross-cutting utilities (config, logging client, validation helpers)
├── prisma/                      # schema + migrations (created only when implementation begins)
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── scripts/                     # one-off/maintenance scripts (e.g. manual sync trigger)
├── public/                      # static assets shipped as-is
└── (config files — created only when implementation begins)
```

**Directory responsibilities**
- `app/`: routing and page composition only — reads from `modules/*` public interfaces, never touches Prisma/ERP/provider SDKs directly (ADR-014).
- `modules/*`: one folder per approved module (blueprint §4); each exposes a small public interface (functions/types) other modules import, and keeps its own data-access code private.
- `domain/`: the entities/value objects/state machines defined in `data-ownership.md` — pure logic, no framework or I/O dependency, shared by multiple modules where genuinely needed (e.g. `Money`, `PhoneNumber`).
- `ui/`: presentation components with no knowledge of modules — receives data as props only.
- `lib/`: configuration loading, the logging client, shared zod helpers — infrastructure-adjacent but not a "module" with business ownership.
- `tests/`: mirrors the testing pyramid in §24.

This structure is deliberately unremarkable — the discipline lives in the dependency rules (§ module-boundaries.md), not in exotic tooling.

---

## 3. Catalog projection

```
ERP (authoritative) → ERP Adapter (sync job) → validation → Catalog projection tables → Catalog module read model → Storefront
```

| Concern | Specification |
|---|---|
| Initial sync | A one-time full pull of products/categories/variants/prices/inventory/offers from the ERP Adapter, populating the projection tables from empty. Run manually/on-demand during the ERP Integration phase, not automatically triggered by user traffic. |
| Incremental sync | A scheduled job (interval TBD by how often ERP data actually changes — likely minutes) pulls changed records only, if the ERP can express "changed since X"; otherwise a full re-pull on the same schedule is acceptable at this catalog size (hundreds of SKUs, §33). |
| Validation | Every record pulled from the ERP Adapter is validated against a zod schema before being written to the projection; a record that fails validation is logged and skipped (not partially written), and the previous valid projection row is left untouched. |
| Reconciliation | A periodic full-catalog diff (e.g. nightly) compares the projection against a fresh ERP pull to catch drift from missed incremental updates; discrepancies are corrected in favor of the ERP value and logged. |
| Stale data | The projection is allowed to lag by design (ADR-005) — the UI shows a derived state (in-stock/low-stock/out-of-stock) rather than a raw quantity, so a few minutes of staleness never produces an impossible customer-facing claim. |
| Deleted / discontinued products | The ERP Adapter marks a projection row `discontinued` rather than hard-deleting it immediately — preserves order history references (an old order still needs to display the product it contained). The Storefront excludes discontinued products from listings/search/sitemap (per requirements §5 edge cases). |
| Unavailable products | Represented as an availability state on the projection row (`in_stock` / `low_stock` / `out_of_stock`), never as row absence. |
| Price changes | Written to the projection on sync; the Cart/Checkout modules always re-read the current projection price at the moment of use (§8, §10) — never trust a price cached earlier in the customer's session. |
| Inventory changes | Same pattern — Cart/Checkout re-check availability at add-to-cart, at cart view, and again at order creation (§8, §10, §16). |
| Variant changes | A variant's SKU is the stable identity used everywhere else (cart items, order items) — if the ERP changes a variant's attributes, the projection updates in place; if a SKU is retired, it becomes `discontinued` like a product. |
| Failed sync | A failed sync run is retried with exponential backoff (blueprint §9); if all retries are exhausted, the previous projection state remains in place (never partially overwritten) and an alert fires (§27 observability). |
| Conflict resolution | **The ERP value always wins, unconditionally** (ADR-005) — there is no merge logic to design here; the projection is a mirror, never a co-author. |

**Hard rule:** the customer-facing frontend never queries the ERP or the ERP Adapter directly — it only ever reads the Catalog module's projection tables (ADR-014).

---

## 4. ERP Adapter

Conceptual interface (blueprint §9): `getProducts()`, `getProduct()`, `getPrices()`, `getInventory()`, `pushOrder()`, `getOrderStatus()`, `reconcileCustomer()`.

| Concept | Specification |
|---|---|
| Request/response shape | Each operation has a stable internal request/response type owned by the ERP Integration module, independent of the ERP's actual wire format — the adapter's internals translate to/from whatever the ERP speaks. |
| Timeout | Every ERP call has an explicit timeout (value TBD once the real ERP's latency is known); a timeout is treated as a failure, not a hang. |
| Retries | Exponential backoff with a capped number of attempts, applied to transient failures (timeout, 5xx-equivalent) — not applied to validation-shaped failures (a malformed request should not be retried unchanged). |
| Idempotency | `pushOrder()` is called with the website order id as an idempotency key, so a retried push cannot create a duplicate order in the ERP (blueprint §8/§9). |
| Failure handling | A failed `pushOrder()` after all retries lands in a dead-letter table and raises an alert for a human — an order must never silently fail to reach the ERP (blueprint §9). A failed read (`getProducts`/`getInventory`/etc.) simply leaves the projection stale and retries on the next scheduled run. |
| Logging | Every ERP Adapter call logs a correlation id, operation name, duration, and outcome (success/failure/retry) — never the full raw payload if it could contain customer PII beyond what's needed for debugging (§27). |
| Reconciliation | `reconcileCustomer()` is called at order-time only (not continuously) — matches on phone/email, creates the ERP-side customer record if absent, and stores the returned ERP customer reference on the website's Customer record. |

**Protocol-agnostic by design:** whether the real ERP exposes REST, SOAP, GraphQL, database views, or file exchange is entirely internal to this module's implementation — no other module, and no test outside this module's own contract tests, should need to know.

---

## 5. Payment Adapter

Conceptual operations: `createPayment`, `authorize` / `capture` (where the provider supports a two-phase flow), `confirm`, `fail`, `refund`, `queryStatus`.

| Concept | Specification |
|---|---|
| State machine | `initiated → pending → authorized (optional) → captured → refund_initiated → refund_completed`, with `failed` / `cancelled` reachable from any pre-capture state (blueprint §10). |
| Idempotency | Every `createPayment` call carries the website order id as an idempotency key; a retried call for the same order returns the existing payment record rather than creating a second one. |
| Duplicate requests | The Payments module deduplicates on (order id, idempotency key) before ever calling a provider adapter — the provider is never given a chance to double-charge from a client-side retry. |
| Webhook/event handling | Where a provider supports async confirmation, the webhook handler verifies the provider's signature before trusting the payload, maps it to the internal state machine, and is itself idempotent (processing the same webhook delivery twice must be a no-op). |
| Failure/retry | A failed payment surfaces to checkout inline with a retry action (UX spec §10); retries create a new payment attempt linked to the same order, not a new order. |
| Reconciliation | A periodic job compares the Payments module's local state against the provider's queryable status for any payment stuck in a non-terminal state beyond a threshold — catches missed webhooks. |
| Security | Provider credentials/secrets live only inside the specific adapter implementation and the environment configuration (§23) — never in the core Payments module, never in Checkout, never in the frontend. |
| COD compatibility | Cash on Delivery is modeled as an adapter that immediately returns `captured`-equivalent status is *not* correct — COD should map to its own terminal-pending state (e.g. `awaiting_cod_collection` → `captured` on delivery confirmation) so refund/reconciliation logic doesn't have to special-case "there was no real payment provider." This keeps COD a first-class adapter, not an exception to the abstraction. |

**No provider is named here** — the gateway is a business decision (requirements §25); this section defines what any adapter must satisfy.

---

## 6. Shipping Adapter

Conceptual operations: `checkServiceability`, `getRates` (fee + estimate), `createShipment`, `getTracking`.

| Concept | Specification |
|---|---|
| Serviceability | Called as soon as an address is entered at checkout — returns deliverable/not, before the customer proceeds to payment (requirements §9, UX spec §10). |
| Zones | Represented as a simple lookup structure (zone identifier → fee, estimate, COD-supported flag); the MVP "manual" adapter implementation is exactly this lookup, maintained by the business (blueprint §11). |
| Fees | Always computed server-side from the current zone table at the moment of use — never trusted from the client. |
| Delivery estimate | A date range or day-count, attached to the rate response; may be static text at MVP ("2–4 working days"). |
| Shipment creation | Called once an order is confirmed/paid — creates a shipment record; for the manual adapter this may simply record the intent without an external call. |
| Tracking | `getTracking` returns a provider-specific status which the Orders module maps to the stable customer-facing stages (blueprint §8) — the mapping table lives in Orders, not in each Shipping adapter, so adding a courier never requires touching the customer-facing stage list. |
| Multi-provider by zone | The Shipping Service selects an adapter by zone, not by a single global provider — the interface is written to support this from day one even though only the manual adapter exists at launch (blueprint §11). |

**No courier is named here.**

---

## 7. Customer identity & authentication

| Concern | Specification |
|---|---|
| Identity | Phone number is the primary identity; normalized to E.164 (`+20...`) for storage, while accepting local formats (leading 0, with/without country code) as input (requirements §7, UX spec §13). |
| OTP | A time-limited code (length/expiry TBD, typically 4–6 digits, 1–5 minutes) sent via the Notifications module's abstraction (§18) — the OTP provider itself is not chosen here. |
| Sessions | Server-side, stored in the website database (not Redis — no shared cache exists yet, ADR-015), referenced by a secure httpOnly, SameSite cookie holding an opaque session id only (never a JWT with embedded claims, to keep revocation trivial). |
| Guest sessions | A guest also gets a server-side session (anonymous, no phone yet) the moment a cart is created — this is what cart persistence (§8) is keyed to before login. |
| Guest checkout | Fully supported without requiring the guest session to ever become authenticated (ADR-007) — **whether checkout additionally requires OTP verification for guests remains an open business decision** (requirements §25); this architecture supports both outcomes: the OTP step is a conditional sub-step of the Checkout flow's Contact step (UX spec §10), not a hard-coded requirement in the session model itself. |
| Account creation | Reuses the phone already verified at checkout (if OTP was performed) — no second OTP required in the same session (UX spec §13). |
| Guest → account transition | Converts the guest session into an authenticated one in place — the guest's cart, keyed to the same session, carries over without a separate "merge" step in this specific case (a true merge — §8 — only applies when logging into an *existing* account that already has its own cart). |
| Logout | Invalidates the server-side session record immediately — not just clearing the cookie client-side. |
| Session expiration | A sliding or fixed expiration window (exact duration is an open UX/business question, requirements §25) — expiration triggers a re-auth prompt that preserves in-progress cart/checkout state (UX spec §21), never a silent data loss. |
| OTP expiration | Expired codes are rejected with a specific message and a one-tap resend that does not require re-entering the phone number. |
| Resend limits | Rate-limited per phone number (e.g. a cooldown between sends, and a cap per rolling time window) — exact thresholds are a §29/§18 configuration value, tunable without an architecture change. |
| Brute-force protection | OTP verification attempts are rate-limited per session/phone; exceeding the limit triggers a cool-down, never a silent infinite-retry allowance, and never a permanent lockout without a support path (UX spec §13). |

Nothing here decides the still-open guest-OTP policy (requirements §25) — it is deliberately built as a configuration/flow branch, not a foundational assumption.

---

## 8. Cart architecture

| Concern | Specification |
|---|---|
| Guest cart | Keyed to the guest session id (§7); created on first add-to-cart. |
| Authenticated cart | Keyed to the customer id; one active cart per customer. |
| Cart item identity | Identified by (cart id, SKU) — adding an already-present SKU increments quantity rather than creating a duplicate line. |
| Quantity | Client sends a desired quantity; the server clamps it to available inventory from the Catalog projection before persisting — the client never dictates an accepted quantity outright. |
| Price snapshot vs. revalidation | The cart does **not** store a frozen price at add-time as the value charged — every read of the cart (drawer, page, checkout) re-fetches the current price from the Catalog projection and flags a change if the displayed price differs from what was shown when the item was added (UX spec §9, requirements §6). This is the authoritative rule preventing stale-price disputes. |
| Inventory revalidation | Re-checked at the same three points as price: view, and again at checkout/order-creation (§16) — an item that became unavailable is flagged inline and blocks only that line (requirements §6/§20). |
| Cart merge after login | When an authenticated customer's *existing* account cart and the guest cart both hold items, quantities are combined per SKU (prices always re-fetched live, never carried over) — this is distinct from the guest→account conversion case in §7, where no separate account cart yet exists. |
| Abandoned cart | The server-side cart simply persists indefinitely by default (no forced expiration); a `checkout_abandoned` analytics event fires when a checkout is started but not completed (blueprint §14/§17), enabling future recovery messaging — not built at MVP. |
| Expiration | No hard cart expiration at MVP; if storage growth ever becomes a concern (§33), a housekeeping job can prune very old, never-converted guest carts — not needed at current scale. |

**Authoritative values:** price and inventory are always the Catalog projection's current values, read at the moment of use — the cart stores *quantities and SKU references*, never a trusted price or stock number from the client.

---

## 9. Order architecture

Preserves the Website Order vs. ERP Order Reference split (blueprint §8) exactly.

| Concern | Specification |
|---|---|
| Order creation | Created by the Checkout module the moment payment is confirmed (online payment) or immediately (COD) — never before the customer has committed (i.e., never created speculatively while still filling the form). |
| Order numbering | Two identifiers: an internal primary key (UUID) used everywhere in the system/APIs, and a short human-readable order number (e.g. `JAK-000123`) shown to the customer and used in support conversations, WhatsApp messages, and the public tracking lookup. |
| Order items | Snapshot of SKU, quantity, and **the price at the moment of order creation** (this is the one place a price *is* frozen — once an order exists, its historical total must never change even if the catalog price changes later). |
| Customer snapshot | Name, phone, and delivery address are copied onto the order at creation time — an order remains reconstructable even if the customer later edits their saved profile/address. |
| Shipping snapshot | Selected method, computed fee, and estimate at the time of order creation — same reasoning as above. |
| Payment state | Delegated to the linked Payment record's state machine (§5) — the order exposes a simplified `payment_status` derived from it. |
| Fulfillment state | Lives on the ERP Order Reference (blueprint §8), pulled back and mapped to the stable customer-facing stages — never written by the website. |
| ERP reference | A 1:1 link created when the order is pushed to the ERP (idempotent on the website order id, §4); until that push succeeds, the order exists website-side with a `pushed_to_erp = false` flag and is retried per §4's failure handling. |
| Cancellation | A website-initiated cancellation (before ERP push, or if the business rules allow it after) is a Website Order state transition; a warehouse-initiated cancellation arrives via the ERP Order Reference's status pull and is mapped back to the same customer-facing "cancelled" stage regardless of which side initiated it. |
| Refund representation | A refund is a Payment-module state (§5) linked to the order; the order's customer-facing status reflects it, but the order record itself is never deleted or overwritten — refund history is additive. |
| Synchronization | One-way for creation (website → ERP), one-way for status (ERP → website) — never a bidirectional sync loop on the same field (blueprint §8's core rule). |
| COD vs. online-payment creation | **COD:** order is created immediately in a `payment_status = awaiting_cod_collection` state and pushed to the ERP right away — there is no external confirmation to wait for. **Online payment:** order creation is deferred until the Payment module reports `captured` (or, if the business accepts it, `authorized`) — a failed/abandoned payment must never leave behind a confirmed order. This distinction is the main branch point in the Checkout orchestration (§10). |

**Idempotency guarantee:** the website order id is the single idempotency key used for both the ERP push (§4) and the payment creation (§5) — one order can never produce two ERP orders or two payment attempts from a retried request.

---

## 10. Checkout architecture

Maps the UX accordion (UX spec §10) to backend responsibility.

| Step | Frontend | API | Server validation | Persistence | External dependency | Failure handling |
|---|---|---|---|---|---|---|
| Contact (phone [+ OTP]) | Collects phone, triggers OTP UI if required | `POST /api/auth/otp/request`, `POST /api/auth/otp/verify` | Phone format, OTP correctness/expiry, rate limits | Session record updated with verified phone | Notifications module (OTP delivery) | Specific inline errors per §28 category `authentication` |
| Address | Structured form or saved-address picker | `POST /api/checkout/address` | Required fields present, address shape valid | Draft order/checkout-session address fields | Shipping Adapter (`checkServiceability`) | Unserviceable address blocks progression with a clear message before payment (requirements §9) |
| Shipping method/fee | Displays computed fee/estimate | `GET /api/checkout/shipping-rates` | Address must already be valid | Selected method/fee attached to the draft | Shipping Adapter (`getRates`) | Calculation failure shown inline, retry available, does not discard the address |
| Payment | Method selector, provider-specific UI (e.g. redirect) | `POST /api/checkout/payment` | Amount recomputed server-side from current cart, never from client input | Payment record created (§5) | Payment Adapter | Inline failure + retry (§5) |
| Review | Read-only summary, coupon field | `POST /api/checkout/coupon` | Coupon validity/expiry/usage limits | Discount attached to the draft | Promotions module | Specific error per failure case (requirements §12) |
| Place order | Disables button immediately on click | `POST /api/orders` | Idempotency key required; re-validates price/inventory/coupon one final time | Website Order created (§9) | ERP Adapter (push, async-safe) | Duplicate submits are no-ops (idempotency); ERP push failure does not block the customer-visible confirmation — it retries in the background (§4) |

**Preventing the specific failure modes named in the brief:**
- *Duplicate orders*: idempotency key required on `POST /api/orders`, enforced server-side, independent of any client-side button-disabling.
- *Duplicate payments*: idempotency key on `POST /api/checkout/payment`, deduplicated in the Payments module before reaching any provider adapter (§5).
- *Stale prices*: the final order-creation call recomputes the total from the live Catalog projection, not from whatever total the client last displayed.
- *Stale inventory*: the same final call re-checks availability for every line item; an item that went out of stock between cart-view and order-creation blocks only that line with a clear message, rather than silently completing the order short.
- *Invalid shipping zones*: serviceability is re-checked at order creation, not only at the address step, in case of a slow checkout session.
- *Race conditions*: the order-creation call is a single server-side transaction that (a) locks/re-reads inventory, (b) recomputes totals, (c) creates the payment or confirms COD, and (d) creates the order — partial completion of only some of these steps must not be possible (a database transaction boundary, detailed in §13).

---

## 11. API architecture

**Style:** REST-shaped JSON over HTTP, versioned via URL prefix (`/api/v1/...`) — no GraphQL, no RPC framework. A modular monolith with a small, well-understood API surface doesn't need GraphQL's query flexibility, and REST keeps the adapter/module boundary easy to reason about.

**Organization:** one route group per module's public surface (`/api/v1/catalog/*`, `/api/v1/cart/*`, `/api/v1/checkout/*`, `/api/v1/orders/*`, `/api/v1/auth/*`), matching the module list in `module-boundaries.md` — a route handler is a thin adapter that calls into its module's public interface, never business logic itself.

| Concern | Rule |
|---|---|
| Request validation | Every endpoint validates its input with a zod schema before touching any module logic; invalid input never reaches domain code. |
| Response shape | A consistent envelope: `{ data, error }` — `error` is always `null` on success, and always the shape defined in §28 on failure. |
| Pagination | Cursor-based for catalog/search listings (stable under concurrent writes, unlike offset pagination); page size capped server-side regardless of what the client requests. |
| Filtering/sorting | Expressed as explicit, allow-listed query parameters (e.g. `?category=dates&sort=price_asc`) — never a raw filter/sort expression passed through to the database. |
| Error format | See §28 — one shape reused by every endpoint. |
| Authentication | Session cookie, validated on every request that needs identity; public endpoints (catalog browse, search) work without one. |
| Authorization | Endpoint-level checks (e.g. an order-detail endpoint verifies the requesting session owns that order, or that the public tracking lookup's phone matches) — never left implicit. |
| Idempotency | Required (via an `Idempotency-Key` header or equivalent) on order-creation and payment-confirmation endpoints (blueprint §7, restated here as a binding API rule). |
| Rate limiting | Applied at the reverse proxy/API gateway layer on auth and checkout endpoints specifically (blueprint §15). |

**Representative endpoints (documentation only — not implemented here):**

```
GET  /api/v1/products?category=dates&sort=price_asc&cursor=...
GET  /api/v1/products/:slug
POST /api/v1/cart/items                { sku, quantity }
GET  /api/v1/cart
POST /api/v1/auth/otp/request          { phone }
POST /api/v1/auth/otp/verify           { phone, code }
POST /api/v1/checkout/address          { ...structured address }
GET  /api/v1/checkout/shipping-rates
POST /api/v1/checkout/payment          { method, ... }
POST /api/v1/checkout/coupon           { code }
POST /api/v1/orders                    { idempotencyKey, ... }         (Idempotency-Key header)
GET  /api/v1/orders/:id
GET  /api/v1/orders/track?orderNumber=&phone=
```

---

## 12. API security

| Concern | Rule |
|---|---|
| Authentication | Server-side session cookie (§7); no endpoint trusts a client-supplied customer/session id in the request body. |
| Authorization | Explicit per-endpoint checks — ownership of the resource (order, address) is verified against the authenticated session, not inferred from an id in the URL alone. |
| Input validation | zod at every boundary (§11); reject rather than coerce malformed input. |
| Output validation | Response shapes are also typed/validated in development to catch a module accidentally leaking internal fields (e.g. an ERP-internal status code) into a customer-facing response. |
| CSRF | SameSite cookies as the primary defense, with a per-form token on state-changing endpoints (checkout, account changes) — restated from blueprint §15. |
| XSS | All user-supplied content (delivery notes, profile name) is escaped on render; no `dangerouslySetInnerHTML`-equivalent path for customer input. |
| SQL injection | Prevented structurally by using the ORM's parameterized query interface exclusively — no raw string-concatenated SQL. |
| Rate limiting | Reverse-proxy level on auth/checkout (blueprint §15); additionally, OTP request/verify and coupon-apply endpoints get their own tighter per-identity limits (§7, §18 abuse below). |
| OTP abuse | Rate-limited resend, rate-limited verify attempts, cool-down beyond a threshold (§7). |
| Coupon abuse | Rate-limited apply attempts per session; server-side validation of usage limits (never trust a client claim that a coupon is still valid). |
| Checkout abuse | The final order-creation validation (§10) doubles as anti-abuse — a bot cannot force-create an order with a manipulated total, quantity, or coupon. |
| Bot protection | A basic bot-mitigation layer (e.g. a challenge on auth/checkout endpoints under suspicious volume) is a **should-have**, provider TBD — not a hard architectural requirement at MVP given current traffic scale (§33). |
| Webhook verification | Every inbound payment/shipping webhook verifies the provider's signature before processing; an unverified payload is rejected and logged, never acted on. |
| Secrets | Never in client-reachable code or responses; environment-injected only (§23). |
| PII handling | Minimum necessary per requirements §21; §27 lists what must never appear in logs. |
| Logging restrictions | See §27. |

**Never trusted from the client, under any endpoint:** product price, inventory/availability, discount amount, order total, account role/permission level, payment status. Every one of these is recomputed or re-read server-side at the point of use.

---

## 13. Database architecture

Conceptual only — no migrations are created at this stage.

| Table family | Purpose | Notes |
|---|---|---|
| Catalog projection | Categories, products, variants/SKUs, prices, inventory state, offers (mirrored) | Written only by the ERP Integration module's sync job (§3); read by everyone else. |
| Content | Homepage sections, category story copy, Products Experience content, offer banners | Website-owned; see `data-ownership.md`. |
| Customers | Identity, verified phone, profile, notification preferences | Owns the login identity (§7). |
| Sessions | Server-side session records (guest and authenticated) | Not Redis-backed at MVP (ADR-015) — plain Postgres table with an index on session token/expiry. |
| Addresses | Saved customer addresses | Independent of orders — an order stores its own address *snapshot* (§9), not a foreign key to a mutable address row. |
| Carts / cart items | Guest and authenticated carts | Keyed by SKU, not by a frozen price (§8). |
| Orders / order items | Website Order + line-item snapshots | Includes the ERP Order Reference link (§9). |
| Payments | Payment attempts and their state machine | Linked to an order; provider-specific fields live in a narrow, provider-tagged sub-structure, not spread across the core table. |
| Shipments | Shipping selection, fee, tracking state | Linked to an order. |
| Promotions / coupons | Website-owned coupon codes and rules | Simple rule shape only (requirements §12) — no complex pricing-rule engine. |
| Analytics events | Append-only internal event log | Write-heavy, read rarely by the app itself (mostly queried by BI tooling later) — candidate for its own lighter-weight table/partitioning if volume grows (§33). |
| Integration/sync metadata | ERP sync run history, dead-letter entries, idempotency-key ledger | Operational, not customer-facing. |

**Cross-cutting conventions**
- **Identifiers:** UUID primary keys for all website-owned entities; the ERP's own identifiers are stored as separate reference columns (`erp_product_id`, `erp_order_id`, etc.), never reused as the website's primary key — keeps the two id spaces independent (avoids the "second source of truth" trap, blueprint §4).
- **Money:** stored as integer minor units (piasters), never floating point — eliminates rounding-error classes of bugs in totals/discounts.
- **Phone numbers:** stored normalized (E.164), display formatting happens at the UI layer only.
- **Timestamps:** `created_at`/`updated_at` on every table, UTC, with the display layer handling any local presentation.
- **Soft deletion:** used only where history must survive removal — products (`discontinued` flag, §3), addresses (a removed address shouldn't break historical order snapshots that only *reference* it by copy, not by live foreign key). Carts and sessions are hard-deleted when no longer needed — no history value in keeping them.
- **Indexes:** SKU, category id, order/customer foreign keys, and phone number (for OTP/tracking lookups) from day one (blueprint §16); additional indexes added only as real query patterns demand it.
- **Unique constraints:** SKU (within the projection), session token, idempotency-key ledger entries, order number.
- **Audit:** state-changing operations on orders, payments, and admin-facing content log an audit trail entry (who/what/when) — detailed further in §27.

---

## 14. Search architecture

**MVP: PostgreSQL only — no external search engine.** At a catalog size of hundreds of SKUs (§33), Postgres's built-in `pg_trgm` (trigram similarity) plus a small manually-maintained Arabic synonym table fully satisfies requirements §3 without adding infrastructure.

| Concern | MVP approach | Future (if triggered) |
|---|---|---|
| Arabic normalization | A stored, normalized (hamza/ta-marbuta/alef-maksura folded, diacritics/tatweel stripped) copy of each searchable text field, computed at projection-sync time, indexed | Unchanged — normalization stays useful regardless of search engine |
| Synonyms | A small lookup table (term → synonym group), joined at query time | Could move into a dedicated engine's synonym feature |
| Indexing | GIN trigram index on the normalized name/description columns | A dedicated engine (e.g. Meilisearch/Typesense) if relevance/latency needs outgrow Postgres |
| Ranking | Exact match → starts-with → trigram similarity → description match, with best-sellers as a tiebreaker (requirements §3) | Engine-native relevance scoring |
| Filters | Standard SQL `WHERE` on category/price/attributes, combined with the text search | Same, or engine-native faceting |
| Autocomplete | A lightweight, debounced query against the same indexed columns, limited to a handful of rows per group (product/category) | Engine-native autocomplete/typo-tolerance |
| No-results | Handled at the application layer (nearest-category + best-sellers fallback, requirements §3/§20) — not a search-engine concern either way |

**Trigger for introducing a dedicated search engine:** catalog size grows past roughly a few thousand SKUs, or real usage shows Postgres trigram relevance/latency is inadequate — not before either is actually true.

---

## 15. Content architecture

| Content type | Owner | Storage approach |
|---|---|---|
| Homepage sections, offer banners | Website (Content/Merchandising module) | Structured database rows (not Markdown) — these change often and are naturally tabular (image ref, title, link, sort order). |
| Category storytelling/education copy | Website | Same — structured rows keyed by category, sourced from `_reference/content/categories/`. |
| Products Experience content (per-chapter copy, asset references) | Website | Structured rows, one set per category chapter. |
| About | Website | Structured content (a single rich-text/blocks field is acceptable — low change frequency, low structural complexity). |
| FAQ | Website | Structured rows (question/answer pairs) — simple enough not to need a document format. |
| Policies (5 slugs, one template) | Website | Structured rows (slug, title, body) — body may be long-form rich text/Markdown-rendered-to-HTML at render time, since policy text is prose-heavy and supplied as documents by the business. |
| Promotional landing pages | Website | Reuses the Shop grid template scoped by offer id (requirements OFF-002) — not separate stored "pages" at all. |

**No full CMS is justified at this stage** — every content type above is either simple structured data or reuses an existing template; introducing a headless CMS product would add an external dependency and an extra content-sync problem without a corresponding need (the business already has a place to supply raw content: `_reference/`). This remains true under the now-locked admin-surface decision below — an ERP-hosted admin UI over these same structured rows is not a CMS product, and doesn't become one just by moving where the UI lives.

**Locked decision, 2026-09-22 — the "internal/admin surface" above is the ERP's Website Administration module.** All content types in the table above stay website-owned, stored in the website's own database, exactly as this table already specified — only *where the editing UI lives* was undecided before. It's now decided: an ERP-hosted "Website Administration" module edits this content through a secured Website Admin API (`blueprint.md` §3), not a website-hosted admin panel and not a second copy of this data inside the ERP's own schema. See `data-ownership.md`'s "Website Content / Presentation" and "Website Media Asset" entities for the full ownership contract this decision is bound by — in particular, the ERP must never gain a first-class schema column for anything in the table above (the ERP's existing `channelMetadata`-style JSON fields, built for faithfully round-tripping Shopify's presentation data, are not a substitute for this website-owned, structured storage). Media referenced by this content follows the same rule: binary files live in the ERP's `FileAsset`/`StorageProvider` object storage, and the website stores only a reference — never the binary itself.

**ERP-owned vs. website-owned, restated:** product name/base description may originate from the ERP projection (§3); the *rich* description, story, and photography are always website-owned (blueprint §7) — this section only concerns the website-owned side.

---

## 16. Media / product assets

| Concern | Specification |
|---|---|
| Storage | Object storage (S3-compatible or Cloudflare R2), not the application database or server disk (blueprint §2). |
| Responsive sizes | Generated/served via Next/Image's built-in responsive `srcset` handling — no separate manual resizing pipeline needed at this scale. |
| Optimization | Modern formats (e.g. AVIF/WebP with fallback) served automatically by the image pipeline. |
| Lazy loading | Below-the-fold images lazy-load by default; the Products Experience route additionally gates its heavier assets behind viewport-entry (blueprint §17). |
| CDN | Fronts the object storage so media is never served directly from the origin. |
| Alt text | A required field on every product/category image at the content layer (requirements §18/UX spec §22) — enforced by validation, not left optional. |
| Ownership | Product/packaging photography and Products Experience assets are website-owned content (§15), supplied via `_reference/products/images/`, `_reference/products/packaging/`, `_reference/experience/`. |
| Replacement/deletion | Replacing an image updates the content row's reference; the old object is retained for a grace period (not instantly hard-deleted) in case of accidental replacement, then garbage-collected. |

No final brand assets are selected or generated here (per this stage's constraints).

---

## 17. Analytics architecture

```
UI/product code (any module) → track(event, params) → GA4/GTM
                                                     → internal append-only event log
```

| Concern | Specification |
|---|---|
| Event identity | Every event carries a session id (guest or authenticated) and, once known, a customer id — never only an anonymous browser fingerprint. |
| Anonymous vs. customer identity | A guest's events are attributed to their session id; on login/account creation, subsequent events attach the customer id, but past anonymous events are **not** retroactively re-attributed (avoids inventing an identity-resolution system that doesn't exist yet). |
| Order attribution | `purchase` carries the order id and total — the internal event log can join against the Orders table for real business analysis (blueprint §14). |
| Privacy | No event payload includes full PII beyond what's operationally necessary (no full address, no OTP code, no payment credential) — restated from §12/§27. |
| Server vs. client events | Storefront interaction events (`view_item`, `add_to_cart`, etc.) fire client-side via `track()`; order-lifecycle events tied to a server-side state change (`purchase`, `refund`) fire server-side at the point that state actually changes, so they can't be spoofed or missed by an ad-blocked client. |
| Duplicate events | Client-side events include a de-duplication token where double-firing is plausible (e.g. a re-rendered component); server-side events are naturally idempotent since they fire once per actual state transition. |
| Event reliability | A failure in `track()` — network error, blocked script, provider outage — is caught and swallowed; it must never throw in a way that affects cart, checkout, payment, or order creation (ADR-012, restated as a hard implementation rule). |

**The full event taxonomy is not finalized here** — `ux-specification.md` §24 already documents the currently-known mapping and flags a naming gap between the original Stage 0 output and `blueprint.md` §14; that gap is intentionally left for the dedicated Analytics phase (blueprint §19, phase 7) rather than closed by this stage.

---

## 18. Notification architecture

| Event | Channel abstraction | Provider chosen here? |
|---|---|---|
| OTP code | Notifications module → SMS (or WhatsApp) abstraction | No |
| Order confirmed | Notifications module → SMS/email/WhatsApp abstraction | No |
| Payment confirmed/failed | Same | No |
| Order status changed | Same | No |
| Cancellation / refund | Same | No |
| Support reply | Same | No |

**Boundary rule:** every notification is sent through one `notify(type, recipient, payload)`-shaped internal interface inside the Notifications module; the actual SMS/email/WhatsApp provider is an adapter behind that interface, exactly mirroring the Payment/Shipping/ERP adapter pattern already established — no other module ever imports a provider SDK directly. Content requirements (what each message must contain) are already specified in requirements §16; this section only fixes the architectural boundary.

---

## 19. Background jobs

| Candidate job | MVP decision | Trigger to introduce a real queue |
|---|---|---|
| ERP catalog/price/inventory sync | Runs as a scheduled task (external scheduler hitting an internal endpoint, or an equivalent simple cron mechanism) — **not** queue-backed at MVP | Needed once retries must survive a process restart mid-run, or once sync frequency/volume genuinely requires overlapping-run coordination |
| ERP order push retry | Retries happen synchronously within the same request/job that attempted the push (bounded backoff, §4) — a dead-letter table (not a queue) holds anything still failing after that | Needed if push volume grows enough that retries can't complete within a single request lifecycle |
| Notification sending | Sent synchronously at the point of the triggering event (order confirmed, OTP requested) — acceptable at current volume | Needed once notification volume/latency risks blocking the request that triggers it |
| Reconciliation (catalog, payment status) | Scheduled task, same mechanism as sync | Unchanged — reconciliation is inherently periodic, not queue-shaped |
| Analytics processing | The internal event log is written synchronously (a simple insert); any heavier aggregation is a separate, later concern | Needed only if event volume makes synchronous writes measurably slow |

**MVP operates without Redis or a job queue**, consistent with ADR-015/ADR-016. A queue (e.g. Redis-backed) is introduced specifically when one of the triggers above is actually true — not preemptively at the start of the ERP Integration phase just because that phase is "when queues usually show up."

---

## 20. Caching

| Layer | MVP approach | Notes |
|---|---|---|
| Browser | Standard HTTP caching headers on static assets/media | — |
| CDN | Fronts media (§16) and, where the platform supports it, static/ISR page output | — |
| Next.js (ISR/SSG) | Home, Category, PDP, About render via ISR with a revalidation window matched to how often the catalog projection actually changes | The primary caching mechanism for this project — deliberately preferred over an application cache server (blueprint §2) |
| Application-level (in-process) | A short-lived, per-request-lifecycle memoization (e.g. avoid re-querying the same product twice while rendering one page) is fine and is **not** "Redis" — it holds no state across requests/instances | Distinguish this clearly from a shared cache — it introduces no cross-instance consistency concern |
| Database | Standard Postgres query caching/index usage — no separate cache layer | — |
| Redis (shared, cross-instance) | **Not introduced at MVP** (ADR-015) | Trigger: session store or cart/catalog reads need to be shared consistently across more than one running instance under real concurrent load |
| Personalization | None exists at MVP (requirements §13/§17) — nothing here needs a personalization cache | — |

**Cart and checkout are never cached** at any layer above the per-request level — they are inherently customer-specific and must always reflect live state (§8, §10). **Never cache in a way that could leak one customer's data to another** — no shared cache key is ever derived from anything less specific than a session/customer id, and no ISR/CDN-cached page ever includes customer-specific content (cart contents, account data) baked into its HTML.

---

## 21. Observability

| Concern | Specification |
|---|---|
| Structured logs | JSON logs with a consistent schema (timestamp, level, module, message, context) — never free-text string concatenation. |
| Request IDs | Every incoming API request gets a request id, included in every log line produced while handling it. |
| Correlation IDs | Propagated from the originating customer request through to any ERP Adapter/Payment Adapter/Shipping Adapter call it triggers, so one customer action can be traced end-to-end across module and adapter boundaries. |
| Error tracking | A hosted error-tracking service (vendor TBD, not a project decision made here) captures unhandled exceptions with the request/correlation id attached. |
| Performance monitoring | Real-user Core Web Vitals monitoring (vendor TBD) on the storefront routes specifically (blueprint §16). |
| Integration monitoring | A dashboard/alert on the ERP Adapter's sync success rate, latency, and dead-letter table size (§4). |
| Sync monitoring | Same mechanism — alerts on a sync run that fails all retries (§3/§4). |
| Checkout monitoring | Funnel step-completion rates via the analytics event log (§17), plus an alert on payment-failure-rate spikes specifically (a leading indicator of a provider outage). |

**Must never appear in logs (any layer):** OTP codes (never logged, under any circumstance), full phone numbers (log masked, e.g. last 4 digits only), full delivery addresses (log city/area only, not street/building), payment provider credentials/tokens/full card data, session/auth cookie values.

---

## 22. Error handling

One consistent shape, reused by every API response (§11):

```
{ "error": { "code": "...", "category": "...", "message_ar": "...", "fields": { ... } } }
```

| Category | Example | Customer message | HTTP status | Log level |
|---|---|---|---|---|
| `validation` | Missing required field | Specific, field-level Arabic guidance | 400 | info |
| `authentication` | Invalid/expired OTP, no session | "تحقق من الرمز المُدخل" / re-auth prompt | 401 | info |
| `authorization` | Viewing another customer's order | Generic "not found"-shaped message (never reveals the resource exists) | 403/404 | warn |
| `not_found` | Unknown product slug, unknown order | "لم يتم العثور على..." + a helpful next step | 404 | info |
| `conflict` | Duplicate order attempt (idempotency hit) | Returns the original result, not an error, where semantically correct | 409 (or 200 with the original result) | info |
| `business_rule` | Coupon expired, minimum order not met (if such a rule exists) | Specific, case-by-case Arabic message (requirements §12) | 422 | info |
| `payment` | Provider declined | "فشلت عملية الدفع، حاول مرة أخرى" + retry action | 402/422 | warn |
| `shipping` | Address unserviceable | "التوصيل غير متاح لهذا العنوان حاليًا" | 422 | info |
| `erp_integration` | ERP push failed after retries | Never surfaced as a checkout-blocking error to the customer — the order still confirms; this is logged/alerted internally only (§4/§9) | n/a (internal) | error |
| `internal` | Unhandled exception | Generic apology + internal reference code + WhatsApp fallback (UX spec §21) | 500 | error |

**Rule:** the customer-facing `message_ar` is always clear, Arabic, actionable, and non-blaming (UX spec §21); the internal `code`/diagnostic detail is what error tracking and support use — the two are never the same string.

---

## 23. Configuration & environments

| Environment | Purpose |
|---|---|
| Local development | Runs against a local/dockerized Postgres and mock/sandbox adapters (Payment, Shipping, ERP) — never the real ERP or a real payment provider. |
| Development/staging | Deployed preview (Vercel per blueprint §2, or the self-hosted staging target), pointed at sandbox ERP/payment/shipping credentials where available. |
| Production | Real credentials, real ERP connection, real payment/shipping providers — never shares a database or credential set with staging. |

**Configuration categories** (each environment supplies its own values for these; no category is hard-coded):

| Category | Example keys (conceptual, not exhaustive) |
|---|---|
| Database | connection string |
| Authentication | session secret/signing key, session duration |
| OTP | provider credentials, code length/expiry, rate-limit thresholds |
| ERP | endpoint/connection details, timeout/retry settings |
| Payment | per-provider credentials, webhook signing secret |
| Shipping | per-provider credentials (if any real provider exists yet) |
| Analytics | GA4/GTM ids |
| Storage | object storage bucket/credentials, CDN base URL |
| Security | rate-limit thresholds, CORS allow-list |

**Secrets:** environment-injected by the deployment platform only; never committed to the repository, and never written into any file this stage produces (this document lists *categories*, not values). A future implementation phase is responsible for the actual `.env`/secret-manager setup — out of scope here.

---

## 24. Testing architecture

| Layer | Scope |
|---|---|
| Unit | Pure domain logic — pricing math, cart totals, coupon rule evaluation, ERP-status mapping, phone normalization — no I/O. |
| Domain | State-machine transitions for Order/Payment (§9/§5) tested in isolation from any framework or database. |
| Integration | API routes against a real test database (not mocked) — verifies actual query/transaction behavior (blueprint §14). |
| API/contract | Request/response shape tests per versioned endpoint, including the error-shape consistency from §22. |
| E2E | Full browser flows via Playwright. |
| Checkout tests | Idempotency-key retry behavior, coupon edge cases, out-of-stock-at-checkout, payment failure/retry — specifically targeting the failure modes named in §10. |
| ERP adapter tests | Contract tests against a sandbox or recorded fixtures; simulated timeouts/failures verifying retry and dead-letter behavior (§4). |
| Payment adapter tests | Every state-machine transition (§5) exercised against a mock/test adapter before a real gateway is ever wired in. |
| Shipping adapter tests | Serviceability, quote, and tracking calls against a mock/test adapter, including an unserviceable-address case. |

**Mandatory E2E coverage (highest-risk flows):** product discovery (browse → filter → PDP), cart (add/update/remove, price/inventory revalidation), guest checkout (full accordion flow, no login), payment (success and failure paths, mocked adapter), order creation (idempotency verified via a deliberate duplicate submit), ERP handoff (order push against a sandbox/mock, verifying the ERP Order Reference link is created), order tracking (public lookup, stage mapping displayed correctly).

A full regression suite gates CI on every merge, per blueprint §19's phase exit criteria.

---

## 25. Performance architecture

| Concern | Target/approach |
|---|---|
| Core Web Vitals | Targets apply to the storefront (Home/Category/PDP/Checkout) specifically — restated from blueprint §16. |
| Server response time | API endpoints on the customer-facing critical path (cart, checkout) should respond fast enough that the optimistic-UI patterns in §8/UX spec §19 rarely need to "wait" visibly — a specific millisecond target is a later, measured decision, not invented here. |
| Image optimization | Next/Image, responsive sizes, modern formats (§16). |
| JavaScript budget | The Products Experience route is code-split away from Shop/PDP/Checkout (blueprint §17) specifically so its animation-library weight (GSAP, Lottie) never loads on the converting pages. |
| Code splitting | Route-based by default (Next.js App Router); no single bundle serves both the storefront and Products Experience. |
| Lazy loading | Below-the-fold images and Products Experience per-chapter assets (§16, blueprint §17). |
| Animation loading | Products Experience assets mount only on viewport entry (IntersectionObserver) — restated from blueprint §17. |
| Caching | ISR/CDN-first strategy (§20). |
| Database indexing | SKU/category/FK/phone indexes from day one (§13). |

**Products Experience must never slow down the normal shopping experience** — this is enforced structurally (separate route/bundle), not by convention alone, which is why it appears repeatedly across this document rather than being a single rule stated once.

---

## 26. Security & privacy architecture

Technical principles only — no legal policy is invented here.

| Principle | Application |
|---|---|
| Least privilege | Database roles scoped per concern (the ERP Integration module's write access to projection tables is separate from the general application role, so a bug elsewhere can't accidentally corrupt the projection). |
| Encryption in transit | TLS everywhere — customer-facing traffic, and every adapter's outbound call (ERP, payment, shipping, notifications). |
| Encryption at rest | Applied where the hosting platform provides it at the database/storage level; nothing here requires field-level application encryption beyond standard secrets handling (§23) unless a future legal requirement demands it. |
| Secrets | §23 — environment-injected, never committed. |
| Backups | §27 (backup & recovery, technical-architecture continues below in this same doc — see next section). |
| Data retention | Retention *periods* are a business/legal decision (not invented here); the architecture supports deletion/anonymization of a customer record on request without breaking historical order integrity, because orders store snapshots (§9), not live foreign keys to mutable customer/address data. |
| PII minimization | Restated from requirements §21 — only what checkout/account/delivery genuinely require is collected; nothing here expands that list. |
| Auditability | State-changing operations on orders/payments/admin content are logged with who/what/when (§13/§21). |

---

## 27. Backup & recovery

| Concern | Specification |
|---|---|
| Database backup strategy | Automated, regular PostgreSQL backups (frequency TBD by the eventual hosting setup — blueprint §18); point-in-time recovery if the hosting platform supports WAL archiving. |
| Retention | Exact retention window is an operational/business decision, not invented here — flagged for the Infrastructure phase. |
| Restore testing | A periodically executed restore drill (e.g. quarterly) — an untested backup is treated as equivalent to no backup (blueprint §15). |
| Recovery priorities | Orders and payment records are the highest-priority data to protect — losing a paid order is the single worst failure mode this architecture can have; the catalog projection, by contrast, can always be rebuilt from a fresh ERP sync and is not backup-critical in the same way. |
| Integration recovery | The ERP Adapter's dead-letter table (§4) is itself a recovery mechanism for failed order pushes — a restore drill should specifically verify dead-letter entries survive and remain actionable. |
| Order/payment data protection | Covered by the general backup strategy above; no separate mechanism is invented, but this data's priority is called out explicitly so it is never deprioritized under storage-cost pressure later. |

---

## 28. Scalability

Current scale assumption: hundreds of products, up to roughly 100k customers, growing order volume, occasional campaign traffic spikes, and a separately-bundled Products Experience with a heavier media footprint.

| Concern | Assessment |
|---|---|
| What scales automatically | Stateless API/frontend instances behind the reverse proxy (session state lives in Postgres, not in-process, so horizontal scaling is already safe per §7/§13); CDN-served media and ISR-cached pages absorb most read traffic without touching the database at all. |
| What could become a bottleneck first | (1) ERP sync — if the ERP itself is slow or rate-limited, catalog freshness suffers before anything else does; (2) the checkout/order-creation write path under a genuine campaign spike, since it's the one path that can't be cached; (3) search, once catalog size grows well past the current few-hundred-SKU assumption (§14). |
| What should be monitored | ERP Adapter latency/failure rate, checkout endpoint p95 latency and error rate, database connection pool saturation, search query latency. |
| What should NOT be prematurely optimized | Database read replicas, sharding, a dedicated search engine, Redis, a job queue, CDN edge compute, or microservice extraction — none is justified by the current scale assumption; each has an explicit trigger defined elsewhere in this document (§14, §19, §20) rather than being adopted speculatively. |

---

## 29. Deployment architecture

Restates and slightly extends blueprint §18 — still a target direction, not built in this stage.

```
Customer → Cloudflare (DNS, CDN, WAF, TLS) → Reverse proxy (Traefik/Nginx)
         → Website Application (Docker container, horizontally scalable)
         → PostgreSQL (+ Redis, once justified — §20)
         → ERP Adapter / Payment Adapter / Shipping Adapter (outbound only)
```

| Concern | Direction |
|---|---|
| Docker | One image for the Next.js application (frontend + API in the same modular-monolith deployable, §1/§2); docker-compose is likely sufficient at this scale — no case for an orchestrator like Kubernetes yet. |
| Reverse proxy | Terminates the internal hop from Cloudflare, applies rate limiting (§12), routes to one or more running application instances. |
| TLS | Edge TLS at Cloudflare; origin traffic also encrypted between the proxy and the application. |
| CDN | Cloudflare in front of both static/media assets and cacheable page output. |
| Database | Managed or self-hosted PostgreSQL, not exposed to the public internet (blueprint §15). |
| Environment separation | Local / staging / production never share a database, credentials, or payment/ERP connection (§23). |
| Health checks | A basic liveness/readiness endpoint from Sprint 1 onward (already scoped in the Foundation phase, blueprint §19) — this is the one piece of "deployment" that does belong in Sprint 1, since it proves the frontend-never-touches-DB boundary without needing real infrastructure. |
| Deployment strategy | Simple rebuild-and-redeploy is acceptable at current traffic levels; blue-green/zero-downtime deploys are a later refinement once uptime-during-deploy genuinely matters. |
| Rollback | Keep the previous container image tagged and redeployable — no exotic tooling required yet. |

**Hosting ownership remains an open, separate workstream** (requirements §25) — nothing here locks in a specific provider beyond the Cloudflare/self-hosted direction already approved in `blueprint.md`.

---

## 30. Technical risk register

| Risk | Impact | Likelihood | Mitigation | Trigger to revisit |
|---|---|---|---|---|
| ERP integration uncertainty (protocol/capabilities unknown) | High — blocks §3/§4 entirely | High (unresolved today) | Adapter pattern isolates the unknown to one module (§4); build against a mock/sandbox contract first | ERP API docs/sandbox access obtained (requirements §25) |
| Payment integration uncertainty (no provider chosen) | High — blocks real checkout | High | Payment Adapter pattern (§5); build and test against a mock provider first (blueprint §19 phase 5) | Provider selected (requirements §25) |
| Shipping complexity (multi-zone, multi-courier later) | Medium | Medium | Manual zone/fee adapter at launch (§6), interface already supports multi-provider-by-zone | Real courier contract signed |
| OTP abuse | Medium (cost/fraud) | Medium | Rate limiting, cool-downs (§7/§12) | Observed abuse pattern in production |
| Stale inventory | Medium (oversell risk) | Medium (inherent to projection lag) | Re-validation at cart/checkout/order-creation (§8/§10) | Oversell incidents observed |
| Duplicate orders | High (customer trust, refund cost) | Low, if idempotency is correctly implemented | Idempotency key end-to-end (§9/§10) | Any observed duplicate in testing/production |
| Catalog sync failure | Medium (stale storefront) | Medium | Retry + dead-letter + reconciliation job (§3/§4) | Sync failure-rate alert fires |
| Traffic spikes (campaigns) | Medium | Medium | Stateless horizontal scaling (§28); CDN/ISR absorb read load | Sustained latency/error-rate alert during a campaign |
| Media/animation performance | Medium (perceived quality) | Medium | Route isolation, lazy loading (§16/§25, blueprint §17) | CWV regression detected on Products Experience |
| Search scalability | Low at current catalog size | Low today, rising with catalog growth | Postgres trigram MVP with an explicit engine-migration trigger (§14) | Catalog size or relevance complaints cross the trigger |
| Analytics reliability | Low (observational only by design) | Low | `track()` failures are swallowed, never propagate (§17, ADR-012) | N/A — mitigated structurally |
| Security/privacy | High if mishandled | Low, if this document's rules are followed | §12/§26/§27 | Any security review finding |
| Premature infrastructure complexity | Medium (wasted effort, harder onboarding) | Medium if not actively resisted | Every deferred technology in this document names its trigger explicitly (§14/§19/§20/§28) | N/A — this row is itself the mitigation |

---

## 31. Implementation phase handoff

A future implementation phase can rely on:

- **Approved technical direction:** everything in §1–§29 above — stack, repository structure, module map (see `module-boundaries.md`), domain model (see `data-ownership.md`), and every adapter boundary.
- **Unresolved decisions:** carried forward unchanged from requirements §25 and UX §25/29 — see `technical-decisions.md` §C for the consolidated list plus any new technical-shaped ones surfaced here.
- **Implementation order:** follows blueprint §19's phase table unchanged (Foundation → Design System → Frontend → Backend → Commerce → ERP Integration → Analytics → Products Experience → Testing → Performance → Infrastructure → Migration → Launch) — this document adds detail within those phases, not a new sequence.
- **Module boundaries:** binding — see `module-boundaries.md` for the dependency-direction model and prohibited-dependency list.
- **Integration boundaries:** ERP/Payment/Shipping/Notifications adapters as specified in §4–§6/§18 — an implementer builds *to* these interfaces, choosing internals freely once a real provider is selected.
- **Testing expectations:** the pyramid and mandatory E2E list in §24 are binding minimums, not aspirational.
- **Security expectations:** §12/§26 are binding — "never trust the client for X" is a checklist, not a suggestion.
- **Performance expectations:** §25/§28 — Products Experience isolation is structural, not optional.

This document does not begin implementation, and does not need to be re-approved section-by-section — it is a reference the implementation phases are expected to consult, per `docs/README.md`.
