# ERP Integration Foundation — What Was Actually Built (Phase 8)

Phase 8 — the first implementation phase touching real code in both repositories. This document describes exactly what exists after Phase 8, nothing more. No catalog/inventory/customer/order/payment/shipping synchronization exists yet — see `erp-integration-implementation-plan.md` for what's still ahead and in what order.

Status: Phase 8, implemented. Last updated: 2026-09-11.

---

## 1. What this phase proves

A minimal, secure, server-to-server call path now genuinely exists end to end:

```
Website server code
  -> erpIntegrationService.checkConnection()   (src/modules/erp-integration/service.ts)
  -> callErpIntegrationApi()                   (src/modules/erp-integration/client.ts)
  -> HTTP, with Authorization + X-ERP-Connection-Id + X-Request-Id headers, explicit timeout
  -> ERP JAW: GET /api/v1/integrations/website/health
  -> verifyWebsiteIntegrationRequest()         (ERP JAW: src/lib/integration-auth/service.ts)
  -> { status: "ok", requestId }
```

Nothing else was built. No business endpoint, no adapter method beyond the health check, no sync job, no admin UI.

---

## 2. Authentication mechanism (implemented, per `erp-integration-security-plan.md` §1's decision)

A dedicated long-lived API key, reusing the ERP's existing Shopify-connection infrastructure — **zero new database tables, zero schema migration**:

- `IntegrationConnector` (ERP, existing model) — a new seeded row, `key: "website"`, `authType: "api_key"`, added to `prisma/seed.ts` alongside the existing Shopify row.
- `CompanyIntegrationConnection` (ERP, existing model) — one row per company, created by the new `scripts/provision-website-integration.ts` CLI script (not an API route, not a Server Action — a developer/operator tool, mirroring `scripts/provision-user.ts`'s own shape and its explicit "never exposed over the network" convention).
- `IntegrationSecret` (ERP, existing model) — holds the envelope-encrypted API key, `secretType: "api_key"`. This value was **re-added** to `src/constants/secrets.ts`'s `SECRET_TYPES` union (it existed before Milestone 7B under the same name with a different meaning — Shopify's own token — and was renamed to `admin_access_token` at that point; "api_key" now means something structurally different: a credential the ERP *issues and verifies*, not one it *holds to call someone else*). This is a TypeScript constant-array change, not a schema/enum change — `secretType` has always been a plain `String` column.

**Request shape**: `Authorization: Bearer <api-key>` (the secret) + `X-ERP-Connection-Id: <connection-id>` (a public identifier, not itself secret — deliberately mirrors the Shopify webhook route's own `x-shopify-shop-domain` + HMAC-signature split: the identifier says *which* company is asking, the credential proves *that* it's really them).

