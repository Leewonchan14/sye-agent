import type { UIMessageStreamWriter } from "ai";

import {
  appendChatTurnFrames,
  finalizeChatTurnIfOwnerGone,
  readChatTurnFrames,
  touchChatTurnWriter,
  updateChatTurn,
  type ChatTurn,
  type ChatTurnFrame,
} from "@/lib/db/turn";

import { readHermesSessionMessages, type HermesTranscriptMessage } from "./client";
import type { HermesBackendConfig } from "./config";
import {
  getHermesRunStatus,
  openHermesRunEvents,
  type HermesRunEvent,
} from "./run-client";

type UIMessageChunk = Parameters<UIMessageStreamWriter["write"]>[0];

const asString = (value: unknown): string => (typeof value === "string" ? value : "");

/** 트랜스크립트 도구 결과 JSON에서 앱이 해석하는 필드 (나머지는 output으로 그대로 보여준다). */
interface ToolResultEnvelope {
  output?: unknown;
  error?: unknown;
  success?: unknown;
  message?: unknown;
}

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

  const result: ToolResultEnvelope = parsed;
  const errorText =
    typeof result.error === "string" && result.error.trim()
      ? result.error.trim()
      : undefined;

  if (result.success === false || errorText) {
    return {
      output: parsed,
      errorText: errorText || asString(result.message) || "도구 실행에 실패했어요.",
    };
  }
  return { output: parsed };
};

/** 턴 종료 시 회수하는 필드 — 런 이벤트나 런 상태 조회에서 온다. */
interface TurnTerminalFields {
  output?: string;
  error?: string | boolean;
  turn_exit_reason?: string;
}

/** 프레임에서 파싱하는 도구 호출 한 건. */
interface TranscriptToolCall {
  id: string;
  name: string;
  args: string | undefined;
}

export interface TurnStreamOptions {
  writer: UIMessageStreamWriter;
  config: HermesBackendConfig;
  /** 앱 세션 id (chat_turns 키). */
  sessionId: string;
  /** Hermes 세션 id (`sye-…`) — 트랜스크립트 백필에 쓴다. */
  hermesSessionId: string;
  /** 이어받기 상태 (새 턴이면 nextOffset = 0). */
  turn: ChatTurn;
  /** 이 호출에서 스트림을 열어 두는 최대 시간 — Vercel 함수 한도 전에 스스로 닫는다. */
  softDeadlineMs: number;
  /** 재개일 때 클라이언트가 받은 마지막 지점 (이 offset부터 프레임을 재생한다). */
  replayFromOffset?: number;
  /** 이 릴레이의 writer 리스 id (`chat_turns.writer_id`). */
  writerId: string;
  /**
   * true면 프레임 로그를 쓰지 않고 **중계만** 한다 — 다른 릴레이가 살아 있는 writer일 때.
   * 재개 요청이 동시에 여러 개 붙어도 로그가 섞이지 않게 하는 핵심.
   */
  readOnly?: boolean;
  signal?: AbortSignal;
}

/**
 * Hermes 디태치 런(`/v1/runs`) 이벤트를 AI SDK UI 스트림으로 중계한다.
 *
 * - 모든 UI 청크를 offset과 함께 `chat_turn_frames`에 적어 두고,
 *   파트 경계마다 `message-metadata`로 "여기까지는 안전하게 이어받을 수 있다"를 알린다.
 * - 소프트 데드라인(Vercel 함수 한도보다 짧게)에 걸리면 **finish 없이** 스트림을 닫는다.
 *   브라우저는 커서를 들고 재개 라우트로 다시 붙고, 런은 그대로 살아 있다.
 * - 브라우저가 떠나도(탭 닫힘·새로고침) **중계만 멈추고 기록은 계속한다** — 턴이 끝날 때까지
 *   프레임을 남겨 두면 다음 방문이 offset 0부터 재생해 턴 전체를 되살릴 수 있다.
 * - 런이 끝나면 트랜스크립트에서 도구 인자·결과와 thinking을 백필하고 finish를 보낸다.
 */
