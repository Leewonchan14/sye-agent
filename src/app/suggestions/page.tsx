"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { useConfirmDialog } from "@/components/confirm-dialog";
import { SidebarLayout } from "@/components/sidebar-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuthStore } from "@/lib/auth-store";
import { DEFAULT_SUGGESTIONS } from "@/lib/data/default-suggestions";
import { Trash2 } from "lucide-react";

interface Suggestion {
  id: number;
  label: string;
  prompt: string;
  sortOrder: number | null;
  createdAt: string | null;
}

const fetchSuggestions = async (token: string) => {
  const res = await fetch("/api/suggestions", {
    headers: { "x-auth-token": token },
  });
  if (!res.ok) throw new Error("불러오기 실패");
  return res.json() as Promise<{ suggestions: Suggestion[] }>;
};

const saveData = async ({
  token,
  label,
  prompt,
  id,
  sortOrder,
}: {
  token: string;
  label: string;
  prompt: string;
  id?: number;
  sortOrder?: number;
}) => {
  const res = await fetch("/api/suggestions", {
    method: "POST",
    headers: { "x-auth-token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ id, label, prompt, sortOrder }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "저장 실패");
  return data as { suggestion: Suggestion };
};

const deleteData = async ({ token, id }: { token: string; id: number }) => {
  const res = await fetch("/api/suggestions", {
    method: "DELETE",
    headers: { "x-auth-token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error("삭제 실패");
};

const SuggestionsContent = () => {
  const token = useAuthStore((s) => s.token);
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
    queryFn: () => fetchSuggestions(token!),
    enabled: !!token,
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
        headers: { "x-auth-token": token! },
      });
      if (!res.ok) throw new Error("초기화 실패");
      return res.json() as Promise<{ ok: boolean; count: number }>;
    },
    onSuccess: (data) => {
      setEditId(undefined);
      setLabel("");
      setPrompt("");
      invalidate();
    },
  });

  const handleReset = useCallback(async () => {
    if (!token) return;
    const ok = await confirmDialog.confirm({
      title: "질문 초기화",
      description:
        "모든 질문이 기본값으로 초기화됩니다. 직접 추가한 질문은 사라지니 주의해줘…!\n\n" +
        `기본 질문 (${DEFAULT_SUGGESTIONS.length}개):\n` +
        DEFAULT_SUGGESTIONS.map((s, i) => `${i + 1}. ${s.label}`).join("\n"),
      destructive: true,
      confirmLabel: "초기화",
    });
    if (!ok) return;
    resetMutation.mutate();
  }, [token, resetMutation, confirmDialog]);

  const handleSave = useCallback(() => {
    if (!label.trim() || !prompt.trim() || !token) return;
    saveMutation.mutate({
      token,
      label: label.trim(),
      prompt: prompt.trim(),
      id: editId,
    });
  }, [label, prompt, editId, token, saveMutation]);

  const handleDelete = useCallback(
    async (id: number) => {
      if (!token) return;
      const ok = await confirmDialog.confirm({
        title: "질문 삭제",
        description: "정말 삭제할까요?",
        destructive: true,
        confirmLabel: "삭제",
      });
      if (!ok) return;
      deleteMutation.mutate({ token, id });
    },
    [token, deleteMutation, confirmDialog]
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
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 text-ink">
      {/* Header */}
      <div className="mt-16 mb-8 text-center md:mt-20">
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex" />}>
            <img
              src="/munjackgui-thinking.png"
              alt="치이카와"
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
        <h1 className="text-xl font-normal text-ink">추천 질문</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          채팅 화면에 표시될 추천 질문을 관리한다는 거야…! 자주 묻는 걸 등록해두면 버튼
          하나로 바로 보낼 수 있어…♪
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
        <div className="rounded-xl border border-hairline bg-surface p-5">
          <h2 className="mb-3 text-sm font-medium text-ink">
            {editId ? "질문 수정" : "새 질문 등록"}
          </h2>
          <p className="mb-3 text-xs text-muted-soft">
            {editId
              ? "내용을 수정하고 저장하면 바로 반영됩니다."
              : "저장하면 채팅 화면에 추천 질문으로 표시된다는 거야…!"}
          </p>
          <div className="space-y-3">
            <Input
              placeholder="이름 (예: 오늘 뭐하지?)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <Textarea
              placeholder={`하치와레에게 보낼 메시지를 입력해줘…!\n\n예시:\n- "사랑해!"\n- "데이트 코스 추천해줘…!"\n- "분위기 좋은 맛집 알려줘…!"`}
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            {mutationError && (
              <p className="text-sm text-error">
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
        <div className="rounded-xl border border-hairline bg-surface p-5">
          <h2 className="mb-3 text-sm font-medium text-ink">
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
                      : "border-hairline"
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
                          <span className="shrink-0 text-xs text-muted-soft">
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
                        className="text-muted-foreground hover:bg-error/10 hover:text-error"
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
  <SidebarLayout>
    <SuggestionsContent />
  </SidebarLayout>
);

export default SuggestionsPage;
