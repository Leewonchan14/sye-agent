import { eq } from "drizzle-orm";

import { ARTIFACT_ID_PATTERN } from "@/lib/artifacts/id";
import { readObjectRange, statObject } from "@/lib/artifacts/storage";
import { getDb, schema } from "@/lib/db/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RangeResult = { start: number; end: number } | "invalid" | null;

/** 단일 바이트 범위만 지원한다. 다중 범위/형식 오류는 416. */
const parseByteRange = (header: string | null, size: number): RangeResult => {
  if (!header) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return "invalid";

  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return "invalid";

  if (rawStart === "") {
    const suffix = Number(rawEnd);
    if (!Number.isSafeInteger(suffix) || suffix <= 0 || size === 0) return "invalid";
    return { start: Math.max(size - suffix, 0), end: size - 1 };
  }

  const start = Number(rawStart);
  const end = rawEnd === "" ? size - 1 : Number(rawEnd);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start > end ||
    start >= size
  ) {
    return "invalid";
  }

  return { start, end: Math.min(end, size - 1) };
};

export const GET = async (
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  if (!ARTIFACT_ID_PATTERN.test(id)) {
    return Response.json({ error: "찾을 수 없습니다." }, { status: 404 });
  }

  const rows = await getDb()
    .select({
      id: schema.artifacts.id,
      mime: schema.artifacts.mime,
      key: schema.artifacts.key,
    })
    .from(schema.artifacts)
    .where(eq(schema.artifacts.id, id))
    .limit(1);
  const artifact = rows[0];
  if (!artifact) {
    return Response.json({ error: "찾을 수 없습니다." }, { status: 404 });
  }

  const info = await statObject(artifact.key);
  if (!info) {
    return Response.json({ error: "찾을 수 없습니다." }, { status: 404 });
  }

  const headers = new Headers({
    "Content-Type": artifact.mime,
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: `"${artifact.id}"`,
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
  });
  if (artifact.mime === "text/html") {
    // 같은 오리진 스크립트 실행을 막는다 — sandbox 없는 raw HTML 은 앱 토큰을 읽을 수 있다.
    headers.set(
      "Content-Security-Policy",
      "sandbox; default-src 'none'; style-src 'unsafe-inline'"
    );
  }

  const range = parseByteRange(req.headers.get("range"), info.size);
  if (range === "invalid") {
    headers.set("Content-Range", `bytes */${info.size}`);
    return new Response(null, { status: 416, headers });
  }

  const { start, end } = range ?? { start: 0, end: info.size - 1 };
  const bytes = await readObjectRange(artifact.key, start, end);
  if (range) {
    headers.set(
      "Content-Range",
      `bytes ${start}-${start + bytes.byteLength - 1}/${info.size}`
    );
  }
  headers.set("Content-Length", String(bytes.byteLength));

  return new Response(bytes, { status: range ? 206 : 200, headers });
};
