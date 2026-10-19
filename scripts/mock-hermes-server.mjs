#!/usr/bin/env node
/**
 * Hermes API 서버 목(mock) — 로컬에서 Hermes 채팅 백엔드를 실제 Hermes 없이 시험한다.
 *
 * 실제 서버가 아니라 Hermes API 서버의 `/api/sessions*` SSE 프로토콜만 흉내내는 개발용 서버다.
 * (실제 프로토콜 참고: hermes-agent `gateway/platforms/api_server.py` — sessions chat/stream)
 *
 * 사용법:
 *   node scripts/mock-hermes-server.mjs 8971
 *
 *   HERMES_API_URL=http://127.0.0.1:8971/p/hachi \
 *   HERMES_API_KEY=mock-key \
 *   npm run dev
 *
 * 옵션:
 *   MOCK_HERMES_API_KEY=<key>  베어러 키 (기본 mock-key)
 *   MOCK_429_FIRST=1           세션당 첫 chat/stream 요청을 429로 거절(재시도 로직 확인용)
 */
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 8971);
const apiKey = process.env.MOCK_HERMES_API_KEY ?? "mock-key";
const rejectFirst = process.env.MOCK_429_FIRST === "1";

/** @type {Map<string, { title: string | null, streamAttempts: number }>} */
const sessions = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomId = (prefix) => `${prefix}_${Math.random().toString(16).slice(2, 10)}`;
const chunkText = (text, size = 12) =>
  text.match(new RegExp(`.{1,${size}}`, "gsu")) ?? [];

const sendJson = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};

const sendError = (res, status, message) =>
  sendJson(res, status, { error: { message, type: "invalid_request_error" } });

const readJsonBody = (req) =>
  new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });

const checkAuth = (req, res) => {
  if (req.headers.authorization !== `Bearer ${apiKey}`) {
    sendError(res, 401, "Invalid API key");
    return false;
  }
  return true;
};

/**
 * 한 턴을 실서버 wire와 같은 모양으로 흘려보낸다.
 *  · 모델의 reasoning은 `reasoning.delta`로 스트리밍된다 (게이트웨이가 reasoning_callback 중계)
 *  · assistant 텍스트(중간 나레이션 포함)는 전부 `assistant.delta`로 스트리밍된다
 *  · 방금 나간 텍스트는 `tool.progress`(`_thinking`)로 한 번 더 에코되고,
 *    이어서 `assistant.commentary`가 그 메시지의 끝을 알린다
 *  · `tool.started`/`tool.completed`에는 결과가 실리지 않는다
 *  · 도구 결과는 턴 끝 `run.completed.messages`(전체 트랜스크립트)에만 있다
 */
