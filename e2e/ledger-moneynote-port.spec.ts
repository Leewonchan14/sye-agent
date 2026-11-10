import { expect, test } from "@playwright/test";

import { lastCompletedRecapKey, recapRange } from "../src/lib/ledger/recap";
import { shiftWeek, weekStartOf } from "../src/lib/ledger/week";
import {
  addEntry,
  authHeaders,
  getCategories,
  login,
  openLedger,
  pool,
  resetLedger,
  showLastWeek,
  today,
} from "./helpers";

/** 머니노트에서 옮겨 온 기능: 메모, 자주 쓰는 내역, 주 단위 보기, 통계 정렬, 3D 도시, 영수증, 이 달의 여행. */

let token = "";

test.beforeEach(async ({ request }) => {
  await resetLedger();
  token = await login(request);
});

test("자주 쓰는 내역 칩으로 채우고 메모를 남긴다", async ({ page, request }) => {
  const categoryId = await getCategories(request, token);
  await addEntry(request, token, {
    entryDate: today(),
    amount: 6_500,
    memo: "성수동 카페",
    categoryId: categoryId("카페"),
  });

  await openLedger(page, token);
  await page.getByRole("button", { name: "내역 추가" }).first().click();
  const dialog = page.getByRole("dialog");
  const chips = dialog.getByRole("group", { name: "자주 쓰는 내역" });
  await chips.getByRole("button", { name: /성수동 카페/ }).click();
  await expect(dialog.locator("#ledger-memo")).toHaveValue("성수동 카페");
  await expect(dialog.locator("#ledger-amount")).toHaveValue("6,500");
  await expect(dialog.getByRole("button", { name: "카페" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await dialog.locator("#ledger-note").fill("친구 생일이라 케이크도 같이");
  await dialog.getByRole("button", { name: "저장" }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByText("친구 생일이라 케이크도 같이")).toBeVisible();

  // 메모로도 전체 기간 검색이 된다.
  await page.getByRole("searchbox", { name: "내역 검색" }).fill("케이크");
  await expect(page.getByText("전체 기간 검색 결과")).toBeVisible();
  await expect(page.getByText(/^1건/)).toBeVisible();

  // 메모를 보내지 않는 수정(에이전트 등)은 기존 메모를 지우지 않는다.
  const { rows } = await pool.query(
    "select id from ledger_entries where note <> '' order by id desc limit 1"
  );
  const res = await request.patch("/api/ledger/entries", {
    headers: authHeaders(token),
    data: {
      id: rows[0].id,
      entryDate: today(),
      kind: "expense",
      amount: 7_000,
      memo: "성수동 카페",
    },
  });
  expect(res.ok()).toBe(true);
  const after = await pool.query(
    "select amount, note from ledger_entries where id = $1",
    [rows[0].id]
  );
  expect(after.rows[0]).toEqual({ amount: 7_000, note: "친구 생일이라 케이크도 같이" });
});

test("내용을 예전과 똑같이 입력하면 분류를 채운다", async ({ page, request }) => {
  const categoryId = await getCategories(request, token);
  await addEntry(request, token, {
    entryDate: today(),
    amount: 1_500,
    memo: "버스",
    categoryId: categoryId("교통"),
  });

  await openLedger(page, token);
  await page.getByRole("button", { name: "내역 추가" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#ledger-memo").fill("버스");
  await expect(dialog.getByRole("button", { name: "교통" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});

test("내역·달력·통계를 주 단위로 본다", async ({ page, request }) => {
  const thisWeek = weekStartOf(today());
  const lastWeek = shiftWeek(thisWeek, -1);
  await addEntry(request, token, {
    entryDate: thisWeek,
    amount: 12_000,
    memo: "이번 주 점심",
  });
  await addEntry(request, token, {
    entryDate: lastWeek,
    amount: 30_000,
    memo: "지난주 장보기",
  });

  await openLedger(page, token);
  await page
    .getByRole("group", { name: "기간 단위" })
    .getByRole("button", { name: "주" })
    .click();

  await expect(page.getByRole("button", { name: "이전 주" })).toBeVisible();
  await expect(page.getByRole("button", { name: /이번 주 점심/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /지난주 장보기/ })).toHaveCount(0);
  await expect(page.getByText("12,000원").first()).toBeVisible();

  await page.getByRole("button", { name: "이전 주" }).click();
  await expect(page.getByRole("button", { name: /지난주 장보기/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /이번 주 점심/ })).toHaveCount(0);
  await page.getByRole("button", { name: "이번 주" }).click();

  // 달력은 월~일 7칸 주간 달력으로 바뀐다.
  await page.getByRole("tab", { name: "달력" }).click();
  await expect(page.getByText(/이 주 지출/)).toBeVisible();
  await expect(page.getByRole("button", { name: /지출 12,000원/ })).toBeVisible();

  // 통계는 주별 리포트로 열리고 지난주와 비교한다.
  await page.getByRole("tab", { name: "통계" }).click();
  await expect(
    page.getByRole("group", { name: "리포트 기간" }).getByRole("button", { name: "주별" })
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("전주 대비")).toBeVisible();
});

test("통계 내역을 금액순으로 정렬한다", async ({ page, request }) => {
  for (const [amount, memo] of [
    [3_000, "중간 지출"],
    [9_000, "큰 지출"],
    [1_000, "작은 지출"],
  ] as const) {
    await addEntry(request, token, { entryDate: today(), amount, memo });
  }

  await openLedger(page, token);
  await page.getByRole("tab", { name: "통계" }).click();
  const rows = page.getByRole("button", { name: /(중간|큰|작은) 지출/ });
  await expect(rows).toHaveCount(3);

  await page
    .getByRole("group", { name: "정렬 기준" })
    .getByRole("button", { name: "금액" })
    .click();
  await expect(rows.first()).toContainText("큰 지출");
  await expect(rows.last()).toContainText("작은 지출");

  await page.getByRole("button", { name: "정렬 방향: 큰 금액순" }).click();
  await expect(rows.first()).toContainText("작은 지출");
});

test("달력을 3D 도시로 보고 이 달의 여행을 함께 보여 준다", async ({ page, request }) => {
  await addEntry(request, token, {
    entryDate: today(),
    amount: 8_000,
    memo: "도시 건물",
  });
  const trip = await request.post("/api/ledger/trips", {
    headers: authHeaders(token),
    data: { name: "가을 여행", startDate: today(), endDate: today() },
  });
  expect(trip.ok()).toBe(true);

  await openLedger(page, token);
  await page.getByRole("tab", { name: "달력" }).click();
  const trips = page.getByRole("list", { name: "이 달의 여행" });
  await expect(trips).toContainText("가을 여행");

  await page
    .getByRole("group", { name: "달력 보기 방식" })
    .getByRole("button", { name: "3D 도시" })
    .click();
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/높이는 그날 지출/)).toBeVisible();
  await expect(trips).toContainText("가을 여행");
});

test("지난주 리캡에서 영수증을 뽑는다", async ({ page, request }) => {
  const key = lastCompletedRecapKey("week", today());
  const week = recapRange("week", key, today());
  await addEntry(request, token, {
    entryDate: week.from,
    amount: 4_500,
    memo: "아메리카노",
  });
  await addEntry(request, token, { entryDate: week.to, amount: 15_500, memo: "떡볶이" });

  await openLedger(page, token);
  await showLastWeek(page);
  await page
    .getByRole("region", { name: "주간 리캡 지난주" })
    .getByRole("button", { name: "영수증 뽑기" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "지난주 영수증" })).toBeVisible();
  const skip = dialog.getByRole("button", { name: "건너뛰기" });
  if (await skip.isVisible().catch(() => false)) await skip.click();

  await expect(
    dialog.getByRole("img", { name: "지난주 영수증, 합계 20,000원" })
  ).toBeVisible({
    timeout: 20_000,
  });
  const lines = dialog.getByRole("listitem");
  await expect(lines.filter({ hasText: "아메리카노" })).toHaveCount(1);
  await expect(lines.filter({ hasText: "합계 20,000원" })).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: "이미지 저장" })).toHaveAttribute(
    "download",
    `모임통장-영수증-${key}.png`
  );
});
