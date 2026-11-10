import { createServer, type Server } from "node:http";

import { expect, type Page, test } from "@playwright/test";

import { parseEmbedPhotos, photoExpiresAt } from "../src/lib/dates/photo";
import { login, pool } from "./helpers";

/**
 * 데이트 장소 매일 조사. 앱을 `HERMES_API_URL=http://127.0.0.1:${FAKE_HERMES_PORT}`로 띄우면
 * 아래 가짜 Hermes가 프롬프트에서 콜백 주소·토큰을 읽어 하치와레처럼 결과를 보낸다.
 * `INSTAGRAM_EMBED_ORIGIN`도 같은 주소로 두면 인스타그램 임베드·사진 서버 역할까지 한다.
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

/** 테스트 시각 기준 3일 뒤 만료되는 CDN 주소처럼 `oe`를 붙인다. */
const futureOe = () =>
  Math.floor(Date.now() / 1000 + 3 * 86400)
    .toString(16)
    .toUpperCase();
const photoBase = () => `http://127.0.0.1:${FAKE_HERMES_PORT}/img`;
/** 1×1 PNG */
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
const photoSrc = (code: string, w: number) =>
  `${photoBase()}/${code}-${w}.png?stp=dst&oe=${futureOe()}`;
/** 실제 임베드처럼 게시물 데이터(contextJSON)를 JSON 문자열 안의 JSON으로 싣는다. */
const contextScript = (media: unknown) =>
  `<script>window.__additionalDataLoaded('extra',${JSON.stringify({
    contextJSON: JSON.stringify({ gql_data: { shortcode_media: media } }),
  })});</script>`;
const mediaNode = (code: string) => ({
  is_video: false,
  display_url: photoSrc(code, 1080),
  display_resources: [1080, 640, 320].map((w) => ({
    src: photoSrc(code, w),
    config_width: w,
  })),
});
/**
 * `MULTI<n>…`으로 시작하는 게시물은 n장짜리 게시물 데이터를 싣고,
 * 나머지는 데이터 없이 대표 사진 태그만 둔다(데이터가 없을 때의 대체 경로).
 */
