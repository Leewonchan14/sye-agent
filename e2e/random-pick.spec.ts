import { expect, test, type Page } from "@playwright/test";

import { authHeaders, login, pool } from "./helpers";

/**
 * 골라 줘(/pick) — 후보 중 하나를 서버에서 무작위로 뽑는다.
 * 돌림판 애니메이션을 기다리지 않도록 reduced motion으로 연다(짧게 돌고 멈춘다).
 */

interface PickView {
  id: number;
  title: string;
  options: { id: number; label: string }[];
  resultOptionId: number;
  rerollsLeft: number;
  status: "drawn" | "decided";
}

const resultLabel = (pick: PickView) =>
  pick.options.find((o) => o.id === pick.resultOptionId)?.label;

const resetPicks = async () => {
  await pool.query("truncate picks, pick_options restart identity cascade");
};

const openPick = async (page: Page, token: string, path = "/pick") => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript((value) => {
    localStorage.setItem(
      "trable-auth",
      JSON.stringify({ state: { token: value }, version: 0 })
    );
  }, token);
  await page.goto(path);
  await page.getByRole("heading", { name: "골라 줘" }).waitFor();
};

/** 바늘(12시) 바로 아래에 있는 돌림판 칸의 후보 이름 */
const labelUnderPointer = (page: Page) =>
  page.getByRole("img", { name: /^룰렛/ }).evaluate((wheel) => {
    const box = wheel.getBoundingClientRect();
    const hit = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height * 0.2
    );
    return hit?.closest("[data-slice]")?.getAttribute("data-slice") ?? null;
  });

