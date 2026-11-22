"use client";

import {
  CalendarHeart,
  Footprints,
  Heart,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { createParser, parseAsStringLiteral, useQueryState } from "nuqs";
import { useState } from "react";

import { DateDayPicker } from "@/components/dates/day-picker";
import { DateSettingsDialog } from "@/components/dates/settings-dialog";
import { SpotCard } from "@/components/dates/spot-card";
import { SidebarLayout } from "@/components/sidebar-layout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useDateMutations, useDateOverview } from "@/lib/dates/queries";
import type { DateOverview, DateReaction, DateSpotView } from "@/lib/dates/types";
import { kst } from "@/lib/kst";
import { cn } from "@/lib/utils";

const TABS = ["daily", "liked", "visited"] as const;

/**
 * 보고 있는 탭은 `?tab=`으로 주소에 남긴다. 기본값(매일 추천)이면 주소에서 빠지고,
 * 탭을 바꿀 때마다 히스토리를 쌓아 뒤로 가기로 이전 탭에 돌아간다.
 */
const parseAsTab = parseAsStringLiteral(TABS)
  .withDefault("daily")
  .withOptions({ history: "push" });

/** 날짜 칩은 오늘을 포함해 최근 이만큼만 보여 주고, 그 전 날짜는 달력으로 고른다. */
const RECENT_DAY_CHIPS = 7;

/**
 * 고른 날짜는 `?day=YYYY-MM-DD`로 주소에 남긴다. 날짜를 바꿀 때마다 히스토리를 쌓아
 * 뒤로 가기를 누르면 이전에 보던 날짜로 돌아간다. 형식이 맞지 않으면 없는 것으로 본다.
 */
const parseAsDayKey = createParser({
  parse: (value) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null),
  serialize: (value: string) => value,
}).withOptions({ history: "push" });

const Chip = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={cn(
      "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium whitespace-nowrap text-muted ring-1 ring-transparent transition-colors hover:bg-canvas-soft hover:text-body",
      active && "bg-canvas-card text-ink ring-hairline"
    )}
  >
    {children}
  </button>
);

const dayLabel = (dayKey: string) => {
  const day = kst(dayKey);
  const today = kst().startOf("day");
  if (day.isSame(today, "day")) return "오늘";
  if (day.isSame(today.subtract(1, "day"), "day")) return "어제";
  return day.format("M.D (dd)");
};

/** 달력으로 고른 지난 날짜 — 올해가 아니면 연도도 붙인다. */
const olderDayLabel = (dayKey: string) => {
  const day = kst(dayKey);
  return day.format(day.isSame(kst(), "year") ? "M.D (dd)" : "YY.M.D (dd)");
};

const scheduleText = (data: DateOverview) => {
  const { settings, nextCollectAt } = data;
  if (!settings.enabled || !nextCollectAt) return "매일 자동 조사가 꺼져 있어요.";
  const next = kst(nextCollectAt);
  const when = next.isSame(kst(), "day")
    ? `오늘 ${next.format("HH:mm")}`
    : `내일 ${next.format("HH:mm")}`;
  return `매일 ${settings.collectTime}에 ${settings.areas.join("·")}에서 ${settings.count}개씩 골라 와요 · 다음 ${when}`;
};

const SpotGrid = ({
  spots,
  onReact,
  showDay,
}: {
  spots: DateSpotView[];
  onReact: (spot: DateSpotView, reaction: DateReaction | null) => void;
  showDay?: boolean;
}) => (
  <div className="grid gap-3 sm:grid-cols-2">
    {spots.map((spot) => (
      <SpotCard
        key={spot.id}
        spot={spot}
        showDay={showDay}
        onReact={(reaction) => onReact(spot, reaction)}
      />
    ))}
  </div>
);

const Empty = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-hairline px-6 py-14 text-center">
    <CalendarHeart className="size-7 text-primary" />
    <h2 className="text-lg font-medium text-ink">{title}</h2>
    <div className="max-w-md text-sm text-muted">{children}</div>
  </div>
);

