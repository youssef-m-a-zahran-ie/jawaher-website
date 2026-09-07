# Jawaher Al Khair — Technical Decision Log & Consistency Check

Records what this stage confirmed, recommended, left open, or deferred, plus the results of cross-checking [`technical-architecture.md`](./technical-architecture.md), [`module-boundaries.md`](./module-boundaries.md), and [`data-ownership.md`](./data-ownership.md) against every prior canonical document. Mirrors the pattern established in [`../ux/ux-decisions.md`](../ux/ux-decisions.md).

Status: **Stage 0.9, extended in Phase 1, Phase 2, Phase 3, and Phase 4.** Last updated: 2026-09-07.

---

## A. Decisions confirmed by existing documentation

Not re-decided here — restated only to show this stage did not silently contradict them.

- Website ↔ ERP direct integration; Shopify is migration-only (ADR-001/002).
- ERP is authoritative for ERP-owned business facts; the website database is not a duplicate ERP (ADR-003/004).
- Catalog projection is read-optimized, never authoritative; ERP always wins on conflict (ADR-005).
- Website owns customer identity via phone/OTP; guest checkout is mandatory (ADR-006/007).
- Orders split into Website Order + ERP Order Reference (ADR-008).
- Payment, Shipping, and ERP each sit behind a dedicated adapter; no provider is hard-coded (ADR-009/010/011).
- Analytics is a one-way, non-blocking `track()` abstraction (ADR-012).
- Modular monolith first, 14 approved modules (ADR-013).
- Frontend never directly accesses the database, ERP, or any external provider (ADR-014).
- Redis and background jobs are conditional, not introduced by default (ADR-015/016).
- Canvas/WebGL is deferred (ADR-017).
- Development proceeds in phased, reviewed gates (ADR-018).
- Single accordion checkout, load-more pagination, no hero carousel, and the other UX-authority decisions in `ux-decisions.md` §A.

## B. Technical decisions recommended in this stage

Engineering-judgment calls made now because the architecture needed *some* answer to proceed — reversible with a documented reason, not blocked on business input:

- **Sub-domain grouping, not new modules:** Search and Recommendations live inside Catalog; Authentication lives inside Customers — the 14 approved top-level modules are preserved (`module-boundaries.md` §1).
- **ORM:** Prisma, with Drizzle noted as a credible lighter-weight alternative if query-performance control becomes important later (`technical-architecture.md` §1).
- **Validation library:** zod, at every API boundary.
- **Testing tools:** Vitest (unit/domain) + Playwright (E2E).
- **API style:** REST-shaped, URL-versioned (`/api/v1/...`), not GraphQL.
- **Money representation:** integer minor units (piasters), never floating point.
- **Phone representation:** normalized to E.164 for storage; local formats accepted as input.
- **Identifiers:** UUID primary keys for website-owned entities; ERP ids stored as separate reference columns, never reused as primary keys.
- **Order numbering:** a UUID primary key plus a separate short human-readable order number for customer/support use.
- **Search MVP:** PostgreSQL `pg_trgm` + a manual Arabic synonym table — no external search engine yet, with an explicit size/relevance trigger for revisiting.
- **Background jobs MVP:** scheduled-task + dead-letter pattern, no queue infrastructure, with explicit triggers for introducing one later.
- **Caching MVP:** ISR/CDN + per-request in-process memoization only; no shared cache layer.
- **COD as a first-class Payment Adapter state**, not an exception carved out of the payment abstraction.
- **Repository structure:** a single Next.js-centric modular monolith (`src/modules/*`), not an `apps/`+`packages/` monorepo, given current team/project scale.

## C. Decisions still requiring explicit project approval

Unchanged from `../requirements/website-functional-requirements.md` §25 and `../ux/ux-decisions.md` §B — this stage introduces no new business-facing open questions, only confirms that nothing here silently resolves them:

**Critical:** guest checkout OTP requirement · subcategory/type attributes per category · COD approval · delivery zones/fees · minimum order value.

**Important:** testimonials/reviews availability · Arabic vs. transliterated URL slugs · session/login duration · marketing consent timing · mobile bottom navigation.

**Optional:** future Buy Now · future restock notifications · future native mobile app.

**Also still open, ERP/vendor-shaped (from ADR open-decisions list):** ERP API protocol/documentation/sandbox access · payment gateway(s) · courier/shipping provider(s) · OTP/authentication provider · analytics provider confirmation (GA4 assumed) · WhatsApp integration depth · notification (SMS/email) provider.

## D. Decisions intentionally deferred

Not decided now, on purpose, with the condition that would trigger revisiting each:

