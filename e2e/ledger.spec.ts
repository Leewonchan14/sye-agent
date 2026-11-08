import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

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

const reportPeriod = (page: Page) => page.getByRole("group", { name: "리포트 기간" });

test("통계 탭의 기간 설정은 기간별 리포트 안에 하나만 있다", async ({
  page,
  request,
}) => {
  await addEntry(request, token, { entryDate: today(), amount: 1_000, memo: "지출" });
  await openLedger(page, token);
  await expect(page.getByRole("button", { name: "이전 달" })).toBeVisible();

  await page.getByRole("tab", { name: "통계" }).click();
  await expect(page.getByText("기간별 리포트")).toBeVisible();
  await expect(page.getByRole("button", { name: "이전 달" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "메모 저장" })).toHaveCount(0);

  await reportPeriod(page).getByRole("button", { name: "전체", exact: true }).click();
  await expect(page.getByRole("button", { name: "이전 달" })).toHaveCount(0);

  await page.getByRole("tab", { name: "내역" }).click();
  await expect(page.getByRole("button", { name: "이전 달" })).toBeVisible();
});

test("리포트는 월별이 기본이고 달을 넘겨 볼 수 있다", async ({ page, request }) => {
  await addEntry(request, token, {
    entryDate: today(),
    amount: 10_000,
    memo: "이번달 지출",
  });
  await addEntry(request, token, {
    entryDate: `${lastMonth()}-15`,
    amount: 3_000,
    memo: "지난달 지출",
  });

  await openLedger(page, token);
  await page.getByRole("tab", { name: "통계" }).click();

  await expect(
    reportPeriod(page).getByRole("button", { name: "월별", exact: true })
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("총 지출 · 1건")).toBeVisible();
  await expect(page.getByRole("button", { name: /이번달 지출/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /지난달 지출/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "다음 달" })).toBeDisabled();

  await page.getByRole("button", { name: "이전 달" }).click();
  await expect(page.getByRole("button", { name: /지난달 지출/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /이번달 지출/ })).toHaveCount(0);
  await expect(
    page.getByText(new RegExp(`^${lastMonth().replace("-", "\\.")}\\.01 ~`))
  ).toBeVisible();

  await page.getByRole("tab", { name: "내역" }).click();
  await expect(page.getByRole("button", { name: /지난달 지출/ })).toBeVisible();

  await page.getByRole("tab", { name: "통계" }).click();
  await page.getByRole("button", { name: "이번 달", exact: true }).click();
  await expect(page.getByRole("button", { name: /이번달 지출/ })).toBeVisible();
});

