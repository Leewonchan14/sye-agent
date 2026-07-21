"use client";

import { useCallback, useRef, useState } from "react";

import { SidebarLayout } from "@/components/sidebar-layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuthStore } from "@/lib/auth-store";

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
      <div className="flex min-h-dvh items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle>카카오톡 대화 업로드</CardTitle>
            <CardDescription>
              카카오톡에서 내보낸 CSV 파일을 업로드하면{" "}
              <span className="font-semibold text-foreground">kakao_chat</span> 테이블이
              자동으로 업데이트됩니다. 중복 메시지는 자동으로 제외됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
              }`}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onClick={onPick}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onPick();
              }}
            >
              <svg
                className="mb-2 size-8 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
                />
              </svg>
              <p className="text-sm text-muted-foreground">
                {dragOver
                  ? "파일을 여기에 놓으세요"
                  : "CSV 파일을 드래그하거나 클릭하여 선택하세요"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                KakaoTalk_Chat_*.csv 형식
              </p>
            </div>

            {/* Upload state */}
            {uploadState.status === "uploading" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                파일 업로드 중…
              </div>
            )}

            {uploadState.status === "parsing" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {uploadState.totalRows
                  ? `CSV 파싱 완료 (${uploadState.totalRows.toLocaleString()}개 행)`
                  : "CSV 파싱 중…"}
              </div>
            )}

            {uploadState.status === "embedding" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">임베딩 생성 중…</span>
                  <span className="font-medium text-muted-foreground tabular-nums">
                    {uploadState.done.toLocaleString()} /{" "}
                    {uploadState.totalRows.toLocaleString()}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
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
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">데이터 저장 중…</span>
                  <span className="font-medium text-muted-foreground tabular-nums">
                    {uploadState.inserted.toLocaleString()} /{" "}
                    {uploadState.totalRows.toLocaleString()}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
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
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                {uploadState.message}
              </div>
            )}

            {uploadState.status === "done" && (
              <div className="space-y-2">
                <div className="rounded-lg border border-border bg-muted/50 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">전체</span>
                    <span className="font-medium">
                      {uploadState.totalRows.toLocaleString()}개
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-muted-foreground">저장됨</span>
                    <span className="font-medium text-green-600 dark:text-green-400">
                      {uploadState.inserted.toLocaleString()}개
                    </span>
                  </div>
                  {uploadState.skipped > 0 && (
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-muted-foreground">중복 제외</span>
                      <span className="font-medium text-muted-foreground">
                        {uploadState.skipped.toLocaleString()}개
                      </span>
                    </div>
                  )}
                </div>
                <p className="text-center text-sm text-muted-foreground">
                  {uploadState.summary}
                </p>
              </div>
            )}

            <Button
              className="w-full"
              variant="outline"
              disabled={uploadState.status === "uploading"}
              onClick={onPick}
            >
              {uploadState.status === "uploading" ? "업로드 중..." : "파일 선택하기"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </SidebarLayout>
  );
};

export default KakaoChatPage;
