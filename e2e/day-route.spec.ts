import { expect, test, type Page } from "@playwright/test";

import { kst } from "../src/lib/kst";
import {
  buildDayRoute,
  formatDistance,
  haversineKm,
  partialRoute,
  routeDistanceKm,
  type DayRouteRow,
} from "../src/lib/ledger/day-route";
import { authHeaders, getCategories, login, pool, resetLedger, today } from "./helpers";

/**
 * 그날의 동선. 달력에서 고른 날(또는 데이트 지도에서 고른 하루)의 지출 중 지도에 찍힌 곳을
 * 시간 순서로 잇는 재생 창을 연다. 장소 좌표·사진은 DB에 바로 넣고(네이버를 부르지 않는다),
 * 사진 주소와 지도 타일은 가로채 바깥 네트워크 없이 돈다.
 */

const SPOTS = {
  "4001": { name: "동선 베이글", lat: 37.5446, lng: 127.0557 },
  "4002": { name: "동선 서점", lat: 37.5563, lng: 126.922 },
  "4003": { name: "동선 공원", lat: 37.5284, lng: 126.9326 },
  "4004": { name: "동선 국밥", lat: 37.5704, lng: 126.9921 },
  "4005": { name: "동선 편의점", lat: 37.5665, lng: 126.978 },
} as const;
type SpotId = keyof typeof SPOTS;

// 1x1 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

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

/** 지출 한 건. 장소가 있으면 네이버 지도 링크에서 읽은 것처럼 좌표·사진을 함께 넣는다. */
const visit = async (data: {
  id?: SpotId;
  time: string | null;
  amount: number;
  memo: string;
  entryDate?: string;
  kind?: "expense" | "income";
  categoryId?: number;
  deleted?: boolean;
}) => {
  const spot = data.id ? SPOTS[data.id] : null;
  await pool.query(
    `insert into ledger_entries (entry_date, entry_time, kind, amount, memo, category_id, map_url, map_place_id,
       map_place_name, map_image_urls, map_lat, map_lng, map_address, map_category, deleted_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15)`,
    [
      data.entryDate ?? today(),
      data.time,
      data.kind ?? "expense",
      data.amount,
      data.memo,
      data.categoryId ?? null,
      data.id ? `https://map.naver.com/p/entry/place/${data.id}` : "",
      data.id ?? "",
      spot?.name ?? "",
      JSON.stringify(
        data.id
          ? [`https://search.pstatic.net/common/?type=f640_380&src=route-${data.id}.jpg`]
          : []
      ),
      spot?.lat ?? null,
      spot?.lng ?? null,
      spot ? "서울 샘플구 샘플길 1" : "",
      spot ? "샘플" : "",
      data.deleted ? new Date() : null,
    ]
  );
};

const dayLabel = (date: string) => kst(date).format("M월 D일 (ddd)");

/** 같은 달 안의 다른 날. 1일이면 다음 날을 쓴다. */
const otherDay = () =>
  today().endsWith("-01")
    ? kst().add(1, "day").format("YYYY-MM-DD")
    : kst().subtract(1, "day").format("YYYY-MM-DD");

const signIn = (page: Page) =>
  page.addInitScript((value) => {
    localStorage.setItem(
      "trable-auth",
      JSON.stringify({ state: { token: value }, version: 0 })
    );
  }, token);

const openCalendar = async (page: Page) => {
  await signIn(page);
  await page.goto("/ledger?tab=calendar");
  await page.getByRole("heading", { name: "가계부" }).waitFor();
};

const routeDialog = (page: Page, date = today()) =>
  page.getByRole("dialog", { name: `${dayLabel(date)} 동선` });

const openRoute = async (page: Page, date = today()) => {
  await page.getByRole("button", { name: "동선 보기" }).click();
  const dialog = routeDialog(page, date);
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-map-ready]")).toBeAttached();
  return dialog;
};

const row = (
  id: number,
  entryTime: string | null,
  place: string,
  lat: number | null = 37.5,
  lng: number | null = 127
): DayRouteRow => ({
  id,
  entryTime,
  amount: id * 1000,
  memo: `메모 ${id}`,
  mapUrl: `https://map.naver.com/p/entry/place/${place}`,
  mapPlaceId: place,
  mapPlaceName: `장소 ${place}`,
  mapImageUrls: [],
  mapLat: lat,
  mapLng: lng,
  mapAddress: "",
  mapCategory: "",
});

