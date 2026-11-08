import { expect, test, type Page } from "@playwright/test";

import {
  buildLedgerAgentInstructions,
  createLedgerAgentToken,
} from "../src/lib/ledger/agent";
import {
  addEntry,
  authHeaders,
  daysAgo,
  getCategories,
  lastMonth,
  login,
  openLedger,
  pool,
  resetLedger,
  thisMonth,
  today,
} from "./helpers";

let token = "";

test.beforeEach(async ({ request }) => {
  await resetLedger();
  token = await login(request);
});

test.afterAll(async () => {
  await pool.end();
});

const fillNewEntry = async (
  page: Page,
  values: { amount: string; memo: string; category?: string; time?: string }
) => {
  await page.getByRole("button", { name: "내역 추가" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#ledger-amount").fill(values.amount);
  if (values.time) await dialog.locator("#ledger-time").fill(values.time);
  if (values.category)
    await dialog.getByRole("button", { name: values.category }).click();
  await dialog.locator("#ledger-memo").fill(values.memo);
  return dialog;
};

const openSettingsTab = async (page: Page, name: string) => {
  await page.getByRole("button", { name: "예산·설정" }).click();
  await page.getByRole("dialog").getByRole("tab", { name }).click();
  return page.getByRole("dialog");
};

test("모임통장 전용 입력: 기록자·결제수단 없이 저장하고 시각을 보여 준다", async ({
  page,
}) => {
  await openLedger(page, token);
  await expect(page.getByText("기록자")).toHaveCount(0);

  const dialog = await fillNewEntry(page, {
    amount: "12000",
    memo: "점심",
    category: "식비",
    time: "12:30",
  });
  await expect(dialog.getByText("결제수단")).toHaveCount(0);
  await expect(dialog.getByText("기록자")).toHaveCount(0);
  await dialog.getByRole("button", { name: "저장" }).click();

  await expect(page.getByRole("button", { name: /점심/ })).toContainText("12:30");

  const { rows } = await pool.query(
    `select e.member, e.entry_time, a.name as asset
     from ledger_entries e join ledger_assets a on a.id = e.asset_id`
  );
  expect(rows).toEqual([{ member: "joint", entry_time: "12:30", asset: "모임 통장" }]);
});

test("예전 태그의 시각과 통장 이름을 정리해서 보여 준다", async ({ page, request }) => {
  await addEntry(request, token, {
    entryDate: today(),
    amount: 1000,
    memo: "옛날 기록",
    tags: "모임통장, 15:52, 데이트",
  });
  await openLedger(page, token);
  const row = page.getByRole("button", { name: /옛날 기록/ });
  await expect(row).toContainText("15:52");
  await expect(row).toContainText("데이트");
  await expect(row).not.toContainText("모임통장");
});

test("잔액: 시작 잔액과 실제 통장 잔액 맞추기", async ({ page, request }) => {
  await addEntry(request, token, { entryDate: today(), amount: 30_000, memo: "지출" });
  await addEntry(request, token, {
    entryDate: today(),
    kind: "income",
    amount: 100_000,
    memo: "입금",
  });
  await openLedger(page, token);
  const balance = page.getByRole("button", { name: /모임통장 잔액/ });
  await expect(balance).toContainText("70,000원");

  await balance.click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#ledger-actual").fill("75000");
  await expect(dialog.getByText(/가계부보다 5,000원 많아요/)).toBeVisible();
  await dialog.getByRole("button", { name: "맞추기" }).click();
  await expect(page.getByText("잔액을 저장했어요.")).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(balance).toContainText("75,000원");
  await expect(balance).toContainText("통장과 맞춤");

  const { rows } = await pool.query("select opening_balance from ledger_account");
  expect(rows[0].opening_balance).toBe(5_000);
});

test("잔액 추이: 기간을 잘라도 실제 잔액부터 이어진다", async ({ request }) => {
  await request.put("/api/ledger/account", {
    headers: authHeaders(token),
    data: { openingBalance: 100_000 },
  });
  await addEntry(request, token, {
    entryDate: daysAgo(30),
    amount: 20_000,
    memo: "예전",
  });
  await addEntry(request, token, { entryDate: daysAgo(2), amount: 5_000, memo: "최근" });

  const res = await request.get(`/api/ledger/stats?from=${daysAgo(6)}&to=${today()}`, {
    headers: authHeaders(token),
  });
  const { stats } = await res.json();
  expect(stats.daily[0].balance).toBe(80_000);
  expect(stats.daily.at(-1).balance).toBe(75_000);
});

test("통계 탭에서 내역을 추가하면 통계가 바로 갱신된다", async ({ page, request }) => {
  await addEntry(request, token, { entryDate: today(), amount: 10_000, memo: "첫 지출" });
  await openLedger(page, token);
  await page.getByRole("tab", { name: "통계" }).click();
  await expect(page.getByText("총 지출 · 1건")).toBeVisible();

  const dialog = await fillNewEntry(page, { amount: "5000", memo: "두번째" });
  await dialog.getByRole("button", { name: "저장" }).click();

  await expect(page.getByText("총 지출 · 2건")).toBeVisible({ timeout: 5_000 });
});

test("상대방이 입력한 내역이 새로고침 없이 나타난다", async ({ page, request }) => {
  await openLedger(page, token);
  await addEntry(request, token, {
    entryDate: today(),
    amount: 7_000,
    memo: "상대방 기록",
  });
  await expect(page.getByRole("button", { name: /상대방 기록/ })).toBeVisible({
    timeout: 40_000,
  });
});

test("1년이 넘는 기록도 전체 통계가 열리고, 통계가 실패해도 예산·메모는 남는다", async ({
  page,
  request,
}) => {
  await addEntry(request, token, {
    entryDate: daysAgo(800),
    amount: 1_000,
    memo: "오래됨",
  });
  const res = await request.get("/api/ledger/stats", { headers: authHeaders(token) });
  expect(res.status()).toBe(200);

  await page.route("**/api/ledger/stats*", (route) =>
    route.fulfill({ status: 500, json: { error: "통계 실패" } })
  );
  await openLedger(page, token);
  await page.getByRole("tab", { name: "통계" }).click();
  await expect(page.getByText("통계 실패")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "메모 저장" })).toBeVisible();
  await expect(page.getByText("예산을 정하면 진행률을 보여줄게요")).toBeVisible();
});