export const DateSpotsPage = () => {
  const [day, setDay] = useQueryState("day", parseAsDayKey);
  const [tab, setTab] = useQueryState("tab", parseAsTab);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsKey, setSettingsKey] = useState(0);
  const { data, isLoading, error } = useDateOverview(day);
  const { collectNow, react } = useDateMutations();

  const todayKey = kst().format("YYYY-MM-DD");
  const digest = data?.digest ?? null;
  const pending = Boolean(digest?.pending) || collectNow.isPending;
  const hasTodaySpots = data?.days.some((d) => d.dayKey === todayKey && d.count > 0);
  const days =
    data && !data.days.some((d) => d.dayKey === todayKey)
      ? [{ dayKey: todayKey, count: 0 }, ...data.days]
      : (data?.days ?? []);
  const recentDays = days.slice(0, RECENT_DAY_CHIPS);
  const pickedOlderDay =
    data && !recentDays.some((d) => d.dayKey === data.dayKey) ? data.dayKey : null;
  /**
   * 하트를 끄면 지우지 않고 다녀온 곳으로 옮길지 묻는다.
   * 다녀왔어를 끄거나 "별로"로 바꾸면 어느 탭에도 남지 않으므로 뺄지 한 번 묻는다.
   * 하트·다녀왔어를 새로 켜는 건 바로 바꾼다.
   */
  const [ask, setAsk] = useState<{
    spot: DateSpotView;
    reaction: DateReaction | null;
    move: boolean;
  } | null>(null);
  const onReact = (spot: DateSpotView, reaction: DateReaction | null) => {
    if (spot.reaction === "like" && reaction === null) {
      setAsk({ spot, reaction: "visited", move: true });
      return;
    }
    const kept = spot.reaction === "like" || spot.reaction === "visited";
    if (kept && (reaction === null || reaction === "pass")) {
      setAsk({ spot, reaction, move: false });
      return;
    }
    react.mutate({ spotId: spot.id, reaction });
  };
  const confirmAsk = () => {
    if (ask) react.mutate({ spotId: ask.spot.id, reaction: ask.reaction });
    setAsk(null);
  };
  const askFrom = ask?.spot.reaction === "visited" ? "다녀온 곳" : "가 보고 싶은 곳";

  return (
    <SidebarLayout activeNav="dates">
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 pt-5 md:px-8 md:pt-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="flex items-center gap-2 text-xl font-semibold text-ink">
              <CalendarHeart className="size-5 text-primary" />
              데이트 추천
            </h1>
            {data && <p className="text-[13px] text-muted">{scheduleText(data)}</p>}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!data}
              onClick={() => {
                setSettingsKey((k) => k + 1);
                setSettingsOpen(true);
              }}
            >
              <SlidersHorizontal />
              조건
            </Button>
            <Button
              disabled={!data || pending}
              onClick={() => {
                void setDay(null);
                void setTab("daily");
                collectNow.mutate();
              }}
            >
              <Sparkles />
              {hasTodaySpots ? "더 찾아 줘" : "지금 찾아 줘"}
            </Button>
          </div>
        </header>

        <nav aria-label="보기" className="flex gap-1.5">
          <Chip active={tab === "daily"} onClick={() => void setTab("daily")}>
            <Sparkles className="size-3.5 text-primary" />
            매일 추천
          </Chip>
          <Chip active={tab === "liked"} onClick={() => void setTab("liked")}>
            <Heart className="size-3.5 text-primary" />가 보고 싶은 곳
            {data && data.liked.length > 0 && (
              <span className="text-muted">{data.liked.length}</span>
            )}
          </Chip>
          <Chip active={tab === "visited"} onClick={() => void setTab("visited")}>
            <Footprints className="size-3.5 text-success" />
            다녀온 곳
            {data && data.visited.length > 0 && (
              <span className="text-muted">{data.visited.length}</span>
            )}
          </Chip>
        </nav>

        {isLoading && (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        )}
        {error && <p className="py-10 text-center text-sm text-error">{error.message}</p>}

        {data && tab === "daily" && (
          <section aria-label="매일 추천" className="flex flex-col gap-4">
            {days.length > 0 && (
              <div aria-label="날짜" className="flex items-center gap-1.5">
                <div className="-m-1 flex min-w-0 flex-1 [scrollbar-width:none] gap-1.5 overflow-x-auto p-1">
                  {recentDays.map((d) => (
                    <Chip
                      key={d.dayKey}
                      active={data.dayKey === d.dayKey}
                      onClick={() => void setDay(d.dayKey)}
                    >
                      {dayLabel(d.dayKey)}
                      {d.count > 0 && <span className="text-muted">{d.count}</span>}
                    </Chip>
                  ))}
                </div>
                <DateDayPicker
                  days={days}
                  selected={data.dayKey}
                  todayKey={todayKey}
                  label={pickedOlderDay && olderDayLabel(pickedOlderDay)}
                  active={pickedOlderDay !== null}
                  onSelect={(dayKey) => void setDay(dayKey)}
                />
              </div>
            )}

            {pending && data.dayKey === todayKey && (
              <div
                role="status"
                className="flex items-center gap-2.5 rounded-2xl border border-hairline bg-surface px-4 py-3 text-sm text-body"
              >
                <Spinner />
                하치와레가 인스타그램과 소식을 둘러보는 중이에요. 몇 분 걸릴 수 있어요.
              </div>
            )}
            {!pending && digest?.lastError && (
              <p className="rounded-2xl border border-hairline bg-surface px-4 py-3 text-sm text-error">
                {digest.lastError}
              </p>
            )}

            {digest?.note && (
              <div className="flex items-start gap-2.5">
                <Avatar size="sm">
                  <AvatarImage src="/munjackgui.png" alt="하치와레" />
                </Avatar>
                <p className="rounded-2xl rounded-tl-sm bg-canvas-card px-3.5 py-2.5 text-sm leading-relaxed text-body">
                  {digest.note}
                </p>
              </div>
            )}

            {digest && digest.spots.length > 0 ? (
              <SpotGrid spots={digest.spots} onReact={onReact} />
            ) : (
              !pending && (
                <Empty
                  title={
                    data.dayKey === todayKey
                      ? "오늘 추천은 아직이에요"
                      : "이날은 추천을 받지 못했어요"
                  }
                >
                  {data.settings.enabled
                    ? `매일 ${data.settings.collectTime}에 하치와레가 골라 와요. 기다리기 싫으면 "지금 찾아 줘"를 눌러 보세요.`
                    : '"지금 찾아 줘"를 누르거나 조건에서 매일 자동 조사를 켜 보세요.'}
                </Empty>
              )
            )}
          </section>
        )}

        {data && tab === "liked" && (
          <section aria-label="가 보고 싶은 곳">
            {data.liked.length > 0 ? (
              <SpotGrid spots={data.liked} onReact={onReact} showDay />
            ) : (
              <Empty title="아직 찜한 곳이 없어요">
                추천 카드의 하트를 누르면 여기에 모여요. 하트와 별로 표시는 다음 추천의
                취향 힌트로도 쓰여요.
              </Empty>
            )}
          </section>
        )}

        {data && tab === "visited" && (
          <section aria-label="다녀온 곳">
            {data.visited.length > 0 ? (
              <SpotGrid spots={data.visited} onReact={onReact} showDay />
            ) : (
              <Empty title="아직 다녀온 곳이 없어요">
                추천 카드에서 발자국(다녀왔어)을 누르면 여기에 모여요.
              </Empty>
            )}
          </section>
        )}
        <div className="h-6" />
      </main>

      <AlertDialog open={ask !== null} onOpenChange={(open) => !open && setAsk(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {ask?.move ? "다녀온 곳으로 옮길까요?" : `${askFrom}에서 뺄까요?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {ask &&
                (ask.move
                  ? `‘${ask.spot.name}’ 카드를 다녀온 곳 탭으로 옮겨요.`
                  : `‘${ask.spot.name}’ 카드가 ${askFrom} 목록에서 사라져요.`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>그대로 둘래</AlertDialogCancel>
            <AlertDialogAction
              variant={ask?.move ? "default" : "destructive"}
              onClick={confirmAsk}
            >
              {ask?.move ? "옮길래" : "뺄래"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {data && (
        <DateSettingsDialog
          key={settingsKey}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          settings={data.settings}
        />
      )}
    </SidebarLayout>
  );
};