test.describe("계산", () => {
  test.skip(({ isMobile }) => isMobile, "화면과 상관없는 계산은 한 번만 본다");

  test("시간 순서로 줄 세우고, 시간 없는 지출은 맨 뒤, 잇달아 같은 곳은 한 정거장", () => {
    const route = buildDayRoute("2026-11-02", [
      row(1, "18:00", "c"),
      row(2, null, "d"),
      row(3, "09:00", "a"),
      row(4, "12:30", "b"),
      row(5, "12:10", "b"),
      row(6, "15:00", "x", null, null),
      row(7, "20:00", "a"),
    ]);
    expect(route.stops.map((stop) => stop.name)).toEqual([
      "장소 a",
      "장소 b",
      "장소 c",
      "장소 a",
      "장소 d",
    ]);
    // 12:10과 12:30 결제가 한 정거장으로 묶인다. 정거장 시각은 먼저 한 결제다.
    expect(route.stops[1]).toMatchObject({ time: "12:10", amount: 9000 });
    expect(route.stops[1].payments.map((payment) => payment.id)).toEqual([5, 4]);
    expect(route.stops[4].time).toBeNull();
    expect(route.located).toBe(6);
    expect(route.untimed).toBe(1);
  });

  test("거리와 그리는 중인 선", () => {
    // 서울시청 → 강남역은 직선으로 약 8.8km
    const km = haversineKm(
      { lat: 37.5665, lng: 126.978 },
      { lat: 37.4979, lng: 127.0276 }
    );
    expect(km).toBeGreaterThan(8.6);
    expect(km).toBeLessThan(9);
    expect(formatDistance(0.234)).toBe("230m");
    expect(formatDistance(0.001)).toBe("10m");
    expect(formatDistance(3.14)).toBe("3.1km");
    expect(formatDistance(12.6)).toBe("13km");

    const stops = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 2 },
      { lat: 2, lng: 2 },
    ];
    expect(routeDistanceKm(stops.slice(0, 1))).toBe(0);
    expect(partialRoute(stops, 0, 0)).toEqual([[0, 0]]);
    expect(partialRoute(stops, 0, 0.5)).toEqual([
      [0, 0],
      [1, 0],
    ]);
    expect(partialRoute(stops, 1, 1)).toEqual([
      [0, 0],
      [2, 0],
      [2, 2],
    ]);
    // 마지막 정거장 뒤로는 더 긋지 않는다.
    expect(partialRoute(stops, 5, 0.5)).toHaveLength(3);
  });

  test("API는 날짜를 확인하고 로그인한 사람에게만 준다", async ({ request }) => {
    const bad = await request.get("/api/ledger/day-route?date=2026-13-01", {
      headers: authHeaders(token),
    });
    expect(bad.status()).toBe(400);
    const anonymous = await request.get(`/api/ledger/day-route?date=${today()}`);
    expect(anonymous.status()).toBe(401);
  });

  test("여러 날 API는 기간을 확인하고, 지도에 찍힌 지출이 두 건 이상인 날만 최근 날부터 준다", async ({
    request,
  }) => {
    const get = (query: string, auth = true) =>
      request.get(`/api/ledger/day-route/days?${query}`, {
        headers: auth ? authHeaders(token) : {},
      });
    expect((await get(`from=${today()}&to=${today()}`, false)).status()).toBe(401);
    expect((await get(`from=2026-13-01&to=${today()}`)).status()).toBe(400);
    expect((await get(`from=${today()}`)).status()).toBe(400);
    // 거꾸로 준 기간과 너무 긴 기간은 받지 않는다.
    const yesterday = kst().subtract(1, "day").format("YYYY-MM-DD");
    expect((await get(`from=${today()}&to=${yesterday}`)).status()).toBe(400);
    expect((await get("from=2000-01-01&to=2099-12-31")).status()).toBe(400);

    const other = otherDay();
    await visit({ id: "4001", time: "10:00", amount: 5_000, memo: "아침" });
    await visit({ id: "4002", time: "12:00", amount: 7_000, memo: "점심" });
    await visit({ id: "4003", time: "15:00", amount: 3_000, memo: "산책" });
    await visit({
      id: "4004",
      time: "09:00",
      amount: 8_000,
      memo: "국밥",
      entryDate: other,
    });
    await visit({
      id: "4004",
      time: "09:30",
      amount: 1_000,
      memo: "커피",
      entryDate: other,
    });
    // 한 건뿐인 날은 빠진다.
    await visit({
      id: "4005",
      time: "11:00",
      amount: 2_000,
      memo: "혼자",
      entryDate: kst().subtract(40, "day").format("YYYY-MM-DD"),
    });

    const [from, to] = [other, today()].sort();
    const res = await get(
      `from=${kst().subtract(60, "day").format("YYYY-MM-DD")}&to=${to}`
    );
    expect(res.ok()).toBe(true);
    const { days } = (await res.json()) as {
      days: { date: string; places: number; located: number; spent: number }[];
    };
    expect(days.map((day) => day.date)).toEqual([to, from]);
    const byDate = Object.fromEntries(days.map((day) => [day.date, day]));
    expect(byDate[today()]).toMatchObject({ places: 3, located: 3, spent: 15_000 });
    // 같은 곳 두 결제는 한 곳이다.
    expect(byDate[other]).toMatchObject({ places: 1, located: 2, spent: 9_000 });
  });

  test("API는 그날 지도에 찍힌 지출만 잇는다(입금·지운 내역·다른 날 제외)", async ({
    request,
  }) => {
    await visit({ id: "4001", time: "10:00", amount: 5_000, memo: "아침" });
    await visit({ id: "4002", time: "12:00", amount: 7_000, memo: "점심" });
    await visit({
      id: "4003",
      time: "13:00",
      amount: 9_000,
      memo: "환불",
      kind: "income",
    });
    await visit({
      id: "4004",
      time: "14:00",
      amount: 3_000,
      memo: "지움",
      deleted: true,
    });
    await visit({ time: "15:00", amount: 1_000, memo: "지도 없음" });
    await visit({
      id: "4005",
      time: "16:00",
      amount: 2_000,
      memo: "다른 날",
      entryDate: otherDay(),
    });
    const res = await request.get(`/api/ledger/day-route?date=${today()}`, {
      headers: authHeaders(token),
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.located).toBe(2);
    expect(body.stops.map((stop: { name: string }) => stop.name)).toEqual([
      "동선 베이글",
      "동선 서점",
    ]);
  });
});