test("쓰인 분류는 내역을 옮겨야 삭제되고, 내역은 분류를 잃지 않는다", async ({
  page,
  request,
}) => {
  const categoryId = await getCategories(request, token);
  await addEntry(request, token, {
    entryDate: today(),
    amount: 3_000,
    memo: "약값",
    categoryId: categoryId("의료"),
  });

  const rejected = await request.delete("/api/ledger/categories", {
    headers: authHeaders(token),
    data: { id: categoryId("의료") },
  });
  expect(rejected.status()).toBe(400);

  await openLedger(page, token);
  const dialog = await openSettingsTab(page, "분류");
  await dialog.getByRole("button", { name: "의료 삭제" }).click();

  const remove = dialog.getByRole("button", { name: "옮기고 삭제" });
  await expect(dialog.getByText(/내역 1건을 옮길 분류/)).toBeVisible();
  await expect(remove).toBeDisabled();

  await dialog.getByRole("combobox", { name: "옮길 분류" }).click();
  await page.getByRole("option", { name: "생활" }).click();
  await remove.click();
  await expect(dialog.getByRole("button", { name: "의료 삭제" })).toHaveCount(0);

  const { rows } = await pool.query(
    `select c.name from ledger_entries e join ledger_categories c on c.id = e.category_id`
  );
  expect(rows).toEqual([{ name: "생활" }]);
});

test("분류 삭제는 마지막 분류를 거부한다", async ({ request }) => {
  const categoryId = await getCategories(request, token);
  for (const name of ["용돈", "이자", "기타"]) {
    const res = await request.delete("/api/ledger/categories", {
      headers: authHeaders(token),
      data: { id: categoryId(name, "income") },
    });
    expect(res.ok()).toBe(true);
  }
  const res = await request.delete("/api/ledger/categories", {
    headers: authHeaders(token),
    data: { id: categoryId("급여", "income") },
  });
  expect(res.status()).toBe(400);
});

