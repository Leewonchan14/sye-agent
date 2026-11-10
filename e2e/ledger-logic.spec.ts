import { expect, test } from "@playwright/test";

import {
  exceedsLoginLimit,
  getLoginBlockSeconds,
  LOGIN_WINDOW_MS,
} from "../src/lib/auth-rate-limit";
import { comparableMonthRange, compareLedgerPeriods } from "../src/lib/ledger/compare";
import {
  buildFixedCostInsight,
  detectFixedMemos,
  findUnusualSpending,
  type InsightEntry,
} from "../src/lib/ledger/insights";
import {
  parseLedgerNotifications,
  suggestLedgerCategoryName,
} from "../src/lib/ledger/notification";
import { getBudgetPace, projectMonthExpense } from "../src/lib/ledger/pace";
import { lastCompletedWeek, parseRecapComment } from "../src/lib/ledger/recap";

test.describe("은행 알림 해석", () => {
  const today = "2026-11-08";

  test("출금 알림에서 금액, 날짜, 시각, 내용을 읽는다", () => {
    const [item] = parseLedgerNotifications(
      "[Web발신] 11/08 15:52 토스뱅크 모임통장 출금 12,000원 스타벅스 잔액 300,000원",
      today
    );
    expect(item).toEqual({
      entryDate: "2026-11-08",
      entryTime: "15:52",
      kind: "expense",
      amount: 12000,
      memo: "스타벅스",
    });
  });

  test("입금과 잔액 금액을 구분한다", () => {
    const [item] = parseLedgerNotifications(
      "11월 7일 18:41 입금 50,000원 이원찬 잔액 1,000원",
      today
    );
    expect(item).toMatchObject({
      entryDate: "2026-11-07",
      kind: "income",
      amount: 50000,
      memo: "이원찬",
    });
  });

  test("빈 줄이 있든 없든 여러 알림을 나눈다", () => {
    const blank = parseLedgerNotifications(
      "출금 1,000원 김밥\n\n출금 2,000원 커피",
      today
    );
    const noBlank = parseLedgerNotifications(
      "출금 1,000원 김밥\n출금 2,000원 커피",
      today
    );
    expect(blank.map((item) => item.amount)).toEqual([1000, 2000]);
    expect(noBlank.map((item) => item.amount)).toEqual([1000, 2000]);
  });

  test("여러 줄로 나뉜 알림 하나는 한 건으로 읽는다", () => {
    const items = parseLedgerNotifications("토스뱅크 출금\n12,000원\n스타벅스", today);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ amount: 12000, memo: "스타벅스" });
  });

  test("올해 기준 미래 날짜는 작년으로 본다", () => {
    const [item] = parseLedgerNotifications("12/30 출금 1,000원 김밥", "2027-01-02");
    expect(item.entryDate).toBe("2026-12-30");
  });

  test("금액이 없거나 잔액만 있으면 건너뛴다", () => {
    expect(parseLedgerNotifications("안녕하세요\n\n잔액 1,000원", today)).toEqual([]);
  });

  test("내용으로 지출 분류를 추측한다", () => {
    expect(suggestLedgerCategoryName("스타벅스 성수점", "expense")).toBe("카페");
    expect(suggestLedgerCategoryName("KTX 예매", "expense")).toBe("교통");
    expect(suggestLedgerCategoryName("스타벅스", "income")).toBeNull();
    expect(suggestLedgerCategoryName("이름모를가게", "expense")).toBeNull();
  });
});

test.describe("예산 속도", () => {
  const base = { month: "2026-11", today: "2026-11-08", budget: 800_000 };

  test("지금 속도가 예산을 넘으면 초과 예상을 알려 준다", () => {
    const pace = getBudgetPace({ ...base, spent: 558_922 });
    expect(pace).toMatchObject({
      state: "current",
      status: "risk",
      daysLeft: 23,
      dailyAllowance: 10_481,
      projected: 2_095_958,
      projectedOver: 1_295_958,
    });
  });

  test("속도가 여유 있으면 ok", () => {
    expect(getBudgetPace({ ...base, spent: 100_000 })).toMatchObject({ status: "ok" });
  });

  test("이미 넘었으면 over이고 하루 사용 가능액은 0", () => {
    expect(getBudgetPace({ ...base, spent: 900_000 })).toMatchObject({
      status: "over",
      dailyAllowance: 0,
    });
  });

  test("예산이 없으면 null, 다른 달은 속도를 계산하지 않는다", () => {
    expect(getBudgetPace({ ...base, budget: null, spent: 1 })).toBeNull();
    expect(getBudgetPace({ ...base, month: "2026-10", spent: 1 })).toEqual({
      state: "other-month",
    });
  });
});

