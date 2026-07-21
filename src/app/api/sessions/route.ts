import { requireAuth } from "@/lib/auth";
import { listSessionsPaginated } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  try {
    const url = new URL(req.url);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const limit = Number(url.searchParams.get("limit")) || 20;

    const result = await listSessionsPaginated({ cursor, limit });
    return Response.json(result);
  } catch (error) {
    console.error("Failed to fetch sessions:", error);
    return Response.json({ sessions: [], nextCursor: null });
  }
};
