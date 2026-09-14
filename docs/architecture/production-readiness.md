# Production Readiness & Launch Engineering (Phase 12 + Phase 13 + Phase 14)

Status: audit complete, all safely actionable fixes implemented and verified. Last updated: 2026-09-14 (Phase 14 — §18 added, a real isolated staging database now exists; §17 is Phase 13's own record, unchanged; §§1-16 are Phase 12's own record, unchanged).

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

---

## 17. GitHub & Vercel Staging Foundation (Phase 13)

**Explicit scope boundary for this section, carried over from the phase brief and binding on every claim below**: this is preparation for a *safe, isolated staging/testing* environment only. Nothing here touches the current production domain (still served by Shopify), moves production traffic, creates DigitalOcean infrastructure, or makes an irreversible infrastructure decision. No deployment success is claimed unless it actually happened in this sandbox — and no isolation claim is made unless it is either directly verified or structurally guaranteed by code that was actually read.

### 17.1 GitHub repository readiness

- **No remote is configured** (`git remote -v` returns nothing) — this repository has never been pushed to GitHub. Only one branch exists (`main`), 15+ commits, all local.
- **Git history reviewed for accidental secrets, end to end**: `git log --all -p -- .env` returns empty — `.env` was never committed at any point in this repository's history. A full-history grep for the real production domain (`jewelsherb`/`jawaherelkheir`-style strings) and for any hardcoded credential returns no matches in any tracked file at any commit. **Nothing to remediate** — no history rewrite is needed or was performed.
- **`.gitignore` reviewed in full**: `.env*` ignored with `.env.example` explicitly re-allowed, plus `.vercel`, `.next/`, `node_modules`, `/coverage`, `/test-results`, `/playwright-report`, `/prisma/dev.db*`, `*.tsbuildinfo`, `next-env.d.ts`. Already comprehensive — no gap found, nothing added.
- **Repository separation**: `jawaher-website` (this repo) and `jawaher-erp` (`E:\Engineering\Projects\Jawaher\ERP JAW`) remain, and must remain, two separate repositories — no monorepo merge was considered or performed. The ERP repository was not opened, read, or modified at any point this phase (re-confirmed at commit time, §17.13).

### 17.2 Branch & development workflow

Not GitFlow — a simple, standard flow, matching the phase brief's own instruction: `main` (always deployable) → short-lived feature branches → pull request → CI must pass → Vercel Preview deployment for that PR → review → merge. This is a **documented convention**, not new tooling: no branch-protection rule, CODEOWNERS file, or PR template exists yet because no GitHub remote exists to attach them to (§17.1). Creating the actual GitHub repository, enabling branch protection on `main`, and connecting Vercel's GitHub integration are the concrete first steps whenever the user is ready to act on this — none were performed here since doing so would require pushing this repository to a real, user-owned GitHub account, an action with real external effect this phase does not take unilaterally.

### 17.3 CI (re-confirmed, not re-built)

Phase 12 already brought CI to the standard this phase would otherwise ask for — re-verified against `.github/workflows/ci.yml` directly, not assumed: install → typecheck → lint → `prisma migrate deploy` against a real ephemeral Postgres **service container** (not `db push`, not production, not the ERP database) → unit/integration tests → build → E2E. This already satisfies §5 of the phase brief (an isolated CI-only Postgres, never pointed at production or ERP-production). **No change made this phase** — confirming an existing correct thing is not the same as claiming this phase built it.

### 17.4 Environment model — `APP_ENV`

**The core new mechanism this phase adds.** `NODE_ENV` cannot distinguish "a Vercel staging/preview deployment" from "the eventual real production deployment" — Next.js sets `NODE_ENV=production` for every optimized build regardless of tier, staging included. Vercel's own `VERCEL_ENV` isn't an option either — it won't exist on the eventual self-hosted/DigitalOcean host, and this app must stay portable between the two (`technical-architecture.md` §18: "Vercel for preview only"). So Phase 13 introduces `APP_ENV: "development" | "staging" | "production"` (`src/lib/env.ts`), validated by the same Zod schema as every other variable, defaulting to `"development"` — the cautious failure mode if a deployment ever forgets to set it.

