/**
 * OpenCode Go / Zen 다중 API 키 풀.
 *
 * 구독 키 하나가 5시간·주간·월간 한도를 소진하거나 계정 잔액이 비면(HTTP 402/429),
 * 같은 요청을 다음 키로 자동 재시도한다. 실패한 키는 `Retry-After`(없으면 기본값)만큼
 * 일시 차단되어 이후 선택에서 제외된다.
 *
 * 환경 변수
 * - `OPENCODE_GO_API_KEYS` / `OPENCODE_ZEN_API_KEYS`: 콤마·세미콜론·줄바꿈으로 구분한 키 목록
 * - `OPENCODE_GO_API_KEY` / `OPENCODE_ZEN_API_KEY`: 단일 키 (목록이 없을 때 쓰는 하위 호환 경로)
 * - Zen은 Go 키를 폴백으로 함께 사용한다 (기존 동작 유지)
 *
 * 같은 `x-opencode-session`(대화 세션) 안에서는 키를 고정해 프롬프트 캐시와 일관성을 유지한다.
 */

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** 한도 오류(402/429)에 `Retry-After`가 없을 때의 기본 차단 시간. */
const DEFAULT_BLOCK_MS = 5 * 60_000;
/** 키 무효/권한 오류(401/403) 차단 시간. 복구 가능성이 낮아 더 길게 잡는다. */
const AUTH_BLOCK_MS = 30 * 60_000;
/** 어떤 경우에도 이 시간보다 오래 차단하지 않는다. */
const MAX_BLOCK_MS = 24 * 60 * 60_000;

export interface OpenCodeKey {
  key: string;
  /** 로그용 지문. 키 원문을 로그에 남기지 않는다. */
  label: string;
  blockedUntil: number;
}

/** 환경 변수 값들을 키 목록으로 파싱한다. 구분자는 콤마·세미콜론·공백·줄바꿈. */
export const parseOpenCodeKeys = (values: readonly (string | undefined)[]): string[] => {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    for (const part of value.split(/[\s,;]+/)) {
      const key = part.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
};

const hash = (value: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

export class OpenCodeKeyPool {
  readonly keys: OpenCodeKey[];
  private cursor = 0;

  constructor(keys: readonly string[]) {
    this.keys = keys.map((key) => ({
      key,
      label: key.length <= 8 ? key : `…${key.slice(-4)}`,
      blockedUntil: 0,
    }));
  }

  get size(): number {
    return this.keys.length;
  }

  /** 차단되지 않은 키를 하나 고른다. 세션 ID가 있으면 해시로 고정하고, 없으면 라운드로빈. */
  pick(sessionId?: string, exclude?: ReadonlySet<string>): OpenCodeKey | undefined {
    const now = Date.now();
    const available = this.keys.filter(
      (entry) => entry.blockedUntil <= now && !exclude?.has(entry.key)
    );
    if (available.length === 0) return undefined;
    if (sessionId) return available[hash(sessionId) % available.length];
    const entry = available[this.cursor % available.length];
    this.cursor = (this.cursor + 1) % available.length;
    return entry;
  }

  /** 모두 차단된 상황에서도 가장 먼저 풀리는 키로 요청해 실제 오류를 그대로 확인할 수 있게 한다. */
  pickFallback(exclude?: ReadonlySet<string>): OpenCodeKey | undefined {
    const untried = this.keys.filter((entry) => !exclude?.has(entry.key));
    const candidates = untried.length > 0 ? untried : this.keys;
    return candidates.reduce<OpenCodeKey | undefined>(
      (best, entry) =>
        best === undefined || entry.blockedUntil < best.blockedUntil ? entry : best,
      undefined
    );
  }

  block(key: string, until: number): void {
    const entry = this.keys.find((candidate) => candidate.key === key);
    if (!entry) return;
    entry.blockedUntil = Math.max(entry.blockedUntil, until);
  }
}

/** `Retry-After` 헤더(초 단위 숫자 또는 HTTP 날짜)를 ms로 변환한다. */
const retryAfterMs = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, at - Date.now());
};

