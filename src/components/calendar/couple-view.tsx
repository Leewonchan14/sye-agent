"use client";

import { Heart } from "lucide-react";
import { useMemo } from "react";

import { LabelDot } from "@/components/calendar/calendar-ui";
import { VIEWER_NAME } from "@/lib/calendar/format";
import type {
  CalendarLabel,
  CalendarOccurrence,
  CalendarOwner,
  CalendarViewer,
} from "@/lib/calendar/types";
import {
  compareOccurrences,
  eventTimeText,
  labelColorResolver,
} from "@/lib/calendar/view";
import { kst } from "@/lib/kst";

type ColorOf = (labelId: number | null) => string;

const CoupleColumn = ({
  owner,
  events,
  colorOf,
}: {
  owner: CalendarViewer;
  events: CalendarOccurrence[];
  colorOf: ColorOf;
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
      {byDate.length === 0 && (
        <p className="px-1 py-6 text-center text-[12px] text-muted">
          이 달 일정이 없어요
        </p>
      )}
      <div className="divide-y divide-hairline-soft">
        {byDate.map(([date, list]) => (
          <div key={date} className="px-1 py-1.5">
            <p className="text-[10px] text-muted-soft tabular-nums">
              {kst(date).format("M월 D일 ddd")}
            </p>
            <div className="mt-1 space-y-1">
              {list.map((event) => (
                <div key={event.occurrenceKey} className="flex items-start gap-1.5">
                  <LabelDot color={colorOf(event.labelId)} className="mt-1" />
                  <div className="min-w-0">
                    <p className="truncate text-[12px] leading-tight text-body md:text-[13px]">
                      {event.title}
                    </p>
                    <p className="truncate text-[10px] text-muted-soft tabular-nums">
                      {eventTimeText(event)}
                      {event.location && ` · ${event.location}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

const TogetherSection = ({
  events,
  colorOf,
}: {
  events: CalendarOccurrence[];
  colorOf: ColorOf;
}) => (
  <section className="rounded-2xl border border-hairline bg-surface p-2 md:p-3">
    <div className="flex items-center gap-1.5 px-1 pt-0.5 pb-1.5">
      <Heart className="size-3.5 text-primary" />
      <h3 className="text-[13px] font-semibold text-ink">둘 다</h3>
      <span className="text-[11px] text-muted tabular-nums">{events.length}개</span>
    </div>
    {events.length === 0 && (
      <p className="px-1 py-4 text-center text-[12px] text-muted">
        이 달 둘 다 일정이 없어요
      </p>
    )}
    <div className="flex flex-wrap gap-1.5 px-1 pb-1">
      {events.map((event) => (
        <div
          key={event.occurrenceKey}
          className="flex max-w-full items-center gap-1.5 rounded-full border border-hairline bg-canvas-soft px-2.5 py-1 text-[11px]"
        >
          <LabelDot color={colorOf(event.labelId)} />
          <span className="text-muted-soft tabular-nums">
            {kst(event.occurrenceDate).format("M.D")}
          </span>
          <span className="max-w-40 truncate font-medium text-body">{event.title}</span>
          <span className="text-muted-soft tabular-nums">{eventTimeText(event)}</span>
        </div>
      ))}
    </div>
  </section>
);

export const CoupleView = ({
  events,
  labels,
}: {
  events: CalendarOccurrence[];
  labels: CalendarLabel[];
}) => {
  const colorOf = useMemo(() => labelColorResolver(labels), [labels]);

  const byOwner = useMemo(() => {
    const groups: Record<CalendarOwner, CalendarOccurrence[]> = {
      together: [],
      wonchan: [],
      yeeun: [],
    };
    for (const event of [...events].sort(compareOccurrences))
      groups[event.owner].push(event);
    return groups;
  }, [events]);

  return (
    <div className="space-y-3">
      <TogetherSection events={byOwner.together} colorOf={colorOf} />
      <div className="grid grid-cols-2 items-start gap-2 md:gap-3 [&>*]:min-w-0">
        <CoupleColumn owner="wonchan" events={byOwner.wonchan} colorOf={colorOf} />
        <CoupleColumn owner="yeeun" events={byOwner.yeeun} colorOf={colorOf} />
      </div>
    </div>
  );
};
