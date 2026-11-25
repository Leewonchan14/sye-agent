"use client";

import { Check, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type CalendarFilter = {
  together: boolean;
  wonchan: boolean;
  yeeun: boolean;
};

const FILTER_ITEMS: { key: keyof CalendarFilter; label: string }[] = [
  { key: "together", label: "함께하는 일정" },
  { key: "wonchan", label: "원찬" },
  { key: "yeeun", label: "예은" },
];

export const FilterMenu = ({
  filter,
  onChange,
}: {
  filter: CalendarFilter;
  onChange: (filter: CalendarFilter) => void;
}) => {
  const activeCount = FILTER_ITEMS.filter((item) => filter[item.key]).length;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="filter-menu"
            className="gap-1.5"
          />
        }
      >
        <SlidersHorizontal />
        <span>필터</span>
        <span
          aria-hidden="true"
          className="grid size-4 place-items-center rounded-full bg-primary/10 text-[10px] font-medium text-primary tabular-nums"
        >
          {activeCount}
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-1.5">
        <p className="px-2 py-1.5 text-[11px] text-muted-soft">표시할 일정</p>
        {FILTER_ITEMS.map((item) => {
          const checked = filter[item.key];
          return (
            <button
              key={item.key}
              type="button"
              role="checkbox"
              aria-checked={checked}
              data-testid={`filter-${item.key}`}
              onClick={() => onChange({ ...filter, [item.key]: !checked })}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-body hover:bg-accent",
                checked && "font-medium text-ink"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-4 shrink-0 place-items-center rounded border transition-colors",
                  checked
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-hairline bg-surface"
                )}
              >
                {checked && <Check className="size-3" />}
              </span>
              {item.label}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
};