test("예산: 속도 안내, 분류별 진행률, 지난달 예산 불러오기", async ({
  page,
  request,
}) => {
  const categoryId = await getCategories(request, token);
  await request.put("/api/ledger/budget", {
    headers: authHeaders(token),
    data: {
      month: lastMonth(),
      totalBudget: 500_000,
      note: "",
      categories: [{ categoryId: categoryId("식비"), amount: 200_000 }],
    },
  });
  await request.put("/api/ledger/budget", {
    headers: authHeaders(token),
    data: {
      month: thisMonth(),
      totalBudget: 300_000,
      note: "",
      categories: [{ categoryId: categoryId("카페"), amount: 10_000 }],
    },
  });
  await addEntry(request, token, {
    entryDate: today(),
    amount: 12_000,
    memo: "커피",
    categoryId: categoryId("카페"),
  });

  await openLedger(page, token);
  await expect(page.getByText(/하루 약 .*원까지/)).toBeVisible();
  const categoryBudgets = page.getByRole("region", { name: "분류별 예산" });
  await expect(categoryBudgets).toContainText("카페");
  await expect(categoryBudgets).toContainText("2,000원 초과");

  const dialog = await openSettingsTab(page, "예산");
  await dialog.getByRole("button", { name: "지난달 예산 불러오기" }).click();
  await expect(dialog.locator("#ledger-total-budget")).toHaveValue("500,000");
  await expect(dialog.getByRole("textbox", { name: "식비 예산" })).toHaveValue("200,000");
  await expect(dialog.getByRole("textbox", { name: "카페 예산" })).toHaveValue("");
  await dialog.getByRole("button", { name: "저장" }).click();
  await expect(page.getByText("예산을 저장했어요.")).toBeVisible();

  const { rows } = await pool.query(
    `select c.name, b.amount from ledger_budgets b
     join ledger_categories c on c.id = b.category_id where b.month = $1`,
    [thisMonth()]
  );
  expect(rows).toEqual([{ name: "식비", amount: 200_000 }]);
});

test("예산 저장은 메모와 분류 예산을 함께 교체한다", async ({ request }) => {
  const categoryId = await getCategories(request, token);
  const save = (categories: { categoryId: number; amount: number }[], note: string) =>
    request.put("/api/ledger/budget", {
      headers: authHeaders(token),
      data: { month: thisMonth(), totalBudget: 1_000, note, categories },
    });

  expect((await save([{ categoryId: categoryId("식비"), amount: 100 }], "a")).ok()).toBe(
    true
  );
  expect(
    (
      await save(
        [
          { categoryId: categoryId("식비"), amount: 200 },
          { categoryId: categoryId("교통"), amount: 300 },
        ],
        "b"
      )
    ).ok()
  ).toBe(true);
  expect((await save([{ categoryId: categoryId("교통"), amount: 400 }], "c")).ok()).toBe(
    true
  );

  const { rows } = await pool.query("select amount from ledger_budgets");
  expect(rows).toEqual([{ amount: 400 }]);
  const months = await pool.query("select note from ledger_months");
  expect(months.rows).toEqual([{ note: "c" }]);
});

test("알림 붙여넣기: 미리보고 등록하며, 다시 붙이면 건너뛴다", async ({ page }) => {
  await openLedger(page, token);
  const text = `${today().slice(5).replace("-", "/")} 15:52 출금 4,500원 스타벅스\n\n입금 50,000원 이원찬`;

  const paste = async () => {
    await page.getByRole("button", { name: "알림 붙여넣기" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "은행 알림 내용" }).fill(text);
    await expect(dialog.getByText("2건을 찾았어요")).toBeVisible();
    await dialog.getByRole("button", { name: "2건 등록" }).click();
  };

  await paste();
  await expect(page.getByText("2건 등록했어요.")).toBeVisible();
  await expect(page.getByRole("button", { name: /스타벅스/ })).toContainText("카페");

  await paste();
  await expect(page.getByText(/0건 등록, 이미 있는 2건/)).toBeVisible();
  const { rows } = await pool.query("select count(*)::int as count from ledger_entries");
  expect(rows[0].count).toBe(2);
});