test("입금은 분류로 나누지 않는다", async ({ page, request }) => {
  await addEntry(request, token, {
    entryDate: today(),
    kind: "income",
    amount: 50_000,
    memo: "통장 충전",
  });
  await addEntry(request, token, { entryDate: today(), amount: 1_000, memo: "지출" });
  await openLedger(page, token);
  await expect(page.getByRole("button", { name: /통장 충전/ })).not.toContainText(
    "분류 없음"
  );

  await page.getByRole("tab", { name: "통계" }).click();
  const income = page.getByRole("button", { name: "입금", exact: true });
  await income.click();
  await expect(page.getByRole("button", { name: "급여", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /통장 충전/ })).toBeVisible();
  await page.getByRole("button", { name: "지출", exact: true }).click();
  await expect(
    page
      .getByRole("group", { name: "지출·입금 내역 분류" })
      .getByRole("button", { name: "식비", exact: true })
  ).toBeVisible();

  await page.getByRole("button", { name: "내역 추가" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "식비", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "입금", exact: true }).click();
  await expect(dialog.getByText("분류", { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "급여", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "취소" }).click();

  const settings = await openSettingsTab(page, "분류");
  await expect(settings.getByRole("button", { name: "식비 삭제" })).toBeVisible();
  await expect(settings.getByRole("button", { name: "급여 삭제" })).toHaveCount(0);
});

test("전체 탭과 큰 지출 TOP 8에서 분류로 거를 수 있다", async ({ page, request }) => {
  const categoryId = await getCategories(request, token);
  const add = (amount: number, memo: string, name: string) =>
    addEntry(request, token, {
      entryDate: today(),
      amount,
      memo,
      categoryId: categoryId(name),
    });
  await add(9_000, "점심", "식비");
  await add(8_000, "저녁", "식비");
  await add(5_000, "커피", "카페");
  await addEntry(request, token, {
    entryDate: today(),
    kind: "income",
    amount: 50_000,
    memo: "충전",
  });

  await openLedger(page, token);
  await page.getByRole("tab", { name: "통계" }).click();

  const chips = page.getByRole("group", { name: "지출·입금 내역 분류" });
  await chips.getByRole("button", { name: "식비", exact: true }).click();
  await expect(page.getByRole("button", { name: /점심/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /커피/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /충전/ })).toHaveCount(0);
  await expect(page.getByText("2건 · 지출 17,000원 · 입금 0원")).toBeVisible();

  await chips.getByRole("button", { name: "전체", exact: true }).click();
  await expect(page.getByRole("button", { name: /충전/ })).toBeVisible();

  await page.getByRole("button", { name: "입금", exact: true }).click();
  await expect(chips).toHaveCount(0);

  const top = page.getByRole("list", { name: "큰 지출 목록" });
  await expect(top).toContainText("점심");
  await expect(top).toContainText("커피");
  await page
    .getByRole("group", { name: "큰 지출 분류" })
    .getByRole("button", { name: "카페", exact: true })
    .click();
  await expect(top).toContainText("커피");
  await expect(top).not.toContainText("점심");
});

test("내역 창의 버튼 줄은 맨 아래에 붙고 입력칸이 그 뒤로 비치지 않는다", async ({
  page,
  request,
}) => {
  await addEntry(request, token, { entryDate: today(), amount: 1_000, memo: "긴 내역" });
  await page.setViewportSize({ width: 390, height: 600 });
  await openLedger(page, token);
  await page.getByRole("button", { name: /긴 내역/ }).click();

  const dialog = page.getByRole("dialog");
  const footer = dialog
    .getByRole("button", { name: "저장" })
    .locator("xpath=ancestor::div[contains(@class,'border-t')][1]");
  const tags = dialog.locator("#ledger-tags");
  await tags.waitFor();

  const box = async (locator: typeof dialog) => {
    const value = await locator.boundingBox();
    if (!value) throw new Error("요소를 찾을 수 없습니다.");
    return value;
  };

  const measureGap = async () => {
    const [outer, bar] = await Promise.all([box(dialog), box(footer)]);
    return outer.y + outer.height - (bar.y + bar.height);
  };

  expect(Math.abs(await measureGap())).toBeLessThanOrEqual(1);

  const [date, time] = await Promise.all([
    box(dialog.locator("#ledger-date")),
    box(dialog.locator("#ledger-time")),
  ]);
  expect(Math.abs(date.y - time.y)).toBeLessThanOrEqual(1);

  await tags.scrollIntoViewIfNeeded();
  const [field, bar] = await Promise.all([box(tags), box(footer)]);
  expect(field.y + field.height).toBeLessThanOrEqual(bar.y + 1);
  expect(Math.abs(await measureGap())).toBeLessThanOrEqual(1);
});

test("검색은 숨긴 예전 태그를 찾지 않는다", async ({ page, request }) => {
  await addEntry(request, token, {
    entryDate: today(),
    amount: 1_000,
    memo: "성수 산책",
    tags: "모임통장, 15:52, 데이트",
  });
  await openLedger(page, token);
  const search = page.getByRole("searchbox", { name: "내역 검색" });

  await search.fill("모임통장");
  await expect(page.getByText("일치하는 내역이 없어요")).toBeVisible();
  await search.fill("데이트");
  await expect(page.getByRole("button", { name: /성수 산책/ })).toBeVisible();
});

test("통계 내역은 10건만 먼저 보여 주고 더 보기로 펼친다", async ({ page, request }) => {
  for (let index = 0; index < 13; index += 1) {
    await addEntry(request, token, {
      entryDate: today(),
      amount: 1_000 + index,
      memo: `반복 지출 ${index}`,
    });
  }
  await openLedger(page, token);
  await page.getByRole("tab", { name: "통계" }).click();

  const rows = page.getByRole("button", { name: /반복 지출/ });
  await expect(rows).toHaveCount(10);
  await page.getByRole("button", { name: /더 보기 · 3건 남음/ }).click();
  await expect(rows).toHaveCount(13);
  await page.getByRole("button", { name: "접기" }).click();
  await expect(rows).toHaveCount(10);
  await expect(page.getByText("큰 지출 TOP 8")).toBeVisible();
});

test("전월 대비와 이번 달 예상 지출을 보여 준다", async ({ page, request }) => {
  const categoryId = await getCategories(request, token);
  await addEntry(request, token, {
    entryDate: today(),
    amount: 10_000,
    memo: "이번 달 식사",
    categoryId: categoryId("식비"),
  });
  await addEntry(request, token, {
    entryDate: `${lastMonth()}-01`,
    amount: 3_000,
    memo: "지난달 식사",
    categoryId: categoryId("식비"),
  });
  await request.put("/api/ledger/budget", {
    headers: authHeaders(token),
    data: { month: thisMonth(), totalBudget: 5_000, note: "", categories: [] },
  });

  await openLedger(page, token);
  await page.getByRole("tab", { name: "통계" }).click();

  await expect(page.getByText("전월 대비")).toBeVisible();
  await expect(page.getByText("+7,000원").first()).toBeVisible();
  await expect(page.getByRole("list", { name: "분류별 증감" })).toContainText("식비");
  await expect(page.getByText("이번 달 예상 지출")).toBeVisible();
  await expect(page.getByText("최근 1개월 평균")).toBeVisible();
  await expect(page.getByText(/초과 예상/)).toBeVisible();

  await page.getByRole("button", { name: "이전 달" }).click();
  await expect(page.getByText("비교할 지난달 기록이 없어요")).toBeVisible();
  await expect(page.getByText("이번 달 예상 지출")).toHaveCount(0);
});

test("예산 설정에서 최근 평균을 참고하고 채울 수 있다", async ({ page, request }) => {
  const categoryId = await getCategories(request, token);
  await addEntry(request, token, {
    entryDate: `${lastMonth()}-10`,
    amount: 12_345,
    memo: "지난달 지출",
    categoryId: categoryId("식비"),
  });
  await openLedger(page, token);
  const dialog = await openSettingsTab(page, "예산");
  await expect(dialog.getByText(/최근 1개월 평균 지출 12,345원/)).toBeVisible();
  await dialog.getByRole("button", { name: "평균으로 채우기" }).click();
  await expect(dialog.locator("#ledger-total-budget")).toHaveValue("12,000");
  await expect(dialog.getByRole("textbox", { name: "식비 예산" })).toHaveValue("12,000");
});

test("입금 용어로 통일되고 항공·렌트 분류를 쓸 수 있다", async ({ page, request }) => {
  await addEntry(request, token, {
    entryDate: today(),
    kind: "income",
    amount: 5_000,
    memo: "충전",
  });
  await openLedger(page, token);
  await page.getByRole("tab", { name: "통계" }).click();
  await expect(page.getByText("이제까지 총 입금·지출")).toBeVisible();
  await expect(page.getByText(/수입/)).toHaveCount(0);

  await page.getByRole("button", { name: "내역 추가" }).first().click();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "항공", exact: true })
  ).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "취소" }).click();

  const res = await request.post("/api/ledger/entries/bulk", {
    headers: authHeaders(token),
    data: {
      entries: [
        { entryDate: today(), kind: "expense", amount: 155_800, memo: "이스타항공(주)" },
      ],
    },
  });
  expect(res.status()).toBe(201);
  const { rows } = await pool.query(
    `select c.name from ledger_entries e join ledger_categories c on c.id = e.category_id
     where e.memo = '이스타항공(주)'`
  );
  expect(rows).toEqual([{ name: "항공" }]);
});

