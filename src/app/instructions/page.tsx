"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { useConfirmDialog } from "@/components/confirm-dialog";
import { SidebarLayout } from "@/components/sidebar-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Trash2 } from "lucide-react";

interface Instructions {
  id: number;
  label: string;
  content: string;
  isActive: boolean;
  createdAt: string | null;
}

const fetchData = async () => {
  const res = await fetch("/api/instructions", {});
  if (!res.ok) throw new Error("불러오기 실패");
  return res.json() as Promise<{ instructions: Instructions[] }>;
};

const saveData = async ({
  label,
  content,
  id,
}: {
  label: string;
  content: string;
  id?: number;
}) => {
  const res = await fetch("/api/instructions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, label, content }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "저장 실패");
  return data as { instruction: Instructions };
};

const toggleActive = async ({ id }: { id: number }) => {
  const res = await fetch("/api/instructions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "토글 실패");
  return data as { instruction: Instructions };
};

const deleteInstruction = async ({ id }: { id: number }) => {
  const res = await fetch("/api/instructions", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error("삭제 실패");
};

const InstructionsContent = () => {
  const queryClient = useQueryClient();
  const confirmDialog = useConfirmDialog();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newContent, setNewContent] = useState("");

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["instructions"] }),
    [queryClient]
  );

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["instructions"],
    queryFn: () => fetchData(),
  });

  const items = data?.instructions ?? [];

  const closeEditor = () => {
    setEditingId(null);
    setDraftLabel("");
    setDraftContent("");
  };

  const createMutation = useMutation({
    mutationFn: saveData,
    onSuccess: () => {
      setNewLabel("");
      setNewContent("");
      invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: saveData,
    onSuccess: () => {
      closeEditor();
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
      if (editingId === vars.id) closeEditor();
      invalidate();
    },
  });

  const handleCreate = useCallback(() => {
    if (!newLabel.trim() || !newContent.trim()) return;
    createMutation.mutate({
      label: newLabel.trim(),
      content: newContent.trim(),
    });
  }, [newLabel, newContent, createMutation]);

  const handleUpdate = useCallback(
    (id: number) => {
      if (!draftLabel.trim() || !draftContent.trim()) return;
      updateMutation.mutate({
        label: draftLabel.trim(),
        content: draftContent.trim(),
        id,
      });
    },
    [draftLabel, draftContent, updateMutation]
  );

  const handleToggle = useCallback(
    (id: number) => {
      toggleMutation.mutate({ id });
    },
    [toggleMutation]
  );

  const handleDelete = useCallback(
    async (id: number) => {
      const ok = await confirmDialog.confirm({
        title: "지시 사항 삭제",
        description: "정말 삭제할까요?",
        destructive: true,
        confirmLabel: "삭제",
      });
      if (!ok) return;
      deleteMutation.mutate({ id });
    },
    [deleteMutation, confirmDialog]
  );

  const startEdit = (item: Instructions) => {
    setEditingId(item.id);
    setDraftLabel(item.label);
    setDraftContent(item.content);
    updateMutation.reset();
  };

  const topFormError =
    createMutation.error ?? toggleMutation.error ?? deleteMutation.error;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 text-foreground">
      {/* Header */}
      <div className="mt-8 mb-6">
        <h2 className="text-xl font-semibold tracking-tight">지시 사항</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          대화할 때마다 AI에게 함께 전달할 규칙이에요. 켜 둔 지시 사항만 적용되고, 내
          계정에서만 쓰여요.
        </p>
      </div>

      {/* Content sections */}
      <div className="space-y-4 pb-12">
        {/* New instruction form */}
        <div className="rounded-xl border bg-card p-5">
          <h2 className="mb-3 text-sm font-medium text-foreground">새 지시 사항 등록</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            저장하면 다음 메시지부터 바로 적용돼요.
          </p>
          <div className="space-y-3">
            <Input
              placeholder="이름 (예: 답변 스타일)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <Textarea
              placeholder={`AI에게 항상 지켜 달라고 할 내용을 적어 주세요.\n\n예시:\n- "답변은 핵심부터 짧게 정리해 줘"\n- "브랜드 언급을 모니터링할 때 부정적인 키워드가 보이면 바로 알려줘"\n- "경쟁사와 비교할 때 우리 브랜드의 점유율 변화를 강조해 줘"`}
              rows={10}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
            />
            {isError && (
              <p className="text-sm text-destructive">
                {error instanceof Error ? error.message : "불러오기 실패"}
              </p>
            )}
            {topFormError && (
              <p className="text-sm text-destructive">
                {topFormError instanceof Error ? topFormError.message : "오류 발생"}
              </p>
            )}
            <Button
              className="w-full"
              disabled={
                !newLabel.trim() || !newContent.trim() || createMutation.isPending
              }
              onClick={handleCreate}
            >
              {createMutation.isPending ? "저장 중..." : "저장"}
            </Button>
          </div>
        </div>

        {/* All instructions list */}
        <div className="rounded-xl border bg-card p-5">
          <h2 className="mb-3 text-sm font-medium text-foreground">
            등록된 지시 사항
            {!isLoading && (
              <Badge variant="secondary" className="ml-1.5 font-normal">
                {items.length}
              </Badge>
            )}
          </h2>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">불러오는 중...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">등록된 지시 사항이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {items.map((item) => {
                const isEditing = editingId === item.id;
                const isSaving =
                  updateMutation.isPending && updateMutation.variables?.id === item.id;
                const saveError =
                  updateMutation.error && updateMutation.variables?.id === item.id
                    ? updateMutation.error
                    : null;

                return (
                  <div
                    key={item.id}
                    className={`rounded-lg border p-3 transition-colors ${
                      isEditing ? "border-primary/40 bg-primary/5" : "border-border"
                    }`}
                  >
                    {isEditing ? (
                      <div className="space-y-3">
                        <Input
                          placeholder="이름"
                          value={draftLabel}
                          onChange={(e) => setDraftLabel(e.target.value)}
                        />
                        <Textarea
                          autoFocus
                          placeholder="내용"
                          rows={8}
                          value={draftContent}
                          onChange={(e) => setDraftContent(e.target.value)}
                        />
                        {saveError && (
                          <p className="text-sm text-destructive">
                            {saveError instanceof Error ? saveError.message : "오류 발생"}
                          </p>
                        )}
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            className="flex-1"
                            onClick={closeEditor}
                            disabled={isSaving}
                          >
                            취소
                          </Button>
                          <Button
                            className="flex-1"
                            disabled={
                              !draftLabel.trim() || !draftContent.trim() || isSaving
                            }
                            onClick={() => handleUpdate(item.id)}
                          >
                            {isSaving ? "저장 중..." : "수정 완료"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        {/* Left: info + content */}
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => startEdit(item)}
                        >
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">
                              {item.label}
                            </span>
                            {item.createdAt && (
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {new Date(item.createdAt).toLocaleDateString("ko-KR")}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                            {item.content}
                          </p>
                        </button>

                        {/* Right: edit + toggle + delete */}
                        <div className="flex shrink-0 items-center gap-1.5">
                          {/* Edit button */}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:bg-primary/10 hover:text-primary"
                            onClick={() => startEdit(item)}
                            title="편집"
                          >
                            <Pencil className="size-3.5" />
                          </Button>

                          {/* Toggle switch */}
                          <button
                            type="button"
                            role="switch"
                            aria-checked={item.isActive}
                            disabled={toggleMutation.isPending}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors disabled:opacity-50 ${
                              item.isActive
                                ? "border-primary bg-primary"
                                : "border-border bg-muted"
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
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleDelete(item.id)}
                            disabled={deleteMutation.isPending}
                            title="삭제"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {confirmDialog.dialog}
    </div>
  );
};

const InstructionsPage = () => (
  <SidebarLayout activeNav="instructions">
    <InstructionsContent />
  </SidebarLayout>
);

export default InstructionsPage;
