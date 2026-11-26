import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { lunarToSolar, solarToLunar } from "../src/lib/calendar/lunar";
import { kst } from "../src/lib/kst";
import { login, pool } from "./helpers";

const today = kst().format("YYYY-MM-DD");
const monthNum = Number(today.slice(5, 7));
const dayNum = Number(today.slice(8, 10));
const addDays = (date: string, days: number) =>
  kst(date).add(days, "day").format("YYYY-MM-DD");

const resetCalendar = async () => {
  await pool.query(
    "truncate calendar_events, calendar_diaries, calendar_templates, calendar_labels, calendar_settings restart identity cascade"
  );
};

const headers = (token: string) => ({ "x-auth-token": token });

const apiGet = async <T>(
  request: APIRequestContext,
  token: string,
  path: string
): Promise<T> => {
  const res = await request.get(path, { headers: headers(token) });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as T;
};

const createEvent = async (
  request: APIRequestContext,
  token: string,
  data: Record<string, unknown>
) => {
  const res = await request.post("/api/calendar/events", {
    headers: headers(token),
    data,
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as {
    events: Array<{ id: number; title: string; startAt: string; recurrence: string }>;
  };
};

const patchSettings = async (
  request: APIRequestContext,
  token: string,
  data: Record<string, unknown>
) => {
  const res = await request.patch("/api/calendar/settings", {
    headers: headers(token),
    data,
  });
  expect(res.status(), await res.text()).toBe(200);
};

const openCalendar = async (page: Page) => {
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "우리 캘린더" })).toBeVisible();
  await expect(page.getByTestId("month-grid")).toBeVisible();
};

const openTodaySheet = async (page: Page) => {
  await page.getByTestId(`day-cell-${today}`).click();
  await expect(page.getByTestId("day-sheet")).toBeVisible();
};

