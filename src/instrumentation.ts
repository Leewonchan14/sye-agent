/**
 * 서버가 뜰 때 한 번 실행된다. PGlite를 쓰면 마이그레이션을 여기서 적용한다 —
 * PGlite는 서버 프로세스 안에 있어 `drizzle-kit migrate`가 따로 붙을 수 없다.
 */
export const register = async () => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { migratePgliteOnStart } = await import("@/lib/db/migrate-on-start");
    await migratePgliteOnStart();
  }
};
