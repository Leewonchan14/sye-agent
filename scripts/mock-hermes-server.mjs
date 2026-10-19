#!/usr/bin/env node
/**
 * Hermes API 서버 목(mock) — 로컬에서 Hermes 채팅 백엔드를 실제 Hermes 없이 시험한다.
 *
 * 앱이 실제로 쓰는 표면만 흉내낸다:
 *   POST   /v1/runs                        런 시작 (run_id 즉시 반환)
 *   GET    /v1/runs/{id}                   상태 + 최종 output
 *   GET    /v1/runs/{id}/events?last_seq=  seq 이후 이벤트 재생 + 이어서 구독
 *   POST   /v1/runs/{id}/stop              런 중단
 *   POST   /api/sessions                   세션 생성
 *   GET    /api/sessions/{id}              세션 조회
 *   GET    /api/sessions/{id}/messages     트랜스크립트 (도구 결과·thinking 백필용)
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
 *   MOCK_TURN_MS=<ms>          턴 하나가 흘러가는 시간 (기본 6000)
 *   MOCK_429_FIRST=1           세션당 첫 런 시작을 429로 거절
 */
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 8971);
const apiKey = process.env.MOCK_HERMES_API_KEY ?? "mock-key";
const turnMs = Number(process.env.MOCK_TURN_MS ?? 6000);
const rejectFirst = process.env.MOCK_429_FIRST === "1";

/** @type {Map<string, { title: string | null, streamAttempts: number }>} */
const sessions = new Map();
/** @type {Map<string, any>} */
const runs = new Map();

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

/** 턴 하나의 이벤트/트랜스크립트를 만든다 (실서버 wire와 같은 순서). */
const buildTurn = (sessionId, userMessage) => {
  const steps = [
    {
      reasoning: `The user asked: ${userMessage}. Let me check the current time first.`,
      narration: `"${userMessage}"라니…! 먼저 시각부터 확인해 볼게…!`,
      tool: {
        name: "terminal",
        preview: "date",
        args: { command: "date" },
        result: { output: "Mon Oct 19 06:20:00 UTC 2026", exit_code: 0, error: null },
      },
    },
    {
      reasoning: "Got the time. Now the disk usage, then I can summarize.",
      narration: "좋아, 시각 확인 완료! 이제 디스크도 볼게…!",
      tool: {
        name: "terminal",
        preview: "df -h",
        args: { command: "df -h" },
        result: {
          output: "overlay 45G 24G 21G 53% /",
          exit_code: 0,
          error: null,
        },
      },
    },
  ];

  const answer = `다 확인했어~! 지금 시각이랑 디스크 상태 정리해서 알려줄게…! (목 서버 응답이야…!)`;
  const answerReasoning = "Everything checked out — time to write the summary.";

  return { steps, answer, answerReasoning, sessionId };
};

