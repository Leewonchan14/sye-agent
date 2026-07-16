import { tool } from "ai";
import { z } from "zod/v4";

export const getCurrentTime = tool({
  description: "현재 시각을 알려줍니다.",
  inputSchema: z.object({}),
  execute: async () => {
    const now = new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "full",
      timeStyle: "medium",
    }).format(new Date());
    return { currentTime: now };
  },
});
