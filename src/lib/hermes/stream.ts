import { isTextUIPart, type UIMessage, type UIMessageStreamWriter } from "ai";

import { getActiveInstructions } from "@/lib/db/instructions";

import { ensureHermesSession, openHermesChatStream, type HermesEvent } from "./client";
import { toHermesSessionId, type HermesBackendConfig } from "./config";

const asString = (value: unknown): string => (typeof value === "string" ? value : "");

const extractMessageText = (message: UIMessage): string =>
  message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("");

/**
 * DB의 활성 사용자 지시 사항(+선택 env 문구)을 `system_message`로 만든다.
 * Hermes는 이 값을 프로필 기본 프롬프트(SOUL) 위에 덧입힌다.
 */
const buildSystemMessage = async (): Promise<string | undefined> => {
  const sections: string[] = [];

  try {
    const activeList = await getActiveInstructions();
    const userPart = activeList
      .map((instruction) => `[${instruction.label}]\n${instruction.content}`)
      .join("\n\n---\n\n");
    if (userPart) sections.push(`## 사용자가 등록한 추가 지시사항\n${userPart}`);
  } catch (error) {
    // 지시 사항을 못 읽어도 대화는 계속된다 (DB 일시 오류 등).
    console.error("[chat:hermes] failed to load active instructions:", error);
  }

  const extra = (process.env.HERMES_SYSTEM_MESSAGE ?? "").trim();
  if (extra) sections.push(extra);

  return sections.length > 0 ? sections.join("\n\n") : undefined;
};

/**
 * Hermes SSE 이벤트를 AI SDK UI 메시지 스트림 청크로 변환한다.
 *
 * 매핑:
 *  - `assistant.delta`                → text 파트
 *  - `assistant.commentary`(미스트림)  → text 파트
 *  - `tool.progress`(`_thinking`)     → reasoning 파트
 *  - `tool.started/completed/failed`  → dynamic tool 파트
 *  - `assistant.completed`            → 델타로 안 흘러간 최종 텍스트만 보충 (중복 방지)
 *  - `error` / `run.failed`           → 예외로 전환 (스트림 오류 → 클라이언트 토스트)
 *
 * 참고: 이 버전의 Hermes wire는 도구 완료 이벤트에 결과 프리뷰가 실리지 않아
 * 도구 카드는 이름/인자 + 완료 상태까지만 보여준다.
 */
class HermesUIStreamRelay {
  private readonly writer: UIMessageStreamWriter;
  private started = false;
  private stepOpen = false;
  private textId: string | null = null;
  private reasoningId: string | null = null;
  private textCounter = 0;
  private reasoningCounter = 0;
  private toolCounter = 0;
  private streamedText = "";
  private readonly openToolCalls = new Map<string, string[]>();

  constructor(writer: UIMessageStreamWriter) {
    this.writer = writer;
  }

  handle(event: HermesEvent): void {
    switch (event.type) {
      case "run.started":
        this.ensureStarted();
        break;
      case "assistant.delta":
        this.appendText(asString(event.data.delta));
        break;
      case "assistant.commentary":
        this.appendCommentary(event.data);
        break;
      case "tool.progress":
        this.appendReasoning(asString(event.data.delta));
        break;
      case "tool.started":
        this.onToolStarted(event.data);
        break;
      case "tool.completed":
        this.onToolFinished(event.data, false);
        break;
      case "tool.failed":
        this.onToolFinished(event.data, true);
        break;
      case "assistant.completed":
        this.onAssistantCompleted(asString(event.data.content));
        break;
      case "run.failed":
        // 실서버 wire의 run.failed에는 error/message가 없고
        // turn_exit_reason(부분 응답·중단 등)만 실린다.
        throw new Error(
          asString(event.data.turn_exit_reason) ||
            asString(event.data.error) ||
            asString(event.data.message) ||
            (event.data.partial === true
              ? "하치 응답이 중간에 끊겼어요. (부분 응답)"
              : "하치 실행이 실패했어요.")
        );
      case "error":
        throw new Error(
          asString(event.data.message) || "Hermes 실행 중 오류가 발생했어요."
        );
      case "approval.request":
        // 웹앱에는 승인 UI가 없다 — 무인 실행이 멈추지 않도록 바로 실패시킨다.
        // (hachi 프로필에서 승인 대기가 발생하지 않도록 설정해야 한다.)
        throw new Error(
          "승인이 필요한 작업이 발생했어요. hachi 프로필의 승인(approval) 설정을 확인해 주세요."
        );
      default:
        // message.started / run.completed / run.cancelled / done 등은 상태 이벤트라 무시한다.
        break;
    }
  }

  /** 스트림 정상 종료 — 열린 파트/단계를 닫고 finish를 보낸다. */
  finish(): void {
    this.ensureStarted();
    this.closeText();
    this.closeReasoning();
    this.failOpenToolCalls("도구 실행이 끝나기 전에 스트림이 종료됐어요.");
    if (this.stepOpen) {
      this.writer.write({ type: "finish-step" });
      this.stepOpen = false;
    }
    this.writer.write({ type: "finish", finishReason: "stop" });
  }

  /** 예외로 끝날 때 — 열린 파트만 정리한 뒤 오류를 다시 던지게 한다. */
  abortOpenParts(): void {
    this.closeText();
    this.closeReasoning();
    this.failOpenToolCalls("도구 실행이 중단됐어요.");
  }

  private ensureStarted(): void {
    if (this.started) return;
    this.started = true;
    this.writer.write({ type: "start" });
    this.openStep();
  }

  private openStep(): void {
    if (this.stepOpen) return;
    this.stepOpen = true;
    this.writer.write({ type: "start-step" });
  }