const tryLogin = (request: APIRequestContext, ip: string, password: string) =>
  request.post("/api/auth", {
    headers: { "x-real-ip": ip, "x-forwarded-for": ip },
    data: { password },
  });

test("로그인: 같은 IP에서 5번 틀리면 맞는 비밀번호도 막히고 다른 IP는 가능하다", async ({
  request,
}) => {
  const correct = process.env.SITE_PASSWORD ?? "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const res = await tryLogin(request, "203.0.113.1", "wrong");
    expect(res.status()).toBe(200);
    expect((await res.json()).error).toBe("비밀번호가 틀렸습니다.");
  }

  const blocked = await tryLogin(request, "203.0.113.1", correct);
  expect(blocked.status()).toBe(429);
  expect(blocked.headers()["retry-after"]).toBeTruthy();
  expect((await blocked.json()).token).toBeUndefined();

  const other = await tryLogin(request, "203.0.113.2", correct);
  expect((await other.json()).success).toBe(true);

  const { rows } = await pool.query(
    "select count(*)::int as count from auth_login_attempts where ip = '203.0.113.1'"
  );
  expect(rows[0].count).toBe(5);
});

test("로그인: 성공하면 그 IP의 실패 기록을 지운다", async ({ request }) => {
  const correct = process.env.SITE_PASSWORD ?? "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await tryLogin(request, "203.0.113.3", "wrong");
  }
  expect((await (await tryLogin(request, "203.0.113.3", correct)).json()).success).toBe(
    true
  );
  const { rows } = await pool.query(
    "select count(*)::int as count from auth_login_attempts where ip = '203.0.113.3'"
  );
  expect(rows[0].count).toBe(0);
});

