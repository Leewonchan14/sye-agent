import { createServer, type Server } from "node:http";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { kst } from "../src/lib/kst";
import {
  authHeaders,
  daysAgo,
  getCategories,
  login,
  openLedger,
  pool,
  resetLedger,
  resetPlaces,
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
  await resetPlaces();
  // 데이트 지도는 하치와레 추천(가 보고 싶은 곳·숙소)도 보여 주므로 함께 비운다.
  await pool.query("truncate date_spot_digests restart identity cascade");
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
/** 목록 줄을 고르는 버튼. 리뷰 없는 줄의 "리뷰 쓰기" 버튼은 빼고 센다. */
const placeRows = (page: Page) =>
  placeList(page).locator(":scope > li > button:first-child");

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

  const items = placeRows(page);
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

  // 넓은 화면에서는 목록을 내려도 고른 장소가 위에 붙어 있고, 목록 끝도 카드에 가리지 않는다.
  if (test.info().project.name === "desktop") {
    const viewport = page.viewportSize();
    await page.setViewportSize({ width: 1280, height: 480 });
    await items.nth(1).scrollIntoViewIfNeeded();
    await items.nth(1).click({ trial: true });
    const stuck = await detail.boundingBox();
    expect(stuck!.y).toBeGreaterThanOrEqual(0);
    expect(stuck!.y).toBeLessThanOrEqual(24);
    if (viewport) await page.setViewportSize(viewport);
  }

  // 고른 장소는 닫기 버튼, 같은 장소 다시 누르기, Esc로 선택을 푼다.
  await detail.getByRole("button", { name: "선택 해제" }).click();
  await expect(detail).toBeHidden();
  await expect(page).not.toHaveURL(/place=/);
  await items.first().click();
  await expect(detail).toBeVisible();
  await items.first().click();
  await expect(detail).toBeHidden();
  await expect(items.first()).not.toHaveAttribute("aria-current");
  await items.first().click();
  await expect(detail).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detail).toBeHidden();
  await expect(page).not.toHaveURL(/place=/);

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
  const items = placeRows(page);
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
  const items = placeRows(page);
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
  const items = placeRows(page);
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

test("간 날이 많으면 장소 카드 안의 간 날 목록만 스크롤한다", async ({
  page,
  request,
}) => {
  for (let day = 1; day <= 16; day += 1) {
    await createEntry(request, {
      memo: `파스타 ${day}`,
      amount: 10_000 + day,
      mapUrl: "https://map.naver.com/p/entry/place/2001",
      entryDate: daysAgo(day),
    });
  }

  await openMap(page);
  await placeRows(page).first().click();
  const detail = page.getByRole("region", { name: "성수 파스타집 방문 기록" });
  await expect(detail.getByText("16번 방문")).toBeVisible();
  // 흰 바탕 사진도 카드 본문과 구분되게 사진 아래에 경계선이 있다.
  const photoFrame = detail.getByRole("region", { name: /사진 \d+장/ }).locator("..");
  await expect(photoFrame).toHaveCSS("border-bottom-style", "solid");
  const days = detail.getByRole("list", { name: "간 날" });
  const { scrollHeight, clientHeight } = await days.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(scrollHeight).toBeGreaterThan(clientHeight);
  // 목록을 끝까지 내리면 가장 오래된 날이 보이고, 지도 링크는 카드 안에 그대로 있다.
  await days.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await expect
    .poll(async () => {
      const box = await days.boundingBox();
      const last = await days.getByText("파스타 16").boundingBox();
      return Boolean(
        box && last && last.y >= box.y && last.y + last.height <= box.y + box.height + 1
      );
    })
    .toBe(true);
  await expect(detail.getByRole("link", { name: "네이버 지도에서 열기" })).toBeVisible();
});

