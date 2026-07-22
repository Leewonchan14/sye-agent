"use client";

import { useCallback, useRef, useState } from "react";

import { SidebarLayout } from "@/components/sidebar-layout";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuthStore } from "@/lib/auth-store";
import { Upload } from "lucide-react";

type SseEvent =
  | { event: "parse"; totalRows: number }
  | { event: "embedding"; done: number; total: number }
  | { event: "insert"; inserted: number; total: number }
  | {
      event: "done";
      totalRows: number;
      inserted: number;
      skipped: number;
      summary: string;
    }
  | { event: "error"; message: string; details?: string };

type UploadState =
  | { status: "idle" }
  | { status: "uploading" }
  | { status: "parsing"; totalRows?: number }
  | {
      status: "embedding";
      totalRows: number;
      done: number;
    }
  | {
      status: "inserting";
      totalRows: number;
      inserted: number;
    }
  | {
      status: "done";
      totalRows: number;
      inserted: number;
      skipped: number;
      summary: string;
    }
  | { status: "error"; message: string };

const KakaoChatPage = () => {
  const token = useAuthStore((s) => s.token);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>({ status: "idle" });
  const [dragOver, setDragOver] = useState(false);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith(".csv")) {
        setUploadState({ status: "error", message: "CSV 파일만 업로드 가능합니다." });
        return;
      }

      setUploadState({ status: "uploading" });

      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch("/api/kakao-chat/upload", {
          method: "POST",
          headers: { "x-auth-token": token },
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          setUploadState({
            status: "error",
            message: data?.error ?? `서버 오류 (${res.status})`,
          });
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          setUploadState({ status: "error", message: "응답 스트림을 읽을 수 없습니다." });
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const parts = buffer.split("\n");
          // Keep the last partial chunk in the buffer
          buffer = parts.pop() ?? "";

          let currentEvent: string | null = null;
          for (const line of parts) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7);
            } else if (line.startsWith("data: ") && currentEvent) {
              try {
                const payload = JSON.parse(line.slice(6));
                const event: SseEvent = { event: currentEvent, ...payload };

                switch (event.event) {
                  case "parse":
                    setUploadState({ status: "parsing", totalRows: event.totalRows });
                    break;
                  case "embedding":
                    setUploadState({
                      status: "embedding",
                      totalRows: event.total,
                      done: event.done,
                    });
                    break;
                  case "insert":
                    setUploadState({
                      status: "inserting",
                      totalRows: event.total,
                      inserted: event.inserted,
                    });
                    break;
                  case "done":
                    setUploadState({
                      status: "done",
                      totalRows: event.totalRows,
                      inserted: event.inserted,
                      skipped: event.skipped,
                      summary: event.summary,
                    });
                    break;
                  case "error":
                    setUploadState({
                      status: "error",
                      message: event.message,
                    });
                    break;
                }
              } catch {
                // ignore malformed JSON
              }
              currentEvent = null;
            } else if (line === "") {
              currentEvent = null;
            }
          }
        }
      } catch (err) {
        setUploadState({
          status: "error",
          message: err instanceof Error ? err.message : "네트워크 오류가 발생했습니다.",
        });
      }
    },
    [token]
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) uploadFile(file);
    },
    [uploadFile]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) uploadFile(file);
    },
    [uploadFile]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => setDragOver(false), []);

  const onPick = useCallback(() => fileRef.current?.click(), []);

  return (
    <SidebarLayout>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 text-ink">
        {/* Header */}
        <div className="mt-16 mb-8 text-center md:mt-20">
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex" />}>
              <img
                src="/munjackgui-thinking.png"
                alt="하치와레"
                className="mx-auto mb-4 size-20 cursor-pointer rounded-full object-cover"
                style={{ backgroundColor: "var(--color-canvas-soft)" }}
              />
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8} align="center">
              <img
                src="/munjackgui-thinking.png"
                alt=""
                className="size-36 rounded-md bg-background object-cover"
              />
            </TooltipContent>
          </Tooltip>
          <h1 className="text-xl font-normal text-ink">카카오톡 대화 업로드</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            예은님과 원찬님의 카톡 대화를 업로드하면 하치와레가 더 똑똑하게 기억한…는
            뜻이야…!
            <br />
            중복은 알아서 걸러진다는 거야…!
          </p>
        </div>

        {/* Content */}
        <div className="mb-12 rounded-xl border border-hairline bg-surface p-6">
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={onFileChange}
          />

          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              dragOver ? "border-primary bg-primary/10" : "border-hairline"
            }`}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={onPick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onPick();
            }}
          >
            <Upload className="mb-2 size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {dragOver ? "여기에 놓아줘…!" : "카톡 내보내기 CSV 파일을 업로드해줘…!"}
            </p>
            <p className="mt-1 text-xs text-muted-soft">
              카카오톡 &gt; 대화방 설정 &gt; 대화 내용 내보내기
            </p>
          </div>

          {/* Upload state */}
          {uploadState.status === "uploading" && (
            <div className="flex items-center gap-2 pt-4 text-sm text-muted-foreground">
              <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              파일 올리는 중…
            </div>
          )}

          {uploadState.status === "parsing" && (
            <div className="flex items-center gap-2 pt-4 text-sm text-muted-foreground">
              <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              {uploadState.totalRows
                ? `${uploadState.totalRows.toLocaleString()}개 행…! 대화를 읽었…다는 거야!?`
                : "대화를 읽고 있어…!"}
            </div>
          )}

          {uploadState.status === "embedding" && (
            <div className="space-y-1.5 pt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">뜻을 기억하고 있어…!</span>
                <span className="font-medium text-muted-foreground tabular-nums">
                  {uploadState.done.toLocaleString()} /{" "}
                  {uploadState.totalRows.toLocaleString()}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-canvas-soft">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{
                    width: `${Math.round((uploadState.done / uploadState.totalRows) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}

          {uploadState.status === "inserting" && (
            <div className="space-y-1.5 pt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">하나씩 저장하고 있어…!</span>
                <span className="font-medium text-muted-foreground tabular-nums">
                  {uploadState.inserted.toLocaleString()} /{" "}
                  {uploadState.totalRows.toLocaleString()}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-canvas-soft">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{
                    width: `${Math.min(100, Math.round((uploadState.inserted / uploadState.totalRows) * 100))}%`,
                  }}
                />
              </div>
            </div>
          )}

          {uploadState.status === "error" && (
            <div className="mt-4 rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error">
              {uploadState.message}
            </div>
          )}

          {uploadState.status === "done" && (
            <div className="pt-4">
              <div className="rounded-lg border border-hairline bg-canvas-soft p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">읽은 대화</span>
                  <span className="font-medium">
                    {uploadState.totalRows.toLocaleString()}개
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-muted-foreground">기억한 대화</span>
                  <span className="font-medium text-success">
                    {uploadState.inserted.toLocaleString()}개
                  </span>
                </div>
                {uploadState.skipped > 0 && (
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-muted-foreground">이미 아는 대화</span>
                    <span className="font-medium text-muted-soft">
                      {uploadState.skipped.toLocaleString()}개
                    </span>
                  </div>
                )}
              </div>
              <p className="mt-2 text-center text-sm text-muted-foreground">
                {uploadState.summary}
              </p>
            </div>
          )}

          <div className="pt-4">
            <Button
              className="w-full"
              variant="outline"
              disabled={uploadState.status === "uploading"}
              onClick={onPick}
            >
              {uploadState.status === "uploading" ? "올리는 중…" : "파일 고르기…!"}
            </Button>
          </div>
        </div>
      </div>
    </SidebarLayout>
  );
};

export default KakaoChatPage;
