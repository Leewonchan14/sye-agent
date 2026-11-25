"use client";

import { Heart } from "lucide-react";
import { useMemo } from "react";

import { VIEWER_NAME } from "@/lib/calendar/format";
import { labelColor } from "@/lib/calendar/labels";
import type {
  CalendarLabel,
  CalendarOccurrence,
  CalendarViewer,
} from "@/lib/calendar/types";
import { kst } from "@/lib/kst";

import { compareOccurrences } from "@/components/calendar/month-view";

const timeText = (event: CalendarOccurrence): string =>
  event.allDay ? "종일" : kst(event.startAt).format("HH:mm");

const CoupleColumn = ({
  owner,
  events,
  colorOf,
}: {
  owner: CalendarViewer;
  events: CalendarOccurrence[];
  colorOf: (labelId: number | null) => string;
}) => {
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarOccurrence[]>();
    for (const event of events) {
      const list = map.get(event.occurrenceDate) ?? [];
      list.push(event);
      map.set(event.occurrenceDate, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [events]);

  return (
    <section
      data-testid={`couple-column-${owner}`}
      className="min-w-0 rounded-2xl border border-hairline bg-surface p-2 md:p-3"
    >
      <div className="flex items-baseline justify-between gap-2 px-1 pt-0.5 pb-1.5">
        <h3 className="text-[13px] font-semibold text-ink">{VIEWER_NAME[owner]}</h3>
        <span className="text-[11px] text-muted tabular-nums">
          일정 {events.length}개
        </span>
      </div>
      {byDate.length === 0 ? (
        <p className="px-1 py-6 text-center text-[12px] text-muted">
          이 달 일정이 없어요
        </p>
      ) : (
        <div className="divide-y divide-hairline-soft">
          {byDate.map(([date, list]) => (
            <div key={date} className="px-1 py-1.5">
              <p className="text-[10px] text-muted-soft tabular-nums">
                {kst(date).format("M월 D일 ddd")}
              </p>
              <div className="mt-1 space-y-1">
                {list.map((event) => (
                  <div key={event.occurrenceKey} className="flex items-start gap-1.5">
                    <span
                      aria-hidden="true"
                      className="mt-1 size-1.5 shrink-0 rounded-full"
                      style={{ background: colorOf(event.labelId) }}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[12px] leading-tight text-body md:text-[13px]">
                        {event.title}
                      </p>
                      <p className="truncate text-[10px] text-muted-soft tabular-nums">
                        {timeText(event)}
                        {event.location && ` · ${event.location}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export const CoupleView = ({
  events,
  labels,
}: {
  events: CalendarOccurrence[];
  labels: CalendarLabel[];
}) => {
  const labelsById = useMemo(
    () => new Map(labels.map((label) => [label.id, label])),
    [labels]
  );

  const colorOf = (labelId: number | null): string => {
    if (labelId == null) return "var(--color-primary)";
    const label = labelsById.get(labelId);
    return label ? labelColor(label.color) : "var(--color-primary)";
  };

  const together = useMemo(
    () => events.filter((event) => event.owner === "together").sort(compareOccurrences),
    [events]
  );
  const wonchan = useMemo(
    () => events.filter((event) => event.owner === "wonchan").sort(compareOccurrences),
    [events]
  );
  const yeeun = useMemo(
    () => events.filter((event) => event.owner === "yeeun").sort(compareOccurrences),
    [events]
  );

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-hairline bg-surface p-2 md:p-3">
        <div className="flex items-center gap-1.5 px-1 pt-0.5 pb-1.5">
          <Heart className="size-3.5 text-primary" />
          <h3 className="text-[13px] font-semibold text-ink">함께</h3>
          <span className="text-[11px] text-muted tabular-nums">{together.length}개</span>
        </div>
        {together.length === 0 ? (
          <p className="px-1 py-4 text-center text-[12px] text-muted">
            이 달 함께 일정이 없어요
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5 px-1 pb-1">
            {together.map((event) => (
              <div
                key={event.occurrenceKey}
                className="flex max-w-full items-center gap-1.5 rounded-full border border-hairline bg-canvas-soft px-2.5 py-1 text-[11px]"
              >
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ background: colorOf(event.labelId) }}
                />
                <span className="text-muted-soft tabular-nums">
                  {kst(event.occurrenceDate).format("M.D")}
                </span>
                <span className="max-w-40 truncate font-medium text-body">
                  {event.title}
                </span>
                <span className="text-muted-soft tabular-nums">{timeText(event)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-2 items-start gap-2 md:gap-3 [&>*]:min-w-0">
        <CoupleColumn owner="wonchan" events={wonchan} colorOf={colorOf} />
        <CoupleColumn owner="yeeun" events={yeeun} colorOf={colorOf} />
      </div>
    </div>
  );
};
