import { requireUser } from "@/lib/auth";
import { searchSessions } from "@/lib/db/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = async (req: Request) => {
  const user = await requireUser(req);
  if (user instanceof Response) return user;

  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? "";
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const limit = Number(url.searchParams.get("limit")) || 20;

    const { results, nextCursor } = await searchSessions(user.id, q, {
      cursor,
      limit,
    });
    return Response.json({ results, nextCursor });
  } catch (error) {
    console.error("Failed to search sessions:", error);
    return Response.json({ results: [], nextCursor: null });
  }
};
