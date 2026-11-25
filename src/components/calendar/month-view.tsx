"use client";

import { Heart } from "lucide-react";
import { useMemo } from "react";

import {
  DayNumber,
  DiaryMark,
  Polaroid,
  WeekdayHeader,
} from "@/components/calendar/calendar-ui";
import type {
  CalendarDayInfo,
  CalendarDiarySummary,
  CalendarLabel,
  CalendarOccurrence,
  CalendarSettings,
} from "@/lib/calendar/types";
import {
  compareOccurrences,
  groupEventsByDate,
  labelColorResolver,
  monthGridCells,
  todayKst,
} from "@/lib/calendar/view";
import { kst } from "@/lib/kst";
import { cn } from "@/lib/utils";

/** 한 주에 보여 줄 일정 줄 수. 넘치는 일정은 칸마다 +N으로 표시한다. */
const MAX_LANES = 2;

/**
 * 일정 띠 배치. 칸 안의 빈 자리와 겹쳐 그리는 띠가 같은 값을 쓴다.
 * 글씨 크기에 맞춰 폰/md 이상에서 값이 달라야 해서 격자에 CSS 변수로 두고 calc()로 쓴다.
 * 띠는 칸 테두리+여백(5px) 다음, 날짜 줄과 그 주에 있는 음력·공휴일 줄 바로 아래부터 그린다.
 */
const LAYOUT_VARS =
  "[--date-row:20px] [--info-line:12px] [--lane:16px] [--lane-gap:2px] [--overflow:13px] md:[--date-row:24px] md:[--info-line:15px] md:[--lane:20px] md:[--lane-gap:3px] md:[--overflow:16px]";
const CELL_INSET = "5px";
const HEADER_GAP = "2px";

/** 칸 아래에 겹쳐 붙이는 폴라로이드 수. 맨 앞 한 장이 칸 폭을 다 쓰고 나머지는 뒤에 비친다. */
const MAX_POLAROIDS = 3;
/** 뒤 사진 기울기와 어긋남. 앞 사진(-3deg)과 반대쪽으로 기울여 가장자리가 비치게 한다. */
const BACK_TILTS = [
  "rotate-[5deg] -translate-x-[3%] -translate-y-[4%]",
  "-rotate-[9deg] translate-x-[3%] -translate-y-[2%]",
];

type WeekBar = {
  event: CalendarOccurrence;
  startCol: number;
  endCol: number;
  lane: number;
  /** 이 주에서 일정이 실제로 시작하는 조각인지 */
  isStart: boolean;
  /** 이 주에서 일정이 실제로 끝나는 조각인지 */
  isEnd: boolean;
};

type WeekRow = {
  key: string;
  cells: (CalendarDayInfo | null)[];
  /** 보이는 줄(lane < MAX_LANES)에 놓인 띠 */
  bars: WeekBar[];
  /** 이 주에서 실제로 쓰는 줄 수(최대 MAX_LANES) */
  laneCount: number;
  overflowByDate: Map<string, number>;
};

/**
 * 주 단위 행. 여러 날 일정을 칸마다 쪼개지 않고 한 줄로 이어 붙이기 위해
 * 주마다 겹치는 일정을 모아 시작/끝 칸과 줄(lane)을 미리 계산한다.
 */
const buildWeeks = (
  days: CalendarDayInfo[],
  events: CalendarOccurrence[],
  weekStart: 0 | 1
): WeekRow[] => {
  const cells = monthGridCells(days, weekStart);
  const rows: WeekRow[] = [];

  for (let start = 0; start < cells.length; start += 7) {
    const chunk = cells.slice(start, start + 7);
    const realDays = chunk.flatMap((day, col) => (day ? [{ day, col }] : []));
    const first = realDays[0];
    const last = realDays[realDays.length - 1];
    if (!first || !last) continue;

    // 줄은 앞에서부터 채우므로 이 주에서 먼저 시작하는 일정부터 놓는다.
    // 같은 날 시작하면 긴 일정 먼저, 그다음 종일·시각 순.
    // (시작일을 무시하고 놓으면 주 후반 일정이 0번 줄을 먼저 차지해 앞날 일정이 한 줄 아래로 밀린다.)
    const weekEvents = events
      .filter(
        (ev) =>
          ev.occurrenceDate <= last.day.date && ev.occurrenceEndDate >= first.day.date
      )
      .sort(
        (a, b) =>
          a.occurrenceDate.localeCompare(b.occurrenceDate) ||
          b.occurrenceEndDate.localeCompare(a.occurrenceEndDate) ||
          compareOccurrences(a, b)
      );

    const laneEnds: number[] = [];
    const bars: WeekBar[] = [];
    const overflowByDate = new Map<string, number>();

    for (const event of weekEvents) {
      const cols = realDays.filter(
        ({ day }) =>
          day.date >= event.occurrenceDate && day.date <= event.occurrenceEndDate
      );
      const startCol = cols[0]?.col;
      const endCol = cols[cols.length - 1]?.col;
      if (startCol === undefined || endCol === undefined) continue;

      let lane = laneEnds.findIndex((laneEnd) => laneEnd < startCol);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = endCol;

      if (lane >= MAX_LANES) {
        // 보이지 않는 줄로 밀린 일정은 날짜별 +N으로 센다.
        for (const { day } of cols) {
          overflowByDate.set(day.date, (overflowByDate.get(day.date) ?? 0) + 1);
        }
        continue;
      }

      bars.push({
        event,
        startCol,
        endCol,
        lane,
        isStart: event.occurrenceDate >= first.day.date,
        isEnd: event.occurrenceEndDate <= last.day.date,
      });
    }

    rows.push({
      key: first.day.date,
      cells: chunk,
      bars,
      laneCount: Math.min(laneEnds.length, MAX_LANES),
      overflowByDate,
    });
  }

  return rows;
};

