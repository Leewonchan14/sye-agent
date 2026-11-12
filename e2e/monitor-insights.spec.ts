import fs from "node:fs";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import pg from "pg";

import { kst } from "../src/lib/kst";
import { signUpPage } from "./helpers";

/** 논조·중요도 태그, 매체·기자 통계, 엑셀(CSV) 내려받기 */

const ingestKey = process.env.MONITOR_INGEST_KEY ?? "";

const today9 = kst().startOf("day").add(9, "hour");
const window = (daysAgo: number) => ({
  since: today9.subtract(daysAgo + 1, "day").format(),
  until: today9.subtract(daysAgo, "day").format(),
});

const article = (id: string, extra: Record<string, unknown>) => ({
  url: `https://example.com/insights/${id}`,
  media: "한빛일보",
  title: `기사 ${id}`,
  category: "industry",
  summary: `${id} 요약 문장입니다.`,
  score: 70,
  reason: "테스트",
  publishedAt: today9.subtract(3, "hour").format(),
  ...extra,
});

/** beforeEach에서 만든 테스트 고객사의 slug — 앱이 자동으로 만든다. */
let clientSlug = "";

const postRun = (request: APIRequestContext, daysAgo: number, items: unknown[]) =>
  request.post("/api/monitor/agent/runs", {
    headers: { "x-monitor-key": ingestKey },
    data: { client: clientSlug, ...window(daysAgo), items },
  });

const openMonitor = async (page: Page) => {
  await page.goto("/monitor");
  await page.getByRole("tab", { name: /기사 선별/ }).waitFor();
};

const articleRow = (page: Page, title: string) =>
  page.locator("div.grid", { has: page.getByRole("link", { name: title }) }).first();

/** 사용자 API는 page.request로 부른다 — 브라우저와 로그인 쿠키를 함께 쓴다. */
const clientPayload = async (request: APIRequestContext) => {
  const overview = await (await request.get("/api/monitor")).json();
  const client = overview.clients.find((c: { slug: string }) => c.slug === clientSlug);
  return (await request.get(`/api/monitor/clients/${client.id}`)).json();
};

