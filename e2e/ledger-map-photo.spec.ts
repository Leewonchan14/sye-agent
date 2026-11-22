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
const MANY_ORIGINALS = Array.from(
  { length: 6 },
  (_, i) => `https://pup-review-phinf.pstatic.net/cafe-${i + 1}.jpg`
);
const CAFE_OG_IMAGE = "https://search.pstatic.net/common/?type=f640_380&src=cafe.jpg";

/** 네이버 플레이스 페이지처럼 상단 사진 목록을 `__APOLLO_STATE__`에 넣는다. 영상은 빠져야 한다. */
const apolloScript = (id: string, originals: string[]) => {
  const state: Record<string, unknown> = { ROOT_QUERY: { __typename: "Query" } };
  originals.forEach((originalUrl, index) => {
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

const PLACES: Record<string, { title: string; image: string; photos: string[] }> = {
  "1001": {
    title: "성수 파스타집 : 네이버\x1c",
    image: "https://search.pstatic.net/common/?type=f640_380&amp;src=og.jpg",
    photos: ORIGINALS,
  },
  // 상단 사진 목록이 없으면 og:image 한 장을 쓴다.
  "1002": {
    title: "망원 카페 : 네이버",
    image: CAFE_OG_IMAGE.replace(/&/g, "&amp;"),
    photos: [],
  },
  "1003": {
    title: "연남 카페 : 네이버",
    image: CAFE_OG_IMAGE.replace(/&/g, "&amp;"),
    photos: MANY_ORIGINALS,
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
          </head><body>${place.photos.length ? apolloScript(id!, place.photos) : ""}</body></html>`
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

  // 내역 줄 아래에 장소 이름(누르면 지도)과 사진 띠가 붙는다.
  const mapChip = page.getByRole("link", { name: "성수동 파스타 지도 열기" }).first();
  await expect(mapChip).toHaveText("성수 파스타집");
  await expect(mapChip).toHaveAttribute(
    "href",
    "https://map.naver.com/p/entry/place/1001"
  );
  const stripPhotos = page.getByRole("button", {
    name: /^성수 파스타집 사진 \d 크게 보기$/,
  });
  await expect(stripPhotos).toHaveCount(3);
  const firstThumb = stripPhotos.first().locator("img");
  await expect(firstThumb).toHaveAttribute("src", PHOTOS[0]);
  await expect
    .poll(() => firstThumb.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  // 사진이 없는 줄에는 빈 자리를 두지 않아 금액이 오른쪽 끝에 붙는다.
  await createEntry(request, "사진 없는 내역", "");
  await page.reload();
  const amountRight = async (memo: string) => {
    const row = page.getByRole("button", { name: new RegExp(memo) }).first();
    const box = (await row.getByText(/원$/).boundingBox())!;
    return Math.round(box.x + box.width);
  };
  expect(await amountRight("사진 없는 내역")).toBe(await amountRight("성수동 파스타"));

  // 줄에 마우스를 올리면 장소 사진까지 내역 한 건 전체를 칠한다(버튼만 칠하지 않는다).
  const rowButton = page.getByRole("button", { name: /성수동 파스타/ }).first();
  const rowCell = rowButton.locator("xpath=..");
  const canHover = await page.evaluate(() => matchMedia("(hover: hover)").matches);
  // 데스크톱에서는 반드시 마우스 올림을 확인한다.
  if (!test.info().project.use.isMobile) expect(canHover).toBe(true);
  if (canHover) {
    await rowButton.hover();
    await expect(rowCell).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(rowButton).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(
      rowCell.getByRole("link", { name: "성수동 파스타 지도 열기" })
    ).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(rowCell).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  }
  // 터치 화면에서는 탭한 뒤 수정 창을 닫아도 줄 배경이 남지 않는다.
  if (test.info().project.use.hasTouch) {
    await rowButton.tap();
    const editDialog = page.getByRole("dialog", { name: "내역 수정" });
    await editDialog.getByRole("button", { name: "취소" }).tap();
    await expect(editDialog).toBeHidden();
    await expect(rowCell).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  }

  // 사진을 누르면 크게 보고 넘긴다. 크게 볼 때는 1200×800 주소를 쓴다.
  await page
    .getByRole("button", { name: "성수 파스타집 사진 2 크게 보기" })
    .first()
    .click();
  const viewer = page.getByRole("dialog", { name: "성수 파스타집 사진 크게 보기" });
  await expect(viewer.getByText("2 / 3")).toBeVisible();
  const large = viewer.getByRole("img", { name: "성수 파스타집 사진 2" });
  await expect(large).toHaveAttribute("src", PHOTOS[1].replace("f640_380", "f1200_800"));
  await expect(large).toBeInViewport();
  await viewer.getByRole("button", { name: "다음 사진" }).click();
  await expect(viewer.getByText("3 / 3")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(viewer.getByText("2 / 3")).toBeVisible();
  await expect(viewer.getByRole("link", { name: /성수 파스타집/ })).toHaveAttribute(
    "href",
    "https://map.naver.com/p/entry/place/1001"
  );
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();

  // 수정 화면에서는 사진을 넘겨 보고, 장소 이름을 누르면 지도를 연다.
  await page
    .getByRole("button", { name: /성수동 파스타/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "내역 수정" });
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
  // 수정 화면에서도 사진을 누르면 크게 보고, 닫으면 수정 화면으로 돌아온다.
  await photos.getByRole("button", { name: "성수 파스타집 사진 2 크게 보기" }).click();
  const cardViewer = page.getByRole("dialog", { name: "성수 파스타집 사진 크게 보기" });
  await expect(cardViewer.getByText("2 / 3")).toBeVisible();
  await cardViewer.getByRole("button", { name: "닫기" }).click();
  await expect(cardViewer).toBeHidden();
  await expect(dialog.locator("#ledger-map-url")).toBeVisible();
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

test("네이버가 아니거나 장소를 못 찾으면 사진 없이 지도 칩만 보여 준다", async ({
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
  // 사진이 없으면 지도 칩만 붙는다.
  await expect(
    page.getByRole("link", { name: "카카오 카페 지도 열기" }).first()
  ).toHaveText("지도");
  await expect(page.getByRole("button", { name: /크게 보기$/ })).toHaveCount(0);

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

test("넓은 화면은 큰 사진 3장과 +N 칸, 좁은 화면은 모든 사진을 밀어 본다", async ({
  page,
  request,
}) => {
  await createEntry(request, "연남 카페", "https://map.naver.com/p/entry/place/1003");
  await openLedger(page, token);
  const wide = (page.viewportSize()?.width ?? 0) >= 640;
  const photoButtons = page.getByRole("button", {
    name: /^연남 카페 사진 \d 크게 보기$/,
  });
  const moreButton = page.getByRole("button", { name: "연남 카페 사진 3장 더 보기" });

  if (wide) {
    // 큰 사진 3장(160×96) + 나머지 3장을 묶은 "+3" 칸
    await expect(photoButtons.filter({ visible: true })).toHaveCount(3);
    const box = (await photoButtons.first().boundingBox())!;
    expect(Math.round(box.width)).toBe(160);
    expect(Math.round(box.height)).toBe(96);
    await expect(moreButton).toHaveText("+3");
    // 장소 이름은 테두리 없는 글자 링크로 사진 위에 둔다.
    const link = page.getByRole("link", { name: "연남 카페 지도 열기" }).first();
    await expect(link).toHaveCSS("border-top-width", "0px");
    expect((await link.boundingBox())!.y).toBeLessThan(box.y);
    // "+3"을 누르면 4번째 사진부터 크게 본다.
    await moreButton.click();
    const viewer = page.getByRole("dialog", { name: "연남 카페 사진 크게 보기" });
    await expect(viewer.getByText("4 / 6")).toBeVisible();
  } else {
    await expect(photoButtons).toHaveCount(6);
    await expect(moreButton).toBeHidden();
  }
});
