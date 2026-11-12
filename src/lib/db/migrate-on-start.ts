import { migrate } from "drizzle-orm/pglite/migrator";

import { getDb, isPglite } from "@/lib/db/db";

/** PGlite일 때만 `drizzle/` 마이그레이션을 적용한다 (작업 폴더 기준). */
export const migratePgliteOnStart = async () => {
  if (!isPglite()) return;
  await migrate(getDb() as unknown as Parameters<typeof migrate>[0], {
    migrationsFolder: "drizzle",
  });
  console.log("[db] PGlite migrations applied");
};
