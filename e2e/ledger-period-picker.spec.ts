import { expect, test, type Locator, type Page } from "@playwright/test";

import { kst } from "../src/lib/kst";
import { formatMonthKo } from "../src/lib/ledger/format";
import { formatWeekKo, shiftWeek, weekEndOf, weekStartOf } from "../src/lib/ledger/week";
import { addEntry, login, openLedger, resetLedger, thisMonth, today } from "./helpers";

/** 기간 라벨을 눌러 달·주를 picker로 바로 고른다. */

let token = "";

test.beforeEach(async ({ request }) => {
  await resetLedger();
  token = await login(request);
});

const periodToggle = (page: Page) => page.getByRole("group", { name: "기간 단위" });
const popup = (page: Page) => page.locator('[data-slot="popover-content"]');

/** 달력 picker를 열고 iso 날짜가 보일 때까지 넘긴 뒤 누른다. */
const pickDate = async (page: Page, trigger: Locator, iso: string) => {
  await trigger.click();
  await popup(page).waitFor();
  for (let step = 0; step < 36; step += 1) {
    const cell = popup(page).locator(`td[data-day="${iso}"]:not([data-outside])`);
    if (await cell.count()) {
      await cell.getByRole("button").click();
      await popup(page).waitFor({ state: "hidden" });
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

test("내역에서 기간 라벨을 눌러 먼 달로 바로 간다", async ({ page, request }) => {
  const target = kst().subtract(14, "month");
  const targetMonth = target.format("YYYY-MM");
  await addEntry(request, token, {
    entryDate: `${targetMonth}-10`,
    amount: 23_000,
    memo: "열네 달 전",
  });

  await openLedger(page, token);
  await page
    .getByRole("button", { name: formatMonthKo(thisMonth()), exact: true })
    .click();
  await expect(popup(page).getByText(`${kst().year()}년`)).toBeVisible();
  for (let year = kst().year(); year > target.year(); year -= 1) {
    await popup(page).getByRole("button", { name: "이전 해" }).click();
  }
  await popup(page)
    .getByRole("button", { name: formatMonthKo(targetMonth), exact: true })
    .click();

  await expect(popup(page)).toBeHidden();
  await expect(
    page.getByRole("button", { name: formatMonthKo(targetMonth), exact: true })
  ).toBeVisible();
  await expect(page.getByText("열네 달 전").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "이번 달" })).toBeVisible();
});

test("주 단위에서 달력의 날짜를 누르면 그 날이 든 주로 간다", async ({
  page,
  request,
}) => {
  const thisWeek = weekStartOf(today());
  const targetWeek = shiftWeek(thisWeek, -5);
  const picked = kst(targetWeek).add(2, "day").format("YYYY-MM-DD");
  await addEntry(request, token, {
    entryDate: kst(targetWeek).add(5, "day").format("YYYY-MM-DD"),
    amount: 17_000,
    memo: "다섯 주 전",
  });
  await addEntry(request, token, {
    entryDate: kst(targetWeek).add(7, "day").format("YYYY-MM-DD"),
    amount: 8_000,
    memo: "그 다음 주",
  });

  await openLedger(page, token);
  await periodToggle(page).getByRole("button", { name: "주" }).click();
  const trigger = page.getByRole("button", {
    name: formatWeekKo(thisWeek, today()),
    exact: true,
  });
  await pickDate(page, trigger, picked);

  const picker = page.getByRole("button", {
    name: formatWeekKo(targetWeek, today()),
    exact: true,
  });
  await expect(picker).toBeVisible();
  await expect(page.getByText("다섯 주 전").first()).toBeVisible();
  await expect(page.getByText("그 다음 주")).toHaveCount(0);

  // 다시 열면 고른 주가 범위로 칠해져 있다.
  await picker.click();
  await expect(
    popup(page).locator(`td[data-day="${targetWeek}"]`).getByRole("button")
  ).toHaveAttribute("data-range-start", "true");
  await expect(
    popup(page)
      .locator(`td[data-day="${weekEndOf(targetWeek)}"]`)
      .getByRole("button")
  ).toHaveAttribute("data-range-end", "true");
});

test("통계에서는 앞으로의 달과 주를 고를 수 없다", async ({ page }) => {
  await openLedger(page, token);
  await page.getByRole("tab", { name: "통계" }).click();
  await page
    .getByRole("button", { name: formatMonthKo(thisMonth()), exact: true })
    .click();
  await expect(popup(page).getByRole("button", { name: "다음 해" })).toBeDisabled();
  const nextMonth = kst().add(1, "month");
  if (nextMonth.year() === kst().year()) {
    await expect(
      popup(page).getByRole("button", {
        name: formatMonthKo(nextMonth.format("YYYY-MM")),
        exact: true,
      })
    ).toBeDisabled();
  }
  await page.keyboard.press("Escape");

  await page
    .getByRole("group", { name: "리포트 기간" })
    .getByRole("button", { name: "주별", exact: true })
    .click();
  const thisWeek = weekStartOf(today());
  await page
    .getByRole("button", { name: formatWeekKo(thisWeek, today()), exact: true })
    .click();
  const cell = popup(page).locator(`td[data-day="${shiftWeek(thisWeek, 1)}"]`);
  if (await cell.count()) await expect(cell.getByRole("button")).toBeDisabled();
});
