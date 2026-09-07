// Vitest, unlike Next.js, does not load .env automatically. Any test that
// transitively imports src/lib/db.ts (which validates DATABASE_URL via
// src/lib/env.ts at module-load time) needs it present even if the test
// itself never issues a real query — see vitest.config.ts's setupFiles.
import "dotenv/config";