const emitTurn = async (run) => {
  const { steps, answer, answerReasoning } = run.turn;
  const messageId = randomId("msg");
  const transcript = [];
  const perStep = Math.max(200, Math.floor(turnMs / (steps.length + 1) / 6));

  const send = (event, payload) => {
    if (run.status !== "running") return;
    run.events.push({
      id: run.events.length,
      event,
      run_id: run.id,
      timestamp: Date.now() / 1000,
      ...run.payload(payload),
    });
  };

  for (const step of steps) {
    for (const piece of chunkText(step.reasoning, 24)) {
      send("reasoning.delta", { delta: piece });
      await sleep(perStep);
      if (run.status !== "running") return finish(run, "cancelled");
    }
    for (const piece of chunkText(step.narration)) {
      send("message.delta", { delta: piece });
      await sleep(perStep);
      if (run.status !== "running") return finish(run, "cancelled");
    }
    send("message.interim", { text: step.narration, already_streamed: true });
    send("tool.started", { tool: step.tool.name, preview: step.tool.preview });
    await sleep(perStep * 2);
    if (run.status !== "running") return finish(run, "cancelled");
    send("tool.completed", {
      tool: step.tool.name,
      duration: 0.2,
      error: false,
      preview: JSON.stringify(step.tool.result),
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

  for (const piece of chunkText(answerReasoning, 24)) {
    send("reasoning.delta", { delta: piece });
    await sleep(perStep);
    if (run.status !== "running") return finish(run, "cancelled");
  }
  for (const piece of chunkText(answer)) {
    send("message.delta", { delta: piece });
    await sleep(perStep);
    if (run.status !== "running") return finish(run, "cancelled");
  }

  transcript.push({
    role: "assistant",
    content: answer,
    finish_reason: "stop",
    reasoning: answerReasoning,
    reasoning_content: answerReasoning,
  });
  run.transcript = transcript;
  send("run.completed", { output: answer, completed: true, message_id: messageId });
  finish(run, "completed");
};

const finish = (run, status) => {
  if (run.status !== "running") return;
  run.status = status;
  run.closed = true;
  for (const listener of run.listeners) listener();
  run.listeners.clear();
};

const sseHeaders = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
  const path = url.pathname.replace(/^\/p\/[^/]+/, ""); // 프로필 프리픽스 제거
  console.log(`[mock-hermes] ${req.method} ${url.pathname}`);

  if (!checkAuth(req, res)) return;

  const sessionMatch = path.match(/^\/api\/sessions\/([^/]+)$/);
  const messagesMatch = path.match(/^\/api\/sessions\/([^/]+)\/messages$/);
  const runMatch = path.match(/^\/v1\/runs\/([^/]+)$/);
  const runEventsMatch = path.match(/^\/v1\/runs\/([^/]+)\/events$/);
  const runStopMatch = path.match(/^\/v1\/runs\/([^/]+)\/stop$/);

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

  if (req.method === "GET" && messagesMatch) {
    const id = decodeURIComponent(messagesMatch[1]);
    const session = sessions.get(id);
    if (!session) return sendError(res, 404, `Session not found: ${id}`);
    return sendJson(res, 200, {
      object: "list",
      session_id: id,
      data: session.transcript ?? [],
      pagination: { has_more: false },
    });
  }

  if (req.method === "POST" && path === "/api/sessions") {
    const body = await readJsonBody(req);
    const id = String(body.id ?? body.session_id ?? randomId("api"));
    if (sessions.has(id)) return sendError(res, 409, `Session already exists: ${id}`);
    sessions.set(id, { title: body.title ?? null, streamAttempts: 0, transcript: [] });
    console.log(`[mock-hermes] session created: ${id}`);
    return sendJson(res, 201, {
      object: "hermes.session",
      session: { id, title: body.title ?? null },
    });
  }

  if (req.method === "POST" && path === "/v1/runs") {
    const body = await readJsonBody(req);
    const input = String(body.input ?? "").trim();
    if (!input) return sendError(res, 400, "Missing 'input' field");
    const sessionId = String(body.session_id ?? "").trim() || randomId("api");

    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        title: input.slice(0, 80),
        streamAttempts: 0,
        transcript: [],
      });
    }
    const session = sessions.get(sessionId);
    session.streamAttempts += 1;
    if (rejectFirst && session.streamAttempts === 1) {
      console.log("[mock-hermes] 429 (MOCK_429_FIRST)");
      return sendError(res, 429, "Too many concurrent runs");
    }

    const runId = randomId("run");
    const run = {
      id: runId,
      sessionId,
      status: "running",
      events: [],
      listeners: new Set(),
      transcript: [],
      turn: buildTurn(sessionId, input),
      payload: (payload) => payload,
    };
    runs.set(runId, run);
    console.log(
      `[mock-hermes] run started: ${runId} session=${sessionId} input=${JSON.stringify(input)}`
    );

    void emitTurn(run)
      .catch((error) => console.error("[mock-hermes] turn failed", error))
      .finally(() => {
        session.transcript = run.transcript ?? session.transcript;
      });

    return sendJson(res, 200, { run_id: runId, status: "started", replayed: false });
  }

  if (req.method === "GET" && runMatch) {
    const run = runs.get(decodeURIComponent(runMatch[1]));
    if (!run) return sendError(res, 404, "Run not found");
    const output = run.transcript?.at(-1)?.content ?? "";
    return sendJson(res, 200, {
      object: "hermes.run",
      run_id: run.id,
      status: run.status,
      session_id: run.sessionId,
      last_event: run.events.at(-1)?.event ?? null,
      output,
    });
  }

  if (req.method === "POST" && runStopMatch) {
    const run = runs.get(decodeURIComponent(runStopMatch[1]));
    if (!run) return sendError(res, 404, "Run not found");
    finish(run, "cancelled");
    return sendJson(res, 200, {
      object: "hermes.run",
      run_id: run.id,
      status: "cancelled",
    });
  }

  if (req.method === "GET" && runEventsMatch) {
    const run = runs.get(decodeURIComponent(runEventsMatch[1]));
    if (!run) return sendError(res, 404, "Run not found");

    const rawLastSeq = req.headers["last-event-id"] ?? url.searchParams.get("last_seq");
    const parsedSeq = Number(rawLastSeq);
    const lastSeq = Number.isFinite(parsedSeq) ? Math.floor(parsedSeq) : -1;

    res.writeHead(200, sseHeaders);
    res.write(": open\n\n");

    let cursor = 0;
    const writeNew = () => {
      while (cursor < run.events.length) {
        const event = run.events[cursor];
        cursor += 1;
        if (event.id <= lastSeq) continue;
        const { id, ...payload } = event;
        res.write(`id: ${id}\ndata: ${JSON.stringify({ ...payload, seq: id })}\n\n`);
      }
    };

    writeNew();
    if (run.status !== "running") {
      res.write(": stream closed\n\n");
      return res.end();
    }

    const listener = () => {
      writeNew();
      if (run.status !== "running") {
        res.write(": stream closed\n\n");
        res.end();
      }
    };
    run.listeners.add(listener);

    const keepalive = setInterval(() => res.write(": keepalive\n\n"), 5000);
    req.on("close", () => {
      clearInterval(keepalive);
      run.listeners.delete(listener);
    });
    res.on("close", () => {
      clearInterval(keepalive);
      run.listeners.delete(listener);
    });
    return;
  }

  return sendError(res, 404, `Not found: ${req.method} ${path}`);
});

server.listen(port, "127.0.0.1", () => {
  console.log(
    `[mock-hermes] Hermes API server mock listening on http://127.0.0.1:${port}`
  );
  console.log(
    `[mock-hermes] base URL 예: http://127.0.0.1:${port}/p/hachi (API key: ${apiKey}, turn: ${turnMs}ms)`
  );
});