test("로그인: 전체 실패가 30번이면 새 IP도 막힌다", async ({ request }) => {
  for (let group = 0; group < 6; group += 1) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await tryLogin(request, `198.51.100.${group}`, "wrong");
    }
  }
  const res = await tryLogin(request, "198.51.100.200", process.env.SITE_PASSWORD ?? "");
  expect(res.status()).toBe(429);
});

test("로그인: 동시에 몰린 요청도 한도를 크게 넘지 못한다", async ({ request }) => {
  const results = await Promise.all(
    Array.from({ length: 20 }, () => tryLogin(request, "203.0.113.9", "wrong"))
  );
  const compared = results.filter((res) => res.status() === 200).length;
  expect(compared).toBeLessThanOrEqual(5);
  expect(results.filter((res) => res.status() === 429).length).toBeGreaterThanOrEqual(15);
});

test("로그인 화면에 차단 안내가 나온다", async ({ page, request }) => {
  await page.setExtraHTTPHeaders({ "x-real-ip": "203.0.113.20" });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await tryLogin(request, "203.0.113.20", "wrong");
  }
  await page.goto("/ledger");
  await page.locator('input[type="password"]').fill("아무거나");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/로그인 시도가 너무 많아요/)).toBeVisible();
});

const createTrip = async (
  request: APIRequestContext,
  name: string,
  startDate: string,
  endDate: string
) => {
  const res = await request.post("/api/ledger/trips", {
    headers: authHeaders(token),
    data: { name, startDate, endDate },
  });
  if (!res.ok()) throw new Error(await res.text());
  return ((await res.json()) as { trip: { id: number } }).trip.id;
};

