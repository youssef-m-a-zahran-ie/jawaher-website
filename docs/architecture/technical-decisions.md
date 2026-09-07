# Jawaher Al Khair — Technical Decision Log & Consistency Check

Records what this stage confirmed, recommended, left open, or deferred, plus the results of cross-checking [`technical-architecture.md`](./technical-architecture.md), [`module-boundaries.md`](./module-boundaries.md), and [`data-ownership.md`](./data-ownership.md) against every prior canonical document. Mirrors the pattern established in [`../ux/ux-decisions.md`](../ux/ux-decisions.md).

Status: **Stage 0.9, extended in Phase 1.** Last updated: 2026-09-07.

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
- **CI: GitHub Actions**, including a real Postgres service container so the health check's database path is exercised for real in CI, not just its degraded path (which is all that could be verified in this development sandbox — see below).

### New finding: CSP nonces vs. the approved caching strategy

Next.js's recommended strict CSP approach (nonce-based, generated per-request in `proxy.ts`) **forces every page into dynamic rendering**, which would silently undermine the ISR/SSG caching strategy already approved in `technical-architecture.md` §20 for Home/Category/PDP/About. This is exactly the kind of contradiction this phase was told to surface rather than resolve unilaterally by picking the stricter security option. **Resolution:** Phase 1 uses a static CSP (via `next.config.ts` `headers()`, `'unsafe-inline'` for scripts/styles) that's compatible with static rendering, and documents the nonce-based alternative as a per-route option to revisit once genuinely dynamic-only pages (checkout, account) are built. This is a real engineering trade-off, recorded rather than silently chosen.

### Environment limitations honestly disclosed

This development sandbox has no Docker and no locally installed PostgreSQL. Consequently:
- `docker-compose.yml` and `Dockerfile` are written to the same conventions used throughout `technical-architecture.md` but could not be executed/tested here.
- The health check's **degraded** path (database unreachable) was verified for real, live, against a running production build.
- The health check's **healthy** path (database reachable) could not be verified in this sandbox — it is instead verified in CI (`.github/workflows/ci.yml`), which runs a real Postgres service container.
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