**Verification** (`src/lib/integration-auth/service.ts`, ERP): resolves the connection by id (tenant-scope-exempt by necessity — there is no `TenantContext` yet at this point, same reasoning as the Shopify webhook route's own pre-auth lookup), decrypts that connection's `api_key` secret via the existing `IntegrationSecretService.getDecryptedSecret()` (which already logs every access to `SecretAccessLog`, success or failure — no new logging mechanism was needed), and compares with `timingSafeEqual` — never a plain `===` on secret material.

**Explicit answer to §4/§7 of the brief**: the Website does **not** reuse Supabase session/browser authentication in any way. The new auth path resolves a `TenantContext` via `getSystemTenantContext()` (an existing, narrow escape hatch previously used only by verified webhook/job paths) — never through `getCurrentUser()`. `src/middleware.ts` gained one new exempted prefix, `/api/v1/integrations/website/`, following the exact precedent already set for `webhooks/`, `cron/`, and `jobs/` (each has its own independent auth; the session-cookie gate was never meant to apply to any of them).

---

## 3. Authorization (least privilege)

The new credential authenticates **a connection, not a person**. It carries no `Role`/`Permission` at all — there is no RBAC surface for it to inherit, correctly, since giving it a human role (even a narrow one) would be the wrong shape for a machine credential. Its entire effective privilege, as of Phase 8, is: resolve to exactly one company's `TenantContext`, nothing else — there is no business endpoint yet for it to call, so "least privilege" today is trivially and maximally satisfied (it can do nothing but prove which company it belongs to). This will need real, per-operation scoping decisions once business endpoints are designed (a future phase) — not a limitation introduced by this phase, but worth naming here so it isn't mistaken for something already solved.

---

## 4. Request/correlation ID

Both repositories now share the exact same convention: header `x-request-id`, `getOrCreateRequestId(request)` (reuse the inbound value if present, else mint a `randomUUID()`).

- **ERP** (`src/lib/request-id.ts`, new — no prior convention existed anywhere in that codebase, confirmed by grep before adding it): the health route calls this, includes the id in its structured `AppLog` entries (`logger.info/warn/error("website_integration", ..., { requestId, ... })`), and echoes it in both the response body and an `x-request-id` response header.
- **Website** (`src/lib/request-id.ts`, already existed from an earlier phase, unchanged): `callErpIntegrationApi()` accepts an optional `requestId` (so a caller already inside a request with its own id can propagate it) or mints one, sends it as `x-request-id`, and returns it on every `ErpRequestResult`/thrown error (`ErpTimeoutError.requestId`, etc.) so it reaches the Website's own logs too.

A single call's id is therefore traceable across both systems' logs without any shared infrastructure beyond the header convention itself.

---

## 5. Structured error contract

**ERP** (`src/lib/integration-http.ts`, new, scoped deliberately to only the new `integrations/website/` route family — every other existing `/api/v1/*` route keeps its own pre-existing ad hoc `NextResponse.json({error...})` shape, untouched): seven codes (`validation_error`, `unauthorized`, `forbidden`, `conflict`, `business_rule_violation`, `server_error`, `unavailable`) mapped to HTTP statuses, `integrationError()`/`integrationSuccess()` helpers. Every `IntegrationAuthError` (three internal reasons: missing/connection-not-found/invalid-credentials) maps to the same `401 unauthorized` response — the specific reason is logged internally only, never returned, so a caller can never probe whether a given connection id exists.

**Website**: no new error contract was needed — `ApiErrorCategory` already reserved an `"erp_integration"` category (mapped to HTTP 500) from an earlier phase, unused until now. The new `client.ts` error classes (`ErpNotConfiguredError`, `ErpTimeoutError`, `ErpUnavailableError`, `ErpAuthenticationError`, `ErpUnexpectedResponseError`) are the typed errors a future caller would map onto that existing category — no mapping was wired into `api-error-mapping.ts` yet, since nothing calls `erpIntegrationService` from a real route in this phase.

Neither side ever returns a stack trace or raw exception message — verified directly by a route test (`route.test.ts`) that asserts a deliberately-leaky-looking internal error message never appears in the JSON response.

---

## 6. Validation

- ERP: `extractPresentedCredentials()` rejects (returns `null`, handled as `missing_credentials`) anything without both a well-formed `X-ERP-Connection-Id` header and a `Bearer `-prefixed `Authorization` header — malformed/missing credentials are rejected before any database query runs.
- Website: `callErpIntegrationApi()` refuses to even attempt a call (`ErpNotConfiguredError`, no `fetch()` invoked) unless all three of `ERP_BASE_URL`/`ERP_API_KEY`/`ERP_CONNECTION_ID` are present — verified by a test asserting the fetch mock is never called in this case.

No route on either side trusts a browser-supplied authorization value — the Website's ERP credentials are read exclusively from server-only `env` (`src/lib/env.ts`, never `NEXT_PUBLIC_*`) inside a module (`src/modules/erp-integration/`) that is never imported by a Client Component, matching the same convention already used for `PaymentProvider`/`ShippingProvider`.

---

## 7. Idempotency — deliberately not built

Per the brief's explicit instruction ("do NOT implement a full idempotency system unless the first integration endpoint genuinely requires it"): the only endpoint that exists is a `GET` health check with no side effects — it needs no idempotency key at all, and none was added. Where future idempotency will live was already designed in Phase 7 (`erp-integration-failure-recovery.md` §2) and is unchanged by this phase: the Website's existing `IdempotencyKey` pattern for outbound pushes, the ERP's existing `ChannelMapping` unique-constraint pattern for inbound dedup — both infrastructure, neither touched this phase.

---

## 8. Timeouts / failure behavior (Website `ErpClient`)

`callErpIntegrationApi()` wraps every call in a real `AbortController` + `setTimeout` (default 5000ms, overridable via `ERP_REQUEST_TIMEOUT_MS`) — a hung ERP can never hang the caller indefinitely. No automatic retry exists yet (deliberately — retries are designed per business operation once one exists, per this phase's own scope boundary). Failure modes are distinguished into typed errors: not-configured, timeout, network-unavailable, authentication-rejected (401/403), unexpected-response (any other non-2xx) — each carrying the `requestId` that produced it.

---

## 9. Database changes

**None.** No migration, no new table, no new column. The only "schema-adjacent" change is the additive `SECRET_TYPES` TypeScript constant (§2) — `secretType` was already a plain string column with no native Postgres enum, so this required no migration. `IntegrationConnector`/`CompanyIntegrationConnection`/`IntegrationSecret` rows for the new "website" connector are data, created by the new seed entry (the connector catalog row) and the new provisioning script (the per-company connection + secret), exactly mirroring how the Shopify connector's own rows already come into existence.

---

## 10. RLS — untouched, per the brief's explicit instruction

`FORCE ROW LEVEL SECURITY`'s status remains exactly as Phase 6/7 found it: **unconfirmed**, tracked in the ERP's own `baseline/PRODUCTION_CHECKLIST.md` §G, unrelated to and not created by this phase. Nothing in Phase 8 modifies any RLS policy file under `prisma/rls/`. The new code path's tenant-isolation guarantee rests entirely on the same mechanism everything else in the ERP already relies on (`TenantContext`/`getSystemTenantContext()`, hand-written `where: companyId` filters) — confirmed by the new code following the identical pattern the tenant-scoping static checker (`npm run check:tenant-scope`) already verifies across the rest of the codebase; that checker was run against the full, changed codebase and passed with zero violations.

---

## 11. Shopify — untouched

No file under `src/modules/integrations/`, `src/modules/connectors/`, `src/app/api/v1/webhooks/[connector]/route.ts`, or any Shopify-specific service/repository was modified. The only files this phase touched that Shopify's own code also happens to depend on are shared, general-purpose infrastructure it already used before this phase existed: `IntegrationSecretService`/`IntegrationSecretRepository` (called with different arguments — a different `connectorKey`/`secretType` — not modified themselves), `src/middleware.ts` (one new array entry, the existing four Shopify/cron/jobs/health entries untouched), and `src/constants/secrets.ts` (one new array value appended, the existing six untouched). Confirmed no behavioral change to Shopify by running the full typecheck/lint/build (§13) — the Shopify admin UI, sync jobs, and webhook handling compile and build identically to before this phase.

---

## 12. Tests added

| File | What it covers | Touches a real database? |
|---|---|---|
| ERP `src/lib/integration-auth/service.test.ts` | Header parsing (pure); full auth flow (missing credentials, unknown connection, missing secret, wrong key, correct key) against a genuine envelope-encrypted secret and an in-memory fake `db` | No |
| ERP `src/app/api/v1/integrations/website/health/route.test.ts` | Route-level response shaping: 401 on auth failure, 500 with no leaked detail on unexpected failure, minimal `{status, requestId}` success body, request-id propagation and minting | No |
| Website `tests/unit/erp-client.test.ts` | Not-configured guard (fetch never called), header construction (auth/connection-id/request-id, key never in the URL), request-id propagation and minting, 401/403→auth error, other non-ok→unexpected-response error, network failure→unavailable error, real-timeout→timeout error via an actual `AbortController` | No |

**Total new tests**: 15 (ERP) + 10 (Website) = 25, all passing. See §13 for exact commands run and their results.

**What was deliberately NOT tested**: any live call against a real running ERP instance (would require a live Supabase project + a real provisioned connection — out of reach of this sandboxed session, and not needed to verify the logic itself, which is fully exercised above). A manual end-to-end smoke test (run `npm run provision:website-integration` in the ERP repo, put the printed values in the Website's `.env`, call `erpIntegrationService.checkConnection()` from a scratch script) is recommended before this foundation is built upon, but was not performed as part of this phase.

---

## 13. Verification — exact commands run and results

**ERP** (`E:\Engineering\Projects\Jawaher\ERP JAW`):
- `npx vitest run src/lib/integration-auth/service.test.ts` — 10 passed
- `npx vitest run src/app/api/v1/integrations/website/health/route.test.ts` — 5 passed
- `npm run typecheck` — clean, zero errors
- `npm run lint` — clean, zero warnings/errors
- `npm run check:tenant-scope` — 137 files scanned, 0 violations
- `npm run build` — succeeded; `/api/v1/integrations/website/health` appears correctly in the route manifest

The existing `tests/rls/` suite was **deliberately not run** — its own `.env.example` comment states it "creates and deletes tenants and is destructive by design" against whatever `TEST_DATABASE_URL` points to. Running it was outside this phase's scope and risked real, unrelated data loss for no verification benefit (nothing in this phase touches RLS policy).

**Website** (`E:\Engineering\Projects\Jawaher\WEB JAW`):
- `npx vitest run tests/unit/erp-client.test.ts` — 10 passed
- `npm test` (full suite) — 83 passed, 22 skipped (pre-existing DB-dependent integration tests that skip gracefully without a local database in this sandbox — not a regression; 0 failed), 14 test files passed
- `npm run typecheck` — clean, zero errors
- `npm run lint` — clean, zero errors
- `npm run build` — succeeded; no new route added (the ERP Adapter is not yet wired into any existing API route or UI — correct, since no business behavior was meant to change this phase)

---

## 14. Known limitations / deferred decisions (nothing hidden)

- No rate limiting on the new ERP endpoint yet — the existing connector-runtime rate limiter is shaped for outbound-retry-after-failure, not inbound abuse protection; a future phase should add one before real traffic, especially since this is now a network-reachable endpoint even though it does nothing.
- The generated API key format (`whk_<48 random base64url chars>`) is this phase's own choice, not something the plan documents specified — a reasonable, unremarkable default, not a business decision requiring sign-off.
- No admin UI to view/rotate/revoke the website connection exists — `scripts/provision-website-integration.ts` is a CLI-only tool, matching `scripts/provision-user.ts`'s own precedent; a future phase may want a real admin screen (the existing `/admin/integrations/shopify` page is the model to follow) but this wasn't required for a minimal foundation.
- `erpIntegrationService.checkConnection()` is not called from anywhere in the Website's running application yet (no health-check page, no startup check) — it exists and is tested, but nothing invokes it in production. Wiring it in (e.g. to an ops dashboard) is a reasonable small future step, not performed here to stay within "foundation only."
- The plan (`erp-integration-security-plan.md` §1) proposed choosing between OAuth, client-credentials-grant, and a static API key; this phase implemented the static-API-key option exactly as recommended there — no deviation.

Nothing in the approved Phase 7 plan needed to change because of what this phase learned while implementing it — every design decision from `erp-integration-security-plan.md`/`erp-integration-architecture.md` held up against the real ERP code.