| Deferred | Trigger to revisit |
|---|---|
| Redis (shared cache/session store) | Session/cart/catalog reads need cross-instance consistency under real concurrent load |
| Background job queue | Retries must survive a process restart, or sync/notification volume outgrows synchronous handling |
| Dedicated search engine | Catalog size or relevance needs outgrow Postgres trigram search |
| Canvas/WebGL | A specific Products Experience beat genuinely fails with GSAP/Lottie/photography |
| Microservice extraction | Team size or independent-scaling needs justify splitting a module out of the monolith |
| Database read replicas/sharding | Read load or dataset size measurably exceeds a single instance's capacity |
| Blue-green/zero-downtime deploys | Uptime-during-deploy becomes a measured business requirement |
| Bot-mitigation service | Observed abuse volume on auth/checkout endpoints |
| Full headless CMS | The content-editing workflow genuinely outgrows direct database-backed editing |

---

## Consistency check

Performed against `blueprint.md`, `architecture-decisions.md`, `website-functional-requirements.md`, `ux-specification.md`, `customer-journeys.md`, and `ux-decisions.md`.

### Findings

1. **Module count vs. this stage's finer-grained list — reconciled, not a conflict.** Section 6 of the Stage 0.9 brief listed Categories/Products/Variants/Pricing/Inventory Projection/Authentication/Search/Recommendations as if they might be independent modules. This would have expanded the approved 14-module map (blueprint §4 / ADR-013) without authorization. Resolved by treating all eight as sub-domains of existing modules (§B above, `module-boundaries.md` §1) — no module-count expansion occurred.

2. **Analytics event taxonomy gap — already documented, not newly discovered.** `ux-decisions.md` finding 2 already flagged that `blueprint.md` §14 lacks the full event list. This stage's `technical-architecture.md` §17 does not attempt to close that gap either — it explicitly defers it to the Analytics phase again, avoiding two documents each partially inventing the same missing taxonomy.

3. **Mobile bottom navigation — carried forward unchanged.** Still an open product decision (`ux-decisions.md` finding 1); nothing in this stage's technical work depends on its outcome, since it is a Storefront-layer navigation choice with no data or module-boundary implication.

4. **No architecture violations found.** Every technical specification in this stage routes through the approved adapters (ERP/Payment/Shipping/Notifications) and respects the frontend/API/database boundary (ADR-014). No module was given a prohibited dependency (`module-boundaries.md` §3 lists none observed, only rules to prevent future ones).

5. **No MVP creep found.** `technical-architecture.md` introduces no feature beyond what `website-functional-requirements.md` §22/§23 already scoped for launch — it only specifies *how* to build what was already scoped (e.g. COD-as-adapter-state is an implementation detail of an already-approved requirement, not a new feature).

6. **One technical assumption flagged as such, not silently treated as fact:** the ORM choice (Prisma) and the testing tool choice (Vitest/Playwright) are recommendations (§B), not architecture-approved facts — they are named with alternatives on record specifically so a future engineer can challenge them without re-opening the surrounding architecture.

7. **No missing dependencies found** in the module dependency-direction model (`module-boundaries.md` §2) — every module that needs an adapter has one, and no orchestration-layer module (Checkout/Orders) is missing a path to a module it needs (Cart, Customers, Catalog, Promotions, Payments, Shipping, ERP Integration, Notifications).

8. **No missing failure handling found** for the flows named in the Stage 0.9 brief — sync failure, ERP push failure, payment failure, webhook verification failure, session expiration, OTP failure, and order-creation race conditions are each given an explicit behavior in `technical-architecture.md` (§3, §4, §5, §10, §22).

### Outcome

No blocking conflicts. One structural risk (module-count expansion) was caught and resolved during this stage rather than after; both pre-existing findings from `ux-decisions.md` remain correctly unresolved, as intended.

---

## Final quality gate

A future engineer should be able to answer all twelve questions from documentation alone:

| # | Question | Where it's answered |
|---|---|---|
| 1 | Where does this code belong? | `technical-architecture.md` §2 (repository structure) |
| 2 | Which module owns this behavior? | `module-boundaries.md` §1 |
| 3 | Which database boundary does it use? | `technical-architecture.md` §13, `data-ownership.md` §2 |
| 4 | Which system owns this data? | `data-ownership.md` §2 (source-of-truth column) |
| 5 | Which external system is accessed through which adapter? | `technical-architecture.md` §4/§5/§6/§18 |
| 6 | What happens if the external system fails? | Same sections' "failure handling" rows, plus §30 risk register |
| 7 | How is the operation made idempotent? | `technical-architecture.md` §9/§10/§11 |
| 8 | How is the customer authenticated? | `technical-architecture.md` §7 |
| 9 | How is the request validated? | `technical-architecture.md` §11/§12 |
| 10 | How is the operation tested? | `technical-architecture.md` §24 |
| 11 | How is sensitive data protected? | `technical-architecture.md` §12/§21/§26/§27 |
| 12 | How does this scale? | `technical-architecture.md` §28 |

