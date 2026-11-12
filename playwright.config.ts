import { defineConfig, devices } from "@playwright/test";

/**
 * e2e. 테스트가 DB를 비우므로 임시 DB에 연결된 서버가 먼저 떠 있어야 한다.
 * 실행 방법은 e2e/README.md를 참고한다.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});
