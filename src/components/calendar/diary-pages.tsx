"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Stepper } from "@/components/calendar/calendar-ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthStore } from "@/lib/auth-store";
import { calendarKeys, calendarRequest } from "@/lib/calendar/client";
import { ownerName } from "@/lib/calendar/format";
import { useCalendarSettings } from "@/lib/calendar/hooks";
import type { CalendarDiary, CalendarSettings } from "@/lib/calendar/types";
import { kst } from "@/lib/kst";
import { cn } from "@/lib/utils";

type DiaryTab = "daily" | "monthly" | "fourcut";

const dayDiariesOf = (diaries: CalendarDiary[], date: string) =>
  diaries.filter((diary) => diary.date === date);

export const DiaryPages = () => {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<DiaryTab>("daily");
  const [date, setDate] = useState(() => kst().format("YYYY-MM-DD"));

  const month = date.slice(0, 7);

  const { data: settings } = useCalendarSettings();
  const plus = settings?.plus ?? true;

  const { data: diaries = [] } = useQuery({
    queryKey: calendarKeys.diariesMonth(month),
    queryFn: async () => {
      const res = await calendarRequest<{ diaries: CalendarDiary[] }>(
        token,
        `/api/calendar/diaries?month=${month}`
      );
      return res.diaries;
    },
    enabled: Boolean(token) && plus,
  });

  const enablePlus = useMutation({
    mutationFn: () =>
      calendarRequest<{ settings: CalendarSettings }>(token, "/api/calendar/settings", {
        method: "PATCH",
        body: JSON.stringify({ plus: true }),
      }),
    onSuccess: () => {
      toast.success("Plus를 켰어요.");
      queryClient.invalidateQueries({ queryKey: calendarKeys.settings });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const goDate = (delta: number) =>
    setDate((prev) => kst(prev).add(delta, "day").format("YYYY-MM-DD"));

  const goMonth = (delta: number) =>
    setDate((prev) => {
      const current = kst(prev);
      const day = current.date();
      const target = current.add(delta, "month");
      return target.date(Math.min(day, target.daysInMonth())).format("YYYY-MM-DD");
    });

  const dayDiaries = dayDiariesOf(diaries, date);
  const sorted = [...diaries].sort((a, b) => a.date.localeCompare(b.date));
  const fourPhotos = dayDiaries.flatMap((diary) => diary.photos).slice(0, 4);
  const caption = dayDiaries
    .map((diary) => diary.body.trim())
    .filter(Boolean)
    .join("\n\n");

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 md:px-8 md:py-8">
      <header className="flex items-center gap-2">
        <Link
          href="/calendar"
          aria-label="캘린더로 돌아가기"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
        >
          <ArrowLeft />
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-ink">일기 페이지</h1>
      </header>

      {!plus ? (
        <div className="mt-8 grid place-items-center rounded-2xl border border-hairline bg-surface p-10 text-center">
          <Lock className="size-6 text-primary" />
          <p className="mt-2 text-sm font-medium text-ink">Plus 전용</p>
          <p className="mt-1 text-[12px] text-muted">
            일기 페이지를 보려면 Plus를 켜 주세요.
          </p>
          <Button
            className="mt-4"
            onClick={() => enablePlus.mutate()}
            disabled={enablePlus.isPending}
          >
            Plus 켜기
          </Button>
        </div>
      ) : (
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as DiaryTab)}
          className="mt-5"
        >
          <TabsList
            variant="line"
            className="w-full justify-start gap-4 border-b border-hairline pb-2"
          >
            <TabsTrigger
              value="daily"
              className="flex-none px-1 text-[13px] after:bg-primary"
            >
              하루 기록
            </TabsTrigger>
            <TabsTrigger
              value="monthly"
              className="flex-none px-1 text-[13px] after:bg-primary"
            >
              한달 기록
            </TabsTrigger>
            <TabsTrigger
              value="fourcut"
              className="flex-none px-1 text-[13px] after:bg-primary"
            >
              4컷 하루
            </TabsTrigger>
          </TabsList>

          <TabsContent value="daily" data-testid="diary-page-daily">
            <Stepper
              className="mt-4"
              prevLabel="이전 날"
              nextLabel="다음 날"
              onPrev={() => goDate(-1)}
              onNext={() => goDate(1)}
            >
              <span className="text-sm font-medium text-ink">
                {kst(date).format("M월 D일 dddd")}
              </span>
            </Stepper>
            <div className="mt-3 space-y-3">
              {dayDiaries.length === 0 ? (
                <p className="py-10 text-center text-[12px] text-muted">
                  이날의 일기가 없어요.
                </p>
              ) : (
                dayDiaries.map((diary) => (
                  <article
                    key={diary.id}
                    className="rounded-2xl border border-hairline bg-surface p-4"
                  >
                    <p className="text-[13px] font-medium text-ink">
                      {ownerName(diary.author)}
                    </p>
                    {diary.body && (
                      <p className="mt-2 text-[13px] leading-relaxed whitespace-pre-wrap text-body">
                        {diary.body}
                      </p>
                    )}
                    {diary.photos.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {diary.photos.map((photo) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={photo.id}
                            src={photo.thumb}
                            alt="일기 사진"
                            className="size-32 rounded-xl object-cover sm:size-40"
                          />
                        ))}
                      </div>
                    )}
                  </article>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="monthly" data-testid="diary-page-monthly">
            <Stepper
              className="mt-4"
              prevLabel="이전 달"
              nextLabel="다음 달"
              onPrev={() => goMonth(-1)}
              onNext={() => goMonth(1)}
            >
              <span className="text-sm font-medium text-ink">
                {kst(`${month}-01`).format("YYYY년 M월")}
              </span>
            </Stepper>
            <div className="mt-4 space-y-4">
              {sorted.length === 0 ? (
                <p className="py-10 text-center text-[12px] text-muted">
                  이달의 일기가 없어요.
                </p>
              ) : (
                sorted.map((diary) => (
                  <div key={diary.id} className="flex gap-3">
                    <div className="w-14 shrink-0 text-right">
                      <p className="text-[13px] font-semibold text-ink tabular-nums">
                        {kst(diary.date).format("D일")}
                      </p>
                      <p className="text-[10px] text-muted">
                        {kst(diary.date).format("ddd")}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1 rounded-2xl border border-hairline bg-surface p-3">
                      <span className="text-[12px] font-medium text-ink">
                        {ownerName(diary.author)}
                      </span>
                      {diary.body && (
                        <p className="mt-1 line-clamp-3 text-[12px] whitespace-pre-wrap text-body">
                          {diary.body}
                        </p>
                      )}
                      {diary.photos.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {diary.photos.map((photo) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={photo.id}
                              src={photo.thumb}
                              alt="일기 사진"
                              className="size-20 rounded-lg object-cover"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="fourcut" data-testid="diary-page-fourcut">
            <Stepper
              className="mt-4"
              prevLabel="이전 날"
              nextLabel="다음 날"
              onPrev={() => goDate(-1)}
              onNext={() => goDate(1)}
            >
              <span className="text-sm font-medium text-ink">
                {kst(date).format("M월 D일 dddd")}
              </span>
            </Stepper>
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-hairline bg-surface p-3">
              {[0, 1, 2, 3].map((index) => {
                const photo = fourPhotos[index];
                return photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={photo.id}
                    src={photo.full}
                    alt="하루 사진"
                    className="aspect-square w-full rounded-lg object-cover"
                  />
                ) : (
                  <div
                    key={`empty-${index}`}
                    className="grid aspect-square w-full place-items-center rounded-lg border border-dashed border-canvas-strong bg-canvas-soft"
                  >
                    <span className="text-[11px] text-muted-soft">빈 프레임</span>
                  </div>
                );
              })}
            </div>
            {caption && (
              <p className="mt-3 rounded-xl bg-canvas-soft px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap text-body">
                {caption}
              </p>
            )}
          </TabsContent>
        </Tabs>
      )}
    </main>
  );
};
