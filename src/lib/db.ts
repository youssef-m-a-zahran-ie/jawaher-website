import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { env } from "@/lib/env";

/**
 * Prisma 7 requires an explicit driver adapter — the datasource `url` in
 * schema.prisma is CLI-only (see prisma.config.ts). This is the one place
 * in the app allowed to construct a PrismaClient; every other module must
 * import `db` from here rather than instantiating its own client.
 */
function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

// Reuse a single client across Next.js dev-mode hot reloads so each file
// edit doesn't open a fresh pool of Postgres connections.
export const db = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
