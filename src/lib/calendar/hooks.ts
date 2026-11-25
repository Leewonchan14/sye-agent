"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { useAuthStore } from "@/lib/auth-store";
import { calendarKeys, calendarRequest } from "@/lib/calendar/client";
import type { CalendarSettings } from "@/lib/calendar/types";

/**
 * 캘린더 설정. 캘린더·설정 다이얼로그·일기 페이지가 같은 캐시(`CalendarSettings` 모양)를 쓴다.
 */
export const useCalendarSettings = ({ enabled = true }: { enabled?: boolean } = {}) => {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: calendarKeys.settings,
    queryFn: async () => {
      const res = await calendarRequest<{ settings: CalendarSettings }>(
        token,
        "/api/calendar/settings"
      );
      return res.settings;
    },
    enabled: enabled && Boolean(token),
  });
};

/** 캘린더 쿼리 전체를 다시 불러온다. 일정·일기·라벨이 바뀌면 여러 뷰가 함께 바뀐다. */
export const useInvalidateCalendar = () => {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: calendarKeys.all }),
    [queryClient]
  );
};
