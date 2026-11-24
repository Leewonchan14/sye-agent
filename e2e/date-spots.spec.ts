import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";

import { expect, type Page, test } from "@playwright/test";

import { parseSpotMedia, spotMediaUrls } from "../src/lib/dates/media";
import { parseEmbedPhotos, photoExpiresAt } from "../src/lib/dates/photo";
import { kst } from "../src/lib/kst";
import { daysAgo, login, pool, resetLedger, resetPlaces, today } from "./helpers";

/**
 * 데이트 추천 매일 조사. 앱을 `HERMES_API_URL=http://127.0.0.1:${FAKE_HERMES_PORT}`로 띄우면
 * 아래 가짜 Hermes가 프롬프트에서 콜백 주소·토큰을 읽어 하치와레처럼 결과를 보낸다.
 * `INSTAGRAM_EMBED_ORIGIN`도 같은 주소로 두면 인스타그램 임베드·사진 서버 역할까지 한다.
 * 즐길 거리의 소개 페이지(`/store/…`)도 같은 서버가 대표 이미지(og:image)를 실어 내보낸다.
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
const fakeOrigin = () => `http://127.0.0.1:${FAKE_HERMES_PORT}`;
const photoBase = () => `${fakeOrigin()}/img`;
/** 1×1 PNG */
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
/** 테스트 브라우저(Chromium)는 H.264를 못 틀어서 VP9 영상을 .mp4 주소로 내보낸다. */
const TINY_VIDEO = readFileSync(new URL("./fixtures/tiny.webm", import.meta.url));
const videoSrc = (code: string) => `${photoBase()}/${code}.mp4?efg=v&oe=${futureOe()}`;
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
const videoNode = (code: string) => ({
  ...mediaNode(code),
  is_video: true,
  video_url: videoSrc(code),
});
/**
 * `MULTI<n>…`으로 시작하는 게시물은 n장짜리 게시물 데이터를 싣고(`MULTI<n>v…`면 마지막 장이 영상),
 * 나머지는 데이터 없이 대표 사진 태그만 둔다(데이터가 없을 때의 대체 경로).
 */
