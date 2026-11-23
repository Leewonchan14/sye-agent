import { randomInt } from "node:crypto";

import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/db";
import {
  type CreatePickInput,
  createPickSchema,
  MAX_PICK_REROLLS,
  type PickBoard,
  type PickBoardPatch,
  pickBoardPatchSchema,
  type PickStatus,
  type PickView,
} from "@/lib/picks/types";

const { picks: picksT, pickOptions: optionsT, pickDraft: draftT } = schema;

/** 둘이 같이 보는 한 장짜리 화면 상태 */
const BOARD_ID = 1;

/** 기록 목록에 보여 줄 최근 뽑기 수 */
const HISTORY_LIMIT = 30;

/** 사용자에게 그대로 보여 줄 수 있는 오류 */
export class PickError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}

type PickRow = typeof picksT.$inferSelect;
type OptionRow = typeof optionsT.$inferSelect;

/** 후보 중 하나를 고르게 무작위로 뽑는다. Math.random 대신 암호학적 난수를 쓴다. */
const drawOne = <T>(items: T[]): T => items[randomInt(items.length)];

const toView = (pick: PickRow, options: OptionRow[]): PickView => ({
  id: pick.id,
  title: pick.title,
  options: options.map((o) => ({ id: o.id, label: o.label })),
  resultOptionId: pick.resultOptionId ?? options[0]?.id ?? 0,
  rerollsLeft: Math.max(0, MAX_PICK_REROLLS - pick.rerollsUsed),
  status: pick.status as PickStatus,
  createdAt: pick.createdAt.toISOString(),
  decidedAt: pick.decidedAt?.toISOString() ?? null,
});

const loadOptions = async (pickIds: number[]) => {
  if (pickIds.length === 0) return new Map<number, OptionRow[]>();
  const rows = await getDb()
    .select()
    .from(optionsT)
    .where(inArray(optionsT.pickId, pickIds))
    .orderBy(asc(optionsT.sortOrder), asc(optionsT.id));
  const byPick = new Map<number, OptionRow[]>();
  for (const row of rows) {
    byPick.set(row.pickId, [...(byPick.get(row.pickId) ?? []), row]);
  }
  return byPick;
};

const findPick = async (pickId: number) => {
  const [pick] = await getDb()
    .select()
    .from(picksT)
    .where(eq(picksT.id, pickId))
    .limit(1);
  if (!pick) throw new PickError("뽑기를 찾지 못했어요.", 404);
  return pick;
};

export const getPick = async (pickId: number): Promise<PickView> => {
  const pick = await findPick(pickId);
  const options = await loadOptions([pick.id]);
  return toView(pick, options.get(pick.id) ?? []);
};

export const listPicks = async (): Promise<PickView[]> => {
  const rows = await getDb()
    .select()
    .from(picksT)
    .orderBy(desc(picksT.createdAt), desc(picksT.id))
    .limit(HISTORY_LIMIT);
  const options = await loadOptions(rows.map((r) => r.id));
  return rows.map((r) => toView(r, options.get(r.id) ?? []));
};

/** 후보를 저장하고 서버에서 하나를 뽑는다. */
export const createPick = async (input: CreatePickInput): Promise<PickView> => {
  const { title, options: labels } = createPickSchema.parse(input);
  const db = getDb();
  const [pick] = await db.insert(picksT).values({ title }).returning();
  const options = await db
    .insert(optionsT)
    .values(labels.map((label, i) => ({ pickId: pick.id, label, sortOrder: i })))
    .returning();
  const result = drawOne(options);
  const [updated] = await db
    .update(picksT)
    .set({ resultOptionId: result.id })
    .where(eq(picksT.id, pick.id))
    .returning();
  // 뽑은 결과를 둘이 같이 보는 화면에 띄운다.
  await saveBoard({ activePickId: pick.id });
  return toView(updated, options);
};

/** 지금 결과를 빼고 남은 후보에서 다시 뽑는다. 결정했거나 이미 다시 돌렸으면 안 된다. */
export const rerollPick = async (pickId: number): Promise<PickView> => {
  const pick = await findPick(pickId);
  if (pick.status === "decided") throw new PickError("이미 결정한 뽑기예요.", 409);
  if (pick.rerollsUsed >= MAX_PICK_REROLLS) {
    throw new PickError("다시 돌리기는 한 번만 할 수 있어요.", 409);
  }
  const options = (await loadOptions([pick.id])).get(pick.id) ?? [];
  const rest = options.filter((o) => o.id !== pick.resultOptionId);
  if (rest.length === 0) throw new PickError("다시 뽑을 후보가 없어요.", 409);
  const result = drawOne(rest);
  // 두 폰에서 동시에 눌러도 한 번만 바뀌도록 횟수 조건을 걸고 바꾼다.
  const [updated] = await getDb()
    .update(picksT)
    .set({ resultOptionId: result.id, rerollsUsed: pick.rerollsUsed + 1 })
    .where(
      and(
        eq(picksT.id, pick.id),
        eq(picksT.status, "drawn"),
        lt(picksT.rerollsUsed, MAX_PICK_REROLLS)
      )
    )
    .returning();
  if (!updated) throw new PickError("다시 돌리기는 한 번만 할 수 있어요.", 409);
  return toView(updated, options);
};

export const decidePick = async (pickId: number): Promise<PickView> => {
  const pick = await findPick(pickId);
  if (pick.status !== "decided") {
    await getDb()
      .update(picksT)
      .set({ status: "decided", decidedAt: new Date() })
      .where(eq(picksT.id, pick.id));
  }
  return getPick(pick.id);
};

type BoardValues = Partial<
  Pick<typeof draftT.$inferInsert, "title" | "labels" | "activePickId">
>;

const saveBoard = async (patch: BoardValues) => {
  const values = { ...patch, updatedAt: new Date() };
  await getDb()
    .insert(draftT)
    .values({ id: BOARD_ID, ...values })
    .onConflictDoUpdate({ target: draftT.id, set: values });
};

/** 둘이 같이 보는 골라 줘 화면 — 적고 있는 후보와, 띄워 둔 뽑기 결과 */
export const getPickBoard = async (): Promise<PickBoard> => {
  const [row] = await getDb()
    .select()
    .from(draftT)
    .where(eq(draftT.id, BOARD_ID))
    .limit(1);
  const activePick = row?.activePickId
    ? await getPick(row.activePickId).catch(() => null)
    : null;
  return { title: row?.title ?? "", labels: row?.labels ?? [], activePick };
};

/** 보낸 값만 바꾼다. 띄울 뽑기가 없으면 404. */
export const updatePickBoard = async (input: PickBoardPatch): Promise<PickBoard> => {
  const { title, labels, activePickId } = pickBoardPatchSchema.parse(input);
  if (activePickId) await findPick(activePickId);
  const patch: BoardValues = {};
  if (title !== undefined) patch.title = title;
  if (labels !== undefined) patch.labels = labels;
  if (activePickId !== undefined) patch.activePickId = activePickId;
  await saveBoard(patch);
  return getPickBoard();
};

export const deletePick = async (pickId: number) => {
  const [deleted] = await getDb().delete(picksT).where(eq(picksT.id, pickId)).returning();
  if (!deleted) throw new PickError("뽑기를 찾지 못했어요.", 404);
};
