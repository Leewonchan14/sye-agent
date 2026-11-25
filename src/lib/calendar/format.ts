import type { CalendarOwner, CalendarViewer } from "@/lib/calendar/types";

export const VIEWER_NAME: Record<CalendarViewer, string> = {
  wonchan: "원찬",
  yeeun: "예은",
};

/** 일정 참여자를 그대로 부르는 이름. */
export const ownerName = (owner: CalendarOwner): string =>
  owner === "together" ? "둘 다" : VIEWER_NAME[owner];
