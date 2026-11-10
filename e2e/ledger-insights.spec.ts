import { expect, test } from "@playwright/test";

import { kst } from "../src/lib/kst";
import {
  addEntry,
  authHeaders,
  getCategories,
  login,
  openLedger,
  resetLedger,
  thisMonth,
  today,
} from "./helpers";

/** 머니노트에서 옮겨 온 통계 인사이트: 평소와 다른 지출, 고정비. */

let token = "";

test.beforeEach(async ({ request }) => {
  await resetLedger();
  token = await login(request);
});

const monthsAgo = (n: number) => kst().subtract(n, "month").format("YYYY-MM");

test("이전 기록이 부족하면 평소와 비교하지 않는다고 안내한다", async ({
  page,
  request,
}) => {
  await addEntry(request, token, { entryDate: today(), amount: 10_000, memo: "첫 기록" });

  const res = await request.get(`/api/ledger/insights?month=${thisMonth()}`, {
    headers: authHeaders(token),
  });
  expect(res.ok()).toBe(true);
  expect((await res.json()).insights.unusual.total).toBeNull();

  const bad = await request.get("/api/ledger/insights?month=2026-13", {
    headers: authHeaders(token),
  });
  expect(bad.status()).toBe(400);
  const future = await request.get(
    `/api/ledger/insights?month=${kst().add(1, "month").format("YYYY-MM")}`,
    { headers: authHeaders(token) }
  );
  expect(future.status()).toBe(400);

  await openLedger(page, token);
  await page.getByRole("tab", { name: "통계" }).click();
  await expect(
    page.getByText("이전 기록이 3개월 이상 쌓이면 평소와 비교해 드려요")
  ).toBeVisible();
  await expect(page.getByTestId("fixed-cost-card")).toContainText(
    "이 달에는 고정비로 본 지출이 없어요"
  );
});

test("평소보다 많이 쓴 분류와 유난히 큰 내역, 고정비를 보여 준다", async ({
  page,
  request,
}) => {
  const category = await getCategories(request, token);
  for (let n = 6; n >= 1; n -= 1) {
    const m = monthsAgo(n);
    await addEntry(request, token, {
      entryDate: `${m}-01`,
      kind: "income",
      amount: 600_000,
      memo: "모임통장 입금",
    });
    for (const amount of [12_000, 9_000, 15_000]) {
      await addEntry(request, token, {
        entryDate: `${m}-01`,
        amount,
        memo: "점심",
        categoryId: category("식비"),
      });
    }
    await addEntry(request, token, {
      entryDate: `${m}-01`,
      amount: 13_500,
      memo: "영상 구독",
      categoryId: category("문화"),
    });
  }
  const month = thisMonth();
  await addEntry(request, token, {
    entryDate: `${month}-01`,
    kind: "income",
    amount: 600_000,
    memo: "모임통장 입금",
  });
  for (const [amount, memo, name] of [
    [180_000, "기념일 저녁", "식비"],
    [11_000, "점심", "식비"],
    [13_500, "영상 구독", "문화"],
  ] as const) {
    await addEntry(request, token, {
      entryDate: `${month}-01`,
      amount,
      memo,
      categoryId: category(name),
    });
  }

  await openLedger(page, token);
  await page.getByRole("tab", { name: "통계" }).click();

  const unusual = page.getByTestId("unusual-spend-card");
  await expect(unusual).toContainText("최근 6개월");
  await expect(unusual.getByRole("list", { name: "평소와 다른 분류" })).toContainText(
    "식비"
  );
  const big = unusual.getByRole("button", { name: /기념일 저녁/ });
  await expect(big).toContainText("180,000원");
  // 큰 내역을 누르면 바로 고칠 수 있다.
  await big.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  const fixed = page.getByTestId("fixed-cost-card");
  await expect(fixed.getByRole("list", { name: "이 달의 고정비" })).toContainText(
    "영상 구독"
  );
  await expect(fixed).toContainText("매달 나감");
  // 입금 600,000원 중 204,500원을 써서 65.9%를 남겼다.
  await expect(fixed).toContainText("65.9%");
  await expect(fixed.getByRole("img", { name: "월별 고정비 비중" })).toBeVisible();
});
