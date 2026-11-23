import { z } from "zod";

import { requireAuth } from "@/lib/auth";
import { dateErrorResponse } from "@/lib/dates/api";
import { startDateSpotSearch } from "@/lib/dates/hermes";
import { countDigestSpots, ensureDigest } from "@/lib/db/dates";
import { listAreas } from "@/lib/db/places";
import { kst } from "@/lib/kst";
import { parseId, readJson } from "@/lib/monitor/api";
import { publicOrigin } from "@/lib/monitor/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ areaId: string }> };

/** 숙소 체크인은 오늘부터 180일 안 */
const MAX_CHECKIN_DAYS = 180;

const bodySchema = z
  .object({
    /** places: 가 볼 곳·즐길 거리 · stay: 숙소(NOL) */
    mode: z.enum(["places", "stay"]).default("places"),
    checkin: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "체크인 날짜는 YYYY-MM-DD여야 해요.")
      .optional(),
  })
  .superRefine((body, ctx) => {
    if (body.mode !== "stay") return;
    const checkin = body.checkin ? kst(body.checkin) : null;
    const today = kst().startOf("day");
    if (
      !checkin?.isValid() ||
      checkin.isBefore(today) ||
      checkin.isAfter(today.add(MAX_CHECKIN_DAYS, "day"))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["checkin"],
        message: `체크인 날짜를 오늘부터 ${MAX_CHECKIN_DAYS}일 안으로 골라 주세요.`,
      });
    }
  });

/**
 * 지역 수첩의 "이 동네 더 찾아 줘" — 오늘 조사에 이 지역 반경 안만 찾는 하치와레 작업을 붙인다.
 * body `{ mode: "stay", checkin }`이면 그 날짜 1박 기준으로 숙소를 NOL에서 찾는다.
 * 결과는 오늘 데이트 추천에도 쌓이고, 지역 수첩의 "하치와레 새 추천"에 보인다. 이미 찾는 중이면 409.
 */
export const POST = async (req: Request, ctx: Ctx) => {
  const authError = await requireAuth(req);
  if (authError) return authError;
  const areaId = parseId((await ctx.params).areaId);
  if (!areaId) {
    return Response.json({ error: "areaId가 올바르지 않아요." }, { status: 400 });
  }
  try {
    const body = bodySchema.parse((await readJson(req)) ?? {});
    const area = (await listAreas()).find((item) => item.id === areaId);
    if (!area) return Response.json({ error: "지역을 찾을 수 없어요." }, { status: 404 });
    const digest = await ensureDigest(kst().format("YYYY-MM-DD"));
    const extra = (await countDigestSpots(digest.id)) > 0;
    await startDateSpotSearch({
      origin: publicOrigin(req),
      digestId: digest.id,
      extra,
      area,
      stayCheckin: body.mode === "stay" ? body.checkin : null,
    });
    return Response.json({ ok: true }, { status: 202 });
  } catch (error) {
    return dateErrorResponse(error, "하치와레에게 요청하지 못했어요.");
  }
};
