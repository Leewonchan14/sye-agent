import { requireAuth } from "@/lib/auth";
import { searchSessions } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? "";
    const limit = Number(url.searchParams.get("limit")) || 20;

    const results = await searchSessions(q, limit);
    return Response.json({ results });
  } catch (error) {
    console.error("Failed to search sessions:", error);
    return Response.json({ results: [] });
  }
};