/** 날짜별 일기 사진. 두 사람의 일기를 모두 모으고 칸에는 앞의 몇 장만 붙인다. */
const groupDiaryPhotos = (diaries: CalendarDiarySummary[]): Map<string, string[]> => {
  const map = new Map<string, string[]>();
  for (const diary of diaries) {
    const list = map.get(diary.date) ?? [];
    list.push(...diary.thumbs);
    map.set(diary.date, list.slice(0, MAX_POLAROIDS));
  }
  return map;
};

/**
 * 칸 폭에 맞춘 폴라로이드 더미. 가계부 달력처럼 앞 사진은 왼쪽으로 살짝, 뒤 사진은 반대로 기울여 겹친다.
 * 기울어져 튀어나오는 모서리는 칸 안쪽 여백(p-1)이 받아 주므로 칸 테두리에 잘리지 않는다.
 */
const PolaroidStack = ({ photos }: { photos: string[] }) => {
  const [front, ...back] = photos;
  if (!front) return null;
  return (
    <div
      aria-hidden="true"
      data-testid="day-polaroids"
      className="pointer-events-none relative mt-auto w-full pt-2"
    >
      {back.map((src, index) => (
        <Polaroid
          key={index}
          src={src}
          className={cn("absolute inset-x-0 bottom-0 w-full", BACK_TILTS[index])}
        />
      ))}
      <Polaroid src={front} className="relative w-full -rotate-3" />
    </div>
  );
};

const EventBar = ({ bar, color }: { bar: WeekBar; color: string }) => {
  const time =
    bar.isStart && !bar.event.allDay ? kst(bar.event.startAt).format("HH:mm") : null;
  return (
    <div
      data-testid="event-bar"
      data-event-id={bar.event.id}
      data-lane={bar.lane}
      className={cn(
        "flex min-w-0 items-center gap-1 overflow-hidden px-1 text-[10px] leading-none font-medium text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.35)] md:text-[12px]",
        bar.isStart && "rounded-l-[4px]",
        bar.isEnd && "rounded-r-[4px]"
      )}
      style={{
        gridColumn: `${bar.startCol + 1} / ${bar.endCol + 2}`,
        gridRow: bar.lane + 1,
        backgroundColor: color,
      }}
    >
      <span className="min-w-0 truncate">{bar.event.title}</span>
      {time && (
        <span className="hidden shrink-0 tabular-nums opacity-90 md:inline">{time}</span>
      )}
      {bar.event.owner === "together" && (
        <Heart
          aria-hidden="true"
          className="hidden size-3 shrink-0 text-white/90 md:block"
        />
      )}
    </div>
  );
};