test.describe("우리 캘린더", () => {
  let token = "";

  test.beforeEach(async ({ page, request }) => {
    await resetCalendar();
    token = await login(request);
    await page.addInitScript((value) => {
      localStorage.setItem(
        "trable-auth",
        JSON.stringify({ state: { token: value }, version: 0 })
      );
    }, token);
  });

  test("CAL-01/06/07 월간 보기·오늘 표시·날짜 시트(음력)", async ({ page }) => {
    await openCalendar(page);
    await expect(page.getByTestId("today-cell")).toContainText(String(dayNum));
    await openTodaySheet(page);
    await expect(page.getByTestId("day-sheet-date")).toContainText(
      `${monthNum}월 ${dayNum}일`
    );
    await expect(page.getByTestId("day-sheet")).toContainText("음 ");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("EVT-02/03/05/10/11/12 일정 등록이 월간과 날짜 시트에 반영된다", async ({
    page,
    request,
  }) => {
    await openCalendar(page);
    await openTodaySheet(page);
    await page
      .getByTestId("day-sheet")
      .getByRole("button", { name: "일정 추가" })
      .click();
    await expect(page.getByTestId("event-dialog")).toBeVisible();
    await page.getByTestId("field-title").fill("테스트 데이트");
    await page.getByTestId("owner-together").click();
    await page.getByTestId("field-location").fill("성수동");
    await page.getByTestId("field-memo").fill("저녁 7시");
    await page.getByTestId("event-dialog").getByRole("button", { name: "분홍" }).click();
    await page.getByTestId("btn-save-event").click();
    await expect(page.getByTestId("event-dialog")).toBeHidden();
    await expect(page.getByTestId("day-sheet")).toContainText("테스트 데이트");
    await expect(page.getByTestId("day-sheet")).toContainText("둘 다");

    const found = await apiGet<{
      results: Array<{ event: { title: string; labelId: number } }>;
    }>(
      request,
      token,
      `/api/calendar/search?q=${encodeURIComponent("테스트")}&scope=all`
    );
    expect(found.results).toHaveLength(1);
    expect(found.results[0].event.labelId).not.toBeNull();
  });

  test("EVT-08 여러 날짜 일괄 등록은 같은 groupId로 저장된다", async ({ request }) => {
    const dates = [addDays(today, 1), addDays(today, 2)];
    const created = await createEvent(request, token, {
      title: "여러 날 약속",
      owner: "together",
      allDay: true,
      startDate: today,
      endDate: today,
      recurrence: "none",
      dates,
    });
    expect(created.events).toHaveLength(3);

    const rows = await pool.query<{ group_id: string | null }>(
      "select group_id from calendar_events where title = $1",
      ["여러 날 약속"]
    );
    expect(rows.rowCount).toBe(3);
    const groups = new Set(rows.rows.map((row) => row.group_id));
    expect(groups.size).toBe(1);
    expect([...groups][0]).toBeTruthy();
  });

  test("EVT-MULTI 여러 날 일정은 칸을 가로질러 한 줄로 이어진다", async ({
    page,
    request,
  }) => {
    const monthStart = kst(today).startOf("month");
    let firstMonday = monthStart;
    while (firstMonday.day() !== 1) firstMonday = firstMonday.add(1, "day");
    const startDate = firstMonday.format("YYYY-MM-DD");
    const endDate = firstMonday.add(2, "day").format("YYYY-MM-DD");

    const created = await createEvent(request, token, {
      title: "이어지는 일정",
      owner: "together",
      allDay: true,
      startDate,
      endDate,
      recurrence: "none",
    });
    const id = created.events[0].id;

    await openCalendar(page);
    const bar = page.locator(`[data-testid="event-bar"][data-event-id="${id}"]`);
    await expect(bar).toHaveCount(1);
    await expect(bar).toContainText("이어지는 일정");

    const startCell = await page.getByTestId(`day-cell-${startDate}`).boundingBox();
    const endCell = await page.getByTestId(`day-cell-${endDate}`).boundingBox();
    const barBox = await bar.boundingBox();
    expect(startCell).not.toBeNull();
    expect(endCell).not.toBeNull();
    expect(barBox).not.toBeNull();
    // 한 주 안의 3일 일정은 칸 3개 폭을 한 줄로 덮는다.
    expect(barBox!.width).toBeGreaterThan(startCell!.width * 2.5);
    expect(Math.abs(barBox!.x - startCell!.x)).toBeLessThan(3);
    expect(
      Math.abs(barBox!.x + barBox!.width - (endCell!.x + endCell!.width))
    ).toBeLessThan(3);
  });

  test("EVT-07/16 반복 일정은 월간에 여러 회차로 나오고 수정·삭제는 시리즈 전체", async ({
    page,
    request,
  }) => {
    const start = addDays(today, -21);
    const created = await createEvent(request, token, {
      title: "반복 스터디",
      owner: "together",
      allDay: false,
      startDate: start,
      startTime: "20:00",
      endDate: start,
      endTime: "21:30",
      recurrence: "weekly",
      recurrenceUntil: addDays(today, 28),
    });
    const id = created.events[0].id;

    await openCalendar(page);
    await openTodaySheet(page);
    await expect(page.getByTestId("day-sheet")).toContainText("반복 스터디");
    await page
      .getByTestId("day-sheet")
      .getByRole("button", { name: "일정 수정" })
      .first()
      .click();
    await page.getByTestId("field-title").fill("반복 스터디 변경");
    await page.getByTestId("btn-save-event").click();
    await expect(page.getByTestId("event-dialog")).toBeHidden();

    await expect
      .poll(async () => {
        const range = await apiGet<{ events: Array<{ title: string }> }>(
          request,
          token,
          `/api/calendar?from=${addDays(today, -21)}&to=${addDays(today, 28)}`
        );
        return range.events.filter((event) => event.title === "반복 스터디 변경").length;
      })
      .toBeGreaterThanOrEqual(4);

    await expect
      .poll(async () => {
        const res = await request.get("/api/calendar/day?date=" + today, {
          headers: headers(token),
        });
        const body = (await res.json()) as { events: Array<{ title: string }> };
        return body.events.filter((event) => event.title === "반복 스터디 변경").length;
      })
      .toBeGreaterThanOrEqual(1);

    await page
      .getByTestId("day-sheet")
      .getByRole("button", { name: "일정 수정" })
      .first()
      .click();
    await page.getByTestId("btn-delete-event").click();
    await expect(page.getByText("일정을 지울까요?").first()).toBeVisible();
    await page.getByRole("button", { name: "취소" }).last().click();
    await expect(page.getByTestId("event-dialog")).toBeVisible();
    await page.getByTestId("btn-delete-event").click();
    await page.getByRole("button", { name: "지우기" }).click();
    await expect(page.getByTestId("event-dialog")).toBeHidden();
    const rows = await pool.query("select 1 from calendar_events where id = $1", [id]);
    expect(rows.rowCount).toBe(0);
  });

  test("EVT-06 음력 일정은 양력 날짜로 환산되어 달력에 놓인다", async ({
    page,
    request,
  }) => {
    const lunar = solarToLunar(today);
    expect(lunar).not.toBeNull();
    const solar = lunarToSolar(lunar!);
    expect(solar).toBe(today);

    const created = await createEvent(request, token, {
      title: "음력 기념일",
      owner: "together",
      allDay: true,
      startDate: "2000-01-01",
      endDate: "2000-01-01",
      isLunar: true,
      lunar,
      recurrence: "none",
    });
    expect(kst(created.events[0].startAt).format("YYYY-MM-DD")).toBe(today);

    await openCalendar(page);
    await openTodaySheet(page);
    await expect(page.getByTestId("day-sheet")).toContainText("음력 기념일");
    await expect(page.getByTestId("day-sheet")).toContainText("음 ");
  });

  test("CAL-09 참여자 필터 없이 모든 일정이 함께 보인다", async ({ page, request }) => {
    for (const [title, owner] of [
      ["원찬 개인 일정", "wonchan"],
      ["예은 개인 일정", "yeeun"],
      ["둘 다 일정", "together"],
    ] as const) {
      await createEvent(request, token, {
        title,
        owner,
        allDay: true,
        startDate: today,
        endDate: today,
        recurrence: "none",
      });
    }

    await openCalendar(page);
    await expect(page.getByTestId("filter-menu")).toHaveCount(0);
    await openTodaySheet(page);
    await expect(page.getByTestId("day-sheet")).toContainText("원찬 개인 일정");
    await expect(page.getByTestId("day-sheet")).toContainText("예은 개인 일정");
    await expect(page.getByTestId("day-sheet")).toContainText("둘 다 일정");
  });

  test("CAL-02/03/04/05 뷰 전환과 월·구간 이동", async ({ page }) => {
    await openCalendar(page);

    await page.getByTestId("view-tab-twoweek").click();
    await expect(page.getByTestId("view-tab-twoweek")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    const isDesktop = (page.viewportSize()?.width ?? 0) >= 768;
    if (isDesktop) {
      await expect(page.getByTestId("two-week-grid")).toBeVisible();
      await expect(page.getByTestId(`twoweek-cell-${today}`)).toBeVisible();
    } else {
      await expect(page.getByTestId("two-week-list")).toBeVisible();
      await expect(page.getByTestId(`two-week-day-${today}`)).toBeVisible();
    }

    await page.getByTestId("view-tab-couple").click();
    await expect(page.getByTestId("couple-column-wonchan")).toBeVisible();
    await expect(page.getByTestId("couple-column-yeeun")).toBeVisible();
    await expect(page.getByText("둘 다", { exact: true }).first()).toBeVisible();

    await page.getByTestId("view-tab-month").click();
    const title = page.getByTestId("calendar-title");
    await expect(title).toContainText(`${monthNum}월`);
    await page.getByRole("button", { name: "이전 달" }).click();
    await expect(title).toContainText(
      kst(today).subtract(1, "month").format("YYYY년 M월")
    );
    await page.getByRole("button", { name: "오늘" }).click();
    await expect(title).toContainText(kst(today).format("YYYY년 M월"));
  });

  test("CAL-11 설정: 시작 요일·음력 월 표시·공휴일·시간 단위", async ({
    page,
    request,
  }) => {
    await openCalendar(page);

    await page.getByRole("button", { name: "캘린더 설정" }).click();
    await expect(page.getByTestId("settings-dialog")).toBeVisible();
    await page
      .getByTestId("setting-week-start")
      .getByRole("button", { name: "월요일" })
      .click();
    await expect
      .poll(async () => {
        const res = await apiGet<{ settings: { weekStart: number } }>(
          request,
          token,
          "/api/calendar/settings"
        );
        return res.settings.weekStart;
      })
      .toBe(1);
    await page.getByTestId("setting-lunar-month").click();
    const stepTrigger = page.getByTestId("setting-minute-step");
    await stepTrigger.click();
    await page.getByRole("option", { name: "30분" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("settings-dialog")).toBeHidden();

    const firstWeekday = page.getByTestId("month-grid").locator("div").first();
    await expect(firstWeekday).toHaveText("월");
    await expect(page.getByTestId(`day-cell-${today}`)).toContainText("음 ");

    await page.getByRole("button", { name: "다음 달" }).click();
    await expect(page.getByText("성탄절").first()).toBeVisible();
    await page.getByRole("button", { name: "캘린더 설정" }).click();
    await page.getByTestId("setting-holidays").click();
    await page.keyboard.press("Escape");
    await expect(page.getByText("성탄절")).toHaveCount(0);

    const year = await apiGet<{ settings: { minuteStep: number } }>(
      request,
      token,
      "/api/calendar/settings"
    );
    expect(year.settings.minuteStep).toBe(30);
  });

  test("DIA-02/03/04/05/06 일기를 쓰면 월간에 폴라로이드로 나온다", async ({
    page,
    request,
  }) => {
    await page.goto("/calendar");
    await openTodaySheet(page);
    await page
      .getByTestId("day-sheet")
      .getByRole("button", { name: "일기", exact: true })
      .click();
    await expect(page.getByTestId("diary-dialog")).toBeVisible();
    await page.getByTestId("diary-author-yeeun").click();
    await page.getByTestId("field-diary-body").fill("오늘의 테스트 일기");
    await page
      .getByTestId("field-diary-photo")
      .setInputFiles("e2e/fixtures/calendar-photo.png");
    await expect(page.getByTestId("diary-dialog").locator("img").first()).toBeVisible();
    await page.getByTestId("btn-save-diary").click();
    await expect(page.getByTestId("diary-dialog")).toBeHidden();
    await page.getByTestId("day-sheet").getByRole("button", { name: "Close" }).click();
    await expect(page.getByTestId("day-sheet")).toBeHidden();

    const day = await apiGet<{
      diaries: Array<{
        id: number;
        author: string;
        body: string;
        photos: Array<{ thumb: string }>;
      }>;
    }>(request, token, `/api/calendar/day?date=${today}`);
    expect(day.diaries).toHaveLength(1);
    expect(day.diaries[0].author).toBe("yeeun");
    expect(day.diaries[0].body).toBe("오늘의 테스트 일기");
    expect(day.diaries[0].photos).toHaveLength(1);
    expect(day.diaries[0].photos[0].thumb.startsWith("data:image/jpeg")).toBe(true);
    const diaryId = day.diaries[0].id;

    // 일기 탭 대신 월간 칸에 폴라로이드로 보인다.
    await expect(page.getByTestId("view-tab-diary")).toHaveCount(0);
    await expect(page.getByTestId(`day-cell-${today}`).locator("img")).toHaveCount(1);

    await page.goto("/calendar/diary");
    await expect(page.getByRole("heading", { name: "일기 페이지" })).toBeVisible();
    await expect(page.getByTestId("diary-page-daily")).toContainText(
      "오늘의 테스트 일기"
    );
    await page.getByRole("tab", { name: "한달 기록" }).click();
    await expect(page.getByTestId("diary-page-monthly")).toContainText(
      "오늘의 테스트 일기"
    );
    await page.getByRole("tab", { name: "4컷 하루" }).click();
    await expect(page.getByTestId("diary-page-fourcut").locator("img")).toHaveCount(1);

    // 삭제는 확인 모달을 거친다. 취소하면 남고, 확인하면 지워진다.
    await page.goto("/calendar");
    await openTodaySheet(page);
    await page
      .getByTestId("day-sheet")
      .getByRole("button", { name: "일기", exact: true })
      .click();
    await page.getByTestId("diary-dialog").waitFor();
    await page.getByTestId("diary-author-yeeun").click();
    await page
      .getByTestId("diary-dialog")
      .getByRole("button", { name: "삭제", exact: true })
      .click();
    await expect(page.getByText("일기를 지울까요?")).toBeVisible();
    await page.getByRole("button", { name: "취소" }).last().click();
    await expect(page.getByTestId("diary-dialog")).toBeVisible();
    await page
      .getByTestId("diary-dialog")
      .getByRole("button", { name: "삭제", exact: true })
      .click();
    await page.getByRole("button", { name: "지우기" }).click();
    await expect(page.getByTestId("diary-dialog")).toBeHidden();
    const remaining = await apiGet<{ diaries: Array<{ id: number }> }>(
      request,
      token,
      `/api/calendar/day?date=${today}`
    );
    expect(remaining.diaries.find((diary) => diary.id === diaryId)).toBeUndefined();
  });

  test("DIA-06/07 Plus가 꺼지면 일기 페이지가 잠긴다", async ({ page, request }) => {
    await patchSettings(request, token, { plus: false });
    await page.goto("/calendar");
    await expect(page.getByTestId("view-tab-diary")).toHaveCount(0);

    await page.goto("/calendar/diary");
    await expect(page.getByText("Plus 전용").first()).toBeVisible();
    await page.getByRole("button", { name: "Plus 켜기" }).click();
    await expect(page.getByTestId("diary-page-daily")).toBeVisible();

    const settings = await apiGet<{ settings: { plus: boolean } }>(
      request,
      token,
      "/api/calendar/settings"
    );
    expect(settings.settings.plus).toBe(true);
  });

  test("DIA-08 같은 날 두 사람이 각자 일기를 쓸 수 있다", async ({ request }) => {
    const base = {
      date: today,
      photos: [] as Array<Record<string, unknown>>,
    };
    for (const [author, body] of [
      ["wonchan", "원찬의 일기"],
      ["yeeun", "예은의 일기"],
    ] as const) {
      const res = await request.post("/api/calendar/diaries", {
        headers: headers(token),
        data: { ...base, author, body },
      });
      expect(res.status(), await res.text()).toBe(200);
    }
    const day = await apiGet<{ diaries: Array<{ author: string; body: string }> }>(
      request,
      token,
      `/api/calendar/day?date=${today}`
    );
    expect(day.diaries.map((diary) => diary.author).sort()).toEqual(["wonchan", "yeeun"]);
    expect(day.diaries.find((diary) => diary.author === "wonchan")?.body).toBe(
      "원찬의 일기"
    );
    expect(day.diaries.find((diary) => diary.author === "yeeun")?.body).toBe(
      "예은의 일기"
    );
  });

  test("DIA-09 일기 댓글이 표시되고 편집기 저장 후에도 남는다", async ({
    page,
    request,
  }) => {
    const comments = [
      {
        id: "comment-1",
        author: "wonchan",
        body: "첫 댓글",
        createdAt: "2026-04-03T10:00:00+09:00",
      },
      {
        id: "comment-2",
        author: "yeeun",
        body: "두 번째 댓글",
        createdAt: "2026-04-03T11:30:00+09:00",
      },
    ];
    const created = await request.post("/api/calendar/diaries", {
      headers: headers(token),
      data: {
        date: today,
        author: "wonchan",
        body: "댓글 테스트 일기",
        photos: [],
        comments,
      },
    });
    expect(created.status(), await created.text()).toBe(200);

    await openCalendar(page);
    await openTodaySheet(page);
    const sheetComments = page.getByTestId("day-sheet").getByTestId("diary-comments");
    await expect(sheetComments).toContainText("댓글 2");
    await expect(sheetComments.getByTestId("diary-comment")).toHaveCount(2);
    await expect(sheetComments).toContainText("첫 댓글");
    await expect(sheetComments).toContainText("두 번째 댓글");

    // 편집기는 comments 없이 저장한다. 기존 댓글은 지워지지 않아야 한다.
    await page
      .getByTestId("day-sheet")
      .getByRole("button", { name: "일기", exact: true })
      .click();
    await expect(page.getByTestId("diary-dialog")).toBeVisible();
    await page.getByTestId("field-diary-body").fill("댓글 테스트 일기 수정");
    await page.getByTestId("btn-save-diary").click();
    await expect(page.getByTestId("diary-dialog")).toBeHidden();

    const day = await apiGet<{
      diaries: Array<{ author: string; body: string; comments: Array<{ body: string }> }>;
    }>(request, token, `/api/calendar/diaries?date=${today}`);
    const diary = day.diaries.find((item) => item.author === "wonchan");
    expect(diary?.body).toBe("댓글 테스트 일기 수정");
    expect(diary?.comments.map((comment) => comment.body)).toEqual([
      "첫 댓글",
      "두 번째 댓글",
    ]);

    await page.goto("/calendar/diary");
    const dailyComments = page
      .getByTestId("diary-page-daily")
      .getByTestId("diary-comments");
    await expect(dailyComments.getByTestId("diary-comment")).toHaveCount(2);
    await expect(dailyComments).toContainText("첫 댓글");
  });

  test("CAL-10 검색과 범위 필터, 결과에서 날짜 시트 열기", async ({ page, request }) => {
    const date = addDays(today, 4);
    await createEvent(request, token, {
      title: "치과 정기검진",
      owner: "wonchan",
      allDay: false,
      startDate: date,
      startTime: "14:00",
      endDate: date,
      endTime: "15:00",
      recurrence: "none",
    });

    await openCalendar(page);
    await page.getByRole("button", { name: "일정 검색" }).click();
    await page.getByTestId("search-input").fill("치과");
    await expect(page.getByTestId(/search-result-/).first()).toBeVisible();

    await page.getByRole("combobox", { name: "검색 범위" }).click();
    await page.getByRole("option", { name: "원찬" }).click();
    await expect(
      page.getByTestId("search-panel").getByText("치과 정기검진")
    ).toBeVisible();

    await page.getByRole("combobox", { name: "검색 범위" }).click();
    await page.getByRole("option", { name: "둘 다" }).click();
    await expect(
      page.getByTestId("search-panel").getByText("검색 결과가 없어요.")
    ).toBeVisible();
  });

  test("EVT-10/13 라벨 관리와 템플릿 저장·불러오기", async ({ page, request }) => {
    await openCalendar(page);
    await openTodaySheet(page);
    await page
      .getByTestId("day-sheet")
      .getByRole("button", { name: "일정 추가" })
      .click();
    await page.getByTestId("field-title").fill("템플릿 일정");

    await page
      .getByTestId("event-dialog")
      .getByRole("button", { name: "라벨 관리" })
      .click();
    await expect(page.getByTestId("label-dialog")).toBeVisible();
    await page.getByLabel("새 라벨 이름").fill("여행");
    await page.getByTestId("label-dialog").getByRole("radio", { name: "민트" }).click();
    await page.getByTestId("btn-add-label").click();
    await expect(
      page.getByTestId("label-dialog").getByRole("textbox", { name: "여행 이름" })
    ).toBeVisible();
    await page.getByTestId("label-dialog").getByRole("button", { name: "Close" }).click();
    await expect(page.getByTestId("label-dialog")).toBeHidden();

    await page
      .getByTestId("event-dialog")
      .getByRole("button", { name: "현재 내용을 템플릿으로 저장" })
      .click();
    await page.getByPlaceholder("예: 주말 데이트").fill("주말 약속");
    await page.getByRole("button", { name: "저장", exact: true }).last().click();
    await expect(page.getByTestId(/template-chip-/).first()).toBeVisible();

    await page.getByTestId("field-title").fill("다른 일정");
    await page
      .getByTestId(/template-chip-/)
      .first()
      .click();
    await expect(page.getByTestId("field-title")).toHaveValue("템플릿 일정");

    const templates = await apiGet<{ templates: Array<{ name: string }> }>(
      request,
      token,
      "/api/calendar/templates"
    );
    expect(templates.templates.some((template) => template.name === "주말 약속")).toBe(
      true
    );
  });

  test("360px에서 모든 뷰·시트에 가로 넘침이 없다", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    const check = async (label: string) => {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, label).toBeLessThanOrEqual(0);
    };

    await openCalendar(page);
    await check("month");
    await page.getByTestId("view-tab-twoweek").click();
    await check("twoweek");
    await page.getByTestId("view-tab-couple").click();
    await check("couple");
    await page.getByTestId("view-tab-month").click();
    await openTodaySheet(page);
    await check("day-sheet");
    await page
      .getByTestId("day-sheet")
      .getByRole("button", { name: "일정 추가" })
      .click();
    await check("event-dialog");
  });
});
