import { expect, test } from "@playwright/test";

import { login, openLedger, pool, resetLedger, today } from "./helpers";

/**
 * 달력 칸의 장소 사진(폴라로이드)과 마우스 미리보기.
 * 장소 사진은 DB에 바로 넣고, 사진 주소는 화면에서 가로채 가짜 사진을 돌려준다.
 */

const photo = (name: string) =>
  `https://search.pstatic.net/common/?type=f640_380&src=${name}.jpg`;
const CAFE = Array.from({ length: 6 }, (_, i) => photo(`cafe-${i + 1}`));
const PASTA = [photo("pasta-1"), photo("pasta-2"), photo("pasta-3")];
// 1x1 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const addPlaceEntry = (
  memo: string,
  amount: number,
  place: { url: string; name: string; photos: string[] }
) =>
  pool.query(
    `insert into ledger_entries (entry_date, kind, amount, memo, map_url, map_place_name, map_image_urls)
     values ($1, 'expense', $2, $3, $4, $5, $6::jsonb)`,
    [today(), amount, memo, place.url, place.name, JSON.stringify(place.photos)]
  );

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

test("달력 칸에 그날 간 곳 사진을 폴라로이드로 붙이고, 마우스를 올리면 미리 본다", async ({
  page,
  isMobile,
}) => {
  // 금액이 큰 내역의 장소가 앞(대표 사진)에 온다. 사진 없는 장소는 세지 않는다.
  await addPlaceEntry("성수동 파스타", 12_000, {
    url: "https://map.naver.com/p/entry/place/1001",
    name: "성수 파스타집",
    photos: PASTA,
  });
  await addPlaceEntry("연남 카페", 33_000, {
    url: "https://map.naver.com/p/entry/place/1003",
    name: "연남 카페",
    photos: CAFE,
  });
  await addPlaceEntry("카카오 카페", 50_000, {
    url: "https://kko.to/AbCdEf",
    name: "",
    photos: [],
  });

  await openLedger(page, token);
  await page.getByRole("tab", { name: "달력" }).click();
  const cell = page.getByRole("button", {
    name: /, 간 곳 연남 카페, 성수 파스타집$/,
  });
  await expect(cell).toBeVisible();
  const polaroids = cell.locator("[data-slot=calendar-polaroid]");
  await expect(polaroids).toHaveCount(2);
  // 앞에 붙은(나중에 그린) 폴라로이드가 대표 사진이다.
  await expect(polaroids.last().locator("img")).toHaveAttribute("src", CAFE[0]);
  await expect(polaroids.first().locator("img")).toHaveAttribute("src", PASTA[0]);

  // 폴라로이드는 금액 글씨와 겹치지 않는다.
  // 글자 줄이 칸 폭을 다 차지하므로, 글자 자체가 차지한 영역으로 잰다.
  const amount = await cell.getByText(/^-\d/).evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const { x, y, width, height } = range.getBoundingClientRect();
    return { x, y, width, height };
  });
  const sticker = (await polaroids.last().boundingBox())!;
  const cellBox = (await cell.boundingBox())!;
  const overlaps =
    sticker.x < amount.x + amount.width &&
    amount.x < sticker.x + sticker.width &&
    sticker.y < amount.y + amount.height &&
    amount.y < sticker.y + sticker.height;
  expect(overlaps).toBe(false);
  expect(sticker.x + sticker.width).toBeLessThanOrEqual(cellBox.x + cellBox.width + 2);

  const preview = page.getByLabel(/ 간 곳$/);
  if (isMobile) {
    // 터치 화면에서는 미리보기 대신, 날짜를 누르면 아래 내역의 장소 사진으로 본다.
    await cell.tap();
    await expect(cell).toHaveAttribute("aria-pressed", "true");
    await expect(preview).toBeHidden();
    await expect(
      page.getByRole("link", { name: "연남 카페 지도 열기" }).first()
    ).toBeVisible();
  } else {
    await cell.hover();
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("장소 2곳");
    await expect(preview).toContainText("연남 카페");
    await expect(preview).toContainText("성수 파스타집");
    // 장소마다 사진 3장까지
    await expect(preview.getByRole("img")).toHaveCount(6);
    await expect(preview.getByRole("img", { name: "연남 카페 사진 1" })).toHaveAttribute(
      "src",
      CAFE[0]
    );
    await page.mouse.move(0, 0);
    await expect(preview).toBeHidden();
  }
});
