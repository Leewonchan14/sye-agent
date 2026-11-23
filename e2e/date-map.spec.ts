import { createServer, type Server } from "node:http";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { kst } from "../src/lib/kst";
import {
  authHeaders,
  daysAgo,
  getCategories,
  login,
  pool,
  resetLedger,
  today,
} from "./helpers";

/**
 * 데이트 지도(/map). 앱은 NAVER_PLACE_ORIGIN을 이 가짜 플레이스 서버로 두고 띄운다.
 * 장소 페이지의 `__APOLLO_STATE__`에 좌표·주소·업종(PlaceDetailBase)을 넣어 돌려준다.
 * 지도 타일은 바깥 네트워크 없이 돌도록 빈 스타일로 바꿔 준다.
 */

const FAKE_PLACE_PORT = Number(process.env.E2E_FAKE_NAVER_PLACE_PORT ?? 8973);

interface FakePlace {
  title: string;
  lat: string;
  lng: string;
  roadAddress: string;
  category: string;
}

const PLACES: Record<string, FakePlace> = {
  "2001": {
    title: "성수 파스타집 : 네이버",
    lat: "37.5446",
    lng: "127.0557",
    roadAddress: "서울 성동구 연무장길 1",
    category: "이탈리아음식",
  },
  "2002": {
    title: "망원 카페 : 네이버",
    lat: "37.5559",
    lng: "126.9019",
    roadAddress: "서울 마포구 포은로 2",
    category: "카페,디저트",
  },
  "3001": {
    title: "신림 중식당 : 네이버",
    lat: "37.4876",
    lng: "126.9283",
    roadAddress: "서울 관악구 신림동길 4",
    category: "중식당",
  },
  "3002": {
    title: "샤로수길 사진관 : 네이버",
    lat: "37.4789",
    lng: "126.9557",
    roadAddress: "서울 관악구 관악로14길 3",
    category: "사진관",
  },
};

/** 이 id들은 true인 동안 500을 돌려준다. 네이버가 잠깐 막은 상황이다. */
const failing = new Set<string>();

/** 성수 파스타집만 사진이 두 장 있다. */
const PHOTO_ORIGINALS: Record<string, string[]> = {
  "2001": [
    "https://naverbooking-phinf.pstatic.net/pasta-1.jpg",
    "https://pup-review-phinf.pstatic.net/pasta-2.jpg",
  ],
};
// 1x1 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const placeHtml = (id: string, place: FakePlace) => {
  const photos = Object.fromEntries(
    (PHOTO_ORIGINALS[id] ?? []).map((originalUrl, index) => [
      `PlaceDetailTopPhotoItem:${id}_${index}`,
      {
        __typename: "PlaceDetailTopPhotoItem",
        mediaFormat: "image",
        video: null,
        originalUrl,
      },
    ])
  );
  const state = {
    ROOT_QUERY: { __typename: "Query" },
    ...photos,
    [`PlaceDetailBase:${id}`]: {
      __typename: "PlaceDetailBase",
      id,
      name: place.title.replace(" : 네이버", ""),
      category: place.category,
      roadAddress: place.roadAddress,
      address: "지번 주소",
      coordinate: {
        __typename: "Coordinate",
        x: place.lng,
        y: place.lat,
        mapZoomLevel: 12,
      },
    },
  };
  return `<html><head><meta property="og:title" content="${place.title}"/></head>
    <body><script>window.__APOLLO_STATE__ = ${JSON.stringify(state)};</script></body></html>`;
};

let server: Server;

test.beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = createServer((req, res) => {
        const id = req.url?.match(/^\/place\/(\d+)\/home/)?.[1];
        const place = id ? PLACES[id] : undefined;
        if (!id || !place || failing.has(id)) {
          res.writeHead(id && failing.has(id) ? 500 : 404).end();
          return;
        }
        res
          .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
          .end(placeHtml(id, place));
      });
      server.listen(FAKE_PLACE_PORT, "127.0.0.1", resolve);
    })
);
test.afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

/** 글리프·타일 없이 배경만 있는 지도 스타일 */
const EMPTY_STYLE = {
  version: 8,
  sources: {},
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#f3f1ee" } },
  ],
};

let token = "";

test.beforeEach(async ({ page, request }) => {
  failing.clear();
  await resetLedger();
  token = await login(request);
  await page
    .context()
    .route("https://search.pstatic.net/**", (route) =>
      route.fulfill({ contentType: "image/png", body: PNG })
    );
  await page.context().route("https://tiles.openfreemap.org/**", (route) =>
    route.request().url().includes("/styles/")
      ? route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(EMPTY_STYLE),
        })
      : route.abort()
  );
});

