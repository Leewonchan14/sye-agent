import type { HermesBackendConfig } from "./config";

/**
 * Hermes API 서버 클라이언트 — 세션 리소스 + 채팅 스트림.
 *
 * 프로토콜(실서버 wire 확인): `POST /api/sessions/{id}/chat/stream`은 아래 named SSE 이벤트를
 * 보낸다. 모든 `data`는 `{ session_id, run_id, seq, ts, … }` 봉투를 갖는다.
 *  - `run.started` / `message.started`
 *  - `assistant.delta` `{ delta }` — assistant 텍스트 전부(중간 나레이션 포함)를 순서대로 스트리밍
 *  - `reasoning.delta` `{ delta }` — 모델의 실제 thinking 델타 (게이트웨이 패치 필요 — README 참고)
 *  - `tool.progress` `{ tool_name, delta }` — 방금 나간 텍스트의 에코(`_thinking`) 또는 도구 진행 상황
 *  - `assistant.commentary` `{ text, already_streamed }` — 중간 assistant 메시지의 끝을 알린다
 *  - `tool.started` `{ tool_name, args, preview }` / `tool.completed|failed` `{ tool_name }`
 *    — 완료 이벤트에 결과가 없다
 *  - `assistant.completed` `{ content }` / `run.completed` `{ messages }` / `run.failed`
 *  - 도구 결과는 `run.completed.messages`(턴 전체 트랜스크립트)의 `role: "tool"` 메시지
 *    (`tool_call_id` + `content`)에만 있고, thinking도 게이트웨이 패치 전에는
 *    `role: "assistant"`의 `reasoning`/`reasoning_content`에만 있다
 *    → stream.ts가 턴 끝에 이 값으로 UI 스트림을 백필한다
 *  - `error` `{ message }` / `done` / `approval.request`
 *
 * 스트림이 ~10초간 조용하면 `: keepalive` 주석 프레임이 온다 — 파서에서 건너뛴다.
 * (참고: 트랜스크립트는 `GET /api/sessions/{id}/messages?limit=N`으로도 읽을 수 있다.)
 */

/** Hermes API 서버가 돌려준 오류 (HTTP 상태 포함). */
export class HermesApiError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "HermesApiError";
    this.status = status;
  }
}

/** chat/stream이 보내는 named SSE 이벤트 — payload 타입은 소비자가 정한다. */
export interface HermesSseFrame<TData> {
  type: string;
  data: TData;
}

const MAX_ERROR_TEXT_LENGTH = 400;

const requestHeaders = (config: HermesBackendConfig): Record<string, string> => ({
  Authorization: `Bearer ${config.apiKey}`,
  "Content-Type": "application/json",
  // 장기 기억 스코프 — 헤더가 없으면 세션 단위로 갈라진다.
  "X-Hermes-Session-Key": config.sessionKey,
});

/** 다른 Hermes 엔드포인트(run API 등)에서도 같은 인증/스코프 헤더를 쓴다. */
export const hermesRequestHeaders = requestHeaders;

/** Hermes 오류 응답(`{"error": … | {"message": …}}`)에서 읽는 필드. */
interface HermesErrorBody {
  error?: unknown;
  message?: unknown;
}

/** Hermes 오류 응답(`{"error":{"message":…}}`)에서 읽을 수 있는 메시지를 뽑는다. */
export const readHermesErrorMessage = async (res: Response): Promise<string> => {
  const fallback = `Hermes API 오류 (HTTP ${res.status})`;
  try {
    const text = (await res.text()).trim();
    if (!text) return fallback;

    let message: string | undefined;
    if (text.startsWith("{")) {
      try {
        const body = JSON.parse(text) as HermesErrorBody;
        const error = body.error;
        if (typeof error === "string") message = error;
        else if (error && typeof error === "object" && "message" in error) {
          // 타입 가드가 좁힌 값만 검사한다 (구조를 단정하지 않는다).
          const nested = error.message;
          if (typeof nested === "string") message = nested;
        }
        if (!message && typeof body.message === "string") message = body.message;
      } catch {
        // JSON이 아니면 원문을 그대로 사용한다.
      }
    }

    const result = message ?? text;
    return result.length > MAX_ERROR_TEXT_LENGTH
      ? `${result.slice(0, MAX_ERROR_TEXT_LENGTH)}…`
      : result;
  } catch {
    return fallback;
  }
};