test("채팅 API: 토큰 검증, 조회, 기록, 중복 건너뛰기, 취소", async ({ request }) => {
  const agentToken = createLedgerAgentToken();
  expect(agentToken).toBeTruthy();
  const headers = { "x-ledger-token": agentToken! };

  expect((await request.get("/api/ledger/agent")).status()).toBe(401);
  expect(
    (await request.get("/api/ledger/agent", { headers: authHeaders(token) })).status()
  ).toBe(401);
  expect(
    (
      await request.get("/api/ledger", { headers: { "x-auth-token": agentToken! } })
    ).status()
  ).toBe(401);

  const entries = [{ amount: 12_000, memo: "점심", category: "식비" }];
  const created = await request.post("/api/ledger/agent", { headers, data: { entries } });
  expect(created.status()).toBe(201);
  const body = await created.json();
  expect(body).toMatchObject({ skipped: 0, balance: -12_000 });
  expect(body.created[0]).toMatchObject({ date: today(), amount: 12_000 });

  const duplicate = await (
    await request.post("/api/ledger/agent", { headers, data: { entries } })
  ).json();
  expect(duplicate).toMatchObject({ created: [], skipped: 1 });

  const allowed = await (
    await request.post("/api/ledger/agent", {
      headers,
      data: { entries, allowDuplicates: true },
    })
  ).json();
  expect(allowed.created).toHaveLength(1);

  const summary = await (await request.get("/api/ledger/agent", { headers })).json();
  expect(summary).toMatchObject({ balance: -24_000, expense: 24_000 });
  expect(summary.categories.expense).toContain("식비");
  expect(summary.recent[0]).toMatchObject({ category: "식비", memo: "점심" });

  const removed = await request.delete("/api/ledger/agent", {
    headers,
    data: { id: allowed.created[0].id },
  });
  expect(await removed.json()).toMatchObject({ ok: true, balance: -12_000 });

  const invalid = await request.post("/api/ledger/agent", {
    headers,
    data: { entries: [{ amount: -1 }] },
  });
  expect(invalid.status()).toBe(400);
});

test("채팅 지시문에 가계부 토큰이 있고 사이트 토큰은 없다", () => {
  const text = buildLedgerAgentInstructions("https://example.test") ?? "";
  expect(text).toContain("https://example.test/api/ledger/agent");
  expect(text).toContain("x-ledger-token");
  expect(text).not.toContain("x-auth-token");
});

test("삭제 후 되돌리기와 변경 이력", async ({ page, request }) => {
  await addEntry(request, token, {
    entryDate: today(),
    amount: 9_000,
    memo: "지울 기록",
  });
  await openLedger(page, token);

  const remove = async () => {
    await page.getByRole("button", { name: /지울 기록/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "삭제" }).click();
    await dialog.getByRole("button", { name: "지우기" }).click();
  };

  await remove();
  await expect(page.getByRole("button", { name: /지울 기록/ })).toHaveCount(0);
  await page.getByRole("button", { name: "되돌리기" }).click();
  await expect(page.getByRole("button", { name: /지울 기록/ })).toBeVisible();

  await remove();
  await expect(page.getByRole("button", { name: /지울 기록/ })).toHaveCount(0);
  const dialog = await openSettingsTab(page, "기록");
  await expect(dialog.getByText(/삭제 · 지울 기록/).first()).toBeVisible();
  await expect(dialog.getByText(/복구 · 지울 기록/)).toBeVisible();
  await expect(dialog.getByText(/추가 · 지울 기록/)).toBeVisible();
  await dialog.getByRole("button", { name: "되돌리기" }).click();
  await expect(page.getByText("기록을 되돌렸어요.").first()).toBeVisible();

  const { rows } = await pool.query("select deleted_at from ledger_entries");
  expect(rows).toEqual([{ deleted_at: null }]);
});

test("CSV 내보내기: Excel용 BOM, 수식 이스케이프, 삭제 내역 제외", async ({
  request,
}) => {
  await addEntry(request, token, { entryDate: today(), amount: 1_000, memo: "=SUM(A1)" });
  const deleted = await addEntry(request, token, {
    entryDate: today(),
    amount: 2_000,
    memo: "지운 기록",
  });
  await request.delete("/api/ledger/entries", {
    headers: authHeaders(token),
    data: { id: deleted },
  });

  const res = await request.get("/api/ledger/export", { headers: authHeaders(token) });
  expect(res.headers()["content-disposition"]).toContain("attachment");
  const bytes = await res.body();
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const csv = bytes.toString("utf-8");
  expect(csv).toContain("날짜,시각,구분,금액,분류,내용,태그");
  expect(csv).toContain("'=SUM(A1)");
  expect(csv).not.toContain("지운 기록");
});

