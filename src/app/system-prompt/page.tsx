"use client";

import { useCallback, useEffect, useState } from "react";

import { SidebarLayout } from "@/components/sidebar-layout";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuthStore } from "@/lib/auth-store";

interface SystemPrompt {
  id: number;
  label: string;
  content: string;
  isActive: boolean;
  createdAt: string | null;
}

const fetchData = async (token: string) => {
  const res = await fetch("/api/system-prompt", {
    headers: { "x-auth-token": token },
  });
  return res.json() as Promise<{ active: SystemPrompt | null; history: SystemPrompt[] }>;
};

const saveData = async (token: string, label: string, content: string) => {
  const res = await fetch("/api/system-prompt", {
    method: "POST",
    headers: { "x-auth-token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ label, content }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "저장 실패");
  return data as { prompt: SystemPrompt };
};

const SystemPromptContent = () => {
  const token = useAuthStore((s) => s.token);
  const [active, setActive] = useState<SystemPrompt | null>(null);
  const [history, setHistory] = useState<SystemPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    (async () => {
      try {
        const data = await fetchData(token);
        if (cancelled) return;
        setActive(data.active);
        setHistory(data.history);
      } catch {
        if (!cancelled) setError("불러오기 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, revision]);

  const handleSave = useCallback(async () => {
    if (!label.trim() || !content.trim() || !token) return;
    setSaving(true);
    setError("");

    try {
      await saveData(token, label.trim(), content.trim());
      setLabel("");
      setContent("");
      setRevision((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 중 오류");
    } finally {
      setSaving(false);
    }
  }, [label, content, token]);

  const applyTemplate = (p: SystemPrompt) => {
    setLabel(p.label);
    setContent(p.content);
  };

  const css = (k: string) => `var(--${k})`;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 text-ink">
      {/* Header */}
      <div className="mt-16 mb-8 text-center md:mt-20">
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex" />}>
            <Avatar size="lg" className="mx-auto mb-4 cursor-pointer">
              <AvatarImage src="/munjackgui-thinking.png" alt="치이카와" />
            </Avatar>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8} align="center">
            <img
              src="/munjackgui-thinking.png"
              alt=""
              className="w-36 rounded-md bg-background object-cover"
            />
          </TooltipContent>
        </Tooltip>
        <h1 className="text-xl font-normal text-ink">지시 사항</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          하치와레가 더 똑똑하게…! 데이트 스타일이나 추가하고 싶은 규칙을 알려주면 그걸
          기억해서 더 찰떡같은 추천을 해준다는 거야…!
        </p>
      </div>

      {/* Content sections */}
      <div className="space-y-4 pb-12">
        {/* Current active prompt */}
        <div className="rounded-xl border border-hairline bg-surface p-5">
          <h2 className="mb-3 text-sm font-medium text-ink">현재 등록된 지시 사항</h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">불러오는 중...</p>
          ) : active ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="rounded bg-primary/18 px-2 py-0.5 text-xs font-medium text-primary">
                  {active.label}
                </span>
                {active.createdAt && (
                  <span className="text-xs text-muted-soft">
                    {new Date(active.createdAt).toLocaleDateString("ko-KR")}
                  </span>
                )}
              </div>
              <pre className="max-h-48 overflow-auto rounded border border-hairline bg-canvas-soft p-3 text-sm whitespace-pre-wrap text-body">
                {active.content}
              </pre>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">등록된 지시 사항이 없습니다.</p>
          )}
        </div>

        {/* New prompt */}
        <div className="rounded-xl border border-hairline bg-surface p-5">
          <h2 className="mb-3 text-sm font-medium text-ink">새 지시 사항 등록</h2>
          <p className="mb-3 text-xs text-muted-soft">
            저장하면 기존 지시 사항이 교체되고 바로 적용된다는 거야…!
          </p>
          <div className="space-y-3">
            <Input
              placeholder="이름 (예: 데이트 스타일 v2)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <Textarea
              placeholder={`하치와레에게 추가로 알려줄 내용을 입력해줘…!\n\n예시:\n- "요즘 감성적인 카페 위주로 추천해줘"\n- "예은이는 걱정이 많아서 자주 안아줘…!"\n- "데이트 코스 추천할 때 교통편도 같이 알려줘…!"`}
              rows={10}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            {error && <p className="text-sm text-error">{error}</p>}
            <Button
              className="w-full"
              disabled={!label.trim() || !content.trim() || saving}
              onClick={handleSave}
            >
              {saving ? "저장 중..." : "저장"}
            </Button>
          </div>
        </div>

        {/* History */}
        <div className="rounded-xl border border-hairline bg-surface p-5">
          <h2 className="mb-3 text-sm font-medium text-ink">변경 이력</h2>
          <p className="mb-3 text-xs text-muted-soft">
            예전에 저장했던 지시 사항이야…! 클릭하면 다시 불러와서 수정할 수 있어…!
          </p>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">기록이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {history.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="flex w-full items-start gap-2 rounded-lg border border-hairline p-3 text-left text-sm transition-colors"
                  onClick={() => applyTemplate(p)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = css("color-canvas-soft");
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{p.label}</span>
                      {p.isActive && (
                        <span className="rounded bg-success/20 px-1.5 py-0.5 text-[10px] font-medium text-success">
                          active
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                      {p.content}
                    </p>
                    {p.createdAt && (
                      <p className="mt-1 text-[10px] text-muted-soft">
                        {new Date(p.createdAt).toLocaleString("ko-KR")}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const SystemPromptPage = () => (
  <SidebarLayout>
    <SystemPromptContent />
  </SidebarLayout>
);

export default SystemPromptPage;
