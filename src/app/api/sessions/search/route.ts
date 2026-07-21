import { requireAuth } from "@/lib/auth";
import { searchSessions } from "@/lib/db/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? "";
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const limit = Number(url.searchParams.get("limit")) || 20;

    const { results, nextCursor } = await searchSessions(q, {
      cursor,
      limit,
    });
    return Response.json({ results, nextCursor });
  } catch (error) {
    console.error("Failed to search sessions:", error);
    return Response.json({ results: [], nextCursor: null });
  }
};
