import type { CalendarOwner, CalendarViewer } from "@/lib/calendar/types";

export const VIEWER_NAME: Record<CalendarViewer, string> = {
  wonchan: "원찬",
  yeeun: "예은",
};

/** 일정 주인을 viewer 기준으로 부르는 이름. */
export const ownerName = (owner: CalendarOwner, viewer: CalendarViewer): string => {
  if (owner === "together") return "함께";
  if (owner === viewer) return "나";
  return VIEWER_NAME[owner];
};

export const MOODS = [
  { key: "great", emoji: "😆", label: "최고" },
  { key: "happy", emoji: "😊", label: "좋아" },
  { key: "flutter", emoji: "🥰", label: "설렘" },
  { key: "soso", emoji: "😐", label: "보통" },
  { key: "tired", emoji: "😴", label: "피곤" },
  { key: "sad", emoji: "😢", label: "슬픔" },
  { key: "angry", emoji: "😠", label: "화남" },
  { key: "sick", emoji: "🤒", label: "아픔" },
] as const;

export const moodEmoji = (key: string): string =>
  MOODS.find((mood) => mood.key === key)?.emoji ?? "";
