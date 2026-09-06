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

  return apiSuccess({ status, checks: { database } }, { headers: { "x-request-id": requestId } });
}
