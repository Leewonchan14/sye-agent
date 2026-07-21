"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { useConfirmDialog } from "@/components/confirm-dialog";
import { SidebarLayout } from "@/components/sidebar-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuthStore } from "@/lib/auth-store";

interface Instructions {
  id: number;
  label: string;
  content: string;
  isActive: boolean;
  createdAt: string | null;
}

const fetchData = async (token: string) => {
  const res = await fetch("/api/instructions", {
    headers: { "x-auth-token": token },
  });
  if (!res.ok) throw new Error("불러오기 실패");
  return res.json() as Promise<{ instructions: Instructions[] }>;
};

const saveData = async ({
  token,
  label,
  content,
  id,
}: {
  token: string;
  label: string;
  content: string;
  id?: number;
}) => {
  const res = await fetch("/api/instructions", {
    method: "POST",
    headers: { "x-auth-token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ id, label, content }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "저장 실패");
  return data as { instruction: Instructions };
};

const toggleActive = async ({ token, id }: { token: string; id: number }) => {
  const res = await fetch(`/api/instructions/${id}`, {
    method: "PATCH",
    headers: { "x-auth-token": token },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "토글 실패");
  return data as { instruction: Instructions };
};

const deleteInstruction = async ({ token, id }: { token: string; id: number }) => {
  const res = await fetch(`/api/instructions/${id}`, {
    method: "DELETE",
    headers: { "x-auth-token": token },
  });
  if (!res.ok) throw new Error("삭제 실패");
};

const InstructionsContent = () => {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const confirmDialog = useConfirmDialog();

  const [editId, setEditId] = useState<number | undefined>(undefined);
  const [label, setLabel] = useState("");
  const [content, setContent] = useState("");

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["instructions"] }),
    [queryClient]
  );

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["instructions"],
    queryFn: () => fetchData(token!),
    enabled: !!token,
  });

  const items = data?.instructions ?? [];

  const saveMutation = useMutation({
    mutationFn: saveData,
    onSuccess: () => {
      setLabel("");
      setContent("");
      setEditId(undefined);
      invalidate();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: toggleActive,
    onSuccess: () => invalidate(),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteInstruction,
    onSuccess: (_data, vars) => {
      if (editId === vars.id) {
        setEditId(undefined);
        setLabel("");
        setContent("");
      }
      invalidate();
    },
  });

  const handleSave = useCallback(() => {
    if (!label.trim() || !content.trim() || !token) return;
    saveMutation.mutate({
      token,
      label: label.trim(),
      content: content.trim(),
      id: editId,
    });
  }, [label, content, editId, token, saveMutation]);

  const handleToggle = useCallback(
    (id: number) => {
      if (!token) return;
      toggleMutation.mutate({ token, id });
    },
    [token, toggleMutation]
  );

  const handleDelete = useCallback(
    async (id: number) => {
      if (!token) return;
      const ok = await confirmDialog.confirm({
        title: "지시 사항 삭제",
        description: "정말 삭제할까요?",
        destructive: true,
        confirmLabel: "삭제",
      });
      if (!ok) return;
      deleteMutation.mutate({ token, id });
    },
    [token, deleteMutation, confirmDialog]
  );

  const startEdit = (item: Instructions) => {
    setEditId(item.id);
    setLabel(item.label);
    setContent(item.content);
  };

  const cancelEdit = () => {
    setEditId(undefined);
    setLabel("");
    setContent("");
  };

  const mutationError =
    saveMutation.error || toggleMutation.error || deleteMutation.error;

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
        <h1 className="text-xl font-normal text-ink">지시 사항</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          하치와레가 더 똑똑하게…! 데이트 스타일이나 추가하고 싶은 규칙을 알려주면 그걸
          기억해서 더 찰떡같은 추천을 해준다는 거야…!
        </p>
      </div>

      {/* Content sections */}
      <div className="space-y-4 pb-12">
        {/* Edit / New form */}
        <div className="rounded-xl border border-hairline bg-surface p-5">
          <h2 className="mb-3 text-sm font-medium text-ink">
            {editId ? "지시 사항 수정" : "새 지시 사항 등록"}
          </h2>
          <p className="mb-3 text-xs text-muted-soft">
            {editId
              ? "내용을 수정하고 저장하면 바로 적용된다는 거야…!"
              : "저장하면 바로 적용할 수 있게 등록된다는 거야…!"}
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
            {isError && (
              <p className="text-sm text-error">
                {error instanceof Error ? error.message : "불러오기 실패"}
              </p>
            )}
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
                disabled={!label.trim() || !content.trim() || saveMutation.isPending}
                onClick={handleSave}
              >
                {saveMutation.isPending ? "저장 중..." : editId ? "수정 완료" : "저장"}
              </Button>
            </div>
          </div>
        </div>

        {/* All instructions list */}
        <div className="rounded-xl border border-hairline bg-surface p-5">
          <h2 className="mb-3 text-sm font-medium text-ink">
            등록된 지시 사항
            {!isLoading && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                ({items.length})
              </span>
            )}
          </h2>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">불러오는 중...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">등록된 지시 사항이 없습니다.</p>
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
                    {/* Left: info + content */}
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
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                        {item.content}
                      </p>
                    </button>

                    {/* Right: toggle + delete */}
                    <div className="flex shrink-0 items-center gap-1.5">
                      {/* Toggle switch */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={item.isActive}
                        disabled={toggleMutation.isPending}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors disabled:opacity-50 ${
                          item.isActive
                            ? "border-primary bg-primary"
                            : "border-border bg-canvas-soft"
                        }`}
                        onClick={() => handleToggle(item.id)}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                            item.isActive ? "translate-x-4.5" : "translate-x-0.5"
                          }`}
                        />
                      </button>

                      {/* Delete button */}
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-md text-xs text-muted-foreground transition-colors hover:bg-error/10 hover:text-error disabled:opacity-50"
                        onClick={() => handleDelete(item.id)}
                        disabled={deleteMutation.isPending}
                        title="삭제"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3 6h18" />
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                      </button>
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

const InstructionsPage = () => (
  <SidebarLayout>
    <InstructionsContent />
  </SidebarLayout>
);

export default InstructionsPage;