const createEntry = async (
  request: APIRequestContext,
  data: {
    memo: string;
    amount: number;
    mapUrl?: string;
    entryDate?: string;
    categoryId?: number;
  }
) => {
  const res = await request.post("/api/ledger/entries", {
    headers: authHeaders(token),
    data: { entryDate: today(), kind: "expense", ...data },
  });
  expect(res.ok()).toBe(true);
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

const placeList = (page: Page) => page.getByRole("list", { name: "다녀온 곳" });

test("네이버 지도 링크가 있는 지출을 장소별로 묶어 지도와 목록으로 본다", async ({
  page,
  request,
}) => {
  const lastYear = kst().subtract(1, "year").format("YYYY-MM-DD");
  await createEntry(request, {
    memo: "파스타 점심",
    amount: 12_000,
    mapUrl: "https://map.naver.com/p/entry/place/2001",
  });
  // 같은 장소의 다른 링크 모양도 같은 곳으로 묶는다.
  // 같은 날 두 번 결제해도 한 번 간 것으로 센다.
  await createEntry(request, {
    memo: "파스타 저녁",
    amount: 18_000,
    mapUrl: "https://m.place.naver.com/restaurant/2001/home",
  });
  await createEntry(request, {
    memo: "작년 파스타",
    amount: 7_000,
    mapUrl: "https://map.naver.com/p/entry/place/2001",
    entryDate: lastYear,
  });
  await createEntry(request, {
    memo: "작년 망원 카페",
    amount: 5_500,
    mapUrl: "https://map.naver.com/p/entry/place/2002",
    entryDate: lastYear,
  });
  // 지도 링크가 없는 지출은 지도에 찍지 않는다.
  await createEntry(request, { memo: "편의점", amount: 3_000 });

  const saved = await pool.query(
    "select map_place_id, map_lat, map_lng, map_address, map_category from ledger_entries where memo = $1",
    ["파스타 점심"]
  );
  expect(saved.rows[0]).toMatchObject({
    map_place_id: "2001",
    map_lat: 37.5446,
    map_lng: 127.0557,
    map_address: "서울 성동구 연무장길 1",
    map_category: "이탈리아음식",
  });

  await openMap(page);
  await expect(page.getByText("다녀온 곳 2곳 · 3번 · 42,500원")).toBeVisible();
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  // worker가 떠야 스타일을 다 읽는다. 번들 뒤 worker 주소가 틀리면 지도가 빈 채로 남는다.
  await expect(page.locator("[data-map-ready]")).toBeVisible();

  const items = placeList(page).getByRole("button");
  await expect(items).toHaveCount(2);
  // 많이 간 곳이 먼저
  await expect(items.first()).toContainText("성수 파스타집");
  await expect(items.first()).toContainText("2번");
  await expect(items.first()).toContainText("37,000원");
  await expect(items.nth(1)).toContainText("망원 카페");

  await items.first().click();
  const detail = page.getByRole("region", { name: "성수 파스타집 방문 기록" });
  await expect(detail).toBeVisible();
  await expect(detail.getByText("2번 방문 · 37,000원")).toBeVisible();
  await expect(detail.getByText("이탈리아음식 · 서울 성동구 연무장길 1")).toBeVisible();
  // 간 날마다 한 줄. 같은 날 결제는 합계를 보이고, 그 아래에 먼저 한 것부터 하나씩 보여 준다.
  const days = detail.getByRole("list", { name: "간 날" }).locator(":scope > li");
  await expect(days).toHaveCount(2);
  await expect(days.first()).toContainText("결제 2건");
  await expect(days.first()).toContainText("30,000원");
  const payments = days
    .first()
    .getByRole("list", { name: /결제$/ })
    .getByRole("listitem");
  await expect(payments).toHaveCount(2);
  await expect(payments.first()).toContainText("파스타 점심");
  await expect(payments.first()).toContainText("12,000원");
  await expect(payments.nth(1)).toContainText("파스타 저녁");
  await expect(payments.nth(1)).toContainText("18,000원");
  await expect(days.nth(1)).toContainText("작년 파스타");
  await expect(days.nth(1)).not.toContainText("결제");
  await expect(days.nth(1).getByRole("list")).toHaveCount(0);
  // 장소 사진은 가계부 수정 화면과 같은 캐러셀로 넘겨 본다.
  const photos = detail.getByRole("region", { name: "성수 파스타집 사진 2장" });
  await expect(photos.getByRole("img")).toHaveCount(2);
  await expect(photos.getByText("1 / 2")).toBeVisible();
  await expect(
    detail.getByRole("link", { name: "네이버 지도에서 열기" })
  ).toHaveAttribute("href", "https://map.naver.com/p/entry/place/2001");
  await expect(page).toHaveURL(/place=2001/);

  // 기간을 바꾸면 주소에 남고, 뒤로 가기로 돌아온다.
  await page
    .getByRole("navigation", { name: "기간" })
    .getByRole("button", { name: "올해" })
    .click();
  await expect(page).toHaveURL(/range=year/);
  await expect(items).toHaveCount(1);
  await expect(page.getByText("다녀온 곳 1곳 · 1번 · 30,000원")).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/range=year/);
  await expect(items).toHaveCount(2);
});