/** 이 응답이 키 로컬 실패(한도·자금·키 무효)인지 판정해 차단 시각(epoch ms)을 돌려준다. */
const keyBlockUntil = (response: Response): number | undefined => {
  const now = Date.now();
  const retryAfter = retryAfterMs(response.headers.get("retry-after"));
  if (response.status === 402 || response.status === 429) {
    return now + Math.min(retryAfter ?? DEFAULT_BLOCK_MS, MAX_BLOCK_MS);
  }
  if (response.status === 401 || response.status === 403) {
    return now + Math.min(Math.max(retryAfter ?? 0, AUTH_BLOCK_MS), MAX_BLOCK_MS);
  }
  return undefined;
};

/** 재시도에서 다시 쓸 수 있는 본문으로 바꾼다. (문자열/버퍼는 그대로, 1회성 스트림은 버퍼링) */
const reusableBody = async (
  body: BodyInit | null | undefined
): Promise<BodyInit | null | undefined> => {
  if (!body || typeof body === "string") return body;
  if (
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    body instanceof Blob ||
    body instanceof FormData ||
    body instanceof URLSearchParams
  ) {
    return body;
  }
  return new Response(body).arrayBuffer();
};

/**
 * 요청마다 키 풀에서 키를 골라 `Authorization: Bearer`를 주입하는 fetch 래퍼.
 * 키 로컬 실패(402/429/401/403)면 다음 키로 재시도하고, 그 외 상태(성공 포함)는 그대로 돌려준다.
 */
export const createOpenCodeRotatingFetch = (
  pool: OpenCodeKeyPool,
  providerName: string,
  baseFetch: FetchLike = fetch
): FetchLike => {
  return async (input, init) => {
    if (pool.size === 0) return baseFetch(input, init);

    const request = init ?? {};
    const headers = new Headers(request.headers);
    const sessionId = headers.get("x-opencode-session") ?? undefined;
    const body = await reusableBody(request.body);

    const tried = new Set<string>();
    let lastResponse: Response | undefined;

    for (let attempt = 0; attempt < pool.size; attempt++) {
      const entry = pool.pick(sessionId, tried) ?? pool.pickFallback(tried);
      if (!entry || tried.has(entry.key)) break;
      tried.add(entry.key);

      const attemptHeaders = new Headers(headers);
      attemptHeaders.set("Authorization", `Bearer ${entry.key}`);

      const response = await baseFetch(input, {
        ...request,
        headers: attemptHeaders,
        body,
      });

      const blockUntil = keyBlockUntil(response);
      if (blockUntil === undefined) return response;

      pool.block(entry.key, blockUntil);
      console.warn(
        `[${providerName}] 키 ${entry.label} 사용 불가(HTTP ${response.status}) → 다음 키로 재시도 (${tried.size}/${pool.size})`
      );
      lastResponse = response;
      await response.body?.cancel().catch(() => undefined);
    }

    return lastResponse ?? baseFetch(input, { ...request, headers });
  };
};

let goPool: OpenCodeKeyPool | undefined;
let zenPool: OpenCodeKeyPool | undefined;

/** 프로세스 전역 풀. 차단 상태를 요청 사이에 공유한다. */
export const getOpenCodeGoPool = (): OpenCodeKeyPool =>
  (goPool ??= new OpenCodeKeyPool(
    parseOpenCodeKeys([process.env.OPENCODE_GO_API_KEYS, process.env.OPENCODE_GO_API_KEY])
  ));

/** Zen은 전용 변수가 없으면 Go 키를 폴백으로 쓴다 (기존 동작 유지). */
export const getOpenCodeZenPool = (): OpenCodeKeyPool =>
  (zenPool ??= new OpenCodeKeyPool(
    parseOpenCodeKeys([
      process.env.OPENCODE_ZEN_API_KEYS,
      process.env.OPENCODE_ZEN_API_KEY,
      process.env.OPENCODE_GO_API_KEYS,
      process.env.OPENCODE_GO_API_KEY,
    ])
  ));
