import { createServer, type Server } from "node:http";

import { expect, type Page, test } from "@playwright/test";

import { login, pool } from "./helpers";

/**
 * 데이트 장소 매일 조사. 앱을 `HERMES_API_URL=http://127.0.0.1:${FAKE_HERMES_PORT}`로 띄우면
 * 아래 가짜 Hermes가 프롬프트에서 콜백 주소·토큰을 읽어 하치와레처럼 결과를 보낸다.
 */
const FAKE_HERMES_PORT = Number(process.env.E2E_FAKE_HERMES_PORT ?? 8972);
const ingestKey = process.env.MONITOR_INGEST_KEY ?? "";

interface FakeRun {
  input: string;
  status: "running" | "completed";
}

const runs = new Map<string, FakeRun>();
let nextSpots: (call: number) => unknown[] = () => [];
let calls = 0;
let server: Server;

const spot = (code: string, name: string, extra: Record<string, unknown> = {}) => ({
  name,
  area: "성수",
  category: "카페",
  summary: `${name} 소개 문장입니다.`,
  reason: "조용히 이야기하기 좋아요.",
  instagramUrl: `https://www.instagram.com/p/${code}/`,
  instagramAuthor: "seongsu_date",
  address: "서울 성동구 연무장길 1",
  priceHint: "1인 2만원대",
  tags: ["조용한", "디저트"],
  ...extra,
});

/** 프롬프트의 curl 예시에서 하치와레가 쓰는 것과 같은 값을 꺼낸다. */
const callBack = async (input: string, spots: unknown[]) => {
  const url = input.match(/curl -sS -X POST '([^']+)'/)?.[1];
  const token = input.match(/x-monitor-token: ([^']+)'/)?.[1];
  const digestId = Number(input.match(/"digestId": (\d+)/)?.[1]);
  if (!url || !token || !digestId) throw new Error("프롬프트에 콜백 정보가 없어요.");
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-monitor-token": token },
    body: JSON.stringify({ digestId, note: "날이 추워서 실내 위주로 골랐어!", spots }),
  });
};

const startFakeHermes = () =>
  new Promise<void>((resolve) => {
    server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const path = req.url ?? "";
      if (req.method === "POST" && path.endsWith("/v1/runs")) {
        const { input } = JSON.parse(Buffer.concat(chunks).toString()) as {
          input: string;
        };
        const id = `run_${++calls}`;
        const run: FakeRun = { input, status: "running" };
        runs.set(id, run);
        const spots = nextSpots(calls);
        setTimeout(() => {
          callBack(input, spots)
            .catch(() => {})
            .finally(() => (run.status = "completed"));
        }, 500);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ run_id: id }));
        return;
      }
      const statusMatch = path.match(/\/v1\/runs\/([^/?]+)$/);
      if (req.method === "GET" && statusMatch) {
        const run = runs.get(statusMatch[1]);
        res.writeHead(run ? 200 : 404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: run?.status ?? "missing", output: "보냈어" }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(FAKE_HERMES_PORT, "127.0.0.1", resolve);
  });

const resetDates = async () => {
  await pool.query(
    "truncate date_spots, date_spot_digests, date_spot_settings restart identity cascade"
  );
  runs.clear();
  calls = 0;
};

const openDates = async (page: Page, token: string) => {
  await page.addInitScript((value) => {
    localStorage.setItem(
      "trable-auth",
      JSON.stringify({ state: { token: value }, version: 0 })
    );
  }, token);
  await page.goto("/dates");
  await page.getByRole("heading", { name: "데이트 장소" }).waitFor();
};

test.describe.configure({ mode: "serial" });

test.beforeAll(startFakeHermes);
test.afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
test.beforeEach(resetDates);