class TurnStreamRelay {
  private readonly writer: UIMessageStreamWriter;
  private readonly config: HermesBackendConfig;
  private readonly sessionId: string;
  private readonly hermesSessionId: string;
  private readonly runId: string;
  private readonly softDeadlineMs: number;
  private readonly signal?: AbortSignal;
  private readonly replayFromOffset?: number;
  private readonly writerId: string;
  private readonly readOnly: boolean;
  private readonly startedTerminal: boolean;

  private offset: number;
  private counter: number;
  private hermesSeq: number;
  private readonly parts: { startOffset: number; open: boolean }[] = [];
  private readonly partIndexById = new Map<string, number>();
  private readonly openToolCalls = new Map<string, string[]>();
  private readonly toolNameByCallId = new Map<string, string>();
  private readonly relayedTools: { toolCallId: string; toolName: string }[] = [];
  /** 도구 종료 직후 도착하는 `tool.result`를 붙일 카드 찾기용 (턴 단위로만 쓴다). */
  private readonly completedTools: { toolCallId: string; toolName: string }[] = [];
  private readonly toolCallIdByHermesId = new Map<string, string>();
  private readonly erroredToolCallIds = new Set<string>();
  private textId: string | null = null;
  private reasoningId: string | null = null;
  private streamedText = "";
  private liveReasoning = "";
  private started = false;
  private stepOpen = false;
  private pending: ChatTurnFrame[] = [];
  private metadataDirty = false;
  private closed = false;
  /**
   * 클라이언트(브라우저)가 떠났는지 — true면 중계(쓰기)만 포기하고 **기록은 계속한다**.
   * 그래야 탭을 닫아도 턴이 `chat_turn_frames`에 완전히 남고, 다음 방문이 offset 0부터
   * 재생해 턴 전체(답변 포함)를 되살릴 수 있다.
   */
  private writerGone = false;
  /** 다른 릴레이가 리스를 인계받았는지 — true면 기록을 멈춘다. */
  private leaseLost = false;

  constructor(options: TurnStreamOptions) {
    this.writer = options.writer;
    this.config = options.config;
    this.sessionId = options.sessionId;
    this.hermesSessionId = options.hermesSessionId;
    this.runId = options.turn.hermesRunId;
    this.softDeadlineMs = options.softDeadlineMs;
    this.signal = options.signal;
    this.replayFromOffset = options.replayFromOffset;
    this.writerId = options.writerId;
    this.readOnly = options.readOnly === true;
    this.startedTerminal = options.turn.status !== "running";

    this.offset = options.turn.nextOffset;
    this.counter = options.turn.nextOffset;
    this.hermesSeq = options.turn.hermesSeq;
    // 이미 프레임이 있는 턴을 이어받는 중 — `start`/`start-step`을 다시 보내면
    // 클라이언트에 step-start 파트가 중복 생긴다.
    this.started = options.turn.nextOffset > 0;
    this.stepOpen = this.started;
  }

  async run(): Promise<void> {
    if (this.replayFromOffset !== undefined) {
      // 로그 전체를 읽어 상태(열린 파트·도구 카드·스트리밍 텍스트)를 복원하고,
      // 클라이언트가 받은 지점 이후만 실제로 흘려보낸다.
      const frames = await readChatTurnFrames(this.sessionId, 0);
      for (const frame of frames) {
        if (frame.offset >= this.replayFromOffset) {
          this.writeToClient(frame.chunk);
        }
        this.applyChunk(frame.chunk, frame.offset);
      }
      if (this.startedTerminal) {
        // 이미 끝난 턴의 재생 — 프레임에 든 metadata(streamDone: true 포함)가 정답이다.
        // 여기서 새 커서를 만들면 "아직 진행 중"으로 덮여 화면이 계속 이어받기를 시도한다.
        this.metadataDirty = false;
        this.pending = [];
        return;
      }
      // 살아 있는 턴 — 재생 직후 커서를 한 번 내보내 이어받기 지점을 확정한다.
      // (읽기 전용 릴레이는 기록하지 않는다 — writer의 로그가 유일한 진실이다.)
      if (!this.readOnly) await this.persist();
    }
    if (this.startedTerminal) return; // 이미 끝난 턴 — 재생만으로 복원된다

    await this.consumeEvents();
  }