No gaps identified against this checklist.

---

## Phase 1 — Repository & Development Foundation (2026-09-07)

Implementation findings that refine, rather than contradict, the decisions above.

### Adopted (§B recommendations, now actually built and verified)

- **Prisma 7.10.0**, deliberately pinned instead of the `latest` npm dist-tag, which currently resolves to `8.0.0-rc.13` — a release candidate. Building foundation on an RC would repeat exactly the kind of premature-commitment mistake this phase was asked to avoid. Revisit once Prisma 8 reaches a real stable release.
- **Prisma 7 requires a driver adapter at runtime** — this is a genuine breaking change from earlier Prisma versions (the `datasource { url = env(...) }` pattern in `schema.prisma` is no longer valid; connection config now lives in `prisma.config.ts` for the CLI, and `PrismaClient` requires an explicit `adapter` — `@prisma/adapter-pg` here). Documented so a future engineer isn't caught by it. See `src/lib/db.ts` and `prisma/schema.prisma`'s comments.
- **zod v4**, **Vitest 5**, **Playwright** — all installed and exercised by real, passing tests (`npm test`, `npm run test:e2e`).
- **Package manager: npm** (ships with Node, no additional tooling to install; no monorepo-shaped reason to prefer pnpm/yarn given the single-app repository structure already decided in `technical-architecture.md` §2).
- **Logger: pino**, with field-level redaction (OTP, password, tokens, cookies, card data) configured at the transport level per §21/§27 — not left to individual call sites to remember.
- **CI: GitHub Actions**, including a real Postgres service container, *designed* to exercise the health check's database path for real (not just its degraded path, which is all that could be verified in this development sandbox — see below) — whether it actually does is unconfirmed, since no run of this workflow has been observed (see the Phase 4 review note below).

### New finding: CSP nonces vs. the approved caching strategy

Next.js's recommended strict CSP approach (nonce-based, generated per-request in `proxy.ts`) **forces every page into dynamic rendering**, which would silently undermine the ISR/SSG caching strategy already approved in `technical-architecture.md` §20 for Home/Category/PDP/About. This is exactly the kind of contradiction this phase was told to surface rather than resolve unilaterally by picking the stricter security option. **Resolution:** Phase 1 uses a static CSP (via `next.config.ts` `headers()`, `'unsafe-inline'` for scripts/styles) that's compatible with static rendering, and documents the nonce-based alternative as a per-route option to revisit once genuinely dynamic-only pages (checkout, account) are built. This is a real engineering trade-off, recorded rather than silently chosen.

### Environment limitations honestly disclosed

