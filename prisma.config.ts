// Prisma 7 CLI configuration (migrate/introspect only — NOT read by the
// application's PrismaClient at runtime, which connects via the driver
// adapter in src/lib/db.ts instead). See prisma/schema.prisma for why.
//
// Config files are loaded standalone by the Prisma CLI, before Next.js's
// own env loading runs — .env must be loaded explicitly here.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Deliberately a plain, non-throwing read — NOT prisma/config's own
    // `env()` helper, which throws PrismaConfigEnvError the instant this
    // file is loaded if the variable is unset. `@prisma/config`'s own type
    // for `datasource` documents it as "optional for most cases, but
    // required for migration / introspection commands" — `prisma generate`
    // (the one Prisma command that now runs inside `npm run build`,
    // package.json) never touches a database at all, so it must not be
    // forced to fail just because DATABASE_URL isn't set in whatever
    // environment happens to be running `next build` (found the hard way:
    // a real Vercel build failed here with no DB configured yet). Commands
    // that genuinely need a connection (`migrate deploy`, `db seed`, `db
    // pull`) still get Prisma's own clear, correct error if this is
    // undefined when they actually need it — this only removes the
    // artificial failure for the command that never did.
    url: process.env.DATABASE_URL,
  },
  migrations: {
    // prisma/seed.ts runs directly under Node's native TypeScript support
    // (Node 24+) — no ts-node/tsx dependency needed. See that file's header
    // comment for why it doesn't reuse src/lib/db.ts.
    seed: "node prisma/seed.ts",
  },
});
