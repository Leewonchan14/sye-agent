import { eq } from "drizzle-orm";

import { ARTIFACT_ID_PATTERN } from "@/lib/artifacts/id";
import { getDb, schema } from "@/lib/db/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = async (
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  if (!ARTIFACT_ID_PATTERN.test(id)) {
    return Response.json({ error: "찾을 수 없습니다." }, { status: 404 });
  }

  const rows = await getDb()
    .select({
      id: schema.artifacts.id,
      kind: schema.artifacts.kind,
      mime: schema.artifacts.mime,
      width: schema.artifacts.width,
      height: schema.artifacts.height,
      durationMs: schema.artifacts.durationMs,
      posterId: schema.artifacts.posterId,
      caption: schema.artifacts.caption,
      bytes: schema.artifacts.bytes,
    })
    .from(schema.artifacts)
    .where(eq(schema.artifacts.id, id))
    .limit(1);

  const artifact = rows[0];
  if (!artifact) {
    return Response.json({ error: "찾을 수 없습니다." }, { status: 404 });
  }

  return Response.json({
    id: artifact.id,
    kind: artifact.kind,
    mime: artifact.mime,
    width: artifact.width,
    height: artifact.height,
    durationMs: artifact.durationMs,
    posterUrl: artifact.posterId ? `/api/artifacts/${artifact.posterId}` : null,
    caption: artifact.caption,
    bytes: artifact.bytes,
  });
};
