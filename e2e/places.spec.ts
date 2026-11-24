import { createServer, type Server } from "node:http";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import {
  authHeaders,
  daysAgo,
  login,
  pool,
  resetLedger,
  resetPlaces,
  today,
} from "./helpers";

/**
 * 지역 수첩(/places). 앱은 NAVER_PLACE_ORIGIN과 NAVER_SEARCH_ORIGIN을 이 가짜 네이버 서버로 두고 띄운다.
 * - /place/<id>/home: 가계부 지도 링크의 장소 정보(좌표·주소·업종)
 * - /search.naver?query=: 지역 이름 검색 결과(장소 목록)
 * 지도 타일은 바깥 네트워크 없이 돌도록 빈 스타일로 바꿔 준다.
 */

const FAKE_PORT = Number(process.env.E2E_FAKE_NAVER_PLACE_PORT ?? 8973);

interface FakePlace {
  name: string;
  lat: number;
  lng: number;
  roadAddress: string;
  category: string;
}

/** 신도림역(37.5090, 126.8916) 둘레와 멀리 떨어진 성수 */
const PLACES: Record<string, FakePlace> = {
  "4001": {
    name: "신도림 국수집",
    lat: 37.508,
    lng: 126.889,
    roadAddress: "서울 구로구 경인로 1",
    category: "국수",
  },
  "4003": {
    name: "신도림 호텔",
    lat: 37.51,
    lng: 126.893,
    roadAddress: "서울 구로구 경인로 3",
    category: "호텔",
  },
  "4004": {
    name: "도림천 공방",
    lat: 37.515,
    lng: 126.895,
    roadAddress: "서울 구로구 도림로 4",
    category: "공방",
  },
  "4002": {
    name: "성수 파스타집",
    lat: 37.5446,
    lng: 127.0557,
    roadAddress: "서울 성동구 연무장길 2",
    category: "이탈리아음식",
  },
};

/** 검색어별 장소 목록. 동네 이름만 찾으면 가게가, "역"을 붙이면 역이 나온다. */
const SEARCH: Record<string, { name: string; category: string; x: string; y: string }[]> =
  {
    신도림역: [
      {
        name: "<mark>신도림역</mark> 1호선",
        category: "지하철,전철",
        x: "126.8916",
        y: "37.509",
      },
    ],
    신도림: [
      { name: "<mark>신도림</mark> 카페", category: "카페", x: "126.8900", y: "37.5100" },
    ],
  };

const placeHtml = (id: string, place: FakePlace) => {
  const state = {
    ROOT_QUERY: { __typename: "Query" },
    [`PlaceDetailBase:${id}`]: {
      __typename: "PlaceDetailBase",
      id,
      name: place.name,
      category: place.category,
      roadAddress: place.roadAddress,
      coordinate: { x: String(place.lng), y: String(place.lat) },
    },
  };
  return `<html><head><meta property="og:title" content="${place.name} : 네이버"/></head>
    <body><script>window.__APOLLO_STATE__ = ${JSON.stringify(state)};</script></body></html>`;
};

const searchHtml = (query: string) => {
  const state = Object.fromEntries(
    (SEARCH[query] ?? []).map((item, index) => [
      `PlaceListBusinessesItem:${9000 + index}`,
      {
        __typename: "PlaceListBusinessesItem",
        id: String(9000 + index),
        roadAddress: "새말로 117",
        fullAddress: "서울특별시 구로구 새말로 117",
        ...item,
      },
    ])
  );
  return `<html><body><script>window.__APOLLO_STATE__ = ${JSON.stringify(state)};</script></body></html>`;
};

let server: Server;

test.beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = createServer((req, res) => {
        const url = new URL(req.url ?? "/", "http://fake");
        if (url.pathname === "/search.naver") {
          res
            .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
            .end(searchHtml(url.searchParams.get("query") ?? ""));
          return;
        }
        const id = url.pathname.match(/^\/place\/(\d+)\/home/)?.[1];
        const place = id ? PLACES[id] : undefined;
        if (!id || !place) {
          res.writeHead(404).end();
          return;
        }
        res
          .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
          .end(placeHtml(id, place));
      });
      server.listen(FAKE_PORT, "127.0.0.1", resolve);
    })
);
test.afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const EMPTY_STYLE = {
  version: 8,
  sources: {},
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#f3f1ee" } },
  ],
};

