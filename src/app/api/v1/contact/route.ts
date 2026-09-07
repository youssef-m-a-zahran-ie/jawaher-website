import { apiError, apiSuccess, parseOrError } from "@/lib/api-response";
import { loggerForRequest } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { getOrCreateRequestId } from "@/lib/request-id";
import { contactSchema } from "./schema";

/**
 * Contact form endpoint — real and functional, but not yet connected to a
 * human notification channel (email/SMS): that's the Notifications
 * module's job, a later phase. For now this validates, rate-limits, and
 * logs the inquiry via the structured logger (src/lib/logger.ts), which is
 * genuinely reviewable by whoever operates the app — not a fake success
 * response over data that goes nowhere. Keeps the Contact page real
 * instead of either a dead form or an invented notification claim (this
 * phase's brief: don't fabricate delivery/contact promises).
 */
export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const log = loggerForRequest(requestId);

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rate = checkRateLimit(`contact:${ip}`, 5, 60_000);
  if (!rate.allowed) {
    return apiError("business_rule", "rate_limited", "عدد المحاولات كبير، برجاء المحاولة لاحقًا.");
  }

  const body = await request.json().catch(() => null);
  const parsed = parseOrError(contactSchema, body);
  if (!parsed.success) return parsed.response;

  log.info({ ...parsed.data }, "contact inquiry received");

  return apiSuccess({ received: true }, { headers: { "x-request-id": requestId } });
}
