"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { useConfirmDialog } from "@/components/confirm-dialog";
import { SidebarLayout } from "@/components/sidebar-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_SUGGESTIONS } from "@/lib/data/default-suggestions";
import { Trash2 } from "lucide-react";

interface Suggestion {
  id: number;
  label: string;
  prompt: string;
  sortOrder: number | null;
  createdAt: string | null;
}

const fetchSuggestions = async () => {
  const res = await fetch("/api/suggestions", {});
  if (!res.ok) throw new Error("불러오기 실패");
  return res.json() as Promise<{ suggestions: Suggestion[] }>;
};

const saveData = async ({
  label,
  prompt,
  id,
  sortOrder,
}: {
  label: string;
  prompt: string;
  id?: number;
  sortOrder?: number;
}) => {
  const res = await fetch("/api/suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, label, prompt, sortOrder }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "저장 실패");
  return data as { suggestion: Suggestion };
};

const deleteData = async ({ id }: { id: number }) => {
  const res = await fetch("/api/suggestions", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error("삭제 실패");
};

const SuggestionsContent = () => {
  const queryClient = useQueryClient();
  const confirmDialog = useConfirmDialog();

  const [editId, setEditId] = useState<number | undefined>(undefined);
  const [label, setLabel] = useState("");
  const [prompt, setPrompt] = useState("");

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["suggestions"] }),
    [queryClient]
  );

  const { data, isLoading } = useQuery({
    queryKey: ["suggestions"],
    queryFn: () => fetchSuggestions(),
  });

  const items = data?.suggestions ?? [];

  const saveMutation = useMutation({
    mutationFn: saveData,
    onSuccess: () => {
      setLabel("");
      setPrompt("");
      setEditId(undefined);
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteData,
    onSuccess: (_data, vars) => {
      if (editId === vars.id) {
        setEditId(undefined);
        setLabel("");
        setPrompt("");
      }
      invalidate();
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/suggestions", {
        method: "PATCH",
      });
      if (!res.ok) throw new Error("초기화 실패");
      return res.json() as Promise<{ ok: boolean; count: number }>;
    },
    onSuccess: () => {
      setEditId(undefined);
      setLabel("");
      setPrompt("");
      invalidate();
    },
  });

  const handleReset = useCallback(async () => {
    const ok = await confirmDialog.confirm({
      title: "예시 질문 초기화",
      description:
        "모든 질문이 기본값으로 초기화됩니다. 직접 추가한 질문은 사라집니다.\n\n" +
        `기본 질문 (${DEFAULT_SUGGESTIONS.length}개):\n` +
        DEFAULT_SUGGESTIONS.map((s, i) => `${i + 1}. ${s.label}`).join("\n"),
      destructive: true,
      confirmLabel: "초기화",
    });
    if (!ok) return;
    resetMutation.mutate();
  }, [resetMutation, confirmDialog]);

  const handleSave = useCallback(() => {
    if (!label.trim() || !prompt.trim()) return;
    saveMutation.mutate({
      label: label.trim(),
      prompt: prompt.trim(),
      id: editId,
    });
  }, [label, prompt, editId, saveMutation]);

  const handleDelete = useCallback(
    async (id: number) => {
      const ok = await confirmDialog.confirm({
        title: "질문 삭제",
        description: "정말 삭제할까요?",
        destructive: true,
        confirmLabel: "삭제",
      });
      if (!ok) return;
      deleteMutation.mutate({ id });
    },
    [deleteMutation, confirmDialog]
  );

  const startEdit = (item: Suggestion) => {
    setEditId(item.id);
    setLabel(item.label);
    setPrompt(item.prompt);
  };

  const cancelEdit = () => {
    setEditId(undefined);
    setLabel("");
    setPrompt("");
  };

  const mutationError = saveMutation.error || deleteMutation.error;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 text-foreground">
      {/* Header */}
      <div className="mt-8 mb-6">
        <h2 className="text-xl font-semibold tracking-tight">예시 질문</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          새 채팅 화면에 보이는 예시 질문이에요. 자주 묻는 질문을 등록해 두면 버튼 하나로
          바로 보낼 수 있어요.
        </p>
        <div className="mt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={resetMutation.isPending}
            onClick={handleReset}
            className="text-xs text-muted-foreground"
          >
            {resetMutation.isPending ? "초기화 중..." : "기본값으로 초기화"}
          </Button>
        </div>
      </div>

      {/* Content sections */}
      <div className="space-y-4 pb-12">
        {/* Edit / New form */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-medium text-foreground">
            {editId ? "질문 수정" : "새 질문 등록"}
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            {editId
              ? "내용을 수정하고 저장하면 바로 반영됩니다."
              : "저장하면 새 채팅 화면에 예시 질문으로 표시됩니다."}
          </p>
          <div className="space-y-3">
            <Input
              placeholder="이름 (예: 주요 뉴스 정리)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <Textarea
              placeholder={`버튼을 누르면 보낼 메시지를 입력하세요.\n\n예시:\n- "오늘 국내 주요 뉴스를 정리해 줘"\n- "이 글을 세 줄로 요약해 줘"`}
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            {mutationError && (
              <p className="text-sm text-destructive">
                {mutationError instanceof Error ? mutationError.message : "오류 발생"}
              </p>
            )}
            <div className="flex gap-2">
              {editId && (
                <Button variant="outline" className="flex-1" onClick={cancelEdit}>
                  취소
                </Button>
              )}
              <Button
                className="flex-1"
                disabled={!label.trim() || !prompt.trim() || saveMutation.isPending}
                onClick={handleSave}
              >
                {saveMutation.isPending ? "저장 중..." : editId ? "수정 완료" : "저장"}
              </Button>
            </div>
          </div>
        </div>

        {/* All suggestions list */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-medium text-foreground">
            등록된 질문
            {!isLoading && (
              <Badge variant="secondary" className="ml-1.5 font-normal">
                {items.length}
              </Badge>
            )}
          </h2>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">불러오는 중...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">등록된 질문이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-lg border p-3 transition-colors ${
                    editId === item.id
                      ? "border-primary/40 bg-primary/5"
                      : "border-border"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => startEdit(item)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{item.label}</span>
                        {item.createdAt && (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {new Date(item.createdAt).toLocaleDateString("ko-KR")}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {item.prompt}
                      </p>
                    </button>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {confirmDialog.dialog}
    </div>
  );
};

const SuggestionsPage = () => (
  <SidebarLayout activeNav="suggestions">
    <SuggestionsContent />
  </SidebarLayout>
);

export default SuggestionsPage;