test("좌표를 못 읽은 네이버 지도 링크는 다시 찾기로 지도에 찍는다", async ({
  page,
  request,
}) => {
  failing.add("3001");
  await createEntry(request, {
    memo: "중식 데이트",
    amount: 32_000,
    mapUrl: "https://map.naver.com/p/entry/place/3001",
  });
  // 좌표 열이 생기기 전에 저장한 링크
  await pool.query(
    `insert into ledger_entries (entry_date, kind, amount, memo, map_url, map_place_name, member)
     values ($1, 'expense', 20000, '사진관', 'https://map.naver.com/p/entry/place/3002', '샤로수길 사진관', 'joint')`,
    [today()]
  );
  // 네이버가 아닌 지도 링크는 좌표를 읽을 수 없으니 세지 않는다.
  await createEntry(request, {
    memo: "카카오 링크",
    amount: 9_000,
    mapUrl: "https://kko.to/AbCdEf",
  });

  await openMap(page);
  await expect(
    page.getByRole("heading", { name: "아직 지도에 찍힌 곳이 없어요" })
  ).toBeVisible();
  const banner = page.getByRole("status").filter({ hasText: "지도에 못 찍은 곳" });
  await expect(banner).toContainText("지도에 못 찍은 곳 2건");

  failing.clear();
  await banner.getByRole("button", { name: "다시 찾기" }).click();
  await expect(page.getByText("2곳을 지도에 찍었어요.")).toBeVisible();
  await expect(banner).toBeHidden();
  const items = placeList(page).getByRole("button");
  await expect(items).toHaveCount(2);
  await expect(placeList(page)).toContainText("신림 중식당");
  await expect(placeList(page)).toContainText("샤로수길 사진관");
});

const popup = (page: Page) => page.locator('[data-slot="popover-content"]');

/** 열린 달력에서 iso 날짜가 보일 때까지 달을 넘긴 뒤 누른다. */
const clickDay = async (page: Page, iso: string) => {
  for (let step = 0; step < 24; step += 1) {
    const cell = popup(page).locator(`td[data-day="${iso}"]:not([data-outside])`);
    if (await cell.count()) {
      await cell.getByRole("button").click();
      return;
    }
    const shown = await popup(page)
      .locator("td[data-day]:not([data-outside])")
      .first()
      .getAttribute("data-day");
    await popup(page)
      .locator(shown && shown > iso ? ".rdp-button_previous" : ".rdp-button_next")
      .click();
  }
  throw new Error(`달력에서 ${iso}를 찾지 못했어요`);
};

test("날짜를 직접 고르거나 여행을 골라 그때 간 곳만 지도에 본다", async ({
  page,
  request,
}) => {
  const trip = await request.post("/api/ledger/trips", {
    headers: authHeaders(token),
    data: { name: "성수 나들이", startDate: daysAgo(10), endDate: daysAgo(8) },
  });
  expect(trip.ok()).toBe(true);
  const tripId = ((await trip.json()) as { trip: { id: number } }).trip.id;
  // 여행 기간의 지출은 저장할 때 그 여행에 묶인다.
  await createEntry(request, {
    memo: "여행 파스타",
    amount: 21_000,
    mapUrl: "https://map.naver.com/p/entry/place/2001",
    entryDate: daysAgo(9),
  });
  await createEntry(request, {
    memo: "한 달 전 카페",
    amount: 6_000,
    mapUrl: "https://map.naver.com/p/entry/place/2002",
    entryDate: daysAgo(30),
  });
  await createEntry(request, {
    memo: "오늘 중식",
    amount: 30_000,
    mapUrl: "https://map.naver.com/p/entry/place/3001",
  });

  // 주소로 바로 열어도 같은 기간을 본다.
  await openMap(page, `/map?range=custom&from=${daysAgo(31)}&to=${daysAgo(29)}`);
  const items = placeList(page).getByRole("button");
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("망원 카페");
  const period = page.getByRole("navigation", { name: "기간" });
  await expect(period.getByRole("button", { name: /~/ })).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  // 달력에서 오늘 하루만 고른다. "적용"을 눌러야 바뀐다.
  await period.getByRole("button", { name: /~/ }).click();
  await clickDay(page, daysAgo(0));
  await clickDay(page, daysAgo(0));
  await popup(page).getByRole("button", { name: "적용" }).click();
  await expect(page).toHaveURL(new RegExp(`range=custom&from=${today()}&to=${today()}`));
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("신림 중식당");

  // 여행을 고르면 그 여행에 묶인 지출만 보고, 날짜 값은 주소에서 지운다.
  await period.getByRole("button", { name: "여행" }).click();
  await popup(page)
    .getByRole("button", { name: /성수 나들이/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`range=trip&trip=${tripId}$`));
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("성수 파스타집");
  await expect(
    page.getByText(/^성수 나들이 · .* · 다녀온 곳 1곳 · 1번 · 21,000원$/)
  ).toBeVisible();
  await expect(period.getByRole("button", { name: /성수 나들이/ })).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  // 뒤로 가기로 직접 고른 날짜로, 전체를 누르면 기간 값이 모두 빠진다.
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`from=${today()}`));
  await expect(items.first()).toContainText("신림 중식당");
  await period.getByRole("button", { name: "전체" }).click();
  await expect(page).not.toHaveURL(/range=|from=|trip=/);
  await expect(items).toHaveCount(3);
});