test("여행을 등록하고 기간 내역을 골라 연결한다", async ({ page, request }) => {
  const categoryId = await getCategories(request, token);
  await addEntry(request, token, {
    entryDate: today(),
    amount: 20_000,
    memo: "여행 저녁",
    categoryId: categoryId("식비"),
  });
  await addEntry(request, token, {
    entryDate: today(),
    amount: 5_000,
    memo: "일상 커피",
    categoryId: categoryId("카페"),
  });

  await openLedger(page, token);
  const dialog = await openSettingsTab(page, "여행");
  await dialog.getByRole("textbox", { name: "여행 이름" }).fill("춘천 여행");
  await dialog.getByLabel("여행 시작일").fill(today());
  await dialog.getByLabel("여행 종료일").fill(today());
  await dialog.getByRole("button", { name: "여행 추가" }).click();
  await expect(dialog.getByText("춘천 여행", { exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: "기간 내역 연결" }).click();
  const candidates = dialog.getByRole("list", { name: "춘천 여행 연결 후보" });
  await candidates.getByRole("checkbox", { name: /일상 커피/ }).uncheck();
  await dialog.getByRole("button", { name: "1건 연결" }).click();
  await expect(dialog.getByText(/1건 · 20,000원/)).toBeVisible();

  const { rows } = await pool.query(
    "select e.memo, t.name from ledger_entries e left join ledger_trips t on t.id = e.trip_id order by e.id"
  );
  expect(rows).toEqual([
    { memo: "여행 저녁", name: "춘천 여행" },
    { memo: "일상 커피", name: null },
  ]);
});

test("여행 리포트는 미리 결제한 내역까지 분류별로 보여 준다", async ({
  page,
  request,
}) => {
  const categoryId = await getCategories(request, token);
  const tripId = await createTrip(request, "제주 여행", today(), today());
  await addEntry(request, token, {
    entryDate: daysAgo(40),
    amount: 150_000,
    memo: "제주 항공권",
    categoryId: categoryId("항공"),
    tripId,
  });
  await addEntry(request, token, {
    entryDate: today(),
    amount: 30_000,
    memo: "흑돼지",
    categoryId: categoryId("식비"),
  });
  await addEntry(request, token, {
    entryDate: daysAgo(40),
    amount: 9_000,
    memo: "관계없는 지출",
    categoryId: categoryId("식비"),
  });

  await openLedger(page, token);
  await page.getByRole("tab", { name: "통계" }).click();
  await reportPeriod(page).getByRole("button", { name: "여행", exact: true }).click();

  await expect(page.getByText("제주 여행 총 지출")).toBeVisible();
  await expect(page.getByText("180,000원").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /제주 항공권/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /흑돼지/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /관계없는 지출/ })).toHaveCount(0);
  await expect(page.getByText("분류별 지출", { exact: true })).toBeVisible();
  await expect(page.getByText("잔액 추이", { exact: true })).toHaveCount(0);
  await expect(page.getByText("전월 대비")).toHaveCount(0);
});

test("내역 입력에서 날짜로 여행을 추천하고 해제할 수 있다", async ({ page, request }) => {
  await createTrip(request, "제주 여행", today(), today());
  await openLedger(page, token);

  const dialog = await fillNewEntry(page, { amount: "1000", memo: "여행 중 지출" });
  const chip = dialog.getByRole("button", { name: "제주 여행", exact: true });
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await dialog.locator("#ledger-date").fill(daysAgo(40));
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  await dialog.locator("#ledger-date").fill(today());
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  await dialog.locator("#ledger-date").fill(daysAgo(1));
  await chip.click();
  await dialog.getByRole("button", { name: "저장" }).click();
  await expect(page.getByText("기록을 저장했어요.")).toBeVisible();

  const { rows } = await pool.query(
    "select t.name from ledger_entries e join ledger_trips t on t.id = e.trip_id"
  );
  expect(rows).toEqual([{ name: "제주 여행" }]);
});

test("일괄 등록과 채팅 기록은 여행 기간이면 자동으로 묶는다", async ({ request }) => {
  const tripId = await createTrip(request, "제주 여행", today(), today());
  const res = await request.post("/api/ledger/agent", {
    headers: { "x-ledger-token": createLedgerAgentToken()! },
    data: {
      entries: [
        { amount: 1_000, memo: "기간 안" },
        { amount: 2_000, memo: "기간 밖", date: daysAgo(10) },
        { amount: 3_000, memo: "입금", kind: "income" },
      ],
    },
  });
  expect(res.status()).toBe(201);
  const { rows } = await pool.query(
    "select memo, trip_id from ledger_entries order by id"
  );
  expect(rows).toEqual([
    { memo: "기간 안", trip_id: tripId },
    { memo: "기간 밖", trip_id: null },
    { memo: "입금", trip_id: null },
  ]);
});