/**
 * 게이트웨이 호출 타임아웃 — 응답이 없는 요청이 턴 전체(그리고 화면)를 붙잡지 않게 한다.
 * (`events` 스트림은 정상적으로 오래 열려 있으므로 연결 단계에만 건다.)
 */
const GATEWAY_TIMEOUT_MS = 15_000;

const createHermesSession = async (
  config: HermesBackendConfig,
  sessionId: string,
  title?: string
): Promise<Response> =>
  fetch(`${config.baseUrl}/api/sessions`, {
    method: "POST",
    headers: requestHeaders(config),
    body: JSON.stringify({ id: sessionId, ...(title ? { title } : {}) }),
    signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
  });

const buildTitle = (text: string): string | undefined => {
  const title = text.replace(/\s+/g, " ").trim().slice(0, 80);
  return title || undefined;
};

/**
 * Hermes 세션이 없으면 만들고, 있으면 그대로 사용한다.
 * 제목 유일성 규칙(400)에 걸리면 제목 없이 한 번 더 시도한다.
 */
export const ensureHermesSession = async (
  config: HermesBackendConfig,
  sessionId: string,
  titleText?: string
): Promise<void> => {
  const url = `${config.baseUrl}/api/sessions/${encodeURIComponent(sessionId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: requestHeaders(config),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.ok) return;
  if (res.status !== 404) {
    throw new HermesApiError(await readHermesErrorMessage(res), res.status);
  }

  const title = titleText ? buildTitle(titleText) : undefined;
  let createRes = await createHermesSession(config, sessionId, title);
  if (!createRes.ok && createRes.status === 400 && title) {
    createRes = await createHermesSession(config, sessionId);
  }
  if (createRes.ok || createRes.status === 409) return;
  throw new HermesApiError(await readHermesErrorMessage(createRes), createRes.status);
};

/** Hermes 세션 트랜스크립트의 한 줄 (툴 결과·reasoning 백필에 쓴다). */
export interface HermesTranscriptMessage {
  role: string;
  content?: string | null;
  tool_name?: string | null;
  tool_call_id?: string | null;
  tool_calls?: {
    id?: string;
    call_id?: string;
    function?: { name?: string; arguments?: string };
  }[];
  reasoning?: string | null;
  reasoning_content?: string | null;
  finish_reason?: string | null;
}

/** `GET /api/sessions/{id}/messages` 응답. */
interface HermesMessagesResponse {
  data?: unknown;
}

/** 세션 트랜스크립트를 읽는다 — 실패해도 대화는 계속되도록 빈 배열로 폴백한다. */
export const readHermesSessionMessages = async (
  config: HermesBackendConfig,
  sessionId: string,
  limit = 200
): Promise<HermesTranscriptMessage[]> => {
  try {
    const res = await fetch(
      `${config.baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/messages?limit=${limit}`,
      { headers: requestHeaders(config), signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS) }
    );
    if (!res.ok) return [];
    const body = (await res.json()) as HermesMessagesResponse;
    return Array.isArray(body.data) ? (body.data as HermesTranscriptMessage[]) : [];
  } catch {
    return [];
  }
};

const parseSSEFrame = <TData>(frame: string): HermesSseFrame<TData> | null => {
  let eventName: string | undefined;
  const dataLines: string[] = [];

  for (const rawLine of frame.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (!line || line.startsWith(":")) continue; // keepalive 주석
    if (line.startsWith("event:")) eventName = line.slice("event:".length).trim();
    else if (line.startsWith("data:"))
      dataLines.push(line.slice("data:".length).trimStart());
  }

  if (dataLines.length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(dataLines.join("\n"));
    if (!parsed || typeof parsed !== "object") return null;
    return { type: eventName ?? "message", data: parsed as TData };
  } catch {
    return null;
  }
};

/** SSE 본문을 프레임 단위로 파싱해 named 이벤트를 순서대로 흘려보낸다. */
export const readHermesSSE = async function* <TData>(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<HermesSseFrame<TData>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = parseSSEFrame<TData>(frame);
        if (event) yield event;
        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
};