test("달력에서 동선 보기를 열어 시간 순서로 한 곳씩 넘겨 본다", async ({ page }) => {
  // 저절로 재생하지 않게 해 한 곳씩 넘기는 것만 본다(재생은 아래 테스트).
  await page.emulateMedia({ reducedMotion: "reduce" });
  // 남긴 순서와 상관없이 시간 순서로 잇는다.
  await visit({ id: "4004", time: "19:20", amount: 11_000, memo: "국밥" });
  await visit({ id: "4005", time: null, amount: 2_000, memo: "물" });
  await visit({ id: "4002", time: "09:10", amount: 15_000, memo: "책" });
  await visit({ id: "4001", time: "12:30", amount: 9_000, memo: "베이글" });
  await visit({ id: "4001", time: "12:50", amount: 3_000, memo: "커피" });
  await visit({ id: "4003", time: "15:00", amount: 4_500, memo: "간식" });
  // 지도 링크가 없는 지출과 다른 날 지출은 동선에 안 들어간다.
  await visit({ time: "10:00", amount: 1_000, memo: "현금 간식" });
  await visit({
    id: "4005",
    time: "08:00",
    amount: 7_000,
    memo: "다른 날",
    entryDate: otherDay(),
  });

  await openCalendar(page);
  const dialog = await openRoute(page);

  const order: SpotId[] = ["4002", "4001", "4003", "4004", "4005"];
  const distance = formatDistance(routeDistanceKm(order.map((id) => SPOTS[id])));
  await expect(dialog).toContainText(
    `오늘 5곳 · 총 이동 약 ${distance} · 총 지출 44,500원`
  );
  await expect(dialog).toContainText("시간을 안 적은 1건은 맨 뒤에 이었어요.");
  await expect(
    dialog.getByRole("list", { name: "들른 곳" }).getByRole("button")
  ).toHaveCount(5);

  const card = dialog.getByRole("region", { name: "지금 곳" });
  const controls = dialog.getByRole("group", { name: "동선 재생" });
  const marker = (n: number) =>
    dialog.getByRole("button", { name: `${n}번째 곳 ${SPOTS[order[n - 1]].name}` });

  await expect(card).toContainText("09:10");
  await expect(card).toContainText("동선 서점");
  await expect(card).toContainText("15,000원");
  await expect(card).toContainText("다음 동선 베이글까지");
  await expect(card.locator("img")).toHaveAttribute("src", /pstatic/);
  await expect(controls).toContainText("1 / 5");
  await expect(controls.getByRole("button", { name: "이전 곳" })).toBeDisabled();
  await expect(controls.getByRole("button", { name: "재생" })).toBeVisible();
  await expect(marker(1)).toHaveAttribute("data-state", "current");
  await expect(marker(2)).toHaveAttribute("data-state", "upcoming");

  // 다음 곳: 같은 곳에서 잇달아 한 결제는 한 정거장으로 묶는다.
  await controls.getByRole("button", { name: "다음 곳" }).click();
  await expect(controls).toContainText("2 / 5");
  await expect(card).toContainText("12:30");
  await expect(card).toContainText("동선 베이글");
  await expect(card).toContainText("12,000원");
  await expect(card).toContainText("결제 2건 · 베이글, 커피");
  await expect(marker(1)).toHaveAttribute("data-state", "visited");
  await expect(marker(2)).toHaveAttribute("data-state", "current");

  // 목록에서 골라 건너뛴다.
  await dialog
    .getByRole("list", { name: "들른 곳" })
    .getByRole("button", { name: /동선 국밥/ })
    .click();
  await expect(controls).toContainText("4 / 5");
  await expect(card).toContainText("19:20");
  await expect(marker(3)).toHaveAttribute("data-state", "visited");

  // 지도 번호를 눌러도 그곳으로 간다. 시간을 안 적은 곳은 맨 뒤다.
  await marker(5).click();
  await expect(controls).toContainText("5 / 5");
  await expect(card).toContainText("시간 없음");
  await expect(card).toContainText("동선 편의점");
  await expect(card).toContainText("마지막 곳이에요");
  await expect(controls.getByRole("button", { name: "다음 곳" })).toBeDisabled();
  await expect(
    controls.getByRole("button", { name: "처음부터 다시 보기" })
  ).toBeVisible();

  await controls.getByRole("button", { name: "이전 곳" }).click();
  await expect(controls).toContainText("4 / 5");
  await expect(marker(5)).toHaveAttribute("data-state", "upcoming");

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("재생하면 한 곳씩 끝까지 잇고, 일시정지하면 그 자리에 멈춘다", async ({ page }) => {
  await visit({ id: "4002", time: "09:00", amount: 5_000, memo: "아침" });
  await visit({ id: "4004", time: "12:00", amount: 8_000, memo: "점심" });
  await visit({ id: "4001", time: "18:00", amount: 6_000, memo: "저녁" });

  await openCalendar(page);
  const dialog = await openRoute(page);
  const controls = dialog.getByRole("group", { name: "동선 재생" });
  const card = dialog.getByRole("region", { name: "지금 곳" });

  // 열면 저절로 재생한다. 시간은 흐른 시간으로 재므로 GPU 없이 느리게 그려도 끝까지 간다.
  await expect(controls.getByRole("button", { name: "일시정지" })).toBeVisible();
  await expect(controls).toContainText("3 / 3", { timeout: 30_000 });
  await expect(card).toContainText("동선 베이글");
  await expect(controls.getByRole("button", { name: "처음부터 다시 보기" })).toBeVisible({
    timeout: 10_000,
  });

  // 처음부터 다시 재생하다가 멈추면 그 정거장에 그대로 있다.
  await controls.getByRole("button", { name: "처음부터 다시 보기" }).click();
  await expect(controls).toContainText("1 / 3");
  await controls.getByRole("button", { name: "일시정지" }).click();
  await expect(controls.getByRole("button", { name: "재생" })).toBeVisible();
  const paused = await controls.locator("span").first().textContent();
  await page.waitForTimeout(4_000);
  await expect(controls.locator("span").first()).toHaveText(paused ?? "");

  // 다시 재생하면 이어서 끝까지 간다.
  await controls.getByRole("button", { name: "재생" }).click();
  await expect(controls).toContainText("3 / 3", { timeout: 30_000 });
});

test("지도에 찍힌 지출이 한 건이면 버튼이 없고, 같은 곳만 두 번이면 그 한 곳을 보여 준다", async ({
  page,
}) => {
  const other = otherDay();
  await visit({ id: "4003", time: "11:00", amount: 3_000, memo: "산책" });
  await visit({ time: "12:00", amount: 9_000, memo: "지도 없는 점심" });
  await visit({
    id: "4002",
    time: "14:00",
    amount: 12_000,
    memo: "책",
    entryDate: other,
  });
  await visit({
    id: "4002",
    time: "14:20",
    amount: 4_000,
    memo: "엽서",
    entryDate: other,
  });

  const todayRoute = page.waitForResponse(
    (res) => res.url().includes(`/api/ledger/day-route?date=${today()}`) && res.ok()
  );
  await openCalendar(page);
  await todayRoute;
  await expect(page.getByRole("heading", { name: dayLabel(today()) })).toBeVisible();
  await expect(page.getByRole("button", { name: "동선 보기" })).toHaveCount(0);

  await page
    .getByRole("button", {
      name: new RegExp(`^${dayLabel(other).replace(/[()]/g, "\\$&")}`),
    })
    .click();
  const dialog = await openRoute(page, other);
  await expect(dialog).toContainText("이날 1곳 · 총 지출 16,000원");
  await expect(dialog).not.toContainText("총 이동");
  await expect(dialog.getByRole("group", { name: "동선 재생" })).toHaveCount(0);
  const card = dialog.getByRole("region", { name: "지금 곳" });
  await expect(card).toContainText("동선 서점");
  await expect(card).toContainText("결제 2건 · 책, 엽서");
});

test("데이트 지도에서 하루만 고르면 그날 동선을 열고, 분류 필터와 상관없이 그날 전체를 잇는다", async ({
  page,
  request,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const category = await getCategories(request, token);
  await visit({
    id: "4001",
    time: "10:00",
    amount: 5_000,
    memo: "아침",
    categoryId: category("식비"),
  });
  await visit({ id: "4003", time: "13:00", amount: 7_000, memo: "산책" });

  await signIn(page);
  // 전체 기간에는 버튼이 없다.
  await page.goto("/map");
  await expect(page.getByRole("list", { name: "다녀온 곳" })).toBeVisible();
  await expect(page.getByRole("button", { name: "동선 보기" })).toHaveCount(0);

  // 달력에서 오늘 하루만 고른다.
  await page
    .getByRole("navigation", { name: "기간" })
    .getByRole("button", { name: "날짜" })
    .click();
  const popup = page.locator('[data-slot="popover-content"]');
  const day = popup.locator(`td[data-day="${today()}"]:not([data-outside])`);
  await day.getByRole("button").click();
  await day.getByRole("button").click();
  await popup.getByRole("button", { name: "적용" }).click();
  await expect(page).toHaveURL(new RegExp(`from=${today()}&to=${today()}`));

  const dialog = await openRoute(page);
  await expect(dialog).toContainText("오늘 2곳");
  await expect(dialog.getByRole("region", { name: "지금 곳" })).toContainText(
    "동선 베이글"
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // 분류를 골라 지도에는 한 곳만 남아도, 동선은 그날 다닌 곳을 모두 잇는다.
  await page.goto(
    `/map?range=custom&from=${today()}&to=${today()}&category=${category("식비")}`
  );
  await expect(
    page.getByRole("list", { name: "다녀온 곳" }).getByRole("listitem")
  ).toHaveCount(1);
  const filtered = await openRoute(page);
  await expect(filtered).toContainText("오늘 2곳");
  await expect(
    filtered.getByRole("list", { name: "들른 곳" }).getByRole("button")
  ).toHaveCount(2);
});

test("내역 탭은 동선을 볼 수 있는 날에만 버튼을 두고, 날마다 따로 묻지 않는다", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const other = otherDay();
  await visit({ id: "4002", time: "09:10", amount: 15_000, memo: "책" });
  await visit({ id: "4001", time: "12:30", amount: 9_000, memo: "베이글" });
  // 다른 날은 지도에 찍힌 지출이 한 건뿐이라 버튼이 없다.
  await visit({
    id: "4003",
    time: "11:00",
    amount: 3_000,
    memo: "산책",
    entryDate: other,
  });
  await visit({ time: "12:00", amount: 9_000, memo: "지도 없는 점심", entryDate: other });

  const perDay: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/ledger/day-route?")) perDay.push(req.url());
  });
  const days = page.waitForResponse(
    (res) => res.url().includes("/api/ledger/day-route/days?") && res.ok()
  );
  await signIn(page);
  await page.goto("/ledger");
  await page.getByRole("heading", { name: "가계부" }).waitFor();
  await days;

  const todayGroup = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: dayLabel(today()), exact: true }) });
  const otherGroup = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: dayLabel(other), exact: true }) });
  await expect(otherGroup).toBeVisible();
  await expect(otherGroup.getByRole("button", { name: "동선 보기" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "동선 보기" })).toHaveCount(1);
  // 버튼 자리는 여러 날 API 한 번으로 정하고, 그날 동선은 누를 때 읽는다.
  expect(perDay).toEqual([]);

  await todayGroup.getByRole("button", { name: "동선 보기" }).click();
  const dialog = routeDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-map-ready]")).toBeAttached();
  await expect(dialog).toContainText("오늘 2곳");
  await expect(dialog.getByRole("region", { name: "지금 곳" })).toContainText(
    "동선 서점"
  );
  expect(perDay).toHaveLength(1);
});

