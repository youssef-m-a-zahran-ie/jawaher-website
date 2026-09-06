import { randomUUID } from "node:crypto";

export const REQUEST_ID_HEADER = "x-request-id";

/** Reuses an inbound request id (e.g. from the reverse proxy) if present, otherwise mints one. */
export function getOrCreateRequestId(request: Request): string {
  return request.headers.get(REQUEST_ID_HEADER) ?? randomUUID();
}
