import { expect, test } from "@playwright/test";
import pg from "pg";

import { signUpPage } from "./helpers";

const ingestKey = process.env.MONITOR_INGEST_KEY ?? "";

const article = (id: string, title: string, extra: Record<string, unknown>) => ({
  url: `https://example.com/article/${id}`,
  media: "테스트신문",
  title,
  category: "own",
  summary: "요약 문장입니다.",
  score: 80,
  reason: "테스트 기사",
  publishedAt: "2026-11-07T10:00:00+09:00",
  ...extra,
});

const ARTICLES = [
  article("found", "기자를 찾은 기사", { reporter: "김철수", reporterStatus: "found" }),
  article("failed", "접속 실패 기사", { reporterStatus: "fetch_failed" }),
  article("absent", "기자 표기 없는 기사", { reporterStatus: "not_on_page" }),
  article("unverified", "열어 보지 않은 기사", { reporterStatus: "unverified" }),
  article("legacy", "상태 없는 기사", {}),
];

/** beforeEach에서 만든 테스트 고객사의 slug — 앱이 자동으로 만든다. */
let clientSlug = "";

const postRun = (
  request: Parameters<Parameters<typeof test>[2]>[0]["request"],
  items: unknown[]
) =>
  request.post("/api/monitor/agent/runs", {
    headers: { "x-monitor-key": ingestKey },
    data: {
      client: clientSlug,
      since: "2026-11-07T09:00:00+09:00",
      until: "2026-11-08T09:00:00+09:00",
      items,
    },
  });

const openMonitor = async (page: Parameters<Parameters<typeof test>[2]>[0]["page"]) => {
  await page.goto("/monitor");
  await page.getByRole("tab", { name: /기사 선별/ }).waitFor();
};

const articleRow = (
  page: Parameters<Parameters<typeof test>[2]>[0]["page"],
  title: string
) => page.locator("div.grid", { has: page.getByRole("link", { name: title }) }).first();

test.describe("모니터링 기자 확인 상태", () => {
  test.beforeEach(async ({ page }) => {
    // monitor 테이블만 비우는 짧은 연결이라 helpers의 pool과 따로 연다.
    const db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL });
    await db.connect();
    await db.query(`
      truncate monitor_items, monitor_articles, monitor_runs, monitor_clients
      restart identity cascade
    `);
    await db.end();
    // 테스트마다 새 사용자로 가입한다 — 로그인 쿠키가 page와 page.request에 함께 남는다.
    await signUpPage(page);
    const res = await page.request.post("/api/monitor/clients", {
      data: {
        name: "예시 브랜드",
        categories: [{ key: "own", name: "예시 브랜드 자사 뉴스", goal: null }],
      },
    });
    expect(res.status()).toBe(201);
    clientSlug = (await res.json()).client.slug;
  });

  test("못 찾은 이유를 기사 목록과 리포트에서 구분한다", async ({ page, request }) => {
    expect((await postRun(request, ARTICLES)).status()).toBe(201);
    await openMonitor(page);

    const found = articleRow(page, "기자를 찾은 기사");
    await expect(found.getByText("김철수 기자")).toBeVisible();
    await expect(found.getByText("기자 확인 필요")).toHaveCount(0);

    await expect(
      articleRow(page, "접속 실패 기사").getByText("원문 접속 실패")
    ).toBeVisible();
    await expect(
      articleRow(page, "기자 표기 없는 기사").getByText("기자 표기 없음")
    ).toBeVisible();
    await expect(
      articleRow(page, "열어 보지 않은 기사").getByText("원문 미검증")
    ).toBeVisible();
    await expect(
      articleRow(page, "상태 없는 기사").getByText("기자 확인 필요")
    ).toBeVisible();

    await page.getByRole("tab", { name: /리포트 미리보기/ }).click();
    const report = page.getByText("모니터링 기간:");
    await expect(report).toContainText("- 기자: 김철수");
    await expect(report).toContainText("- 기자: 확인 불가(원문 접속 실패)");
    await expect(report).toContainText("- 기자: 확인 불가(페이지에 기자 표기 없음)");
    await expect(report).toContainText("- 기자: 미검증");
    await expect(report).toContainText(/- 기자: 확인 불가\s+- 링크/);
  });

  test("다시 수집해 기자를 찾으면 이전 사유를 지운다", async ({ page, request }) => {
    const failed = article("retry", "다시 찾은 기사", { reporterStatus: "fetch_failed" });
    expect((await postRun(request, [failed])).status()).toBe(201);

    const res = await request.post("/api/monitor/agent/runs", {
      headers: { "x-monitor-key": ingestKey },
      data: {
        client: clientSlug,
        since: "2026-11-08T09:00:00+09:00",
        until: "2026-11-09T09:00:00+09:00",
        items: [{ ...failed, reporter: "이영희", reporterStatus: "found" }],
      },
    });
    expect(res.status()).toBe(201);
    await openMonitor(page);
    const row = articleRow(page, "다시 찾은 기사");
    await expect(row.getByText("이영희 기자")).toBeVisible();
    await expect(row.getByText("원문 접속 실패")).toHaveCount(0);
  });

  test("정해지지 않은 상태 값은 거부한다", async ({ request }) => {
    const res = await postRun(request, [
      article("bad", "잘못된 상태", { reporterStatus: "maybe" }),
    ]);
    expect(res.status()).toBe(400);
  });
});
