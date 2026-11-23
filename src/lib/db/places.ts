import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/db";
import { activeEntry } from "@/lib/db/ledger";
import {
  type AreaView,
  type CreateAreaInput,
  createAreaSchema,
  type CreateReviewInput,
  createReviewSchema,
  inferPlaceKind,
  type PlaceKind,
  type PlaceRatingSummary,
  type PlaceReview,
  type ReviewAuthor,
  summarizeRatings,
  toPlaceKey,
  type UpdateReviewInput,
  updateReviewSchema,
} from "@/lib/places/types";

const { placeReviews: reviewsT, ledgerEntries: entriesT } = schema;

/** 사용자에게 그대로 보여 줄 수 있는 오류 */
export class PlaceError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}

/* ───────── 리뷰 ───────── */

const reviewColumns = {
  id: reviewsT.id,
  entryId: reviewsT.entryId,
  entryDate: entriesT.entryDate,
  author: reviewsT.author,
  rating: reviewsT.rating,
  review: reviewsT.review,
  createdAt: reviewsT.createdAt,
  mapPlaceId: entriesT.mapPlaceId,
  mapUrl: entriesT.mapUrl,
};

type ReviewRow = {
  id: number;
  entryId: number;
  entryDate: string;
  author: string;
  rating: number;
  review: string;
  createdAt: Date;
  mapPlaceId: string;
  mapUrl: string;
};

const toReview = (row: ReviewRow): PlaceReview => ({
  id: row.id,
  entryId: row.entryId,
  entryDate: row.entryDate,
  author: row.author as ReviewAuthor,
  rating: row.rating,
  review: row.review,
  createdAt: row.createdAt.toISOString(),
});

/** 최신순: 내역 날짜, 남긴 시각 */
const byNewest = (a: PlaceReview, b: PlaceReview) =>
  b.entryDate.localeCompare(a.entryDate) || b.createdAt.localeCompare(a.createdAt);

/** 지운(휴지통) 내역의 리뷰는 보이지 않는다. 되돌리면 다시 보인다. */
const reviewQuery = () =>
  getDb()
    .select(reviewColumns)
    .from(reviewsT)
    .innerJoin(entriesT, eq(entriesT.id, reviewsT.entryId))
    .$dynamic();

/** 내역별 리뷰 (남긴 순서대로) */
export const listReviewsByEntryIds = async (
  entryIds: number[]
): Promise<Map<number, PlaceReview[]>> => {
  const ids = [...new Set(entryIds)];
  const byEntry = new Map<number, PlaceReview[]>();
  if (!ids.length) return byEntry;
  const rows = await reviewQuery()
    .where(and(activeEntry, inArray(reviewsT.entryId, ids)))
    .orderBy(asc(reviewsT.createdAt), asc(reviewsT.id));
  for (const row of rows) {
    const list = byEntry.get(row.entryId) ?? [];
    list.push(toReview(row));
    byEntry.set(row.entryId, list);
  }
  return byEntry;
};

/**
 * 장소 key별 리뷰 (최신순). 장소 key는 리뷰를 남긴 내역의 지도 링크에서 읽으므로,
 * 링크 모양이 달라도 같은 네이버 장소면 한 곳으로 모인다.
 */
export const listReviewsByPlace = async (): Promise<Map<string, PlaceReview[]>> => {
  const rows = await reviewQuery().where(and(activeEntry, ne(entriesT.mapUrl, "")));
  const byPlace = new Map<string, PlaceReview[]>();
  for (const row of rows) {
    const key = toPlaceKey(row);
    const list = byPlace.get(key) ?? [];
    list.push(toReview(row));
    byPlace.set(key, list);
  }
  for (const list of byPlace.values()) list.sort(byNewest);
  return byPlace;
};

/** 리뷰가 있는 장소 — 하치와레 추천에 붙이고, 다음 조사의 취향 힌트로 쓴다. */
export interface RatedPlace {
  key: string;
  /** 가장 최근 내역에서 읽은 네이버 장소 이름(없으면 내역 내용) */
  name: string;
  /** 네이버 업종으로 짐작한 종류 — 숙소 찾기에는 숙소 리뷰만 넣는다. */
  kind: PlaceKind;
  rating: PlaceRatingSummary;
  /** 최신순 */
  reviews: PlaceReview[];
}

