import { PickError } from "@/lib/db/picks";
import { monitorErrorResponse } from "@/lib/monitor/api";

export const pickErrorResponse = (error: unknown, fallback: string): Response => {
  if (error instanceof PickError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return monitorErrorResponse(error, fallback);
};