  /* ── 이벤트 소비 ── */

  private async consumeEvents(): Promise<void> {
    const abort = new AbortController();
    let softStopped = false;

    const deadlineTimer = setTimeout(() => {
      softStopped = true;
      abort.abort();
    }, this.softDeadlineMs);
    /**
     * 브라우저가 떠났다(탭 닫힘·새로고침·네트워크) — **런도, 기록도 끊지 않는다**.
     * 중계만 멈추고 스트림이 끝날 때까지 프레임을 내구화해 두면, 다음 방문이
     * offset 0부터 재생해 턴 전체를 복구할 수 있다. 런을 실제로 멈추는 건
     * `POST /api/chat/{sessionId}/cancel`뿐이다.
     */
    const onAbort = () => {
      this.writerGone = true;
    };
    this.signal?.addEventListener("abort", onAbort, { once: true });

    // writer 리스 heartbeat — 살아 있음을 알리고, 인계당했으면 조용히 기록을 멈춘다.
    const heartbeat = setInterval(() => {
      void this.beat();
    }, 5_000);

    try {
      const events = await openHermesRunEvents(
        this.config,
        this.runId,
        this.hermesSeq,
        abort.signal
      );
      for await (const event of events) {
        if (typeof event.seq === "number") this.hermesSeq = event.seq;
        await this.handleEvent(event);
        if (this.closed || this.leaseLost) break;
        await this.maybePersist();
      }

      if (!this.closed && !softStopped) {
        // 스트림이 터미널 이벤트 없이 닫혔다 — 상태 조회로 마무리한다.
        const status = await getHermesRunStatus(this.config, this.runId);
        if (status && status.status !== "running") {
          await this.finish(status.status, {
            output: status.output,
            error: status.error,
            turn_exit_reason: status.turn_exit_reason,
          });
        }
      }
    } catch (error) {
      if (!softStopped) {
        /**
         * 런 이벤트 스트림이 만료(404 `run_not_found`)됐거나 끊겨도 런 상태는 남아 있다
         * (`GET /v1/runs/{id}`). 404를 그대로 실패로 마감하면 **완주한 턴이 failed로 기록**되므로,
         * 먼저 런 상태로 마감하고 진짜 running일 때만 실패로 닫는다.
         */
        const status = await getHermesRunStatus(this.config, this.runId).catch(() => null);
        if (status && status.status !== "running") {
          await this.finish(status.status, {
            output: status.output,
            error: status.error,
            turn_exit_reason: status.turn_exit_reason,
          });
        } else {
          await this.close(
            "failed",
            error instanceof Error ? error.message : String(error)
          );
        }
      }
    } finally {
      clearTimeout(deadlineTimer);
      clearInterval(heartbeat);
      this.signal?.removeEventListener("abort", onAbort);
      abort.abort();
      // 소프트 데드라인/함수 종료 — 남은 프레임을 내구화하고 조용히 닫는다.
      // (브라우저가 떠난 경우에도 여기까지 모은 프레임은 남는다.)
      if (!this.closed) await this.persist();
    }
  }

  private async handleEvent(event: HermesRunEvent): Promise<void> {
    switch (event.event) {
      case "reasoning.delta":
        this.appendReasoning(asString(event.delta), false);
        break;
      case "reasoning.available":
        // 진행 프리뷰(직전 텍스트의 에코) — 실제 thinking은 reasoning.delta로 온다.
        this.appendReasoning(asString(event.text), true);
        break;
      case "message.delta":
        this.appendText(asString(event.delta));
        break;
      case "message.interim": {
        if (event.already_streamed === true) break; // 델타로 이미 나간 텍스트
        const text = asString(event.text);
        if (!text || this.streamedText.includes(text)) break;
        this.appendText(
          (this.streamedText && !this.streamedText.endsWith("\n") ? "\n\n" : "") + text
        );
        break;
      }
      case "tool.started":
        this.onToolStarted(event);
        break;
      case "tool.completed":
        this.onToolFinished(event, event.error === true);
        break;
      case "tool.failed":
        this.onToolFinished(event, true);
        break;
      case "tool.result":
        this.onToolResult(event);
        break;
      case "run.completed":
        await this.finish("completed", event);
        break;
      case "run.failed":
        await this.finish("failed", event);
        break;
      case "run.cancelled":
        await this.finish("cancelled", event);
        break;
      default:
        // subagent.*, hermes.status, replay.truncated 등은 카드/텍스트가 아니다.
        break;
    }
  }