test("통계 탭의 많이 돌아다닌 날은 곳 수·이동 거리 순으로 보여 주고 그날 동선을 연다", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const other = otherDay();
  // 지도에 찍힌 지출이 한 건뿐이면 카드가 없다.
  await visit({ id: "4001", time: "10:00", amount: 5_000, memo: "아침" });

  await signIn(page);
  await page.goto("/ledger?tab=stats");
  await page.getByRole("heading", { name: "가계부" }).waitFor();
  await page
    .waitForResponse((res) => res.url().includes("/api/ledger/day-route/days?"))
    .catch(() => undefined);
  await expect(page.getByText("큰 지출 TOP 8")).toBeVisible();
  await expect(page.getByRole("list", { name: "많이 돌아다닌 날" })).toHaveCount(0);

  // 오늘은 두 곳, 다른 날은 세 곳. 곳이 많은 날이 먼저다.
  await visit({ id: "4002", time: "12:00", amount: 7_000, memo: "점심" });
  await visit({ id: "4002", time: "09:00", amount: 4_000, memo: "책", entryDate: other });
  await visit({
    id: "4003",
    time: "12:00",
    amount: 6_000,
    memo: "산책",
    entryDate: other,
  });
  await visit({
    id: "4004",
    time: "19:00",
    amount: 11_000,
    memo: "국밥",
    entryDate: other,
  });
  await page.reload();

  const list = page.getByRole("list", { name: "많이 돌아다닌 날" });
  const rows = list.getByRole("listitem");
  await expect(rows).toHaveCount(2);
  const otherKm = formatDistance(
    routeDistanceKm([SPOTS["4002"], SPOTS["4003"], SPOTS["4004"]])
  );
  await expect(rows.first()).toContainText(dayLabel(other));
  await expect(rows.first()).toContainText(`3곳 · 약 ${otherKm} · 21,000원`);
  await expect(rows.nth(1)).toContainText(dayLabel(today()));
  await expect(rows.nth(1)).toContainText("2곳");

  await rows.first().getByRole("button", { name: "동선 보기" }).click();
  const dialog = routeDialog(page, other);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("이날 3곳");
  await expect(dialog.getByRole("region", { name: "지금 곳" })).toContainText(
    "동선 서점"
  );
});
