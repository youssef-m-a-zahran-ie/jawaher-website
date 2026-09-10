# ERP Discovery

Phase 6 — ERP Discovery & Website ↔ ERP Mapping. Everything below comes from directly reading `E:\Engineering\Projects\Jawaher\ERP JAW` (code, schema, migrations-equivalent, existing docs) — not from assumption, not from this project's own prior conversations. Where the ERP's own documentation disagreed with its own code, code wins, and the disagreement is recorded here rather than silently resolved. No ERP file was modified to produce this document.

Status: Phase 6. Last updated: 2026-09-10.

---

## 1. Both repos — verification

- **ERP** (`ERP JAW`): git clean, branch `main` up to date with `origin/main`, no uncommitted changes. Branches: `main`, `sprint-b`, `db-backups`.
- **Website** (`WEB JAW`): git clean, branch `main`, no uncommitted changes.

Both repos remain independent; nothing here merges them, and no git config was touched.

---

## 2. Critical finding: the ERP's own docs describe a state the repo has moved past

`ERP JAW\CLAUDE.md` states, in its own words: *"This is the documentation and planning archive for a multi-tenant ERP platform, not a buildable codebase... there is no `package.json`, lockfile, or source code checked in."* `baseline/PRODUCTION_CHECKLIST.md` frames the whole project as "12 of 12 milestones... engineering-complete, but NOT production-ready," built across disconnected "Standalone Mode" sessions with no real repository access, and lists 20 live-infrastructure tests as never executed.

**Both claims are stale relative to the actual repository on disk.** Directly verified:

- `package.json`, `package-lock.json`, `node_modules/`, a real `prisma/schema.prisma` (2,786 lines, 79 models), `src/app`, `src/modules` (16 domain modules), `src/features` (60+ Server Action files), `tests/`, `.env`/`.env.local` all exist and are populated. There is no `apps/api`, `apps/web`, `packages/database`, or `packages/shared` directory at all — the monorepo shape CLAUDE.md describes was never built; what exists instead is a single Next.js 15 app.
- `git log` shows **254 real commits**, the most recent dated **2026-09-02** — well after the M12/"v4.0 baseline" narrative these docs describe. The last 15 commits are ordinary bug-fix/feature work against a running UI (`fix: order-line product names cut off mid-word in queue chips`, `fix: shipping zone dropdown blank on order edit sheet's first open`, `feat: search by order number on the Fulfillment page`, `fix: Decimal serialization leaks on product detail and variants tab`, `feat: give Moderator access to متابعة الأوردرات (Orders Flow)`) — not the kind of commit a documentation-only archive with no buildable code would produce.

**Conclusion, applied throughout this discovery**: the `baseline/`, `docs/milestones/`, `docs/reports/` narrative documents describe real historical intent and mostly-accurate domain modeling, and were treated as useful context — but every specific behavioral claim in them was cross-checked against the actual code before being repeated anywhere in this discovery. Two concrete contradictions found this way are recorded in `erp-domain-map.md` §6 and `erp-order-lifecycle-mapping.md` (the FEFO/lot-tracking-not-enforced findings, and the `qc`/`failed_delivery` dead-enum-values finding). Any future work on this ERP should treat `CLAUDE.md` and `PRODUCTION_CHECKLIST.md` as **out of date on the "is there code" question** and should be corrected or archived — that correction is outside this phase's read-only scope, so it is only flagged here, not fixed.

---

## 3. Tech stack, framework, tooling

| Layer | Finding |
|---|---|
| Runtime/framework | Next.js 15.1.11, React 19.0.1, TypeScript 5.7.3 |
| ORM / DB | Prisma 6.3.1 → Supabase Postgres (`@supabase/ssr`, `@supabase/supabase-js`) |
| Package manager | npm (`package-lock.json` present, no yarn/pnpm lockfile) |
| Validation | Zod 3.24.1 |
| Testing | Vitest 4.1.10 (`npm test`), a dedicated `tests/rls` suite, Playwright config present (`playwright.config.ts`) though not audited this phase |
| Auth | Supabase Auth (session cookie) — see §5 |
| Background jobs | A real, DB-backed job queue (`BackgroundJob` model, `scripts/process-jobs-once.ts`, `/api/v1/jobs/{dispatch,health,process,worker}`) — not a third-party queue product |
| Scheduling | GitHub Actions cron, **not** Vercel Cron — moved off Vercel Cron after a disclosed 2026-08-19 "retry-storm incident" (see `erp-shopify-integration-analysis.md`) |
| Deployment signals | `vercel.json`, `Dockerfile`, `docker-compose.yml` all present simultaneously — mixed signal, not resolved by this phase (out of scope; note only) |
| API architecture | Next.js Server Actions for essentially all mutations; a small number of `/api/v1/*` routes for CSV export, health, cron/job triggers, and one generic webhook receiver — see §6 |

