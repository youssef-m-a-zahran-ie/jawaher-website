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

  // Public site origin (consumed by src/lib/site-url.ts — sitemap/robots/canonical
  // URLs/metadataBase). Optional: the real production domain is not yet decided
  // (no deployment/domain decision exists in docs/ as of Phase 3), so this falls
  // back to a localhost dev URL rather than a guessed/invented domain.
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),

  // Shared secret for internal/scheduler-only endpoints (e.g. the
  // inventory-reservation sweep — src/app/api/v1/internal/*). Optional in
  // development (that endpoint allows unauthenticated calls locally so
  // it's testable without provisioning a secret); required in production
  // — see that route's own check.
  INTERNAL_API_SECRET: z.string().min(16).optional(),

  // How long a soft inventory hold survives before it's released
  // (src/modules/catalog/inventory.ts) — Phase 1 New Finding #1's fix.
  // NOT a finalized business rule: 15 (the default below) is the smallest
  // technically-safe value the finding itself suggested, not a confirmed
  // duration — see docs/planning/commerce-completeness-audit.md §5. Change
  // this env var, not the code, once the business confirms a real value.
  INVENTORY_RESERVATION_TTL_MINUTES: z.coerce.number().int().positive().optional(),

  // --- ERP Adapter (Phase 8 — integration foundation) ---
  // Server-only, consumed exclusively by src/modules/erp-integration/. All
  // three are optional here (same convention as INTERNAL_API_SECRET above)
  // so the app still boots with the ERP connection unconfigured — the
  // adapter throws a clear ErpNotConfiguredError at call time instead, per
  // erp-integration-security-plan.md §4's "server-side only, never
  // hardcoded" requirement. Never prefixed NEXT_PUBLIC_ — see this file's
  // own header comment on why that alone keeps it out of any client bundle.
  ERP_BASE_URL: z.string().url().optional(),
  /** The api_key IntegrationSecret printed once by ERP JAW's scripts/provision-website-integration.ts. */
  ERP_API_KEY: z.string().min(1).optional(),
  /** The CompanyIntegrationConnection id printed by the same script — sent as the x-erp-connection-id header, never secret on its own. */
  ERP_CONNECTION_ID: z.string().min(1).optional(),
  /** Explicit request timeout for every ERP call (technical-architecture.md §4) — defaults to 5000ms if unset. */
  ERP_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().optional(),

  // --- Reserved for later phases (optional until implemented) ---
  // SESSION_SECRET intentionally removed here (Phase 12 environment
  // audit): src/lib/session.ts's own comment is explicit that sessions
  // are an opaque, database-looked-up id — "never a JWT with embedded
  // claims" — a deliberate architectural choice, not a placeholder
  // waiting to be filled in. That design has nothing to sign or verify,
  // so a signing secret would never have a real use; keeping it listed
  // as "reserved" was stale, misleading documentation suggesting a
  // direction (stateless/signed sessions) this project already decided
  // against.
  OTP_PROVIDER_API_KEY: z.string().min(1).optional(),
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
