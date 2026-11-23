import { PlaceError } from "@/lib/db/places";
import { monitorErrorResponse } from "@/lib/monitor/api";

export const placeErrorResponse = (error: unknown, fallback: string): Response => {
  if (error instanceof PlaceError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return monitorErrorResponse(error, fallback);
};
