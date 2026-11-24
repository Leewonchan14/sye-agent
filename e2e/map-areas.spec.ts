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
 * 데이트 지도(/map)의 동네와 레이어(예전 지역 수첩).
 * 앱은 NAVER_PLACE_ORIGIN과 NAVER_SEARCH_ORIGIN을 이 가짜 네이버 서버로 두고 띄운다.
 * - /place/<id>/home: 가계부 지도 링크의 장소 정보(좌표·주소·업종)
 * - /search.naver?query=: 동네 이름 검색 결과(장소 목록)
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

/** 하치와레 추천. reaction이 null이면 아직 표시하지 않은 새 추천이다. */
const addSpot = async (spot: {
  name: string;
  area: string;
  reaction: "like" | "visited" | "pass" | null;
  category?: string;
  address?: string;
}) => {
  const { rows } = await pool.query<{ id: number }>(
    `insert into date_spot_digests (day_key) values ($1)
     on conflict (day_key) do update set day_key = excluded.day_key returning id`,
    [today()]
  );
  const { rows: spots } = await pool.query<{ id: number }>(
    `insert into date_spots (digest_id, name, area, category, address, reason, reaction, instagram_url, photo_checked_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, now()) returning id`,
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
  return spots[0].id;
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

const openMap = async (page: Page, path = "/map") => {
  await page.addInitScript((value) => {
    localStorage.setItem(
      "trable-auth",
      JSON.stringify({ state: { token: value }, version: 0 })
    );
  }, token);
  await page.goto(path);
  await page.getByRole("heading", { name: "데이트 지도" }).waitFor();
};

const section = (page: Page, name: string) =>
  page.getByRole("region", { name, exact: true });
/** 구역 안 목록(가계부 장소·추천)의 줄 */
const rows = (page: Page, name: string) => section(page, name).getByRole("listitem");
const areaPicker = (page: Page) => page.getByRole("combobox", { name: "동네" });
const layerChip = (page: Page, name: string) =>
  page
    .getByRole("group", { name: "지도에 보기" })
    .getByRole("button", { name: new RegExp(`^${name}`) });

test("동네를 이름으로 찾아 추가하면 역이 먼저 나오고, 고른 곳이 동네 가운데가 된다", async ({
  page,
}) => {
  await openMap(page);
  // 처음에는 동네를 고르지 않은 전체 보기다.
  await expect(areaPicker(page)).toContainText("동네 전체");
  await expect(page.getByText("아직 지도에 찍힌 곳이 없어요")).toBeVisible();
  await page.getByRole("button", { name: "동네 추가" }).click();

  const dialog = page.getByRole("dialog", { name: "동네 추가" });
  await dialog.getByRole("textbox", { name: "동네 이름" }).fill("신도림");
  await dialog.getByRole("button", { name: "찾기" }).click();
  const found = dialog.getByRole("list", { name: "찾은 곳" }).getByRole("button");
  await expect(found).toHaveCount(2);
  // "신도림역"을 먼저 찾아 역을 앞에 둔다. 검색어 강조 태그는 뗀다.
  await expect(found.first()).toContainText("신도림역 1호선");
  await expect(found.first()).toContainText("지하철,전철");
  await expect(found.nth(1)).toContainText("신도림 카페");
  await found.first().click();

  await expect(dialog).toBeHidden();
  await expect(areaPicker(page)).toContainText("신도림");
  await expect(page.getByText(/^신도림 반경 1.5km · /)).toBeVisible();
  await expect(page).toHaveURL(/[?&]area=\d+/);
  // 빈 동네는 지도를 보여 주고, 하치와레에게 찾아 달라고 하라고 알려 준다.
  await expect(page.getByText("신도림에는 아직 모아 둔 곳이 없어요.")).toBeVisible();
  await expect(page.getByRole("button", { name: "더 찾아 줘" })).toBeEnabled();

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

test("고른 동네 반경 안의 다녀온 곳·가 보고 싶은 곳·숙소를 모으고, 레이어를 켜고 끈다", async ({
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
  // 멀리 떨어진 곳은 동네를 고르면 빠진다.
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
  // 가계부 지도에도 있는 곳은 가계부 장소로만 보인다.
  await addSpot({ name: "신도림 국수집", area: "신도림", reaction: "visited" });
  await addSpot({ name: "신도림 와인바", area: "신도림역", reaction: "visited" });

  const area = await createArea(request, { name: "신도림", lat: 37.509, lng: 126.8916 });
  await openMap(page, `/map?area=${area.id}`);

  // 다녀온 곳: 반경 안의 가계부 지도 장소 + 다녀왔어로 표시한 추천
  await expect(rows(page, "다녀온 곳")).toHaveCount(3);
  const visitedLedger = section(page, "다녀온 곳").getByRole("list", {
    name: "다녀온 곳",
  });
  await expect(visitedLedger.getByRole("listitem").first()).toContainText(
    "신도림 국수집"
  );
  await expect(visitedLedger.getByRole("listitem").first()).toContainText("2번");
  await expect(visitedLedger).toContainText("도림천 공방");
  await expect(
    section(page, "다녀온 곳").getByRole("list", { name: "다녀왔어로 표시한 곳" })
  ).toContainText("신도림 와인바");
  await expect(section(page, "다녀온 곳")).not.toContainText("성수 파스타집");

  // 가 보고 싶은 곳: 좌표가 없는 추천은 동네 이름이나 주소로 묶는다.
  await expect(rows(page, "가 보고 싶은 곳")).toHaveCount(2);
  await expect(section(page, "가 보고 싶은 곳")).toContainText("신도림 베이글");
  await expect(section(page, "가 보고 싶은 곳")).toContainText(
    "신도림 베이글은 분위기가 좋아"
  );
  await expect(section(page, "가 보고 싶은 곳")).toContainText("디큐브 전시");

  // 숙소: 업종으로 나눈다.
  await expect(
    section(page, "숙소").getByRole("list", { name: "묵었던 숙소" })
  ).toContainText("신도림 호텔");
  await expect(rows(page, "숙소")).toHaveCount(1);
  await expect(section(page, "하치와레 새 추천")).toHaveCount(0);

  await expect(
    page.getByText(
      /^신도림 반경 1.5km · .*다녀온 곳 3곳 · 4번 · 168,000원 · 가 보고 싶은 곳 2곳 · 숙소 1곳$/
    )
  ).toBeVisible();
  await expect(layerChip(page, "다녀온 곳")).toContainText("3");
  await expect(layerChip(page, "가 보고 싶은 곳")).toContainText("2");
  await expect(layerChip(page, "숙소")).toContainText("1");

  // 레이어 끄기: 숙소를 끄면 숙소 구역이 빠지고 주소에 남는다.
  await layerChip(page, "숙소").click();
  await expect(layerChip(page, "숙소")).toHaveAttribute("aria-pressed", "false");
  await expect(section(page, "숙소")).toHaveCount(0);
  await expect(page).toHaveURL(/layers=visited,want/);
  await layerChip(page, "가 보고 싶은 곳").click();
  await expect(section(page, "가 보고 싶은 곳")).toHaveCount(0);
  // 마지막 레이어는 끌 수 없다.
  await layerChip(page, "다녀온 곳").click();
  await expect(layerChip(page, "다녀온 곳")).toHaveAttribute("aria-pressed", "true");
  await expect(rows(page, "다녀온 곳")).toHaveCount(3);
  // 다 켜면 주소에서 뺀다.
  await layerChip(page, "숙소").click();
  await layerChip(page, "가 보고 싶은 곳").click();
  await expect(page).not.toHaveURL(/layers=/);

  // 검색은 추천의 이유·리뷰까지 함께 거른다.
  await page.getByRole("searchbox", { name: "다녀온 곳 검색" }).fill("베이글");
  await expect(rows(page, "가 보고 싶은 곳")).toHaveCount(1);
  await expect(section(page, "다녀온 곳")).toHaveCount(0);
  await page.getByRole("button", { name: "검색·필터 지우기" }).click();

  // 동네 전체로 돌아가면 먼 곳과 다른 동네 추천도 보인다.
  await areaPicker(page).click();
  await page.getByRole("option", { name: "동네 전체" }).click();
  await expect(page).not.toHaveURL(/area=/);
  await expect(rows(page, "다녀온 곳")).toHaveCount(4);
  await expect(section(page, "다녀온 곳")).toContainText("성수 파스타집");
  await expect(rows(page, "가 보고 싶은 곳")).toHaveCount(3);
  await expect(section(page, "가 보고 싶은 곳")).toContainText("성수 카페");
  // 뒤로 가기로 앞 동네로 돌아간다.
  await page.goBack();
  await expect(areaPicker(page)).toContainText("신도림");
  await expect(rows(page, "다녀온 곳")).toHaveCount(3);
});

test("동네의 새 추천을 골라 가 보고 싶어·별로를 남기면 구역을 옮기거나 빠진다", async ({
  page,
  request,
}) => {
  const gelato = await addSpot({ name: "신도림 젤라또", area: "신도림", reaction: null });
  const pub = await addSpot({ name: "신도림 포차", area: "신도림", reaction: null });
  await addSpot({ name: "성수 새 카페", area: "성수", reaction: null });
  await createArea(request, { name: "신도림", lat: 37.509, lng: 126.8916 });

  // 동네를 안 고르면 새 추천은 보이지 않는다.
  await openMap(page);
  await expect(page.getByText("아직 지도에 찍힌 곳이 없어요")).toBeVisible();

  await areaPicker(page).click();
  await page.getByRole("option", { name: "신도림" }).click();
  const fresh = section(page, "하치와레 새 추천");
  await expect(fresh.getByRole("listitem")).toHaveCount(2);
  await expect(fresh).not.toContainText("성수 새 카페");
  await expect(layerChip(page, "가 보고 싶은 곳")).toContainText("2");

  await fresh.getByRole("button", { name: /신도림 젤라또/ }).click();
  await expect(page).toHaveURL(new RegExp(`place=spot(:|%3A)${gelato}$`));
  const detail = page.getByRole("region", { name: "신도림 젤라또 추천" });
  await expect(detail).toContainText("하치와레 새 추천 · 카페");
  await expect(detail).toContainText("신도림 젤라또은 분위기가 좋아");
  await detail.getByRole("button", { name: "가 보고 싶어" }).click();
  await expect(page.getByText("가 보고 싶은 곳에 넣었어요.")).toBeVisible();
  // 고른 채로 가 보고 싶은 곳으로 옮겨 가고, 표시 버튼은 사라진다.
  await expect(section(page, "가 보고 싶은 곳")).toContainText("신도림 젤라또");
  await expect(detail).toContainText("가 보고 싶은 곳 · 카페");
  await expect(detail.getByRole("button", { name: "가 보고 싶어" })).toHaveCount(0);
  await expect(fresh.getByRole("listitem")).toHaveCount(1);

  await fresh.getByRole("button", { name: /신도림 포차/ }).click();
  await page
    .getByRole("region", { name: "신도림 포차 추천" })
    .getByRole("button", { name: "별로" })
    .click();
  await expect(section(page, "하치와레 새 추천")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "신도림 포차 추천" })).toHaveCount(0);
  expect(
    (
      await pool.query(
        "select id, reaction from date_spots where reaction is not null order by id"
      )
    ).rows
  ).toEqual([
    { id: gelato, reaction: "like" },
    { id: pub, reaction: "pass" },
  ]);
});

test("반경을 줄이면 먼 곳이 빠지고, 동네를 지우면 전체로 돌아가며 리뷰는 남는다", async ({
  page,
  request,
}) => {
  await createEntry(request, { memo: "국수", amount: 9_000, mapUrl: placeUrl("4001") });
  await createEntry(request, { memo: "공방", amount: 30_000, mapUrl: placeUrl("4004") });
  await createEntry(request, {
    memo: "파스타",
    amount: 18_000,
    mapUrl: placeUrl("4002"),
  });
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
  await openMap(page, `/map?area=${sindorim.id}`);
  await expect(rows(page, "다녀온 곳")).toHaveCount(2);

  // 반경을 500m로 줄이면 700m쯤 떨어진 공방이 빠진다.
  await page.getByRole("combobox", { name: "반경" }).click();
  await page.getByRole("option", { name: "반경 500m" }).click();
  await expect(rows(page, "다녀온 곳")).toHaveCount(1);
  await expect(page.getByText(/^신도림 반경 500m · /)).toBeVisible();
  expect(
    (await pool.query("select radius_m from place_areas where id = $1", [sindorim.id]))
      .rows[0]
  ).toEqual({ radius_m: 500 });

  // 동네 고르기 목록은 최근에 연 동네가 먼저다.
  await areaPicker(page).click();
  await expect(page.getByRole("option")).toHaveText(["동네 전체", "신도림", "성수"]);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "신도림 동네 지우기" }).click();
  await page.getByRole("button", { name: "지울래" }).click();
  await expect(areaPicker(page)).toContainText("동네 전체");
  await expect(page).not.toHaveURL(/area=/);
  await expect(rows(page, "다녀온 곳")).toHaveCount(3);
  await areaPicker(page).click();
  await expect(page.getByRole("option")).toHaveText(["동네 전체", "성수"]);
  await page.keyboard.press("Escape");

  expect((await pool.query("select id from place_areas")).rows).toEqual([
    { id: sungsu.id },
  ]);
  expect((await pool.query("select rating from place_reviews")).rows).toEqual([
    { rating: 4 },
  ]);
});

test("예전 지역 수첩 주소는 같은 동네를 고른 데이트 지도로 옮겨 간다", async ({
  page,
  request,
}) => {
  await createEntry(request, { memo: "1박", amount: 120_000, mapUrl: placeUrl("4003") });
  await createEntry(request, { memo: "국수", amount: 9_000, mapUrl: placeUrl("4001") });
  const area = await createArea(request, { name: "신도림", lat: 37.509, lng: 126.8916 });

  // 숙소 탭이었으면 숙소 레이어만 켠다.
  await openMap(page, `/places?area=${area.id}&kind=stay`);
  await expect(page).toHaveURL(new RegExp(`/map\\?area=${area.id}&layers=stay$`));
  await expect(areaPicker(page)).toContainText("신도림");
  await expect(layerChip(page, "숙소")).toHaveAttribute("aria-pressed", "true");
  await expect(layerChip(page, "다녀온 곳")).toHaveAttribute("aria-pressed", "false");
  await expect(rows(page, "숙소")).toHaveCount(1);
  await expect(section(page, "다녀온 곳")).toHaveCount(0);

  await page.goto("/places");
  await expect(page).toHaveURL(/\/map$/);
  await page.getByRole("heading", { name: "데이트 지도" }).waitFor();
  // 사이드바에는 지역 수첩이 따로 없다.
  await expect(page.getByRole("link", { name: "지역 수첩" })).toHaveCount(0);
});

test("동네·레이어 API는 잘못된 값을 막는다", async ({ request }) => {
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
  expect((await request.get("/api/places/layers")).status()).toBe(401);
  expect((await request.get("/api/places/layers?area=999", { headers })).status()).toBe(
    404
  );
  expect((await request.get("/api/places/layers?area=abc", { headers })).status()).toBe(
    400
  );
  expect((await request.delete("/api/places/areas/999", { headers })).status()).toBe(404);

  // 동네를 안 고르면 전체 보기이고, 동네 목록은 최근에 연 동네가 먼저다.
  const sungsu = await createArea(request, { name: "성수", lat: 37.5446, lng: 127.0557 });
  await request.get(`/api/places/layers?area=${area.id}`, { headers });
  const all = await request.get("/api/places/layers", { headers });
  const payload = (await all.json()) as {
    area: { id: number } | null;
    areas: { id: number }[];
    fresh: unknown[];
  };
  expect(payload.area).toBeNull();
  expect(payload.fresh).toEqual([]);
  expect(payload.areas.map((item) => item.id)).toEqual([area.id, sungsu.id]);
});