---

## 4. Architecture (verified against code, not just against CLAUDE.md's narrative)

- **Layering is real**: Repository (data access only) → Service (business rules, workflow transitions, the only layer allowed to call more than one repository) → Server Action/Route (thin: auth guard → Zod validation → one service call). Confirmed directly in the orders, products, and warehouse modules during this phase's audits.
- **Modules** (`src/modules/*`): `analytics`, `auth`, `connectors`, `customers`, `dashboards`, `finance`, `hr`, `integrations`, `orders`, `partners`, `products`, `purchasing`, `rbac`, `secrets`, `suppliers`, `warehouse`. Each feature-facing module has a parallel `src/features/<module>/actions/` tree with a per-module `_guard.ts` gating every Server Action.
- **Multi-tenancy — real, not aspirational**: `Company` is a genuine multi-row model; a branded `TenantContext` type (`src/lib/db/tenant-context.ts:42-45`), producible only via `requireTenantContext()` or a narrow `getSystemTenantContext(companyId)` escape hatch for verified webhook/job paths (lines 77-79), is threaded through repository functions which hand-write `where: { companyId: ctx.companyId, ... }` directly (confirmed call sites: `src/modules/orders/repositories/sales-order.repository.ts:51-56, 58-64, 219-230`). This matches ADR-0001's documented decision (Option B: Repository Pattern, not RLS, as the primary isolation mechanism) and is a real, working pattern, not a description of intent.
- **Current runtime scope is one company per user session**: `getCurrentUser()`'s own comment (`src/lib/auth/session.ts:31-36`) states a user resolves to exactly one company for now, with a 2026-08 audit-finding comment in the same file flagging multi-company-per-user as a latent, not-yet-exercised path (lines 54-57). A future website integration should assume **one Website deployment maps to exactly one ERP `Company` row** — there is no existing concept of one integration connection serving several companies at once (mirrors the Shopify pattern's `@@unique([companyId, connectorId])` on `CompanyIntegrationConnection`).
- **RLS status is a real, open, unresolved item** — not primary, but not fully confirmed as defense-in-depth either: `baseline/PRODUCTION_CHECKLIST.md` §G states verbatim that whether `FORCE ROW LEVEL SECURITY` is actually enabled on tenant-scoped tables is **unconfirmed**, and `DATABASE_URL` connects as a Postgres superuser (per ADR-0001's own text), which bypasses RLS by default unless that flag is set. This matters for a future integration only insofar as it's a pre-existing, disclosed platform risk, not something this phase's ERP inspection needs to resolve or that a website integration changes.

---

## 5. Auth / RBAC (see full detail and citations in the agent audit; summarized here for cross-reference)

- Authentication: Supabase Auth session cookie only, gated by `src/middleware.ts`, which exempts exactly four prefixes (`/api/v1/webhooks/`, `/api/v1/cron/`, `/api/v1/jobs/`, `/api/v1/health`), each with its **own** independent auth (per-tenant HMAC for webhooks, a static `CRON_SECRET` bearer token for cron/jobs).
- RBAC: `User → UserCompany → UserRole → Role → RolePermission → Permission`, resolved per-company at session-load time; checked via `hasPermission(user, code)` at the Server Action boundary (a `_guard.ts` per feature module), with `isSuperAdmin` as the one sanctioned bypass.
- **There is no existing mechanism for an external system (a website) to authenticate to this ERP "as itself."** The only machine-identity precedent is Shopify-specific and asymmetric: the ERP verifies Shopify's *inbound* webhook HMAC and uses its own secret to make *outbound* calls to Shopify — there is no generic inbound API-key verification path today. This is the single most consequential fact for integration feasibility; see `erp-integration-architecture.md`.

---

## 6. Existing API surface — the key integration-readiness fact

**Confirmed: there is no general-purpose product/order/customer/inventory CRUD JSON API anywhere in this codebase.** Every file under `src/app/api/v1/**/route.ts` (31 total) is one of exactly four kinds:

| Kind | Examples | Auth |
|---|---|---|
| Admin CSV export | `products/export`, `customers/export`, `orders/{fulfillment,delivery,validation}-queue/export`, `finance/*/export`, `suppliers/export`, `purchase-orders/export`, `analytics/*/export`, `admin/*/export` | Session cookie + RBAC permission check |
| Inbound webhook receiver | `webhooks/[connector]` (only `connector === "shopify"` is implemented; anything else 404s) | Per-tenant HMAC-SHA256, constant-time compare |
| Scheduled job trigger | `cron/shopify-sync-{daily,hourly}`, `cron/shopify-retry-sweep`, `cron/maintenance-daily`, `cron/metric-snapshot-{daily,monthly}` | `Authorization: Bearer ${CRON_SECRET}` |
| Job-queue infra | `jobs/{dispatch,health,process,worker}` | Same `CRON_SECRET` pattern |
| Liveness | `health` | None |

Every actual mutation (create/confirm/cancel a sales order, create/edit a product or variant, connect Shopify, etc.) happens through a Next.js Server Action gated by the same session-cookie + RBAC mechanism used by the UI — there is no separate API-key-based external mutation surface. `IntegrationConnector.authType` already reserves an `api_key` value in its enum, but no route or middleware anywhere validates an inbound API key against it; it is a schema-level placeholder, not a wired capability.

**Direct consequence for a future website integration**: neither a read (products/prices/inventory pull) nor a write (order push) integration can be built against anything that exists today. Both require new ERP-side work — not "the shape of an existing endpoint," but the endpoint itself, plus the auth path to reach it. This is spelled out fully in `erp-integration-architecture.md` and `erp-integration-final-gap-analysis.md`.

---

## 7. Existing Shopify integration — headline

Real, working, and the single best source of reusable patterns for a future integration (full detail in `erp-shopify-integration-analysis.md`):
- Generic `ChannelMapping(salesChannelId, internalEntityType, externalId)` table is the identity/idempotency backbone for product, customer, order, and fulfillment linkage all at once.
- Idempotent-import pattern (pre-check → transactional re-check → catch-and-recover-from-unique-constraint-violation) closes real at-least-once-delivery races, with two documented production incident numbers (#1182/#1183) as evidence it was a real, not theoretical, fix.
- `SyncConflict` gives a real, queryable, policy-driven (erp_wins/shopify_wins/newest_wins/manual_review) conflict-resolution worklist.
- Auth is inconsistent across the platform's two existing connectors: Shopify uses a client-credentials-grant token mint (not classic OAuth), Google Sheets uses OAuth-authorization-code — both bolted onto the same `IntegrationSecret` scaffolding. A new integration should deliberately pick one, not inherit the split.
- Scheduling was moved from Vercel Cron to GitHub Actions after a real 2026-08-19 incident — directly relevant to the Website's own still-open "which scheduler" decision (`erp-integration-gap-analysis.md`).

---

## 8. Business domain context (from the ERP's own vision document, cross-checked, not assumed)

Per `docs/architecture/ERP_Business_Discovery_and_Vision.md`: a vertically-integrated premium food operation (dates, honey, nuts, dried fruit) that sources, repacks/kits (BOM-based), and sells via Shopify today. This explains several real schema decisions confirmed in code: `Lot`/expiry tracking, `BillOfMaterial`/`BomLine` for repacking, `StockMove` as a single append-only ledger (the "single stock-ledger pattern" the vision doc explicitly recommended adopting — and which the real schema does use for `StockMove`).

---

## Related documents

- `erp-domain-map.md` — full entity-by-entity classification
- `erp-website-real-mapping.md` — Website entity ↔ ERP entity mapping
- `erp-inventory-analysis.md` — inventory lifecycle, the exact stock-unavailability point, race conditions
- `erp-order-lifecycle-mapping.md` — real order/payment/fulfillment state machine
- `erp-shopify-integration-analysis.md` — reusable lessons, what not to copy
- `erp-integration-architecture.md` — proposed (design-only) integration architecture
- `erp-integration-final-gap-analysis.md` — gap table + final verdict
