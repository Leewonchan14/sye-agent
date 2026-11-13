import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";

import { fetchInstagramPhotos } from "@/lib/dates/photo";
import {
  type AgentDigestInput,
  DATE_REACTIONS,
  DATE_SPOT_KINDS,
  type DateDaySummary,
  type DateDigestView,
  type DateReaction,
  type DateSettings,
  type DateSpotKind,
  type DateSpotView,
  DEFAULT_DATE_SETTINGS,
} from "@/lib/dates/types";
import { getDb, schema } from "@/lib/db/db";
import { kst } from "@/lib/kst";

const {
  dateSpotSettings: settingsT,
  dateSpotDigests: digestsT,
  dateSpots: spotsT,
} = schema;

const SETTINGS_ID = 1;
/** 콜백 토큰 유효 시간 — 조사가 오래 걸려도 넉넉히 덮는다. */
const CALLBACK_TOKEN_TTL_MS = 3 * 60 * 60 * 1000;

/** 사용자에게 그대로 보여 줄 수 있는 오류 */
export class DateSpotError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}

/* ───────── 설정 ───────── */

export const getDateSettings = async (): Promise<DateSettings> => {
  const [row] = await getDb()
    .select()
    .from(settingsT)
    .where(eq(settingsT.id, SETTINGS_ID))
    .limit(1);
  if (!row) return DEFAULT_DATE_SETTINGS;
  return {
    enabled: row.enabled,
    collectTime: row.collectTime,
    count: row.count,
    areas: row.areas,
    themes: row.themes,
    memo: row.memo,
  };
};

export const saveDateSettings = async (settings: DateSettings) => {
  const values = { ...settings, updatedAt: new Date() };
  await getDb()
    .insert(settingsT)
    .values({ id: SETTINGS_ID, ...values })
    .onConflictDoUpdate({ target: settingsT.id, set: values });
};

/* ───────── 하루치 조사 ───────── */

type DigestRow = typeof digestsT.$inferSelect;
type SpotRow = typeof spotsT.$inferSelect;

export const getDigestRow = async (id: number): Promise<DigestRow | null> => {
  const [row] = await getDb().select().from(digestsT).where(eq(digestsT.id, id)).limit(1);
  return row ?? null;
};

export const getDigestByDay = async (dayKey: string): Promise<DigestRow | null> => {
  const [row] = await getDb()
    .select()
    .from(digestsT)
    .where(eq(digestsT.dayKey, dayKey))
    .limit(1);
  return row ?? null;
};

export const ensureDigest = async (dayKey: string): Promise<DigestRow> => {
  await getDb().insert(digestsT).values({ dayKey }).onConflictDoNothing();
  const row = await getDigestByDay(dayKey);
  if (!row) throw new Error("오늘 조사 기록을 만들지 못했어요.");
  return row;
};

/**
 * 하치와레에게 넘기기 전에 "찾는 중"을 먼저 차지한다. 이미 찾는 중이면 null.
 * 결과가 아주 빨리 와도 대기 상태가 먼저 기록되어 있도록 시작 전에 부른다.
 */
export const claimDigestPending = async (
  digestId: number,
  tokenHash: string
): Promise<boolean> => {
  const rows = await getDb()
    .update(digestsT)
    .set({
      pendingHermesRunId: "starting",
      pendingSince: new Date(),
      callbackTokenHash: tokenHash,
      callbackTokenExpiresAt: new Date(Date.now() + CALLBACK_TOKEN_TTL_MS),
      lastError: null,
    })
    .where(and(eq(digestsT.id, digestId), isNull(digestsT.pendingHermesRunId)))
    .returning();
  return rows.length > 0;
};

export const setDigestHermesRun = async (digestId: number, hermesRunId: string) => {
  await getDb()
    .update(digestsT)
    .set({ pendingHermesRunId: hermesRunId })
    .where(eq(digestsT.id, digestId));
};

/** 찾는 중 상태를 푼다. error가 있으면 화면과 재시도 판단에 남긴다. */
export const releaseDigestPending = async (digestId: number, error: string | null) => {
  await getDb()
    .update(digestsT)
    .set({
      pendingHermesRunId: null,
      pendingSince: null,
      callbackTokenHash: null,
      callbackTokenExpiresAt: null,
      lastError: error,
    })
    .where(eq(digestsT.id, digestId));
};

/** 오늘 자동 조사를 한 번만 시작하도록 차지한다. */
export const advanceDigestAutoState = async (
  digestId: number,
  from: string | null,
  to: string | null
): Promise<boolean> => {
  const rows = await getDb()
    .update(digestsT)
    .set({ autoState: to })
    .where(
      and(
        eq(digestsT.id, digestId),
        from === null ? isNull(digestsT.autoState) : eq(digestsT.autoState, from)
      )
    )
    .returning();
  return rows.length > 0;
};