const streamTurn = async (req, res, sessionId, userMessage, systemMessage) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Hermes-Session-Id": sessionId,
  });

  let closed = false;
  res.on("error", () => {});
  req.on("close", () => {
    closed = true;
  });

  const messageId = randomId("msg");
  const runId = randomId("run");
  let seq = 0;
  const send = (event, data) => {
    if (closed) return;
    seq += 1;
    res.write(
      `event: ${event}\ndata: ${JSON.stringify({
        session_id: sessionId,
        run_id: runId,
        seq,
        ts: Date.now() / 1000,
        ...data,
      })}\n\n`
    );
  };
  const streamText = async (text) => {
    for (const piece of chunkText(text)) {
      if (closed) return;
      send("assistant.delta", { message_id: messageId, delta: piece });
      await sleep(25);
    }
  };

  console.log(
    `[mock-hermes] turn → message=${JSON.stringify(userMessage)} system_message=${
      systemMessage ? JSON.stringify(systemMessage) : "(none)"
    }`
  );

  const steps = [
    {
      narration: `"${userMessage}"를 어떻게 찾을지 정리해 볼게…!`,
      reasoning: `The user asked "${userMessage}". Let me search the web for it first.`,
      tool: {
        name: "web_search",
        args: { query: userMessage },
        preview: `"${userMessage}" 검색`,
        result: {
          success: true,
          results: [
            { title: "춘천 데이트 코스 추천", url: "https://example.com/chuncheon" },
          ],
        },
      },
    },
    {
      narration: "결과가 나왔어! 이제 페이지 내용을 직접 확인해 볼게…!",
      reasoning: "The search returned one result. Opening it to read the details.",
      tool: {
        name: "web_extract",
        args: { urls: ["https://example.com/chuncheon"] },
        preview: "example.com/chuncheon",
        result: {
          output: "춘천 데이트 코스로 소양강 스카이워크와 감자밭 카페가 인기야.",
          exit_code: 0,
          error: null,
        },
      },
    },
  ];

  send("run.started", {
    user_message: { role: "user", content: userMessage },
    runtime: {},
  });
  send("message.started", { message: { id: messageId, role: "assistant" } });
  await sleep(50);

  /** @type {Record<string, unknown>[]} */
  const transcript = [];

  for (const step of steps) {
    // 모델이 먼저 생각하고(reasoning.delta), 그 다음 텍스트를 말한다.
    for (const piece of chunkText(step.reasoning, 24)) {
      if (closed) return;
      send("reasoning.delta", { message_id: messageId, delta: piece });
      await sleep(20);
    }
    await streamText(step.narration);
    if (closed) return;

    send("tool.progress", {
      message_id: messageId,
      tool_name: "_thinking",
      delta: step.narration,
    });
    send("assistant.commentary", {
      message_id: messageId,
      text: step.narration,
      already_streamed: true,
    });
    send("tool.started", {
      message_id: messageId,
      tool_name: step.tool.name,
      preview: step.tool.preview,
      args: step.tool.args,
    });
    await sleep(120);
    if (closed) return;
    send("tool.completed", {
      message_id: messageId,
      tool_name: step.tool.name,
      preview: null,
      args: null,
    });

    const callId = randomId("call");
    transcript.push(
      {
        role: "assistant",
        content: step.narration,
        tool_calls: [
          {
            id: callId,
            call_id: callId,
            type: "function",
            function: { name: step.tool.name, arguments: JSON.stringify(step.tool.args) },
          },
        ],
        finish_reason: "tool_calls",
        reasoning: step.reasoning,
        reasoning_content: step.reasoning,
      },
      {
        role: "tool",
        tool_name: step.tool.name,
        tool_call_id: callId,
        content: JSON.stringify(step.tool.result),
      }
    );
  }

  res.write(": keepalive\n\n"); // 파서가 건너뛰어야 하는 주석 프레임

  const answer = `춘천 데이트라면… 무엇을 좋아하는지에 따라 달라져…! …라는 거야!? (목 서버 응답이야…!)`;
  const answerReasoning =
    "Now I can summarize: 소양강 스카이워크 and 감자밭 카페, both confirmed by the page.";
  for (const piece of chunkText(answerReasoning, 24)) {
    if (closed) return;
    send("reasoning.delta", { message_id: messageId, delta: piece });
    await sleep(20);
  }
  await streamText(answer);
  if (closed) return;

  send("assistant.completed", {
    session_id: sessionId,
    message_id: messageId,
    content: answer,
    completed: true,
    partial: false,
    runtime: {},
  });
  send("run.completed", {
    session_id: sessionId,
    message_id: messageId,
    completed: true,
    messages: [
      ...transcript,
      {
        role: "assistant",
        content: answer,
        finish_reason: "stop",
        reasoning: answerReasoning,
        reasoning_content: answerReasoning,
      },
    ],
    usage: {},
    runtime: {},
  });
  send("done", {});
  res.end();
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
  const path = url.pathname.replace(/^\/p\/[^/]+/, ""); // 프로필 프리픽스 제거
  console.log(`[mock-hermes] ${req.method} ${url.pathname}`);

  if (!checkAuth(req, res)) return;

  const sessionMatch = path.match(/^\/api\/sessions\/([^/]+)$/);
  const streamMatch = path.match(/^\/api\/sessions\/([^/]+)\/chat\/stream$/);

  if (req.method === "GET" && path === "/health") {
    return sendJson(res, 200, { status: "ok" });
  }

  if (req.method === "GET" && sessionMatch) {
    const id = decodeURIComponent(sessionMatch[1]);
    const session = sessions.get(id);
    if (!session) return sendError(res, 404, `Session not found: ${id}`);
    return sendJson(res, 200, {
      object: "hermes.session",
      session: { id, title: session.title },
    });
  }

  if (req.method === "POST" && path === "/api/sessions") {
    const body = await readJsonBody(req);
    const id = String(body.id ?? body.session_id ?? randomId("api"));
    if (sessions.has(id)) return sendError(res, 409, `Session already exists: ${id}`);
    sessions.set(id, { title: body.title ?? null, streamAttempts: 0 });
    console.log(`[mock-hermes] session created: ${id}`);
    return sendJson(res, 201, {
      object: "hermes.session",
      session: { id, title: body.title ?? null },
    });
  }

  if (req.method === "POST" && streamMatch) {
    const id = decodeURIComponent(streamMatch[1]);
    const session = sessions.get(id);
    if (!session) return sendError(res, 404, `Session not found: ${id}`);

    const body = await readJsonBody(req);
    const message = String(body.message ?? "").trim();
    if (!message) return sendError(res, 400, "Missing 'message' field");

    session.streamAttempts += 1;
    if (rejectFirst && session.streamAttempts === 1) {
      console.log("[mock-hermes] 429 (MOCK_429_FIRST) — 어댑터의 재시도 확인용");
      return sendError(res, 429, "Too many concurrent runs");
    }

    return streamTurn(req, res, id, message, body.system_message);
  }

  return sendError(res, 404, `Not found: ${req.method} ${path}`);
});

server.listen(port, "127.0.0.1", () => {
  console.log(
    `[mock-hermes] Hermes API server mock listening on http://127.0.0.1:${port}`
  );
  console.log(
    `[mock-hermes] base URL 예: http://127.0.0.1:${port}/p/hachi (API key: ${apiKey})`
  );
});
