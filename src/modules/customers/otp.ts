import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * OTP challenge lifecycle. The code is never stored raw (this phase's
 * brief) — hashed with scrypt + a per-challenge salt, verified with a
 * constant-time comparison, same discipline a password would get.
 * technical-architecture.md §7: 4-6 digits, 1-5 minute expiry, rate-limited
 * resend and verify-attempts.
 */

const CODE_LENGTH = 6;
const EXPIRY_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const REQUEST_RATE_LIMIT = { limit: 3, windowMs: 10 * 60 * 1000 };
const VERIFY_RATE_LIMIT = { limit: 10, windowMs: 10 * 60 * 1000 };

function hashCode(code: string, salt: string): string {
  return scryptSync(code, salt, 32).toString("hex");
}

function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

export class OtpRateLimitedError extends Error {
  constructor() {
    super("Too many OTP requests — try again later");
    this.name = "OtpRateLimitedError";
  }
}

export class OtpInvalidError extends Error {
  constructor(readonly reason: "not_found" | "expired" | "already_used" | "too_many_attempts" | "wrong_code") {
    super(`OTP verification failed: ${reason}`);
    this.name = "OtpInvalidError";
  }
}

/** Returns the plaintext code — the ONLY place it exists outside this function's caller (the Notifications adapter). Never persisted, never logged. */
export async function requestOtp(phoneE164: string): Promise<{ challengeId: string; code: string; expiresAt: Date }> {
  const rate = checkRateLimit(`otp-request:${phoneE164}`, REQUEST_RATE_LIMIT.limit, REQUEST_RATE_LIMIT.windowMs);
  if (!rate.allowed) throw new OtpRateLimitedError();

  const code = generateCode();
  const salt = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + EXPIRY_MS);

  const challenge = await db.otpChallenge.create({
    data: { phoneE164, codeHash: `${salt}:${hashCode(code, salt)}`, expiresAt, maxAttempts: MAX_ATTEMPTS },
  });

  return { challengeId: challenge.id, code, expiresAt };
}

export async function verifyOtp(phoneE164: string, code: string): Promise<{ verified: true }> {
  const rate = checkRateLimit(`otp-verify:${phoneE164}`, VERIFY_RATE_LIMIT.limit, VERIFY_RATE_LIMIT.windowMs);
  if (!rate.allowed) throw new OtpRateLimitedError();

  const challenge = await db.otpChallenge.findFirst({
    where: { phoneE164, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge) throw new OtpInvalidError("not_found");
  if (challenge.expiresAt < new Date()) throw new OtpInvalidError("expired");
  if (challenge.attempts >= challenge.maxAttempts) throw new OtpInvalidError("too_many_attempts");

  const [salt, expectedHex] = challenge.codeHash.split(":");
  const actualHex = hashCode(code, salt);
  const matches =
    expectedHex.length === actualHex.length &&
    timingSafeEqual(Buffer.from(expectedHex, "hex"), Buffer.from(actualHex, "hex"));

  if (!matches) {
    await db.otpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    throw new OtpInvalidError("wrong_code");
  }

  await db.otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
  return { verified: true };
}
