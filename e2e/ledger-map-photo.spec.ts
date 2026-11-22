import { createServer, type Server } from "node:http";

import { expect, test } from "@playwright/test";

import { toPlacePhotoUrl } from "../src/lib/ledger/naver-place";
import { authHeaders, login, openLedger, pool, resetLedger, today } from "./helpers";

/**
 * 네이버 지도 링크의 장소 사진. 앱은 NAVER_PLACE_ORIGIN을 이 가짜 플레이스 서버로 두고 띄운다.
 * 사진 주소는 https라야 저장되므로, 화면에서는 그 주소를 가로채 가짜 사진을 돌려준다.
 */

const FAKE_PLACE_PORT = Number(process.env.E2E_FAKE_NAVER_PLACE_PORT ?? 8973);
const ORIGINALS = [
  "https://naverbooking-phinf.pstatic.net/pasta-1.jpg",
  "https://pup-review-phinf.pstatic.net/pasta-2.jpg",
  "https://blogfiles.pstatic.net/pasta-3.jpg",
];
const PHOTOS = ORIGINALS.map(toPlacePhotoUrl);
const CAFE_OG_IMAGE = "https://search.pstatic.net/common/?type=f640_380&src=cafe.jpg";

/** 네이버 플레이스 페이지처럼 상단 사진 목록을 `__APOLLO_STATE__`에 넣는다. 영상은 빠져야 한다. */
const apolloScript = (id: string) => {
  const state: Record<string, unknown> = { ROOT_QUERY: { __typename: "Query" } };
  ORIGINALS.forEach((originalUrl, index) => {
    state[`PlaceDetailTopPhotoItem:${id}_photo_${index}`] = {
      __typename: "PlaceDetailTopPhotoItem",
      mediaFormat: "image",
      video: null,
      originalUrl,
      title: '방문자리뷰 "}{" 괄호',
    };
    if (index === 0) {
      state[`PlaceDetailTopPhotoItem:${id}_clip_1`] = {
        __typename: "PlaceDetailTopPhotoItem",
        mediaFormat: "video",
        video: { videoId: "v" },
        originalUrl: "https://clip-service-phinf.pstatic.net/clip.jpg",
      };
    }
  });
  return `<script>window.__APOLLO_STATE__ = ${JSON.stringify(state)};window.__PLACE_STATE__ = {};</script>`;
};
// 1x1 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const PLACES: Record<string, { title: string; image: string; photos: boolean }> = {
  "1001": {
    title: "성수 파스타집 : 네이버\x1c",
    image: "https://search.pstatic.net/common/?type=f640_380&amp;src=og.jpg",
    photos: true,
  },
  // 상단 사진 목록이 없으면 og:image 한 장을 쓴다.
  "1002": {
    title: "망원 카페 : 네이버",
    image: CAFE_OG_IMAGE.replace(/&/g, "&amp;"),
    photos: false,
  },
};

let server: Server;

test.beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = createServer((req, res) => {
        const id = req.url?.match(/^\/place\/(\d+)\/home/)?.[1];
        const place = id ? PLACES[id] : undefined;
        if (!place) {
          res
            .writeHead(200, { "Content-Type": "text/html" })
            .end("<title>네이버 플레이스</title>");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(
          `<html><head>
            <meta id="og:title" property="og:title" content="${place.title}"/>
            <meta id="og:image" property="og:image" content="${place.image}"/>
          </head><body>${place.photos ? apolloScript(id!) : ""}</body></html>`
        );
      });
      server.listen(FAKE_PLACE_PORT, "127.0.0.1", resolve);
    })
);
test.afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

let token = "";

test.beforeEach(async ({ page, request }) => {
  await resetLedger();
  token = await login(request);
  await page
    .context()
    .route("https://search.pstatic.net/**", (route) =>
      route.fulfill({ contentType: "image/png", body: PNG })
    );
});

const createEntry = (
  request: import("@playwright/test").APIRequestContext,
  memo: string,
  mapUrl: string
) =>
  request.post("/api/ledger/entries", {
    headers: authHeaders(token),
    data: { entryDate: today(), kind: "expense", amount: 12_000, memo, mapUrl },
  });

const placeOf = async (memo: string) =>
  (
    await pool.query(
      "select id, map_url, map_place_name, map_image_urls from ledger_entries where memo = $1",
      [memo]
    )
  ).rows[0];

