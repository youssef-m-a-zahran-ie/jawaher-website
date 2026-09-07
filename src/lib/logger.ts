import pino from "pino";

import { env } from "@/lib/env";

/**
 * Structured JSON logger. Import `logger` (or `logger.child({...})` for a
 * request-scoped logger with a correlation id — see withRequestId below)
 * instead of using console.log anywhere else in the app.
 *
 * Fields that must never appear in logs, per
 * docs/architecture/technical-architecture.md §21/§27, are redacted at the
 * transport level so a developer forgetting to scrub a field by hand can't
 * leak it — this list should grow as new sensitive fields are introduced
 * (e.g. once OTP/payment/session code exists).
 */
export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  redact: {
    paths: [
      "*.otp",
      "*.otpCode",
      "*.codeHash",
      "*.password",
      "*.token",
      "*.accessToken",
      "*.refreshToken",
      "*.sessionToken",
      "*.cookie",
      "req.headers.cookie",
      "req.headers.authorization",
      "*.cardNumber",
      "*.cvv",
      // Commerce (Phase 4) — never log a full phone number or delivery
      // address (technical-architecture.md §21/§27). Call sites that need
      // to identify a customer in logs use maskPhone() (src/domain/phone.ts)
      // and log city/area only, never street/building.
      "*.phoneE164",
      "*.recipientPhone",
      "*.street",
      "*.building",
      "*.apartment",
      "*.landmark",
    ],
    censor: "[REDACTED]",
  },
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});

/** Per-request logger carrying a correlation id, per technical-architecture.md §21. */
export function loggerForRequest(requestId: string) {
  return logger.child({ requestId });
}
