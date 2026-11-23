/**
 * 지역 이름(예: "신도림")으로 네이버 통합검색을 읽어 중심으로 삼을 곳의 후보를 돌려준다.
 * 검색 결과 페이지에 들어 있는 데이터(`__APOLLO_STATE__`)의 장소 목록(`PlaceListBusinessesItem`)에서
 * 이름·주소·업종·좌표를 꺼낸다. 읽지 못하면 빈 배열을 돌려준다.
 *
 * 동네 이름만 검색하면 그 이름이 들어간 가게가 먼저 나오므로 "<이름>역"을 먼저 찾아 역을 앞에 둔다.
 * 모바일 브라우저로 보내면 모바일 검색으로 넘어가 데이터가 없어서 PC 브라우저로 읽는다.
 */

import { readApolloState, toCoordinate, toText } from "@/lib/ledger/naver-place";
import type { AreaCandidate } from "@/lib/places/types";

const FETCH_TIMEOUT_MS = 5_000;
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const STATION_RE = /지하철|전철|기차역|역사/;
const MAX_CANDIDATES = 5;

const searchOrigin = () =>
  (process.env.NAVER_SEARCH_ORIGIN || "https://search.naver.com").replace(/\/+$/, "");

/** 이름에 붙어 오는 검색어 강조(<mark>)를 뗀다. */
const stripTags = (value: string) => value.replace(/<[^>]+>/g, "").trim();

interface ListItem {
  name?: unknown;
  category?: unknown;
  roadAddress?: unknown;
  address?: unknown;
  fullAddress?: unknown;
  x?: unknown;
  y?: unknown;
}

export const parseAreaCandidates = (html: string): AreaCandidate[] => {
  const state = readApolloState(html);
  if (!state) return [];
  const seen = new Set<string>();
  const candidates: AreaCandidate[] = [];
  for (const [key, value] of Object.entries(state)) {
    if (!key.startsWith("PlaceListBusinessesItem:")) continue;
    const item = value as ListItem;
    const lat = toCoordinate(item.y, 90);
    const lng = toCoordinate(item.x, 180);
    const name = stripTags(toText(item.name));
    if (lat === null || lng === null || !name) continue;
    const address =
      toText(item.fullAddress) || toText(item.roadAddress) || toText(item.address);
    const id = `${name}|${address}`;
    if (seen.has(id)) continue;
    seen.add(id);
    candidates.push({ name, address, category: toText(item.category), lat, lng });
    if (candidates.length >= MAX_CANDIDATES) break;
  }
  return candidates;
};

const searchOnce = async (query: string): Promise<AreaCandidate[]> => {
  try {
    const res = await fetch(
      `${searchOrigin()}/search.naver?where=nexearch&query=${encodeURIComponent(query)}`,
      {
        headers: { "User-Agent": DESKTOP_UA },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }
    );
    return res.ok ? parseAreaCandidates(await res.text()) : [];
  } catch (error) {
    console.warn("[places] 지역을 찾지 못했어요.", error);
    return [];
  }
};

export const searchAreaCandidates = async (query: string): Promise<AreaCandidate[]> => {
  const q = query.trim();
  if (!q) return [];
  const queries = q.endsWith("역") ? [q] : [`${q}역`, q];
  const found = (await Promise.all(queries.map(searchOnce))).flat();
  const seen = new Set<string>();
  const unique = found.filter((item) => {
    const id = `${item.name}|${item.address}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  // 역을 앞에 두고, 나머지는 검색 결과 순서를 지킨다.
  return [
    ...unique.filter((item) => STATION_RE.test(item.category)),
    ...unique.filter((item) => !STATION_RE.test(item.category)),
  ].slice(0, MAX_CANDIDATES);
};