test("여행 제외는 리포트 합계만 줄이고 잔액은 그대로 둔다", async ({ page, request }) => {
  const tripId = await createTrip(request, "제주 여행", today(), today());
  await addEntry(request, token, {
    entryDate: today(),
    amount: 70_000,
    memo: "여행 지출",
    tripId,
  });
  await addEntry(request, token, {
    entryDate: today(),
    amount: 5_000,
    memo: "일상 지출",
    tripId: null,
  });

  const stats = async (query: string) => {
    const res = await request.get(`/api/ledger/stats?${query}`, {
      headers: authHeaders(token),
    });
    return (await res.json()).stats;
  };
  const range = `from=${today()}&to=${today()}`;
  const all = await stats(range);
  const without = await stats(`${range}&excludeTrips=1`);
  expect(all.summary.expense).toBe(75_000);
  expect(without.summary.expense).toBe(5_000);
  expect(without.daily.at(-1).balance).toBe(all.daily.at(-1).balance);

  await openLedger(page, token);
  await page.getByRole("tab", { name: "통계" }).click();
  await expect(page.getByText("총 지출 · 2건")).toBeVisible();
  await page.getByRole("button", { name: "여행 제외" }).click();
  await expect(page.getByText("총 지출 · 1건")).toBeVisible();
  await expect(page.getByRole("button", { name: /여행 지출/ })).toHaveCount(0);
});

test("여행을 지워도 내역과 분류는 남는다", async ({ page, request }) => {
  const categoryId = await getCategories(request, token);
  const tripId = await createTrip(request, "지울 여행", today(), today());
  await addEntry(request, token, {
    entryDate: today(),
    amount: 8_000,
    memo: "남을 내역",
    categoryId: categoryId("식비"),
    tripId,
  });

  await openLedger(page, token);
  const dialog = await openSettingsTab(page, "여행");
  await dialog.getByRole("button", { name: "지울 여행 삭제" }).click();
  await dialog.getByRole("button", { name: "여행 삭제", exact: true }).click();
  await expect(dialog.getByText("등록된 여행이 없어요")).toBeVisible();

  const { rows } = await pool.query(
    "select e.memo, e.trip_id, c.name from ledger_entries e join ledger_categories c on c.id = e.category_id"
  );
  expect(rows).toEqual([{ memo: "남을 내역", trip_id: null, name: "식비" }]);
});

test("여행 입력값을 검증한다", async ({ request }) => {
  const post = (data: object) =>
    request.post("/api/ledger/trips", { headers: authHeaders(token), data });
  expect((await post({ name: "", startDate: today(), endDate: today() })).status()).toBe(
    400
  );
  expect(
    (await post({ name: "역순", startDate: today(), endDate: daysAgo(1) })).status()
  ).toBe(400);
  expect(
    (await post({ name: "같은 이름", startDate: today(), endDate: today() })).ok()
  ).toBe(true);
  expect(
    (await post({ name: "같은 이름", startDate: today(), endDate: today() })).status()
  ).toBe(409);

  const missing = await request.get("/api/ledger/stats?trip=9999", {
    headers: authHeaders(token),
  });
  expect(missing.status()).toBe(400);
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

test("1년이 넘는 기록도 전체 통계가 열리고, 실패하면 다시 시도할 수 있다", async ({
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
  await expect(page.getByRole("button", { name: "다시 불러오기" })).toBeVisible();
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

  await expect
    .poll(async () => (await pool.query("select deleted_at from ledger_entries")).rows)
    .toEqual([{ deleted_at: null }]);
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
  await expect(page.getByRole("button", { name: /옛 지출/ })).toHaveCount(0);
  await reportPeriod(page).getByRole("button", { name: "전체", exact: true }).click();
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
