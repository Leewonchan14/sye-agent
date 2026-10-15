/**
 * Hermes Agent(hachi 프로필) 백엔드 설정.
 *
 * `LLM_BACKEND=hermes`이면 sye-agent의 agent loop 대신 Hermes 멀티플렉스 게이트웨이의
 * API 서버(hachi 프로필, `/p/hachi/...`)가 대화를 실행한다. 프론트엔드는 그대로이고,
 * Next 서버가 Hermes SSE를 AI SDK UI 메시지 스트림으로 변환해 돌려준다.
 *
 * hachi 쪽 준비: `API_SERVER_ENABLED=true` + `API_SERVER_KEY=<비밀 키>` 후 게이트웨이 재시작,
 * 외부(예: Vercel)에서는 터널로 `127.0.0.1:8642`의 `/p/hachi/*`만 노출한다.
 */

export type ChatBackend = "ai-sdk" | "hermes";

/** 기본값은 기존(ToolLoopAgent) 백엔드 — 배포에서 `LLM_BACKEND=hermes`로 전환한다. */
export const getChatBackend = (): ChatBackend =>
  process.env.LLM_BACKEND === "hermes" ? "hermes" : "ai-sdk";

export interface HermesBackendConfig {
  /** Hermes API 서버 base URL(프로필 프리픽스 포함, 끝 슬래시 없음). 예: https://hermes.example.com/p/hachi */
  baseUrl: string;
  /** hachi 프로필 전용 API_SERVER_KEY */
  apiKey: string;
  /** 앱 세션 ID → Hermes 세션 ID 프리픽스 (기본 `sye-`) */
  sessionPrefix: string;
  /** 장기 기억 스코프(X-Hermes-Session-Key) — 웹앱 대화를 하나의 사용자로 취급한다. */
  sessionKey: string;
}

/** Hermes 백엔드에 필요한 env 중 빠진 것 목록. 비어 있으면 설정 완료. */
export const missingHermesEnv = (): string[] => {
  const missing: string[] = [];
  if (!process.env.HERMES_API_URL) missing.push("HERMES_API_URL");
  if (!process.env.HERMES_API_KEY) missing.push("HERMES_API_KEY");
  return missing;
};

export const getHermesConfig = (): HermesBackendConfig => ({
  baseUrl: (process.env.HERMES_API_URL ?? "").replace(/\/+$/, ""),
  apiKey: process.env.HERMES_API_KEY ?? "",
  sessionPrefix: process.env.HERMES_SESSION_PREFIX || "sye-",
  sessionKey: process.env.HERMES_SESSION_KEY || "sye-agent",
});

/**
 * 앱 세션 ID ↔ Hermes 세션 ID. 결정적(deterministic) 매핑이라 별도 DB 컬럼이 필요 없다.
 * 예: `9f3c…` → `sye-9f3c…`
 */
export const toHermesSessionId = (
  config: HermesBackendConfig,
  sessionId: string
): string => `${config.sessionPrefix}${sessionId}`;