test("기간 값이 잘못되면 400으로 알린다", async ({ request }) => {
  const get = (query: string) =>
    request.get(`/api/ledger/map?${query}`, { headers: authHeaders(token) });
  expect((await get("range=custom")).status()).toBe(400);
  expect((await get("range=custom&from=2026-02-30")).status()).toBe(400);
  expect((await get("range=trip&trip=999")).status()).toBe(400);
  expect((await get("category=999")).status()).toBe(400);
  expect((await get("category=abc")).status()).toBe(400);
  // 거꾸로 고른 날짜는 앞뒤를 바꿔 준다.
  const swapped = await get(`range=custom&from=${today()}&to=${daysAgo(3)}`);
  expect(await swapped.json()).toMatchObject({ from: daysAgo(3), to: today() });
});

test("분류를 골라 그 분류 지출로 간 곳만 보고, 기간을 바꿔도 분류는 그대로 둔다", async ({
  page,
  request,
}) => {
  const categoryId = await getCategories(request, token);
  const food = categoryId("식비");
  const cafe = categoryId("카페");
  await createEntry(request, {
    memo: "파스타",
    amount: 18_000,
    mapUrl: "https://map.naver.com/p/entry/place/2001",
    categoryId: food,
  });
  await createEntry(request, {
    memo: "중식",
    amount: 30_000,
    mapUrl: "https://map.naver.com/p/entry/place/3001",
    categoryId: food,
    entryDate: kst().subtract(1, "year").format("YYYY-MM-DD"),
  });
  await createEntry(request, {
    memo: "라떼",
    amount: 6_000,
    mapUrl: "https://map.naver.com/p/entry/place/2002",
    categoryId: cafe,
  });

  await openMap(page);
  const chips = page.getByRole("group", { name: "분류 필터" });
  // 지도에 찍힌 지출이 있는 분류만 칩으로 보여 준다.
  await expect(chips.getByRole("button")).toHaveText(["전체", "식비", "카페"]);
  const items = placeList(page).getByRole("button");
  await expect(items).toHaveCount(3);

  await chips.getByRole("button", { name: "식비" }).click();
  await expect(page).toHaveURL(new RegExp(`category=${food}`));
  await expect(items).toHaveCount(2);
  await expect(page.getByText("식비 · 다녀온 곳 2곳 · 2번 · 48,000원")).toBeVisible();

  // 기간을 바꿔도 분류는 남는다. 올해 식비는 파스타 하나다.
  await page
    .getByRole("navigation", { name: "기간" })
    .getByRole("button", { name: "올해" })
    .click();
  await expect(page).toHaveURL(new RegExp(`category=${food}`));
  await expect(page).toHaveURL(/range=year/);
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("성수 파스타집");
  await expect(chips.getByRole("button", { name: "식비" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  // 뒤로 가면 전체 기간의 식비, 전체 분류를 누르면 분류 값이 빠진다.
  await page.goBack();
  await expect(items).toHaveCount(2);
  await chips.getByRole("button", { name: "전체" }).click();
  await expect(page).not.toHaveURL(/category=/);
  await expect(items).toHaveCount(3);

  // 주소로 바로 연 분류도 같다.
  await openMap(page, `/map?category=${cafe}`);
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("망원 카페");
});
