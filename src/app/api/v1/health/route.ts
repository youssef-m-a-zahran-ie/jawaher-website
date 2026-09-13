import { apiSuccess } from "@/lib/api-response";
import { db } from "@/lib/db";
import { loggerForRequest } from "@/lib/logger";
import { getOrCreateRequestId } from "@/lib/request-id";

/**
 * The one Phase 1 API route. Its only job is to prove the
 * frontend-never-touches-the-database-directly boundary end to end: this
 * server-side handler is the sole thing allowed to import `db`, and it
 * degrades gracefully (never throws/500s the whole request) if the
 * database is unreachable — a foundation genuinely needs to survive a
 * database outage without crashing, not just succeed when everything works.
 *
 * This is a READINESS check, not a bare liveness ping (docs/architecture/
 * production-readiness.md's Phase 12 §13): it verifies the one dependency
 * (Postgres) this app cannot serve real commerce traffic without. ERP is
 * deliberately NOT checked here — an ERP outage degrades specific features
 * gracefully (documented fail-closed/fail-open behavior throughout
 * checkout/catalog) rather than making the whole site unable to serve
 * traffic, so it must never flip this endpoint to "not ready" and pull a
 * healthy instance out of rotation over a dependency the app already
 * knows how to survive without.
 *
 * Phase 12 fix: previously always returned HTTP 200 even when
 * `status: "degraded"` — a naive infrastructure health check (load
 * balancer, container orchestrator) that only looks at the status code,
 * not the response body, would have read a database outage as healthy.
 * Now returns 503 when not ready, so status-code-only probes behave
 * correctly too; the JSON body still carries the same detail either way.
 */
export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const log = loggerForRequest(requestId);

  let database: "ok" | "error" = "ok";
  try {
    await db.$queryRaw`SELECT 1`;
  } catch (error) {
    database = "error";
    log.warn({ err: error }, "health check: database unreachable");
  }

  const status = database === "ok" ? "ok" : "degraded";
  const httpStatus = status === "ok" ? 200 : 503;

  return apiSuccess({ status, checks: { database } }, { status: httpStatus, headers: { "x-request-id": requestId } });
}