test("검색은 다른 달의 내용·태그·분류까지 찾는다", async ({ page, request }) => {
  const categoryId = await getCategories(request, token);
  await addEntry(request, token, {
    entryDate: daysAgo(90),
    amount: 8_000,
    memo: "강릉 물회",
    tags: "여행",
    categoryId: categoryId("식비"),
  });
  await addEntry(request, token, { entryDate: today(), amount: 1_000, memo: "버스" });

  await openLedger(page, token);
  const search = page.getByRole("searchbox", { name: "내역 검색" });

  await search.fill("물회");
  await expect(page.getByRole("button", { name: /강릉 물회/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /버스/ })).toHaveCount(0);
  await expect(page.getByText(/1건 · 지출 8,000원/)).toBeVisible();

  await search.fill("여행");
  await expect(page.getByRole("button", { name: /강릉 물회/ })).toBeVisible();

  await search.fill("없는말");
  await expect(page.getByText("일치하는 내역이 없어요")).toBeVisible();

  await search.fill("");
  await expect(page.getByRole("button", { name: /버스/ })).toBeVisible();
});

test("통계 내역은 위쪽 기간을 따르고 눌러서 수정할 수 있다", async ({
  page,
  request,
}) => {
  await addEntry(request, token, {
    entryDate: daysAgo(40),
    amount: 1_000,
    memo: "옛 지출",
  });
  await addEntry(request, token, {
    entryDate: today(),
    amount: 2_000,
    memo: "오늘 지출",
  });

  await openLedger(page, token);
  await page.getByRole("tab", { name: "통계" }).click();
  await expect(page.getByRole("button", { name: /옛 지출/ })).toBeVisible();
  await expect(page.getByText("큰 지출 TOP 8")).toBeVisible();

  await page.getByRole("button", { name: "최근 7일" }).click();
  await expect(page.getByRole("button", { name: /옛 지출/ })).toHaveCount(0);

  await page.getByRole("button", { name: /오늘 지출/ }).click();
  await expect(page.getByRole("dialog").getByText("내역 수정")).toBeVisible();
  await expect(page.getByRole("dialog").locator("#ledger-memo")).toHaveValue("오늘 지출");
});

test("내역 추가 날짜는 달력에서 고른 날이나 보고 있는 달을 따른다", async ({ page }) => {
  await openLedger(page, token);

  await page.getByRole("button", { name: "이전 달" }).click();
  await page.getByRole("button", { name: "내역 추가" }).first().click();
  await expect(page.getByRole("dialog").locator("#ledger-date")).toHaveValue(
    `${lastMonth()}-01`
  );
  await page.getByRole("dialog").getByRole("button", { name: "취소" }).click();

  await page.getByRole("tab", { name: "달력" }).click();
  await page.getByRole("button", { name: /15일/ }).click();
  await page.getByRole("button", { name: "내역 추가" }).first().click();
  await expect(page.getByRole("dialog").locator("#ledger-date")).toHaveValue(
    `${lastMonth()}-15`
  );
});

test("지난달을 볼 때 '이번 달' 문구를 쓰지 않는다", async ({ page }) => {
  await openLedger(page, token);
  await page.getByRole("button", { name: "이전 달" }).click();
  await expect(page.getByText("이번 달 지출")).toHaveCount(0);
  const [year, month] = lastMonth().split("-");
  await expect(page.getByText(`${year}년 ${Number(month)}월 지출`)).toBeVisible();
});

test("없는 날짜와 잘못된 달은 거부한다", async ({ request }) => {
  const res = await request.post("/api/ledger/entries", {
    headers: authHeaders(token),
    data: { entryDate: "2026-02-31", kind: "expense", amount: 1_000 },
  });
  expect(res.status()).toBe(400);

  const budget = await request.put("/api/ledger/budget", {
    headers: authHeaders(token),
    data: { month: "2026-13", totalBudget: 1_000 },
  });
  expect(budget.status()).toBe(400);
});

test("모바일 폭에서 가로 스크롤이 생기지 않는다", async ({ page, request }) => {
  await addEntry(request, token, {
    entryDate: today(),
    amount: 1_000_000,
    memo: "큰 지출",
  });
  await openLedger(page, token);
  for (const name of ["내역", "달력", "통계"]) {
    await page.getByRole("tab", { name }).click();
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, name).toBeLessThanOrEqual(0);
  }
});
