"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useAuthStore } from "@/lib/auth-store";
import { calendarKeys, calendarRequest } from "@/lib/calendar/client";
import { ownerName } from "@/lib/calendar/format";
import { labelColor } from "@/lib/calendar/labels";
import type { CalendarEvent, CalendarLabel, CalendarViewer } from "@/lib/calendar/types";
import { kst } from "@/lib/kst";

type SearchScope = "all" | "wonchan" | "yeeun" | "together";

const SCOPE_OPTIONS: { value: SearchScope; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "wonchan", label: "원찬" },
  { value: "yeeun", label: "예은" },
  { value: "together", label: "함께" },
];

const useDebouncedValue = (value: string, delay: number): string => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
};

export const SearchPanel = ({
  open,
  onOpenChange,
  viewer,
  labels,
  onSelectDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewer: CalendarViewer;
  labels: CalendarLabel[];
  onSelectDate: (date: string) => void;
}) => {
  const token = useAuthStore((s) => s.token);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  const debounced = useDebouncedValue(query, 250);

  const { data, isPending, isFetching } = useQuery({
    queryKey: calendarKeys.search(debounced, scope),
    queryFn: () =>
      calendarRequest<{ results: { event: CalendarEvent; nextDate: string | null }[] }>(
        token,
        `/api/calendar/search?q=${encodeURIComponent(debounced)}&scope=${scope}`
      ),
    enabled: Boolean(token) && debounced.trim().length >= 2,
  });

  const labelById = (labelId: number | null): string => {
    if (labelId == null) return "var(--color-primary)";
    const label = labels.find((item) => item.id === labelId);
    return label ? labelColor(label.color) : "var(--color-primary)";
  };

  const results = data?.results ?? [];
  const hasQuery = debounced.trim().length >= 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="search-panel" className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>일정 검색</DialogTitle>
          <DialogDescription>제목·메모·위치로 찾아요</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Input
            autoFocus
            data-testid="search-input"
            placeholder="일정 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Select
            items={SCOPE_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            value={scope}
            onValueChange={(value) => {
              if (value) setScope(value as SearchScope);
            }}
          >
            <SelectTrigger aria-label="검색 범위" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCOPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          {!hasQuery ? (
            <p className="py-6 text-center text-[12px] text-muted">
              두 글자 이상 입력해 주세요
            </p>
          ) : isPending || isFetching ? (
            <div className="grid place-items-center py-6">
              <Spinner className="text-primary" />
            </div>
          ) : results.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-muted">검색 결과가 없어요.</p>
          ) : (
            <div className="divide-y divide-hairline-soft">
              {results.map((result) => {
                const date =
                  result.nextDate ?? kst(result.event.startAt).format("YYYY-MM-DD");
                const time = result.event.allDay
                  ? null
                  : kst(result.event.startAt).format("HH:mm");
                return (
                  <button
                    key={result.event.id}
                    type="button"
                    data-testid={`search-result-${result.event.id}`}
                    onClick={() => {
                      onSelectDate(date);
                      onOpenChange(false);
                    }}
                    className="flex w-full items-center gap-2 px-1 py-2 text-left transition-colors hover:bg-canvas-soft/60"
                  >
                    <span
                      aria-hidden="true"
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ background: labelById(result.event.labelId) }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-ink">
                        {result.event.title}
                      </p>
                      <p className="truncate text-[11px] text-muted-soft tabular-nums">
                        {kst(date).format("YYYY.MM.DD")} ·{" "}
                        {ownerName(result.event.owner, viewer)}
                        {time && ` · ${time}`}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
