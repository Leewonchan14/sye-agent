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

/** 트랜스크립트의 tool 결과 문자열을 카드에 넣을 출력/오류로 나눈다. */
const parseToolResult = (raw: string): { output: unknown; errorText?: string } => {
  const text = raw.trim();
  if (!text) return { output: { status: "completed" } };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { output: text };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { output: parsed };
  }

  const record = parsed as Record<string, unknown>;
  const errorText =
    typeof record.error === "string" && record.error.trim()
      ? record.error.trim()
      : undefined;

  if (record.success === false || errorText) {
    return {
      output: parsed,
      errorText: errorText || asString(record.message) || "도구 실행에 실패했어요.",
    };
  }
  return { output: parsed };
};

/**
 * Hermes SSE 이벤트를 AI SDK UI 메시지 스트림 청크로 변환한다.
 *
 * 매핑:
 *  - `assistant.delta`                → text 파트 (중간 나레이션 + 최종 답변 전부, 순서대로)
 *  - `assistant.commentary`(미스트림)  → text 파트
 *  - `reasoning.delta`                → reasoning 파트 (모델의 실제 thinking, 스트리밍)
 *  - `tool.progress`(`_thinking`)     → reasoning 파트 (직전 텍스트의 에코는 건너뜀)
 *  - `tool.started/completed/failed`  → dynamic tool 파트
 *  - `assistant.completed`            → 델타로 안 흘러간 최종 텍스트만 보충 (중복 방지)
 *  - `run.completed`                  → 트랜스크립트 백필 (도구 결과 + thinking 폴백)
 *  - `error` / `run.failed`           → 예외로 전환 (스트림 오류 → 클라이언트 토스트)
 *
 * 참고: `tool.completed`에는 결과가 실리지 않아 `run.completed.messages`(턴 전체 트랜스크립트)에서
 * 채워 넣는다. thinking은 게이트웨이가 `reasoning.delta`로 중계해 주면 그대로 스트리밍하고
 * (게이트웨이 패치 — README 참고), 안 오는 서버에서는 같은 트랜스크립트로 턴 끝에 백필한다.
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
  /** 스트리밍 중 실제로 받은 thinking (에코 제외) — 백필 여부 판단에 쓴다. */
  private liveReasoning = "";
  /** 중계한 도구 호출 순서 — `run.completed` 트랜스크립트와 자리를 맞춘다. */
  private readonly relayedTools: { toolCallId: string; toolName: string }[] = [];
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
      case "reasoning.delta":
        // 모델의 실제 reasoning 델타 (게이트웨이가 reasoning_callback을 중계한 것)
        this.appendReasoning(asString(event.data.delta), false);
        break;
      case "tool.progress":
        // `_thinking` 진행 프리뷰 — 대개 방금 나간 텍스트의 에코라 에코는 걸러낸다.
        this.appendReasoning(asString(event.data.delta), true);
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
      case "run.completed":
        // 스트림에 안 실려 온 도구 결과와 실제 thinking을 여기서 채운다.
        this.onRunCompleted(event.data);
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

  /**
   * reasoning 파트로 텍스트를 흘린다.
   * `dropEcho`는 `tool.progress`(`_thinking`)용 — hachi wire의 그 프리뷰는 방금 스트리밍된
   * assistant 텍스트를 한 번 더 보내는 에코라서, 이미 나간 텍스트와 같으면 버린다
   * (그대로 두면 답변이 thinking으로 중복 표시된다). `reasoning.delta`는 실제 reasoning이라 그대로 쓴다.
   */
  private appendReasoning(delta: string, dropEcho: boolean): void {
    const text = delta.trim();
    if (!text || (dropEcho && this.streamedText.endsWith(text))) return;

    this.ensureStarted();
    if (!this.reasoningId) {
      this.reasoningId = `reasoning-${++this.reasoningCounter}`;
      this.writer.write({ type: "reasoning-start", id: this.reasoningId });
    }
    this.writer.write({ type: "reasoning-delta", id: this.reasoningId, delta });
    this.liveReasoning += delta;
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
    this.relayedTools.push({ toolCallId, toolName });
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
      this.relayedTools.push({ toolCallId, toolName });
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

  /** `run.completed`가 실어 온 턴 전체 트랜스크립트로 스트림의 빈 곳을 메운다. */
  private onRunCompleted(data: Record<string, unknown>): void {
    const messages = Array.isArray(data.messages)
      ? (data.messages as Record<string, unknown>[])
      : [];
    if (messages.length === 0) return;

    this.backfillToolResults(messages);
    this.backfillReasoning(messages);
  }

  /**
   * 도구 결과 백필 — `tool.completed` 이벤트에는 결과가 없고 트랜스크립트의
   * `role: "tool"` 메시지(`tool_call_id`로 연결)에만 있다.
   */
  private backfillToolResults(messages: Record<string, unknown>[]): void {
    const calls: { id: string; name: string }[] = [];
    const results = new Map<string, string>();

    for (const message of messages) {
      if (message.role === "assistant" && Array.isArray(message.tool_calls)) {
        for (const raw of message.tool_calls as Record<string, unknown>[]) {
          const id = asString(raw.id) || asString(raw.call_id);
          if (!id) continue;
          const fn = raw.function as Record<string, unknown> | undefined;
          calls.push({ id, name: asString(fn?.name) || "tool" });
        }
        continue;
      }
      if (message.role !== "tool") continue;
      const id = asString(message.tool_call_id);
      if (id) results.set(id, asString(message.content));
    }

    // 중계한 카드 순서와 트랜스크립트의 호출 순서는 같다. 이름이 안 맞으면 결과를
    // 잘못 붙이지 않도록 건너뛴다(카드에는 완료 상태만 남는다).
    let cursor = 0;
    for (const relayed of this.relayedTools) {
      const index = calls.findIndex(
        (call, position) => position >= cursor && call.name === relayed.toolName
      );
      if (index === -1) continue;
      cursor = index + 1;

      const result = results.get(calls[index].id);
      if (result === undefined) continue;

      const { output, errorText } = parseToolResult(result);
      if (errorText) {
        this.writer.write({
          type: "tool-output-error",
          toolCallId: relayed.toolCallId,
          errorText,
          dynamic: true,
        });
      } else {
        this.writer.write({
          type: "tool-output-available",
          toolCallId: relayed.toolCallId,
          output,
          dynamic: true,
        });
      }
    }
  }

  /**
   * thinking 백필 — 실서버는 실제 thinking을 스트리밍하지 않는다(스트리밍 중 오는
   * `_thinking`은 텍스트 에코). 트랜스크립트의 세그먼트별 `reasoning`을 한 블록으로 모아,
   * 스트리밍 중 진짜 thinking을 받은 적이 없을 때만 채운다.
   */
  private backfillReasoning(messages: Record<string, unknown>[]): void {
    if (this.liveReasoning.trim()) return;

    const segments: string[] = [];
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      const text = (
        asString(message.reasoning) || asString(message.reasoning_content)
      ).trim();
      if (text) segments.push(text);
    }
    if (segments.length === 0) return;

    this.ensureStarted();
    this.closeText();
    const reasoningId = `reasoning-${++this.reasoningCounter}`;
    this.writer.write({ type: "reasoning-start", id: reasoningId });
    this.writer.write({
      type: "reasoning-delta",
      id: reasoningId,
      delta: segments.join("\n\n"),
    });
    this.writer.write({ type: "reasoning-end", id: reasoningId });
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