let token = "";

test.beforeEach(async ({ page, request }) => {
  await resetLedger();
  await resetPlaces();
  await pool.query("truncate date_spot_digests restart identity cascade");
  token = await login(request);
  await page.context().route("https://tiles.openfreemap.org/**", (route) =>
    route.request().url().includes("/styles/")
      ? route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(EMPTY_STYLE),
        })
      : route.abort()
  );
});

const placeUrl = (id: string) => `https://map.naver.com/p/entry/place/${id}`;

const createEntry = async (
  request: APIRequestContext,
  data: { memo: string; amount: number; mapUrl?: string; entryDate?: string }
) => {
  const res = await request.post("/api/ledger/entries", {
    headers: authHeaders(token),
    data: { entryDate: today(), kind: "expense", ...data },
  });
  expect(res.ok()).toBe(true);
};

/** 하치와레 추천에 가 보고 싶어·다녀왔어를 남긴 상태를 만든다. */
const addSpot = async (spot: {
  name: string;
  area: string;
  reaction: "like" | "visited" | "pass";
  category?: string;
  address?: string;
}) => {
  const { rows } = await pool.query<{ id: number }>(
    `insert into date_spot_digests (day_key) values ($1)
     on conflict (day_key) do update set day_key = excluded.day_key returning id`,
    [today()]
  );
  await pool.query(
    `insert into date_spots (digest_id, name, area, category, address, reason, reaction, instagram_url, photo_checked_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
    [
      rows[0].id,
      spot.name,
      spot.area,
      spot.category ?? "카페",
      spot.address ?? null,
      `${spot.name}은 분위기가 좋아`,
      spot.reaction,
      `https://www.instagram.com/p/${encodeURIComponent(spot.name)}/`,
    ]
  );
};

const createArea = async (
  request: APIRequestContext,
  data: { name: string; lat: number; lng: number; radiusM?: number }
) => {
  const res = await request.post("/api/places/areas", {
    headers: authHeaders(token),
    data,
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: number };
};

const openPlaces = async (page: Page, path = "/places") => {
  await page.addInitScript((value) => {
    localStorage.setItem(
      "trable-auth",
      JSON.stringify({ state: { token: value }, version: 0 })
    );
  }, token);
  await page.goto(path);
  await page.getByRole("heading", { name: "지역 수첩" }).waitFor();
};

const section = (page: Page, name: string) => page.getByRole("region", { name });
const cards = (page: Page, name: string) => section(page, name).getByRole("article");

test("지역을 이름으로 찾아 추가하면 역이 먼저 나오고, 고른 곳이 지역 가운데가 된다", async ({
  page,
}) => {
  await openPlaces(page);
  await expect(page.getByText("아직 지역이 없어요")).toBeVisible();
  await page.getByRole("button", { name: "지역 추가" }).click();

  const dialog = page.getByRole("dialog", { name: "지역 추가" });
  await dialog.getByRole("textbox", { name: "지역 이름" }).fill("신도림");
  await dialog.getByRole("button", { name: "찾기" }).click();
  const found = dialog.getByRole("list", { name: "찾은 곳" }).getByRole("button");
  await expect(found).toHaveCount(2);
  // "신도림역"을 먼저 찾아 역을 앞에 둔다. 검색어 강조 태그는 뗀다.
  await expect(found.first()).toContainText("신도림역 1호선");
  await expect(found.first()).toContainText("지하철,전철");
  await expect(found.nth(1)).toContainText("신도림 카페");
  await found.first().click();

  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("group", { name: "지역" }).getByRole("button", { name: "신도림" })
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/신도림 반경 1.5km · 가 보고 싶은 곳 0/)).toBeVisible();
  await expect(page).toHaveURL(/[?&]area=\d+/);

  const saved = await pool.query(
    "select name, lat, lng, address, radius_m from place_areas"
  );
  expect(saved.rows).toEqual([
    {
      name: "신도림",
      lat: 37.509,
      lng: 126.8916,
      address: "서울특별시 구로구 새말로 117",
      radius_m: 1500,
    },
  ]);
});

