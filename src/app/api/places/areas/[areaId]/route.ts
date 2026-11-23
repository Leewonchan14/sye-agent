import { requireAuth } from "@/lib/auth";
import { deleteArea, updateAreaRadius } from "@/lib/db/places";
import { parseId, readJson } from "@/lib/monitor/api";
import { placeErrorResponse } from "@/lib/places/api";
import { updateAreaSchema } from "@/lib/places/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ areaId: string }> };

const badId = () =>
  Response.json({ error: "areaId가 올바르지 않아요." }, { status: 400 });

/** 반경 바꾸기: { radiusM } */
export const PATCH = async (req: Request, ctx: Ctx) => {
  const authError = await requireAuth(req);
  if (authError) return authError;
  const areaId = parseId((await ctx.params).areaId);
  if (!areaId) return badId();
  try {
    const { radiusM } = updateAreaSchema.parse((await readJson(req)) ?? {});
    return Response.json(await updateAreaRadius(areaId, radiusM));
  } catch (error) {
    return placeErrorResponse(error, "반경을 바꾸지 못했어요.");
  }
};

export const DELETE = async (req: Request, ctx: Ctx) => {
  const authError = await requireAuth(req);
  if (authError) return authError;
  const areaId = parseId((await ctx.params).areaId);
  if (!areaId) return badId();
  try {
    await deleteArea(areaId);
    return Response.json({ ok: true });
  } catch (error) {
    return placeErrorResponse(error, "지역을 지우지 못했어요.");
  }
};
