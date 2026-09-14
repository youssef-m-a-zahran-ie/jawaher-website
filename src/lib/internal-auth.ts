import { apiError, type ApiError } from "@/lib/api-response";
import { env } from "@/lib/env";
import type { NextResponse } from "next/server";

/**
 * Shared authorization check for every `/api/v1/internal/*` route
 * (the inventory-reservation sweep, Phase 12's ERP-push retry sweep, and
 * any future one) — extracted this phase (Phase 13) so the two existing
 * routes and Vercel Cron compatibility don't each reimplement the same
 * check slightly differently.
 *
 * Protected by a shared secret, never by "internal" in the URL path
 * alone. Fails closed: if no secret is configured in production, every
 * call is rejected rather than silently allowed (unchanged from the
 * original per-route check both existing routes had).
 *
 * Accepts either of two equally-valid credential presentations for the
 * SAME configured secret:
 * - `x-internal-api-secret: <INTERNAL_API_SECRET>` — the original,
 *   platform-agnostic convention any external scheduler (a generic cron
 *   daemon on the eventual DigitalOcean host, a manual curl, etc.) can use.
 * - `Authorization: Bearer <CRON_SECRET>` — Vercel Cron's own fixed,
 *   automatic convention (it attaches this header itself when
 *   `CRON_SECRET` is set in the project's environment variables); see
 *   `.env.example`'s comment on why this is the same secret value under
 *   a second, Vercel-mandated name, not a second real secret.
 */
export function checkInternalRequestAuthorized(request: Request): NextResponse<ApiError> | null {
  const mustAuthenticate = env.NODE_ENV === "production" || Boolean(env.INTERNAL_API_SECRET);
  if (!mustAuthenticate) return null;

  const providedInternalHeader = request.headers.get("x-internal-api-secret");
  if (env.INTERNAL_API_SECRET && providedInternalHeader === env.INTERNAL_API_SECRET) {
    return null;
  }

  const authorizationHeader = request.headers.get("authorization");
  if (env.CRON_SECRET && authorizationHeader === `Bearer ${env.CRON_SECRET}`) {
    return null;
  }

  return apiError("authorization", "internal_endpoint_unauthorized", "غير مصرح.");
}