export const getRatedPlaces = async (): Promise<RatedPlace[]> => {
  const rows = await getDb()
    .select({
      ...reviewColumns,
      mapPlaceName: entriesT.mapPlaceName,
      mapCategory: entriesT.mapCategory,
      memo: entriesT.memo,
    })
    .from(reviewsT)
    .innerJoin(entriesT, eq(entriesT.id, reviewsT.entryId))
    .where(and(activeEntry, ne(entriesT.mapUrl, "")));
  const byKey = new Map<
    string,
    { name: string; category: string; nameDate: string; reviews: PlaceReview[] }
  >();
  for (const row of rows) {
    const key = toPlaceKey(row);
    const place = byKey.get(key) ?? { name: "", category: "", nameDate: "", reviews: [] };
    if (row.entryDate >= place.nameDate) {
      place.name = row.mapPlaceName || row.memo || place.name;
      place.category = row.mapCategory || place.category;
      place.nameDate = row.entryDate;
    }
    place.reviews.push(toReview(row));
    byKey.set(key, place);
  }
  return [...byKey].map(([key, place]) => ({
    key,
    name: place.name,
    kind: inferPlaceKind(place.category),
    rating: summarizeRatings(place.reviews.map((review) => review.rating))!,
    reviews: place.reviews.sort(byNewest),
  }));
};

/** 리뷰는 지도 링크가 있는 지출 내역에만 남긴다. */
const assertReviewableEntry = async (entryId: number) => {
  const [entry] = await getDb()
    .select({ kind: entriesT.kind, mapUrl: entriesT.mapUrl })
    .from(entriesT)
    .where(and(activeEntry, eq(entriesT.id, entryId)))
    .limit(1);
  if (!entry) throw new PlaceError("내역을 찾을 수 없어요.", 404);
  if (entry.kind !== "expense" || !entry.mapUrl) {
    throw new PlaceError("지도 링크가 있는 지출에만 리뷰를 남길 수 있어요.");
  }
};

const getReview = async (id: number): Promise<PlaceReview> => {
  const [row] = await reviewQuery().where(eq(reviewsT.id, id)).limit(1);
  if (!row) throw new PlaceError("리뷰를 찾을 수 없어요.", 404);
  return toReview(row);
};

export const createReview = async (input: CreateReviewInput): Promise<PlaceReview> => {
  const values = createReviewSchema.parse(input);
  await assertReviewableEntry(values.entryId);
  const [row] = await getDb().insert(reviewsT).values(values).returning();
  return getReview(row.id);
};

export const updateReview = async (
  id: number,
  input: UpdateReviewInput
): Promise<PlaceReview> => {
  const patch = updateReviewSchema.parse(input);
  const rows = await getDb()
    .update(reviewsT)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(reviewsT.id, id))
    .returning();
  if (!rows.length) throw new PlaceError("리뷰를 찾을 수 없어요.", 404);
  return getReview(id);
};

export const deleteReview = async (id: number) => {
  const rows = await getDb().delete(reviewsT).where(eq(reviewsT.id, id)).returning();
  if (!rows.length) throw new PlaceError("리뷰를 찾을 수 없어요.", 404);
};

/* ───────── 지역 ───────── */

const { placeAreas: areasT } = schema;

const toAreaView = (row: typeof areasT.$inferSelect): AreaView => ({
  id: row.id,
  name: row.name,
  lat: row.lat,
  lng: row.lng,
  address: row.address,
  radiusM: row.radiusM,
});

/** 저장한 지역. 최근에 연 지역이 먼저 */
export const listAreas = async (): Promise<AreaView[]> =>
  (
    await getDb().select().from(areasT).orderBy(desc(areasT.lastUsedAt), desc(areasT.id))
  ).map(toAreaView);

export const createArea = async (input: CreateAreaInput): Promise<AreaView> => {
  const values = createAreaSchema.parse(input);
  const [row] = await getDb()
    .insert(areasT)
    .values(values)
    .onConflictDoNothing({ target: areasT.name })
    .returning();
  if (!row) throw new PlaceError(`'${values.name}'은 이미 있는 지역이에요.`, 409);
  return toAreaView(row);
};

export const updateAreaRadius = async (
  id: number,
  radiusM: number
): Promise<AreaView> => {
  const [row] = await getDb()
    .update(areasT)
    .set({ radiusM })
    .where(eq(areasT.id, id))
    .returning();
  if (!row) throw new PlaceError("지역을 찾을 수 없어요.", 404);
  return toAreaView(row);
};

export const deleteArea = async (id: number) => {
  const rows = await getDb().delete(areasT).where(eq(areasT.id, id)).returning();
  if (!rows.length) throw new PlaceError("지역을 찾을 수 없어요.", 404);
};

/** 지역을 열면 칩 맨 앞으로 옮긴다. */
export const touchArea = async (id: number): Promise<AreaView | null> => {
  const [row] = await getDb()
    .update(areasT)
    .set({ lastUsedAt: new Date() })
    .where(eq(areasT.id, id))
    .returning();
  return row ? toAreaView(row) : null;
};