test("고른 지역 반경 안의 가 보고 싶은 곳·다녀온 곳·숙소를 한 화면에 모은다", async ({
  page,
  request,
}) => {
  await createEntry(request, { memo: "국수", amount: 9_000, mapUrl: placeUrl("4001") });
  await createEntry(request, {
    memo: "국수 또",
    amount: 9_000,
    mapUrl: placeUrl("4001"),
    entryDate: daysAgo(10),
  });
  await createEntry(request, { memo: "1박", amount: 120_000, mapUrl: placeUrl("4003") });
  await createEntry(request, { memo: "공방", amount: 30_000, mapUrl: placeUrl("4004") });
  // 멀리 떨어진 곳은 빠진다.
  await createEntry(request, {
    memo: "파스타",
    amount: 18_000,
    mapUrl: placeUrl("4002"),
  });

  await addSpot({ name: "신도림 베이글", area: "신도림", reaction: "like" });
  await addSpot({
    name: "디큐브 전시",
    area: "구로",
    category: "전시",
    address: "서울 구로구 신도림동 692",
    reaction: "like",
  });
  await addSpot({ name: "성수 카페", area: "성수", reaction: "like" });
  await addSpot({ name: "신도림 별로집", area: "신도림", reaction: "pass" });
  // 가계부 지도에도 있는 곳은 가계부 카드로만 보인다.
  await addSpot({ name: "신도림 국수집", area: "신도림", reaction: "visited" });
  await addSpot({ name: "신도림 와인바", area: "신도림역", reaction: "visited" });

  const area = await createArea(request, { name: "신도림", lat: 37.509, lng: 126.8916 });
  await openPlaces(page, `/places?area=${area.id}`);

  // 가 보고 싶은 곳: 동네 이름이나 주소로 묶는다.
  await expect(cards(page, "가 보고 싶은 곳")).toHaveCount(2);
  await expect(section(page, "가 보고 싶은 곳")).toContainText("신도림 베이글");
  await expect(section(page, "가 보고 싶은 곳")).toContainText("디큐브 전시");
  await expect(section(page, "가 보고 싶은 곳")).toContainText(
    "신도림 베이글은 분위기가 좋아"
  );

  // 다녀온 곳: 반경 안의 가계부 지도 장소 + 다녀왔어로 표시한 추천
  const visited = cards(page, "다녀온 곳");
  await expect(visited).toHaveCount(3);
  await expect(visited.nth(0)).toContainText("신도림 국수집");
  await expect(visited.nth(0)).toContainText("2번 방문 · 18,000원");
  await expect(visited.nth(0)).toContainText(/가운데서 \d+m/);
  await expect(section(page, "다녀온 곳")).toContainText("도림천 공방");
  await expect(section(page, "다녀온 곳")).toContainText("신도림 와인바");
  await expect(section(page, "다녀온 곳")).not.toContainText("성수 파스타집");
  await expect(section(page, "다녀온 곳").getByText("리뷰 없는 곳 2")).toBeVisible();

  // 숙소: 업종으로 나눈다.
  await expect(cards(page, "숙소")).toHaveCount(1);
  await expect(section(page, "숙소")).toContainText("신도림 호텔");

  await expect(
    page.getByText("신도림 반경 1.5km · 가 보고 싶은 곳 2 · 다녀온 곳 3 · 숙소 1")
  ).toBeVisible();

  // 종류 필터: 놀거리만
  await page
    .getByRole("group", { name: "종류" })
    .getByRole("button", { name: "놀거리" })
    .click();
  await expect(page).toHaveURL(/kind=play/);
  await expect(cards(page, "가 보고 싶은 곳")).toHaveCount(1);
  await expect(section(page, "가 보고 싶은 곳")).toContainText("디큐브 전시");
  await expect(cards(page, "다녀온 곳")).toHaveCount(1);
  await expect(section(page, "다녀온 곳")).toContainText("도림천 공방");
  // 맛집·카페·놀거리 탭에서는 숙소 구역을 뺀다.
  await expect(section(page, "숙소")).toHaveCount(0);

  // 숙소 탭: 숙소 구역만 보인다.
  await page
    .getByRole("group", { name: "종류" })
    .getByRole("button", { name: "숙소" })
    .click();
  await expect(page).toHaveURL(/kind=stay/);
  await expect(cards(page, "숙소")).toHaveCount(1);
  await expect(section(page, "숙소")).toContainText("신도림 호텔");
  await expect(section(page, "가 보고 싶은 곳")).toHaveCount(0);
  await expect(section(page, "다녀온 곳")).toHaveCount(0);
  // 머리글 개수는 탭과 상관없이 지역 전체다.
  await expect(
    page.getByText("신도림 반경 1.5km · 가 보고 싶은 곳 2 · 다녀온 곳 3 · 숙소 1")
  ).toBeVisible();
});