const embedHtml = (code: string) => {
  const src = (w: number) => photoSrc(code, w).replace(/&/g, "&amp;");
  const img = `<img class="EmbeddedMediaImage" alt="Instagram post shared by &#064;seongsu_date" src="${src(1080)}" srcset="${src(1080)} 1080w,${src(640)} 640w,${src(320)} 320w" />`;
  const count = Number(code.match(/^MULTI(\d+)/)?.[1] ?? 0);
  const context = count
    ? contextScript({
        ...mediaNode(`${code}-0`),
        edge_sidecar_to_children: {
          edges: Array.from({ length: count }, (_, i) => ({
            node: mediaNode(`${code}-${i + 1}`),
          })),
        },
      })
    : "";
  return `<html><body><div class="Embed">${img}</div>${context}</body></html>`;
};

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
      const embedMatch = path.match(/^\/p\/([A-Za-z0-9_-]+)\/embed\/captioned\/$/);
      if (req.method === "GET" && embedMatch) {
        // NOPIC으로 시작하는 게시물은 비공개·삭제된 것처럼 404
        const missing = embedMatch[1].startsWith("NOPIC");
        res.writeHead(missing ? 404 : 200, { "Content-Type": "text/html" });
        res.end(missing ? "" : embedHtml(embedMatch[1]));
        return;
      }
      if (req.method === "GET" && path.startsWith("/img/")) {
        res.writeHead(200, { "Content-Type": "image/png" });
        res.end(PIXEL);
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
  await expect(popup.getByRole("link", { name: /^인스타/ })).toHaveAttribute(
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

test("임베드에서 여러 장 사진을 순서대로 읽고, 데이터가 없으면 대표 사진 한 장을 쓴다", () => {
  const oe = "6AF8A6BD";
  const url = (name: string, w: number) =>
    `https://scontent.cdninstagram.com/v/${name}-${w}.jpg?stp=a&oe=${oe}`;
  const node = (name: string) => ({
    display_url: url(name, 1080),
    display_resources: [3024, 1080, 640, 480].map((w) => ({
      src: url(name, w),
      config_width: w,
    })),
  });
  const withContext = (count: number) =>
    contextScript({
      ...node("cover"),
      edge_sidecar_to_children: {
        edges: Array.from({ length: count }, (_, i) => ({ node: node(`p${i + 1}`) })),
      },
    });

  expect(parseEmbedPhotos(withContext(3))).toEqual([
    url("p1", 640),
    url("p2", 640),
    url("p3", 640),
  ]);
  // 인스타그램은 20장까지 올릴 수 있지만 카드에는 10장까지만
  expect(parseEmbedPhotos(withContext(13))).toHaveLength(10);
  // 한 장짜리 게시물 데이터
  expect(parseEmbedPhotos(contextScript(node("single")))).toEqual([url("single", 640)]);

  // 데이터가 없으면 임베드에 보이는 대표 사진
  const escaped = (w: number) => url("img", w).replace(/&/g, "&amp;");
  const img = `<img class="EmbeddedMediaImage" alt="x" src="${escaped(1080)}" srcset="${escaped(3024)} 3024w,${escaped(1080)} 1080w,${escaped(640)} 640w,${escaped(480)} 480w" />`;
  const [picked] = parseEmbedPhotos(img);
  expect(picked).toBe(url("img", 640));
  expect(photoExpiresAt(picked).toISOString()).toBe(
    new Date(parseInt(oe, 16) * 1000).toISOString()
  );
  expect(parseEmbedPhotos("<html>로그인이 필요해요</html>")).toEqual([]);
});

test("카드에 게시물 사진을 보여 주고, 여러 장이면 넘겨 볼 수 있다", async ({
  page,
  request,
}) => {
  nextSpots = () => [
    spot("MULTI3a", "여러 장 카페"),
    spot("PIC111", "한 장 카페"),
    spot("NOPIC2", "사진 없는 공방"),
  ];
  const token = await login(request);
  await openDates(page, token);
  await page.getByRole("button", { name: "지금 찾아 줘" }).click();

  const multi = page.getByRole("article", { name: "여러 장 카페" });
  const first = multi.getByRole("img", { name: "여러 장 카페 사진 1" });
  await expect(first).toBeVisible({ timeout: 20_000 });
  await expect(first).toHaveAttribute("src", /\/img\/MULTI3a-1-640\.png\?stp=dst&oe=/);
  await expect
    .poll(() => first.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await expect(multi.getByRole("img")).toHaveCount(3);
  await expect(multi.getByText("1 / 3")).toBeVisible();
  await expect(multi.getByRole("button", { name: "이전 사진" })).toBeDisabled();

  await multi.getByRole("button", { name: "다음 사진" }).click();
  await expect(multi.getByText("2 / 3")).toBeVisible();
  await expect(multi.getByRole("img", { name: "여러 장 카페 사진 2" })).toBeInViewport();
  await multi.getByRole("button", { name: "다음 사진" }).click();
  await expect(multi.getByText("3 / 3")).toBeVisible();
  await expect(multi.getByRole("button", { name: "다음 사진" })).toBeDisabled();
  await expect(
    multi.getByRole("link", { name: "여러 장 카페 인스타그램 게시물" }).first()
  ).toHaveAttribute("href", "https://www.instagram.com/p/MULTI3a/");

  // 한 장이면 넘기기·장수 표시 없이 사진만
  const single = page.getByRole("article", { name: "한 장 카페" });
  await expect(single.getByRole("img", { name: "한 장 카페 사진" })).toHaveAttribute(
    "src",
    /\/img\/PIC111-640\.png/
  );
  await expect(single.getByRole("button", { name: "다음 사진" })).toHaveCount(0);
  await expect(
    page.getByRole("article", { name: "사진 없는 공방" }).getByRole("img")
  ).toHaveCount(0);

  const { rows } = await pool.query(
    "select name, cardinality(photo_urls) as photos, photo_checked_at is not null as checked from date_spots order by id"
  );
  expect(rows).toEqual([
    { name: "여러 장 카페", photos: 3, checked: true },
    { name: "한 장 카페", photos: 1, checked: true },
    { name: "사진 없는 공방", photos: 0, checked: true },
  ]);
});

test("만료된 사진은 감추고, 만료가 가까우면 새 주소로 바꾼다", async ({
  page,
  request,
}) => {
  nextSpots = () => [spot("MULTI2b", "사진 있는 카페")];
  const token = await login(request);
  await openDates(page, token);
  await page.getByRole("button", { name: "지금 찾아 줘" }).click();
  const card = page.getByRole("article", { name: "사진 있는 카페" });
  await expect(card.getByRole("img")).toHaveCount(2, { timeout: 20_000 });

  // 만료된 주소는 화면에 내보내지 않는다(방금 찾아봤으면 다시 읽지 않음).
  await pool.query(
    "update date_spots set photo_urls = array['http://127.0.0.1:1/old.png'], photo_expires_at = now() - interval '1 hour', photo_checked_at = now()"
  );
  await page.reload();
  await expect(card).toBeVisible();
  await expect(card.getByRole("img")).toHaveCount(0);

  // 마지막 확인이 오래됐으면 화면을 불러올 때 새 주소를 읽어 온다.
  await pool.query("update date_spots set photo_checked_at = now() - interval '2 hours'");
  await page.reload();
  await expect(card.getByRole("img")).toHaveCount(2);
  await expect(card.getByRole("img", { name: "사진 있는 카페 사진 1" })).toHaveAttribute(
    "src",
    /MULTI2b-1-640/
  );
});
