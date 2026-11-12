import { expect, test, type Page } from "@playwright/test";

import { signUpPage } from "./helpers";

/** 테스트마다 새 대화 — 대화는 처음 저장한 사용자에게 묶인다. */
const newSession = () => `e2e-chat-${crypto.randomUUID()}`;

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
  }) => {
    await signUpPage(page);
    const { promise: loaded, resolve: finishLoading } = Promise.withResolvers<void>();
    await page.route("**/api/messages*", async (route) => {
      await loaded;
      await route.fulfill({ json: { state: [] } });
    });

    await page.goto(`/${newSession()}`);
    const loading = page.getByText("대화를 불러오는 중…");
    const input = page.locator("textarea");
    await expect(loading).toBeVisible();
    await expect(input).toHaveCount(0);

    const releasedAt = Date.now();
    finishLoading();

    await expect(input).toBeVisible();
    expect(Date.now() - releasedAt).toBeGreaterThanOrEqual(300);
    await expect(loading).toHaveCount(0);
  });

  test("답변을 받으면 화면에 보여 준다", async ({ page }) => {
    await signUpPage(page);
    await mockEmptyChat(page, "안녕하세요");
    await page.goto(`/${newSession()}`);

    await send(page, "오늘 날씨 어때");

    await expect(page.getByText("오늘 날씨 어때")).toBeVisible();
    await expect(page.getByText("안녕하세요")).toBeVisible();
  });
});
