import { hasArtifactToken } from "@/lib/artifacts/auth";
import { createArtifactId } from "@/lib/artifacts/id";
import {
  ARTIFACT_KINDS,
  MAX_ARTIFACT_BYTES,
  extensionMatchesMime,
  inferArtifactKind,
  isAllowedMime,
  isPosterMime,
  type ArtifactKind,
} from "@/lib/artifacts/mime";
import { putObject } from "@/lib/artifacts/storage";
import { requireAuth } from "@/lib/auth";
import { getDb, schema } from "@/lib/db/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CAPTION_CHARS = 200;
const MAX_SESSION_ID_CHARS = 200;

/** 정수 폼 필드 — 없으면 null, 잘못됐으면 "invalid". */
const parseOptionalInt = (
  value: FormDataEntryValue | null,
  max: number
): number | null | "invalid" => {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > max) return "invalid";
  return parsed;
};

export const POST = async (req: Request) => {
  const agentAuthed = hasArtifactToken(req);
  if (!agentAuthed) {
    const authError = await requireAuth(req);
    if (authError) return authError;
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json(
      { error: "multipart/form-data 가 필요합니다." },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "file 이 필요합니다." }, { status: 400 });
  }
  if (file.size > MAX_ARTIFACT_BYTES) {
    return Response.json({ error: "파일이 20MB 를 넘습니다." }, { status: 400 });
  }

  const mime = file.type.split(";")[0].trim().toLowerCase();
  if (!isAllowedMime(mime)) {
    return Response.json(
      { error: `허용되지 않는 형식입니다: ${mime || "(없음)"}` },
      { status: 400 }
    );
  }
  if (!extensionMatchesMime(file.name, mime)) {
    return Response.json({ error: "확장자와 MIME 이 맞지 않습니다." }, { status: 400 });
  }

  const kindField = form.get("kind");
  let kind: ArtifactKind;
  if (typeof kindField === "string" && kindField !== "") {
    if (!ARTIFACT_KINDS.some((candidate) => candidate === kindField)) {
      return Response.json({ error: "알 수 없는 kind 입니다." }, { status: 400 });
    }
    kind = kindField as ArtifactKind;
  } else {
    const inferred = inferArtifactKind(mime);
    if (!inferred) {
      return Response.json({ error: "kind 를 추론할 수 없습니다." }, { status: 400 });
    }
    kind = inferred;
  }

  const inferredKind = inferArtifactKind(mime);
  if (
    inferredKind &&
    kind !== inferredKind &&
    !(inferredKind === "svg" && kind === "image")
  ) {
    return Response.json({ error: "kind 와 MIME 이 맞지 않습니다." }, { status: 400 });
  }

  const width = parseOptionalInt(form.get("width"), 100_000);
  const height = parseOptionalInt(form.get("height"), 100_000);
  const durationMs = parseOptionalInt(form.get("durationMs"), 24 * 60 * 60 * 1000);
  if (width === "invalid" || height === "invalid" || durationMs === "invalid") {
    return Response.json(
      { error: "width/height/durationMs 가 잘못됐습니다." },
      { status: 400 }
    );
  }

  const captionField = form.get("caption");
  const caption =
    typeof captionField === "string" && captionField.trim()
      ? captionField.trim().slice(0, MAX_CAPTION_CHARS)
      : null;

  const sessionField = form.get("sessionId");
  const sessionId =
    typeof sessionField === "string" && sessionField.trim()
      ? sessionField.trim().slice(0, MAX_SESSION_ID_CHARS)
      : null;

  const poster = form.get("poster");
  let posterId: string | null = null;
  if (poster instanceof File && poster.size > 0) {
    if (poster.size > MAX_ARTIFACT_BYTES) {
      return Response.json({ error: "poster 가 20MB 를 넘습니다." }, { status: 400 });
    }
    const posterMime = poster.type.split(";")[0].trim().toLowerCase();
    if (!isAllowedMime(posterMime) || !isPosterMime(posterMime)) {
      return Response.json({ error: "poster 는 이미지여야 합니다." }, { status: 400 });
    }
    if (!extensionMatchesMime(poster.name, posterMime)) {
      return Response.json(
        { error: "poster 확장자와 MIME 이 맞지 않습니다." },
        { status: 400 }
      );
    }

    posterId = createArtifactId();
    try {
      const posterBytes = new Uint8Array(await poster.arrayBuffer());
      await putObject(posterId, posterBytes, posterMime);
      await getDb()
        .insert(schema.artifacts)
        .values({
          id: posterId,
          kind: inferArtifactKind(posterMime) ?? "image",
          mime: posterMime,
          bytes: posterBytes.byteLength,
          storage: "local",
          key: posterId,
          sessionId,
          source: agentAuthed ? "hachi" : "upload",
          meta: {},
        });
    } catch (error) {
      console.error("Failed to store artifact poster:", error);
      return Response.json({ error: "포스터를 저장하지 못했습니다." }, { status: 500 });
    }
  }

  try {
    const id = createArtifactId();
    const bytes = new Uint8Array(await file.arrayBuffer());
    await putObject(id, bytes, mime);

    await getDb()
      .insert(schema.artifacts)
      .values({
        id,
        kind,
        mime,
        bytes: bytes.byteLength,
        width,
        height,
        durationMs,
        posterId,
        storage: "local",
        key: id,
        caption,
        sessionId,
        source: agentAuthed ? "hachi" : "upload",
        meta: {},
      });

    return Response.json(
      {
        id,
        url: `/api/artifacts/${id}`,
        mediaType: mime,
        kind,
        width,
        height,
        durationMs,
        posterUrl: posterId ? `/api/artifacts/${posterId}` : null,
        bytes: bytes.byteLength,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to store artifact:", error);
    return Response.json({ error: "아티팩트를 저장하지 못했습니다." }, { status: 500 });
  }
};