export const listActiveAutoDigests = async (): Promise<DigestRow[]> =>
  getDb()
    .select()
    .from(digestsT)
    .where(inArray(digestsT.autoState, ["running", "retried"]));

export const countDigestSpots = async (digestId: number, since?: Date | null) => {
  const [row] = await getDb()
    .select({ n: count() })
    .from(spotsT)
    .where(
      and(eq(spotsT.digestId, digestId), since ? gte(spotsT.createdAt, since) : undefined)
    );
  return row?.n ?? 0;
};

/* ───────── 하치와레 결과 저장 ───────── */

const parsePostedAt = (value: string | null) => {
  if (!value) return null;
  const at = kst(value);
  return at.isValid() ? at.toDate() : null;
};

export const ingestDigest = async (input: AgentDigestInput) => {
  const db = getDb();
  const digest = await getDigestRow(input.digestId);
  if (!digest) throw new DateSpotError("조사 기록을 찾을 수 없어요.", 404);

  const rows = input.spots.map((spot) => ({
    digestId: digest.id,
    kind: spot.kind,
    name: spot.name,
    area: spot.area,
    category: spot.category,
    summary: spot.summary,
    reason: spot.reason,
    instagramUrl: spot.instagramUrl,
    instagramAuthor: spot.instagramAuthor,
    sourceUrl: spot.sourceUrl,
    period: spot.period,
    postedAt: parsePostedAt(spot.postedAt),
    address: spot.address,
    priceHint: spot.priceHint,
    tags: [...new Set(spot.tags)],
  }));
  const inserted = rows.length
    ? await db
        .insert(spotsT)
        .values(rows)
        // 같은 인스타그램 게시물이나 같은 소개 페이지면 건너뛴다.
        .onConflictDoNothing()
        .returning()
    : [];

  if (input.note) {
    await db.update(digestsT).set({ note: input.note }).where(eq(digestsT.id, digest.id));
  }
  if (input.final !== false) await releaseDigestPending(digest.id, null);

  return {
    digestId: digest.id,
    inserted: inserted.length,
    skipped: rows.length - inserted.length,
    insertedIds: inserted.map((row) => row.id),
  };
};

export const getDigestToken = async (digestId: number) => {
  const [row] = await getDb()
    .select({
      hash: digestsT.callbackTokenHash,
      expiresAt: digestsT.callbackTokenExpiresAt,
    })
    .from(digestsT)
    .where(eq(digestsT.id, digestId))
    .limit(1);
  return row ?? null;
};

/* ───────── 화면 ───────── */

const toSpotView = (row: SpotRow, dayKey: string): DateSpotView => ({
  id: row.id,
  dayKey,
  kind: (DATE_SPOT_KINDS as readonly string[]).includes(row.kind)
    ? (row.kind as DateSpotKind)
    : "place",
  name: row.name,
  area: row.area,
  category: row.category,
  summary: row.summary,
  reason: row.reason,
  instagramUrl: row.instagramUrl,
  instagramAuthor: row.instagramAuthor,
  sourceUrl: row.sourceUrl,
  period: row.period,
  postedAt: row.postedAt?.toISOString() ?? null,
  address: row.address,
  priceHint: row.priceHint,
  tags: row.tags,
  photos:
    row.photoExpiresAt && row.photoExpiresAt.valueOf() > Date.now() ? row.photoUrls : [],
  reaction: (DATE_REACTIONS as readonly string[]).includes(row.reaction ?? "")
    ? (row.reaction as DateReaction)
    : null,
});

export const getDigestView = async (digest: DigestRow): Promise<DateDigestView> => {
  const spots = await getDb()
    .select()
    .from(spotsT)
    .where(eq(spotsT.digestId, digest.id))
    .orderBy(spotsT.id);
  return {
    id: digest.id,
    dayKey: digest.dayKey,
    note: digest.note,
    pending: Boolean(digest.pendingHermesRunId),
    lastError: digest.lastError,
    spots: spots.map((s) => toSpotView(s, digest.dayKey)),
  };
};

export const listDigestDays = async (limit = 60): Promise<DateDaySummary[]> => {
  const rows = await getDb()
    .select({ dayKey: digestsT.dayKey, count: count(spotsT.id) })
    .from(digestsT)
    .leftJoin(spotsT, eq(spotsT.digestId, digestsT.id))
    .groupBy(digestsT.id)
    .orderBy(desc(digestsT.dayKey))
    .limit(limit);
  return rows.map((r) => ({ dayKey: r.dayKey, count: Number(r.count) }));
};

export const listSpotsByReaction = async (
  reaction: DateReaction,
  limit = 100
): Promise<DateSpotView[]> => {
  const rows = await getDb()
    .select({ spot: spotsT, dayKey: digestsT.dayKey })
    .from(spotsT)
    .innerJoin(digestsT, eq(digestsT.id, spotsT.digestId))
    .where(eq(spotsT.reaction, reaction))
    .orderBy(desc(spotsT.id))
    .limit(limit);
  return rows.map((r) => toSpotView(r.spot, r.dayKey));
};

