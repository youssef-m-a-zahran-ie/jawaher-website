import { z } from "zod";

/**
 * Validated environment configuration. Import `env` instead of reading
 * `process.env` directly anywhere else in the app — this is the one place
 * that's allowed to, so a missing/malformed variable fails fast at startup
 * with a clear message instead of surfacing as an obscure runtime bug.
 *
 * Only variables actually consumed by Phase 1 foundation code are required.
 * Categories for later phases (auth/OTP, ERP, payment, shipping, analytics,
 * storage — see docs/architecture/technical-architecture.md §23) are listed
 * in .env.example for reference but are intentionally left optional here
 * until the code that needs them exists — requiring them now would just be
 * placeholder values nobody can give real meaning to yet.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Database (consumed by src/lib/db.ts)
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required — see .env.example"),

  // --- Reserved for later phases (optional until implemented) ---
  SESSION_SECRET: z.string().min(1).optional(),
  OTP_PROVIDER_API_KEY: z.string().min(1).optional(),
  ERP_BASE_URL: z.string().min(1).optional(),
  PAYMENT_PROVIDER_API_KEY: z.string().min(1).optional(),
  SHIPPING_PROVIDER_API_KEY: z.string().min(1).optional(),
  ANALYTICS_GA4_ID: z.string().min(1).optional(),
  STORAGE_BUCKET_URL: z.string().min(1).optional(),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error("❌ Invalid environment configuration:", z.treeifyError(parsed.error));
    throw new Error("Invalid environment configuration — check .env against .env.example");
  }

  return parsed.data;
}

export const env = loadEnv();
