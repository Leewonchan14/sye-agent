import { and, desc, eq, inArray, isNotNull, or } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/db";
import { activeEntry } from "@/lib/db/ledger";
import {
  type AreaView,
  type CreateAreaInput,
  createAreaSchema,
  inferPlaceKind,
  type PlaceNote,
  type PlaceNoteInput,
  placeNoteInputSchema,
} from "@/lib/places/types";

const { places: placesT, ledgerEntries: entriesT } = schema;

/** 사용자에게 그대로 보여 줄 수 있는 오류 */
export class PlaceError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}

type PlaceRow = typeof placesT.$inferSelect;

const toNote = (row: Pick<PlaceRow, "rating" | "review" | "ratedAt">): PlaceNote => ({
  rating: row.rating,
  review: row.review,
  ratedAt: row.ratedAt?.toISOString() ?? null,
});

/** 매긴 별점·리뷰가 있는 장소만 key → 별점으로 돌려준다. */
export const getPlaceNotes = async (keys: string[]): Promise<Map<string, PlaceNote>> => {
  const unique = [...new Set(keys.filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = await getDb()
    .select({
      key: placesT.key,
      rating: placesT.rating,
      review: placesT.review,
      ratedAt: placesT.ratedAt,
    })
    .from(placesT)
    .where(inArray(placesT.key, unique));
  return new Map(
    rows
      .filter((row) => row.rating !== null || row.review)
      .map((row) => [row.key, toNote(row)])
  );
};

/**
 * 가계부 지도에 찍힌 장소의 정보를 key(네이버 장소 id, 없으면 지도 링크)로 찾는다.
 * 같은 장소를 여러 번 갔으면 가장 최근 지출에서 읽은 이름·사진을 쓴다.
 */
const findLedgerPlace = async (key: string) => {
  const [row] = await getDb()
    .select({
      mapUrl: entriesT.mapUrl,
      mapPlaceId: entriesT.mapPlaceId,
      mapPlaceName: entriesT.mapPlaceName,
      memo: entriesT.memo,
      mapImageUrls: entriesT.mapImageUrls,
      mapLat: entriesT.mapLat,
      mapLng: entriesT.mapLng,
      mapAddress: entriesT.mapAddress,
      mapCategory: entriesT.mapCategory,
    })
    .from(entriesT)
    .where(
      and(
        activeEntry,
        isNotNull(entriesT.mapLat),
        or(
          eq(entriesT.mapPlaceId, key),
          and(eq(entriesT.mapPlaceId, ""), eq(entriesT.mapUrl, key))
        )
      )
    )
    .orderBy(desc(entriesT.entryDate), desc(entriesT.id))
    .limit(1);
  if (!row) return null;
  return {
    name: row.mapPlaceName || row.memo || "이름 없는 장소",
    kind: inferPlaceKind(row.mapCategory),
    category: row.mapCategory,
    address: row.mapAddress,
    lat: row.mapLat,
    lng: row.mapLng,
    mapUrl: row.mapPlaceId
      ? `https://map.naver.com/p/entry/place/${row.mapPlaceId}`
      : row.mapUrl,
    imageUrl: row.mapImageUrls[0] ?? null,
  };
};

/**
 * 장소에 별점·한 줄 리뷰를 남긴다. 수첩에 아직 없는 장소면 가계부 지도에서 정보를 읽어 만든다.
 * 별점을 비우고 리뷰도 비우면 매긴 기록을 지운다(장소 행은 남긴다).
 */
export const savePlaceNote = async (input: PlaceNoteInput): Promise<PlaceNote> => {
  const { key, rating, review } = placeNoteInputSchema.parse(input);
  if (rating === null && review) {
    throw new PlaceError("리뷰를 남기려면 별점도 골라 주세요.");
  }
  const now = new Date();
  const note = { rating, review, ratedAt: rating === null ? null : now, updatedAt: now };

  const [existing] = await getDb()
    .select({ id: placesT.id })
    .from(placesT)
    .where(eq(placesT.key, key))
    .limit(1);
  if (existing) {
    const [row] = await getDb()
      .update(placesT)
      .set(note)
      .where(eq(placesT.id, existing.id))
      .returning();
    return toNote(row);
  }

  const place = await findLedgerPlace(key);
  if (!place) throw new PlaceError("장소를 찾을 수 없어요.", 404);
  const [row] = await getDb()
    .insert(placesT)
    .values({ key, ...place, ...note })
    // 둘이 동시에 처음 매기면 나중 것이 이긴다.
    .onConflictDoUpdate({ target: placesT.key, set: note })
    .returning();
  return toNote(row);
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
