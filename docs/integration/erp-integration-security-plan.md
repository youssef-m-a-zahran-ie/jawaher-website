# ERP Integration — Security Plan

Phase 7. Covers service-to-service authentication design (§7 of the brief) and the RLS/security verification plan (§15). Nothing here is implemented; no credential is created.

Status: Phase 7. Last updated: 2026-09-11.

---

## 1. Service-to-service authentication — options considered

Per `erp-discovery.md` §5 and `erp-shopify-integration-analysis.md` §4, the ERP has exactly two existing auth patterns today: (a) Supabase session cookie + RBAC, built for interactive human users; (b) two different machine-credential flows, inconsistent with each other — Shopify's client-credentials-grant token mint, and Google Sheets' OAuth-authorization-code flow, both stored via `IntegrationSecret`.

| Option | Fit for this integration | Verdict |
|---|---|---|
| Reuse Supabase session/browser auth | No — the Website is a server-to-server caller, not a human browser session. Would require provisioning a "fake user" and managing its session lifecycle, an abuse of a mechanism built for humans | **Rejected**, explicitly ruled out per the brief's own instruction not to assume this |
| OAuth-authorization-code (mirroring Google Sheets) | Wrong trust model — OAuth-authz-code exists for a third party needing per-user consent; the Website is a first-party system the business itself controls, with no "user" to consent | **Rejected** |
| Client-credentials-grant (mirroring Shopify) | Closer fit (machine-to-machine), but adds a token-mint/refresh lifecycle for no real benefit at this trust level, and would be the platform's *third* distinct auth flow | **Rejected** — adds complexity without a corresponding security benefit over a simpler option |
| **Dedicated long-lived API key** | Matches the trust model exactly: one first-party caller, one credential, simple to rotate/revoke, no token-refresh machinery needed | **Selected** |
| Signed requests (HMAC over the payload, like the Shopify webhook receiver) | Considered as an *addition* to the API key for the ERP's inbound direction — see §3 | Adopted as a complementary control, not a replacement |

