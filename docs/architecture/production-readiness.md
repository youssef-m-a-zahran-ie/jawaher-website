# Production Readiness & Launch Engineering (Phase 12)

Status: audit complete, all safely actionable fixes implemented and verified. Last updated: 2026-09-13.

This is the **one canonical production-readiness document** for the Website repository, per Phase 12's own instruction not to create redundant reports. It supersedes nothing else — [`premium-experience-phase-10.md`](../design/premium-experience-phase-10.md), [`production-readiness-phase-11.md`](../commerce/production-readiness-phase-11.md), and [`end-to-end-customer-commerce-readiness.md`](../commerce/end-to-end-customer-commerce-readiness.md) remain the record of their own phases' work — but consolidates the launch-readiness question those phases didn't yet ask end to end: **can this safely become a real production system serving real customers, connected to the real ERP?**

Every claim below is a code-verified finding (file:line evidence, or a command actually run), not a restatement of prior documentation. Where prior docs were compared against current code and found accurate, that's noted; where they weren't, the correction is noted.

---

## 1. Production architecture status

The established architecture (`Customer → Next.js → Website API → Website Postgres → ERP adapter → ERP`) is intact and was re-verified directly, not assumed:

- **The frontend never touches Postgres or the ERP directly** — confirmed: `src/lib/db.ts` is the only file that constructs a `PrismaClient`, every `db` import resolves there, and every ERP call funnels through `src/modules/erp-integration/client.ts` (the one file allowed to `fetch()` the ERP), itself only reachable from server-only modules.
- **ERP remains the sole authority for inventory, pricing, and order status**; the Website never blends its own local number with ERP's (Phase 9.5R's `min()`-removal correction, re-confirmed unchanged in `catalogService.getVariantForPurchase`/`applyErpAvailabilityOverlay`, `src/modules/catalog/service.ts`).
- **Shopify is not a runtime dependency** — confirmed: no code anywhere imports a Shopify SDK or calls a Shopify API; `_reference/migration/shopify/` holds only historical export references, matching its own `.gitkeep`-documented purpose.
- **The backend remains a modular monolith** — no service extraction was found justified or performed this phase.
- **No Redis, queue, or new infrastructure was introduced.** The one new capability this phase added (§7's ERP-push retry) reuses the exact existing "external scheduler hits an internal secret-protected endpoint" pattern already established for inventory-reservation expiry — not a queue.

## 2. Production gap register (classified)

Every finding from this phase, classified per §3's scheme. Fixed items are marked **[FIXED]**.

### A. Production blockers
*None found that are within the Website's own control.* The one candidate — **no committed database migration existed** (only `prisma db push`, a dev-only command, in both local dev and CI) — is a genuine blocker-class gap and is now **[FIXED]**: see §7 (Database & Migrations).

### B. High priority — **[FIXED]** this phase
- **No committed Prisma migration** → generated the real initial migration (`prisma/migrations/20260913203005_init/`) via `prisma migrate diff --from-empty --to-schema` (works without a live database — verified: this sandbox has none, and the command still produced a complete, correct 589-line SQL script covering all 22 tables, 18 foreign keys, 38 indexes). CI now runs `prisma migrate deploy` against a from-scratch database instead of `db push` (`.github/workflows/ci.yml`) — CI itself now proves the real production migration path applies cleanly, every run.
- **`/api/v1/health` always returned HTTP 200, even when degraded** — a status-code-only infrastructure health check (load balancer, orchestrator) would have read a database outage as healthy. Now returns 503 when the database is unreachable. The Dockerfile gained a real `HEALTHCHECK` hitting this exact endpoint.
- **A real, exploitable CSRF gap**: no route validated `Content-Type` before parsing a JSON body. A cross-site `<form enctype="text/plain">` submission is a top-level navigation `sameSite=lax` permits, and its body can be crafted to parse as valid JSON despite the browser sending `text/plain`. Closed centrally in `src/proxy.ts` (Next 16's `middleware`) for every `POST`/`PUT`/`PATCH` under `/api/v1/*` — confirmed via the full E2E suite (including the real contact-form submission test) that no legitimate same-origin request is rejected, since every real client call already sends `Content-Type: application/json`.
- **`pushOrderToErp`'s own comment always said "safe to call from a retry/cron sweep," but no sweep ever existed** — an order whose first ERP push failed had no path back to `SUCCEEDED` except a manual database edit. Added `retryFailedErpPushes()` (`src/modules/orders/erp-sync.service.ts`) and `POST /api/v1/internal/orders/retry-failed-erp-pushes`, mirroring the established inventory-sweep pattern exactly (shared-secret-protected, fails closed in production, excludes cancelled orders, bounded batch size). Two new integration tests pin the recovery and cancellation-exclusion behavior (skipped in this sandbox, no DB — see §12).
- **A real N+1 query pattern on every catalog listing page** (`/shop`, `/shop/[category]`, `/search` — all `force-dynamic`, so this ran on every request): each variant triggered its own `getAvailableQuantity` call, which itself re-fetched the variant row the listing query had already loaded. Fixed with a new batched `getAvailableQuantitiesForVariants()` (one `groupBy` query for an entire page's variants, `src/modules/catalog/inventory.ts`) — `getAvailableQuantity` itself is untouched, since checkout/purchase-decision call sites genuinely need a fresh per-item read, a different consistency requirement than a listing. A new integration test (`catalog-storefront.test.ts`) creates a real active reservation and asserts a *listing* (not just the PDP) reflects the reduced quantity.

### C. Important but non-blocking
- **`SESSION_SECRET` was listed in `.env.example`/`env.ts` as "reserved for later" despite the chosen session architecture (opaque, database-looked-up tokens, `session.ts`'s own comment: "never a JWT") having no use for a signing secret at all** — stale, misleading configuration documentation. **[FIXED]**: removed, with an explanatory comment in both files.
- Request-id correlation (`src/lib/request-id.ts`) is only explicitly used for logging in 2 of ~20 API routes, though `src/proxy.ts` already attaches the header to every request/response regardless — full log-line correlation for the other ~18 routes is a real but low-value gap (the response header alone already lets ops correlate a customer report against edge/proxy logs). Not retrofitted this phase (broad, low-marginal-value churn across many files for a phase with a tighter, higher-value fix list).
- 4 high-severity `npm audit` findings (`mysql2`, `deepmerge-ts`) are transitive dependencies of the Prisma **CLI** (a `devDependency`), not reachable from the deployed app (confirmed: `@prisma/client`/`@prisma/adapter-pg`, the actual runtime deps, don't depend on either package, and this project only uses the Postgres adapter). Not "fixed" — `npm audit fix --force` would downgrade `prisma` to 6.x, a real breaking change for a non-reachable, dev-only exposure. Documented, not acted on.
- No customer-facing `select_item`/`checkout_abandoned` analytics events fire yet, despite being declared in `analytics.ts`'s union since Phase 3 (carried over from Phase 11's own classification, unchanged).

### D. Business decisions required
- Online payment gateway: not implemented, not fake. COD is the only working payment method; see §9.
- Courier/3PL integration: not implemented; shipping fee is a manual `ShippingZone` lookup, no real-time tracking; see §10.
- Production domain (`NEXT_PUBLIC_SITE_URL`) is not yet chosen — every canonical/sitemap/OG URL correctly falls back to a local dev URL rather than a guessed one (unchanged from Phase 11's own finding, re-verified).
- "Best seller" concept, full legal/policy copy, customer-account/login UI — unchanged from Phase 11's classification.

### E. Infrastructure dependencies
- **Real production Postgres**, provisioned and reachable, with automated backups (§8) and a tested restore path — this repository can produce the correct migration to run against it (§2/§7) but cannot provision or back up infrastructure that doesn't exist.
- **Reverse proxy / CDN (Cloudflare, per the established architecture direction)**, terminating TLS, in front of the app — `next.config.ts`'s CSP/security headers and `Strict-Transport-Security` are the app's own responsibility; HSTS specifically is commonly set at the edge instead and was **not** added at the app level this phase (see §15's note on why).
- **A cron/scheduler** to actually call the two internal sweep endpoints (`sweep-expired-reservations`, and this phase's new `retry-failed-erp-pushes`) on a schedule — both exist and work; nothing invokes either automatically, by design (documented in both routes' own comments, unchanged pattern).
- **Application error monitoring / uptime monitoring / ERP-connectivity alerting** — none configured (none can be, from inside this repository); see §11.
- Multi-instance deployment would make the in-memory rate limiter (`src/lib/rate-limit.ts`) unsafe (each instance counts independently) — already self-documented (`ADR-015`) as the trigger for introducing Redis *at that point*, not before. Not a gap to fix now; a documented scaling trigger.

### F. Future features
Multi-variant PDP picker, full search relevance, a persistent "my orders" view, payment gateway, courier/3PL — all unchanged from Phase 11's own classification.

---

## 3. Security status

A fresh security review was performed (not a re-assertion of Phase 9.7's prior findings), covering every item Phase 12 named:

| Area | Finding |
|---|---|
| Sessions/cookies | `httpOnly: true`, `sameSite: "lax"`, `secure` in production only, 30-day expiry (`session.ts`) — unchanged, re-confirmed correct. |
| IDOR | Re-checked every customer-facing route (`addresses/[id]`, `orders/[id]`, `orders/track`, checkout/*) against its service-layer ownership check. `customersService.setDefaultAddress`/`deleteAddress` (`src/modules/customers/service.ts:94-111`) both verify `address.customerId === customerId` before acting — correct. No new IDOR found. |
| CSRF | **Real gap found and fixed** — §2/§7. |
| CORS | No route sets any `Access-Control-Allow-*` header or exports `OPTIONS` (confirmed via a full grep of `src/app/api/v1/**/route.ts`) — same-origin only, as intended for a storefront with no cross-origin API consumer. |
| SQL injection | Every query goes through Prisma's parameterized query builder or its tagged-template `$queryRaw`/`$queryRawUnsafe`-free raw SQL (the two `$queryRaw` call sites — `health/route.ts`, `inventory.ts`'s row-lock — both use tagged-template interpolation, which Prisma parameterizes automatically; neither is string concatenation). |
| XSS | One `dangerouslySetInnerHTML` site (`src/ui/structured-data.tsx`) — the standard JSON-LD pattern, escapes `<` explicitly, never renders raw user input. No other occurrence anywhere in `src/`. |
| Open redirects | No dynamic `redirect()` target found anywhere in `src/app` (grep returned zero matches) — nothing to exploit. |
| Path traversal / SSRF | No filesystem access based on user input; the only outbound server-side HTTP call is to `ERP_BASE_URL`, a fixed environment value, never a user-supplied URL. |
| Rate limiting | Checkout/cart/order-track/cancellation/coupon/OTP endpoints are all rate-limited (re-confirmed: `otp-request` 3/10min, `otp-verify` 10/10min, `order-track`/`order-cancel` 10/10min, `cart-add`/`cart-update` 60/10min, `checkout-address`/`checkout-rates` 20/10min, `order-place` 10/10min, `coupon-apply` 10/10min) — single-instance-only, documented (§2/E). |
| PII in logs | `logger.ts`'s redaction list (OTP codes, tokens, cookies, card numbers, phone numbers, street/building/apartment/landmark) re-confirmed unchanged and still comprehensive. |
| Error exposure | `mapDomainErrorToApiResponse`/`error.tsx` re-confirmed: unrecognized errors get a random correlation id, are logged server-side only, and return a generic Arabic message — never a stack trace or raw DB error to the client. |

## 4. Environment & secrets

- `src/lib/env.ts` validates `process.env` with Zod at process start — a missing/malformed required variable (`DATABASE_URL`) fails the boot immediately with a clear message, never a silent fallback.
- No secret is committed: `.env` is gitignored and dockerignored (confirmed in both `.gitignore` and `.dockerignore`); `.env.example` contains only placeholder/absent values.
- `NODE_ENV` correctly gates production-only behavior in multiple places independently (not one central switch that could be bypassed): `session.ts`'s `secure` cookie flag, `logger.ts`'s log level and `pino-pretty` transport, `db.ts`'s dev-only global client caching, the internal sweep routes' secret enforcement (`env.NODE_ENV === "production" || env.INTERNAL_API_SECRET`).
- **[FIXED]** `SESSION_SECRET` removed from both `env.ts` and `.env.example` — see §2/C.
- No hardcoded credential exists anywhere in the codebase (confirmed by the same grep sweep used for the secret-leak check before this phase's commit, §14).

## 5. Database, migrations & data ownership

- **[FIXED]** A real, committed initial migration now exists — see §2/B. `prisma/migrations/migration_lock.toml` pins the `postgresql` provider.
- Schema re-reviewed: every FK is declared with an explicit `onDelete` behavior appropriate to its relation (`RESTRICT` for financial/order records, `SET NULL` for optional/historical links like `OrderItem.variantId`); unique constraints exist on every natural key that needs one (`Order.orderNumber`, `Order.idempotencyKey`, `Payment.idempotencyKey`, `Variant.sku`); indexes exist on the actual hot-path lookups (`InventoryReservation`'s `[variantId, status]`/`[status, expiresAt]`).
- `prisma db push` is no longer used anywhere in this repository (CI updated — §2/B); the documented production path is `prisma migrate deploy`, run as its own pre-deployment step (§9's sequence), never automatically inside the app container's `CMD`.
- ERP ownership re-verified unchanged: `Variant.erpVariantId`/`Product.erpProductId`/`Category.erpCategoryId` are the correlation keys, never re-derived or guessed; the Website's own `inventoryQuantity` column is used only when a variant has no `erpVariantId` at all (never blended with a real ERP answer).

## 6. Order reliability

The full lifecycle (Cart → Checkout → Website Order → ERP Push → ERP Status → Tracking) was re-traced against current code, not prior documentation:

- **Idempotency**: `claimIdempotencyKey`/`completeIdempotencyKey` run as the first statement inside `confirmAndPlaceOrder`'s own `$transaction`, backed by a real DB-unique constraint on `IdempotencyKey.key` — re-confirmed genuinely enforced, not a racy pre-check (same conclusion as Phase 9.7's own review, re-derived independently this phase).
- **Website order created but ERP push fails**: `pushOrderToErp` never throws to its caller; the Order remains a valid, real, COD-confirmed Website order regardless (`Order.status` stays `CONFIRMED`), with `erpPushStatus: "FAILED"` as an honest, retryable signal — **now actually retryable, §2/B**.
- **ERP accepts but the Website never receives/records the response**: not separately guarded against this phase, but structurally already safe — `erpOrderAdapter.pushOrder`'s dedup is keyed by the Website's own `Order.id` (documented in `erp-sync.service.ts`'s own header comment), so a retried push after a lost response is a safe no-op on ERP's side, not a duplicate order.
- **Customer retries checkout / refreshes the confirmation page**: the client-generated `Idempotency-Key` (one per page load, reused across retries — `checkout-flow.tsx`) plus the DB-unique-constraint enforcement means a duplicate submission returns the original order, never a second one.
- **Cancellation**: re-verified `cancelOrder` propagates to ERP first when already pushed, and is blocked (not silently overridden) if ERP's own rules reject it (`ErpOrderRejectedError`) — unchanged from Phase 9.6/9.7.
- **No automatic retry existed before this phase** — closed per §2/B, using a sweep, not a queue, per the phase's own explicit instruction.

## 7. Payment & shipping — honesty check

- **Payment**: COD is the only implemented, working method. `PaymentMethod.ONLINE` exists in the schema and is shown in the UI, always disabled with an honest "غير متاح حاليًا" label (`checkout-flow.tsx`) — never silently offered as functional. `Payment.status` (`AWAITING_COD_COLLECTION` etc.) is a genuinely separate dimension from `Order.status`, never conflated (re-confirmed, `deriveCustomerFacingStatus`). No fake payment provider exists anywhere.
- **Shipping**: a manual `ShippingZone` table keyed by governorate — real, but not a courier integration. No real-time courier tracking exists or is claimed; `/track` shows the Website's own order status plus ERP's pulled-back fulfillment stage, never an invented "out for delivery, 2 stops away" claim. This manual model is judged acceptable for a COD-only, single-country launch; a real courier decision remains business-owned (§2/D).

## 8. Backups & disaster recovery — infrastructure requirement, not implemented here

This cannot be implemented inside the repository — it depends on the production Postgres instance's own infrastructure. **Documented requirement, not claimed as done:**
- Automated daily (minimum) `pg_dump`/provider-native snapshot, encrypted at rest, retained for a business-defined window (a *business decision*, not inferred here).
- A **tested** restore procedure — restoring a snapshot to a scratch instance and running the app's own smoke test (§10) against it — before relying on backups for real. An untested backup is not a real recovery capability.
- `prisma migrate deploy`'s own behavior on rollback: Prisma Migrate does not auto-generate down-migrations; a bad migration is rolled back by deploying the previous application version against a database still on the previous schema, or by writing and applying a manual compensating migration — this must be decided per-migration at deploy time, not automated generically.

## 9. Deployment architecture & safety

- `Dockerfile`: multi-stage (`deps`/`builder`/`runner`), non-root user, `output: "standalone"`, **[FIXED]** now has a real `HEALTHCHECK` against `/api/v1/health`.
- `docker-compose.yml` is explicitly local-dev-only (its own header comment) — production topology (reverse proxy, TLS, Cloudflare, orchestration) is correctly treated as a separate, not-yet-configured concern, not guessed at or implemented here.
- **Safe deployment sequence** (code readiness vs. infrastructure readiness, kept distinct):
  1. **`prisma migrate deploy`** against the target database, from CI/CD or an operator shell — never from inside the running app container.
  2. Deploy the new application container(s).
  3. Wait for `/api/v1/health` to report `200`/`"ok"` (the Docker `HEALTHCHECK` and any orchestrator readiness probe both already watch this).
  4. Verify ERP connectivity specifically (a real call, e.g. hitting the catalog-sync script once, or watching the first real order's `erpPushStatus`) — `/api/v1/health` deliberately does *not* gate on this (§13).
  5. Run the smoke test (§10).
  6. Only then cut customer traffic over.
  - **Rollback**: the application container can be rolled back to the previous image at any time (stateless). The database migration is the part that needs care — a migration that only *adds* nullable columns/tables (like this phase's initial baseline) is safe to leave in place even if the app is rolled back; a migration that drops or renames a column the *previous* app version still reads is not safely reversible without a compensating migration. This project has exactly one migration today (the initial baseline) — no rollback-compatibility risk exists yet, but every future migration must be reasoned about the same way before it ships.

## 10. Production smoke-test plan

To be executed once real production infrastructure, a real domain, and real ERP connectivity exist — **not claimed as passed now**, since none of those exist in this sandbox:

1. Homepage loads, brand identity renders, no console errors.
2. A real category page lists real ERP-sourced products with correct prices.
3. A real PDP shows correct price/availability (matching ERP, not stale local data).
4. Add to cart; cart drawer reflects the real line item and subtotal.
5. Checkout: address → shipping fee → (optional coupon) → COD → place order.
6. Order confirmation shows a real order number.
7. The order actually arrives in ERP (check `erpPushStatus` becomes `SUCCEEDED`, or the sweep endpoint recovers it if not).
8. `/track` with the real order number + phone shows the correct status.
9. A cancellation (where still eligible) succeeds and reflects both Website and ERP state.
10. Repeat steps 4-6 on a real mobile device (not just a narrow desktop viewport).
11. Confirm `sitemap.xml` lists the real (non-placeholder) products and `robots.txt`/canonical tags match the intended indexing strategy (Phase 11R, re-verify unchanged — §13 below).
12. Confirm at least one real analytics event (`purchase`) actually reaches whatever analytics destination is eventually wired up.
13. Attempt an authorization boundary check with a second, unrelated browser session (no shared cookies) against a real order/checkout session id from step 5-6 and confirm it is rejected — a live re-run of Phase 9.7's IDOR regression tests against production.

## 11. Observability requirements — what must be configured operationally

Not fakeable from inside this repository; documented so the launch owner knows what to provision:
- **Application error monitoring** (e.g. Sentry or equivalent) — `error.tsx`/`mapDomainErrorToApiResponse` already generate a correlation reference on every unexpected error and log it server-side (`logger.error`) — wiring a real error-tracking SDK to also capture that same event is additive, not a rewrite.
- **Uptime monitoring** against `/api/v1/health` from outside the cluster.
- **Database monitoring** (connection count, slow queries, disk) — provider-native (managed Postgres) or self-hosted equivalent.
- **ERP-connectivity alerting** — e.g. alert if `Order.erpPushStatus = 'FAILED'` count exceeds a threshold, or if the retry sweep (§2/B) hasn't succeeded on a stuck order after N attempts. No such alert exists yet; the *data* to build one on (`erpPushStatus`, `recordAuditEvent`'s audit trail) already does.

## 12. Testing & verification performed this phase

- `npm run typecheck`, `npm run lint` — clean, re-run after every substantive change.
- `npx vitest run` — **167 passed, 71 skipped, 0 failed.** All skips are pre-existing (or, for the 3 new tests this phase added — 2 ERP-retry-sweep tests, 1 catalog-listing-availability test — newly-skipped) DB-dependent integration tests; this sandbox has no reachable Postgres, reconfirmed via the same direct TCP-connection check prior phases used.
- `npm run build` — clean; the new `/api/v1/internal/orders/retry-failed-erp-pushes` route and the unchanged route set both build correctly.
- **Playwright E2E, real production build/server, browsers installed** — **30 of 32 passed.** The 2 remaining failures are the same pre-existing, non-regressed failures Phase 11/11R already traced to `catalogService` calls throwing (rather than returning "not found") when Postgres is unreachable — re-confirmed unrelated to this phase's changes by re-running the full suite after each substantive change, not just once at the end.
- **Explicitly not verified in this environment** (no reachable Postgres): the real initial migration's `prisma migrate deploy` execution against a live database; the ERP-retry-sweep's actual DB behavior; the catalog N+1 fix's actual query-level equivalence (verified structurally — typecheck, and a logical proof that `groupBy` produces the same per-variant sum as N separate `aggregate` calls — but not by watching it run against real rows). These are honestly reported as **structurally verified, not database-verified**, per this phase's own instruction not to fabricate DB-backed test success.

## 13. SEO — Phase 11R re-verification

Explicitly re-checked, not re-decided: `sitemap.ts` still queries `catalogService.listAllProducts()` and lists only products where `!isSampleContent(product.name)`; `product/[slug]/page.tsx`'s `generateMetadata` still sets `robots: {index:false}` only for that same per-product check, indexable by default otherwise; `/account`/`/checkout`/`/track`/`/search` remain `noindex`. Nothing in this phase touched or reverted that logic — confirmed by diffing this phase's changed files against `docs/commerce/production-readiness-phase-11.md` §5's table, which still matches current code exactly.

## 14. Shopify migration checklist (not performed — a checklist for when it is)

Shopify remains migration-only, never runtime infrastructure (re-confirmed, §1). A real cutover, whenever the business schedules it, needs:
1. **Domain cutover**: DNS change from Shopify to this app's real host, behind the CDN/proxy layer (§9's infrastructure dependency) — plan for DNS TTL/propagation delay.
2. **URL strategy & redirects**: map every real Shopify product/collection URL to its Website equivalent (`/shop/[category]`, `/product/[slug]`) and configure 301 redirects at the edge — this repository doesn't have Shopify's real historical URL list, so the mapping itself is a business/content task, not something to invent here.
3. **Product/inventory sync**: confirm ERP already holds every real product Shopify currently sells (a business/ops task, already the established source of truth going forward — not a new sync to build).
4. **Order history**: decide whether pre-cutover Shopify order history is migrated into the Website's database, kept accessible read-only elsewhere, or not carried over — **not decided here**; this project's schema has no Shopify-order-import path today, and building one without that decision would be inventing scope.
5. **Analytics continuity**: re-point whatever analytics destination is eventually wired into `track()` (still a no-op abstraction — Phase 3's own scoping, unchanged) so historical trend lines don't silently reset at cutover.
6. **SEO continuity**: submit the new sitemap, verify the redirect map (step 2) preserves link equity, monitor Search Console for a crawl-error spike post-cutover.
7. **Cutover timing**: a low-traffic window, with Shopify left in a read-only/maintenance state (not deleted) until the new site is confirmed stable — enables a real rollback (repoint DNS back) if something is wrong.
8. **Rollback**: DNS repoint back to Shopify is the actual rollback mechanism — cheap and real, as long as Shopify itself isn't decommissioned prematurely. No database rollback is implied by a storefront cutover (the Website's own order data stays valid regardless of which storefront is live).

## 15. Known limitations (carried forward, re-confirmed unchanged)

- In-memory, single-instance rate limiting (§2/E).
- ERP has no external reservation/commit API — the availability-check-to-order-confirmation race narrows but cannot fully close (Phase 9.5/9.7's own finding, re-confirmed still accurate; not "solved" here, per this phase's explicit instruction not to invent Website-side authority ERP doesn't grant).
- No HSTS header set at the app level — deliberately deferred to the reverse-proxy/CDN layer (§2/E's infrastructure dependency) rather than set here and potentially conflict with edge-level TLS termination configuration not yet decided.
- Real product photography, full legal/policy copy, and the account/login UI remain absent — unchanged, business/asset dependencies from prior phases.

## 16. Deferred work

Everything in §2's classifications C (non-blocking polish), D (business decisions), E (infrastructure), and F (future features) — nothing in those categories was implemented this phase, consistent with the instruction to fix only what's clearly correct, safe, and not dependent on an unavailable decision or dependency.
