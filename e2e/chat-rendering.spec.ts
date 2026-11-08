import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { login } from "./helpers";

const SESSION = "e2e-chat-session";

const replyStream = (text: string) =>
  [
    { type: "start", messageId: "assistant-1" },
    { type: "text-start", id: "text-1" },
    { type: "text-delta", id: "text-1", delta: text },
    { type: "text-end", id: "text-1" },
    { type: "finish" },
  ]
    .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
    .join("")
    .concat("data: [DONE]\n\n");

const signIn = async (page: Page, request: APIRequestContext) => {
  const token = await login(request);
  await page.addInitScript((value) => {
    localStorage.setItem(
      "trable-auth",
      JSON.stringify({ state: { token: value }, version: 0 })
    );
  }, token);
};

const mockEmptyChat = async (page: Page, reply: string) => {
  await page.route("**/api/messages*", (route) => route.fulfill({ json: { state: [] } }));
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      body: replyStream(reply),
      headers: {
        "content-type": "text/event-stream",
        "x-vercel-ai-ui-message-stream": "v1",
      },
    })
  );
};

const send = async (page: Page, text: string) => {
  await page.locator("textarea").fill(text);
  await page.getByRole("button", { name: "Submit" }).click();
};

test.describe("채팅 화면 표시", () => {
  test("메시지를 불러오는 동안과 끝난 뒤 300ms까지 로딩을 보여 준다", async ({
    page,
    request,
  }) => {
    await signIn(page, request);
    const { promise: loaded, resolve: finishLoading } = Promise.withResolvers<void>();
    await page.route("**/api/messages*", async (route) => {
      await loaded;
      await route.fulfill({ json: { state: [] } });
    });

    await page.goto(`/${SESSION}`);
    const loading = page.locator("img.animate-bounce");
    const input = page.locator("textarea");
    await expect(loading).toBeVisible();
    await expect(input).toHaveCount(0);

    const releasedAt = Date.now();
    finishLoading();

    await expect(input).toBeVisible();
    expect(Date.now() - releasedAt).toBeGreaterThanOrEqual(300);
    await expect(loading).toHaveCount(0);
  });

  test("사랑 표현을 보내면 하트를 보여 주고 잠시 뒤 지운다", async ({
    page,
    request,
  }) => {
    await signIn(page, request);
    await mockEmptyChat(page, "나도 고마워");
    await page.goto(`/${SESSION}`);

    const hearts = page.locator(".animate-heart-float");
    await send(page, "사랑해");

    await expect(hearts).toHaveCount(20);
    const shownAt = Date.now();
    await expect(page.getByText("나도 고마워")).toBeVisible();

    await expect(hearts).toHaveCount(0, { timeout: 10_000 });
    expect(Date.now() - shownAt).toBeGreaterThanOrEqual(3_000);
  });

  test("다른 메시지에는 하트를 보여 주지 않는다", async ({ page, request }) => {
    await signIn(page, request);
    await mockEmptyChat(page, "안녕하세요");
    await page.goto(`/${SESSION}`);

    await send(page, "오늘 날씨 어때");

    await expect(page.getByText("안녕하세요")).toBeVisible();
    await expect(page.locator(".animate-heart-float")).toHaveCount(0);
  });
});