**Decision: a dedicated long-lived API key** (`IntegrationSecret.secretType = "api_key"` — the value already exists in the schema's enum but nothing validates one today, confirmed in Phase 6), issued once per `CompanyIntegrationConnection` for a new `IntegrationConnector(key: "website")` row. This directly follows the Shopify/Google-Sheets *storage* pattern (`IntegrationSecret`, envelope-encrypted, never mutated in place, only rotated as a new row with the old one revoked) while deliberately choosing the simplest of the three *auth-flow* patterns rather than inheriting either existing one, per `erp-integration-architecture.md` §4's recommendation.

## 2. Explicit answer: does the Website bypass normal human ERP sessions?

**Yes, entirely, by design.** The new API-key path is a parallel, independent authentication mechanism — it does not create, reuse, or depend on any `User`/session row. It resolves directly to a `companyId` via `getSystemTenantContext()` (the same narrow escape hatch already used for verified webhook/job paths, `src/lib/db/tenant-context.ts:77-79`), never through `getCurrentUser()`. This mirrors exactly how the Shopify webhook path already works today (HMAC-verified, no human session involved) — the new path is architecturally a sibling of that one, not a new category of access.

## 3. Where the new auth path fits in the request pipeline

`src/middleware.ts` currently exempts exactly four prefixes from the session-cookie gate, each with its own bespoke check. A fifth exemption is needed: `/api/v1/integrations/website/`, verified by:

1. Extract the API key from a header (e.g. `Authorization: Bearer <key>` or a dedicated `X-Integration-Key` header — exact header name is an implementation detail for the build phase, not decided here).
2. Look up the matching `IntegrationSecret` (status `active`), decrypt, constant-time-compare (mirroring the existing HMAC constant-time-compare discipline used for Shopify webhooks — `timingSafeEqual`, not a plain `===`).
3. Resolve the owning `CompanyIntegrationConnection` → `companyId` → `getSystemTenantContext(companyId)`.
4. Reject (401) if any step fails, before any route handler logic runs — mirroring the Shopify webhook route's own "verify before touching anything else" discipline (a real, disclosed 2026-08 audit finding on that route, worth inheriting deliberately here).

## 4. Credential lifecycle

| Concern | Decision |
|---|---|
| Ownership | The business/ERP operator generates and holds the key (via a new, simple admin action — not designed in detail here, out of scope for this plan beyond noting it's needed); the Website's `erp-integration` module stores its copy exclusively in `env.ts`-managed configuration, never in the database, never in a log |
| Storage (ERP side) | `IntegrationSecret`, envelope-encrypted (existing mechanism, `MASTER_ENCRYPTION_KEY`-wrapped AES-GCM DEK) — unchanged, reused as-is |
| Storage (Website side) | Environment configuration only (`src/lib/env.ts`'s existing `ERP` category, already reserved and unpopulated per `technical-architecture.md` §23) — never in the Website's own database |
| Rotation | New `IntegrationSecret` row created, old one's `status` set to `revoked` — the existing rotation mechanism (`IntegrationSecret` rows are never mutated in place) applies unchanged. The Website's adapter picks up the new key via a config update, not a database write |
| Revocation | Set `status: revoked` on the `IntegrationSecret` row and/or `status: disconnected` on the `CompanyIntegrationConnection` — the auth check in §3 step 2 naturally rejects a revoked/missing-active secret |
| Least privilege | The key authenticates the connection, not a person — its effective privilege is exactly the set of new `/api/v1/integrations/website/*` operations (§`erp-api-contracts.md`), never the full RBAC surface a human session would have. No `Role`/`Permission` row is involved at all; the new routes check "is this a valid, active website-connector credential for this company," not "does this bearer have permission X" |
| Auditability | Every authenticated call logs to `AppLog` (technical/operational event, matching the ERP's own three-log convention — this is not tenant-data, so not `AuditLog`); every resulting *mutation* (order create, customer reconcile, cancel) logs to `AuditLog`/`ActivityTimeline` as already specified per-operation in `erp-api-contracts.md` |

## 5. Additional isolation for integration credentials

- The website connector's `IntegrationSecret` rows must be distinguishable from Shopify's/Google Sheets' at the data level (already true — `IntegrationConnector.key` differs) and must never be readable through any admin UI path that wasn't already built for viewing/rotating Shopify secrets (i.e., reuse the existing secrets-admin surface, don't build a parallel one) — confirmed as a reasonable default, not a new requirement.
- The new middleware exemption (§3) must be scoped as narrowly as the existing four — a literal prefix match on `/api/v1/integrations/website/`, not a broader pattern that could accidentally exempt other routes.
- No new elevated database role or connection string is needed — the new routes execute through the existing service layer, under the existing `TenantContext`/`getSystemTenantContext()` mechanism, which already enforces `companyId` scoping in every repository query (unchanged, confirmed real in Phase 6).

---

## 6. RLS verification plan (§15 of the brief)

> **Phase 8.5 update (2026-09-11): VERIFIED, live, against the real dev database.** Every item in §6.1/§6.3 below was actually checked, not just planned. Result, stated precisely (Phase 8.5R terminology correction): `FORCE ROW LEVEL SECURITY` is genuinely set on all 88/88 public-schema tables — a database-configuration fact; `anon`/`authenticated` (`rolbypassrls: false`) are genuinely subject to it, real defense-in-depth for that separate access path; the app's own `postgres`/`service_role` connection (`rolbypassrls: true`) deliberately bypasses it, exactly as ADR-0001 describes — not a gap. **Tenant isolation for the Website integration path itself is provided entirely by the application-level `TenantContext` mechanism (§3's `getSystemTenantContext()`), not by RLS** — RLS provides no defense-in-depth for the application's own connection, by design. The new integration-auth code path was specifically checked for cross-tenant leakage at the application level (a new test, `service.test.ts`'s "never resolves Company A's connection using Company B's real api_key") and found safe. Full detail and exact queries run: `erp-pre-integration-closure.md` §5. The section below is kept as the original plan for historical record.



Phase 6 found `FORCE ROW LEVEL SECURITY`'s status **unconfirmed** on tenant-scoped tables (`baseline/PRODUCTION_CHECKLIST.md` §G, ERP's own disclosed open item), and that `DATABASE_URL` connects as a Postgres superuser (per ADR-0001), which bypasses RLS by default unless that flag is explicitly set. **This is not fixed in this phase** — per the brief's explicit instruction. This section defines what a future implementation phase must verify.

### 6.1 What must be verified

1. For every tenant-scoped table `FORCE ROW LEVEL SECURITY` is expected to protect (i.e., every table carrying a `companyId` column — confirmed by Phase 6 as the large majority of the 79-model schema), run `SELECT relforcerowsecurity FROM pg_class WHERE relname = '<table>'` (or the Prisma-equivalent introspection) and confirm `true`.
2. Confirm the application's actual runtime `DATABASE_URL` role — verify it is genuinely the superuser role ADR-0001 describes, not a different role in some environments (e.g. a differently-configured staging/production split) that might behave differently.
3. Specifically re-verify the new API-key-authenticated path (§3) never bypasses `TenantContext`/`getSystemTenantContext()` — since this is a **new** code path, it needs its own explicit review for the same tenant-scoping discipline the existing `check:tenant-scope` script enforces on the rest of the codebase (that script should be confirmed to cover the new repository calls, or extended if it doesn't).

### 6.2 Which tables matter most for this integration specifically

`SalesOrder`, `SalesOrderLine`, `BusinessPartner`, `CustomerProfile`, `StockQuant`, `StockReservation`, `ChannelMapping`, `CompanyIntegrationConnection`, `IntegrationSecret` — every table the new endpoints (§`erp-api-contracts.md`) read or write. A cross-tenant leak on any of these would mean one company's orders/customers/inventory becoming visible or writable via another company's API key — the single most severe failure mode this integration could introduce.

### 6.3 Security acceptance criteria (for the future build phase, not this one)

- [ ] `FORCE ROW LEVEL SECURITY` confirmed `true` on every table listed in §6.2, at minimum (ideally all tenant-scoped tables, matching the ERP's own pre-existing backlog item).
- [ ] A test proves that an API key issued for Company A cannot read or write Company B's data through any new endpoint, even if the request otherwise looks valid (correct signature/key, wrong-company-scoped resource id).
- [ ] `check:tenant-scope` (or an equivalent manual review) confirms every new repository call in the integration path actually references `ctx.companyId` in its query — the same static-analysis discipline already applied elsewhere.
- [ ] The new middleware exemption (§3) is confirmed to reject any request without a valid, active, non-revoked key — including a request replaying a previously-revoked key.
- [ ] Key rotation is exercised at least once in a non-production environment before go-live, confirming the old key stops working and the new one works, with no downtime gap forcing a temporary dual-key window (or, if a dual-key grace window is needed operationally, that it's a deliberate, time-boxed decision, not an accidental permanent state).

### 6.4 What this plan does not do

It does not fix `FORCE ROW LEVEL SECURITY`'s current unconfirmed status — that is the ERP's own pre-existing backlog item (`PRODUCTION_CHECKLIST.md` §G), tracked independently of this integration and not blocking this plan's design. It is listed here because a new integration path is one more reason to close it, not because this integration created the gap.
