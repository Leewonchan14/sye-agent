import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => {
  return twMerge(clsx(inputs));
};

interface MessagePart {
  type: string;
  text?: string;
}

interface MessageWithParts {
  parts?: MessagePart[];
}

const getTextParts = (msg: MessageWithParts) =>
  msg.parts?.filter(
    (p): p is MessagePart & { text: string } => p.type === "text" && p.text != null
  ) ?? [];

const getReasoningParts = (msg: MessageWithParts) =>
  msg.parts?.filter(
    (p): p is MessagePart & { text: string } => p.type === "reasoning" && p.text != null
  ) ?? [];

const extractText = (msg: MessageWithParts): string =>
  getTextParts(msg)
    .map((p) => p.text)
    .join("");

const extractReasoning = (msg: MessageWithParts): string | undefined => {
  const parts = getReasoningParts(msg);
  return parts.length > 0 ? parts.map((p) => p.text).join("\n\n") : undefined;
};

/**
 * 메시지 객체를 감싸서 `.extractText()`, `.extractReasoning()` 메서드로
 * text / reasoning 파트를 추출할 수 있게 해주는 헬퍼를 생성합니다.
 *
 * @example
 * const msg = createMessageHelper(message);
 * msg.extractText();      // → "Hello world"
 * msg.extractReasoning(); // → "I think..." | undefined
 */
export const createMessageHelper = (msg: MessageWithParts) => ({
  extractText: () => extractText(msg),
  extractReasoning: () => extractReasoning(msg),
});