test("지역 수첩 카드에서 간 날을 골라 리뷰를 남기면 데이트 지도에도 보이고, 반경을 줄이면 먼 곳이 빠진다", async ({
  page,
  request,
}) => {
  await createEntry(request, { memo: "국수", amount: 9_000, mapUrl: placeUrl("4001") });
  await createEntry(request, {
    memo: "국수 또",
    amount: 9_000,
    mapUrl: placeUrl("4001"),
    entryDate: daysAgo(10),
  });
  await createEntry(request, { memo: "공방", amount: 30_000, mapUrl: placeUrl("4004") });
  const area = await createArea(request, { name: "신도림", lat: 37.509, lng: 126.8916 });
  await openPlaces(page, `/places?area=${area.id}`);

  const noodle = section(page, "다녀온 곳").getByRole("article", {
    name: "신도림 국수집",
  });
  await expect(noodle.getByText("아직 리뷰가 없어요.")).toBeVisible();

  // 기본은 가장 최근에 간 날, 고르면 예전 날에도 남긴다.
  await noodle.getByRole("button", { name: "리뷰 쓰기" }).click();
  let editor = noodle.getByRole("group", { name: "리뷰 쓰기" });
  await editor
    .getByRole("group", { name: "쓴 사람" })
    .getByRole("button", { name: "예은" })
    .click();
  await editor.getByRole("radio", { name: "별 5개" }).click();
  await editor.getByRole("textbox", { name: "한 줄 리뷰" }).fill("국물이 진해");
  await editor.getByRole("button", { name: "저장" }).click();
  await expect(noodle.getByRole("listitem", { name: "예은 리뷰" })).toContainText(
    "국물이 진해"
  );

  await noodle.getByRole("button", { name: "리뷰 쓰기" }).click();
  await noodle.getByRole("combobox", { name: "간 날" }).click();
  await page
    .getByRole("option", { name: /에 간 날/ })
    .nth(1)
    .click();
  editor = noodle.getByRole("group", { name: "리뷰 쓰기" });
  await editor
    .getByRole("group", { name: "쓴 사람" })
    .getByRole("button", { name: "원찬" })
    .click();
  // 별 왼쪽 반을 누르면 반 개(3.5)다.
  await editor.getByRole("radio", { name: "별 3.5개" }).click();
  await expect(editor.getByRole("radio", { name: "별 3.5개" })).toBeChecked();
  await editor.getByRole("button", { name: "저장" }).click();
  await expect(
    noodle
      .getByRole("listitem", { name: "원찬 리뷰" })
      .getByRole("img", { name: "별 3.5개" })
  ).toBeVisible();
  await expect(
    noodle.getByRole("img", { name: "별점 평균 4.3, 리뷰 2개" })
  ).toBeVisible();
  await expect(section(page, "다녀온 곳").getByText("리뷰 없는 곳 1")).toBeVisible();

  const { rows } = await pool.query(
    `select e.entry_date, r.author, r.rating from place_reviews r
     join ledger_entries e on e.id = r.entry_id order by r.id`
  );
  expect(rows).toEqual([
    { entry_date: today(), author: "yeeun", rating: 5 },
    { entry_date: daysAgo(10), author: "wonchan", rating: 3.5 },
  ]);

  // 반경을 500m로 줄이면 700m쯤 떨어진 공방이 빠진다.
  await page.getByRole("combobox", { name: "반경" }).click();
  await page.getByRole("option", { name: "반경 500m" }).click();
  await expect(cards(page, "다녀온 곳")).toHaveCount(1);
  expect(
    (await pool.query("select radius_m from place_areas where id = $1", [area.id]))
      .rows[0]
  ).toEqual({ radius_m: 500 });

  // 데이트 지도에서도 같은 리뷰가 간 날에 붙어 보인다.
  await page.goto("/map?place=4001");
  const detail = page.getByRole("region", { name: "신도림 국수집 방문 기록" });
  await expect(
    detail.getByRole("img", { name: "별점 평균 4.3, 리뷰 2개" })
  ).toBeVisible();
  const days = detail.getByRole("list", { name: "간 날" }).locator(":scope > li");
  await expect(days.first().getByRole("listitem", { name: "예은 리뷰" })).toBeVisible();
  await expect(days.nth(1).getByRole("listitem", { name: "원찬 리뷰" })).toBeVisible();
});