  private appendText(delta: string): void {
    if (!delta) return;
    this.ensureStarted();
    if (!this.textId) {
      this.textId = `text-${++this.textCounter}`;
      this.writer.write({ type: "text-start", id: this.textId });
    }
    this.writer.write({ type: "text-delta", id: this.textId, delta });
    this.streamedText += delta;
  }

  private appendCommentary(data: Record<string, unknown>): void {
    if (data.already_streamed === true) return; // 델타로 이미 나간 텍스트
    const text = asString(data.text);
    if (!text || this.streamedText.includes(text)) return;
    this.appendText(
      (this.streamedText && !this.streamedText.endsWith("\n") ? "\n\n" : "") + text
    );
  }

  private appendReasoning(delta: string): void {
    if (!delta) return;
    this.ensureStarted();
    if (!this.reasoningId) {
      this.reasoningId = `reasoning-${++this.reasoningCounter}`;
      this.writer.write({ type: "reasoning-start", id: this.reasoningId });
    }
    this.writer.write({ type: "reasoning-delta", id: this.reasoningId, delta });
  }

  private onToolStarted(data: Record<string, unknown>): void {
    this.ensureStarted();
    this.closeText();
    this.closeReasoning();

    const toolName = asString(data.tool_name) || "tool";
    const toolCallId = `hermes-tool-${++this.toolCounter}`;
    const input = this.toolInputFrom(data);

    this.writer.write({ type: "tool-input-start", toolCallId, toolName, dynamic: true });
    this.writer.write({
      type: "tool-input-available",
      toolCallId,
      toolName,
      input,
      dynamic: true,
    });

    const queue = this.openToolCalls.get(toolName) ?? [];
    queue.push(toolCallId);
    this.openToolCalls.set(toolName, queue);
  }

  private onToolFinished(data: Record<string, unknown>, failed: boolean): void {
    this.ensureStarted();
    this.closeText();
    this.closeReasoning();

    const toolName = asString(data.tool_name) || "tool";
    const queue = this.openToolCalls.get(toolName);
    let toolCallId = queue?.shift();

    if (!toolCallId) {
      // tool.started 없이 결과만 온 경우 — 카드가 비지 않게 합성해서 채운다.
      toolCallId = `hermes-tool-${++this.toolCounter}`;
      this.writer.write({
        type: "tool-input-start",
        toolCallId,
        toolName,
        dynamic: true,
      });
      this.writer.write({
        type: "tool-input-available",
        toolCallId,
        toolName,
        input: {},
        dynamic: true,
      });
    }

    const preview = asString(data.preview);
    if (failed) {
      this.writer.write({
        type: "tool-output-error",
        toolCallId,
        errorText: preview || "도구 실행에 실패했어요.",
        dynamic: true,
      });
    } else {
      this.writer.write({
        type: "tool-output-available",
        toolCallId,
        output: preview || { status: "completed" },
        dynamic: true,
      });
    }
  }

  private onAssistantCompleted(content: string): void {
    const text = content.trim();
    if (!text || this.streamedText.includes(text)) return;
    this.appendText(
      (this.streamedText && !this.streamedText.endsWith("\n") ? "\n\n" : "") + text
    );
  }

  private toolInputFrom(data: Record<string, unknown>): unknown {
    if (data.args !== undefined && data.args !== null) return data.args;
    const preview = asString(data.preview);
    return preview ? { preview } : {};
  }

  private failOpenToolCalls(errorText: string): void {
    for (const queue of this.openToolCalls.values()) {
      for (const toolCallId of queue) {
        this.writer.write({
          type: "tool-output-error",
          toolCallId,
          errorText,
          dynamic: true,
        });
      }
      queue.length = 0;
    }
  }

  private closeText(): void {
    if (!this.textId) return;
    this.writer.write({ type: "text-end", id: this.textId });
    this.textId = null;
  }

  private closeReasoning(): void {
    if (!this.reasoningId) return;
    this.writer.write({ type: "reasoning-end", id: this.reasoningId });
    this.reasoningId = null;
  }
}

export interface HermesTurnOptions {
  writer: UIMessageStreamWriter;
  config: HermesBackendConfig;
  sessionId: string;
  uiMessages: UIMessage[];
  abortSignal?: AbortSignal;
}

/**
 * 한 번의 사용자 턴을 Hermes(hachi 프로필)로 실행하고 UI 스트림으로 중계한다.
 * Hermes가 세션 히스토리를 소유하며, 앱 세션 ID는 `sye-<id>`로 결정적으로 매핑된다.
 * (프론트 UI 히스토리는 기존대로 Neon `session_state`에도 저장된다 — 라우트의 onEnd.)
 */
export const runHermesTurn = async (options: HermesTurnOptions): Promise<void> => {
  const { writer, config, sessionId, uiMessages, abortSignal } = options;

  const lastMessage = uiMessages.at(-1);
  if (!lastMessage || lastMessage.role !== "user") {
    throw new Error(
      "새 사용자 메시지가 필요해요. (이전 응답 재생성은 아직 지원되지 않아요)"
    );
  }

  const userText = extractMessageText(lastMessage).trim();
  if (!userText) throw new Error("보낼 사용자 메시지가 비어 있어요.");

  const hermesSessionId = toHermesSessionId(config, sessionId);
  const systemMessage = await buildSystemMessage();

  await ensureHermesSession(config, hermesSessionId, userText);

  const events = await openHermesChatStream(config, hermesSessionId, {
    userMessage: userText,
    systemMessage,
    signal: abortSignal,
  });

  const relay = new HermesUIStreamRelay(writer);
  try {
    for await (const event of events) {
      relay.handle(event);
    }
  } catch (error) {
    relay.abortOpenParts();
    throw error;
  }
  relay.finish();
};