const embedHtml = (code: string) => {
  const src = (w: number) => photoSrc(code, w).replace(/&/g, "&amp;");
  const img = `<img class="EmbeddedMediaImage" alt="Instagram post shared by &#064;seongsu_date" src="${src(1080)}" srcset="${src(1080)} 1080w,${src(640)} 640w,${src(320)} 320w" />`;
  const [, countText = "0", video] = code.match(/^MULTI(\d+)(v?)/) ?? [];
  const count = Number(countText);
  const context = count
    ? contextScript({
        ...mediaNode(`${code}-0`),
        edge_sidecar_to_children: {
          edges: Array.from({ length: count }, (_, i) => ({
            node:
              video && i === count - 1
                ? videoNode(`${code}-${i + 1}`)
                : mediaNode(`${code}-${i + 1}`),
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

/** 소개 페이지 주소. 가짜 서버가 대표 이미지(og:image)를 실은 HTML로 답한다. */
const storeUrl = (name: string) => `${fakeOrigin()}/store/${encodeURIComponent(name)}`;
/** 소개 페이지 대표 이미지 — 페이지에는 상대 주소로 실려 있다. */
const STORE_IMAGE_PATH = "/img/store-cover.png";

/** 즐길거리 — 인스타 대신 공식·소개 페이지를 근거로 받는다. */
const content = (name: string, extra: Record<string, unknown> = {}) => ({
  kind: "content",
  name,
  area: "집",
  category: "집데이트",
  summary: `${name} 소개 문장입니다.`,
  reason: "둘이 같이 하면 더 재밌어요.",
  sourceUrl: `${storeUrl(name)}#reviews`,
  period: "상시",
  priceHint: "2인 3만원대",
  tags: ["협동", "2인"],
  ...extra,
});

/** 게임 — 인스타그램 게시물이 소개한 것만 받는다. 상점 페이지는 확인용 근거로 같이 둔다. */
const game = (code: string, name: string, extra: Record<string, unknown> = {}) =>
  content(name, {
    category: "게임",
    instagramUrl: `https://www.instagram.com/p/${code}/`,
    instagramAuthor: "couple_games",
    tags: ["협동", "공포", "2인"],
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
      if (req.method === "GET" && path.startsWith("/store/")) {
        // 이름에 "이미지 없는"이 들어간 페이지는 대표 이미지 태그가 없다.
        const noImage = decodeURIComponent(path).includes("이미지 없는");
        const meta = noImage
          ? ""
          : `<meta content="${STORE_IMAGE_PATH}?v=1&amp;w=640" property="og:image" />`;
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          `<html><head><title>상점</title>${meta}</head><body><img src="/img/logo.png" /></body></html>`
        );
        return;
      }
      if (req.method === "GET" && path.startsWith("/img/")) {
        const video = new URL(path, "http://x").pathname.endsWith(".mp4");
        res.writeHead(200, { "Content-Type": video ? "video/webm" : "image/png" });
        res.end(video ? TINY_VIDEO : PIXEL);
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
  await page.getByRole("heading", { name: "데이트 추천" }).waitFor();
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
  expect(second).toContain("좋아했던 것(비슷한 결로 참고): 성수 온실카페(성수)");
  expect(second).toContain("연무장 팝업(성수)");
  // 같은 게시물은 두 번 저장하지 않는다.
  const { rows: count } = await pool.query("select count(*)::int as n from date_spots");
  expect(count[0].n).toBe(3);
});

/** 지난 날짜의 조사 결과를 장소 하나와 함께 바로 넣는다. */
const seedDigest = async (dayKey: string, spotName: string) => {
  const { rows } = await pool.query(
    "insert into date_spot_digests (day_key, note) values ($1, $2) returning id",
    [dayKey, `${spotName} 고른 날`]
  );
  await pool.query(
    `insert into date_spots (digest_id, name, area, instagram_url, photo_checked_at)
     values ($1, $2, '성수', $3, now())`,
    [rows[0].id, spotName, `https://www.instagram.com/p/${dayKey}/`]
  );
};

test("고른 날짜가 주소(?day=)에 남고, 뒤로 가기·앞으로 가기로 날짜가 바뀐다", async ({
  page,
  request,
}) => {
  const yesterday = daysAgo(1);
  const twoDaysAgo = daysAgo(2);
  await seedDigest(yesterday, "어제 간 카페");
  await seedDigest(twoDaysAgo, "그저께 간 전시");
  const token = await login(request);
  await openDates(page, token);

  const dates = page.getByRole("region", { name: "매일 추천" }).getByLabel("날짜");
  const chip = (label: string) =>
    dates.getByRole("button", {
      name: new RegExp(`^${label.replace(/[().]/g, "\\$&")}`),
    });
  const yesterdayChip = chip("어제");
  const twoDaysAgoChip = chip(kst(twoDaysAgo).format("M.D (dd)"));
  const todayChip = chip("오늘");

  // 오늘 조사가 없으면 가장 최근 날을 보여 주고, 주소에는 날짜를 붙이지 않는다.
  await expect(page.getByRole("article", { name: "어제 간 카페" })).toBeVisible();
  await expect(yesterdayChip).toHaveAttribute("aria-pressed", "true");
  expect(new URL(page.url()).searchParams.get("day")).toBeNull();

  await twoDaysAgoChip.click();
  await expect(page).toHaveURL(new RegExp(`[?&]day=${twoDaysAgo}`));
  await expect(page.getByRole("article", { name: "그저께 간 전시" })).toBeVisible();
  await expect(twoDaysAgoChip).toHaveAttribute("aria-pressed", "true");

  await todayChip.click();
  await expect(page).toHaveURL(new RegExp(`[?&]day=${today()}`));
  await expect(page.getByText("오늘 추천은 아직이에요")).toBeVisible();

  // 뒤로 가기를 누를 때마다 직전에 보던 날짜로 돌아간다.
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`[?&]day=${twoDaysAgo}`));
  await expect(page.getByRole("article", { name: "그저께 간 전시" })).toBeVisible();
  await expect(twoDaysAgoChip).toHaveAttribute("aria-pressed", "true");

  await page.goBack();
  await expect(page).toHaveURL(/\/dates$/);
  await expect(page.getByRole("article", { name: "어제 간 카페" })).toBeVisible();
  await expect(yesterdayChip).toHaveAttribute("aria-pressed", "true");

  await page.goForward();
  await expect(page.getByRole("article", { name: "그저께 간 전시" })).toBeVisible();

  // 주소로 바로 들어와도 그 날짜를 보여 주고, 형식이 틀린 날짜는 무시한다.
  await page.goto(`/dates?day=${twoDaysAgo}`);
  await expect(page.getByRole("article", { name: "그저께 간 전시" })).toBeVisible();
  await page.goto("/dates?day=not-a-day");
  await expect(page.getByRole("article", { name: "어제 간 카페" })).toBeVisible();
});

test("보고 있는 탭이 주소(?tab=)에 남고, 뒤로 가기·새로고침에도 유지된다", async ({
  page,
  request,
}) => {
  const yesterday = daysAgo(1);
  await seedDigest(yesterday, "어제 간 카페");
  await pool.query("update date_spots set reaction = 'like' where name = '어제 간 카페'");
  const token = await login(request);
  await openDates(page, token);

  const dailyTab = page.getByRole("button", { name: /매일 추천/ });
  const likedTab = page.getByRole("button", { name: /가 보고 싶은 곳/ });
  const daily = page.getByRole("region", { name: "매일 추천" });
  const liked = page.getByRole("region", { name: "가 보고 싶은 곳" });

  // 기본 탭(매일 추천)은 주소에 붙이지 않는다.
  await expect(dailyTab).toHaveAttribute("aria-pressed", "true");
  await expect(daily).toBeVisible();
  expect(new URL(page.url()).searchParams.get("tab")).toBeNull();

  await likedTab.click();
  await expect(page).toHaveURL(/[?&]tab=liked/);
  await expect(likedTab).toHaveAttribute("aria-pressed", "true");
  await expect(liked.getByRole("article", { name: "어제 간 카페" })).toBeVisible();

  // 새로고침해도 같은 탭이 열린다.
  await page.reload();
  await expect(likedTab).toHaveAttribute("aria-pressed", "true");
  await expect(liked).toBeVisible();

  // 뒤로 가기를 누르면 직전 탭으로 돌아간다.
  await dailyTab.click();
  await expect(page).toHaveURL(/\/dates$/);
  await expect(daily).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/[?&]tab=liked/);
  await expect(liked).toBeVisible();

  // 주소로 바로 들어와도 그 탭을 보여 주고, 모르는 값은 기본 탭으로 본다.
  await page.goto("/dates?tab=liked");
  await expect(liked).toBeVisible();
  await page.goto("/dates?tab=unknown");
  await expect(dailyTab).toHaveAttribute("aria-pressed", "true");
  await expect(daily).toBeVisible();
});

test("하트를 끄면 가 보고 싶은 곳에서 뺄지 묻고 다녀온 곳으로 옮긴다", async ({
  page,
  request,
}) => {
  await seedDigest(daysAgo(1), "어제 간 카페");
  await seedDigest(daysAgo(2), "그저께 간 전시");
  await pool.query("update date_spots set reaction = 'like'");
  const token = await login(request);
  await openDates(page, token);

  const likedTab = page.getByRole("button", { name: /가 보고 싶은 곳/ });
  const visitedTab = page.getByRole("button", { name: /다녀온 곳/ });
  const liked = page.getByRole("region", { name: "가 보고 싶은 곳" });
  const visited = page.getByRole("region", { name: "다녀온 곳" });
  const dialog = page.getByRole("alertdialog");
  const reactionOf = async (name: string) =>
    (await pool.query("select reaction from date_spots where name = $1", [name])).rows[0]
      .reaction;

  // 하트를 끄면 가 보고 싶은 곳에서 뺄지 묻는다. "그대로 둘래"면 아무것도 바뀌지 않는다.
  await likedTab.click();
  const cafe = liked.getByRole("article", { name: "어제 간 카페" });
  await cafe.getByRole("button", { name: "가 보고 싶어" }).click();
  await expect(dialog).toContainText("가 보고 싶은 곳에서 뺄까요?");
  await expect(dialog).toContainText(
    "‘어제 간 카페’ 카드는 지워지지 않고 다녀온 곳 탭으로 옮겨져요."
  );
  await dialog.getByRole("button", { name: "그대로 둘래" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(cafe).toBeVisible();
  expect(await reactionOf("어제 간 카페")).toBe("like");

  // "뺄래"를 누르면 가 보고 싶은 곳에서 빠지고 다녀온 곳으로 간다.
  await cafe.getByRole("button", { name: "가 보고 싶어" }).click();
  await dialog.getByRole("button", { name: "뺄래" }).click();
  await expect(cafe).toHaveCount(0);
  await expect.poll(() => reactionOf("어제 간 카페")).toBe("visited");

  // 다녀왔어를 직접 누르면 묻지 않고 다녀온 곳 탭으로 옮긴다.
  await liked
    .getByRole("article", { name: "그저께 간 전시" })
    .getByRole("button", { name: "다녀왔어" })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(liked.getByRole("article", { name: "그저께 간 전시" })).toHaveCount(0);
  await expect.poll(() => reactionOf("그저께 간 전시")).toBe("visited");
  await visitedTab.click();
  await expect(page).toHaveURL(/[?&]tab=visited/);
  const exhibit = visited.getByRole("article", { name: "그저께 간 전시" });
  await expect(exhibit).toBeVisible();
  await expect(visited.getByRole("article", { name: "어제 간 카페" })).toBeVisible();

  // 다녀온 곳에서 빼는 건 한 번 묻는다.
  await exhibit.getByRole("button", { name: "다녀왔어" }).click();
  await expect(dialog).toContainText("다녀온 곳에서 뺄까요?");
  await expect(dialog).toContainText(
    "‘그저께 간 전시’ 카드가 다녀온 곳 목록에서 사라져요."
  );
  await dialog.getByRole("button", { name: "뺄래" }).click();
  await expect(exhibit).toHaveCount(0);
  await expect.poll(() => reactionOf("그저께 간 전시")).toBeNull();

  // 다녀온 곳에서 다시 하트를 켤 때는 묻지 않는다.
  await page.goto(`/dates?day=${daysAgo(1)}`);
  await page
    .getByRole("article", { name: "어제 간 카페" })
    .getByRole("button", { name: "가 보고 싶어" })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => reactionOf("어제 간 카페")).toBe("like");
});

test("최근 날짜는 칩으로, 그 전 날짜는 달력으로 고른다", async ({ page, request }) => {
  // 1~8일 전과 10일 전에 조사가 있다(9일 전은 없음).
  for (const ago of [1, 2, 3, 4, 5, 6, 7, 8, 10]) {
    await seedDigest(daysAgo(ago), `${ago}일 전 장소`);
  }
  const token = await login(request);
  await openDates(page, token);

  const dates = page.getByRole("region", { name: "매일 추천" }).getByLabel("날짜");
  const picker = dates.getByRole("button", { name: /^날짜 고르기/ });
  // 칩은 오늘 포함 최근 7개(오늘, 1~6일 전)만 보여 준다.
  await expect(dates.getByRole("button", { name: /^(오늘|어제|\d+\.\d+ )/ })).toHaveCount(
    7
  );
  await expect(dates.getByRole("button", { name: /^어제/ })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(picker).toHaveAttribute("aria-pressed", "false");

  const target = daysAgo(10);
  await picker.click();
  const calendar = page.locator("[data-slot=popover-content]");
  const cell = (dayKey: string) =>
    calendar.locator(`[data-day="${dayKey}"]:not([data-outside])`);
  // 달력은 보고 있는 날짜(어제)의 달부터 보여 준다. 10일 전이 지난달이면 한 달 앞으로 간다.
  if (target.slice(0, 7) !== daysAgo(1).slice(0, 7)) {
    await calendar.locator(".rdp-button_previous").click();
  }
  await expect(cell(target)).toBeVisible();
  // 조사하지 않은 날과 미래는 고를 수 없다.
  if (daysAgo(9).slice(0, 7) === target.slice(0, 7)) {
    await expect(cell(daysAgo(9))).toHaveAttribute("data-disabled", "true");
  }
  await cell(target).getByRole("button").click();

  await expect(page).toHaveURL(new RegExp(`[?&]day=${target}`));
  await expect(page.getByRole("article", { name: "10일 전 장소" })).toBeVisible();
  await expect(picker).toHaveAttribute("aria-pressed", "true");
  await expect(picker).toContainText(kst(target).format("M.D"));
  await expect(dates.getByRole("button", { name: /^어제/ })).toHaveAttribute(
    "aria-pressed",
    "false"
  );

  // 뒤로 가기로 칩에서 보던 날짜로 돌아간다.
  await page.goBack();
  await expect(page.getByRole("article", { name: "1일 전 장소" })).toBeVisible();
  await expect(picker).toHaveAttribute("aria-pressed", "false");
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
  await expect(page.getByText(/서울·연남에서 5개씩/)).toBeVisible();

  nextSpots = () => [];
  await page.getByRole("button", { name: "지금 찾아 줘" }).click();
  await expect(page.getByText("오늘 추천은 아직이에요")).toBeVisible({ timeout: 20_000 });
  // 안내 문구는 요청 전에도 보이므로, 하치와레가 프롬프트를 받을 때까지 기다린다.
  await expect.poll(() => runs.get("run_1")?.input ?? "").toContain("지역: 서울, 연남");
  const input = runs.get("run_1")?.input ?? "";
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
  expect(second.notifications.join("\n")).toContain("오늘의 데이트 추천 1개");

  const third = await tick();
  expect(third.notifications.join("\n")).not.toContain("데이트 추천");
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

test("장소와 같이 즐길 거리(팝업·게임)를 한 목록으로 받아 함께 보여 준다", async ({
  page,
  request,
}) => {
  nextSpots = () => [
    spot("PLC111", "성수 온실카페"),
    game("GAME111", "둘이서 탈출하는 공포 게임"),
    content("캐릭터 팝업스토어", {
      area: "용산",
      category: "팝업·전시",
      sourceUrl: "https://popup.example.com/notice/1",
      instagramUrl: "https://www.instagram.com/p/POP222/",
      instagramAuthor: "popup_official",
      address: "서울 용산구 한강대로 23",
      period: "11.14~12.7",
      priceHint: null,
      tags: ["한정판", "포토존"],
    }),
  ];
  const token = await login(request);
  await openDates(page, token);
  await page.getByRole("button", { name: "지금 찾아 줘" }).click();

  const daily = page.getByRole("region", { name: "매일 추천" });
  await expect(daily.getByRole("article", { name: "캐릭터 팝업스토어" })).toBeVisible({
    timeout: 20_000,
  });
  // 가 볼 곳과 즐길 거리를 나누지 않고 받은 순서대로 한 목록에 보여 준다.
  await expect(page.getByRole("region", { name: "같이 즐길 거리" })).toHaveCount(0);
  await expect(daily.getByRole("article")).toHaveText([
    /성수 온실카페/,
    /둘이서 탈출하는 공포 게임/,
    /캐릭터 팝업스토어/,
  ]);

  // 집에서 하는 게임은 소개한 인스타 게시물과 상점 페이지를 연결하고 지도는 없다(# 조각은 뗀다).
  const gameCard = daily.getByRole("article", { name: "둘이서 탈출하는 공포 게임" });
  await expect(gameCard.getByRole("link", { name: "자세히" })).toHaveAttribute(
    "href",
    storeUrl("둘이서 탈출하는 공포 게임")
  );
  await expect(gameCard.getByRole("link", { name: /^인스타/ })).toHaveAttribute(
    "href",
    "https://www.instagram.com/p/GAME111/"
  );
  await expect(gameCard.getByRole("link", { name: "지도" })).toHaveCount(0);
  await expect(gameCard.getByText("상시")).toBeVisible();
  // 상점 대표 이미지보다 인스타그램 게시물 사진을 먼저 쓴다.
  await expect(
    gameCard.getByRole("img", { name: "둘이서 탈출하는 공포 게임 사진" })
  ).toHaveAttribute("src", /\/img\/GAME111-640\.png/);

  // 팝업은 기간·주소와 함께 인스타·소개 페이지·지도를 모두 연결하고 게시물 사진도 보여 준다.
  const popup = daily.getByRole("article", { name: "캐릭터 팝업스토어" });
  await expect(popup.getByText("11.14~12.7")).toBeVisible();
  await expect(popup.getByRole("link", { name: /^인스타/ })).toBeVisible();
  await expect(popup.getByRole("link", { name: "자세히" })).toHaveAttribute(
    "href",
    "https://popup.example.com/notice/1"
  );
  await expect(popup.getByRole("link", { name: "지도" })).toBeVisible();
  await expect(popup.getByRole("img", { name: "캐릭터 팝업스토어 사진" })).toBeVisible();

  // 즐길거리도 찜할 수 있다.
  await gameCard.getByRole("button", { name: "가 보고 싶어" }).click();
  await page.getByRole("button", { name: /가 보고 싶은 곳/ }).click();
  await expect(
    page.getByRole("article", { name: "둘이서 탈출하는 공포 게임" })
  ).toBeVisible();

  const input = runs.get("run_1")?.input ?? "";
  // 장소와 즐길 거리를 따로 세지 않고 합쳐서 하루 추천 수만큼 찾게 한다.
  expect(input).toContain("데이트 추천을 5개 찾아 줘");
  expect(input).toContain("한 목록으로 섞어서");
  expect(input).toContain('"kind": "place"');
  expect(input).toContain('"kind": "content"');
  // 게임은 상점에서 직접 고르지 않고 인스타그램 게시물이 소개한 것만 고르게 한다.
  expect(input).toContain("#커플게임");
  expect(input).toContain("인스타그램 게시물이 소개한 게임만");
  expect(input).not.toContain("커플 공포 게임 스팀");

  const { rows } = await pool.query(
    "select name, kind, instagram_url, source_url, period from date_spots order by id"
  );
  expect(rows).toEqual([
    {
      name: "성수 온실카페",
      kind: "place",
      instagram_url: "https://www.instagram.com/p/PLC111/",
      source_url: null,
      period: null,
    },
    {
      name: "둘이서 탈출하는 공포 게임",
      kind: "content",
      instagram_url: "https://www.instagram.com/p/GAME111/",
      source_url: storeUrl("둘이서 탈출하는 공포 게임"),
      period: "상시",
    },
    {
      name: "캐릭터 팝업스토어",
      kind: "content",
      instagram_url: "https://www.instagram.com/p/POP222/",
      source_url: "https://popup.example.com/notice/1",
      period: "11.14~12.7",
    },
  ]);

  // 다음 조사에는 즐길거리도 이미 추천한 것·좋아한 것으로 알려 준다.
  nextSpots = () => [];
  await page.getByRole("button", { name: /매일 추천/ }).click();
  await page.getByRole("button", { name: "더 찾아 줘" }).click();
  await expect.poll(() => runs.get("run_2")?.input ?? "").toContain("[즐길거리] 둘이서");
  expect(runs.get("run_2")?.input).toContain(
    "좋아했던 것(비슷한 결로 참고): [즐길거리] 둘이서 탈출하는 공포 게임(집)"
  );
});

test("하루 추천 수는 장소와 즐길 거리를 합친 개수다", async ({ page, request }) => {
  const token = await login(request);
  await openDates(page, token);

  await page.getByRole("button", { name: "조건" }).click();
  const dialog = page.getByRole("dialog");
  // 즐길 거리 개수를 따로 고르는 칸은 없다.
  await expect(dialog.getByRole("combobox", { name: "하루 즐길거리 수" })).toHaveCount(0);
  await dialog.getByRole("combobox", { name: "하루 추천 수" }).click();
  await page.getByRole("option", { name: "7개" }).click();
  await dialog.getByRole("button", { name: "저장" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/서울에서 7개씩 골라 와요/)).toBeVisible();

  nextSpots = () => [];
  await page.getByRole("button", { name: "지금 찾아 줘" }).click();
  await expect(page.getByText("오늘 추천은 아직이에요")).toBeVisible({ timeout: 20_000 });
  const input = runs.get("run_1")?.input ?? "";
  expect(input).toContain("데이트 추천을 7개 찾아 줘");
  expect(input).toContain('"kind": "content"');
  expect(input).not.toContain("곳 찾아 줘");
});

test("즐길거리는 근거 주소가 있어야 하고, 같은 소개 페이지는 한 번만 받는다", async ({
  request,
}) => {
  const {
    rows: [digest],
  } = await pool.query(
    "insert into date_spot_digests (day_key) values ('2026-01-02') returning id"
  );
  const post = (spots: unknown[]) =>
    request.post("/api/dates/agent/digests", {
      headers: { "x-monitor-key": ingestKey },
      data: { digestId: digest.id, spots },
    });

  const noSource = await post([content("근거 없는 게임", { sourceUrl: "" })]);
  expect(noSource.status()).toBe(400);
  expect((await noSource.json()).error).toContain("sourceUrl");

  const badSource = await post([
    content("이상한 주소", { sourceUrl: "javascript:alert(1)" }),
  ]);
  expect(badSource.status()).toBe(400);

  // 게임은 상점 페이지만으로는 받지 않는다 — 소개한 인스타그램 게시물이 있어야 한다.
  const gameNoInsta = await post([
    game("x", "상점에서 고른 게임", { instagramUrl: null, instagramAuthor: null }),
  ]);
  expect(gameNoInsta.status()).toBe(400);
  expect((await gameNoInsta.json()).error).toContain("게임은 그 게임을 소개한");

  // 장소는 여전히 인스타그램 게시물이 있어야 한다.
  const placeNoInsta = await post([
    spot("x", "인스타 없는 장소", {
      instagramUrl: null,
      sourceUrl: "https://a.example.com/",
    }),
  ]);
  expect(placeNoInsta.status()).toBe(400);
  expect((await placeNoInsta.json()).error).toContain("인스타그램 게시물 주소");

  const first = await post([content("협동 퍼즐 게임"), spot("SRC111", "장소 하나")]);
  expect(first.status()).toBe(201);
  expect(await first.json()).toMatchObject({ inserted: 2, skipped: 0 });

  const again = await post([
    content("협동 퍼즐 게임", { name: "협동 퍼즐 게임 (다시)" }),
  ]);
  expect(await again.json()).toMatchObject({ inserted: 0, skipped: 1 });
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
  // 영상은 표지 사진을 붙인 영상 주소를, 영상 주소가 없으면 표지 사진을 쓴다.
  const video = `https://scontent.cdninstagram.com/o1/v/t16/clip.mp4?efg=a&oe=${oe}`;
  expect(
    parseEmbedPhotos(
      contextScript({
        ...node("cover"),
        edge_sidecar_to_children: {
          edges: [
            { node: node("p1") },
            { node: { ...node("v1"), is_video: true, video_url: video } },
            { node: { ...node("v2"), is_video: true } },
          ],
        },
      })
    )
  ).toEqual([
    url("p1", 640),
    `${video}#poster=${encodeURIComponent(url("v1", 640))}`,
    url("v2", 640),
  ]);
  expect(parseSpotMedia(`${video}#poster=${encodeURIComponent(url("v1", 640))}`)).toEqual(
    {
      kind: "video",
      src: video,
      poster: url("v1", 640),
    }
  );
  expect(parseSpotMedia(video)).toEqual({ kind: "video", src: video, poster: null });
  expect(parseSpotMedia(url("p1", 640))).toEqual({ kind: "photo", src: url("p1", 640) });
  // 만료 시각은 영상과 표지 사진 둘 다 따진다.
  expect(spotMediaUrls(`${video}#poster=${encodeURIComponent(url("v1", 640))}`)).toEqual([
    video,
    url("v1", 640),
  ]);

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

/** 트랙패드로 화면 폭의 80%만큼 좌우로 미는 것처럼 가로 휠 이벤트를 잇달아 보낸다. */
const swipeWheel = async (page: Page, direction: 1 | -1) => {
  // 모바일 에뮬레이션은 휠 값을 기기 픽셀로 받으므로 배율을 곱한다.
  const ratio = await page.evaluate(() => window.devicePixelRatio);
  const step = page.viewportSize()!.width * 0.1 * ratio * direction;
  for (let index = 0; index < 8; index += 1) {
    await page.mouse.wheel(step, 0);
    await page.waitForTimeout(16);
  }
  // 손을 뗀 뒤 자리를 잡을 때까지 기다려야 다음 스크롤을 새 동작으로 본다.
  await page.waitForTimeout(800);
};

test("카드에 게시물 사진을 보여 주고, 여러 장이면 넘겨 볼 수 있다", async ({
  page,
  request,
}) => {
  nextSpots = () => [
    spot("MULTI3a", "여러 장 카페"),
    spot("PIC111", "한 장 카페"),
    spot("NOPIC2", "사진 없는 공방"),
    spot("MULTI2v", "영상 섞인 카페"),
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

  // 사진을 누르면 화면 가득 커지고, 크게 본 채로도 넘길 수 있다.
  await multi.getByRole("button", { name: "여러 장 카페 사진 3 크게 보기" }).click();
  const gallery = page.getByRole("dialog", { name: "여러 장 카페 사진 크게 보기" });
  await expect(gallery).toBeVisible();
  const big = (n: number) => gallery.getByRole("img", { name: `여러 장 카페 사진 ${n}` });
  await expect(big(3)).toBeInViewport();
  await expect(big(3)).toHaveAttribute("src", /\/img\/MULTI3a-3-640\.png/);
  await expect(big(3)).toHaveAttribute("referrerpolicy", "no-referrer");
  await expect(gallery.getByText("3 / 3")).toBeVisible();
  await expect(gallery.getByRole("button", { name: "다음 사진" })).toBeDisabled();
  // 화살표 버튼, 키보드, 밀기로 넘긴다. 밀어서 넘긴 것은 닫기로 치지 않는다.
  await gallery.getByRole("button", { name: "이전 사진" }).click();
  await expect(gallery.getByText("2 / 3")).toBeVisible();
  await expect(big(2)).toBeInViewport();
  await page.keyboard.press("ArrowLeft");
  await expect(gallery.getByText("1 / 3")).toBeVisible();
  await expect(gallery.getByRole("button", { name: "이전 사진" })).toBeDisabled();
  const view = page.viewportSize()!;
  await page.mouse.move(view.width * 0.8, view.height / 2);
  await page.mouse.down();
  await page.mouse.move(view.width * 0.2, view.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(gallery.getByText("2 / 3")).toBeVisible();
  await expect(gallery).toBeVisible();
  // 트랙패드처럼 좌우로 스크롤해도 넘어간다.
  await swipeWheel(page, 1);
  await expect(gallery.getByText("3 / 3")).toBeVisible();
  await swipeWheel(page, -1);
  await expect(gallery.getByText("2 / 3")).toBeVisible();
  // 크게 보는 사진은 카드보다 크다.
  expect((await big(2).boundingBox())!.width).toBeGreaterThan(
    (await multi.boundingBox())!.width * 0.9
  );
  // 닫으면 카드도 마지막에 본 사진에 와 있다.
  await page.keyboard.press("Escape");
  await expect(gallery).toBeHidden();
  await expect(multi.getByText("2 / 3")).toBeVisible();
  await expect(multi.getByRole("img", { name: "여러 장 카페 사진 2" })).toBeInViewport();
  // 사진을 한 번 누르거나 닫기 버튼으로도 닫는다.
  await multi.getByRole("button", { name: "여러 장 카페 사진 2 크게 보기" }).click();
  await big(2).click();
  await expect(gallery).toBeHidden();
  await multi.getByRole("button", { name: "여러 장 카페 사진 2 크게 보기" }).click();
  await gallery.getByRole("button", { name: "닫기" }).click();
  await expect(gallery).toBeHidden();
  // 카드에서 넘기려고 끈 것은 크게 보기로 치지 않는다.
  const box = (await multi
    .getByRole("img", { name: "여러 장 카페 사진 2" })
    .boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(multi.getByText("1 / 3")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // 카드도 좌우 스크롤로 넘기고, 위아래 스크롤은 사진을 넘기지 않는다.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await swipeWheel(page, 1);
  await expect(multi.getByText("2 / 3")).toBeVisible();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await swipeWheel(page, -1);
  await expect(multi.getByText("1 / 3")).toBeVisible();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(500);
  await expect(multi.getByText("1 / 3")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // 영상은 GIF처럼 소리 없이 반복 재생한다.
  const clip = page.getByRole("article", { name: "영상 섞인 카페" });
  await clip.getByRole("button", { name: "다음 사진" }).click();
  const video = clip.locator("video");
  await expect(video).toHaveAttribute("aria-label", "영상 섞인 카페 영상 2");
  await expect(video).toHaveAttribute(
    "src",
    /\/img\/MULTI2v-2\.mp4\?efg=v&oe=[0-9A-F]+$/
  );
  await expect(video).toHaveAttribute("poster", /\/img\/MULTI2v-2-640\.png/);
  expect(
    await video.evaluate((el: HTMLVideoElement) => ({ muted: el.muted, loop: el.loop }))
  ).toEqual({ muted: true, loop: true });
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.paused))
    .toBe(false);
  // 영상도 사진처럼 누르면 크게 보고, 크게 본 화면에서도 GIF처럼 돈다.
  await clip.getByRole("button", { name: "영상 섞인 카페 영상 2 크게 보기" }).click();
  const clipGallery = page.getByRole("dialog", { name: "영상 섞인 카페 사진 크게 보기" });
  const zoomedVideo = clipGallery.locator('video[aria-label="영상 섞인 카페 영상 2"]');
  await expect(zoomedVideo).toBeVisible();
  await expect(zoomedVideo).toHaveAttribute("src", /\/img\/MULTI2v-2\.mp4/);
  await expect(zoomedVideo).toHaveAttribute("aria-label", "영상 섞인 카페 영상 2");
  await expect
    .poll(() =>
      zoomedVideo.evaluate((el: HTMLVideoElement) => !el.paused && el.loop && el.muted)
    )
    .toBe(true);
  // 카드에서 4:3으로 잘렸던 영상이 화면에 맞춰 다 보인다.
  expect(
    await zoomedVideo.evaluate((el) => el.getBoundingClientRect().height)
  ).toBeGreaterThan((await video.boundingBox())!.height);
  // 크게 본 채로 사진 칸으로 넘기면 영상은 멈춘다.
  await clipGallery.getByRole("button", { name: "이전 사진" }).click();
  await expect
    .poll(() => zoomedVideo.evaluate((el: HTMLVideoElement) => el.paused))
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(clipGallery).toBeHidden();
  await clip.getByRole("button", { name: "다음 사진" }).click();
  // 보이지 않는 칸으로 넘기면 멈춘다.
  await clip.getByRole("button", { name: "이전 사진" }).click();
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);

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
    { name: "영상 섞인 카페", photos: 2, checked: true },
  ]);
});

test("인스타 게시물이 없는 즐길 거리는 소개 페이지의 대표 이미지를 보여 준다", async ({
  page,
  request,
}) => {
  nextSpots = () => [
    content("연말 재즈 공연", {
      area: "마포",
      category: "공연·영화",
      period: "12.20~12.31",
    }),
    content("대표 이미지 없는 집데이트"),
  ];
  const token = await login(request);
  await openDates(page, token);
  await page.getByRole("button", { name: "지금 찾아 줘" }).click();

  // og:image의 상대 주소를 소개 페이지 주소 기준으로 풀어 한 장만 보여 준다.
  const concert = page.getByRole("article", { name: "연말 재즈 공연" });
  await expect(concert.getByRole("img", { name: "연말 재즈 공연 사진" })).toHaveAttribute(
    "src",
    `${fakeOrigin()}${STORE_IMAGE_PATH}?v=1&w=640`,
    { timeout: 20_000 }
  );
  await expect(concert.getByRole("button", { name: "다음 사진" })).toHaveCount(0);
  await expect(
    page.getByRole("article", { name: "대표 이미지 없는 집데이트" }).getByRole("img")
  ).toHaveCount(0);

  // 대표 이미지는 만료되지 않으니 일주일 뒤에 다시 읽는다.
  const { rows } = await pool.query(
    `select name, cardinality(photo_urls) as photos, photo_checked_at is not null as checked,
       photo_expires_at > now() + interval '6 days' as long_lived
     from date_spots order by id`
  );
  expect(rows).toEqual([
    { name: "연말 재즈 공연", photos: 1, checked: true, long_lived: true },
    { name: "대표 이미지 없는 집데이트", photos: 0, checked: true, long_lived: null },
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

/* ───────── 지역 수첩·리뷰와 하치와레 ───────── */

/** 가계부 지도에 찍힌 지출을 바로 넣는다(네이버 장소를 읽지 않는다). */
const seedPlaceEntry = async (
  memo: string,
  placeId: string,
  name: string,
  category = ""
) => {
  const { rows } = await pool.query<{ id: number }>(
    `insert into ledger_entries (entry_date, kind, amount, memo, map_url, map_place_id, map_place_name, map_lat, map_lng, map_category)
     values ($1, 'expense', 10000, $2, $3, $4, $5, 37.509, 126.8916, $6) returning id`,
    [
      today(),
      memo,
      `https://map.naver.com/p/entry/place/${placeId}`,
      placeId,
      name,
      category,
    ]
  );
  return rows[0].id;
};

const resetPlaceData = async () => {
  await resetLedger();
  await resetPlaces();
};

test("다녀와서 남긴 리뷰가 하치와레 프롬프트와 추천 카드에 반영되고, 별점이 낮은 곳은 저장하지 않는다", async ({
  page,
  request,
}) => {
  await resetPlaceData();
  const token = await login(request);
  const headers = { "x-auth-token": token };
  const review = (entryId: number, author: string, rating: number, text = "") =>
    request.post("/api/places/reviews", {
      headers,
      data: { entryId, author, rating, review: text },
    });
  const good = await seedPlaceEntry("국수", "5001", "좋은 국수집");
  await review(good, "yeeun", 5, "국물이 진해");
  await review(good, "wonchan", 4);
  const bad = await seedPlaceEntry("파스타", "5002", "별로 파스타");
  await review(bad, "wonchan", 2, "너무 짜");
  await review(bad, "yeeun", 1);
  const soso = await seedPlaceEntry("라테", "5003", "보통 카페");
  await review(soso, "wonchan", 3);

  nextSpots = () => [
    spot("PPP111", "새 카페", { naverPlaceId: "5009", lat: 37.5085, lng: 126.8905 }),
    // 장소 id가 같으면 이름이 달라도 같은 곳이다.
    spot("PPP222", "다른 이름 파스타", { naverPlaceId: "5002" }),
    // 장소 id가 없으면 이름으로 본다.
    spot("PPP333", "별로 파스타"),
    // 링크를 통째로 보내도 장소 id만 남긴다. 위도만 있으면 좌표는 버린다.
    spot("PPP444", "좋은 국수집", {
      naverPlaceId: "https://map.naver.com/p/entry/place/5001",
      lat: 37.5,
    }),
  ];
  const started = await request.post("/api/dates", { headers });
  expect(started.status()).toBe(202);
  await expect
    .poll(
      async () => (await pool.query("select count(*)::int n from date_spots")).rows[0].n,
      {
        timeout: 20_000,
      }
    )
    .toBe(2);

  const input = runs.get("run_1")?.input ?? "";
  expect(input).toContain(
    '우리가 다녀와서 좋았던 곳(리뷰 평균 별 4 이상, 리뷰를 보고 이런 결의 비슷한 곳을 골라): 좋은 국수집(★4.5, 예은 "국물이 진해")'
  );
  expect(input).toContain(
    '우리가 다녀와서 별로였던 곳(리뷰 평균 별 2 이하, 이곳들은 다시 추천하지 마. 보내도 저장되지 않아): 별로 파스타(★1.5, 원찬 "너무 짜")'
  );
  expect(input).not.toContain("보통 카페");
  expect(input).toContain('"naverPlaceId"');

  const { rows } = await pool.query(
    "select name, naver_place_id, lat, lng from date_spots order by id"
  );
  expect(rows).toEqual([
    { name: "새 카페", naver_place_id: "5009", lat: 37.5085, lng: 126.8905 },
    { name: "좋은 국수집", naver_place_id: "5001", lat: null, lng: null },
  ]);

  // 다녀와서 남긴 리뷰가 추천 카드에 붙고, 지도는 그 장소 페이지로 연다.
  await openDates(page, token);
  const noodle = page.getByRole("article", { name: "좋은 국수집" });
  const reviews = noodle.getByRole("region", { name: "다녀와서 남긴 리뷰" });
  await expect(
    reviews.getByRole("img", { name: "별점 평균 4.5, 리뷰 2개" })
  ).toBeVisible();
  await expect(reviews.getByRole("listitem", { name: "예은 리뷰" })).toContainText(
    "국물이 진해"
  );
  await expect(noodle.getByRole("link", { name: "지도" })).toHaveAttribute(
    "href",
    "https://map.naver.com/p/entry/place/5001"
  );
  await expect(
    page.getByRole("article", { name: "새 카페" }).getByRole("region", {
      name: "다녀와서 남긴 리뷰",
    })
  ).toHaveCount(0);
});

test("지역 수첩의 '이 동네 더 찾아 줘'는 그 동네만 찾고, 새 추천을 가 보고 싶은 곳으로 옮긴다", async ({
  page,
  request,
}) => {
  await resetPlaceData();
  const token = await login(request);
  const headers = { "x-auth-token": token };
  const areaRes = await request.post("/api/places/areas", {
    headers,
    data: {
      name: "신도림",
      lat: 37.509,
      lng: 126.8916,
      address: "서울 구로구 새말로 117",
    },
  });
  const area = (await areaRes.json()) as { id: number };
  expect((await request.post("/api/places/areas/999/search", { headers })).status()).toBe(
    404
  );

  nextSpots = () => [
    spot("QQQ111", "신도림 베이커리", { area: "구로", lat: 37.5085, lng: 126.8905 }),
    // 좌표가 반경 밖이면 동네 이름이 맞아도 빠진다.
    spot("QQQ222", "멀리 있는 신도림 카페", {
      area: "신도림",
      lat: 37.5446,
      lng: 127.0557,
    }),
    // 좌표가 없으면 동네 이름으로 묶는다.
    spot("QQQ333", "신도림 국밥", { area: "신도림" }),
  ];

  await page.context().route("https://tiles.openfreemap.org/**", (route) =>
    route.request().url().includes("/styles/")
      ? route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ version: 8, sources: {}, layers: [] }),
        })
      : route.abort()
  );
  await page.addInitScript((value) => {
    localStorage.setItem(
      "trable-auth",
      JSON.stringify({ state: { token: value }, version: 0 })
    );
  }, token);
  await page.goto(`/places?area=${area.id}`);
  await page.getByRole("heading", { name: "지역 수첩" }).waitFor();
  await expect(page.getByRole("region", { name: "하치와레 새 추천" })).toHaveCount(0);

  await page.getByRole("button", { name: "이 동네 더 찾아 줘" }).click();
  const fresh = page.getByRole("region", { name: "하치와레 새 추천" });
  await expect(fresh.getByRole("article")).toHaveCount(2, { timeout: 20_000 });
  await expect(fresh).toContainText("신도림 베이커리");
  await expect(fresh).toContainText("신도림 국밥");
  await expect(fresh).not.toContainText("멀리 있는 신도림 카페");
  await expect(page.getByRole("button", { name: "이 동네 더 찾아 줘" })).toBeEnabled();

  const input = runs.get("run_1")?.input ?? "";
  expect(input).toContain("지역 수첩에서 '신도림' 동네만 골라서 더 찾아 달라는 요청이야");
  expect(input).toContain(
    "지역: 신도림 한 곳만 — 가운데 서울 구로구 새말로 117 (위도 37.509, 경도 126.8916)에서 반경 1.5km 안"
  );
  // 결과는 오늘 데이트 추천에도 쌓인다.
  const { rows } = await pool.query(
    "select s.name from date_spots s join date_spot_digests d on d.id = s.digest_id where d.day_key = $1",
    [today()]
  );
  expect(rows).toHaveLength(3);

  await fresh
    .getByRole("article", { name: "신도림 베이커리" })
    .getByRole("button", { name: "가 보고 싶어" })
    .click();
  const want = page.getByRole("region", { name: "가 보고 싶은 곳" });
  await expect(want.getByRole("article", { name: "신도림 베이커리" })).toBeVisible();
  await expect(want).toContainText(/가운데서 \d+m/);
  await expect(fresh.getByRole("article")).toHaveCount(1);

  await fresh
    .getByRole("article", { name: "신도림 국밥" })
    .getByRole("button", { name: "별로" })
    .click();
  await expect(page.getByRole("region", { name: "하치와레 새 추천" })).toHaveCount(0);
  expect(
    (
      await pool.query(
        "select name, reaction from date_spots where reaction is not null order by name"
      )
    ).rows
  ).toEqual([
    { name: "신도림 국밥", reaction: "pass" },
    { name: "신도림 베이커리", reaction: "like" },
  ]);
});

/** 숙소 — NOL 숙소 페이지를 근거로 받는다. */
const stay = (name: string, extra: Record<string, unknown> = {}) => ({
  kind: "stay",
  name,
  area: "신도림",
  category: "호텔",
  summary: `${name} 소개 문장입니다.`,
  reason: "역에서 가까워요.",
  sourceUrl: storeUrl(name),
  address: "서울 구로구 새말로 1",
  priceHint: "1박 12만원대 (12.5~6 기준)",
  tags: ["평점 9.2", "후기 1,203"],
  lat: 37.5088,
  lng: 126.8912,
  ...extra,
});

test("지역 수첩 숙소 탭에서 날짜를 골라 이 동네 숙소를 찾고, 가 보고 싶은 숙소로 모은다", async ({
  page,
  request,
}) => {
  await resetPlaceData();
  const token = await login(request);
  const headers = { "x-auth-token": token };
  // 묵었던 숙소 리뷰는 숙소 찾기에 넣고, 맛집 리뷰는 넣지 않는다.
  const hotel = await seedPlaceEntry("1박", "7001", "지난번 호텔", "호텔");
  await request.post("/api/places/reviews", {
    headers,
    data: { entryId: hotel, author: "yeeun", rating: 5, review: "조식이 맛있어" },
  });
  const noodle = await seedPlaceEntry("국수", "7002", "맛있는 국수", "국수");
  await request.post("/api/places/reviews", {
    headers,
    data: { entryId: noodle, author: "wonchan", rating: 5 },
  });
  const areaRes = await request.post("/api/places/areas", {
    headers,
    data: {
      name: "신도림",
      lat: 37.509,
      lng: 126.8916,
      address: "서울 구로구 새말로 117",
    },
  });
  const area = (await areaRes.json()) as { id: number };

  // 숙소 찾기는 날짜가 있어야 하고, 지난 날짜는 안 된다.
  const searchApi = (data: unknown) =>
    request.post(`/api/places/areas/${area.id}/search`, { headers, data });
  expect((await searchApi({ mode: "stay" })).status()).toBe(400);
  expect((await searchApi({ mode: "stay", checkin: daysAgo(1) })).status()).toBe(400);
  expect(
    (
      await searchApi({
        mode: "stay",
        checkin: kst().add(200, "day").format("YYYY-MM-DD"),
      })
    ).status()
  ).toBe(400);

  nextSpots = () => [
    stay("샘플 호텔"),
    stay("샘플 게스트하우스", { category: "게스트하우스", lat: 37.5079, lng: 126.8897 }),
  ];

  await page.context().route("https://tiles.openfreemap.org/**", (route) =>
    route.request().url().includes("/styles/")
      ? route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ version: 8, sources: {}, layers: [] }),
        })
      : route.abort()
  );
  await page.addInitScript((value) => {
    localStorage.setItem(
      "trable-auth",
      JSON.stringify({ state: { token: value }, version: 0 })
    );
  }, token);
  await page.goto(`/places?area=${area.id}&kind=stay`);
  await page.getByRole("heading", { name: "지역 수첩" }).waitFor();
  // 숙소 탭에서는 다녀온 곳 구역 없이 숙소만 본다.
  await expect(page.getByRole("region", { name: "다녀온 곳" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "가 보고 싶은 숙소" })).toBeVisible();
  await expect(page.getByRole("region", { name: "숙소", exact: true })).toContainText(
    "지난번 호텔"
  );

  await page.getByRole("button", { name: "이 동네 숙소 찾아 줘" }).click();
  const dialog = page.getByRole("dialog", { name: "신도림 숙소 찾기" });
  const saturday = kst().startOf("day");
  const nextSat = saturday.add((6 - saturday.day() + 7) % 7, "day").format("YYYY-MM-DD");
  await expect(dialog.getByLabel("체크인 날짜")).toHaveValue(nextSat);
  const checkin = kst().add(10, "day");
  await dialog.getByLabel("체크인 날짜").fill(checkin.format("YYYY-MM-DD"));
  await dialog.getByRole("button", { name: "찾아 줘" }).click();
  await expect(dialog).toBeHidden();

  const fresh = page.getByRole("region", { name: "하치와레 새 추천" });
  await expect(fresh.getByRole("article")).toHaveCount(2, { timeout: 20_000 });
  const hotelCard = fresh.getByRole("article", { name: "샘플 호텔" });
  await expect(hotelCard).toContainText("1박 12만원대 (12.5~6 기준)");
  await expect(
    hotelCard.getByRole("link", { name: "샘플 호텔 NOL에서 보기" })
  ).toHaveAttribute("href", storeUrl("샘플 호텔"));

  const input = runs.get("run_1")?.input ?? "";
  const checkout = checkin.add(1, "day");
  expect(input).toContain("[지역 수첩 숙소 찾기] 신도림");
  expect(input).toContain(`체크인 ${checkin.format("YYYY.MM.DD (dd)")}`);
  expect(input).toContain(
    `opencli yanolja search "신도림 호텔" --checkin ${checkin.format("YYYY-MM-DD")} --checkout ${checkout.format("YYYY-MM-DD")}`
  );
  expect(input).toContain("반경 1.5km 안만");
  expect(input).toContain('"kind": "stay"');
  expect(input).toContain('지난번 호텔(★5, 예은 "조식이 맛있어")');
  expect(input).not.toContain("맛있는 국수");

  await hotelCard.getByRole("button", { name: "가 보고 싶어" }).click();
  const wantStays = page.getByRole("region", { name: "가 보고 싶은 숙소" });
  await expect(wantStays.getByRole("article", { name: "샘플 호텔" })).toBeVisible();
  await expect(fresh.getByRole("article")).toHaveCount(1);

  // 맛집·카페 탭에서는 숙소 추천이 보이지 않는다.
  await page
    .getByRole("group", { name: "종류" })
    .getByRole("button", { name: "맛집·카페" })
    .click();
  await expect(page.getByRole("region", { name: "하치와레 새 추천" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "가 보고 싶은 곳" })).not.toContainText(
    "샘플 호텔"
  );

  // 숙소도 오늘 데이트 추천에 쌓이고, NOL 링크로 연다.
  await openDates(page, token);
  const card = page.getByRole("article", { name: "샘플 게스트하우스" });
  await expect(card.getByRole("link", { name: "NOL에서 보기" })).toHaveAttribute(
    "href",
    storeUrl("샘플 게스트하우스")
  );
  const { rows } = await pool.query("select name, kind from date_spots order by id");
  expect(rows).toEqual([
    { name: "샘플 호텔", kind: "stay" },
    { name: "샘플 게스트하우스", kind: "stay" },
  ]);
});

test("숙소는 NOL 페이지 주소가 있어야 받고, 매일 조사에는 숙소를 넣지 않는다", async ({
  request,
}) => {
  const token = await login(request);
  const { rows } = await pool.query<{ id: number }>(
    "insert into date_spot_digests (day_key) values ($1) returning id",
    [today()]
  );
  const post = (spots: unknown[]) =>
    request.post("/api/dates/agent/digests", {
      headers: { "x-monitor-key": ingestKey },
      data: { digestId: rows[0].id, spots },
    });
  const missing = await post([stay("주소 없는 호텔", { sourceUrl: null })]);
  expect(missing.status()).toBe(400);
  expect(await missing.text()).toContain("NOL 숙소 페이지");
  expect((await post([stay("주소 있는 호텔")])).status()).toBe(201);

  nextSpots = () => [];
  await request.post("/api/dates", { headers: { "x-auth-token": token } });
  await expect
    .poll(() => runs.get("run_1")?.input ?? "")
    .toContain('숙소("stay")는 넣지 마');
});