This development sandbox has no Docker and no locally installed PostgreSQL. Consequently:
- `docker-compose.yml` and `Dockerfile` are written to the same conventions used throughout `technical-architecture.md` but could not be executed/tested here.
- The health check's **degraded** path (database unreachable) was verified for real, live, against a running production build.
- The health check's **healthy** path (database reachable) could not be verified in this sandbox. `.github/workflows/ci.yml` runs a real Postgres service container and is *designed* to exercise this path — but no push has ever triggered it (this repository has no `git remote` configured) and no run has actually been observed, corrected in Phase 4's review pass after the same overclaim was found and fixed there; treat this path as reasoned-about, not proven, until a real CI run is confirmed.
- No Prisma migration exists yet (deliberately — `prisma/schema.prisma` has no models per this phase's scope), so nothing here depended on `prisma migrate` succeeding against a live database.

### Consistency check addendum

- **EGP vs. Saudi Riyal** — resolved this phase by direct business input, not by the engineering guess `docs/design/design-decisions.md` §C had flagged it as. See that document's updated §C entry and `src/domain/money.ts`.
- **No new module-count or architecture-boundary violations** were introduced by any Phase 1 code — `src/modules/` was not touched at all (Phase 1 is deliberately pre-domain-model; only `src/lib/`, `src/domain/money.ts`, and `src/app/api/v1/health` exist), consistent with `feature-completeness-audit.md`'s framing that Phase 1 precedes the domain model, not the other way around.
- See `../planning/feature-completeness-audit.md` for the full production-readiness gap audit performed as part of this phase (nine new findings, none blocking Phase 1 itself).

---

## Phase 2 — Brand + Design System + UX Implementation Foundation (2026-09-07)

Implementation findings from turning the approved brand/UX/design docs into real tokens and UI primitives (`src/app/globals.css`, `src/ui/primitives/`, `src/ui/commerce/`).

### Adopted (new dependencies, with rationale)

- **`lucide-react`** — the icon set. Resolves the open item in `../design/design-decisions.md` §C via the implementation-time-choice path that item always allowed; see that document for the reasoning.
- **`clsx` + `tailwind-merge`** (composed as `cn()` in `src/lib/cn.ts`) — the standard pattern for conditionally-composed Tailwind class strings that correctly resolves conflicting utilities (e.g. a caller overriding a default padding) instead of silently concatenating both. Small, single-purpose, no runtime beyond string handling.
- No other runtime dependency was added. Testing/tooling deps already present from Phase 1 (Vitest, Playwright) were reused, not duplicated.

### New finding: Tailwind v4's actual `@theme` namespace surface (verified, not assumed)

Read directly from `node_modules/tailwindcss/theme.css` rather than relied on from training memory, since Tailwind v4's CSS-first config is a large enough change from v3 that guessing would be risky. Utility-generating namespaces actually used: `--color-*`, `--font-*`, `--text-*` (each paired with an optional `--text-{name}--line-height`), `--font-weight-*`, `--radius-*`, `--shadow-*`, `--breakpoint-*`, `--container-*`, `--spacing`, `--ease-*`. **Not** namespaced (no utility is generated from them): z-index and animation/transition duration. `globals.css` therefore defines `--z-dropdown/sticky/drawer/modal/toast/tooltip` and relies on Tailwind's built-in `duration-*` utilities instead of inventing a duration token namespace — consumed via arbitrary-value syntax (`z-[var(--z-modal)]`) where a plain utility doesn't exist. Recorded so a future engineer doesn't waste time defining a `--duration-*` or `--z-*` block under `@theme` expecting it to generate utilities — it won't.

### New finding: native `<dialog>` for Modal and Drawer

Both use the native `<dialog>` element (`showModal()`/`close()`) rather than a hand-rolled focus-trap/portal implementation — it provides correct focus trapping, Escape-to-close, top-layer stacking above the `--z-*` scale entirely, and a `::backdrop` pseudo-element for free, verified against real accessibility expectations rather than reimplemented. Drawer's slide-in entrance uses the `@starting-style` CSS at-rule (not yet in every browser) to animate from `display: none`; unsupported browsers simply skip the entrance animation and the dialog still opens correctly — a graceful degradation, not a broken one.

### New finding: a real CSS-comment-parsing gotcha, worth guarding against in review

A `globals.css` comment describing "Tailwind's default rounded-\*/shadow-\* scale" broke the entire stylesheet build, because the character sequence `-*/` contains CSS's own comment-close token (`*/`), silently truncating the comment early and leaving the rest of the file interpreted as raw (invalid) CSS. Root-caused via binary-search bisection rather than guesswork. Fixed by rewording the comment; recorded here because the same trap will recur for any future comment that mentions a wildcard-suffixed utility name (`rounded-*`, `text-*`, etc.) immediately followed by a slash — worth a second glance in review rather than a lint rule, since it's a narrow, easily-worded-around case.

### New finding: Server/Client Component boundary convention

No convention for this existed in writing before Phase 2 needed one. Established and followed throughout `src/ui/primitives/` and `src/ui/commerce/`: a component is a plain (Server) component by default, and only declares `"use client"` when it genuinely owns interactive state or an effect (`Accordion`, `Modal`, `Drawer`, `Toast`, `QuantityControl`, and the dev-showcase's interactive island). Components that merely accept event-handler props (`Button`, `IconButton`, `ProductCard`'s `onQuickAdd`) stay server components — they render fine as long as they're mounted from within an already-client-rendered subtree, and forcing `"use client"` on them would needlessly shrink the server-rendered portion of every future page. Worth stating explicitly since it's easy to over-apply `"use client"` defensively.

### Consistency check addendum (Phase 2)

- See `../design/design-decisions.md`'s Phase 2 section and `../ux/ux-decisions.md`'s Phase 2 section for the UX-consistency and design-consistency checks; see `../planning/feature-completeness-audit.md`'s Phase 2 section for the frontend-implication check against future commerce features.
- **No new module-boundary violations.** `src/modules/` remains untouched — Phase 2 is presentation-layer (tokens + primitives) only, consistent with `module-boundaries.md`'s rule that Storefront/Content never own business data. `src/ui/commerce/mock-products.ts` is explicitly documented as sample data, isolated to the dev showcase, and never imported by a real route.
- **No environment limitations beyond Phase 1's** (still no Docker/Postgres in this sandbox) — irrelevant to this phase's scope, since no database code was touched.

---

## Phase 3 — Customer-Facing Website Core (2026-09-07)

Three genuine framework-behavior discoveries this phase, each verified empirically (this project's established discipline) rather than assumed — recorded here so a later phase doesn't rediscover them the hard way. Full context for each also lives in `../planning/feature-completeness-audit.md`'s Phase 3 "New findings" section.

### Finding: class instances (e.g. `Money`) cannot cross a Server→Client prop boundary

React/Next.js only allows plain objects (and a short allow-list of built-ins) as props flowing from a Server Component into a `"use client"` component — a class instance with a private constructor, like `Money`, fails this and fails the *build*, not just a lint rule (`next build` errors: "Only plain objects... Classes... are not supported"). This is a real constraint on the whole `ProductCardData`-shaped commerce layer, not a one-off bug:

- **Rule going forward:** a client component that needs data derived from a `ProductCardData` (or anything else carrying a domain value object) must receive only plain primitives as props (id/name/category strings, etc.) — never the object itself. `src/ui/commerce/quick-add-button.tsx` and `(storefront)/product/[slug]/product-actions.tsx` are the reference implementations.
- **Why Phase 2 never hit this:** the dev showcase (`src/app/dev/design-system/showcase-interactive.tsx`) is itself one big `"use client"` file that *imports* `MOCK_PRODUCTS` directly — a client-side module import, not a prop crossing a Server→Client boundary. The bug was latent until Phase 3's real Server Component pages rendered the same components for the first time.
- **Consequence for `ProductCard`/`ProductGrid`:** both are now plain server-renderable components again — `ProductCard` self-contains its quick-add interactivity via the small `QuickAddButton` island instead of taking an `onQuickAdd` callback prop. This is a strictly better shape (smaller client surface, one fewer prop for every call site), not just a workaround.

### Finding: `notFound()` is a "soft 404" (200 + `noindex`) under a `loading.tsx` ancestor — documented Next.js 16 behavior

`notFound()`'s own bundled docs (`node_modules/next/dist/docs/.../functions/not-found.md`) state the mechanism directly: a `loading.tsx` creates an implicit Suspense boundary; its fallback streams as an immediate `200`; the HTTP status can no longer change once a call inside that boundary later throws `notFound()`. Next.js's own mitigation is injecting `<meta name="robots" content="noindex">` so the page is still excluded from indexing despite the 200. Discovered because `/shop/[category]`, `/product/[slug]`, `/policies/[slug]`, and the dev-showcase guard all returned 200 for invalid params — reproduced identically in `next dev`, ruling out a production-only or caching-layer cause before looking at the docs.

- **Root cause in this codebase:** `src/app/loading.tsx` (root) and `(storefront)/shop/loading.tsx` — both added this phase to satisfy the "loading states" requirement — are the Suspense-boundary ancestors responsible.
- **Resolution:** kept the `loading.tsx` files (a real, requested feature) and the `notFound()` calls (still the semantically correct API — it does render the right UI and does set `noindex`). Tests (`tests/e2e/not-found.spec.ts`, `tests/e2e/design-system-showcase.spec.ts`) were written against the actual guarantee — correct branded UI renders, `noindex` present, real page content never ships — rather than a literal status-code assertion that would fight documented framework behavior.
- **If a hard 404 status is ever a real requirement** (e.g. a strict external SEO audit), the docs' own recommended fix is to do the existence check in `proxy.ts` before any streaming starts, trading a small amount of duplicated slug-validation logic for a literal status code. Not implemented now — the noindex mitigation already satisfies every actual SEO/UX concern.

### Finding: `next start` does not serve an `output: "standalone"` build correctly — a pre-existing Phase 1 gap, not a Phase 3 regression

`next start` prints "does not work with `output: standalone` configuration. Use `node .next/standalone/server.js` instead" and doesn't serve the app as built. `next.config.ts`'s `output: "standalone"` was set in Phase 1 for the Dockerfile; `playwright.config.ts`'s `webServer` has used `npm run build && npm run start` since Phase 1 — meaning every E2E run's server was subtly wrong the whole time, just not in a way Phase 1/2's specific assertions happened to expose.

- **Fix:** `scripts/prepare-standalone.mjs` (Node `fs.cpSync`, not shell `cp`, so it runs identically on Windows/Linux/CI) copies `.next/static` and `public/` into `.next/standalone/`, matching exactly what the Dockerfile already did correctly. `playwright.config.ts` now runs `npm run build && node scripts/prepare-standalone.mjs && node .next/standalone/server.js`. The root README's documented Windows/Git-Bash manual-workaround steps were updated to match.
- No `next.config.ts` change was made — `output: "standalone"` itself is correct and still the right choice for the Dockerfile; the bug was in how it was being *tested*, not in the config.

### Other Phase 3 decisions

- **Route structure follows `technical-architecture.md` §2 exactly**: `src/app/(storefront)/` (Home, Shop, Category, PDP, Search, About, Contact, Policies), `src/app/(account)/account/` — the first code to actually populate these previously-empty route groups.
- **Category URL slugs** (`dates`/`honey`/`oils`/`nuts`/`ghee`) implement the "transliterated Latin slug" option `website-functional-requirements.md` §25/SEO-003 already recommended but left unconfirmed — a working default, not a final business decision (see `../ux/ux-decisions.md`'s Phase 3 section and `src/ui/commerce/categories.ts`'s own comment). Swapping slug style later touches one file and route folder names, not any component contract.
- **`track(event, params)` implemented** exactly per `blueprint.md` §14's signature (`src/lib/analytics.ts`) — console-only in dev, no GA4/GTM destination wired yet, per this phase's explicit instruction not to integrate one. Every future analytics-provider integration has exactly one call site to change.
- **Contact form backed by a real API route** (`src/app/api/v1/contact/route.ts`) that validates (zod), rate-limits (`src/lib/rate-limit.ts`), and logs (`src/lib/logger.ts`) — not yet connected to a human notification channel (email/SMS is the Notifications module's job, a later phase). Chosen over a fake-success or non-functional form specifically to avoid either lying to a real visitor or shipping a dead page.
- **`ProductCard`'s PDP link fixed** from `/products/[slug]` (plural, a latent Phase 2 typo never exercised until a real `/product` route existed) to `/product/[slug]` (singular, this phase's canonical route).

### Consistency check addendum (Phase 3)

- See `../planning/feature-completeness-audit.md`'s Phase 3 pre-implementation audit and `../ux/ux-decisions.md`'s Phase 3 section.
- **No new module-boundary violations.** `src/modules/` remains untouched. The one new server-side write path (`api/v1/contact`) doesn't import Prisma/ERP/payment/shipping — logging only.
- **No environment limitations beyond Phase 1's.**

---

## Phase 4 — Commerce Engine (2026-09-07)

`src/modules/*` is populated for the first time — Catalog, Cart, Customers, Checkout, Orders, Payments, Shipping, Promotions, Notifications, each with a `repository.ts` (Prisma access only) / `service.ts` (business logic) split. Full reasoning for every domain-modeling decision lives in `../planning/commerce-completeness-audit.md`, which was written *before* the schema, per this phase's own instruction; this section covers implementation-level findings that document doesn't.

### Adopted (no new dependencies)

Nothing new was added to `package.json`. Everything this phase needed (transactions/row-locking, hashing, structured errors) already existed in Prisma, Node's `crypto` module, or Phase 1's foundations.

### Finding: Node 24 runs TypeScript seed scripts natively — no `tsx`/`ts-node` dependency needed

Verified empirically before deciding: `node prisma/seed.ts` works directly on this project's pinned Node version (24), including relative imports, as long as they carry an explicit `.ts` extension (Node's native type-stripping does not do path resolution the way a bundler does — `../src/domain/money` fails, `../src/domain/money.ts` works). This is *why* `prisma/seed.ts` constructs its own minimal `PrismaClient` instead of importing `src/lib/db.ts`: that file imports via the `@/` path alias, which only Next.js's own bundler resolves, and Node's native runner doesn't consult `tsconfig.json`'s `paths`. Wired into `prisma.config.ts`'s `migrations.seed` option. Worth remembering before reaching for `tsx` as a devDependency for any future standalone script — Node's native support already covers this project's actual need.

### Finding: `Variant` prop shapes for services stay Prisma-typed by design — the Phase 3 RSC-boundary lesson doesn't apply here

Phase 3 found that a class instance (`Money`) can't cross a Server-to-Client React prop boundary. Phase 4's services return `Money` instances freely (e.g. `CatalogService.getProduct()` → `ProductView` with real `Money` fields) because every consumer this phase built is an **API route handler**, which serializes the whole response to JSON via `NextResponse.json()` — a completely different boundary than a React Server/Client Component split, and one `Money`'s plain `{amountMinor, currency}` own-property shape already serializes correctly through. No special handling was needed; recorded so a future phase wiring these services into React Server Components directly (rather than through an API route) re-reads Phase 3's finding before assuming the same is true here.

### Order / Payment / Fulfillment state model (as actually implemented)

Three genuinely independent dimensions, per this phase's explicit instruction not to collapse them into one status field:

- **Order lifecycle** (`OrderStatus`): `CONFIRMED → CANCELLED` only. An Order row is *never* created in a pending state — see `data-ownership.md`'s Phase 4 reconciliation note. "Refunded" is deliberately **not** a third `OrderStatus` value; it's derived at read time from the linked `Payment`'s state (`src/modules/orders/service.ts`'s `deriveCustomerFacingStatus`), so the two can never disagree.
- **Payment lifecycle** (`PaymentStatus`): `INITIATED → PENDING → AUTHORIZED? → CAPTURED`, `FAILED`/`CANCELLED` pre-capture, `REFUND_INITIATED → REFUND_COMPLETED`, plus COD's own first-class `AWAITING_COD_COLLECTION` — never a repurposed "pending" for COD (`technical-architecture.md` §5's explicit guidance, followed literally).
- **Fulfillment lifecycle**: intentionally unpopulated this phase (`Order.erpPushStatus` tracks only the website's own push *attempt*, never real ERP fulfillment stages) — building a stage vocabulary now would mean guessing what the real ERP eventually reports.

### Inventory reservation — implementation notes beyond the audit's design

- Row-level locking uses `tx.$queryRaw\`SELECT id FROM variants WHERE id = ${id}::uuid FOR UPDATE\`` inside `prisma.$transaction`, not an ORM-level "optimistic concurrency" field — chosen because the failure mode being prevented (two concurrent checkouts both reading the same pre-reservation count) is exactly what pessimistic row locking is for, and Prisma has no first-class API for it, only the raw-query escape hatch.
- Reservation creation is **all-or-nothing per checkout**: `reserveInventoryForItems` throws `InsufficientInventoryError` if *any* line item lacks stock, which — because it's called inside the caller's own `$transaction` — rolls back every reservation already inserted earlier in that same call. Verified by `tests/integration/inventory-concurrency.test.ts`'s "all-or-nothing" case, not just asserted in a comment.
- Verified under real concurrency, not just single-threaded reasoning: `tests/integration/inventory-concurrency.test.ts` fires 10 parallel reservation attempts at a variant with 3 units available via `Promise.allSettled`, and asserts exactly 3 succeed and 7 reject with `InsufficientInventoryError` — this is the specific test this phase's brief asked for.

### Testing strategy without a local database (environment limitation, same disclosure pattern as Phase 1)

This sandbox still has no Docker/local Postgres. Rather than either skip DB-touching logic entirely or write tests that would hard-fail locally:

- **Unit tests** (`tests/unit/`) cover every pure function directly — phone normalization, availability derivation, coupon discount math (percentage rounding, fixed-capped-at-subtotal), and the idempotency-key claim/replay/conflict logic (tested against a minimal in-memory fake satisfying just the two Prisma methods it calls, not a real database).
- **Integration tests** (`tests/integration/`) exercise the real repository/service/Prisma layer — cart, checkout (including the concurrency test above), and order authorization/tracking — and check database reachability at the top of each file (`isDatabaseAvailable()`), using `describe.skipIf` to skip cleanly rather than fail when it's unreachable. `vitest.config.ts` gained a `setupFiles` entry loading `.env` (Vitest, unlike Next.js, doesn't do this automatically — needed because even a "pure" unit test can transitively import `src/lib/db.ts`, which validates `DATABASE_URL` at module-load time).
- **Precise verification status, not blurred together:** 73 unit tests are *written and pass locally, in this sandbox, right now*. 22 integration tests are *written and skip cleanly locally* (no Postgres here) — they are **not yet confirmed to pass in CI**; that requires an actual CI run, which this environment cannot trigger or observe (no `git remote`, no `gh` CLI access — checked directly, not assumed). `.github/workflows/ci.yml` was fixed this phase (Prisma generate moved before typecheck/tests; a `prisma db push` step added so CI's fresh Postgres container actually has the tables) *based on reading what the integration tests need*, not based on watching them pass there. **CI execution is pending external verification** — whoever has push/Actions access should confirm a real run goes green before treating the integration suite as proven, not just plausible. Manually verified (in this sandbox) that the new API routes fail gracefully — a logged, referenced `internal` error, never a crash or a raw stack trace — against the unreachable local database, the same standard Phase 1's health check set.
- **No new Playwright E2E tests were added this phase.** Every new commerce API route needs a real database to do anything meaningful, so an E2E test would hit the exact same local-verification gap the integration tests already disclose, while testing less precisely than those integration tests already do. The existing Phase 3 E2E suite (storefront, unaffected by this phase) was re-run and still passes 32/32 — proving no regression, not new commerce coverage. E2E coverage for the commerce flows becomes meaningful once a future phase wires the storefront's UI to these APIs.

### Consistency check addendum (Phase 4)

- See `../planning/commerce-completeness-audit.md` for the full pre-implementation audit, open decisions, and architecture risks discovered.
- **No ERP integration, no real payment provider, no real courier integration was implemented** — confirmed absent from the diff. `CodPaymentAdapter` and `ManualShippingAdapter` are real, complete MVP implementations of their respective interfaces, not stubs standing in for something unbuilt.
- **`src/modules/infrastructure/` remains unused, by design.** That module's stated public interface (`getConfig`, `logger`, `healthCheck`) has lived in `src/lib/` since Phase 1 (`env.ts`, `logger.ts`, `db.ts`) — this phase's new cross-cutting pieces (`idempotency.ts`, `audit-log.ts`, `session.ts`) followed the same precedent rather than introducing a parallel `src/modules/infrastructure/` that would just re-export the same things.
- **No environment limitations beyond Phase 1's**, beyond what's already disclosed above for testing specifically.

---

## Phase 4 review (2026-09-07)

A small, explicitly-scoped review/fix pass before final Phase 4 approval — not a new phase.

- **Inventory reservation TTL made centrally configurable.** `RESERVATION_TTL_MS` (`src/modules/catalog/inventory.ts`) now derives from `INVENTORY_RESERVATION_TTL_MINUTES` (`src/lib/env.ts`, optional, defaults to 15) instead of being a bare hardcoded constant — changing the duration is now an environment-variable change, never a code or schema change. Verified it was never duplicated elsewhere (`grep` for the literal/constant name turned up exactly one definition and one use site). Still an open business decision — the default is a placeholder, not an answer.
- **Tax given a real policy boundary**, matching the Payment/Shipping/Notifications adapter pattern exactly: `TaxPolicy` interface + `ZeroTaxPolicy` (`src/modules/checkout/tax-policy.ts`), named to say it's temporary, unit-tested (`tests/unit/tax-policy.test.ts`). Checkout now calls `taxPolicy.calculate(...)` through the interface instead of a bare local function — swapping in a real policy once Egyptian tax/e-invoicing rules are confirmed is a one-line change (the `const taxPolicy: TaxPolicy = ...` assignment), not a checkout rewrite. `Order.taxAmountMinor`/`OrderItem` snapshots already preserved whatever was applied at purchase time (unchanged from the original implementation) — confirmed, not modified.
- **CI-verification claims corrected project-wide, not just for this phase's new tests.** The same "verified in CI" language existed in this document's own Phase 1 section for the health check's healthy-path claim — also corrected, since it was making the identical overclaim this review was asked to fix for Phase 4. **This repository has no `git remote` configured and no `gh` CLI access exists in this environment** (checked directly: `git remote -v` returns nothing, `gh` is not installed) — no GitHub Actions run has ever been triggered or observed for this project, at any phase. Every CI-related claim in this document now reads as "designed to" / "written and reasoned about," never as an observed, completed run. **CI execution is pending external verification.**
- **Invariant review** (docs/planning/commerce-completeness-audit.md's design, checked against what's actually enforced):
  - Oversell prevention under concurrency — enforced (row lock) and tested (`tests/integration/inventory-concurrency.test.ts`).
  - Duplicate idempotent order creation — enforced and tested (`tests/integration/checkout.test.ts`, `tests/unit/idempotency.test.ts`).
  - Order snapshots immune to later price changes — enforced; **was not previously tested directly, now is** (`tests/integration/checkout.test.ts`'s new "order monetary snapshots never change..." case).
  - Client-supplied prices/totals never authoritative — verified by reading every route's zod schema (`src/app/api/v1/**`): none accepts a price/amount/total field from the client, full stop.
  - Reservation release/expiry cannot create inventory — enforced by construction (released reservations are excluded from the active-reservation sum, never credited) and tested.
  - Order/Payment/Fulfillment independence — enforced structurally (separate columns/tables, no code path mutates one from the other) and demonstrated by the existing COD end-to-end test; not given a further dedicated test, since there's no algorithm here that could subtly fail beyond what the schema itself already guarantees.
  - Order tracking anti-enumeration — order numbers are generated with `node:crypto`'s `randomInt` (confirmed, not a `Math.random()`-based or sequential value), and tracking requires the matching phone plus its own rate limit; the internal UUID path is ownership-checked and tested for IDOR (`tests/integration/orders.test.ts`).
- Nothing else changed. No ERP/payment/courier integration, no Products Experience, no Phase 5 work.