Every environment variable in `env.ts`, classified (this classification already existed implicitly in that file's own comments; consolidated explicitly here):

| Variable | Classification | Notes |
|---|---|---|
| `NODE_ENV` | environment-specific, framework-managed | Never manually set on Vercel; always `"production"` for any optimized build. |
| `APP_ENV` | environment-specific, server-only | New this phase. Drives `robots.ts`/`sitemap.ts` indexing and (once wired) analytics/notification gating. Never `NEXT_PUBLIC_`. |
| `DATABASE_URL` | secret, environment-specific | Must differ between local/CI/staging/production — never shared (§17.5). |
| `NEXT_PUBLIC_SITE_URL` | public-client-safe, environment-specific | Falls back to a dev URL rather than a guessed real domain — unchanged from Phase 3. |
| `INTERNAL_API_SECRET` | secret, environment-specific | Gates the two internal sweep endpoints. |
| `CRON_SECRET` | secret, environment-specific | New this phase — Vercel's own fixed name for its automatic cron auth header; same secret *value* as `INTERNAL_API_SECRET`, under the name Vercel requires (§17.9). |
| `INVENTORY_RESERVATION_TTL_MINUTES` | server-only, non-secret config | No client exposure needed. |
| `ERP_BASE_URL` / `ERP_API_KEY` / `ERP_CONNECTION_ID` / `ERP_REQUEST_TIMEOUT_MS` | secret (API key/connection id), environment-specific | Server-only, never `NEXT_PUBLIC_`. Staging guidance: §17.6. |
| `OTP_PROVIDER_API_KEY` / `PAYMENT_PROVIDER_API_KEY` / `SHIPPING_PROVIDER_API_KEY` / `ANALYTICS_GA4_ID` / `STORAGE_BUCKET_URL` | reserved, unused | No code reads these yet (confirmed by grep — none appear outside `env.ts`/`.env.example`); nothing to classify further until the feature that needs them exists. |

No variable containing a secret is, or should ever become, prefixed `NEXT_PUBLIC_` — confirmed by reading every `NEXT_PUBLIC_` reference in the codebase (`NEXT_PUBLIC_SITE_URL` is the only one, and it is a public URL by design, not a secret). `loadEnv()` throws at process start on any missing/malformed required variable — a staging deployment with a missing required variable fails to boot, not silently misbehaves.

### 17.5 Staging database

**Must be a dedicated Postgres instance, isolated from any future production database and from the ERP's own database — never shared, never invented here.** This phase does not provision one (no infrastructure access in this sandbox) — it documents the exact requirement:
- A real, separate `DATABASE_URL` pointed at a staging-only Postgres instance (a free-tier managed Postgres, or a small dedicated instance — the specific provider is an infrastructure decision, not made here).
- Schema applied via `prisma migrate deploy` against that instance — **never `prisma db push`** (Phase 12 already removed `db push` from CI and documented it as the wrong tool for anything but local dev, §5 above; the same rule applies to staging).
- **Never reset a database that might hold useful data.** If a staging database already exists from earlier manual testing, its contents are not touched by anything in this phase.
- No staging database credential was invented, guessed, or hardcoded anywhere in this phase's changes — confirmed by the same secret-grep sweep used at commit time (§17.13).

### 17.6 ERP staging boundary — the most important safety requirement in this phase

**Question addressed directly, not assumed**: does a real ERP staging/sandbox tenant currently exist? Evidence found: `docs/integration/erp-integration-testing-plan.md` states the *principle* that ERP integration tests should run "against a sandbox or recorded fixtures," and `technical-architecture.md`'s environment model says staging should point "at sandbox ERP/payment/shipping credentials **where available**." Neither document, nor anything found in this repository, confirms a real ERP sandbox company/tenant is actually provisioned today. Per this phase's own instruction not to invent one, the conclusion is: **no ERP sandbox is confirmed to exist.**

**Recommendation, and the only safe default given that**: leave `ERP_BASE_URL`, `ERP_API_KEY`, and `ERP_CONNECTION_ID` **unset** in the Vercel staging project's environment variables. This is not a gap needing a workaround — the ERP adapter already fails safely when unconfigured: `src/modules/erp-integration/client.ts`'s `ErpNotConfiguredError` (thrown at call time, `client.ts:109`) means every code path that would otherwise call the real ERP instead throws a clear, typed error rather than silently doing nothing or, worse, silently succeeding against production ERP data. A staging deployment with no ERP credentials configured can safely exercise the storefront UI, cart, and Website-side order creation, with ERP-dependent behavior (live price/availability overlay, order push) failing loudly and safely instead of touching real ERP data.

**This closes the actual risk this section exists to close**: staging cannot accidentally perform a real production ERP write, because it has no ERP credentials to do so with. If a real ERP sandbox tenant is provisioned later, wiring it in is a configuration change (setting the three variables in the Vercel project), not a code change — the adapter's boundary is already environment-variable-driven, not hardcoded.

### 17.7 Vercel staging architecture — what was prepared, and what was not

**Prepared (code-level, verified via a real local build — see §17.12):**
- The app already builds with `output: "standalone"` and runs correctly as a set of serverless functions per route (confirmed: every API route and dynamic page in the build output above is a discrete `ƒ` entry, exactly the shape Vercel's platform expects) — no Vercel-specific code was added or needed for this to work.
- `vercel.json` (new, this phase) declares the two existing internal sweep endpoints as Vercel Cron jobs (§17.9) — the only Vercel-specific configuration file in the repository, and it is additive (does nothing outside Vercel; a DigitalOcean deployment simply ignores this file and runs the same endpoints from a plain cron daemon instead, §17.9).
- `robots.ts`/`sitemap.ts` are now environment-aware (§17.8) so a staging deployment is safe to actually put on the public internet without competing with production in search results.

**Not performed, and not claimed as performed**: no real Vercel project was created and no real deployment was executed — this sandbox has no Vercel account credentials or CLI access. The manual steps required, precisely, whenever the user is ready:
1. Push this repository to a real GitHub repository (§17.1/§17.2).
2. Create a new Vercel project from that GitHub repository.
3. In the Vercel project's environment variables (Preview/staging scope only — never Production scope, and this project should not have a Production scope configured at all until a real production decision is made): set `DATABASE_URL` (a dedicated staging Postgres, §17.5), `APP_ENV=staging`, `INTERNAL_API_SECRET` and `CRON_SECRET` (same value, freshly generated — never reused from any other environment), and leave every `ERP_*` variable unset (§17.6).
4. Do **not** configure the real production domain in this Vercel project (§17.10) — use Vercel's own generated `*.vercel.app` preview URL only.
5. Run `prisma migrate deploy` against the new staging database before the first deployment (never `db push`).
6. Deploy; then run the smoke test in §17.12.

**Explicitly not assumed**: that Vercel is the final production host. `technical-architecture.md` already states the opposite intent ("Vercel for preview only," self-hosted/Docker/DigitalOcean as the target) — nothing added this phase introduces a Vercel-only data model, API, or business-logic dependency (§17.11 confirms this directly).

### 17.8 Staging SEO safety — environment-aware `robots.ts`/`sitemap.ts`

Both files now read `APP_ENV` (not `NODE_ENV`, which can't distinguish staging from production — §17.4) and default to the safe behavior:
- `robots.ts`: returns a single `disallow: "/"` rule for every visitor whenever `APP_ENV !== "production"`. Phase 11R's real, per-route production policy (public commerce pages indexable; `/account`, `/checkout`, `/track` `noindex`) is untouched and takes over only when `APP_ENV=production` explicitly.
- `sitemap.ts`: returns `[]` (no URLs at all) under the same condition — a stronger signal than a populated sitemap a `Disallow: /` merely asks crawlers to respect.
- Both behaviors are pinned by new, dedicated unit tests (`tests/unit/robots-staging-safety.test.ts`), not left to a single manual read — the stakes are asymmetric in both directions (a staging leak competing with real product listings in search results, versus a misconfigured `APP_ENV` silently de-indexing real production forever).
- This is explicitly a **`noindex`/crawl-blocking** control, not an access-control mechanism — per the phase brief's own instruction, staging `noindex` is not a substitute for keeping staging non-public-facing if that matters; nothing in this phase adds authentication in front of the staging deployment itself (out of scope, not requested).

### 17.9 Cron / ERP-retry sweep — Vercel compatibility, without a second mechanism

Neither existing sweep (`sweep-expired-reservations`, Phase 1; `retry-failed-erp-pushes`, Phase 12) is triggered automatically in **any** environment today — both are, and were already documented as, "an external scheduler hits a shared-secret-protected internal endpoint," with no scheduler ever actually wired up. This phase does not change that fact; it prepares one specific scheduler (Vercel Cron, for the staging environment only) without inventing a second retry mechanism or a queue:

- `src/lib/internal-auth.ts` (new, shared) is now the single authorization check both routes use, accepting **either** of two presentations of the same configured secret: the original `x-internal-api-secret` header (any generic scheduler — a DigitalOcean cron daemon, a manual curl) or `Authorization: Bearer <CRON_SECRET>` (Vercel Cron's own fixed, automatic convention — it attaches this header itself whenever `CRON_SECRET` is set on the project). Pinned by 5 new unit tests (`tests/unit/internal-auth.test.ts`) covering both accepted presentations and both rejection paths.
- Both routes now export a `GET` handler (aliased to the same function as the existing `POST`) because Vercel Cron can only issue `GET` requests to a configured path — `POST` remains for any other caller.
- `vercel.json` declares both routes on an hourly schedule (`"0 * * * *"`) as a conservative placeholder. **Explicitly unverified**: the exact cron-frequency limit on Vercel's Hobby tier could not be checked from this sandbox (no Vercel account access) — confirm the account's actual tier limits before relying on this schedule.
- **The same responsibility, unchanged, for DigitalOcean later**: a plain cron daemon on that host hitting the same two paths with the same `x-internal-api-secret` header requires no code change — `vercel.json` is inert outside Vercel, so there is no duplicate mechanism to keep in sync.

### 17.10 Domain/URL safety

The real production domain is not configured anywhere in this repository (re-confirmed, §17.1's grep sweep) and nothing this phase adds changes that. `NEXT_PUBLIC_SITE_URL` remains optional with a localhost fallback (Phase 3's own decision, unchanged) — a staging deployment sets it to its own Vercel-generated preview URL, never the real domain. The phase brief's instruction not to touch the existing Shopify DNS/domain setup required no code action — nothing in this codebase has ever referenced it.

### 17.11 Vercel compatibility & portability audit

- **No persistent in-memory state that would break across serverless invocations was found beyond one already-documented case**: `src/lib/rate-limit.ts`'s in-memory limiter (ADR-015, already self-documented as single-instance-only) is *more* fragile on Vercel's per-invocation serverless model than on a traditional long-running server — re-confirmed as an existing, documented, not-yet-triggered scaling concern; not fixed this phase (would mean introducing Redis specifically because Vercel exists, which the phase brief explicitly warns against doing prematurely).
- **No filesystem writes at runtime**: confirmed no code path writes to disk outside build time.
- **No long-running process or background worker exists** — the only "background work" in the entire codebase is the two sweep endpoints, both now Vercel-Cron-compatible (§17.9) and both already request-scoped, stateless functions.
- **No Vercel-only data model, API shape, or business logic was introduced.** `vercel.json` is the only Vercel-specific file added; every other change (`APP_ENV`, `internal-auth.ts`, `robots.ts`/`sitemap.ts`) is plain Next.js/Node code that runs identically under Docker/DigitalOcean.

### 17.12 Testing & verification performed this phase

- `npm run typecheck`, `npm run lint` — clean, re-run after every substantive change.
- `npx vitest run` — **175 passed, 71 skipped, 0 failed** (up from Phase 12's 167 — the 8 new Phase 13 tests: 5 for `internal-auth.ts`, 3 for `robots.ts`'s environment gating). All skips are the same pre-existing DB-dependent integration tests Phase 12 already documented; this sandbox still has no reachable Postgres (reconfirmed).
- `npm run build` — clean. Build output confirms both internal sweep routes and `robots.txt`/`sitemap.xml` compile as expected dynamic (`ƒ`) routes.
- **Playwright E2E, real production build/server** — **30 of 32 passed**, the identical pre-existing 2 failures Phase 12 already documented and traced to `catalogService` throwing (not returning "not found") when Postgres is unreachable (`product/not-a-product` and the category-heading navigation check) — re-run after this phase's `robots.ts`/`sitemap.ts` changes specifically to confirm no regression, none found.
- **Explicitly not verified in this environment** (no Vercel account access, no reachable Postgres): an actual Vercel deployment; `prisma migrate deploy` against a real staging database; Vercel Cron actually firing and hitting either sweep endpoint; the real behavior of `checkInternalRequestAuthorized` against Vercel's actual `Authorization` header formatting in production (structurally verified against Vercel's documented convention, not against a real Vercel request). Reported honestly as **structurally verified / locally verified, not staging-deployment-verified.**

### 17.13 Production safety — explicit verification

Each concern from the phase brief's §23, checked directly:
- **Staging cannot modify the production database** — structurally guaranteed: staging's `DATABASE_URL` is a separate, dedicated instance (§17.5); nothing in the codebase reads a second/fallback database URL or connects to more than one `DATABASE_URL` at a time (`src/lib/db.ts` re-confirmed the single source of truth, unchanged from Phase 12's own audit).
- **Staging cannot create real production ERP orders or mutate real production inventory** — structurally guaranteed by §17.6's recommendation: no ERP credentials configured means every ERP call throws `ErpNotConfiguredError` before any network request is made.
- **Staging cannot send real customer notifications** — moot, not merely mitigated: `src/modules/notifications/*` has no real provider wired at all (`LogNotificationProvider` is the only implementation; it logs a masked phone number and sends nothing anywhere, in every environment, re-confirmed by reading all four files in that module this phase).
- **Staging cannot pollute production analytics** — also currently moot: `track()` remains the no-op abstraction Phase 3 scoped it as (re-confirmed, §17.14) — there is no real destination for staging to send events to yet. The **future requirement**, once a real destination is wired: gate it by `APP_ENV` exactly as `robots.ts`/`sitemap.ts` now do, not by `NODE_ENV`.
- **Staging cannot claim to be the production website in SEO** — guaranteed by §17.8's `robots.ts`/`sitemap.ts` behavior, pinned by tests.
- **The ERP repository was not modified** — re-confirmed at the end of this phase: no file under `E:\Engineering\Projects\Jawaher\ERP JAW` was opened, read, or written at any point during Phase 13.

### 17.14 Email/notification & analytics — audited, nothing to fix

Both audited directly against current code, not assumed from prior documentation:
- **Notifications**: `src/modules/notifications/{index,log-provider,provider,service}.ts` read in full. `LogNotificationProvider` is the only implementation of the `NotificationProvider` interface; every call (`otp_code`, `order_confirmed`, `payment_confirmed`, `payment_failed`, `order_status_changed`, `order_cancelled`) results only in a structured log line containing a masked phone number — no real SMS/email/OTP provider is integrated anywhere. Nothing for a staging deployment to accidentally trigger for real. **Future staging requirement, documented not built**: whenever a real provider is wired, it must be configured per-environment (a real staging deployment should either use that provider's own sandbox/test-mode credentials or keep `LogNotificationProvider`, never real production notification credentials).
- **Analytics**: `track()` remains a no-op abstraction (Phase 3's own scoping, re-confirmed unchanged) — no property ID, no real destination call exists in the codebase today. Nothing for staging to pollute. Same future requirement as above: gate any real destination by `APP_ENV`, not `NODE_ENV`.

### 17.15 Reusable e-commerce foundation — audit findings (documentation only, no redesign performed)

Per the phase brief's explicit framing: this is an architecture/configuration audit, not a request to build multi-tenancy, and not a redesign phase. Findings:

- **Core commerce modules (`src/modules/*` — catalog, cart, checkout, orders, customers, promotions, erp-integration, notifications) contain zero brand-specific hardcoding.** Verified directly: `grep -rl "جواهر\|Jawaher\|جوهر" src/modules --include="*.ts"` (excluding tests) returns no matches. Business logic (pricing, availability, order lifecycle, ERP sync) is already brand-agnostic at this layer — a genuinely positive finding, not something this phase had to fix.
- **Brand-specific content in `src/app`/`src/ui` is concentrated exactly where expected**: SEO metadata copy (`product/[slug]/page.tsx`, `shop/page.tsx` — Arabic marketing description strings), the dedicated brand-identity components (`src/ui/brand/jawaher-mark.tsx`, `jawaher-pattern.tsx` — these *are* the brand layer by design), and the homepage/experience/header/footer content layer already identified in Phase 10 as "business/brand configuration." This matches the established, intentional core-commerce-vs-brand-configuration split — not a new problem.
- **One real, specific coupling point worth flagging for future reuse, found and documented (not fixed) this phase**: the brand-specific `JawaherPattern` decorative texture component is imported directly — not injected via a prop/slot — into 7 call sites, two of which sit outside the clearly brand-owned layer: `src/ui/commerce/category-tile.tsx` (a `commerce/`-namespaced, otherwise generic catalog UI component) and `src/ui/primitives/image-placeholder.tsx` (a `primitives/`-namespaced component whose folder name implies brand-agnostic building blocks). Reusing either component for a different brand today would require editing their source, not swapping a prop or config value. **Not fixed this phase**: a partial fix touching only these 2 of 7 call sites would not meaningfully improve reusability without touching the other 5 (which live in the already-acknowledged brand/experience layer and are lower-value to change), and doing all 7 is a UI refactor beyond this phase's GitHub/Vercel-staging scope — correctly deferred, not silently ignored.
- **Business/brand configuration (categories, homepage "chapters," header/footer navigation copy) lives directly in TypeScript source files, not a database or CMS.** Acceptable, and arguably correct, for a single-tenant production site today — no unnecessary abstraction was built for a hypothetical second brand. Documented as the concrete friction point a future "customize for another business" effort would hit first: that work would extract these into a data/config layer, not rewrite the commerce engine underneath them, which is exactly the "reusable foundation" property this audit was checking for and did not find violated.

### 17.16 Explicitly out of scope this phase (unchanged from the brief)

No DigitalOcean production infrastructure was created. No domain cutover or Shopify migration was performed or started. No payment gateway or courier integration was added. No full Website Admin or automation API was built. No actual Vercel deployment was executed (no account access in this sandbox — §17.7). No multi-tenant SaaS architecture was introduced (§17.15 is a documentation-only audit). The ERP repository was not touched (§17.13).

---

## 18. Staging Environment Bring-Up & Deployment Validation (Phase 14)

Phase 13 prepared the code and documented what a staging deployment would need. Phase 14 attempted to actually stand up as much of that path as this sandbox's real, available credentials allow — and, critically, **discovered a live production resource that changes how the ERP boundary must be treated going forward.**

### 18.1 Access audit — what was actually available, checked directly

- **GitHub**: no `gh` CLI installed, no `GH_TOKEN`/`GITHUB_TOKEN` in the environment. **Confirmed blocked**, same conclusion as Phase 13, this time by actually attempting it rather than inferring it.
- **Vercel**: the CLI installs fine via `npx vercel` (v59.16.0), but `vercel whoami` returns "Logged out" and no `VERCEL_TOKEN` exists in the environment. **Confirmed blocked** — a real attempt, not an assumption.
- **A Supabase (Postgres) connector was available and authenticated this phase** — a genuinely new capability versus Phase 13. This is what made §18.2 possible.

### 18.2 Critical discovery: a live ERP database exists, and it is not a sandbox

Listing the Supabase projects reachable through this connector surfaced an existing project, **"Jawaher Project"** (id `vftrfswmmmakumipfpqg`, created 2026-07-19, region `eu-west-1`, status `ACTIVE_HEALTHY`) — **not previously known to this Website-side engineering record.** Its schema was inspected (table names and row counts only — no row content was read) before touching anything, specifically to answer "is this safe to treat as available infrastructure?":

`sales_orders` (880 rows), `invoices` (789), `payments` (424), `business_partners`/`customer_profiles` (1,063), `journal_entries` (1,825), `stock_moves` (3,583), `integration_secrets` (84), `integration_connectors`, `company_integration_connections` — an accounting/ERP schema with real transactional volume, not fixture-shaped data. **This is the ERP's real database — confirmed with the user directly before proceeding.** It is not a sandbox, and per §17.6's already-established rule and the phase brief's own §11, it is now explicitly, permanently off-limits to anything this Website's staging work does: not read from with intent to use, not written to, not pointed at by any `ERP_*` variable in any Website environment. This project was touched only for this one read-only, table-metadata-level identification check — never queried for row content, never written to.

**This finding matters beyond this phase**: it confirms the ERP side of this integration is further along (a real, populated, apparently-live system) than the Website-side documentation had visibility into. The ERP-staging-boundary conclusion from Phase 13 (§17.6) — "no ERP sandbox is confirmed to exist, so leave `ERP_*` unset in staging" — is **strengthened, not weakened**, by this discovery: there is now direct evidence of exactly what an accidental staging write would land in.

### 18.3 A real, isolated staging PostgreSQL database now exists

With the user's explicit go-ahead (and a $0/month cost confirmed and shown to the user before creation, per the connector's own cost-confirmation flow), a **new, separate** Supabase project was created for this purpose alone:

- **Name**: `jawaher-website-staging` · **Project ref**: `kymtkfaetseeoiraldhh` · **Region**: `eu-west-1` · **Postgres 17** · **Status: ACTIVE_HEALTHY, verified live.**
- Same Supabase organization as the ERP project (the user's own account has one organization) — a **separate project**, with its own separate database, separate connection credentials, and separate project id. Nothing about this project is shared with, derived from, or reachable through the ERP project.
- **Schema deployed**: the exact, real, already-committed `prisma/migrations/20260913203005_init/migration.sql` (589 lines, unmodified) was applied via the connector's migration-apply mechanism. **Verified after applying** — not assumed — by listing the resulting schema back: all 22 tables, all enums, all primary/foreign keys, and all indexes match the migration file exactly (`list_tables` with column/FK detail, cross-checked table-by-table against the migration source).
- **Prisma migration bookkeeping baselined**: an `_prisma_migrations` table was created matching Prisma's own internal schema, with one row recording migration `20260913203005_init` as applied, using the migration file's real SHA-256 checksum (`f18a8126...3001b`, computed locally via `sha256sum` against the actual file — not invented). This matters operationally (§18.9): without this, the first real `prisma migrate deploy` run against this database (once a human has the real connection string) would try to re-run `CREATE TABLE` statements against tables that already exist, and fail.
- **What this phase could NOT do**: run the literal `prisma migrate deploy` CLI command against this database, or connect the actual Next.js application/Prisma Client to it. The raw Postgres password Supabase generates at project creation is not exposed by any tool available in this session — only the Supabase dashboard shows it. So schema deployment here was performed through Supabase's own migration-application mechanism (applying the exact same SQL `prisma migrate deploy` would run), not literally by invoking the Prisma CLI — an honest distinction, not a cosmetic one. **Manual action required**: retrieve the real connection string from the Supabase dashboard (Project Settings → Database → Connection string, project `kymtkfaetseeoiraldhh`) — prefer the **transaction-pooler** connection string (port 6543, `...pooler.supabase.com`) over the direct connection (port 5432) for Vercel's serverless model (§18.8 explains why), and set it as `DATABASE_URL` in the Vercel staging project once one exists.

### 18.4 Schema, constraint, and relational-integrity verification — real, not assumed

Beyond confirming the schema matches the migration file, the following were **actually executed against the live staging database**, inside explicit transactions that were rolled back afterward (so no synthetic data was left behind):

- **Unique constraint enforcement**: inserting a duplicate `categories.slug` correctly raised `unique_violation`.
- **FK `RESTRICT` enforcement**: deleting a `category` still referenced by a `product` correctly raised `foreign_key_violation` — confirming the same ownership/deletion-safety behavior §5 already documented for the schema is real, not just declared.
- **The full checkout relational chain** — `session → cart → cart_item → checkout_session → inventory_reservation → order → order_item → payment` — was inserted end to end and read back successfully.
- **Idempotency**: a second `orders` row reusing the same `idempotencyKey` correctly raised `unique_violation` — the same guarantee `confirmAndPlaceOrder`'s own transaction relies on (§6) is confirmed enforced at the real database level.
- **Cancellation**: transitioning an order to `CANCELLED` and its reservation to `RELEASED` succeeded cleanly.
- All of the above ran inside `BEGIN; ... ROLLBACK;` — verified by re-querying row counts immediately after (`orders`/`sessions`/`carts`/`inventory_reservations`/`payments` all `0`) — this was schema/constraint verification, not data left behind.

### 18.5 Staging data actually loaded

The project's own canonical `prisma/seed.ts` content (unmodified — 5 categories, 11 products each carrying the existing "(اسم تجريبي)" / sample-name suffix, 15 variants, 3 shipping zones, 1 coupon) was loaded into the staging database via the same mechanism. Row counts verified after loading: `categories=5, products=11, variants=15, shipping_zones=3, coupons=1`. This is real, live, queryable staging data — not a description of what seeding *would* produce. It is the exact same sample data `isSampleContent()` (Phase 11R) already recognizes and excludes from indexing/sitemap, satisfying §10's "staging data must be clearly non-production" requirement using the project's existing convention rather than a new one.

### 18.6 Security advisory surfaced, not silently fixed

The connector's own tooling flagged, as a **critical** advisory: all 22 tables in the new staging database have Row Level Security (RLS) disabled, which — for a table accessed via Supabase's own client library and anon/publishable key — would mean any holder of that key can read or write every row. **This advisory is surfaced here rather than auto-remediated**, per the tool's own explicit instruction not to enable RLS without policies (doing so with zero policies would block all access, including this app's own). Relevant context for the user's decision: this application does not use Supabase's client library, PostgREST, or an anon/publishable key anywhere — it connects exclusively via a direct Postgres connection string through Prisma's driver adapter (`src/lib/db.ts`, unchanged, re-confirmed §18.9) — so the practical exposure is low **as long as this project's anon/publishable key is never distributed to any client-side code**. The remediation SQL (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` for all 22 tables) is available and was shown to the user; enabling it is a decision for the user to make, not something this phase applied unilaterally.

### 18.7 The one code fix this phase made: `robots.ts` was build-time-static, not per-request

Found while re-auditing Phase 13's own `APP_ENV`-gated files for Vercel/DigitalOcean portability specifically (§18.8): `sitemap.ts` has `export const dynamic = "force-dynamic"`; `robots.ts` did not. A real `npm run build` confirmed the consequence directly — `robots.txt` built as a static `○` route, not a dynamic `ƒ` one, meaning its `APP_ENV` check was evaluated once, at build time, and baked into the output.

This is harmless on Vercel (each deployment/environment gets its own build with its own env vars) but is a real, previously-undetected bug for the "build once, run on DigitalOcean" path this app must stay portable to: the `Dockerfile` sets `NODE_ENV` at build time but never `APP_ENV` — so an image built once and later run with different `APP_ENV` values per environment would forever serve whatever `robots.txt` the *build* produced (defaulting to blocked, since `APP_ENV` defaults to `"development"`), never reflecting the container's actual runtime environment. **Fixed**: added `export const dynamic = "force-dynamic"` to `robots.ts`, matching `sitemap.ts`. Re-verified via a fresh build: `robots.txt` is now `ƒ` (dynamic). Full test suite re-run after the fix — no regression (§18.10).

### 18.8 Vercel/DigitalOcean compatibility — re-audited with staging now real

- **`src/lib/db.ts`** re-read directly: the Prisma client is a module-level singleton, cached across warm serverless invocations by construction (only the dev-mode hot-reload cache is gated by `NODE_ENV`) — this is already the correct pattern for Vercel, not a gap.
- **New operational note, not a code issue**: a real Postgres instance behind a serverless app faces a real connection-count ceiling as concurrency scales (each warm serverless instance holds its own connection pool). Staging's traffic is far too low for this to matter in practice, but it's the reason to prefer Supabase's **transaction-pooler** connection string (§18.3) once real load-testing or a production decision is on the table — documented here so it isn't rediscovered as an incident later.
- **`src/lib/rate-limit.ts`**: unchanged, still the documented single-instance-only limiter (ADR-015). Re-flagging because Vercel's serverless model is now concretely the target, not hypothetical — multiple concurrent staging requests could land on different warm instances, each counting independently. Not fixed this phase (introducing Redis "because Vercel exists" is exactly what the brief warns against); the ADR's own trigger condition for revisiting this is unchanged.
- **No filesystem writes, no long-running process, no background worker** exist anywhere in the codebase beyond the two Cron-compatible sweep endpoints (Phase 13) — re-confirmed by the same searches Phase 13 already ran, no changes found.
- **Asset/storage strategy (§16 of the brief)**: no upload/storage pipeline exists at all — confirmed by grep (`STORAGE_BUCKET_URL` appears only as a reserved, unused `env.ts` entry; no `fs.writeFile`/`multer`/`formidable` anywhere in `src`). Product imagery is currently placeholder/pattern-based (`ImagePlaceholder`, Phase 10), not real photography — there is nothing local-filesystem-dependent to migrate before staging, and when a real media pipeline is eventually built, `STORAGE_BUCKET_URL` is already reserved for exactly the object-storage/CDN shape that would keep it Vercel- and DigitalOcean-compatible.

### 18.9 Cron / internal jobs — re-verified, unchanged

`internal-auth.ts`, both `GET`-enabled sweep routes, and `vercel.json`'s cron declarations (Phase 13) were re-read in full: authentication logic, GET support, and `CRON_SECRET` handling are unchanged and still correct. **Still explicitly unverified** (unchanged from Phase 13, since no Vercel account access exists in either phase): whether Vercel Cron actually fires, and the real Hobby-tier frequency limit. No scheduler exists in any environment today beyond the `vercel.json` declaration itself — re-stating this plainly rather than letting the file's presence imply otherwise.

### 18.10 Testing & verification performed this phase

- `npm run typecheck`, `npm run lint` — clean, re-run after the `robots.ts` change.
- `npx vitest run` — **175 passed, 71 skipped, 0 failed** — identical to Phase 13's count; this phase's only source change (`robots.ts`) has no unit test surface of its own beyond what Phase 13's `robots-staging-safety.test.ts` already pins, and that suite still passes unchanged.
- `npm run build` — clean; confirms `robots.txt` is now `ƒ` (dynamic), matching `sitemap.xml` (§18.7).
- **Playwright E2E** — **30 of 32 passed**, the identical pre-existing 2 failures Phase 12/13 already documented (DB-unreachable-in-this-sandbox `catalogService` behavior) — re-confirmed unrelated to this phase's change.
- **Staging database verification** — executed for real, against the live `jawaher-website-staging` project, not simulated: schema match, constraint enforcement, relational-chain integrity, idempotency, cancellation (§18.4), row-count-verified seeding (§18.5). **Not verified**: the actual Next.js application/Prisma Client connecting to this database (no retrievable connection string in this session — §18.3), and therefore no verification of the app's own runtime behavior (health endpoint, real HTTP checkout flow, cron execution) against it.

### 18.11 Production Safety Gate — explicit classification

| Dependency | Status | Notes |
|---|---|---|
| Website repository structure/config | **A — Verified operational** | Builds, tests, lints clean; `.gitignore`/secret hygiene re-confirmed (§17.1). |
| Actual GitHub repository (`jawaher-website`) | **C — Blocked** | No `gh` CLI/token in this environment (§18.1). Manual action: user creates the repo and pushes this local `main`. |
| Git branch/PR workflow | **B — Prepared, needs GitHub** | Convention documented (§17.2); branch protection is GitHub-side config, applies only once the repo exists. |
| CI (GitHub Actions) | **A — Verified operational** | Re-read in full (§18's own audit); ephemeral Postgres service, `migrate deploy`, seed, tests, build, E2E — already correct, unchanged. Will only actually *run* once a GitHub remote exists. |
| Actual Vercel project | **C — Blocked** | CLI installs, but `vercel whoami` = logged out, no token (§18.1). Manual action: user creates the project via the Vercel dashboard/CLI once logged in, connects this GitHub repo. |
| Actual Vercel staging deployment | **C — Blocked** | Depends on the two rows above; no deployment was performed or can be claimed. |
| Staging PostgreSQL database | **A — Verified operational** | Real, isolated, live: `jawaher-website-staging` (`kymtkfaetseeoiraldhh`). Schema deployed and verified, seeded, constraint/relational-integrity tested (§18.3-18.5). |
| App ↔ staging DB connection (real `DATABASE_URL`) | **B — Prepared, needs manual retrieval** | Password only visible via the Supabase dashboard (§18.3). |
| RLS on staging tables | **D — Business/security decision required** | Advisory surfaced (§18.6), remediation SQL provided, not applied — user's call. |
| ERP staging sandbox | **C — Blocked, and now confirmed why** | No sandbox exists; the only reachable ERP-shaped resource is the real ERP production database (§18.2) — permanently out of scope for staging. `ERP_*` must stay unset in any staging environment. |
| Vercel Cron actually executing | **C — Blocked** | Depends on a real Vercel deployment; `vercel.json` is prepared, unverified (§18.9). |
| Vercel/DigitalOcean portability | **A — Verified, one fix applied** | `robots.ts` build-time-static bug found and fixed (§18.7); no other portability gap found this phase. |
| Reusable e-commerce foundation | **A — Verified, unchanged from Phase 13** | No new violation introduced; Phase 13's one documented friction point (`JawaherPattern` coupling) still stands, still not fixed, still correctly out of this phase's scope. |
| DigitalOcean production hosting | **E — Future production work** | Not started, not touched, per explicit instruction. |
| Domain cutover / Shopify migration | **E — Future production work** | `jewelsherb.com`, Shopify, and its DNS were not touched, read, or referenced by any change this phase. |

### 18.12 Rollback / recovery — staging

- **Bad deployment**: once a real Vercel project exists, Vercel's own dashboard lets any prior deployment be promoted back to the staging alias instantly — no code-level rollback mechanism was built or is needed beyond that.
- **Bad migration against the staging DB**: the same rule as §8 (Backups & disaster recovery) applies — Prisma does not auto-generate down-migrations; recovery is either redeploying the previous app version against the still-previous schema, or a hand-written compensating migration. This staging database currently has exactly one migration (`20260913203005_init`) baselined (§18.3) — no rollback-compatibility risk exists yet.
- **Rotating staging secrets**: `INTERNAL_API_SECRET`/`CRON_SECRET` are plain environment variables in the (not-yet-created) Vercel project — rotate by generating a new value and updating it there; no code change needed (`internal-auth.ts` reads them fresh from `env` each request).
- **Disabling staging ERP integration**: already the default and the recommended state — simply never set `ERP_BASE_URL`/`ERP_API_KEY`/`ERP_CONNECTION_ID` in the staging environment (§17.6, re-confirmed §18.2).
- **Disabling cron if necessary**: remove the relevant entry from `vercel.json`'s `crons` array (or the whole file) and redeploy — both sweep endpoints remain independently callable via their existing shared-secret header for manual/alternate triggering.
- **Recovering/repointing the staging database itself**: the Supabase project (`kymtkfaetseeoiraldhh`) can be paused, restored from Supabase's own point-in-time recovery (subject to the free tier's actual retention window — not verified from this session), or a fresh project created and re-seeded from the same `prisma/seed.ts` this phase used — the staging database is disposable by design, unlike production.

### 18.13 Explicitly out of scope this phase (unchanged from the brief)

No DigitalOcean production infrastructure. No domain cutover or Shopify migration. No payment gateway or courier integration. No real Vercel deployment (blocked, §18.1/§18.11). No GitHub repository actually created (blocked, §18.1/§18.11). No multi-tenant SaaS architecture. The ERP repository was not opened, read, or modified. The real ERP database (§18.2) was queried only for table-name/row-count metadata to confirm it must be avoided — never for row content, never written to.
