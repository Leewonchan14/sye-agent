import { expect, test } from "@playwright/test";

import {
  addEntry,
  authHeaders,
  login,
  openLedger,
  pool,
  resetLedger,
  today,
} from "./helpers";

/** 지출에 장소 지도 링크를 남긴다. */

let token = "";

test.beforeEach(async ({ request }) => {
  await resetLedger();
  token = await login(request);
});

test("지출에 지도 공유 문구를 붙이면 링크만 남기고 열 수 있다", async ({ page }) => {
  await openLedger(page, token);
  await page.getByRole("button", { name: "내역 추가" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#ledger-amount").fill("12000");
  await dialog.locator("#ledger-memo").fill("성수동 파스타");

  // 지도 앱의 공유 문구를 통째로 붙여도 링크만 남는다.
  const mapInput = dialog.locator("#ledger-map-url");
  await mapInput.fill(
    "[네이버 지도]\n성수 파스타집\n서울 성동구 연무장길\nhttps://naver.me/xAbC12"
  );
  await mapInput.blur();
  await expect(mapInput).toHaveValue("https://naver.me/xAbC12");
  await expect(dialog.getByRole("link", { name: "지도 열기" })).toHaveAttribute(
    "href",
    "https://naver.me/xAbC12"
  );

  await dialog.getByRole("button", { name: "저장" }).click();
  await expect(dialog).toBeHidden();

  const { rows } = await pool.query(
    "select map_url from ledger_entries where memo = '성수동 파스타'"
  );
  expect(rows[0].map_url).toBe("https://naver.me/xAbC12");

  // 내역 목록에서 지도를 바로 연다.
  const listLink = page.getByRole("link", { name: "성수동 파스타 지도 열기" }).first();
  await expect(listLink).toHaveAttribute("href", "https://naver.me/xAbC12");
  await expect(listLink).toHaveAttribute("target", "_blank");
  // 실제 지도 서비스에 접속하지 않도록 가로챈다.
  await page
    .context()
    .route("https://naver.me/**", (route) =>
      route.fulfill({ contentType: "text/html", body: "<p>map</p>" })
    );
  const popupPromise = page.waitForEvent("popup");
  await listLink.click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  expect(popup.url()).toContain("naver.me/xAbC12");
  await popup.close();
  // 지도 버튼을 눌러도 수정 화면은 열리지 않는다.
  await expect(dialog).toBeHidden();

  // 통계 탭의 내역 목록에서도 바로 연다.
  await page.getByRole("tab", { name: "통계" }).click();
  await expect(
    page.getByRole("link", { name: "성수동 파스타 지도 열기" }).first()
  ).toHaveAttribute("href", "https://naver.me/xAbC12");
  await page.getByRole("tab", { name: "내역" }).click();

  // 수정 화면에서도 링크를 고치고 열 수 있다.
  await page
    .getByRole("button", { name: /성수동 파스타/ })
    .first()
    .click();
  await expect(dialog.locator("#ledger-map-url")).toHaveValue("https://naver.me/xAbC12");
  await expect(dialog.getByRole("link", { name: "지도 열기" })).toHaveAttribute(
    "target",
    "_blank"
  );
});

test("입금에는 지도 링크 칸이 없다", async ({ page }) => {
  await openLedger(page, token);
  await page.getByRole("button", { name: "내역 추가" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("#ledger-map-url")).toBeVisible();
  await dialog.getByRole("button", { name: "입금", exact: true }).click();
  await expect(dialog.locator("#ledger-map-url")).toBeHidden();
});

test("지도 링크 검증과 보존", async ({ request }) => {
  // http(s)가 아닌 주소는 받지 않는다.
  const bad = await request.post("/api/ledger/entries", {
    headers: authHeaders(token),
    data: {
      entryDate: today(),
      kind: "expense",
      amount: 5_000,
      memo: "이상한 링크",
      mapUrl: "javascript:alert(1)",
    },
  });
  expect(bad.status()).toBe(400);

  await addEntry(request, token, {
    entryDate: today(),
    amount: 5_000,
    memo: "카카오맵 카페",
  });
  const { rows } = await pool.query(
    "select id from ledger_entries where memo = '카카오맵 카페'"
  );
  const id = rows[0].id;

  const patch = (data: Record<string, unknown>) =>
    request.patch("/api/ledger/entries", {
      headers: authHeaders(token),
      data: {
        id,
        entryDate: today(),
        kind: "expense",
        amount: 5_000,
        memo: "카카오맵 카페",
        ...data,
      },
    });

  expect((await patch({ mapUrl: "https://kko.to/AbCdEf" })).ok()).toBe(true);
  // 지도 링크를 보내지 않는 수정(에이전트 등)은 기존 링크를 지우지 않는다.
  expect((await patch({ amount: 5_500 })).ok()).toBe(true);
  const kept = await pool.query("select map_url from ledger_entries where id = $1", [id]);
  expect(kept.rows[0].map_url).toBe("https://kko.to/AbCdEf");

  // 빈 값을 보내면 지운다.
  expect((await patch({ mapUrl: "" })).ok()).toBe(true);
  const cleared = await pool.query("select map_url from ledger_entries where id = $1", [
    id,
  ]);
  expect(cleared.rows[0].map_url).toBe("");
});
