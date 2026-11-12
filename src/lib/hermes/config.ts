/**
 * Hermes Agent 백엔드 설정.
 *
 * 채팅 백엔드는 Hermes 게이트웨이의 API 서버(프로필 프리픽스 `/p/<profile>/...`)다.
 * Next 서버가 Hermes 런 이벤트를 AI SDK UI 메시지 스트림으로 변환해 돌려준다.
 */

export interface HermesBackendConfig {
  /** Hermes API 서버 base URL(프로필 프리픽스 포함, 끝 슬래시 없음). 예: https://hermes.example.com/p/monitor */
  baseUrl: string;
  /** 서빙 프로필 전용 API_SERVER_KEY */
  apiKey: string;
  /** 앱 세션 ID → Hermes 세션 ID 프리픽스 (기본 `app-`) */
  sessionPrefix: string;
  /** 장기 기억 스코프(X-Hermes-Session-Key) — 사용자마다 따로 둔다. */
  sessionKey: string;
}

/** Hermes 백엔드에 필요한 env 중 빠진 것 목록. 비어 있으면 설정 완료. */
export const missingHermesEnv = (): string[] => {
  const missing: string[] = [];
  if (!process.env.HERMES_API_URL) missing.push("HERMES_API_URL");
  if (!process.env.HERMES_API_KEY) missing.push("HERMES_API_KEY");
  return missing;
};

/**
 * `userId`를 주면 장기 기억 스코프가 그 사용자로 갈린다 — 한 사용자의 대화·설정이
 * 다른 사용자의 답변에 섞이지 않는다. 사용자와 무관한 작업만 `userId` 없이 부른다.
 */
export const getHermesConfig = (userId?: string): HermesBackendConfig => {
  const baseKey = process.env.HERMES_SESSION_KEY || "app";
  return {
    baseUrl: (process.env.HERMES_API_URL ?? "").replace(/\/+$/, ""),
    apiKey: process.env.HERMES_API_KEY ?? "",
    sessionPrefix: process.env.HERMES_SESSION_PREFIX || "app-",
    sessionKey: userId ? `${baseKey}:user:${userId}` : baseKey,
  };
};

/**
 * 앱 세션 ID ↔ Hermes 세션 ID. 결정적(deterministic) 매핑이라 별도 DB 컬럼이 필요 없다.
 * 예: `9f3c…` → `app-9f3c…`
 */
export const toHermesSessionId = (
  config: HermesBackendConfig,
  sessionId: string
): string => `${config.sessionPrefix}${sessionId}`;