test.describe("로그인 제한 계산", () => {
  const now = 1_000_000_000;
  const minutes = (value: number) => value * 60 * 1000;
  const fails = (ip: string, ...ago: number[]) =>
    ago.map((value) => ({ ip, at: now - minutes(value) }));

  test("4번까지는 막지 않는다", () => {
    expect(getLoginBlockSeconds(fails("a", 1, 2, 3, 4), "a", now)).toBe(0);
  });

  test("15분 안에 5번이면 마지막 실패부터 15분 막는다", () => {
    expect(getLoginBlockSeconds(fails("a", 1, 2, 3, 4, 5), "a", now)).toBe(14 * 60);
  });

  test("차단 시간이 지나면 다시 시도할 수 있다", () => {
    expect(getLoginBlockSeconds(fails("a", 16, 17, 18, 19, 20), "a", now)).toBe(0);
  });

  test("15분에 걸쳐 흩어진 실패는 막지 않는다", () => {
    expect(getLoginBlockSeconds(fails("a", 1, 6, 11, 16, 21), "a", now)).toBe(0);
  });

  test("다른 IP의 실패는 IP 한도에 세지 않지만 전체 한도에는 센다", () => {
    expect(getLoginBlockSeconds(fails("b", 1, 2, 3, 4, 5), "a", now)).toBe(0);
    const many = Array.from({ length: 6 }, (_, group) =>
      fails(`ip${group}`, 1, 2, 3, 4)
    ).flat();
    expect(getLoginBlockSeconds(many.slice(0, 29), "z", now)).toBe(0);
    const thirty = Array.from({ length: 30 }, (_, index) => ({
      ip: `ip${index}`,
      at: now - 1000 * (index + 1),
    }));
    expect(getLoginBlockSeconds(thirty, "z", now)).toBeGreaterThan(0);
  });

  test("동시 요청으로 한도를 넘었는지 판단한다", () => {
    expect(exceedsLoginLimit(fails("a", 1, 2, 3, 4, 5), "a", now)).toBe(false);
    expect(exceedsLoginLimit(fails("a", 1, 2, 3, 4, 5, 6), "a", now)).toBe(true);
    expect(
      exceedsLoginLimit(
        [{ ip: "a", at: now - LOGIN_WINDOW_MS - 1 }, ...fails("a", 1, 2, 3, 4, 5)],
        "a",
        now
      )
    ).toBe(false);
  });
});

