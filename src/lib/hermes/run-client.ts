import {
  HermesApiError,
  hermesRequestHeaders,
  readHermesErrorMessage,
  readHermesSSE,
} from "./client";
import type { HermesBackendConfig } from "./config";

/**
 * Hermes **디태치 런** API 클라이언트 — `/v1/runs`.
 *
 * 세션 채팅 스트림(`/api/sessions/{id}/chat/stream`)은 SSE 클라이언트가 끊기면 게이트웨이가
 * 그 런을 인터럽트한다. Vercel 함수는 300초에서 죽으므로 긴 턴은 그때마다 작업이 파괴된다.
 * `/v1/runs`는 반대로 **런을 백그라운드로 돌리고 이벤트를 seq 순서로 보관**하므로,
 * 브라우저가 끊겨도 런은 계속되고 `last_seq`로 이어서 읽을 수 있다.
 */

/**
 * `/v1/runs/{id}/events` payload — 이벤트 종류에 따라 아래 필드 중 일부만 실린다.
 * (예: `message.delta`/`reasoning.delta`는 `delta`, `tool.*`는 `tool`·`preview`,
 *  `run.completed|failed|cancelled`는 `output`·`error`·`turn_exit_reason`.)
 */
export interface HermesRunEventPayload {
  event?: string;
  run_id?: string;
  seq?: number;
  timestamp?: number;
  /** assistant 텍스트 / reasoning / 중간 나레이션 델타 */
  delta?: string;
  /** `message.interim`·`reasoning.available`의 텍스트 */
  text?: string;
  already_streamed?: boolean;
  /** tool.started / tool.completed / tool.failed */
  tool?: string;
  preview?: string;
  duration?: number;
  /** tool.completed는 boolean, run.failed는 문자열 */
  error?: boolean | string;
  /** run.completed / run.failed / run.cancelled */
  output?: string;
  turn_exit_reason?: string;
  completed?: boolean;
  partial?: boolean;
  interrupted?: boolean;
}

/** payload에 라우팅용 `event` 이름이 확정된 형태. */
export type HermesRunEvent = HermesRunEventPayload & { event: string };

/** `POST /v1/runs` 응답 — run_id만 쓰고 나머지는 무시한다. */
interface HermesRunStartResponse {
  run_id?: unknown;
  status?: unknown;
}

/** 런 시작 재시도 — 동시 실행 한도(429)·일시 오류(5xx)는 백오프와 함께 다시 시도한다. */
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const MAX_START_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 700;

/** 재시도 사이 대기. */
const sleep = (ms: number) => {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
};

/** `POST /v1/runs` — 런을 시작하고 run_id를 즉시 돌려받는다. */
export const startHermesRun = async (
  config: HermesBackendConfig,
  options: {
    sessionId: string;
    input: string;
    instructions?: string;
    signal?: AbortSignal;
  }
): Promise<string> => {
  const url = `${config.baseUrl}/v1/runs`;
  const body = JSON.stringify({
    input: options.input,
    session_id: options.sessionId,
    ...(options.instructions ? { instructions: options.instructions } : {}),
  });

  let lastError = new HermesApiError("Hermes 백엔드에 연결하지 못했어요.");

  for (let attempt = 1; attempt <= MAX_START_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: hermesRequestHeaders(config),
        body,
        signal: options.signal,
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      const detail = error instanceof Error ? error.message : String(error);
      lastError = new HermesApiError(`Hermes 백엔드에 연결하지 못했어요: ${detail}`);
      if (attempt < MAX_START_ATTEMPTS) {
        await sleep(RETRY_BASE_DELAY_MS * attempt);
        continue;
      }
      throw lastError;
    }

    if (res.ok) {
      const parsed = (await res.json()) as HermesRunStartResponse;
      if (typeof parsed.run_id !== "string" || !parsed.run_id) {
        throw new HermesApiError("Hermes가 run_id를 돌려주지 않았어요.");
      }
      return parsed.run_id;
    }

    lastError = new HermesApiError(await readHermesErrorMessage(res), res.status);
    if (attempt < MAX_START_ATTEMPTS && RETRYABLE_STATUS.has(res.status)) {
      await sleep(RETRY_BASE_DELAY_MS * attempt);
      continue;
    }
    throw lastError;
  }

  throw lastError;
};

/** `GET /v1/runs/{id}/events?last_seq=` — seq 이후 이벤트를 재생하고 이어서 흘려보낸다. */
export const openHermesRunEvents = async (
  config: HermesBackendConfig,
  runId: string,
  fromSeq: number,
  signal?: AbortSignal
): Promise<AsyncGenerator<HermesRunEvent>> => {
  const url = `${config.baseUrl}/v1/runs/${encodeURIComponent(runId)}/events?last_seq=${fromSeq}`;
  const res = await fetch(url, { headers: hermesRequestHeaders(config), signal });
  if (!res.ok || !res.body) {
    throw new HermesApiError(await readHermesErrorMessage(res), res.status);
  }

  const sse = readHermesSSE<HermesRunEventPayload>(res.body);
  return (async function* () {
    for await (const frame of sse) {
      yield { ...frame.data, event: frame.data.event ?? frame.type };
    }
  })();
};

export interface HermesRunStatus {
  status: string;
  output?: string;
  error?: string;
  partial?: boolean;
  interrupted?: boolean;
  turn_exit_reason?: string;
}

/** `GET /v1/runs/{id}` — 폴링 가능한 런 상태 (끊긴 뒤 최종 결과 회수용). */
export const getHermesRunStatus = async (
  config: HermesBackendConfig,
  runId: string
): Promise<HermesRunStatus | null> => {
  try {
    const res = await fetch(`${config.baseUrl}/v1/runs/${encodeURIComponent(runId)}`, {
      headers: hermesRequestHeaders(config),
    });
    if (!res.ok) return null;
    return (await res.json()) as HermesRunStatus;
  } catch {
    return null;
  }
};

/** `POST /v1/runs/{id}/stop` — 사용자가 정지를 눌렀을 때만 런을 끊는다. */
export const stopHermesRun = async (
  config: HermesBackendConfig,
  runId: string
): Promise<void> => {
  try {
    await fetch(`${config.baseUrl}/v1/runs/${encodeURIComponent(runId)}/stop`, {
      method: "POST",
      headers: hermesRequestHeaders(config),
    });
  } catch {
    // 정지 실패는 사용자에게 알리지 않는다 — 스트림은 이미 닫혔다.
  }
};