  /* ── 파트 쓰기 ── */

  private appendText(delta: string): void {
    if (!delta) return;
    this.ensureStarted();
    if (!this.textId) {
      this.textId = `text-${++this.counter}`;
      this.emit({ type: "text-start", id: this.textId } as UIMessageChunk);
    }
    this.emit({ type: "text-delta", id: this.textId, delta } as UIMessageChunk);
  }

  /**
   * reasoning 파트로 텍스트를 흘린다.
   * `dropEcho`는 진행 프리뷰(`reasoning.available`)용 — 방금 나간 텍스트의 에코라 걸러낸다.
   */
  private appendReasoning(delta: string, dropEcho: boolean): void {
    const text = delta.trim();
    if (!text || (dropEcho && this.streamedText.endsWith(text))) return;

    this.ensureStarted();
    if (!this.reasoningId) {
      this.reasoningId = `reasoning-${++this.counter}`;
      this.emit({ type: "reasoning-start", id: this.reasoningId } as UIMessageChunk);
    }
    this.emit({
      type: "reasoning-delta",
      id: this.reasoningId,
      delta,
    } as UIMessageChunk);
  }

  private onToolStarted(event: HermesRunEvent): void {
    this.ensureStarted();
    this.closeText();
    this.closeReasoning();

    const toolName = asString(event.tool) || "tool";
    const preview = asString(event.preview);
    const toolCallId = `hermes-tool-${++this.counter}`;

    this.emit({
      type: "tool-input-start",
      toolCallId,
      toolName,
      dynamic: true,
    } as UIMessageChunk);
    this.emit({
      type: "tool-input-available",
      toolCallId,
      toolName,
      input: preview ? { preview } : {},
      dynamic: true,
    } as UIMessageChunk);
  }

  private onToolFinished(event: HermesRunEvent, failed: boolean): void {
    this.ensureStarted();
    this.closeText();
    this.closeReasoning();

    const toolName = asString(event.tool) || "tool";
    const queue = this.openToolCalls.get(toolName);
    let toolCallId = queue?.shift();

    if (!toolCallId) {
      // tool.started 없이 결과만 온 경우 — 카드가 비지 않게 합성해서 채운다.
      toolCallId = `hermes-tool-${++this.counter}`;
      this.emit({
        type: "tool-input-start",
        toolCallId,
        toolName,
        dynamic: true,
      } as UIMessageChunk);
      this.emit({
        type: "tool-input-available",
        toolCallId,
        toolName,
        input: {},
        dynamic: true,
      } as UIMessageChunk);
    }

    // run 스트림의 preview는 잘린(≤500자) 결과 요약 — 턴이 끝날 때 트랜스크립트로 다시 채운다.
    const preview = asString(event.preview);
    if (failed) {
      this.emit({
        type: "tool-output-error",
        toolCallId,
        errorText: preview || "도구 실행에 실패했어요.",
        dynamic: true,
      } as UIMessageChunk);
    } else {
      this.emit({
        type: "tool-output-available",
        toolCallId,
        output: preview || { status: "completed" },
        dynamic: true,
      } as UIMessageChunk);
    }

    // 바로 뒤따르는 `tool.result`가 이 카드에 붙도록 매핑을 남긴다.
    if (failed) this.erroredToolCallIds.add(toolCallId);
    this.completedTools.push({ toolCallId, toolName });
    const hermesToolCallId = asString(event.tool_call_id);
    if (hermesToolCallId) this.toolCallIdByHermesId.set(hermesToolCallId, toolCallId);
  }

