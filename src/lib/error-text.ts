import { APICallError, RetryError } from "ai";

const MAX_ERROR_LENGTH = 400;

/** 공백을 정리하고 길이를 줄여 토스트에 담기 좋은 한 줄 메시지로 만든다. */
const truncate = (text: string, maxLength = MAX_ERROR_LENGTH): string => {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length > maxLength
    ? `${singleLine.slice(0, maxLength)}…`
    : singleLine;
};

/** JSON 본문에서 사람이 읽을 메시지 필드를 찾는다. (`{ error: { message } }` 형태까지 따라간다) */
const pickMessage = (body: unknown): string | null => {
  if (typeof body === "string") return body;
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;

  const record = body as Record<string, unknown>;
  const nested = record.error ?? record.message ?? record.detail;
  return typeof nested === "string" ? nested : pickMessage(nested);
};

/**
 * 서버·프로바이더가 보낸 원문(JSON·HTML·일반 텍스트)에서 읽을 수 있는 메시지를 뽑아낸다.
 * 챗 transport는 실패 응답 본문을 그대로 `Error.message`에 담아 던지므로 그대로 쓰면
 * `{"error":"..."}` 같은 JSON이 사용자에게 노출된다.
 */
export const readableErrorText = (raw: string): string => {
  const text = raw.trim();
  if (!text) return "";
  // Next.js 등이 반환하는 HTML 에러 페이지는 그대로 보여줄 수 없다.
  if (text.startsWith("<")) return "";

  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const message = pickMessage(JSON.parse(text));
      if (message) return truncate(message);
    } catch {
      // JSON이 아니면 아래에서 원문을 그대로 사용한다.
    }
  }

  return truncate(text);
};

/**
 * AI SDK가 던진 오류를 사용자에게 보여줄 메시지로 바꾼다.
 * 스트림 중간에 발생한 오류는 서버의 `onError`를 거쳐 이 함수를 통과한 문자열로 전달된다.
 */
export const agentErrorMessage = (error: unknown): string => {
  if (RetryError.isInstance(error)) {
    // 재시도까지 모두 실패했다면 마지막 원인을 보여준다.
    return agentErrorMessage(error.lastError);
  }

  if (APICallError.isInstance(error)) {
    const status = error.statusCode ? `HTTP ${error.statusCode}` : "요청 실패";
    const body = error.responseBody ? readableErrorText(error.responseBody) : "";
    const detail = body && body !== error.message ? body : "";
    return truncate(
      [`LLM 호출 실패 (${status})`, error.message, detail].filter(Boolean).join(" · ")
    );
  }

  if (error instanceof Error) return truncate(error.message);

  return truncate(String(error));
};

const NETWORK_ERROR_PATTERN =
  /failed to fetch|networkerror|load failed|network request failed/i;

/** `useChat`의 `error`에서 토스트에 띄울 메시지를 만든다. */
export const chatErrorMessage = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : "";
  if (NETWORK_ERROR_PATTERN.test(raw)) {
    return "서버에 연결하지 못했어요. 네트워크 상태를 확인해주세요.";
  }
  return readableErrorText(raw) || "알 수 없는 오류가 발생했어요.";
};
