import fs from "node:fs";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import pg from "pg";

import { kst } from "../src/lib/kst";
import { authHeaders, login } from "./helpers";

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

const postRun = (request: APIRequestContext, daysAgo: number, items: unknown[]) =>
  request.post("/api/monitor/agent/runs", {
    headers: { "x-monitor-key": ingestKey },
    data: { client: "hktb", ...window(daysAgo), items },
  });

const openMonitor = async (page: Page, token: string) => {
  await page.addInitScript((value) => {
    localStorage.setItem(
      "trable-auth",
      JSON.stringify({ state: { token: value }, version: 0 })
    );
  }, token);
  await page.goto("/monitor");
  await page.getByRole("tab", { name: /기사 선별/ }).waitFor();
};

const articleRow = (page: Page, title: string) =>
  page.locator("div.grid", { has: page.getByRole("link", { name: title }) }).first();

const clientPayload = async (request: APIRequestContext, token: string) => {
  const overview = await (
    await request.get("/api/monitor", { headers: authHeaders(token) })
  ).json();
  const hktb = overview.clients.find((c: { slug: string }) => c.slug === "hktb");
  return (
    await request.get(`/api/monitor/clients/${hktb.id}`, { headers: authHeaders(token) })
  ).json();
};

test.describe("모니터링 인사이트", () => {
  test.beforeEach(async ({ request }) => {
    const db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL });
    await db.connect();
    await db.query(`
      truncate monitor_items, monitor_articles, monitor_runs, monitor_clients
      restart identity cascade
    `);
    await db.end();
    const token = await login(request);
    expect(
      (await request.post("/api/monitor", { headers: authHeaders(token) })).status()
    ).toBe(201);
  });

  test("논조·중요도를 보여 주고 고칠 수 있다", async ({ page, request }) => {
    const res = await postRun(request, 0, [
      article("bad", {
        title: "항공권 환불 논란 확산",
        sentiment: "negative",
        importance: "high",
      }),
      article("good", { title: "홍콩 여행 수요 회복", sentiment: "positive" }),
      article("plain", {
        title: "여행업계 동향 정리",
        sentiment: "neutral",
        importance: "low",
      }),
    ]);
    expect(res.status()).toBe(201);

    const bad = await postRun(request, 0, [article("x", { sentiment: "angry" })]);
    expect(bad.status()).toBe(400);

    const token = await login(request);
    await openMonitor(page, token);

    const negativeRow = articleRow(page, "항공권 환불 논란 확산");
    await expect(negativeRow.getByText("부정", { exact: true })).toBeVisible();
    await expect(negativeRow.getByText("중요", { exact: true })).toBeVisible();
    await expect(articleRow(page, "홍콩 여행 수요 회복").getByText("긍정")).toBeVisible();
    await expect(page.getByText("먼저 볼 기사 부정 1건 · 중요 1건")).toBeVisible();

    await page.getByRole("button", { name: "부정·중요만 보기" }).click();
    await expect(page.getByRole("link", { name: "홍콩 여행 수요 회복" })).toHaveCount(0);
    await page.getByRole("button", { name: "전체 보기" }).click();

    // 긍정 기사를 부정으로 고치면 저장되고 다시 불러와도 남아 있다.
    await articleRow(page, "홍콩 여행 수요 회복")
      .getByRole("button", { name: "논조·중요도 고치기" })
      .click();
    await page.getByRole("menuitemradio", { name: "부정" }).click();
    await expect(page.getByText("먼저 볼 기사 부정 2건 · 중요 1건")).toBeVisible();
    await expect
      .poll(async () => {
        const payload = await clientPayload(request, token);
        return payload.items.find(
          (i: { title: string }) => i.title === "홍콩 여행 수요 회복"
        )?.sentiment;
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
    // 어제 수집: 한빛일보 김보나 2건, 새벽신문 1건
    expect(
      (
        await postRun(request, 1, [
          article("a1", { reporter: "김보나 기자", sentiment: "negative" }),
          article("a2", { reporter: "김보나" }),
          article("b1", { media: "새벽신문", reporter: "이도윤 기자 (lee@dawn.kr)" }),
        ])
      ).status()
    ).toBe(201);
    // 오늘 수집: a1이 다시 나오고(한 번만 센다) 한빛일보 기사가 하나 더
    expect(
      (
        await postRun(request, 0, [
          article("a1", { reporter: "김보나 기자", sentiment: "negative" }),
          article("a3", { reporter: "박서진", title: "기사 a3" }),
        ])
      ).status()
    ).toBe(201);

    const token = await login(request);
    const payload = await clientPayload(request, token);
    const statsUrl = `/api/monitor/clients/${payload.client.id}/stats?days=30&scope=included`;
    const stats = await (
      await request.get(statsUrl, { headers: authHeaders(token) })
    ).json();
    expect(stats.totals).toMatchObject({ articles: 4, media: 2, reporters: 3 });
    expect(stats.totals.sentiment.negative).toBe(1);
    expect(stats.media[0]).toMatchObject({ media: "한빛일보", count: 3, reporters: 2 });
    expect(stats.reporters[0]).toMatchObject({
      reporter: "김보나",
      media: "한빛일보",
      count: 2,
    });
    expect(
      stats.reporters.find((r: { media: string }) => r.media === "새벽신문").reporter
    ).toBe("이도윤");

    // 리포트에서 뺀 기사는 '리포트에 넣은 기사' 범위에서 빠지고 '후보 전체'에는 남는다.
    const a3 = payload.items.find((i: { title: string }) => i.title === "기사 a3");
    await request.patch(`/api/monitor/items/${a3.id}`, {
      headers: authHeaders(token),
      data: { included: false },
    });
    const included = await (
      await request.get(statsUrl, { headers: authHeaders(token) })
    ).json();
    expect(included.totals.articles).toBe(3);
    const picked = await (
      await request.get(statsUrl.replace("included", "picked"), {
        headers: authHeaders(token),
      })
    ).json();
    expect(picked.totals.articles).toBe(4);

    expect(
      (
        await request.get(statsUrl.replace("days=30", "days=5"), {
          headers: authHeaders(token),
        })
      ).status()
    ).toBe(400);

    await openMonitor(page, token);
    await page.getByRole("tab", { name: /매체·기자 통계/ }).click();
    const reporters = page.locator("section", { hasText: "기자별 보도" });
    await expect(reporters.getByRole("button", { name: /김보나/ })).toBeVisible();
    await reporters.getByRole("button", { name: /김보나/ }).click();
    await expect(reporters.getByRole("link", { name: "기사 a1" })).toBeVisible();
    await expect(reporters.getByText("부정", { exact: true })).toBeVisible();
    await expect(
      page.locator("section", { hasText: "매체별 노출" }).getByText("한빛일보")
    ).toBeVisible();

    await page.getByRole("radio", { name: "AI가 고른 후보 전체" }).click();
    await expect(reporters.getByRole("button", { name: /박서진/ })).toBeVisible();
  });

  test("리포트에 넣은 기사를 CSV로 내려받는다", async ({ page, request }) => {
    expect(
      (
        await postRun(request, 0, [
          article("s1", {
            title: "홍콩 미식 축제 개막",
            reporter: "김보나 기자",
            sentiment: "positive",
            importance: "high",
          }),
          article("s2", { title: "리포트에서 뺄 기사", media: "새벽신문" }),
        ])
      ).status()
    ).toBe(201);

    const token = await login(request);
    const payload = await clientPayload(request, token);
    const s2 = payload.items.find(
      (i: { title: string }) => i.title === "리포트에서 뺄 기사"
    );
    await request.patch(`/api/monitor/items/${s2.id}`, {
      headers: authHeaders(token),
      data: { included: false },
    });

    await openMonitor(page, token);
    await page.getByRole("tab", { name: /리포트 미리보기/ }).click();
    await expect(page.getByRole("button", { name: "공유 링크 만들기" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "메일 보내기" })).toHaveCount(0);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "엑셀(CSV)로 받기" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^홍콩관광청_모니터링_\d{8}\.csv$/);
    const csv = fs.readFileSync((await download.path())!, "utf8");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain(
      "카테고리,세부분류,구분,제목,매체,기자,게재일시,논조,중요도,링크,핵심내용"
    );
    expect(csv).toContain("홍콩 미식 축제 개막");
    expect(csv).toContain(",긍정,중요,");
    expect(csv).not.toContain("리포트에서 뺄 기사");
  });
});