test("좁은 모바일 화면에서도 데이트 지도가 좌우로 넘치지 않는다", async ({
  page,
  request,
}) => {
  test.skip(test.info().project.name !== "mobile", "모바일 화면만 본다");
  // 메모가 긴 결제가 여러 날 있으면 고른 장소 카드가 넓어져 지도 칸을 밀어냈다.
  for (let day = 1; day <= 5; day += 1) {
    await createEntry(request, {
      memo: `아주 긴 메모 텍스트가 들어간 결제 내역 ${day}`,
      amount: 12_345,
      mapUrl: "https://map.naver.com/p/entry/place/2001",
      entryDate: daysAgo(day),
    });
  }
  await createEntry(request, {
    memo: "라테",
    amount: 5_500,
    mapUrl: "https://map.naver.com/p/entry/place/2002",
  });

  /** 앱은 안쪽 스크롤 칸에서 스크롤한다. 그 칸과 문서 모두 좌우로 넘치면 안 된다. */
  const overflowX = () =>
    page.evaluate(() =>
      [document.documentElement, ...document.querySelectorAll(".overflow-y-auto")]
        .map((el) => el.scrollWidth - el.clientWidth)
        .reduce((max, value) => Math.max(max, value), 0)
    );

  await openMap(page);
  await expect(page.locator("[data-map-ready]")).toBeVisible();
  // 넓게 그린 뒤 좁은 폰 너비로 줄여도 지도가 따라 줄어든다.
  for (const width of [375, 360, 320]) {
    await page.setViewportSize({ width, height: 780 });
    await expect.poll(overflowX).toBe(0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await placeRows(page).filter({ hasText: "성수 파스타집" }).click();
  await expect(
    page.getByRole("region", { name: "성수 파스타집 방문 기록" })
  ).toBeVisible();
  await expect.poll(overflowX).toBe(0);
});

/** 장소 지출 id (이름 → id) */
const entryIdOf = async (memo: string) =>
  (
    await pool.query<{ id: number }>("select id from ledger_entries where memo = $1", [
      memo,
    ])
  ).rows[0].id;

test("데이트 지도의 간 날마다 원찬·예은이 각자 리뷰를 남기고, 장소 별점은 평균으로 보인다", async ({
  page,
  request,
}) => {
  await createEntry(request, {
    memo: "파스타 점심",
    amount: 12_000,
    mapUrl: "https://map.naver.com/p/entry/place/2001",
  });
  await createEntry(request, {
    memo: "파스타 저녁",
    amount: 18_000,
    mapUrl: "https://m.place.naver.com/restaurant/2001/home",
    entryDate: daysAgo(3),
  });

  // 리뷰 없는 목록 줄의 "리뷰 쓰기"는 장소 카드를 열면서 입력창도 바로 연다.
  await openMap(page);
  await placeList(page).getByRole("button", { name: "성수 파스타집 리뷰 쓰기" }).click();
  await expect(page).toHaveURL(/place=2001/);
  const detail = page.getByRole("region", { name: "성수 파스타집 방문 기록" });
  const days = detail.getByRole("list", { name: "간 날" }).locator(":scope > li");
  await expect(days).toHaveCount(2);

  // 기본은 가장 최근에 간 날(오늘): 원찬이 별 4개
  let editor = detail.getByRole("group", { name: "리뷰 쓰기" });
  await expect(detail.getByRole("combobox", { name: "간 날" })).toContainText(
    `${kst(today()).format("YY.M.D")}`
  );
  await editor
    .getByRole("group", { name: "쓴 사람" })
    .getByRole("button", { name: "원찬" })
    .click();
  // 별을 고르기 전에는 저장할 수 없다.
  await expect(editor.getByRole("button", { name: "저장" })).toBeDisabled();
  await editor.getByRole("radio", { name: "별 4개" }).click();
  await editor.getByRole("textbox", { name: "한 줄 리뷰" }).fill("면이 쫄깃");
  await editor.getByRole("button", { name: "저장" }).click();
  await expect(days.first().getByRole("listitem", { name: "원찬 리뷰" })).toContainText(
    "면이 쫄깃"
  );
  await expect(editor).toHaveCount(0);
  // 리뷰가 생기면 목록 줄의 "리뷰 쓰기"는 빠지고 리뷰 한 줄이 보인다.
  await expect(
    placeList(page).getByRole("button", { name: "성수 파스타집 리뷰 쓰기" })
  ).toHaveCount(0);

  // 카드 위쪽 "리뷰 쓰기": 예은이 별 5개
  await detail.getByRole("button", { name: "리뷰 쓰기", exact: true }).click();
  editor = detail.getByRole("group", { name: "리뷰 쓰기" });
  await editor
    .getByRole("group", { name: "쓴 사람" })
    .getByRole("button", { name: "예은" })
    .click();
  await editor.getByRole("radio", { name: "별 5개" }).click();
  // Enter로도 저장한다.
  await editor.getByRole("textbox", { name: "한 줄 리뷰" }).fill("소스가 진해");
  await editor.getByRole("textbox", { name: "한 줄 리뷰" }).press("Enter");
  await expect(days.first().getByRole("listitem", { name: "예은 리뷰" })).toContainText(
    "소스가 진해"
  );

  // 간 날을 골라 3일 전에 간 날에: 원찬이 별 3개
  await detail.getByRole("button", { name: "리뷰 쓰기", exact: true }).click();
  await detail.getByRole("combobox", { name: "간 날" }).click();
  await page
    .getByRole("option", { name: /에 간 날/ })
    .nth(1)
    .click();
  editor = detail.getByRole("group", { name: "리뷰 쓰기" });
  await editor
    .getByRole("group", { name: "쓴 사람" })
    .getByRole("button", { name: "원찬" })
    .click();
  await editor.getByRole("radio", { name: "별 3개" }).click();
  await editor.getByRole("button", { name: "저장" }).click();
  await expect(days.nth(1).getByRole("listitem", { name: "원찬 리뷰" })).toBeVisible();

  // 장소 별점은 리뷰 세 개의 평균(4.0), 목록 줄에도 보인다.
  await expect(detail.getByRole("img", { name: "별점 평균 4, 리뷰 3개" })).toBeVisible();
  await expect(
    placeList(page)
      .getByRole("button", { name: /성수 파스타집/ })
      .getByRole("img", { name: "별점 평균 4, 리뷰 3개" })
  ).toBeVisible();

  const lunch = await entryIdOf("파스타 점심");
  const dinner = await entryIdOf("파스타 저녁");
  expect(
    (
      await pool.query(
        "select entry_id, author, rating, review from place_reviews order by id"
      )
    ).rows
  ).toEqual([
    { entry_id: lunch, author: "wonchan", rating: 4, review: "면이 쫄깃" },
    { entry_id: lunch, author: "yeeun", rating: 5, review: "소스가 진해" },
    { entry_id: dinner, author: "wonchan", rating: 3, review: "" },
  ]);

  // 고치고 지운다. 새로고침해도 남아 있다.
  await page.reload();
  await days.first().getByRole("button", { name: "원찬 리뷰 고치기" }).click();
  editor = days.first().getByRole("group", { name: "리뷰 고치기" });
  await expect(editor.getByRole("textbox", { name: "한 줄 리뷰" })).toHaveValue(
    "면이 쫄깃"
  );
  await editor.getByRole("radio", { name: "별 2개" }).click();
  await editor.getByRole("button", { name: "저장" }).click();
  await expect(
    detail.getByRole("img", { name: "별점 평균 3.3, 리뷰 3개" })
  ).toBeVisible();

  await days.nth(1).getByRole("button", { name: "원찬 리뷰 고치기" }).click();
  await days
    .nth(1)
    .getByRole("group", { name: "리뷰 고치기" })
    .getByRole("button", { name: "지우기" })
    .click();
  await expect(days.nth(1).getByRole("listitem", { name: "원찬 리뷰" })).toHaveCount(0);
  await expect(
    detail.getByRole("img", { name: "별점 평균 3.5, 리뷰 2개" })
  ).toBeVisible();
});

test("리뷰 API는 잘못된 값과 리뷰를 남길 수 없는 내역을 막는다", async ({ request }) => {
  await createEntry(request, {
    memo: "파스타 점심",
    amount: 12_000,
    mapUrl: "https://map.naver.com/p/entry/place/2001",
  });
  await createEntry(request, { memo: "편의점", amount: 3_000 });
  const lunch = await entryIdOf("파스타 점심");
  const store = await entryIdOf("편의점");
  const headers = authHeaders(token);
  const post = (data: unknown) => request.post("/api/places/reviews", { headers, data });
  const base = { entryId: lunch, author: "wonchan", rating: 4 };

  for (const data of [
    { ...base, rating: 6 },
    { ...base, rating: 0 },
    // 0.5 단위만 받는다.
    { ...base, rating: 3.3 },
    { ...base, rating: 0.25 },
    { ...base, author: "someone" },
    { ...base, review: "가".repeat(101) },
    // 지도 링크가 없는 지출
    { ...base, entryId: store },
  ]) {
    expect((await post(data)).status()).toBe(400);
  }
  expect((await post({ ...base, entryId: 99_999 })).status()).toBe(404);
  expect((await request.post("/api/places/reviews", { data: base })).status()).toBe(401);

  const created = await post({ ...base, review: "  최고  " });
  expect(created.status()).toBe(201);
  const review = (await created.json()) as { id: number };
  expect(review).toMatchObject({
    entryId: lunch,
    author: "wonchan",
    rating: 4,
    review: "최고",
  });
  // 같은 사람이 같은 내역에 또 남길 수도 있다. 반 개도 된다.
  const half = await post({ ...base, rating: 2.5 });
  expect(half.status()).toBe(201);
  expect(await half.json()).toMatchObject({ rating: 2.5 });

  const listed = await request.get(`/api/places/reviews?entryId=${lunch}`, { headers });
  expect(((await listed.json()) as { reviews: unknown[] }).reviews).toHaveLength(2);
  expect(
    (
      await request.patch(`/api/places/reviews/${review.id}`, {
        headers,
        data: { rating: 9 },
      })
    ).status()
  ).toBe(400);
  expect(
    (
      await request.patch("/api/places/reviews/99999", { headers, data: { rating: 3 } })
    ).status()
  ).toBe(404);
  const patched = await request.patch(`/api/places/reviews/${review.id}`, {
    headers,
    data: { author: "yeeun" },
  });
  expect(await patched.json()).toMatchObject({
    author: "yeeun",
    rating: 4,
    review: "최고",
  });

  // 지도 응답: 장소 별점 평균과 간 날 리뷰
  const map = await request.get("/api/ledger/map", { headers });
  const { places } = (await map.json()) as {
    places: {
      key: string;
      rating: { average: number; count: number } | null;
      entries: { reviews: { author: string }[] }[];
    }[];
  };
  const pasta = places.find((place) => place.key === "2001");
  // (4 + 2.5) / 2 = 3.25 → 소수 첫째 자리로 3.3
  expect(pasta?.rating).toEqual({ average: 3.3, count: 2 });
  expect(pasta?.entries[0].reviews.map((item) => item.author)).toEqual([
    "yeeun",
    "wonchan",
  ]);

  // 내역을 휴지통에 넣으면 리뷰도 안 보이고, 되돌리면 다시 보인다.
  await request.delete("/api/ledger/entries", { headers, data: { id: lunch } });
  const hidden = await request.get(`/api/places/reviews?entryId=${lunch}`, { headers });
  expect(((await hidden.json()) as { reviews: unknown[] }).reviews).toHaveLength(0);
  await request.post("/api/ledger/entries/restore", { headers, data: { id: lunch } });
  const back = await request.get(`/api/places/reviews?entryId=${lunch}`, { headers });
  expect(((await back.json()) as { reviews: unknown[] }).reviews).toHaveLength(2);

  expect(
    (await request.delete(`/api/places/reviews/${review.id}`, { headers })).status()
  ).toBe(200);
  expect(
    (await request.delete(`/api/places/reviews/${review.id}`, { headers })).status()
  ).toBe(404);
});

test("가계부 내역 창에서 둘이 각자 리뷰를 남기고, 목록 줄에 리뷰가 보인다", async ({
  page,
  request,
}) => {
  await createEntry(request, {
    memo: "파스타 점심",
    amount: 12_000,
    mapUrl: "https://map.naver.com/p/entry/place/2001",
  });
  await createEntry(request, { memo: "편의점", amount: 3_000 });

  await openLedger(page, token);
  const row = (memo: string) =>
    page.getByRole("button", { name: new RegExp(memo) }).first();
  const dialog = page.getByRole("dialog");

  // 지도 링크가 없는 내역에는 리뷰 칸이 없다.
  await row("편의점").click();
  await expect(dialog.getByRole("heading", { name: "내역 수정" })).toBeVisible();
  await expect(dialog.getByRole("region", { name: "리뷰" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "취소" }).click();

  await row("파스타 점심").click();
  const reviews = dialog.getByRole("region", { name: "리뷰" });
  for (const [author, stars, text] of [
    ["원찬", "별 4개", "면이 쫄깃"],
    ["예은", "별 5개", "또 오자"],
  ] as const) {
    await reviews.getByRole("button", { name: "리뷰 쓰기" }).click();
    const editor = reviews.getByRole("group", { name: "리뷰 쓰기" });
    await editor
      .getByRole("group", { name: "쓴 사람" })
      .getByRole("button", { name: author })
      .click();
    await editor.getByRole("radio", { name: stars }).click();
    // Enter는 리뷰만 저장하고 내역 창은 그대로 둔다.
    await editor.getByRole("textbox", { name: "한 줄 리뷰" }).fill(text);
    await editor.getByRole("textbox", { name: "한 줄 리뷰" }).press("Enter");
    await expect(reviews.getByRole("listitem", { name: `${author} 리뷰` })).toContainText(
      text
    );
  }
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "취소" }).click();

  // 리뷰는 바로 저장되어 내역 줄 아래에 둘 다 보인다.
  await expect(dialog).toBeHidden();
  const lunchReviews = page.getByRole("main").getByRole("list", { name: "리뷰" });
  await expect(lunchReviews.getByRole("listitem", { name: "원찬 리뷰" })).toContainText(
    "면이 쫄깃"
  );
  await expect(lunchReviews.getByRole("listitem", { name: "예은 리뷰" })).toContainText(
    "또 오자"
  );
  await expect(lunchReviews.getByRole("img", { name: "별 4개" })).toBeVisible();
  await expect(lunchReviews.getByRole("img", { name: "별 5개" })).toBeVisible();

  // 데이트 지도에도 같은 리뷰와 평균이 보인다.
  await page.goto("/map?place=2001");
  const detail = page.getByRole("region", { name: "성수 파스타집 방문 기록" });
  await expect(
    detail.getByRole("img", { name: "별점 평균 4.5, 리뷰 2개" })
  ).toBeVisible();
  await expect(detail.getByRole("listitem", { name: "예은 리뷰" })).toContainText(
    "또 오자"
  );
});

test("가계부 목록 줄에서 내역 창을 열지 않고 리뷰를 쓰고 고친다", async ({
  page,
  request,
}) => {
  await createEntry(request, {
    memo: "파스타 점심",
    amount: 12_000,
    mapUrl: "https://map.naver.com/p/entry/place/2001",
  });
  await createEntry(request, { memo: "편의점", amount: 3_000 });

  await openLedger(page, token);
  // 지도 링크가 없는 내역 줄에는 리뷰 쓰기가 없다.
  await expect(page.getByRole("button", { name: "편의점 리뷰 쓰기" })).toHaveCount(0);

  await page.getByRole("button", { name: "파스타 점심 리뷰 쓰기" }).click();
  const editor = page.getByRole("group", { name: "리뷰 쓰기" });
  await editor
    .getByRole("group", { name: "쓴 사람" })
    .getByRole("button", { name: "예은" })
    .click();
  await editor.getByRole("radio", { name: "별 4.5개" }).click();
  await editor.getByRole("textbox", { name: "한 줄 리뷰" }).fill("소스가 진해");
  await editor.getByRole("button", { name: "저장" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const item = page.getByRole("listitem", { name: "예은 리뷰" });
  await expect(item).toContainText("소스가 진해");
  await expect(item.getByRole("img", { name: "별 4.5개" })).toBeVisible();

  // 연필로 목록에서 바로 고친다.
  await item.getByRole("button", { name: "예은 리뷰 고치기" }).click();
  const fix = page.getByRole("group", { name: "리뷰 고치기" });
  await fix.getByRole("radio", { name: "별 3개" }).click();
  await fix.getByRole("button", { name: "저장" }).click();
  await expect(
    page.getByRole("listitem", { name: "예은 리뷰" }).getByRole("img", { name: "별 3개" })
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (await pool.query("select author, rating, review from place_reviews")).rows
  ).toEqual([{ author: "yeeun", rating: 3, review: "소스가 진해" }]);
});

test("통계 탭 내역에서도 내역 창을 열지 않고 리뷰를 쓴다", async ({ page, request }) => {
  await createEntry(request, {
    memo: "파스타 점심",
    amount: 12_000,
    mapUrl: "https://map.naver.com/p/entry/place/2001",
  });
  await createEntry(request, { memo: "편의점", amount: 3_000 });

  await openLedger(page, token);
  await page.getByRole("tab", { name: "통계" }).click();
  // 통계 맨 아래 "지출·입금 내역" 줄
  const write = page.getByRole("button", { name: "파스타 점심 리뷰 쓰기" });
  await expect(write).toHaveCount(1);
  await expect(page.getByRole("button", { name: "편의점 리뷰 쓰기" })).toHaveCount(0);

  await write.click();
  const editor = page.getByRole("group", { name: "리뷰 쓰기" });
  await editor
    .getByRole("group", { name: "쓴 사람" })
    .getByRole("button", { name: "원찬" })
    .click();
  await editor.getByRole("radio", { name: "별 3.5개" }).click();
  await editor.getByRole("textbox", { name: "한 줄 리뷰" }).fill("양이 많아");
  await editor.getByRole("button", { name: "저장" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // 저장하면 통계를 다시 읽어 그 줄에 리뷰가 보인다.
  const item = page.getByRole("listitem", { name: "원찬 리뷰" });
  await expect(item).toContainText("양이 많아");
  await expect(item.getByRole("img", { name: "별 3.5개" })).toBeVisible();
  expect(
    (await pool.query("select author, rating, review from place_reviews")).rows
  ).toEqual([{ author: "wonchan", rating: 3.5, review: "양이 많아" }]);
});

test("새 내역을 추가하면서 지도 링크와 리뷰 하나를 같이 남긴다", async ({ page }) => {
  await openLedger(page, token);
  await page.getByRole("button", { name: "내역 추가" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#ledger-amount").fill("5500");
  await dialog.locator("#ledger-memo").fill("라테");
  const review = dialog.getByRole("group", { name: "리뷰" });
  // 링크를 넣기 전에는 리뷰 칸이 없다.
  await expect(review).toHaveCount(0);
  await dialog
    .locator("#ledger-map-url")
    .fill("https://map.naver.com/p/entry/place/2002");
  await review
    .getByRole("group", { name: "쓴 사람" })
    .getByRole("button", { name: "예은" })
    .click();
  // 리뷰만 쓰고 별을 안 고르면 저장하지 않는다.
  await review.getByRole("textbox", { name: "한 줄 리뷰" }).fill("자리가 넓어");
  await dialog.getByRole("button", { name: "저장" }).click();
  await expect(page.getByText("리뷰를 남기려면 별점도 골라 주세요.")).toBeVisible();
  await review.getByRole("radio", { name: "별 3개" }).click();
  await dialog.getByRole("button", { name: "저장" }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByRole("img", { name: "별 3개" })).toBeVisible();
  await expect(page.getByText("자리가 넓어")).toBeVisible();
  expect(
    (
      await pool.query(
        "select e.memo, r.author, r.rating, r.review from place_reviews r join ledger_entries e on e.id = r.entry_id"
      )
    ).rows
  ).toEqual([{ memo: "라테", author: "yeeun", rating: 3, review: "자리가 넓어" }]);
});

test("다녀온 곳을 검색·정렬하고 리뷰로 거르며, 목록 줄에서 최근 리뷰를 본다", async ({
  page,
  request,
}) => {
  const pasta = "https://map.naver.com/p/entry/place/2001";
  const chinese = "https://map.naver.com/p/entry/place/3001";
  await createEntry(request, { memo: "파스타 점심", amount: 12_000, mapUrl: pasta });
  await createEntry(request, {
    memo: "파스타 예전",
    amount: 15_000,
    mapUrl: pasta,
    entryDate: daysAgo(10),
  });
  await createEntry(request, {
    memo: "카페 디저트",
    amount: 9_000,
    mapUrl: "https://map.naver.com/p/entry/place/2002",
    entryDate: daysAgo(1),
  });
  for (const days of [20, 15, 5]) {
    await createEntry(request, {
      memo: `짜장면 ${days}`,
      amount: 8_000,
      mapUrl: chinese,
      entryDate: daysAgo(days),
    });
  }
  await createEntry(request, {
    memo: "인생네컷",
    amount: 4_000,
    mapUrl: "https://map.naver.com/p/entry/place/3002",
    entryDate: daysAgo(2),
  });

  const review = async (memo: string, author: string, rating: number, text: string) => {
    const res = await request.post("/api/places/reviews", {
      headers: authHeaders(token),
      data: { entryId: await entryIdOf(memo), author, rating, review: text },
    });
    expect(res.status()).toBe(201);
  };
  // 파스타: 평균 4.5(2개), 카페: 4.5(1개), 중식당: 1.5, 사진관: 리뷰 없음
  await review("파스타 점심", "wonchan", 4.5, "웨이팅이 길었어");
  await review("파스타 점심", "yeeun", 4.5, "면이 쫄깃");
  await review("카페 디저트", "yeeun", 4.5, "디저트 맛집");
  await review("짜장면 5", "wonchan", 1.5, "다시는 안 갈 듯");

  await openMap(page);
  const items = placeRows(page);
  const names = () =>
    items.evaluateAll((buttons) =>
      buttons.map((button) => button.querySelector(".font-medium")?.textContent)
    );

  // 기본은 방문순. 목록 줄에 최근에 남긴 리뷰가 한 줄 보인다.
  await expect(items).toHaveCount(4);
  expect(await names()).toEqual([
    "신림 중식당",
    "성수 파스타집",
    "망원 카페",
    "샤로수길 사진관",
  ]);
  await expect(items.nth(1).getByTestId("review-snippet")).toHaveText(
    "“면이 쫄깃” — 예은"
  );
  await expect(items.nth(3).getByTestId("review-snippet")).toHaveCount(0);

  // 별점순: 평균이 같으면 리뷰가 많은 곳이 먼저, 리뷰 없는 곳은 맨 뒤
  await page.getByRole("combobox", { name: "정렬" }).click();
  await page.getByRole("option", { name: "별점순" }).click();
  await expect
    .poll(names)
    .toEqual(["성수 파스타집", "망원 카페", "신림 중식당", "샤로수길 사진관"]);
  await expect(page).toHaveURL(/sort=rating/);

  // 최근순
  await page.getByRole("combobox", { name: "정렬" }).click();
  await page.getByRole("option", { name: "최근순" }).click();
  await expect
    .poll(names)
    .toEqual(["성수 파스타집", "망원 카페", "샤로수길 사진관", "신림 중식당"]);

  // 리뷰 필터
  const filters = page.getByRole("group", { name: "리뷰 필터" });
  await filters.getByRole("button", { name: /또 갈 곳/ }).click();
  await expect.poll(names).toEqual(["성수 파스타집", "망원 카페"]);
  await expect(page.getByText("4곳 중 2곳")).toBeVisible();
  await filters.getByRole("button", { name: /다시 안 갈 곳/ }).click();
  await expect.poll(names).toEqual(["신림 중식당"]);
  await filters.getByRole("button", { name: "리뷰 있는 곳" }).click();
  await expect(items).toHaveCount(3);
  await filters.getByRole("button", { name: "전체" }).click();
  await expect(items).toHaveCount(4);

  // 검색: 리뷰 글에 걸리면 그 리뷰를 목록 줄에 보여 준다.
  const search = page.getByRole("searchbox", { name: "다녀온 곳 검색" });
  await search.fill("웨이팅");
  await expect.poll(names).toEqual(["성수 파스타집"]);
  await expect(items.first().getByTestId("review-snippet")).toHaveText(
    "“웨이팅이 길었어” — 원찬"
  );
  // 띄어쓰기는 무시하고, 결제 메모·주소도 찾는다.
  await search.fill("인생 네컷");
  await expect.poll(names).toEqual(["샤로수길 사진관"]);
  await search.fill("관악구");
  await expect(items).toHaveCount(2);
  await search.fill("없는 가게");
  await expect(page.getByText("조건에 맞는 곳이 없어요.")).toBeVisible();

  // 검색어·정렬·필터는 주소에 남아 새로 고쳐도 그대로다.
  await search.fill("관악구");
  await filters.getByRole("button", { name: /다시 안 갈 곳/ }).click();
  await expect(page).toHaveURL(/q=/);
  await page.reload();
  await expect(search).toHaveValue("관악구");
  await expect(filters.getByRole("button", { name: /다시 안 갈 곳/ })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.getByRole("combobox", { name: "정렬" })).toContainText("최근순");
  await expect.poll(names).toEqual(["신림 중식당"]);

  // 지우기로 처음 목록으로 돌아간다. 정렬은 그대로 둔다.
  await page.getByRole("button", { name: "검색·필터 지우기" }).click();
  await expect(search).toHaveValue("");
  await expect(items).toHaveCount(4);
  await expect(page.getByText("4곳 중")).toHaveCount(0);
});