test("네이버 지도 링크로 저장하면 장소 사진을 내역에서 같이 본다", async ({
  page,
  request,
}) => {
  expect(
    (
      await createEntry(
        request,
        "성수동 파스타",
        "https://map.naver.com/p/entry/place/1001"
      )
    ).ok()
  ).toBe(true);
  // 영상은 빼고 사진 3장을 줄인 크기 주소로 저장한다.
  expect(await placeOf("성수동 파스타")).toMatchObject({
    map_place_name: "성수 파스타집",
    map_image_urls: PHOTOS,
  });

  await openLedger(page, token);

  // 내역 줄의 지도 버튼은 첫 사진과 장수를 보여 준다.
  const thumbLink = page.getByRole("link", { name: "성수동 파스타 지도 열기" }).first();
  const thumb = thumbLink.locator("img");
  await expect(thumb).toHaveAttribute("src", PHOTOS[0]);
  await expect
    .poll(() => thumb.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await expect(thumbLink).toContainText("3");

  // 수정 화면에서는 사진을 넘겨 보고, 장소 이름을 누르면 지도를 연다.
  await page
    .getByRole("button", { name: /성수동 파스타/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  const photos = dialog.getByRole("region", { name: "성수 파스타집 사진 3장" });
  await expect(photos.getByRole("img")).toHaveCount(3);
  await expect(photos.getByText("1 / 3")).toBeVisible();
  await photos.getByRole("button", { name: "다음 사진" }).click();
  await expect(photos.getByText("2 / 3")).toBeVisible();
  await expect(
    photos.getByRole("img", { name: "성수 파스타집 사진 2" })
  ).toBeInViewport();
  // 사진을 넘겨도 창은 저장되지 않고 그대로 열려 있다.
  await expect(dialog).toBeVisible();
  const card = dialog.getByRole("link", { name: "성수 파스타집 지도 열기" });
  await expect(card).toHaveAttribute("href", "https://map.naver.com/p/entry/place/1001");

  // 링크를 다른 장소로 바꾸면 저장 전에는 안내만, 저장하면 새 장소 사진으로 바뀐다.
  const mapInput = dialog.locator("#ledger-map-url");
  await mapInput.fill("https://m.place.naver.com/cafe/1002/home");
  await expect(card).toBeHidden();
  await expect(photos).toBeHidden();
  await expect(
    dialog.getByText("저장하면 네이버 지도의 장소 사진을 함께 보여 줘요.")
  ).toBeVisible();
  await dialog.getByRole("button", { name: "저장" }).click();
  await expect(dialog).toBeHidden();
  expect(await placeOf("성수동 파스타")).toMatchObject({
    map_place_name: "망원 카페",
    map_image_urls: [CAFE_OG_IMAGE],
  });
});

test("네이버가 아니거나 장소를 못 찾으면 사진 없이 핀으로 보여 준다", async ({
  page,
  request,
}) => {
  await createEntry(request, "카카오 카페", "https://kko.to/AbCdEf");
  await createEntry(request, "없는 장소", "https://map.naver.com/p/entry/place/9999");
  expect(await placeOf("카카오 카페")).toMatchObject({
    map_place_name: "",
    map_image_urls: [],
  });
  expect(await placeOf("없는 장소")).toMatchObject({
    map_place_name: "",
    map_image_urls: [],
  });

  await openLedger(page, token);
  await expect(
    page.getByRole("link", { name: "카카오 카페 지도 열기" }).first().locator("img")
  ).toHaveCount(0);

  await page
    .getByRole("button", { name: /없는 장소/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText(
      "네이버 지도에서 장소 사진을 찾지 못했어요. 다시 저장하면 한 번 더 불러와요."
    )
  ).toBeVisible();
});

test("지도 링크를 보내지 않는 수정은 장소 사진을 그대로 둔다", async ({ request }) => {
  await createEntry(request, "성수동 파스타", "https://map.naver.com/p/entry/place/1001");
  const { id } = await placeOf("성수동 파스타");
  const res = await request.patch("/api/ledger/entries", {
    headers: authHeaders(token),
    data: {
      id,
      entryDate: today(),
      kind: "expense",
      amount: 13_000,
      memo: "성수동 파스타",
    },
  });
  expect(res.ok()).toBe(true);
  expect(await placeOf("성수동 파스타")).toMatchObject({
    map_place_name: "성수 파스타집",
    map_image_urls: PHOTOS,
  });

  // 지도 링크를 지우면 장소 사진도 지운다.
  await request.patch("/api/ledger/entries", {
    headers: authHeaders(token),
    data: {
      id,
      entryDate: today(),
      kind: "expense",
      amount: 13_000,
      memo: "성수동 파스타",
      mapUrl: "",
    },
  });
  expect(await placeOf("성수동 파스타")).toMatchObject({
    map_url: "",
    map_place_name: "",
    map_image_urls: [],
  });
});