  /**
   * `tool.result` — 도구 종료 직후 서버가 보내는 결과 전문(상한 초과 시 `truncated`).
   * 턴이 끝나기 전에 카드를 채우고, 이후 트랜스크립트 백필은 더 긴 값으로 덮어쓰기만 한다.
   * 실패한 카드는 이미 에러 상태를 보여주므로 건드리지 않는다.
   */
  private onToolResult(event: HermesRunEvent): void {
    const toolName = asString(event.tool) || "tool";
    const hermesToolCallId = asString(event.tool_call_id);

    let toolCallId = hermesToolCallId
      ? this.toolCallIdByHermesId.get(hermesToolCallId)
      : undefined;
    if (!toolCallId) {
      // tool_call_id가 없는 서버(패치 이전)에서는 이름 FIFO로 맞춘다.
      const index = this.completedTools.findIndex((entry) => entry.toolName === toolName);
      const entry = index >= 0 ? this.completedTools.splice(index, 1)[0] : undefined;
      toolCallId = entry?.toolCallId;
    }
    if (!toolCallId || this.erroredToolCallIds.has(toolCallId)) return;
    if (hermesToolCallId) this.toolCallIdByHermesId.delete(hermesToolCallId);

    this.ensureStarted();
    const content = asString(event.content);
    const marker =
      event.truncated === true
        ? "\n\n… (여기까지만 보여줄게…! 턴이 끝나면 전체 결과로 다시 채운대…!)"
        : "";
    this.emit({
      type: "tool-output-available",
      toolCallId,
      output: content + marker,
      dynamic: true,
    } as UIMessageChunk);
  }

  private closeText(): void {
    if (!this.textId) return;
    this.emit({ type: "text-end", id: this.textId } as UIMessageChunk);
  }

  private closeReasoning(): void {
    if (!this.reasoningId) return;
    this.emit({ type: "reasoning-end", id: this.reasoningId } as UIMessageChunk);
  }

  private ensureStarted(): void {
    if (this.started) return;
    this.started = true;
    this.emit({ type: "start" } as UIMessageChunk);
    this.stepOpen = true;
    this.emit({ type: "start-step" } as UIMessageChunk);
  }

  /* ── 종료 ── */

  private async finish(status: string, event: TurnTerminalFields): Promise<void> {
    if (this.closed) return;

    // 1) 델타로 안 흘러간 최종 텍스트 보충
    const output = asString(event.output).trim();
    if (output && !this.streamedText.includes(output)) {
      this.appendText(
        (this.streamedText && !this.streamedText.endsWith("\n") ? "\n\n" : "") + output
      );
    }

    // 2) 트랜스크립트 백필 — 도구 인자/전체 결과 + thinking 폴백
    const transcript = await readHermesSessionMessages(this.config, this.hermesSessionId);
    this.backfillFromTranscript(transcript);

    // 3) 마감 청크 — 사용자가 정지한 경우(cancelled)는 오류가 아니라 조용히 끝낸다.
    this.closeText();
    this.closeReasoning();
    this.textId = null;
    this.reasoningId = null;
    const failed = status === "failed";
    const errorText = asString(event.error) || asString(event.turn_exit_reason);
    if (failed) {
      this.emit({
        type: "error",
        errorText: errorText || "하치 실행이 끊겼어요.",
      } as UIMessageChunk);
    }
    this.emit({
      type: "finish",
      finishReason: failed ? "error" : "stop",
    } as UIMessageChunk);
    this.stepOpen = false;
    this.closed = true;

    // 기록은 writer만 한다. 읽기 전용/인계당한 릴레이는 화면에 "끝"만 알린다.
    // 단, writer가 사라진 경우(소프트 데드라인 직후 재개)에는 조건부로 마감해
    // 완주한 턴이 'running'에 갇히지 않게 한다.
    const owned = await this.ownsLease();
    if (!owned) {
      // 프레임은 writer만 기록하므로 next_offset/hermes_seq는 건드리지 않는다
      // (읽기 전용 릴레이의 카운터를 쓰면 실제 저장된 프레임보다 앞서 버린다).
      await finalizeChatTurnIfOwnerGone(this.sessionId, {
        status: status === "completed" ? "completed" : failed ? "failed" : "cancelled",
        error: failed ? errorText || "하치 실행이 끊겼어요." : null,
      });
      this.writeToClient({
        type: "message-metadata",
        messageMetadata: { turnRunId: this.runId, streamDone: true },
      } as UIMessageChunk);
      return;
    }

    await this.persist();
    await updateChatTurn(this.sessionId, {
      status: status === "completed" ? "completed" : failed ? "failed" : "cancelled",
      nextOffset: this.offset,
      hermesSeq: this.hermesSeq,
      error: failed ? errorText || "하치 실행이 끊겼어요." : null,
    });
    await this.emitMetadata(true);
  }

