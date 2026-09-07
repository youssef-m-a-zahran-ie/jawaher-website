// Prisma 7 CLI configuration (migrate/introspect only — NOT read by the
// application's PrismaClient at runtime, which connects via the driver
// adapter in src/lib/db.ts instead). See prisma/schema.prisma for why.
//
// Config files are loaded standalone by the Prisma CLI, before Next.js's
// own env loading runs — .env must be loaded explicitly here.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    // prisma/seed.ts runs directly under Node's native TypeScript support
    // (Node 24+) — no ts-node/tsx dependency needed. See that file's header
    // comment for why it doesn't reuse src/lib/db.ts.
    seed: "node prisma/seed.ts",
  },
});
