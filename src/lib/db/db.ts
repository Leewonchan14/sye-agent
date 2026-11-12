import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as pgDrizzle } from "drizzle-orm/node-postgres";
import { drizzle as pgliteDrizzle } from "drizzle-orm/pglite";
import pg from "pg";

import * as schema from "./schema";

type DbClient =
  ReturnType<typeof drizzle<typeof schema>> | ReturnType<typeof pgDrizzle<typeof schema>>;

/** `DATABASE_URL=pglite:/data/pglite` 처럼 쓰면 서버 프로세스 안의 PGlite(파일 저장)를 쓴다. */
const PGLITE_PREFIX = "pglite:";

export const isPglite = () => (process.env.DATABASE_URL ?? "").startsWith(PGLITE_PREFIX);

/**
 * 연결은 프로세스에 하나만 둔다. Next는 라우트·instrumentation을 따로 번들링해 모듈 변수가
 * 여러 벌 생길 수 있으므로 globalThis에 둔다 — 특히 PGlite는 같은 폴더를 두 번 열면 안 된다.
 */
const store = globalThis as typeof globalThis & { __appDb?: DbClient };

export const getDb = (): DbClient => {
  if (!store.__appDb) {
    const url = process.env.DATABASE_URL!;

    if (url.startsWith(PGLITE_PREFIX)) {
      const dataDir = url.slice(PGLITE_PREFIX.length) || "./.pglite";
      const client = new PGlite(dataDir, { extensions: { pg_trgm } });
      // 쿼리 API는 node-postgres 드라이버와 같다 (둘 다 PgDatabase).
      store.__appDb = pgliteDrizzle({ client, schema }) as unknown as DbClient;
    } else if (url.includes("neon.tech")) {
      store.__appDb = drizzle(neon(url), { schema }) as DbClient;
    } else {
      const pool = new pg.Pool({ connectionString: url });
      store.__appDb = pgDrizzle({ client: pool, schema }) as DbClient;
    }
  }
  return store.__appDb;
};

export { schema };
