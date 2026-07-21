import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as pgDrizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./schema";

type DbClient =
  ReturnType<typeof drizzle<typeof schema>> | ReturnType<typeof pgDrizzle<typeof schema>>;

let client: DbClient | undefined;

export const getDb = () => {
  if (!client) {
    const url = process.env.DATABASE_URL!;

    if (url.includes("neon.tech")) {
      const sql = neon(url);
      client = drizzle(sql, { schema }) as DbClient;
    } else {
      const pool = new pg.Pool({ connectionString: url });
      client = pgDrizzle({ client: pool, schema }) as DbClient;
    }
  }
  return client;
};

export { schema };
