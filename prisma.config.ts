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
});