test("지금 찾아 줘 → 하치와레가 보낸 장소가 카드로 보이고 찜이 저장된다", async ({
  page,
  request,
}) => {
  nextSpots = () => [
    spot("AAA111", "성수 온실카페"),
    spot("BBB222", "연무장 팝업", {
      category: "팝업",
      instagramUrl: "https://www.instagram.com/reel/BBB222/?utm_source=ig_web_copy_link",
    }),
  ];
  const token = await login(request);
  await openDates(page, token);

  await page.getByRole("button", { name: "지금 찾아 줘" }).click();
  await expect(page.getByRole("article", { name: "성수 온실카페" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("날이 추워서 실내 위주로 골랐어!")).toBeVisible();

  const popup = page.getByRole("article", { name: "연무장 팝업" });
  await expect(popup.getByRole("link", { name: /인스타/ })).toHaveAttribute(
    "href",
    "https://www.instagram.com/p/BBB222/"
  );
  await expect(popup.getByRole("link", { name: "지도" })).toHaveAttribute(
    "href",
    /map\.naver\.com\/p\/search\//
  );

  await page
    .getByRole("article", { name: "성수 온실카페" })
    .getByRole("button", { name: "가 보고 싶어" })
    .click();
  await page.getByRole("button", { name: /가 보고 싶은 곳/ }).click();
  await expect(page.getByRole("article", { name: "성수 온실카페" })).toBeVisible();
  await expect(page.getByRole("article", { name: "연무장 팝업" })).toHaveCount(0);

  const { rows } = await pool.query("select name, reaction from date_spots order by id");
  expect(rows).toEqual([
    { name: "성수 온실카페", reaction: "like" },
    { name: "연무장 팝업", reaction: null },
  ]);

  // 같은 날 다시 찾으면 이미 추천한 곳과 취향 힌트가 프롬프트에 들어간다.
  nextSpots = () => [spot("AAA111", "성수 온실카페"), spot("CCC333", "서울숲 산책")];
  await page.getByRole("button", { name: /매일 추천/ }).click();
  await page.getByRole("button", { name: "더 찾아 줘" }).click();
  await expect(page.getByRole("article", { name: "서울숲 산책" })).toBeVisible({
    timeout: 20_000,
  });
  const second = runs.get("run_2")?.input ?? "";
  expect(second).toContain("더 찾아 달라는 요청");
  expect(second).toContain("좋아했던 곳(비슷한 결로 참고): 성수 온실카페(성수)");
  expect(second).toContain("연무장 팝업(성수)");
  // 같은 게시물은 두 번 저장하지 않는다.
  const { rows: count } = await pool.query("select count(*)::int as n from date_spots");
  expect(count[0].n).toBe(3);
});

test("조건을 저장하면 프롬프트와 안내 문구에 반영된다", async ({ page, request }) => {
  const token = await login(request);
  await openDates(page, token);

  await page.getByRole("button", { name: "조건" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("지역에 추가").fill("연남");
  await dialog.getByLabel("지역에 추가").press("Enter");
  await dialog.getByLabel("테마에 추가").fill("전시");
  await dialog.getByLabel("테마에 추가").press("Enter");
  await dialog.getByLabel("하치와레에게 부탁").fill("웨이팅 긴 곳은 빼 줘");
  await dialog.getByRole("button", { name: "저장" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/서울·연남에서 5곳씩/)).toBeVisible();

  nextSpots = () => [];
  await page.getByRole("button", { name: "지금 찾아 줘" }).click();
  await expect(page.getByText("오늘 추천은 아직이에요")).toBeVisible({ timeout: 20_000 });
  const input = runs.get("run_1")?.input ?? "";
  expect(input).toContain("지역: 서울, 연남");
  expect(input).toContain("원하는 테마: 전시");
  expect(input).toContain("부탁: 웨이팅 긴 곳은 빼 줘");
});

test("시계가 정한 시각에 하루 한 번 조사를 맡기고 완료 알림을 돌려준다", async ({
  request,
}) => {
  await pool.query(
    "insert into date_spot_settings (id, collect_time) values (1, '00:00')"
  );
  nextSpots = () => [spot("DDD444", "뚝섬 야경")];
  const tick = async () => {
    const res = await request.post("/api/monitor/agent/tick", {
      headers: { "x-monitor-key": ingestKey },
    });
    expect(res.status()).toBe(200);
    return (await res.json()) as {
      started: string[];
      notifications: string[];
      nextCheckAt: string;
    };
  };

  const first = await tick();
  expect(first.started).toContain("dates");
  // 돌고 있는 동안에는 90초 안에 다시 확인한다.
  expect(Date.parse(first.nextCheckAt) - Date.now()).toBeLessThan(100_000);

  await expect
    .poll(
      async () =>
        (await pool.query("select count(*)::int as n from date_spots")).rows[0].n
    )
    .toBe(1);

  const second = await tick();
  expect(second.started).not.toContain("dates");
  expect(second.notifications.join("\n")).toContain("오늘의 데이트 장소 1곳");

  const third = await tick();
  expect(third.notifications.join("\n")).not.toContain("데이트 장소");
  expect(calls).toBe(1);
});

test("하치와레 결과는 인스타그램 게시물만, 발급한 토큰으로만 받는다", async ({
  request,
}) => {
  const {
    rows: [digest],
  } = await pool.query(
    "insert into date_spot_digests (day_key) values ('2026-01-01') returning id"
  );
  const post = (headers: Record<string, string>, spots: unknown[]) =>
    request.post("/api/dates/agent/digests", {
      headers,
      data: { digestId: digest.id, spots },
    });

  const wrongToken = await post({ "x-monitor-token": "nope" }, [spot("EEE555", "가짜")]);
  expect(wrongToken.status()).toBe(401);

  const blog = await post({ "x-monitor-key": ingestKey }, [
    spot("x", "블로그", { instagramUrl: "https://blog.naver.com/abc/123" }),
  ]);
  expect(blog.status()).toBe(400);
  expect((await blog.json()).error).toContain("인스타그램 게시물 주소");

  const ok = await post({ "x-monitor-key": ingestKey }, [spot("EEE555", "진짜")]);
  expect(ok.status()).toBe(201);
  expect(await ok.json()).toMatchObject({ inserted: 1, skipped: 0 });
});
