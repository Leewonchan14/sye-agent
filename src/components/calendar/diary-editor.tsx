"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ImagePlus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  SHEET_BODY_CLASS,
  SHEET_CONTENT_CLASS,
  SHEET_FOOTER_CLASS,
  Segmented,
} from "@/components/calendar/calendar-ui";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/lib/auth-store";
import { calendarKeys, calendarRequest } from "@/lib/calendar/client";
import { VIEWER_NAME } from "@/lib/calendar/format";
import { useInvalidateCalendar } from "@/lib/calendar/hooks";
import type {
  CalendarDiary,
  CalendarDiaryInput,
  CalendarViewer,
  DiaryPhoto,
} from "@/lib/calendar/types";
import { kst } from "@/lib/kst";

const MAX_PHOTOS = 4;
const FULL_MAX_PX = 1600;
const FULL_QUALITY = 0.82;
const THUMB_MAX_PX = 480;
const THUMB_QUALITY = 0.7;

const AUTHORS = ["wonchan", "yeeun"] as const;

const compressImage = (
  file: File,
  maxPx: number,
  quality: number
): Promise<{ dataUrl: string; width: number; height: number }> => {
  const { promise, resolve, reject } = Promise.withResolvers<{
    dataUrl: string;
    width: number;
    height: number;
  }>();
  const image = new Image();
  const url = URL.createObjectURL(file);
  image.onload = () => {
    URL.revokeObjectURL(url);
    const scale = Math.min(1, maxPx / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("이미지를 처리하지 못했어요."));
      return;
    }
    ctx.drawImage(image, 0, 0, width, height);
    resolve({ dataUrl: canvas.toDataURL("image/jpeg", quality), width, height });
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error("이미지를 읽지 못했어요."));
  };
  image.src = url;
  return promise;
};

const AUTHOR_OPTIONS = AUTHORS.map((key) => ({
  value: key,
  label: VIEWER_NAME[key],
  testId: `diary-author-${key}`,
}));

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
}

export const DiaryEditor = ({ open, onOpenChange, date }: Props) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent data-testid="diary-dialog" className={SHEET_CONTENT_CLASS}>
      <DialogHeader>
        <DialogTitle>{kst(date).format("M월 D일 dddd")}</DialogTitle>
        <DialogDescription>오늘의 기록을 남겨 보세요.</DialogDescription>
      </DialogHeader>
      <DiaryForm date={date} onOpenChange={onOpenChange} />
    </DialogContent>
  </Dialog>
);

const DiaryForm = ({ date, onOpenChange }: Pick<Props, "date" | "onOpenChange">) => {
  const token = useAuthStore((s) => s.token);
  const [author, setAuthor] = useState<CalendarViewer>("wonchan");
  const { data: diaries, isPending } = useQuery({
    queryKey: calendarKeys.diariesDate(date),
    queryFn: async () => {
      const res = await calendarRequest<{ diaries: CalendarDiary[] }>(
        token,
        `/api/calendar/diaries?date=${date}`
      );
      return res.diaries;
    },
    enabled: Boolean(token),
  });

  if (isPending) {
    return (
      <div className="grid min-h-40 place-items-center">
        <p className="text-[12px] text-muted">일기를 불러오는 중이에요.</p>
      </div>
    );
  }

  const existing = (diaries ?? []).find((diary) => diary.author === author) ?? null;
  return (
    <DiaryFields
      key={`${author}:${existing?.id ?? "new"}`}
      date={date}
      author={author}
      onAuthorChange={setAuthor}
      existing={existing}
      onOpenChange={onOpenChange}
    />
  );
};

