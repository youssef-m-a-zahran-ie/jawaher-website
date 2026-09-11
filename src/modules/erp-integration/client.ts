import { randomUUID } from "node:crypto";

import { env } from "@/lib/env";
import { REQUEST_ID_HEADER } from "@/lib/request-id";

/**
 * ============================================================================
 * ERP CLIENT — Phase 8 (integration foundation)
 * ============================================================================
 * The ONE function in this codebase allowed to `fetch()` the ERP. Every
 * future business-facing ERP Adapter method (getProducts/getPrices/
 * getInventory/pushOrder/getOrderStatus/reconcileCustomer —
 * blueprint.md §9 — none implemented yet, out of this phase's scope) must
 * go through this, never call `fetch()` against `ERP_BASE_URL` directly.
 *
 * SERVER-ONLY: imports server-only `env` (src/lib/env.ts), which itself
 * never exposes anything via `NEXT_PUBLIC_*`. This file must never be
 * imported from a Client Component, a client hook, or any module reachable
 * from one — module-boundaries.md's ERP Integration row ("internal modules
 * only, never the frontend").
 *
 * Auth mirrors ERP JAW's own verification exactly (see that repo's
 * src/lib/integration-auth/service.ts): a public `X-ERP-Connection-Id`
 * header identifies which CompanyIntegrationConnection is calling, and a
 * `Authorization: Bearer <key>` header carries the actual secret.
 * ============================================================================
 */

const DEFAULT_TIMEOUT_MS = 5_000;
const CONNECTION_ID_HEADER = "x-erp-connection-id";

export class ErpNotConfiguredError extends Error {
  constructor() {
    super("ERP integration is not configured — ERP_BASE_URL, ERP_API_KEY, and ERP_CONNECTION_ID must all be set.");
    this.name = "ErpNotConfiguredError";
  }
}

export class ErpTimeoutError extends Error {
  constructor(public readonly requestId: string, timeoutMs: number) {
    super(`ERP request timed out after ${timeoutMs}ms (requestId=${requestId}).`);
    this.name = "ErpTimeoutError";
  }
}

/** Network failure, DNS failure, connection refused — the ERP is reachable-but-erroring case is ErpUnexpectedResponseError instead. */
export class ErpUnavailableError extends Error {
  constructor(public readonly requestId: string, cause: unknown) {
    super(`ERP is unavailable (requestId=${requestId}).`, { cause });
    this.name = "ErpUnavailableError";
  }
}

export class ErpAuthenticationError extends Error {
  constructor(public readonly requestId: string) {
    super(`ERP rejected the integration credentials (requestId=${requestId}).`);
    this.name = "ErpAuthenticationError";
  }
}

export class ErpUnexpectedResponseError extends Error {
  constructor(public readonly requestId: string, public readonly status: number) {
    super(`ERP returned an unexpected response (status=${status}, requestId=${requestId}).`);
    this.name = "ErpUnexpectedResponseError";
  }
}

export interface ErpRequestInput {
  path: string;
  method?: "GET" | "POST";
  requestId?: string;
  timeoutMs?: number;
}

export interface ErpRequestResult<T = unknown> {
  data: T;
  requestId: string;
}

/**
 * No automatic retries here, deliberately — retries are designed per
 * operation once real business endpoints exist (this phase's own scope
 * boundary, §13/erp-integration-failure-recovery.md). A caller that wants
 * to retry does so explicitly, with the SAME `requestId`, once that logic
 * is built.
 */
export async function callErpIntegrationApi<T = unknown>(input: ErpRequestInput): Promise<ErpRequestResult<T>> {
  if (!env.ERP_BASE_URL || !env.ERP_API_KEY || !env.ERP_CONNECTION_ID) {
    throw new ErpNotConfiguredError();
  }

  const requestId = input.requestId ?? randomUUID();
  const timeoutMs = input.timeoutMs ?? env.ERP_REQUEST_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(new URL(input.path, env.ERP_BASE_URL), {
      method: input.method ?? "GET",
      headers: {
        Authorization: `Bearer ${env.ERP_API_KEY}`,
        [CONNECTION_ID_HEADER]: env.ERP_CONNECTION_ID,
        [REQUEST_ID_HEADER]: requestId,
      },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ErpTimeoutError(requestId, timeoutMs);
    }
    throw new ErpUnavailableError(requestId, err);
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 403) {
    throw new ErpAuthenticationError(requestId);
  }
  if (!response.ok) {
    throw new ErpUnexpectedResponseError(requestId, response.status);
  }

  const data = (await response.json()) as T;
  return { data, requestId };
}
