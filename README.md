# Jawaher Al Khair — Website

Arabic-first, RTL, mobile-first e-commerce platform for Jawaher Al Khair (جواهر الخير), a premium Egyptian food brand (dates, honey, oils, nuts, ghee). This README is developer-onboarding documentation — for project context (architecture, requirements, UX, design, decisions), see [`docs/README.md`](./docs/README.md), which is canonical.

**Current phase:** Phase 2 — Brand + Design System + UX Implementation Foundation. There is no storefront yet by design — this phase built the token system and reusable UI primitives, not real pages. See [`docs/planning/feature-completeness-audit.md`](./docs/planning/feature-completeness-audit.md) and [`docs/architecture/blueprint.md`](./docs/architecture/blueprint.md) §19 for what comes next.

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
npm run dev
```

Open <http://localhost:3000>. The one existing API route, `GET /api/v1/health`, reports `{ status: "ok" | "degraded", checks: { database: "ok" | "error" } }` — it degrades gracefully rather than crashing if the database isn't reachable, so `npm run dev` works even before you have Docker/Postgres running.

**No Docker?** The app still runs — the health check will just report `database: "error"` until you point `DATABASE_URL` (in `.env`) at a real reachable PostgreSQL instance and re-run `npm run db:generate`.

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
| `npm run db:studio` | Prisma Studio (visual DB browser) |

## Project structure

```text
src/
├── app/          # Next.js App Router — routes only, thin (calls into modules/)
├── modules/      # domain modules (still empty — see docs/architecture/module-boundaries.md)
├── domain/       # framework-free domain types (e.g. Money)
├── ui/
│   ├── primitives/  # design-system building blocks (Button, Input, Modal, ...)
│   └── commerce/    # product-card foundation — mock data only, see its own header comment
├── lib/          # cross-cutting: env, db, logger, api-response, rate-limit, request-id
└── proxy.ts      # Next.js 16's renamed `middleware` — request-id propagation only
prisma/           # schema.prisma (no models yet — see its own header comment)
tests/
├── unit/         # Vitest — pure logic
├── integration/  # Vitest — against a real test database (none yet)
└── e2e/          # Playwright — full browser flows
```

The non-negotiable rule, enforced at code review from this phase onward: **the frontend never imports Prisma, a database client, or a provider SDK directly** — everything goes through `src/lib/db.ts` (server-only) and, once they exist, the module public interfaces in `src/modules/*`. See [`docs/architecture/architecture-decisions.md`](./docs/architecture/architecture-decisions.md) ADR-014.

## Testing notes

- Unit tests (`npm test`) need nothing running — they're pure logic (`Money`, the API response envelope, rate limiting).
- E2E tests (`npm run test:e2e`) spin up a production build via Playwright's `webServer` config. **On some Windows + Git Bash setups**, Playwright's own process spawning fails to resolve `npm` (`'npm' is not recognized...`) even though it works fine everywhere else, including GitHub Actions. If you hit this locally, start the server yourself first and reuse it:

  ```bash
  npm run build && npm run start &
  npx playwright test
  ```

## Design system

`npm run dev` then open <http://localhost:3000/dev/design-system> for a living showcase of every token and UI primitive (colors, type scale, buttons, form controls, cards, modal/drawer/toast, RTL/LTR comparison, etc.). It's a development aid only — the route 404s in a production build (see `tests/e2e/design-system-showcase.spec.ts`), so it can never end up live. Component source: `src/ui/primitives/` and `src/ui/commerce/`; tokens: `src/app/globals.css`. See [`docs/design/design-system.md`](./docs/design/design-system.md) for the source-of-truth spec these implement.

## CI

`.github/workflows/ci.yml` runs lint, typecheck, unit tests, a production build, and the full E2E suite (including a real Postgres service container, so the health check's *healthy* path — not just its degraded one — is verified there).

## Money

Monetary values are never floating-point — see `src/domain/money.ts`. EGP (Egyptian Pound) is the current runtime currency; integer piasters are the minor unit. See [`docs/design/design-decisions.md`](./docs/design/design-decisions.md) for why this isn't Saudi Riyal despite what the brand guideline PDF's mockups show.