  /** 오류로 스트림을 닫는다 (터미널 이벤트를 못 받은 경우). */
  private async close(status: string, error?: string): Promise<void> {
    if (this.closed) return;
    this.closeText();
    this.closeReasoning();
    this.textId = null;
    this.reasoningId = null;
    if (error) this.emit({ type: "error", errorText: error } as UIMessageChunk);
    this.emit({ type: "finish", finishReason: "error" } as UIMessageChunk);
    this.closed = true;

    const owned = await this.ownsLease();
    if (!owned) {
      await finalizeChatTurnIfOwnerGone(this.sessionId, {
        status: status === "cancelled" ? "cancelled" : "failed",
        error: error ?? null,
      });
      this.writeToClient({
        type: "message-metadata",
        messageMetadata: { turnRunId: this.runId, streamDone: true },
      } as UIMessageChunk);
      return;
    }

    await this.persist();
    await updateChatTurn(this.sessionId, {
      status: status === "cancelled" ? "cancelled" : "failed",
      nextOffset: this.offset,
      hermesSeq: this.hermesSeq,
      error: error ?? null,
    });
    await this.emitMetadata(true);
  }

  /**
   * 트랜스크립트 백필 — run 이벤트에는 도구 인자(전체)와 결과(잘림)가 없어서,
   * 턴 트랜스크립트에서 실제 값으로 카드를 다시 채우고 thinking이 비었으면 채운다.
   */
  private backfillFromTranscript(messages: HermesTranscriptMessage[]): void {
    const startIndex = messages.map((message) => message.role).lastIndexOf("user");
    const slice = startIndex >= 0 ? messages.slice(startIndex) : messages;

    const calls: TranscriptToolCall[] = [];
    const results = new Map<string, string>();
    const reasonings: string[] = [];

    for (const message of slice) {
      if (message.role === "assistant") {
        const reasoning = (
          asString(message.reasoning) || asString(message.reasoning_content)
        ).trim();
        if (reasoning) reasonings.push(reasoning);
        for (const call of message.tool_calls ?? []) {
          const id = asString(call.id) || asString(call.call_id);
          if (!id) continue;
          calls.push({
            id,
            name: asString(call.function?.name) || "tool",
            args: call.function?.arguments,
          });
        }
        continue;
      }
      if (message.role !== "tool") continue;
      const id = asString(message.tool_call_id);
      if (id) results.set(id, asString(message.content));
    }

    let cursor = 0;
    for (const relayed of this.relayedTools) {
      const index = calls.findIndex(
        (call, position) => position >= cursor && call.name === relayed.toolName
      );
      if (index === -1) continue;
      cursor = index + 1;
      const call = calls[index];

      if (call.args) {
        let parsedArgs: unknown = call.args;
        try {
          parsedArgs = JSON.parse(call.args);
        } catch {
          parsedArgs = { command: call.args };
        }
        this.emit({
          type: "tool-input-available",
          toolCallId: relayed.toolCallId,
          toolName: relayed.toolName,
          input: parsedArgs,
          dynamic: true,
        } as UIMessageChunk);
      }

      const raw = results.get(call.id);
      if (raw === undefined) continue;
      const { output, errorText } = parseToolResult(raw);
      this.emit(
        (errorText
          ? {
              type: "tool-output-error",
              toolCallId: relayed.toolCallId,
              errorText,
              dynamic: true,
            }
          : {
              type: "tool-output-available",
              toolCallId: relayed.toolCallId,
              output,
              dynamic: true,
            }) as UIMessageChunk
      );
    }

    if (!this.liveReasoning.trim() && reasonings.length > 0) {
      this.ensureStarted();
      this.closeText();
      const id = `reasoning-${++this.counter}`;
      this.emit({ type: "reasoning-start", id } as UIMessageChunk);
      this.emit({
        type: "reasoning-delta",
        id,
        delta: reasonings.join("\n\n"),
      } as UIMessageChunk);
      this.emit({ type: "reasoning-end", id } as UIMessageChunk);
    }
  }