const DiaryFields = ({
  date,
  author,
  onAuthorChange,
  existing,
  onOpenChange,
}: {
  date: string;
  author: CalendarViewer;
  onAuthorChange: (author: CalendarViewer) => void;
  existing: CalendarDiary | null;
  onOpenChange: (open: boolean) => void;
}) => {
  const token = useAuthStore((s) => s.token);
  const invalidate = useInvalidateCalendar();
  const { confirm, dialog } = useConfirmDialog();

  const [body, setBody] = useState(existing?.body ?? "");
  const [photos, setPhotos] = useState<DiaryPhoto[]>(existing?.photos ?? []);

  const saveDiary = useMutation({
    mutationFn: async () => {
      const payload: CalendarDiaryInput = {
        date,
        author,
        body: body.trim(),
        photos,
      };
      const res = await calendarRequest<{ diary: CalendarDiary }>(
        token,
        "/api/calendar/diaries",
        { method: "POST", body: JSON.stringify(payload) }
      );
      return res.diary;
    },
    onSuccess: () => {
      toast.success("일기를 저장했어요.");
      void invalidate();
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeDiary = useMutation({
    mutationFn: () =>
      calendarRequest<{ ok: true }>(token, `/api/calendar/diaries?id=${existing?.id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      toast.success("일기를 지웠어요.");
      void invalidate();
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      toast.error("사진은 최대 4장까지 넣을 수 있어요.");
      return;
    }
    const selected = Array.from(fileList).slice(0, room);
    try {
      const prepared = await Promise.all(
        selected.map(async (file) => {
          const full = await compressImage(file, FULL_MAX_PX, FULL_QUALITY);
          const thumb = await compressImage(file, THUMB_MAX_PX, THUMB_QUALITY);
          return {
            id: crypto.randomUUID(),
            full: full.dataUrl,
            thumb: thumb.dataUrl,
            width: full.width,
            height: full.height,
          } satisfies DiaryPhoto;
        })
      );
      setPhotos((prev) => [...prev, ...prepared]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "사진을 처리하지 못했어요.");
    }
  };

  const isEmpty = body.trim() === "" && photos.length === 0;

  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (isEmpty) return;
          saveDiary.mutate();
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className={SHEET_BODY_CLASS}>
          <div>
            <p className="text-[12px] font-medium text-muted">작성자</p>
            <div className="mt-1">
              <Segmented
                ariaLabel="작성자"
                options={AUTHOR_OPTIONS}
                value={author}
                onChange={onAuthorChange}
                className="bg-surface"
              />
            </div>
          </div>

          <div>
            <label className="text-[12px] font-medium text-muted" htmlFor="diary-body">
              내용
            </label>
            <Textarea
              id="diary-body"
              data-testid="field-diary-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="어떤 일이 있었나요?"
              rows={5}
              maxLength={10000}
              className="mt-1 resize-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-medium text-muted">사진</p>
              <span className="text-[11px] text-muted">
                {photos.length}/{MAX_PHOTOS}
              </span>
            </div>
            <div className="mt-1 grid grid-cols-4 gap-2">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="relative aspect-square overflow-hidden rounded-xl border border-hairline bg-canvas-soft"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.thumb}
                    alt="일기 사진"
                    className="size-full object-cover"
                  />
                  <button
                    type="button"
                    aria-label="사진 삭제"
                    onClick={() =>
                      setPhotos((prev) => prev.filter((item) => item.id !== photo.id))
                    }
                    className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-black/50 text-white"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <label className="grid aspect-square cursor-pointer place-items-center rounded-xl border border-dashed border-hairline bg-canvas-soft text-muted hover:bg-canvas-card">
                  <ImagePlus className="size-5" />
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    data-testid="field-diary-photo"
                    className="sr-only"
                    onChange={(event) => {
                      void addFiles(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          </div>
        </div>

        <div className={SHEET_FOOTER_CLASS}>
          <div>
            {existing && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={async () => {
                  const ok = await confirm({
                    title: "일기를 지울까요?",
                    description: `${kst(date).format("M월 D일 dddd")} · ${VIEWER_NAME[author]}`,
                    confirmLabel: "지우기",
                    destructive: true,
                  });
                  if (ok) removeDiary.mutate();
                }}
              >
                삭제
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button
              type="submit"
              data-testid="btn-save-diary"
              disabled={isEmpty || saveDiary.isPending}
            >
              {saveDiary.isPending ? "저장 중..." : "저장"}
            </Button>
          </div>
        </div>
      </form>
      {dialog}
    </>
  );
};