test.describe("전월 대비", () => {
  test("진행 중인 달은 지난달의 같은 날까지 비교한다", () => {
    expect(comparableMonthRange("2026-11", "2026-11-08")).toEqual({
      from: "2026-10-01",
      to: "2026-10-08",
    });
  });

  test("지난달이 더 짧으면 마지막 날까지 비교한다", () => {
    expect(comparableMonthRange("2026-03", "2026-03-31")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
  });

  test("끝난 달은 지난달 전체와 비교한다", () => {
    expect(comparableMonthRange("2026-10", "2026-11-08")).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });

  test("증감을 계산하고 사라진 분류도 포함한다", () => {
    const row = (categoryId: number, name: string, amount: number) => ({
      categoryId,
      name,
      icon: "tag" as const,
      color: "neutral" as const,
      amount,
    });
    const result = compareLedgerPeriods(
      { summary: { income: 0, expense: 150 }, byCategory: [row(1, "식비", 150)] },
      {
        summary: { income: 10, expense: 100 },
        byCategory: [row(1, "식비", 70), row(2, "카페", 30)],
      }
    );
    expect(result.expense).toMatchObject({ diff: 50, pct: 50 });
    expect(result.income).toMatchObject({ diff: -10, pct: -100 });
    expect(result.categories.map((c) => [c.name, c.diff])).toEqual([
      ["식비", 80],
      ["카페", -30],
    ]);
  });

  test("지난달 금액이 0이면 비율을 계산하지 않는다", () => {
    const result = compareLedgerPeriods(
      { summary: { income: 0, expense: 10 }, byCategory: [] },
      { summary: { income: 0, expense: 0 }, byCategory: [] }
    );
    expect(result.expense.pct).toBeNull();
    expect(result.hasPrevious).toBe(false);
  });
});

test.describe("예상 지출", () => {
  test("진행 중인 달을 지금 속도로 계산하고 다른 달은 null이다", () => {
    expect(
      projectMonthExpense({ month: "2026-11", today: "2026-11-10", spent: 100_000 })
    ).toEqual({ projected: 300_000, day: 10, daysInMonth: 30 });
    expect(
      projectMonthExpense({ month: "2026-10", today: "2026-11-10", spent: 100_000 })
    ).toBeNull();
  });
});

test("항공과 렌터카는 각각의 분류로 추측한다", () => {
  expect(suggestLedgerCategoryName("이스타항공(주)", "expense")).toBe("항공");
  expect(suggestLedgerCategoryName("토스페이_렌터카_나이스", "expense")).toBe("렌트");
});

test("주간 리캡 기간: 월요일과 일요일 모두 끝난 월~일 주를 고른다", () => {
  expect(lastCompletedWeek("2026-11-09")).toEqual({
    from: "2026-11-02",
    to: "2026-11-08",
    previousFrom: "2026-10-26",
    previousTo: "2026-11-01",
  });
  expect(lastCompletedWeek("2026-11-08").from).toBe("2026-10-26");
  expect(lastCompletedWeek("2026-11-08").to).toBe("2026-11-01");
});

test("주간 리캡 코멘트: 숫자가 있거나 너무 길면 버린다", () => {
  expect(parseRecapComment('  "이번 주는 카페를\n많이 갔네!"  ')).toBe(
    "이번 주는 카페를 많이 갔네!"
  );
  expect(parseRecapComment("이번 주는 3만원 썼어")).toBeNull();
  expect(parseRecapComment("   ")).toBeNull();
  expect(parseRecapComment("가".repeat(201))).toBeNull();
});

test.describe("인사이트", () => {
  let nextId = 1;
  const entry = (
    entryDate: string,
    amount: number,
    fields: Partial<InsightEntry> = {}
  ): InsightEntry => ({
    id: nextId++,
    entryDate,
    kind: "expense",
    amount,
    categoryId: 1,
    recurringId: null,
    tripId: null,
    memo: "",
    ...fields,
  });
  const categories = [
    { id: 1, name: "식비" },
    { id: 2, name: "쇼핑" },
    { id: 3, name: "의료" },
  ];
  const months = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];

  test("분류 지출을 최근 6개월 중앙값과 비교해 크게 늘거나 준 곳만 고른다", () => {
    const entries = [
      ...months.flatMap((m) => [
        entry(`${m}-03`, 200_000, { categoryId: 1 }),
        entry(`${m}-05`, 100_000, { categoryId: 2 }),
      ]),
      entry("2026-10-03", 420_000, { categoryId: 1 }),
      entry("2026-10-05", 20_000, { categoryId: 2 }),
      entry("2026-10-07", 80_000, { categoryId: 3 }),
      // 입금은 지출 비교에 들어가지 않는다
      entry("2026-10-08", 1_000_000, { kind: "income", categoryId: null }),
    ];
    const result = findUnusualSpending({
      month: "2026-10",
      today: "2026-11-10",
      entries,
      categories,
    });

    expect(result.throughDay).toBeNull();
    expect(result.baselineMonths).toEqual(months);
    expect(result.total).toEqual({
      current: 520_000,
      usual: 300_000,
      diff: 220_000,
      ratio: 1.73,
    });
    expect(result.categories.map((c) => [c.name, c.direction, c.diff, c.ratio])).toEqual([
      ["식비", "up", 220_000, 2.1],
      ["의료", "up", 80_000, null],
      ["쇼핑", "down", -80_000, 0.2],
    ]);
  });

  test("진행 중인 달은 지난 달들도 같은 날까지만 비교하고, 기록 전 달은 빼며 3개월 미만이면 비교하지 않는다", () => {
    const entries = [
      ...["2026-08", "2026-09", "2026-10"].flatMap((m) => [
        entry(`${m}-02`, 100_000),
        entry(`${m}-25`, 500_000),
      ]),
      entry("2026-11-03", 110_000),
    ];
    const result = findUnusualSpending({
      month: "2026-11",
      today: "2026-11-10",
      entries,
      categories,
    });
    expect(result.throughDay).toBe(10);
    expect(result.baselineMonths).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(result.total?.usual).toBe(100_000);
    expect(result.categories).toEqual([]);

    const short = findUnusualSpending({
      month: "2026-11",
      today: "2026-11-10",
      entries: entries.filter((e) => e.entryDate >= "2026-09"),
      categories,
    });
    expect(short.total).toBeNull();
    expect(short.baselineMonths).toEqual([]);
  });

  test("같은 분류의 과거 내역보다 유난히 큰 내역을 고른다", () => {
    const history = months.flatMap((m) => [
      entry(`${m}-01`, 9_000),
      entry(`${m}-02`, 10_000),
    ]);
    const big = entry("2026-10-15", 48_000, { memo: "회식", tripId: 3 });
    const normal = entry("2026-10-16", 11_000);
    const small = entry("2026-10-17", 25_000, { categoryId: 2, memo: "기록 적은 분류" });
    const result = findUnusualSpending({
      month: "2026-10",
      today: "2026-11-10",
      entries: [...history, big, normal, small],
      categories,
    });
    expect(result.entries).toEqual([
      {
        id: big.id,
        entryDate: "2026-10-15",
        memo: "회식",
        amount: 48_000,
        categoryId: 1,
        groupName: "식비",
        usual: 9_500,
        ratio: 5.1,
        historyCount: 12,
        onTrip: true,
      },
    ]);
  });

  test("고정비: 반복 거래와, 연속 3개월 한 달 한 번 비슷한 금액인 내용", () => {
    const entries = [
      // 요금이 바뀌어도 연속 3개월 비슷했던 적이 있으면 고정비
      entry("2026-01-21", 90_000, { memo: "통신비" }),
      entry("2026-03-21", 55_000, { memo: "통신비" }),
      entry("2026-04-21", 55_000, { memo: "통신비" }),
      entry("2026-05-21", 56_000, { memo: "통신비 " }),
      // 한 달에 여러 번 사면 고정비가 아니다
      ...["2026-03", "2026-04", "2026-05"].flatMap((m) => [
        entry(`${m}-01`, 5_000, { memo: "커피" }),
        entry(`${m}-09`, 5_000, { memo: "커피" }),
      ]),
      // 금액이 들쭉날쭉하면 고정비가 아니다
      entry("2026-03-10", 10_000, { memo: "쿠팡" }),
      entry("2026-04-10", 80_000, { memo: "쿠팡" }),
      entry("2026-05-10", 30_000, { memo: "쿠팡" }),
      // 두 달 띄엄띄엄이면 아니다
      entry("2026-01-05", 20_000, { memo: "미용실" }),
      entry("2026-03-05", 20_000, { memo: "미용실" }),
      entry("2026-05-05", 20_000, { memo: "미용실" }),
      entry("2026-05-06", 9_900, { memo: "자동 생성", recurringId: 7 }),
      // 매달 들어오는 입금은 고정비가 아니다
      ...["2026-03", "2026-04", "2026-05"].map((m) =>
        entry(`${m}-25`, 300_000, { kind: "income", memo: "회비" })
      ),
    ];
    expect([...detectFixedMemos(entries, ["넷플릭스"])].sort()).toEqual([
      ["넷플릭스", "recurring"],
      ["자동 생성", "recurring"],
      ["통신비", "pattern"],
    ]);
  });

  test("고정비 비중은 지출 중 고정비 몫, 남긴 비율은 입금이 있을 때만", () => {
    const entries = [
      entry("2026-09-10", 1_000_000, { kind: "income", categoryId: null }),
      entry("2026-09-13", 600_000),
      entry("2026-10-21", 55_000, { memo: "통신비" }),
      entry("2026-10-22", 345_000),
      entry("2026-11-01", 13_500, { memo: "넷플릭스" }),
      entry("2026-11-02", 200_000, { kind: "income", categoryId: null }),
      entry("2026-11-03", 286_500),
    ];
    const result = buildFixedCostInsight({
      month: "2026-11",
      entries,
      recurringMemos: ["통신비", "넷플릭스"],
    });

    // 첫 기록 달부터만 센다
    expect(result.months.map((m) => m.month)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(result.months[0]).toMatchObject({
      income: 1_000_000,
      expense: 600_000,
      fixed: 0,
      fixedShare: 0,
      keptRate: 40,
    });
    expect(result.months[1]).toMatchObject({
      income: 0,
      expense: 400_000,
      fixed: 55_000,
      fixedShare: 13.8,
      keptRate: null,
    });
    // 입금보다 더 쓰면 음수
    expect(result.months[2]).toMatchObject({ fixed: 13_500, keptRate: -50 });
    expect(result.fixedItems).toEqual([
      { memo: "넷플릭스", amount: 13_500, count: 1, reason: "recurring" },
    ]);
  });
});