  /* ── 로그/상태 ── */

  private emit(chunk: UIMessageChunk): void {
    const frameOffset = this.offset;
    this.writeToClient(chunk);
    this.pending.push({ offset: frameOffset, chunk });
    this.offset += 1;
    this.applyChunk(chunk, frameOffset);
  }

  /**
   * 클라이언트로 청크를 흘린다. 브라우저가 떠난 뒤에는 조용히 버린다 —
   * 프레임 기록(`emit`)은 계속되어야 하므로 여기서 흐름을 끊지 않는다.
   */
  private writeToClient(chunk: UIMessageChunk): void {
    if (this.writerGone) return;
    try {
      this.writer.write(chunk);
    } catch {
      // 닫힌 스트림에 쓰면 던진다 — 이후로는 기록만 한다.
      this.writerGone = true;
    }
  }

  /**
   * 클라이언트 파트 상태 시뮬레이션 — 어떤 파트가 아직 열려 있는지, 그 파트가 몇 번째
   * 프레임에서 시작했는지 추적한다. 재개 커서(재생 시작 offset + 유지할 파트 수)의 근거다.
   */
  private applyChunk(chunk: UIMessageChunk, frameOffset: number): void {
    switch (chunk.type) {
      case "start":
        this.started = true;
        break;
      case "start-step":
        // step-start 파트는 닫히는 이벤트가 없다 — 곧바로 완결된 파트로 본다.
        this.parts.push({ startOffset: frameOffset, open: false });
        this.metadataDirty = true;
        break;
      case "text-start":
        this.openPart(String(chunk.id), frameOffset);
        this.textId = String(chunk.id);
        break;
      case "text-end":
        this.closePart(String(chunk.id));
        this.textId = null;
        break;
      case "reasoning-start":
        this.openPart(String(chunk.id), frameOffset);
        this.reasoningId = String(chunk.id);
        break;
      case "reasoning-end":
        this.closePart(String(chunk.id));
        this.reasoningId = null;
        break;
      case "tool-input-start": {
        const toolCallId = String(chunk.toolCallId);
        const toolName = asString(chunk.toolName) || "tool";
        this.openPart(toolCallId, frameOffset);
        this.relayedTools.push({ toolCallId, toolName });
        this.toolNameByCallId.set(toolCallId, toolName);
        const queue = this.openToolCalls.get(toolName) ?? [];
        queue.push(toolCallId);
        this.openToolCalls.set(toolName, queue);
        break;
      }
      case "tool-output-available":
      case "tool-output-error": {
        // 끝난 카드는 대기 큐에서도 빼야 다음 도구 결과가 엉뚱한 카드에 붙지 않는다
        // (재생으로 되살아난 큐가 이미 끝난 호출을 다시 물고 있는 경우).
        const toolCallId = String(chunk.toolCallId);
        this.closePart(toolCallId);
        const toolName = this.toolNameByCallId.get(toolCallId);
        const queue = toolName ? this.openToolCalls.get(toolName) : undefined;
        if (queue) {
          const index = queue.indexOf(toolCallId);
          if (index !== -1) queue.splice(index, 1);
        }
        break;
      }
      case "text-delta":
        this.streamedText += asString(chunk.delta);
        break;
      case "reasoning-delta":
        this.liveReasoning += asString(chunk.delta);
        break;
      default:
        break;
    }
  }