test.describe("골라 줘 API", () => {
  test.beforeEach(resetPicks);

  test("로그인하지 않으면 뽑을 수 없다", async ({ request }) => {
    const res = await request.post("/api/picks", {
      data: { options: ["a", "b"] },
    });
    expect(res.status()).toBe(401);
  });

  test("후보를 다듬고 겹치는 건 빼고, 그중 하나를 뽑아 저장한다", async ({ request }) => {
    const token = await login(request);
    const res = await request.post("/api/picks", {
      headers: authHeaders(token),
      data: { title: " 저녁 뭐 먹지? ", options: [" 국밥 ", "돈까스", "국밥", "파스타"] },
    });
    expect(res.status()).toBe(201);
    const pick = (await res.json()) as PickView;
    expect(pick.title).toBe("저녁 뭐 먹지?");
    expect(pick.options.map((o) => o.label)).toEqual(["국밥", "돈까스", "파스타"]);
    expect(pick.options.map((o) => o.id)).toContain(pick.resultOptionId);
    expect(pick.rerollsLeft).toBe(1);
    expect(pick.status).toBe("drawn");

    const again = (await (
      await request.get(`/api/picks/${pick.id}`, { headers: authHeaders(token) })
    ).json()) as PickView;
    expect(again.resultOptionId).toBe(pick.resultOptionId);
  });

  test("겹치지 않는 후보가 2개 미만이거나 12개를 넘으면 거절한다", async ({
    request,
  }) => {
    const token = await login(request);
    const tooFew = await request.post("/api/picks", {
      headers: authHeaders(token),
      data: { options: ["국밥", " 국밥 "] },
    });
    expect(tooFew.status()).toBe(400);
    expect((await tooFew.json()).error).toContain("2개 이상");

    const tooMany = await request.post("/api/picks", {
      headers: authHeaders(token),
      data: { options: Array.from({ length: 13 }, (_, i) => `후보${i}`) },
    });
    expect(tooMany.status()).toBe(400);
  });

  test("다시 돌리기는 지금 결과를 빼고 한 번만 된다", async ({ request }) => {
    const token = await login(request);
    const pick = (await (
      await request.post("/api/picks", {
        headers: authHeaders(token),
        data: { options: ["국밥", "돈까스"] },
      })
    ).json()) as PickView;

    const reroll = await request.post(`/api/picks/${pick.id}/reroll`, {
      headers: authHeaders(token),
    });
    expect(reroll.status()).toBe(200);
    const rerolled = (await reroll.json()) as PickView;
    expect(rerolled.resultOptionId).not.toBe(pick.resultOptionId);
    expect(rerolled.rerollsLeft).toBe(0);

    const second = await request.post(`/api/picks/${pick.id}/reroll`, {
      headers: authHeaders(token),
    });
    expect(second.status()).toBe(409);
  });

  test("결정하면 다시 돌릴 수 없다", async ({ request }) => {
    const token = await login(request);
    const pick = (await (
      await request.post("/api/picks", {
        headers: authHeaders(token),
        data: { options: ["국밥", "돈까스", "파스타"] },
      })
    ).json()) as PickView;

    const decided = (await (
      await request.patch(`/api/picks/${pick.id}`, {
        headers: authHeaders(token),
        data: { status: "decided" },
      })
    ).json()) as PickView;
    expect(decided.status).toBe("decided");
    expect(decided.resultOptionId).toBe(pick.resultOptionId);

    const reroll = await request.post(`/api/picks/${pick.id}/reroll`, {
      headers: authHeaders(token),
    });
    expect(reroll.status()).toBe(409);
  });

  test("여러 번 뽑으면 후보가 고르게 나온다", async ({ request }) => {
    const token = await login(request);
    const counts = new Map<string, number>();
    for (let i = 0; i < 40; i++) {
      const pick = (await (
        await request.post("/api/picks", {
          headers: authHeaders(token),
          data: { options: ["A", "B"] },
        })
      ).json()) as PickView;
      const label = resultLabel(pick) ?? "";
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    // 40번 중 한쪽만 나올 확률은 2/2^40 — 사실상 0
    expect(counts.get("A") ?? 0).toBeGreaterThan(0);
    expect(counts.get("B") ?? 0).toBeGreaterThan(0);
  });

  test("기록을 지우면 다시 열 수 없다", async ({ request }) => {
    const token = await login(request);
    const pick = (await (
      await request.post("/api/picks", {
        headers: authHeaders(token),
        data: { options: ["국밥", "돈까스"] },
      })
    ).json()) as PickView;
    const del = await request.delete(`/api/picks/${pick.id}`, {
      headers: authHeaders(token),
    });
    expect(del.status()).toBe(200);
    const get = await request.get(`/api/picks/${pick.id}`, {
      headers: authHeaders(token),
    });
    expect(get.status()).toBe(404);
  });
});

test.describe("골라 줘 화면", () => {
  test.beforeEach(resetPicks);

  test("후보를 넣고 돌리면 서버가 뽑은 결과를 보여 주고, 새로고침해도 같다", async ({
    page,
    request,
  }) => {
    const token = await login(request);
    await openPick(page, token);

    const spin = page.getByRole("button", { name: "돌리기" });
    await expect(spin).toBeDisabled();

    await page.getByPlaceholder("오늘 저녁 뭐 먹지?").fill("주말 데이트");
    const input = page.getByRole("textbox", { name: "후보 입력" });
    await input.fill("성수 카페");
    await input.press("Enter");
    // 쉼표로 이어 쓴 글을 붙여 넣으면 후보 여러 개가 된다.
    await input.evaluate((el) => {
      const data = new DataTransfer();
      data.setData("text", "망원 한강공원, 북촌 산책,성수 카페");
      el.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: data, bubbles: true })
      );
    });
    const chips = page.getByRole("list", { name: "넣은 후보" }).getByRole("listitem");
    await expect(chips).toHaveText(["성수 카페", "망원 한강공원", "북촌 산책"]);
    await expect(page.getByRole("img", { name: "룰렛: 후보 3개" })).toBeVisible();

    await spin.click();
    await expect(page).toHaveURL(/\?pick=\d+/);
    const result = page.getByTestId("pick-result");
    await expect(result).toBeVisible();
    const shown = await result.textContent();
    // 돌림판도 바늘이 뽑힌 칸을 가리키며 멈춘다.
    expect(await labelUnderPointer(page)).toBe(shown);

    const { rows } = await pool.query<{ label: string; title: string }>(
      `select o.label, p.title from picks p join pick_options o on o.id = p.result_option_id`
    );
    expect(rows).toHaveLength(1);
    expect(shown).toBe(rows[0].label);
    expect(rows[0].title).toBe("주말 데이트");

    await page.reload();
    await expect(page.getByTestId("pick-result")).toHaveText(rows[0].label);
    expect(await labelUnderPointer(page)).toBe(rows[0].label);

    await page.getByRole("button", { name: "이걸로 결정" }).click();
    await expect(page.getByText("이걸로 정했어요")).toBeVisible();
    const history = page.getByRole("list").filter({ hasText: "주말 데이트" });
    await expect(history.getByText("결정", { exact: true })).toBeVisible();
  });

  test("다시 돌리기는 다른 후보를 한 번만 뽑는다", async ({ page, request }) => {
    const token = await login(request);
    const pick = (await (
      await request.post("/api/picks", {
        headers: authHeaders(token),
        data: { options: ["국밥", "돈까스", "파스타"] },
      })
    ).json()) as PickView;
    await openPick(page, token, `/pick?pick=${pick.id}`);

    const result = page.getByTestId("pick-result");
    await expect(result).toHaveText(resultLabel(pick)!);
    await page.getByRole("button", { name: "다시 돌리기 (1번 남음)" }).click();
    await expect(page.getByRole("button", { name: "다시 돌리기 끝" })).toBeDisabled();
    await expect(result).not.toHaveText(resultLabel(pick)!);
    await expect(result).toHaveText(/국밥|돈까스|파스타/);
    expect(await labelUnderPointer(page)).toBe(await result.textContent());
  });

  test("돌림판이 도는 동안에는 지난 뽑기 목록에도 결과를 미리 보여 주지 않는다", async ({
    page,
    request,
  }) => {
    const token = await login(request);
    await openPick(page, token);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const input = page.getByRole("textbox", { name: "후보 입력" });
    // 쉼표를 치면 그 앞까지가 후보가 되고, 남은 글은 Enter로 넣는다.
    await input.pressSequentially("국밥, 돈까스,파스타");
    await expect(input).toHaveValue("파스타");
    await input.press("Enter");
    await expect(
      page.getByRole("list", { name: "넣은 후보" }).getByRole("listitem")
    ).toHaveText(["국밥", "돈까스", "파스타"]);
    await page.getByRole("button", { name: "돌리기" }).click();

    const history = page.locator("section").filter({ hasText: "지난 뽑기" });
    await expect(history.getByRole("listitem")).toHaveCount(1);
    await expect(history.getByRole("listitem")).toContainText("두구두구…");
    await expect(page.getByTestId("pick-result")).toBeVisible({ timeout: 10_000 });
    const shown = await page.getByTestId("pick-result").textContent();
    await expect(history.getByRole("listitem")).toContainText(shown!);
    expect(await labelUnderPointer(page)).toBe(shown);
  });

  test("후보 고쳐서 다시를 누르면 같은 후보가 입력칸에 돌아온다", async ({
    page,
    request,
  }) => {
    const token = await login(request);
    const pick = (await (
      await request.post("/api/picks", {
        headers: authHeaders(token),
        data: { title: "점심", options: ["국밥", "돈까스"] },
      })
    ).json()) as PickView;
    await openPick(page, token, `/pick?pick=${pick.id}`);
    await page.getByRole("button", { name: "후보 고쳐서 다시" }).click();
    await expect(page).not.toHaveURL(/pick=/);
    await expect(page.getByPlaceholder("오늘 저녁 뭐 먹지?")).toHaveValue("점심");
    await expect(
      page.getByRole("list", { name: "넣은 후보" }).getByRole("listitem")
    ).toHaveText(["국밥", "돈까스"]);
    await page.getByRole("button", { name: "국밥 빼기" }).click();
    await expect(page.getByRole("button", { name: "돌리기" })).toBeDisabled();
  });

  test("후보 이름이 길고 많아도 화면이 좌우로 넘치지 않는다", async ({
    page,
    request,
  }) => {
    const token = await login(request);
    const pick = (await (
      await request.post("/api/picks", {
        headers: authHeaders(token),
        data: {
          title: "아주 긴 고민 제목이 들어가도 넘치지 않아야 해요 정말로요",
          options: Array.from(
            { length: 12 },
            (_, i) => `아주아주 긴 이름의 후보 장소 ${i + 1}번째 가게입니다`
          ),
        },
      })
    ).json()) as PickView;
    await openPick(page, token, `/pick?pick=${pick.id}`);
    await expect(page.getByTestId("pick-result")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
