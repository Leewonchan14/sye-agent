"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SidebarLayout } from "@/components/sidebar-layout";
import { Textarea } from "@/components/ui/textarea";
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

    return () => { cancelled = true; };
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

  if (!token) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle>System Prompt 관리</CardTitle>
            <CardDescription>로그인이 필요합니다.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold">System Prompt 관리</h1>

      <Card>
        <CardHeader>
          <CardTitle>현재 활성 Prompt</CardTitle>
          <CardDescription>
            agent 생성 시 이 내용이 기본 instruction 뒤에 추가됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">불러오는 중...</p>
          ) : active ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {active.label}
                </span>
                {active.createdAt && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(active.createdAt).toLocaleDateString("ko-KR")}
                  </span>
                )}
              </div>
              <pre className="max-h-48 overflow-auto rounded border bg-muted/50 p-3 text-sm whitespace-pre-wrap">
                {active.content}
              </pre>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">등록된 prompt가 없습니다.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>새 Prompt 등록</CardTitle>
          <CardDescription>
            저장하면 기존 활성 prompt가 비활성화되고 agent가 새로 생성됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="레이블 (예: 데이트 어시스턴트 v2)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <Textarea
            placeholder={`추가할 system prompt 내용을 입력하세요...\n기존 agent의 성격과 말투는 유지되며,\n이 내용이 추가 지시사항으로 포함됩니다.`}
            rows={10}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            className="w-full"
            disabled={!label.trim() || !content.trim() || saving}
            onClick={handleSave}
          >
            {saving ? "저장 중..." : "저장"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>변경 이력</CardTitle>
          <CardDescription>
            저장된 모든 prompt 목록입니다. 클릭하면 편집창에 불러옵니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">기록이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {history.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="flex w-full items-start gap-2 rounded-lg border p-3 text-left text-sm transition-colors hover:bg-muted/50"
                  onClick={() => applyTemplate(p)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{p.label}</span>
                      {p.isActive && (
                        <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          active
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-muted-foreground">{p.content}</p>
                    {p.createdAt && (
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {new Date(p.createdAt).toLocaleString("ko-KR")}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const SystemPromptPage = () => (
  <SidebarLayout>
    <SystemPromptContent />
  </SidebarLayout>
);

export default SystemPromptPage;
