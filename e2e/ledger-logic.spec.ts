import { expect, test } from "@playwright/test";

import {
  parseLedgerNotifications,
  suggestLedgerCategoryName,
} from "../src/lib/ledger/notification";
import { getBudgetPace } from "../src/lib/ledger/pace";

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