  private openPart(id: string, frameOffset: number): void {
    this.partIndexById.set(id, this.parts.length);
    this.parts.push({ startOffset: frameOffset, open: true });
    this.metadataDirty = true;
  }

  private closePart(id: string): void {
    const index = this.partIndexById.get(id);
    if (index === undefined) return;
    this.parts[index].open = false;
    this.metadataDirty = true;
  }

  /**
   * 재개 커서 — 클라이언트가 유지할 파트 수(keepParts)와, 서버가 재생을 시작할 offset.
   *
   * 아직 열려 있는 파트는 클라이언트에서 버리고(재생으로 다시 만든다) 그 파트의
   * **시작 프레임부터** 재생해야 `*-start` 없이 델타가 도착해 SDK가 죽지 않는다.
   */
  private resumeCursor(): { streamOffset: number; keepParts: number } {
    const openIndex = this.parts.findIndex((part) => part.open);
    if (openIndex === -1) {
      return { streamOffset: this.offset, keepParts: this.parts.length };
    }
    return { streamOffset: this.parts[openIndex].startOffset, keepParts: openIndex };
  }

  private async maybePersist(): Promise<void> {
    if (this.pending.length >= 20 || this.metadataDirty) await this.persist();
  }

  /** 지금도 이 릴레이가 writer인지 — 읽기 전용/인계당한 경우 false. */
  private async ownsLease(): Promise<boolean> {
    if (this.readOnly || this.leaseLost) return false;
    try {
      return await touchChatTurnWriter(this.sessionId, this.writerId);
    } catch {
      return false;
    }
  }

  /** writer heartbeat — 5초마다 리스를 갱신하고, 인계당했으면 기록을 멈춘다. */
  private async beat(): Promise<void> {
    if (this.readOnly || this.closed || this.leaseLost) return;
    try {
      if (!(await touchChatTurnWriter(this.sessionId, this.writerId))) {
        this.leaseLost = true;
      }
    } catch {
      // heartbeat 실패는 치명적이지 않다 — 다음 tick/persist에서 다시 확인한다.
    }
  }

  /** 쌓인 프레임과 커서를 DB에 내구화한다. */
  private async persist(): Promise<void> {
    if (this.readOnly || this.leaseLost) return;
    if (this.pending.length === 0 && !this.metadataDirty) return;
    const frames = this.pending;
    this.pending = [];
    await appendChatTurnFrames(this.sessionId, frames);
    await updateChatTurn(this.sessionId, {
      nextOffset: this.offset,
      hermesSeq: this.hermesSeq,
    });
    if (this.metadataDirty) await this.emitMetadata(false);
  }

  /**
   * `message-metadata`로 "여기까지 받았으면 이어받아도 된다"를 알린다.
   * 커서가 항상 내구화된 지점을 가리키도록 **DB 반영 후에** 보낸다.
   */
  private async emitMetadata(done: boolean): Promise<void> {
    this.metadataDirty = false;
    const cursor = this.resumeCursor();
    const chunk: UIMessageChunk = {
      type: "message-metadata",
      messageMetadata: {
        streamOffset: cursor.streamOffset,
        keepParts: cursor.keepParts,
        streamDone: done,
        // 이 메시지가 어느 턴(run)의 결과인지 — 화면이 "이미 가진 턴"인지 판별하는 표식.
        turnRunId: this.runId,
      },
    };

    this.writeToClient(chunk);
    this.pending.push({ offset: this.offset, chunk });
    this.offset += 1;

    await appendChatTurnFrames(this.sessionId, this.pending);
    this.pending = [];
    await updateChatTurn(this.sessionId, { nextOffset: this.offset });
  }
}

export const runTurnStream = async (options: TurnStreamOptions): Promise<void> => {
  const relay = new TurnStreamRelay(options);
  await relay.run();
};