export const setSpotReaction = async (spotId: number, reaction: DateReaction | null) => {
  const rows = await getDb()
    .update(spotsT)
    .set({ reaction })
    .where(eq(spotsT.id, spotId))
    .returning();
  if (!rows.length) throw new DateSpotError("장소를 찾을 수 없어요.", 404);
};

/** 하치와레 프롬프트용 — 이미 추천한 곳과 취향 힌트 */
export const getRecommendationHistory = async (days = 120) => {
  const since = kst().subtract(days, "day").toDate();
  const rows = await getDb()
    .select({
      name: spotsT.name,
      area: spotsT.area,
      kind: spotsT.kind,
      reaction: spotsT.reaction,
    })
    .from(spotsT)
    .where(gte(spotsT.createdAt, since))
    .orderBy(desc(spotsT.id))
    .limit(300);
  const label = (r: { name: string; area: string; kind: string }) =>
    `${r.kind === "content" ? "[즐길거리] " : ""}${r.area ? `${r.name}(${r.area})` : r.name}`;
  return {
    recommended: rows.map(label),
    liked: rows
      .filter((r) => r.reaction === "like" || r.reaction === "visited")
      .map(label),
    passed: rows.filter((r) => r.reaction === "pass").map(label),
  };
};

/** 돌고 있는 조사가 하나라도 있는지 — 화면 폴링 간격용 */
export const hasPendingDigest = async () => {
  const [row] = await getDb()
    .select({ id: digestsT.id })
    .from(digestsT)
    .where(isNotNull(digestsT.pendingHermesRunId))
    .limit(1);
  return Boolean(row);
};

/* ───────── 게시물 사진 ───────── */

/** 만료가 이만큼 남으면 미리 새 주소로 바꾼다. */
const PHOTO_REFRESH_BEFORE_MS = 12 * 60 * 60 * 1000;
/** 사진을 못 읽은 게시물은 이 간격이 지나야 다시 찾아본다. */
const PHOTO_RETRY_MS = 6 * 60 * 60 * 1000;
/** 화면 한 번 불러올 때 새로 읽는 최대 수 — 응답이 늦어지지 않게 한다. */
const PHOTO_BATCH = 12;

/**
 * 사진이 없거나 만료가 가까운 장소의 사진 주소를 공식 임베드에서 다시 읽는다.
 * `spotIds`를 주면 그 장소만, 아니면 고른 날(`digestId`)의 장소와 찜한 곳 중에서 고른다.
 */
export const refreshSpotPhotos = async (target: {
  spotIds?: number[];
  digestId?: number | null;
}) => {
  const db = getDb();
  const now = Date.now();
  const scope = target.spotIds
    ? inArray(spotsT.id, target.spotIds.length ? target.spotIds : [-1])
    : or(
        target.digestId ? eq(spotsT.digestId, target.digestId) : undefined,
        eq(spotsT.reaction, "like")
      );
  const retryBefore = new Date(now - PHOTO_RETRY_MS);
  const hasNoPhotos = sql`cardinality(${spotsT.photoUrls}) = 0`;
  const stale = await db
    .select({ id: spotsT.id, instagramUrl: spotsT.instagramUrl })
    .from(spotsT)
    .where(
      and(
        scope,
        // 인스타그램 근거가 없는 즐길거리는 읽을 사진이 없다.
        isNotNull(spotsT.instagramUrl),
        or(
          // 한 번도 안 찾아봤거나, 못 찾은 지 오래됐거나
          and(
            hasNoPhotos,
            or(isNull(spotsT.photoCheckedAt), lt(spotsT.photoCheckedAt, retryBefore))
          ),
          // 주소 만료가 가까운데 최근에 다시 찾아보지 않았거나
          and(
            sql`not ${hasNoPhotos}`,
            lt(spotsT.photoExpiresAt, new Date(now + PHOTO_REFRESH_BEFORE_MS)),
            or(
              isNull(spotsT.photoCheckedAt),
              lt(spotsT.photoCheckedAt, new Date(now - 60 * 60 * 1000))
            )
          )
        )
      )
    )
    .orderBy(desc(spotsT.id))
    .limit(PHOTO_BATCH);

  await Promise.all(
    stale.map(async (spot) => {
      if (!spot.instagramUrl) return;
      const photos = await fetchInstagramPhotos(spot.instagramUrl);
      await db
        .update(spotsT)
        .set({
          photoCheckedAt: new Date(),
          // 못 읽었을 때 아직 쓸 수 있는 예전 주소는 그대로 둔다(만료되면 화면에서 감춘다).
          ...(photos ? { photoUrls: photos.urls, photoExpiresAt: photos.expiresAt } : {}),
        })
        .where(eq(spotsT.id, spot.id));
    })
  );
  return stale.length;
};
