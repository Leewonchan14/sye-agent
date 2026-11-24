"use client";

import { ArrowDownUp, Search } from "lucide-react";

import { categoryChipClass } from "@/components/ledger/category-chips";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MAP_RATED_FILTERS,
  MAP_RATED_LABEL,
  MAP_SORT_LABEL,
  MAP_SORTS,
  type MapRatedFilter,
  type MapSort,
} from "@/lib/ledger/map-filter";
import { cn } from "@/lib/utils";

const SORT_ITEMS = MAP_SORTS.map((value) => ({ value, label: MAP_SORT_LABEL[value] }));

/** 데이트 지도 목록 위의 검색창, 리뷰 필터 칩, 정렬 */
export const PlaceListControls = ({
  query,
  onQueryChange,
  sort,
  onSortChange,
  rated,
  onRatedChange,
  className,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  sort: MapSort;
  onSortChange: (value: MapSort) => void;
  rated: MapRatedFilter;
  onRatedChange: (value: MapRatedFilter) => void;
  className?: string;
}) => (
  <div className={cn("flex flex-col gap-2", className)}>
    {/* 검색창 옆에 정렬을 둬, 리뷰 필터 칩이 좁은 목록 칸에서도 한 줄에 들어가게 한다. */}
    <div className="flex items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <Input
          type="search"
          aria-label="다녀온 곳 검색"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="가게, 업종, 주소, 리뷰로 검색"
          className="pl-9"
        />
      </div>
      <Select
        items={SORT_ITEMS}
        value={sort}
        onValueChange={(next) => next && onSortChange(next as MapSort)}
      >
        <SelectTrigger aria-label="정렬" className="shrink-0 gap-1 text-[13px]">
          <ArrowDownUp className="size-3.5 text-muted" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {SORT_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
    <div
      role="group"
      aria-label="리뷰 필터"
      className="flex flex-wrap items-center gap-1"
    >
      {MAP_RATED_FILTERS.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={rated === value}
          onClick={() => onRatedChange(value)}
          className={categoryChipClass(rated === value)}
        >
          {MAP_RATED_LABEL[value]}
        </button>
      ))}
    </div>
  </div>
);
