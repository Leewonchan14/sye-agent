"use client";

import { Pause, Play, Snowflake, TreePine } from "lucide-react";

import { useState, useSyncExternalStore } from "react";

import { AsciiChristmasTree } from "@/components/christmas/ascii-christmas-tree";
import { SidebarLayout } from "@/components/sidebar-layout";
import { Button } from "@/components/ui/button";
import { kst } from "@/lib/kst";

/** 오늘(KST)부터 다가오는 크리스마스까지 남은 날. 크리스마스 당일은 0 */
export const daysUntilChristmas = (today = kst()) => {
  const start = today.startOf("day");
  const thisYear = kst(`${start.year()}-12-25`);
  const target = start.isAfter(thisYear) ? kst(`${start.year() + 1}-12-25`) : thisYear;
  return target.diff(start, "day");
};

const ddayText = (days: number) =>
  days === 0 ? "메리 크리스마스! 오늘이에요" : `크리스마스까지 D-${days}`;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

const subscribeReducedMotion = (onChange: () => void) => {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

/** 움직임 줄이기 설정이면 처음엔 멈춘 트리를 보여준다 */
const useReducedMotion = () =>
  useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false
  );

export const ChristmasPage = () => {
  const reducedMotion = useReducedMotion();
  const [userPlaying, setUserPlaying] = useState<boolean | null>(null);
  const playing = userPlaying ?? !reducedMotion;
  const [snowing, setSnowing] = useState(true);
  const days = daysUntilChristmas();

  return (
    <SidebarLayout activeNav="christmas">
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 py-5 md:px-8 md:py-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="flex items-center gap-2 text-xl font-semibold text-ink">
              <TreePine className="size-5 text-primary" />
              크리스마스 트리
            </h1>
            <p className="text-[13px] text-muted">{ddayText(days)}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              aria-pressed={snowing}
              onClick={() => setSnowing((v) => !v)}
            >
              <Snowflake />
              {snowing ? "눈 그치기" : "눈 내리기"}
            </Button>
            <Button variant="outline" onClick={() => setUserPlaying(!playing)}>
              {playing ? <Pause /> : <Play />}
              {playing ? "멈추기" : "돌리기"}
            </Button>
          </div>
        </header>

        <AsciiChristmasTree
          playing={playing}
          snowing={snowing}
          className="h-[min(72dvh,680px)] min-h-[420px] w-full overflow-hidden rounded-2xl bg-[#1c1517]"
        />
      </main>
    </SidebarLayout>
  );
};
