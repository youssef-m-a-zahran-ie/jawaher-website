# Jawaher Al Khair — Website

Arabic-first, RTL, mobile-first e-commerce platform for Jawaher Al Khair (جواهر الخير), a premium Egyptian food brand (dates, honey, oils, nuts, ghee). This README is developer-onboarding documentation — for project context (architecture, requirements, UX, design, decisions), see [`docs/README.md`](./docs/README.md), which is canonical.

**Current phase:** Phase 4 — Commerce Engine. The real catalog/cart/checkout/orders/payments/shipping/promotions domain layer exists now, backed by a real Postgres schema (`prisma/schema.prisma`) and exercised through `/api/v1/*` — but nothing in the Phase 3 storefront is wired to it yet (it still renders from mock data, unchanged). ERP integration, a real payment/courier provider, and the cinematic Products Experience do not exist yet. See [`docs/planning/commerce-completeness-audit.md`](./docs/planning/commerce-completeness-audit.md) and [`docs/architecture/blueprint.md`](./docs/architecture/blueprint.md) §19 for what comes next.

## Prerequisites

- Node.js 24+ (the Next.js 16 minimum is 20.9+; this repo was built and tested against 24)
- npm (ships with Node)
- Docker, for the local PostgreSQL database (optional — see below if you don't have it)

## Setup

```bash
npm install
cp .env.example .env          # defaults already match docker-compose.yml
docker compose up -d          # starts PostgreSQL only — no Redis (see ADR-015)
npm run db:generate           # generates the Prisma Client
npx prisma db push            # creates the commerce schema's tables (no committed migration yet — see Testing notes)
npm run db:seed               # populates categories/products/variants/shipping zones with labeled sample data
npm run dev
```

Open <http://localhost:3000>. `GET /api/v1/health` reports `{ status: "ok" | "degraded", checks: { database: "ok" | "error" } }` — it degrades gracefully rather than crashing if the database isn't reachable, so `npm run dev` works even before you have Docker/Postgres running. See "API routes" below for the rest.

**No Docker?** The storefront (Phase 3) still runs fully — it renders from mock data, not the database. The commerce API routes (`/api/v1/products`, `/api/v1/cart/*`, `/api/v1/checkout/*`, `/api/v1/orders/*`) will return a clean, logged `internal` error instead of crashing the server — verified behavior, not a guess — until you point `DATABASE_URL` (in `.env`) at a real reachable PostgreSQL instance and run the three `db:*`/`db push` commands above.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run build` / `npm run start` | Production build / run it |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run format` / `format:check` | Prettier |
| `npm test` / `npm run test:watch` | Vitest unit tests |
| `npm run test:e2e` | Playwright E2E (see the Windows note below) |
| `npm run db:generate` | Regenerate the Prisma Client from `prisma/schema.prisma` |
| `npm run db:migrate` | Create/apply a Prisma migration (needs a reachable database) |
| `npm run db:seed` | Populate categories/products/variants/shipping zones/one coupon — see `prisma/seed.ts` |
| `npm run db:studio` | Prisma Studio (visual DB browser) |

## Project structure

```text
src/
├── app/
│   ├── (storefront)/  # Home, Shop, Category, Product, Search, About, Contact, Policies
│   ├── (account)/     # /account (placeholder — no real auth yet)
│   ├── api/v1/         # health, contact — route handlers only, thin
│   ├── dev/            # design-system showcase — excluded from production
│   ├── error.tsx, not-found.tsx, loading.tsx, sitemap.ts, robots.ts
│   └── layout.tsx      # root shell: Header/Footer/ToastProvider/skip-link
├── modules/                 # domain modules — see docs/architecture/module-boundaries.md
│   ├── catalog/             # products/variants + inventory reservation (repository.ts + inventory.ts + service.ts)
│   ├── cart/                # server-authoritative totals, never a client-supplied price
│   ├── customers/           # phone/OTP identity, sessions, addresses
│   ├── checkout/            # the one orchestrating transaction — see its own header comment
│   ├── orders/               # order read/tracking + authorization (IDOR-safe)
│   ├── payments/             # PaymentProvider interface + CodPaymentAdapter (the only real adapter)
│   ├── shipping/             # ShippingProvider interface + ManualShippingAdapter (zone → fee lookup)
│   ├── promotions/           # coupon validation — exactly one coupon per order at MVP
│   └── notifications/        # NotificationProvider interface + LogNotificationProvider (no real SMS/email yet)
├── domain/       # framework-free domain types (Money, phone normalization)
├── ui/
│   ├── primitives/  # design-system building blocks (Button, Input, Modal, ...)
│   ├── commerce/    # ProductCard/Grid/categories — mock data only, see its own header comment
│   ├── home/        # homepage sections (Hero, TrustStrip, StoryTeaser)
│   └── site/        # nav data + the header's client island (mobile/cart drawers)
├── lib/          # cross-cutting: env, db, logger, api-response, api-error-mapping, rate-limit, request-id, analytics, idempotency, audit-log, session
└── proxy.ts      # Next.js 16's renamed `middleware` — request-id propagation only
prisma/
├── schema.prisma  # the real commerce schema (Phase 4) — see its own header comment
└── seed.ts        # populates labeled sample catalog/shipping/coupon data — run via `npm run db:seed`
scripts/          # prepare-standalone.mjs — see Testing notes below
tests/
├── unit/         # Vitest — pure logic, no database needed
├── integration/  # Vitest — against a real database; skips cleanly if one isn't reachable (see Testing notes)
└── e2e/          # Playwright — full browser flows (storefront only — see Testing notes)
```

The non-negotiable rule, enforced at code review from this phase onward: **the frontend never imports Prisma, a database client, or a provider SDK directly** — everything goes through `src/lib/db.ts` (server-only) and the module public interfaces in `src/modules/*` (populated for real starting Phase 4). See [`docs/architecture/architecture-decisions.md`](./docs/architecture/architecture-decisions.md) ADR-014.

## Testing notes

- Unit tests (`npm test`, `tests/unit/`) need nothing running — pure logic (`Money`, phone normalization, availability derivation, coupon discount math, idempotency-key claim/replay, the API response envelope, rate limiting, categories, analytics, the contact-form schema).
- Integration tests (`npm test`, `tests/integration/`) exercise the real Prisma-backed repositories/services against an actual database — cart, checkout (including a concurrency test firing 10 parallel inventory reservations at 3 available units), and order authorization/tracking. Each file checks database reachability first and skips cleanly (not a failure) if one isn't available, so `npm test` degrades gracefully without Docker/Postgres, the same way the health check does. Run `docker compose up -d && npx prisma db push` first to exercise them for real locally.
- E2E tests (`npm run test:e2e`) cover the storefront (Phase 3) only — every new commerce API route needs a real database to do anything meaningful, so that coverage lives in the integration tests instead (see `docs/architecture/technical-decisions.md`'s Phase 4 section for the full reasoning). They spin up a production build via Playwright's `webServer` config — `npm run build && node scripts/prepare-standalone.mjs && node .next/standalone/server.js` (see that config's comment for why it's not `npm run start`: with `output: "standalone"`, `next start` doesn't serve the app correctly). **On some Windows + Git Bash setups**, Playwright's own process spawning fails to resolve `npm`/`node` (`'npm' is not recognized...`) even though it works fine everywhere else, including GitHub Actions. If you hit this locally, run the same sequence yourself first and reuse the server:

  ```bash
  npm run build
  node scripts/prepare-standalone.mjs
  node .next/standalone/server.js &
  npx playwright test
  ```

## Design system

`npm run dev` then open <http://localhost:3000/dev/design-system> for a living showcase of every token and UI primitive (colors, type scale, buttons, form controls, cards, modal/drawer/toast, RTL/LTR comparison, etc.). It's a development aid only — a production build never ships its real content (verified in `tests/e2e/design-system-showcase.spec.ts`; the literal HTTP status can be a Next.js 16 "soft 404" rather than a hard one under certain routes — see `docs/architecture/technical-decisions.md`'s Phase 3 section — but the showcase itself never reaches a real visitor either way). Component source: `src/ui/primitives/` and `src/ui/commerce/`; tokens: `src/app/globals.css`. See [`docs/design/design-system.md`](./docs/design/design-system.md) for the source-of-truth spec these implement.

## API routes

`GET /api/v1/health` — degrades gracefully if the database is unreachable (see Setup above). `POST /api/v1/contact` — validates and rate-limits a contact-form submission and logs it; not yet wired to a real email/SMS notification.

**Commerce (Phase 4)** — none of these are wired to the Phase 3 storefront's UI yet; exercise them directly or via the integration tests.

| Route | What it does |
|---|---|
| `GET /api/v1/products`, `GET /api/v1/products/:slug` | Catalog reads, live availability derived from stock minus active reservations |
| `GET /api/v1/cart`, `POST /api/v1/cart/items`, `PATCH`/`DELETE /api/v1/cart/items/:variantId` | Server-authoritative cart — quantity always clamped, price always re-read live |
| `POST /api/v1/auth/otp/request`, `POST /api/v1/auth/otp/verify` | Phone identity — no real SMS provider; the code is returned in the response body outside production only, never logged (see `src/modules/customers/otp.ts`) |
| `GET`/`POST /api/v1/addresses`, `PATCH`/`DELETE /api/v1/addresses/:id` | Saved addresses — customer-scoped, authenticated only |
| `POST /api/v1/checkout`, `POST /api/v1/checkout/address`, `GET /api/v1/checkout/shipping-rates`, `POST /api/v1/checkout/coupon` | The checkout accordion's backend, one step at a time |
| `POST /api/v1/orders` | Places the order — requires an `Idempotency-Key` header; the one transaction that reserves inventory, creates the payment, and creates the order together |
| `GET /api/v1/orders/:id`, `GET /api/v1/orders/track` | Order lookup (authenticated, ownership-checked) and public tracking (order number + phone required together) |
| `POST /api/v1/internal/inventory/sweep-expired-reservations` | Releases stale inventory holds — needs an external scheduler to actually fire it; see `docs/planning/commerce-completeness-audit.md` §21 |

See [`docs/planning/commerce-completeness-audit.md`](./docs/planning/commerce-completeness-audit.md) for what's real, what's deliberately deferred, and every open business decision (tax, exact shipping fees, payment/courier/OTP providers, coupon stacking, COD failure-delivery policy).

## CI

`.github/workflows/ci.yml` runs lint, typecheck, unit tests, a production build, and the full E2E suite (including a real Postgres service container, so the health check's *healthy* path — not just its degraded one — is verified there).

## Money

Monetary values are never floating-point — see `src/domain/money.ts`. EGP (Egyptian Pound) is the current runtime currency; integer piasters are the minor unit. See [`docs/design/design-decisions.md`](./docs/design/design-decisions.md) for why this isn't Saudi Riyal despite what the brand guideline PDF's mockups show.
