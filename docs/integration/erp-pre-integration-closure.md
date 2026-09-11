# ERP Pre-Integration Closure — Phase 8.5

The master closure gate between "integration foundation implemented" (Phase 8) and "ready to begin business-data integration" (Catalog, Inventory, Customer, Order, Payment, Shipping, Reconciliation, Shopify cutover — all still future, separately-reviewed phases). Every finding below was either verified against the real running system or resolved in code, with evidence — nothing here is asserted without a citation to a real command, query, or test run.

Status: Phase 8.5, complete. Last updated: 2026-09-11.

---

## 1. Executive status

**Zero new BLOCKER-severity items found.** This phase closed the single largest pre-existing open item from Phase 6/7 (RLS's `FORCE ROW LEVEL SECURITY` status — now confirmed correct, live, not just planned-to-be-checked), added a real cross-tenant isolation test, ran a genuine end-to-end connectivity test against a real running ERP with real credentials (not mocked), and confirmed — by full source grep, not inference — that no courier/3PL integration exists anywhere in the ERP. One ERP code change was made (a new test), tied directly to the RLS/tenant-isolation verification this phase performed; no other code changes were necessary. All remaining open items are genuine business decisions (unchanged in substance from Phase 7, consolidated here) or items that structurally cannot be resolved before the Catalog/Order integration phases exist.

---

## 2. Complete open-item register

Built from a fresh read of every document under `docs/integration/`, plus new code/database inspection this phase. Classification key: **A** technical, resolve now · **B** security, verify/fix now · **C** integration design, resolve now · **D** business decision, human required · **E** depends on future business integration phase · **F** requires external infrastructure · **G** intentionally deferred · **H** obsolete/already resolved.

| # | Item | Source | Class | Outcome this phase |
|---|---|---|---|---|
| 1 | ERP inbound API-key auth path didn't exist | Phase 6/7 gap analysis | A | **Resolved in Phase 8**, re-verified live this phase (§6) |
| 2 | ERP generalized order-create entry point doesn't exist | Phase 6/7 | E | Still absent — belongs to the Order Integration phase, not this one |
| 3 | ERP generalized customer-reconcile capability doesn't exist | Phase 6/7 | E | Still absent — Customer Integration phase |
| 4 | ERP inventory-aggregation read endpoint doesn't exist | Phase 6/7 | E | Still absent — Catalog/Inventory Integration phase |
| 5 | Order confirm-gate (auto-confirm vs. moderation queue) | Phase 7 §12 item 1 | D | Unchanged, open — see §11 |
| 6 | Guest-customer ERP policy | Phase 7 §12 item 2 | D | Unchanged, open — see §11 |
| 7 | Website `erp-integration` module didn't exist | Phase 7 gap table | A | **Resolved in Phase 8**, re-verified this phase (§7) |
| 8 | Website scheduler mechanism undecided | Phase 7 gap table | C | **Resolved as a design decision this phase** — see §3 |
| 9 | Website dead-letter/sync-history table doesn't exist | Phase 7 gap table | E | Correctly deferred — its shape depends on the Order Integration phase's real payload, building it now would be guessing |
| 10 | Tax policy unresolved on both sides | Phase 6/7 | D | Unchanged, open — see §11 |
| 11 | Online payment provider unchosen | Phase 5/7 | D | Unchanged, open — see §11 |
| 12 | Returns/refunds policy + workflow | Phase 1/5/6/7 | D | Unchanged, open — see §11 |
| 13 | `Category.erpCategoryId` column missing | Phase 6/7 | E (gated on D) | Trivial to add once the category-display decision (§11) is made; not done now to avoid guessing the shape |
| 14 | RLS `FORCE ROW LEVEL SECURITY` status unconfirmed | Phase 6/7, ERP's own `PRODUCTION_CHECKLIST.md` §G | B | **RESOLVED — verified live this phase.** See §5. |
| 15 | Courier/shipping-ERP relationship "inferred, not proven" | Phase 6/7 | B/A | **RESOLVED — confirmed by full source grep this phase.** See §5.4 |
| 16 | Cross-tenant isolation of the new integration-auth path — not explicitly tested | Found by this phase's own security review | B | **RESOLVED — new test added and passing.** See §4.1 |
| 17 | No rate limiting on the new health endpoint | Phase 8's own doc, §14 | G | Reassessed and deliberately deferred, with reasoning — see §4.2 |
| 18 | Live end-to-end connectivity never actually run | Phase 8's own doc, §12 | A | **RESOLVED — run live this phase.** See §6 |
| 19 | Malformed (non-UUID) connection-id input — untested | Found by this phase's own security review | B | **RESOLVED — live-tested, confirmed safe (401, not 500).** See §4.3 |
| 20 | Shipping provider / courier business decision | Phase 5/7 | D | Narrowed: the *technical* question (does ERP have one) is now H/resolved-no; the *business* question (should the site ever add a real courier) remains D, independent of the ERP entirely |
| 21 | Delivery zones/fees are seed-placeholder values | Phase 5 (`commerce-completeness-audit.md` §9) | G | Not blocking anything; a real-pricing pass is a business input whenever convenient, not gated on ERP integration |
| 22 | Cancellation policy (time window, who can cancel when) | Phase 1 original finding | D | Unchanged, open — distinct from the ERP's own technical "no cancel after payment allocated" rule, which is a resolved fact, not a decision |
| 23 | Customer ownership model | Phase 5 `blueprint.md` §7, ADR-006 | H | **Already resolved** by the already-approved architecture (Website owns identity, ERP reconciled at order time) — not an open decision, listed in the brief's checklist for completeness only |
| 24 | Reservation duration (TTL) | Phase 5 (`commerce-completeness-audit.md` §5) | H | **Already resolved and working** (15-minute default, centrally configurable) — not reopened by ERP integration |
| 25 | COD confirmation policy | Phase 5/6 | H | **Already resolved and working** (COD confirmed at order creation, cash collected/recorded manually at delivery) — the only remaining piece folds into item 5 (confirm-gate) once orders reach the ERP |
| 26 | Guest OTP provider (no real SMS/WhatsApp wired) | Phase 5 (`customer-journeys.md`/checkout docs) | G | **Not an ERP-integration item at all** — a general production-readiness gap already tracked independently; out of this phase's scope, noted only for completeness |
| 27 | Marketing consent | Brief's checklist §16 | — | **Not found as a tracked open item anywhere in this project's documentation.** Not invented here — nothing currently depends on it |
| 28 | Product media / photography sourcing | Phase 6/7 | D (content-ops) | Unchanged — resolved architecturally as website-owned (neither side has a real model), but *who supplies photography* remains a content-operations input, not blocking |
| 29 | Compare-at price ownership | Phase 6 | H | Already resolved (website-owned — no ERP field exists for it) |
| 30 | Barcode field on the Website | Phase 6 | G | Deferred — no real requirement identified yet (future POS/in-store only) |
| 31 | FEFO/lot-tracking not enforced in ERP fulfillment code | Phase 6 finding | G | **Not an integration-blocking item** — an ERP-internal data-quality/traceability backlog item, unrelated to the Website boundary; not touched, not this phase's business |
| 32 | `qc`/`failed_delivery` dead ERP enum values | Phase 6 finding | H | Already fully documented — the Website's status-mapping table (Phase 7) already excludes them explicitly; nothing further to resolve |
| 33 | ERP's own pre-existing backlog (CSP `unsafe-inline`, Weighted-Average-perpetual costing, `Invoice`→`InvoiceLine`, connector rate-limiter races) | ERP's own `PRODUCTION_CHECKLIST.md` | H (out of scope) | Pre-existing, unrelated to Website integration, not re-audited by this phase — correctly out of scope per this phase's own "no unrelated ERP changes" rule |
| 34 | CLAUDE.md / `baseline/` docs describe a stale "no real code" state | Phase 6 finding | H | Already documented in `erp-discovery.md` §2; no further action — fixing the ERP's own stale docs is outside this Website-repo-scoped phase's authority |

**Zero items were left unclassified.** Items 2–4 (E) and 9 (E) are the only ones that structurally cannot be resolved before their respective future phases exist — not because they were skipped, but because their correct shape depends on decisions/designs those future phases own.

---

## 3. Resolved items — detail

- **#8, Website scheduler mechanism**: resolved as a design decision (not a business decision) — **GitHub Actions on a schedule**, directly following the ERP's own real-incident-informed precedent (moved off Vercel Cron after a 2026-08-19 retry-storm incident, per `erp-shopify-integration-analysis.md` §2). This is an engineering/ops choice with a clear, evidence-based answer, not a product/policy question — it does not go into the Business Decision Register. No code was written for it yet, since nothing exists to schedule until the Catalog Integration phase adds a sync job; the decision itself is what's being closed out now, so that phase can start immediately without re-deriving it.
- **#1, #7**: re-verified rather than re-built — see §6/§7.
- **#14, #15, #16, #18, #19**: see §4/§5/§6 for full evidence.

---

## 4. Security verification (§6 of the brief)

### 4.1 Cross-tenant isolation — new test added

The existing Phase 8 test suite only ever exercised one connection/company at a time. This phase added `src/lib/integration-auth/service.test.ts`'s `"never resolves Company A's connection using Company B's real api_key"` test: two companies, two connections, two real (envelope-encrypted) keys — confirms Company B's genuinely-correct key is rejected against Company A's connection id, and that each company's own key still works against its own connection. **Passing.** Full suite now 11 tests (was 10), all green.

### 4.2 Rate limiting — reassessed, deliberately not added

Considered whether the missing rate limiting on `/api/v1/integrations/website/health` (flagged as a known limitation in Phase 8's own doc) constitutes a real defect requiring an immediate fix. Concluded **no**, for three concrete reasons: (a) a request with no credentials is rejected by `extractPresentedCredentials()` before any database call — the cheap, common case of a credential-less flood costs almost nothing; (b) the credential space (a connection UUID plus a 192-bit random API key) makes brute-forcing computationally infeasible regardless of throttling; (c) the endpoint performs no mutation and returns nothing beyond `{status:"ok"}` — there is no data to protect by rate-limiting it. Per the brief's own instruction ("do NOT redesign security unless a real issue is found"), this was left as a documented, deliberate deferral (class **G**), not fixed — adding it now would mean pulling in the `ConnectorSyncRun`/`InboundConnectorStrategy` machinery to protect an endpoint with nothing worth protecting yet, which is exactly the kind of speculative complexity this project's own Constitution rule 9 ("smallest mechanism, no speculative abstraction") warns against.

### 4.3 Malformed input — live-tested, safe

A live request with a syntactically-invalid (non-UUID) `X-ERP-Connection-Id` value was sent to the real running endpoint. Result: a clean `401 Unauthorized` (`{"error":{"code":"unauthorized","message":"Authentication failed."}}`), not a `500` — confirming Prisma/Postgres handle the malformed value gracefully (no match, not a thrown type error) and the route's own error handling never had to fall back to its generic 500 path for this case. No fix was needed; this was a real, previously-untested edge case now confirmed safe.

### 4.4 Full checklist (§6 of the brief)

| Item | Status |
|---|---|
| API key authentication | Verified — real key required, live-tested (§6) |
| API key storage | Unchanged from Phase 8 — envelope-encrypted `IntegrationSecret`, reused as-is |
| Secret retrieval | Unchanged — `IntegrationSecretService.getDecryptedSecret()`, logs every access unconditionally (confirmed live — see §6.5) |
| Secret masking | Confirmed — no route, log line, or error message anywhere includes a raw key value (checked by direct code read and by a route test asserting no leaked exception detail) |
| Service-to-service authentication | Verified live end to end (§6) |
| Authorization / least privilege | Unchanged from Phase 8 — the credential carries no RBAC role at all, can do nothing but resolve to one company's `TenantContext`; there is still no business endpoint for it to over-reach into |
| Request validation | Verified, including the new malformed-UUID case (§4.3) |
| Correlation ID | Verified live — every response carries the id, custom inbound ids are echoed verbatim (§6) |
| Structured errors | Verified — every failure mode returns the same minimal shape, no stack traces, no internal detail (route test + live 401s) |
| Timeout | Unchanged from Phase 8 (real `AbortController`, unit-tested); not re-exercised live this phase (see §6's note on why) |
| Server-only Website credentials | Confirmed — `ERP_API_KEY`/`ERP_CONNECTION_ID` read only from server-only `env.ts`, never `NEXT_PUBLIC_*`; grep confirms zero importers of `src/modules/erp-integration/` outside its own module and tests (§7) |
| No browser exposure | Confirmed — same grep as above; no Client Component, hook, or `"use client"` file references the module |
| No secret exposure | Confirmed live — inspected the real `AppLog`/`SecretAccessLog` rows written during testing (§6.5); no key value appears anywhere |
| No unnecessary PII logging | Confirmed — the only fields logged are `requestId`, `companyId`, and (on failure) the internal `reason` enum; no phone/email/name/address exists in this code path at all |

---

## 5. RLS verification (§7 of the brief) — the phase's most consequential finding

Performed against the real, live Supabase Postgres database (`DATABASE_URL`), via read-only `pg_class`/`pg_roles` introspection queries — no data was modified, no policy was changed.

**1. Is RLS enabled?** Yes, on every table checked.
**2. Is FORCE RLS enabled where appropriate?** Yes — confirmed for all 88 tables in the `public` schema (`relkind='r'`): `count(*) filter (where relforcerowsecurity) = 88`, i.e. 100%. A supplementary query for tables *without* `relforcerowsecurity` returned an empty set.
**3. Which tables are tenant-sensitive?** Effectively all 88 — the ERP's own schema design (per `erp-discovery.md` §4) puts `companyId` on nearly every business table; a targeted sample (`companies`, `users`, `sales_orders`, `sales_order_lines`, `business_partners`, `stock_quants`, `stock_reservations`, `stock_moves`, `integration_secrets`, `company_integration_connections`, `integration_connectors`) was individually confirmed `relrowsecurity=true, relforcerowsecurity=true`.
**4. What identity executes Website integration requests?** `getSystemTenantContext(connection.companyId)` — no Postgres role change, no session variable, no RLS-relevant identity at all; isolation for this path rests entirely on the application-level `TenantContext` mechanism, same as every other system-triggered path in this codebase (webhooks, jobs).
**5/6/7. Can the integration identity bypass tenant isolation / access another company?** No — see §4.1's new cross-tenant test, and the design itself: the connection lookup is by an unguessable UUID, and a caller must additionally present that *specific* connection's own decrypted secret; there is no code path that lets a request read or write any `companyId` other than the one its own connection resolves to.
**8. Are service-role privileges broader than intended?** Investigated precisely: `select rolname, rolsuper, rolbypassrls, rolcanlogin from pg_roles` shows `postgres` (the app's `DATABASE_URL` role) and `service_role` both have `rolbypassrls: true, rolsuper: false` — **not** literal Postgres superusers (correcting ADR-0001's own informal "superuser" phrasing to the precise mechanism), but functionally equivalent for RLS purposes by design. `anon` and `authenticated` (the roles PostgREST/Supabase client libraries use) both show `rolbypassrls: false` — RLS **genuinely applies** to those paths, which is exactly the defense-in-depth ADR-0001 claims. **Conclusion: this is the system working exactly as designed, not a gap.** The item is moved from "unconfirmed" to **resolved, no defect found**.

Exact queries and full result sets are reproduced in this phase's working notes (not committed — see §9 on why); the counts and role attributes above are the real, live output.

---

## 6. Live Website ↔ ERP verification (§8 of the brief)

Performed for real — no fake ERP server, no mocked `fetch`, using genuine local-development credentials.

1. `npm run provision:website-integration` (ERP repo) — created a real `CompanyIntegrationConnection` + envelope-encrypted `IntegrationSecret` for the demo company (`00000000-0000-0000-0000-000000000001`), one-time-printed connection id + API key.
2. `npm run dev` (ERP repo) — real Next.js dev server on `localhost:3000`, confirmed ready via `GET /api/v1/health` → `200`.
3. Six real `curl` requests directly against `GET /api/v1/integrations/website/health`:

| # | Scenario | Result |
|---|---|---|
| 1 | Valid credentials | `200 {"status":"ok","requestId":"<uuid>"}` |
| 2 | Missing credentials (no headers) | `401 {"error":{"code":"unauthorized","message":"Authentication failed."}}` |
| 3 | Invalid credentials (right connection id, wrong key) | `401`, same shape |
| 4 | Malformed metadata (`Authorization: Basic ...` instead of `Bearer`) | `401`, same shape |
| 5 | Correlation id propagation (`x-request-id: live-test-fixed-id-123` sent) | `200`, response body **and** header both echo `live-test-fixed-id-123` verbatim |
| 6 | Nonexistent connection id (well-formed UUID, no such row) | `401`, same shape as #3 — never distinguishable from a wrong key, by design |

4. Then, using the **actual Website client code** (`erpIntegrationService.checkConnection()` from `src/modules/erp-integration/service.ts`, real `fetch`, real network calls to `localhost:3000`) via a temporary vitest integration test (not committed — see §9):
   - Real success: `{"ok":true,"requestId":"live-website-adapter-rid-1"}`.
   - Real `401` from the real ERP correctly mapped to `ErpAuthenticationError`.
   - A real connection-refused (pointed at a closed port, `localhost:59999`) correctly mapped to `ErpUnavailableError`.

5. Confirmed observability end to end by reading the real `AppLog` and `SecretAccessLog` tables after the run: every request produced a matching `AppLog` row (`source: "website_integration"`, correct `level`, correct `reason` on failures, correct `requestId`), and every credential check produced a `SecretAccessLog` row (`outcome: "success"`, `actor: "website_integration_auth"`, `purpose: "authenticate_inbound_website_request"`) — no secret value in either table.
6. Cleanup: the dev server processes were stopped; the demo company's connection/secret rows were **left in place** (a legitimate, reusable local-dev credential, not a throwaway — consistent with how `scripts/provision-user.ts`'s demo users are also left in place for ongoing local development).

**Timeout**: not separately re-verified live (simulating a real network-level timeout reliably against a real server is impractical and would have meant deliberately degrading the dev server) — the mechanism itself (`AbortController` + `setTimeout`) is real production code already exercised deterministically in `tests/unit/erp-client.test.ts`'s timeout test, which passed. This is stated plainly as a scope limitation, not glossed over: **the timeout path is unit-verified with real abort semantics, not live-network-verified.**

**8 of the 8 requested test scenarios were performed for real; the 9th (network-level timeout under live conditions) was deliberately not attempted live, for the reason stated, and is not counted as "verified live" — only as "verified" via the existing deterministic unit test.**

---

## 7. Website ERP Adapter verification (§10 of the brief)

- **Server-only boundary**: `src/modules/erp-integration/client.ts` imports only server-only modules (`@/lib/env`, `node:crypto`). No `"use client"` directive anywhere in the module.
- **No client imports / no browser calls**: `grep -rln "erp-integration|erpIntegrationService|callErpIntegrationApi" src/` (excluding the module's own files) returned exactly one match — a comment in `src/lib/env.ts` referencing the module by name, not an import or call. **Zero real usages anywhere else in the Website codebase.**
- **Environment validation**: `ERP_BASE_URL`/`ERP_API_KEY`/`ERP_CONNECTION_ID`/`ERP_REQUEST_TIMEOUT_MS` are all validated through the existing `envSchema` (Zod), the one and only place `process.env` is read server-side, unchanged convention.
- **Timeout, error mapping, request-id propagation, authentication**: unit-tested (Phase 8) and now also live-tested (§6).
- **No secret logging**: confirmed by code read — no `console.log`/`logger` call in `client.ts` or `service.ts` ever includes `env.ERP_API_KEY`.
- **No accidental business-flow dependency**: confirmed by the same grep above and by the fact that `npm run build`'s route manifest is unchanged from before this module existed (no new Website route was added; nothing wires it into checkout, cart, or any customer-facing flow).

---

## 8. ERP integration API verification (§11 of the brief)

- **Route protection**: `/api/v1/integrations/website/` is exempted from the session-cookie gate in `src/middleware.ts` specifically (narrow literal prefix, not a broad pattern) and protected instead by `verifyWebsiteIntegrationRequest()` — live-confirmed (§6).
- **Authentication/authorization**: covered in §4/§5.
- **Request validation**: header presence + format checked before any DB call; malformed input confirmed safe (§4.3).
- **Response/error contract**: exactly `{status:"ok",requestId}` on success, exactly `{error:{code,message},requestId}` on failure — confirmed both by the route test and live curl output (§6), byte-for-byte consistent.
- **Request ID**: confirmed live, both directions (mint-when-absent and echo-when-present, §6 scenario 5).
- **Logging**: confirmed live via real `AppLog` rows (§6.5).
- **No business data leakage**: the success response has exactly two keys (`status`, `requestId`) — verified both by a route test asserting `Object.keys(body).sort()` and by direct inspection of the real live response body.
- **No mutation**: `GET` only; the handler's only write is the logging call itself (`AppLog`/`SecretAccessLog`), not a business record.
- **Tenant safety**: covered fully in §5.
- **Intentionally minimal**: confirmed — it is the only route under this prefix, and does nothing beyond authenticate and echo a status.

---

## 9. Shopify isolation verification (§12 of the brief)

`git diff d0cbfa1 HEAD --stat` (the commit immediately before Phase 8 began) restricted to every Shopify-relevant path — `src/modules/integrations/*`, `src/modules/connectors/*`, `src/app/api/v1/webhooks/*`, `src/app/api/v1/cron/shopify*`, `src/features/integrations/*` — returns **empty**. Zero files touched. The only files this phase's changes share with Shopify's own code are general-purpose, pre-existing infrastructure (`IntegrationSecretService`/`IntegrationSecretRepository`, called with different arguments — a different `connectorKey`/`secretType` — never modified themselves; `src/middleware.ts`, one new array entry alongside the four pre-existing Shopify/cron/jobs/health entries, all four untouched; `src/constants/secrets.ts`, one new array value appended, the existing six untouched). The full `npm run build` (Phase 8, re-confirmed Phase 8.5) compiles every Shopify admin page (`/admin/integrations/shopify`, `/admin/integrations/shopify/diagnostics`, `/admin/integrations/shopify/monitoring`) identically to before. **Coexistence is clean: two independent connectors sharing the same generic, pre-existing connector infrastructure, exactly as that infrastructure was designed to support.**

---

## 10. Database safety verification (§13 of the brief)

| Check | Result |
|---|---|
| ERP `prisma/schema.prisma` changed since before Phase 8? | `git diff d0cbfa1 HEAD --stat -- prisma/schema.prisma` → empty. **No schema changes.** |
| ERP `prisma/migrations/` exists / changed? | Directory does not exist (this project uses `prisma db push`, not tracked migrations — confirmed in Phase 6, still true). Nothing to check beyond the schema diff above. |
| ERP `package-lock.json` changed? | `git diff d0cbfa1 HEAD --stat -- package-lock.json` → empty. **Zero new dependencies.** |
| ERP new tables? | None. `IntegrationConnector`/`CompanyIntegrationConnection`/`IntegrationSecret` are pre-existing models, reused with a new `key`/`connectorKey`/`secretType` value each (data, not schema). |
| ERP accidental data mutation? | The only real-database writes this phase performed were the explicitly-sanctioned live-verification steps in §6 (one seed re-run — idempotent upserts only, confirmed by reading `seed.ts` for any `deleteMany`/`delete` calls beforehand — found exactly one, narrowly scoped to `rolePermission.deleteMany({where:{roleId}})`, an existing idempotent re-sync step unrelated to this phase's own change; and one new connection/secret row for the demo company, which is the intended output of `provision-website-integration.ts`, not an accident) |
| Website `prisma/schema.prisma` changed? | `git diff 6069db9 HEAD --stat -- prisma/schema.prisma` → empty. **No schema changes.** |
| Website `package-lock.json` changed? | Empty diff. **Zero new dependencies.** |

**Explicitly confirmed: Phase 8 created zero schema changes on either side, and this phase (8.5) created zero additional schema changes — only one small ERP test-file addition and Website documentation.**

---

## 11. Remaining business decisions (§16 of the brief) — nothing invented

| Question | Why it matters | Affected system | Affected phase | Current options | Recommended (only where technically justified) | Status |
|---|---|---|---|---|---|---|
| Should a Website-originated order auto-confirm in the ERP, or queue for the same human moderation Shopify orders go through? | Directly determines the size of the inventory double-sell window (`erp-inventory-analysis.md`) — the single highest-value unresolved question from this whole audit | ERP (order-create entry point), Inventory | Order Integration | (a) auto-confirm, (b) queue like Shopify | (a), because a website order already passed the Website's own payment/reservation gates before ever being pushed — stated as a recommendation only, not adopted | **OPEN — D** |
| Does a guest web order create a permanent ERP `BusinessPartner`, or a distinct "walk-in" bucket? | Determines the customer-reconcile design | ERP (customer module), Customer Integration | Customer Integration | (a) reuse Shopify's own precedent (create real, minimal record), (b) build a new anonymous-customer concept | (a), lowest new-build cost, consistent with existing precedent | **OPEN — D** |
| What is the real tax/e-invoicing policy? | Neither side has resolved this — not just "needs ERP inspection," genuinely unmodeled on both sides | Website `TaxPolicy`, ERP order model | Order Integration | Unknown — a compliance question | None offered — outside engineering's competence to recommend | **OPEN — D** |
| Which online payment provider? | Blocks any non-COD payment path | Website Payments module | Payment Integration | Not enumerated in any doc | None | **OPEN — D** |
| Should the Website ever integrate a real courier, independent of the ERP? | The ERP is now confirmed to have no courier concept at all (§4/§9 above) — this decision is now fully independent of ERP integration | Website Shipping module | Unrelated future phase | (a) stay with `ManualShippingAdapter`, (b) add a real courier | None — a pure business choice with no technical dependency either way | **OPEN — D, but fully decoupled from ERP integration now** |
| What is the returns/refunds policy? | Both sides are immature (ERP: pre-delivery-only; Website: unmodeled) | Both | Its own future phase | Unknown | None | **OPEN — D** |
| What is the real cancellation policy (time window, who can cancel when)? | Distinct from the ERP's own already-resolved technical rule (no cancel after payment allocated) | Website Orders | Order Integration | Unknown | None | **OPEN — D** |
| Who supplies/hosts real product photography? | Neither system has a media model — a genuine content-operations gap, not just a schema gap | Website Content module | Catalog Integration (adjacent) | Unknown | None (a business/ops staffing question, not engineering) | **OPEN — D** |

**Everything else previously flagged as a business decision in Phase 7 (reservation duration, COD confirmation behavior, customer ownership) is already resolved by the existing, working, approved architecture — see register items 23–25 in §2. They are not re-opened here.**

---

## 12. Remaining future-dependent items (cannot be resolved now, and why)

| Item | Why it must wait | Which future phase resolves it |
|---|---|---|
| ERP generalized order-create entry point | Its exact shape depends on the order confirm-gate decision (§11) — building it now would encode an undecided policy as false authority, the exact risk the ERP's own Business Discovery document warned about for its Partner Equity module | Order Integration |
| ERP generalized customer-reconcile capability | Depends on the guest-customer policy (§11) | Customer Integration |
| ERP inventory-aggregation read endpoint | Needs a real consumer (the Catalog sync job) to be designed against — building it in isolation risks guessing the wrong shape | Catalog/Inventory Integration |
| Website dead-letter/sync-history table | Its shape depends on what's actually being synced/pushed — premature now | Catalog or Order Integration, whichever ships first |
| `Category.erpCategoryId` column | Gated on the category flat-vs-hierarchical display decision, itself gated on seeing the ERP's real category data at scale | Catalog Integration |
| Real payment-status acceptance path in the ERP | No online payment method exists on the Website yet either — nothing to accept | Payment Integration |
| Rate limiting on future data-bearing endpoints | Not yet needed (§4.2) — becomes worth revisiting once an endpoint actually returns/mutates something | Whichever phase adds the first real business endpoint |

---

## 13. Final readiness gate

### TECHNICAL FOUNDATION
**READY**

### SECURITY FOUNDATION
**READY**

### LIVE CONNECTIVITY
**VERIFIED** (8 of 9 requested scenarios live; the 9th — network timeout — verified via a real `AbortController` unit test only, stated explicitly in §6, not silently counted as live)

### ERP RLS / TENANT ISOLATION
**VERIFIED**

### WEBSITE ERP ADAPTER
**READY**

### ERP INTEGRATION API
**READY**

### SHOPIFY ISOLATION
**VERIFIED**

### BUSINESS DECISIONS THAT ACTUALLY BLOCK FUTURE IMPLEMENTATION
1. Order confirm-gate (auto-confirm vs. moderation) — blocks the Order Integration phase's entry-point design
2. Guest-customer ERP policy — blocks the Customer Integration phase's reconcile design
3. Tax policy — blocks any real (non-placeholder) tax field in the Order Integration phase
4. Online payment provider — blocks the Payment Integration phase entirely
5. Returns/refunds policy — blocks any returns/refunds work on either side

*(Shipping/courier, cancellation-window policy, and product-photography sourcing remain open per §11 but do not block the next phase's start — they can be decided in parallel.)*

### FUTURE DEPENDENCIES THAT CANNOT BE RESOLVED NOW
See §12 in full — summarized: the ERP-side order-create/customer-reconcile/inventory-read endpoints, the Website's dead-letter table, and the `erpCategoryId` column all correctly wait for their consuming phase's real design, not for lack of effort now.

---

## 14. What this phase deliberately did not touch

Per §20 of the brief: current Website checkout/reservation behavior, current ERP order-approval/inventory/payment/shipping behavior, and Shopify behavior were not changed — confirmed by the diffs in §9/§10 and by the fact that the only ERP code change this phase made was a new test file. No business-data integration (Catalog/Inventory/Customer/Order/Payment/Shipping/Reconciliation/Shopify cutover/Website Admin) was started.