export const MonthView = ({
  days,
  events,
  diaries,
  labels,
  settings,
  selectedDate,
  onSelectDay,
}: {
  days: CalendarDayInfo[];
  events: CalendarOccurrence[];
  diaries: CalendarDiarySummary[];
  labels: CalendarLabel[];
  settings: CalendarSettings;
  selectedDate: string | null;
  onSelectDay: (date: string) => void;
}) => {
  const today = todayKst();
  const eventsByDate = useMemo(() => groupEventsByDate(events, days), [events, days]);
  const photosByDate = useMemo(() => groupDiaryPhotos(diaries), [diaries]);
  const diaryDates = useMemo(
    () => new Set(diaries.map((diary) => diary.date)),
    [diaries]
  );
  const colorOf = useMemo(() => labelColorResolver(labels), [labels]);
  const weeks = useMemo(
    () => buildWeeks(days, events, settings.weekStart),
    [days, events, settings.weekStart]
  );

  return (
    <div className="rounded-2xl border border-hairline bg-surface p-2 md:p-3">
      <div data-testid="month-grid" className={cn("grid grid-cols-7 gap-1", LAYOUT_VARS)}>
        <WeekdayHeader weekStart={settings.weekStart} />

        {weeks.map((week) => {
          const hasOverflow = week.overflowByDate.size > 0;
          // 음력·공휴일 줄은 그 주에 있을 때만 자리를 잡아, 없으면 띠가 날짜 바로 아래에서 시작한다.
          const infoLines =
            Number(settings.lunarMonth && week.cells.some((day) => day?.lunar)) +
            Number(settings.showHolidays && week.cells.some((day) => day?.holiday));
          const headerHeight = `calc(var(--date-row) + ${infoLines} * var(--info-line) + ${HEADER_GAP})`;
          // 칸 안에서 일정 띠가 덮는 높이. 사진은 이 아래부터 붙는다.
          const laneArea = `calc(${week.laneCount} * (var(--lane) + var(--lane-gap)) + ${Number(hasOverflow)} * var(--overflow))`;

          return (
            <div key={week.key} className="relative col-span-7 grid grid-cols-7 gap-1">
              {week.cells.map((day, col) => {
                if (!day) return <div key={`empty-${week.key}-${col}`} />;

                const dayEvents = eventsByDate.get(day.date) ?? [];
                const isSelected = day.date === selectedDate;
                const isToday = day.date === today;
                const photos = settings.showPhotos
                  ? (photosByDate.get(day.date) ?? [])
                  : [];
                const overflow = week.overflowByDate.get(day.date) ?? 0;
                const hasDiary = diaryDates.has(day.date);

                return (
                  <button
                    key={day.date}
                    type="button"
                    data-testid={`day-cell-${day.date}`}
                    aria-label={`${kst(day.date).format("M월 D일 dddd")}, 일정 ${dayEvents.length}개${hasDiary ? ", 일기 있음" : ""}`}
                    onClick={() => onSelectDay(day.date)}
                    className={cn(
                      "relative flex min-h-[88px] flex-col items-start overflow-hidden rounded-lg border border-hairline-soft/80 p-1 text-left transition-colors hover:bg-canvas-soft/70 md:min-h-[112px]",
                      isToday && "ring-1 ring-primary/40",
                      isSelected &&
                        "border-primary bg-canvas-card ring-1 ring-primary/50 hover:bg-canvas-card"
                    )}
                  >
                    {/* 날짜·음력·공휴일. 띠가 이 바로 아래부터 그려지므로 주마다 같은 높이로 고정한다. */}
                    <div
                      className="flex w-full shrink-0 flex-col"
                      style={{ height: headerHeight }}
                    >
                      <div className="flex h-(--date-row) w-full items-center justify-between">
                        <DayNumber day={day} settings={settings} isToday={isToday} />
                        {/* 사진이 붙으면 그걸로 일기가 보이므로, 사진이 없을 때만 표시한다. */}
                        {hasDiary && photos.length === 0 && (
                          <DiaryMark className="mr-0.5" />
                        )}
                      </div>
                      {settings.lunarMonth && day.lunar && (
                        <span className="w-full truncate text-[10px] leading-none text-muted-soft md:text-[12px]">
                          {day.lunar.label}
                        </span>
                      )}
                      {settings.showHolidays && day.holiday && (
                        <span className="w-full truncate text-[10px] leading-none font-medium text-error md:text-[12px]">
                          {day.holiday}
                        </span>
                      )}
                    </div>

                    <div
                      aria-hidden="true"
                      className="flex w-full shrink-0 flex-col justify-end"
                      style={{ height: laneArea }}
                    >
                      {overflow > 0 && (
                        <span className="text-[10px] leading-none text-muted-soft tabular-nums md:text-[12px]">
                          +{overflow}
                        </span>
                      )}
                    </div>

                    <PolaroidStack photos={photos} />
                  </button>
                );
              })}

              {/* 날짜 칸 위에 겹쳐 그리는 일정 띠. 여러 날 일정은 한 칸 폭이 아니라
                  gridColumn으로 이어 붙여 칸 경계를 넘어도 끊기지 않는다. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 z-10 grid grid-cols-7 gap-x-1"
                style={{
                  top: `calc(${CELL_INSET} + ${headerHeight})`,
                  gridAutoRows: "var(--lane)",
                  rowGap: "var(--lane-gap)",
                }}
              >
                {week.bars.map((bar) => (
                  <EventBar
                    key={bar.event.occurrenceKey}
                    bar={bar}
                    color={colorOf(bar.event.labelId)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
