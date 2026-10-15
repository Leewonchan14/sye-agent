#!/usr/bin/env node
/**
 * Hermes API 서버 목(mock) — 로컬에서 `LLM_BACKEND=hermes` 경로를 실제 Hermes 없이 시험한다.
 *
 * 실제 서버가 아니라 Hermes API 서버의 `/api/sessions*` SSE 프로토콜만 흉내내는 개발용 서버다.
 * (실제 프로토콜 참고: hermes-agent `gateway/platforms/api_server.py` — sessions chat/stream)
 *
 * 사용법:
 *   node scripts/mock-hermes-server.mjs 8971
 *
 *   LLM_BACKEND=hermes \
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

  console.log(
    `[mock-hermes] turn → message=${JSON.stringify(userMessage)} system_message=${
      systemMessage ? JSON.stringify(systemMessage) : "(none)"
    }`
  );

  send("run.started", {
    user_message: { role: "user", content: userMessage },
    runtime: {},
  });
  send("message.started", { message: { id: messageId, role: "assistant" } });
  await sleep(50);

  for (const chunk of ["사용자 메시지를 읽어볼까…! ", "춘천 정보를 찾아야겠어…! "]) {
    if (closed) return;
    send("tool.progress", {
      message_id: messageId,
      tool_name: "_thinking",
      delta: chunk,
    });
    await sleep(40);
  }

  send("tool.started", {
    message_id: messageId,
    tool_name: "web_search",
    preview: `"${userMessage}" 검색`,
    args: { query: userMessage },
  });
  await sleep(120);
  send("tool.completed", {
    message_id: messageId,
    tool_name: "web_search",
    preview: null,
    args: null,
  });

  res.write(": keepalive\n\n"); // 파서가 건너뛰어야 하는 주석 프레임

  const answer = `춘천 데이트라면… 무엇을 좋아하는지에 따라 달라져…! …라는 거야!? (목 서버 응답이야…!)`;
  for (const piece of answer.match(/.{1,12}/gu) ?? []) {
    if (closed) return;
    send("assistant.delta", { message_id: messageId, delta: piece });
    await sleep(25);
  }

  send("assistant.completed", {
    session_id: sessionId,
    message_id: messageId,
    content: answer,
    runtime: {},
  });
  send("run.completed", {
    session_id: sessionId,
    message_id: messageId,
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
