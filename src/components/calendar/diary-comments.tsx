import { VIEWER_NAME } from "@/lib/calendar/format";
import type { DiaryComment } from "@/lib/calendar/types";
import { kst } from "@/lib/kst";

export const DiaryComments = ({ comments }: { comments: DiaryComment[] }) => {
  if (comments.length === 0) return null;

  return (
    <div
      data-testid="diary-comments"
      className="mt-2 rounded-xl border border-hairline bg-canvas-soft/50 p-2.5"
    >
      <p className="text-[11px] font-semibold text-ink">댓글 {comments.length}</p>
      <div className="mt-1.5 space-y-1.5">
        {comments.map((comment) => (
          <div key={comment.id} data-testid="diary-comment">
            <p className="text-[10px] text-muted">
              {VIEWER_NAME[comment.author]} · {kst(comment.createdAt).format("M.D HH:mm")}
            </p>
            <p className="mt-0.5 text-[12px] leading-snug whitespace-pre-wrap text-body">
              {comment.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