test("지역을 지우면 다른 지역이 열리고, 리뷰는 남는다", async ({ page, request }) => {
  await createEntry(request, { memo: "국수", amount: 9_000, mapUrl: placeUrl("4001") });
  const { rows: entries } = await pool.query<{ id: number }>(
    "select id from ledger_entries where memo = '국수'"
  );
  await request.post("/api/places/reviews", {
    headers: authHeaders(token),
    data: { entryId: entries[0].id, author: "wonchan", rating: 4 },
  });
  const sungsu = await createArea(request, { name: "성수", lat: 37.5446, lng: 127.0557 });
  const sindorim = await createArea(request, {
    name: "신도림",
    lat: 37.509,
    lng: 126.8916,
  });
  await openPlaces(page, `/places?area=${sindorim.id}`);
  await expect(cards(page, "다녀온 곳")).toHaveCount(1);

  await page.getByRole("button", { name: "신도림 지역 지우기" }).click();
  await page.getByRole("button", { name: "지울래" }).click();
  await expect(
    page.getByRole("group", { name: "지역" }).getByRole("button", { name: "성수" })
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "신도림", exact: true })).toHaveCount(0);
  expect((await pool.query("select id from place_areas")).rows).toEqual([
    { id: sungsu.id },
  ]);
  expect((await pool.query("select rating from place_reviews")).rows).toEqual([
    { rating: 4 },
  ]);
});

test("지역 API는 잘못된 값을 막는다", async ({ request }) => {
  const headers = authHeaders(token);
  expect((await request.get("/api/places/areas/search?q=", { headers })).status()).toBe(
    400
  );
  expect(
    (
      await request.get(`/api/places/areas/search?q=${"가".repeat(21)}`, { headers })
    ).status()
  ).toBe(400);
  expect((await request.get("/api/places/areas/search?q=신도림")).status()).toBe(401);

  const area = await createArea(request, { name: "신도림", lat: 37.509, lng: 126.8916 });
  // 같은 이름은 두 번 만들 수 없다.
  const dup = await request.post("/api/places/areas", {
    headers,
    data: { name: "신도림", lat: 37.5, lng: 126.9 },
  });
  expect(dup.status()).toBe(409);
  // 좌표·반경 검증
  for (const data of [
    { name: "", lat: 37.5, lng: 126.9 },
    { name: "이상한 곳", lat: 120, lng: 126.9 },
    { name: "이상한 곳", lat: 37.5, lng: 126.9, radiusM: 700 },
  ]) {
    expect((await request.post("/api/places/areas", { headers, data })).status()).toBe(
      400
    );
  }
  expect(
    (
      await request.patch(`/api/places/areas/${area.id}`, {
        headers,
        data: { radiusM: 123 },
      })
    ).status()
  ).toBe(400);
  expect((await request.get("/api/places?area=999", { headers })).status()).toBe(404);
  expect((await request.get("/api/places?area=abc", { headers })).status()).toBe(400);
  expect((await request.delete("/api/places/areas/999", { headers })).status()).toBe(404);

  // 지역을 안 고르면 최근에 연 지역을 연다.
  const sungsu = await createArea(request, { name: "성수", lat: 37.5446, lng: 127.0557 });
  await request.get(`/api/places?area=${area.id}`, { headers });
  const recent = await request.get("/api/places", { headers });
  const payload = (await recent.json()) as {
    area: { id: number };
    areas: { id: number }[];
  };
  expect(payload.area.id).toBe(area.id);
  expect(payload.areas.map((item) => item.id)).toEqual([area.id, sungsu.id]);
});
