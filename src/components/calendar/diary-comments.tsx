"use client";

import { useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Segmented } from "@/components/calendar/calendar-ui";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/lib/auth-store";
import { calendarRequest } from "@/lib/calendar/client";
import { VIEWER_NAME } from "@/lib/calendar/format";
import { useInvalidateCalendar } from "@/lib/calendar/hooks";
import type { CalendarDiary, CalendarViewer, DiaryComment } from "@/lib/calendar/types";
import { kst } from "@/lib/kst";
import { cn } from "@/lib/utils";

const AUTHORS = ["wonchan", "yeeun"] as const;

const AUTHOR_OPTIONS = AUTHORS.map((key) => ({
  value: key,
  label: VIEWER_NAME[key],
  testId: `diary-comment-author-${key}`,
}));

interface Props {
  diary: Pick<CalendarDiary, "id" | "date" | "comments">;
  className?: string;
}

export const DiaryComments = ({ diary, className }: Props) => {
  const token = useAuthStore((s) => s.token);
  const invalidate = useInvalidateCalendar();
  const { confirm, dialog } = useConfirmDialog();
  const [author, setAuthor] = useState<CalendarViewer>("wonchan");
  const [body, setBody] = useState("");

  const addComment = useMutation({
    mutationFn: () =>
      calendarRequest<{ diary: CalendarDiary }>(token, "/api/calendar/diaries/comments", {
        method: "POST",
        body: JSON.stringify({ diaryId: diary.id, author, body: body.trim() }),
      }),
    onSuccess: () => {
      toast.success("댓글을 남겼어요.");
      setBody("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteComment = useMutation({
    mutationFn: (commentId: string) =>
      calendarRequest<{ diary: CalendarDiary }>(
        token,
        `/api/calendar/diaries/comments?diaryId=${diary.id}&commentId=${encodeURIComponent(commentId)}`,
        { method: "DELETE" }
      ),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const submit = () => {
    if (!body.trim() || addComment.isPending) return;
    addComment.mutate();
  };

  const handleDelete = async (comment: DiaryComment) => {
    const confirmed = await confirm({
      title: "댓글을 지울까요?",
      description: comment.body,
      confirmLabel: "지우기",
      destructive: true,
    });
    if (confirmed) deleteComment.mutate(comment.id);
  };

  return (
    <>
      <div
        data-testid="diary-comments"
        className={cn(
          "mt-2 rounded-xl border border-hairline bg-canvas-soft/50 p-2.5",
          className
        )}
      >
        <p className="text-[11px] font-semibold text-ink">댓글 {diary.comments.length}</p>
        {diary.comments.length > 0 && (
          <div className="mt-1.5 space-y-1.5">
            {diary.comments.map((comment) => (
              <div
                key={comment.id}
                data-testid="diary-comment"
                className="flex items-start gap-1"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-muted">
                    {VIEWER_NAME[comment.author]} ·{" "}
                    {kst(comment.createdAt).format("M.D HH:mm")}
                  </p>
                  <p className="mt-0.5 text-[12px] leading-snug whitespace-pre-wrap text-body">
                    {comment.body}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="댓글 삭제"
                  data-testid="diary-comment-delete"
                  disabled={deleteComment.isPending}
                  onClick={() => handleDelete(comment)}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 space-y-1.5">
          <Segmented
            ariaLabel="댓글 작성자"
            options={AUTHOR_OPTIONS}
            value={author}
            onChange={setAuthor}
            className="bg-surface"
          />
          <div className="flex items-end gap-1.5">
            <div className="min-w-0 flex-1">
              <Textarea
                rows={1}
                data-testid="diary-comment-input"
                placeholder="댓글을 남겨 보세요"
                maxLength={2000}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  if (event.nativeEvent.isComposing) return;
                  if (event.shiftKey) return;
                  event.preventDefault();
                  submit();
                }}
                className="field-sizing-content max-h-24 min-h-8 text-[12px]"
              />
            </div>
            <Button
              type="button"
              size="sm"
              data-testid="diary-comment-submit"
              disabled={!body.trim() || addComment.isPending}
              onClick={submit}
            >
              등록
            </Button>
          </div>
        </div>
      </div>
      {dialog}
    </>
  );
};
