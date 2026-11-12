import { expect, test } from "@playwright/test";

import { newUserClient, PASSWORD, signUpWith, uniqueEmail } from "./helpers";

test.describe("로그인·회원가입", () => {
  test("로그인하지 않으면 로그인 화면으로 보낸다", async ({ page }) => {
    await page.goto("/monitor");
    await expect(page).toHaveURL(/\/login\?next=%2Fmonitor$/);
    await expect(page.getByText("이메일과 비밀번호로 로그인하세요.")).toBeVisible();
  });

  test("가입하면 바로 로그인되고 기본 예시 질문이 보인다", async ({ page }) => {
    const email = uniqueEmail("signup");
    await page.goto("/signup");
    await page.getByLabel("이름").fill("새 사용자");
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("비밀번호").fill(PASSWORD);
    await page.getByRole("button", { name: "가입하기" }).click();

    await expect(
      page.getByRole("heading", { name: "무엇을 도와드릴까요?" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "오늘의 주요 뉴스" })).toBeVisible();
  });

  test("이미 가입된 이메일로는 가입할 수 없다", async ({ page }) => {
    const email = await signUpWith(page.request);
    await page.context().clearCookies();
    await page.goto("/signup");
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("비밀번호").fill(PASSWORD);
    await page.getByRole("button", { name: "가입하기" }).click();
    await expect(page.getByText("이미 가입된 이메일이에요.")).toBeVisible();
  });

  test("비밀번호가 틀리면 알려 주고, 맞으면 원래 가려던 화면으로 간다", async ({
    page,
  }) => {
    const email = await signUpWith(page.request);
    await page.context().clearCookies();

    await page.goto("/search");
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("비밀번호").fill("wrong-password");
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page.getByText("이메일 또는 비밀번호가 올바르지 않아요.")).toBeVisible();

    await page.getByLabel("비밀번호").fill(PASSWORD);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/search$/);
    await expect(page.getByRole("heading", { name: "대화 검색" }).last()).toBeVisible();
  });

  test("로그아웃하면 로그인 화면으로 돌아간다", async ({ page, isMobile }) => {
    await signUpWith(page.request, uniqueEmail("logout"), "로그아웃 사용자");
    await page.goto("/");
    // 모바일에서는 사이드바가 시트 안에 접혀 있다.
    if (isMobile) await page.getByRole("button", { name: "Toggle Sidebar" }).click();
    await page.getByRole("button", { name: /로그아웃 사용자/ }).click();
    await page.getByRole("menuitem", { name: "로그아웃" }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("로그인하지 않은 API 요청은 401이다", async ({ request }) => {
    for (const path of [
      "/api/sessions",
      "/api/instructions",
      "/api/suggestions",
      "/api/monitor",
    ]) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(401);
    }
  });
});

test.describe("사용자별 데이터 분리", () => {
  test("대화는 만든 사용자에게만 보인다", async ({ playwright }) => {
    const a = await newUserClient(playwright, "alice");
    const b = await newUserClient(playwright, "bob");
    const sessionId = `e2e-${crypto.randomUUID()}`;
    const messages = [
      { id: "m1", role: "user", parts: [{ type: "text", text: "A의 비밀 대화" }] },
    ];

    expect(
      (await a.request.post("/api/sessions", { data: { sessionId, messages } })).ok()
    ).toBe(true);

    const listA = await (await a.request.get("/api/sessions")).json();
    expect(listA.sessions.map((s: { id: string }) => s.id)).toContain(sessionId);

    const listB = await (await b.request.get("/api/sessions")).json();
    expect(listB.sessions).toHaveLength(0);

    const search = await (await b.request.get("/api/sessions/search?q=비밀")).json();
    expect(search.results).toHaveLength(0);

    const messagesB = await (
      await b.request.get(`/api/messages?sessionId=${sessionId}`)
    ).json();
    expect(messagesB.state).toEqual([]);

    // 남의 대화를 덮어쓰거나 이어 쓰거나 재개할 수 없다.
    const overwrite = await b.request.post("/api/sessions", {
      data: { sessionId, messages: [] },
    });
    expect(overwrite.status()).toBe(403);
    expect((await b.request.get(`/api/chat/${sessionId}/turn`)).status()).toBe(403);
    expect((await b.request.get(`/api/chat/${sessionId}/stream`)).status()).toBe(403);
    expect((await b.request.post(`/api/chat/${sessionId}/cancel`)).status()).toBe(403);
    const chat = await b.request.post("/api/chat", {
      data: {
        sessionId,
        messages: [{ id: "x", role: "user", parts: [{ type: "text", text: "hi" }] }],
      },
    });
    expect([403, 500]).toContain(chat.status()); // Hermes env가 없으면 500이 먼저 난다.

    const stillA = await (
      await a.request.get(`/api/messages?sessionId=${sessionId}`)
    ).json();
    expect(stillA.state[0].parts[0].text).toBe("A의 비밀 대화");
  });

  test("지시 사항과 예시 질문은 사용자마다 따로다", async ({ playwright }) => {
    const a = await newUserClient(playwright, "alice");
    const b = await newUserClient(playwright, "bob");

    const created = await (
      await a.request.post("/api/instructions", {
        data: { label: "A 규칙", content: "항상 존댓말" },
      })
    ).json();
    const id = created.instruction.id as number;
    expect(created.instruction.userId).toBeUndefined();

    const listB = await (await b.request.get("/api/instructions")).json();
    expect(listB.instructions).toHaveLength(0);

    // B가 A의 지시 사항을 바꾸거나 지울 수 없다.
    const edit = await b.request.post("/api/instructions", {
      data: { id, label: "B가 바꿈", content: "x" },
    });
    expect(edit.ok()).toBe(false);
    await b.request.delete("/api/instructions", { data: { id } });
    const listA = await (await a.request.get("/api/instructions")).json();
    expect(listA.instructions).toEqual([
      expect.objectContaining({ id, label: "A 규칙", isActive: true }),
    ]);

    // 예시 질문: A가 비워도 B의 기본 질문은 그대로다.
    const suggestionsA = await (await a.request.get("/api/suggestions")).json();
    for (const s of suggestionsA.suggestions) {
      await a.request.delete("/api/suggestions", { data: { id: s.id } });
    }
    expect(
      (await (await a.request.get("/api/suggestions")).json()).suggestions
    ).toHaveLength(0);
    expect(
      (await (await b.request.get("/api/suggestions")).json()).suggestions.length
    ).toBeGreaterThan(0);
  });
});