test.describe("모니터링 인사이트", () => {
  test.beforeEach(async ({ page }) => {
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
        categories: [
          { key: "own", name: "예시 브랜드 자사 뉴스", goal: null },
          { key: "industry", name: "업계 · 트렌드", goal: 10 },
        ],
      },
    });
    expect(res.status()).toBe(201);
    clientSlug = (await res.json()).client.slug;
  });

  test("논조·중요도를 보여 주고 고칠 수 있다", async ({ page, request }) => {
    const res = await postRun(request, 0, [
      article("bad", {
        title: "항공권 환불 논란 확산",
        sentiment: "negative",
        importance: "high",
      }),
      article("good", { title: "여행 수요 회복", sentiment: "positive" }),
      article("plain", {
        title: "여행업계 동향 정리",
        sentiment: "neutral",
        importance: "low",
      }),
    ]);
    expect(res.status()).toBe(201);

    const bad = await postRun(request, 0, [article("x", { sentiment: "angry" })]);
    expect(bad.status()).toBe(400);
    await openMonitor(page);

    const negativeRow = articleRow(page, "항공권 환불 논란 확산");
    await expect(negativeRow.getByText("부정", { exact: true })).toBeVisible();
    await expect(negativeRow.getByText("중요", { exact: true })).toBeVisible();
    await expect(articleRow(page, "여행 수요 회복").getByText("긍정")).toBeVisible();
    await expect(page.getByText("먼저 볼 기사 부정 1건 · 중요 1건")).toBeVisible();

    await page.getByRole("button", { name: "부정·중요만 보기" }).click();
    await expect(page.getByRole("link", { name: "여행 수요 회복" })).toHaveCount(0);
    await page.getByRole("button", { name: "전체 보기" }).click();

    // 긍정 기사를 부정으로 고치면 저장되고 다시 불러와도 남아 있다.
    await articleRow(page, "여행 수요 회복")
      .getByRole("button", { name: "논조·중요도 고치기" })
      .click();
    await page.getByRole("menuitemradio", { name: "부정" }).click();
    await expect(page.getByText("먼저 볼 기사 부정 2건 · 중요 1건")).toBeVisible();
    await expect
      .poll(async () => {
        const payload = await clientPayload(page.request);
        return payload.items.find((i: { title: string }) => i.title === "여행 수요 회복")
          ?.sentiment;
      })
      .toBe("negative");

    await page.getByRole("tab", { name: /리포트 미리보기/ }).click();
    const aside = page.locator("aside");
    await expect(aside.getByText("부정 기사")).toBeVisible();
    await expect(aside.locator("dd", { hasText: "2건" }).first()).toBeVisible();
  });

  test("매체·기자 통계는 같은 기사를 한 번만 세고 기자 표기를 합친다", async ({
    page,
    request,
  }) => {
    // 어제 수집: 한빛일보 김철수 2건, 새벽신문 1건
    expect(
      (
        await postRun(request, 1, [
          article("a1", { reporter: "김철수 기자", sentiment: "negative" }),
          article("a2", { reporter: "김철수" }),
          article("b1", {
            media: "새벽신문",
            reporter: "박민수 기자 (park@example.com)",
          }),
        ])
      ).status()
    ).toBe(201);
    // 오늘 수집: a1이 다시 나오고(한 번만 센다) 한빛일보 기사가 하나 더
    expect(
      (
        await postRun(request, 0, [
          article("a1", { reporter: "김철수 기자", sentiment: "negative" }),
          article("a3", { reporter: "홍길동", title: "기사 a3" }),
        ])
      ).status()
    ).toBe(201);
    const payload = await clientPayload(page.request);
    const statsUrl = `/api/monitor/clients/${payload.client.id}/stats?days=30&scope=included`;
    const stats = await (await page.request.get(statsUrl)).json();
    expect(stats.totals).toMatchObject({ articles: 4, media: 2, reporters: 3 });
    expect(stats.totals.sentiment.negative).toBe(1);
    expect(stats.media[0]).toMatchObject({ media: "한빛일보", count: 3, reporters: 2 });
    expect(stats.reporters[0]).toMatchObject({
      reporter: "김철수",
      media: "한빛일보",
      count: 2,
    });
    expect(
      stats.reporters.find((r: { media: string }) => r.media === "새벽신문").reporter
    ).toBe("박민수");

    // 리포트에서 뺀 기사는 '리포트에 넣은 기사' 범위에서 빠지고 '후보 전체'에는 남는다.
    const a3 = payload.items.find((i: { title: string }) => i.title === "기사 a3");
    await page.request.patch(`/api/monitor/items/${a3.id}`, {
      data: { included: false },
    });
    const included = await (await page.request.get(statsUrl)).json();
    expect(included.totals.articles).toBe(3);
    const picked = await (
      await page.request.get(statsUrl.replace("included", "picked"))
    ).json();
    expect(picked.totals.articles).toBe(4);

    expect((await page.request.get(statsUrl.replace("days=30", "days=5"))).status()).toBe(
      400
    );

    await openMonitor(page);
    await page.getByRole("tab", { name: /매체·기자 통계/ }).click();
    const reporters = page.locator("section", { hasText: "기자별 보도" });
    await expect(reporters.getByRole("button", { name: /김철수/ })).toBeVisible();
    await reporters.getByRole("button", { name: /김철수/ }).click();
    await expect(reporters.getByRole("link", { name: "기사 a1" })).toBeVisible();
    await expect(reporters.getByText("부정", { exact: true })).toBeVisible();
    await expect(
      page.locator("section", { hasText: "매체별 노출" }).getByText("한빛일보")
    ).toBeVisible();

    await page.getByRole("radio", { name: "AI가 고른 후보 전체" }).click();
    await expect(reporters.getByRole("button", { name: /홍길동/ })).toBeVisible();
  });

  test("통계·규칙은 고객사 이름 아래 탭에 있고 하루치 화면과 섞이지 않는다", async ({
    page,
    request,
  }) => {
    expect((await postRun(request, 0, [article("t1", {})])).status()).toBe(201);
    await openMonitor(page);

    const clientTabs = page.getByRole("tablist", { name: "고객사 화면" });
    const runTabs = page.getByRole("tablist", { name: "오늘의 기사 화면" });
    await expect(clientTabs.getByRole("tab")).toHaveText([
      /오늘의 기사/,
      /매체·기자 통계/,
      /고객사 규칙/,
    ]);
    await expect(runTabs.getByRole("tab")).toHaveText([/기사 선별/, /리포트 미리보기/]);
    await expect(
      page.getByRole("heading", { level: 2, name: "오늘의 기사" })
    ).toBeVisible();

    // 고객사 탭은 날짜·보고 순서보다 위에 있다.
    const tabsBox = await clientTabs.boundingBox();
    const historyBox = await page
      .getByRole("navigation", { name: "수집 기록" })
      .boundingBox();
    expect(tabsBox!.y).toBeLessThan(historyBox!.y);

    await runTabs.getByRole("tab", { name: /리포트 미리보기/ }).click();
    await clientTabs.getByRole("tab", { name: /매체·기자 통계/ }).click();
    await expect(page.getByRole("navigation", { name: "수집 기록" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "보고 순서" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "오늘의 기사" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /리포트 만들기/ })).toHaveCount(0);

    await clientTabs.getByRole("tab", { name: /고객사 규칙/ }).click();
    await expect(page.getByRole("navigation", { name: "수집 기록" })).toHaveCount(0);

    // 오늘의 기사로 돌아오면 고르던 하위 탭이 남아 있다.
    await clientTabs.getByRole("tab", { name: /오늘의 기사/ }).click();
    await expect(runTabs.getByRole("tab", { name: /리포트 미리보기/ })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  test("리포트에 넣은 기사를 CSV로 내려받는다", async ({ page, request }) => {
    expect(
      (
        await postRun(request, 0, [
          article("s1", {
            title: "예시 브랜드 신제품 출시",
            reporter: "김철수 기자",
            sentiment: "positive",
            importance: "high",
          }),
          article("s2", { title: "리포트에서 뺄 기사", media: "새벽신문" }),
        ])
      ).status()
    ).toBe(201);
    const payload = await clientPayload(page.request);
    const s2 = payload.items.find(
      (i: { title: string }) => i.title === "리포트에서 뺄 기사"
    );
    await page.request.patch(`/api/monitor/items/${s2.id}`, {
      data: { included: false },
    });

    await openMonitor(page);
    await page.getByRole("tab", { name: /리포트 미리보기/ }).click();
    await expect(page.getByRole("button", { name: "공유 링크 만들기" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "메일 보내기" })).toHaveCount(0);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "엑셀(CSV)로 받기" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^예시 브랜드_모니터링_\d{8}\.csv$/);
    const csv = fs.readFileSync((await download.path())!, "utf8");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain(
      "카테고리,세부분류,구분,제목,매체,기자,게재일시,논조,중요도,링크,핵심내용"
    );
    expect(csv).toContain("예시 브랜드 신제품 출시");
    expect(csv).toContain(",긍정,중요,");
    expect(csv).not.toContain("리포트에서 뺄 기사");
  });
});
