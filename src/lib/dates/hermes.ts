import { randomBytes } from "node:crypto";

import type { DateSettings } from "@/lib/dates/types";
import {
  claimDigestPending,
  countDigestSpots,
  DateSpotError,
  getDateSettings,
  getDigestRow,
  getRecommendationHistory,
  releaseDigestPending,
  setDigestHermesRun,
} from "@/lib/db/dates";
import { getRatedPlaces, type RatedPlace } from "@/lib/db/places";
import {
  getHermesConfig,
  missingHermesEnv,
  toHermesSessionId,
} from "@/lib/hermes/config";
import { getHermesRunStatus, startHermesRun } from "@/lib/hermes/run-client";
import { kst } from "@/lib/kst";
import { hashCallbackToken } from "@/lib/monitor/hermes";
import {
  DISLIKED_RATING,
  LIKED_RATING,
  REVIEW_AUTHOR_LABEL,
  type AreaView,
} from "@/lib/places/types";

/**
 * 하치와레(Hermes hachi 프로필)에게 데이트 추천(인스타그램 장소 + 같이 즐길 거리) 조사를 맡긴다.
 * 결과는 채팅 답 대신 `/api/dates/agent/digests`로 POST하고, 인증은 조사마다 발급한
 * 일회성 콜백 토큰(`x-monitor-token`)으로 한다. 모니터링 대시보드와 같은 방식이다.
 */

const TERMINAL = new Set(["completed", "failed", "cancelled", "error"]);
/** 시작 직후에는 상태 조회를 건너뛴다 (런 등록 지연 대비). */
const GRACE_MS = 60_000;

const SPOT_FORMAT = `spots 원소 형식 (JSON) — 장소일 때:
{
  "kind": "place",
  "name": "장소 이름 (필수)",
  "area": "동네 (예: 성수, 연남)",
  "category": "카페 | 맛집 | 술집 | 전시 | 팝업 | 공방·체험 | 산책·야경 | 공연 | 기타 중 하나",
  "summary": "어떤 곳인지 2문장",
  "reason": "우리 둘에게 왜 좋을지 한 줄",
  "instagramUrl": "근거가 된 인스타그램 게시물·릴스 주소 (필수, https://www.instagram.com/p/코드/ 또는 /reel/코드/)",
  "instagramAuthor": "게시물 올린 계정 (@ 없이)",
  "postedAt": "게시 시각 2026-11-05T16:23:00+09:00 형식, 모르면 null",
  "address": "도로명 주소 (네이버 지역 검색으로 확인한 것)",
  "priceHint": "1인 2만원대 같은 가격 감, 모르면 null",
  "tags": ["분위기·특징 키워드 2~5개"],
  "naverPlaceId": "네이버 지도 장소 id — map.naver.com/p/entry/place/<숫자>의 숫자. 네이버 지도에서 찾은 장소면 꼭 넣고, 모르면 null",
  "lat": 37.5090, "lng": 126.8916 (위도·경도 숫자. 지역 검색 결과의 mapy·mapx를 10000000으로 나눈 값, 모르면 null)
}`;

const CONTENT_FORMAT = `spots 원소 형식 (JSON) — 즐길 거리일 때:
{
  "kind": "content",
  "name": "즐길거리 이름 (필수, 예: 팝업스토어 이름, 게임 제목, 공연 이름)",
  "area": "열리는 동네 (집에서 즐기는 거면 \"집\", 온라인이면 \"온라인\")",
  "category": "팝업·전시 | 게임 | 공연·영화 | 축제·시즌 | 클래스·체험 | 집데이트 | 기타 중 하나",
  "summary": "무엇을 하는지 2문장 (게임이면 장르·인원·플랫폼, 팝업이면 무엇을 파는지·볼거리)",
  "reason": "우리 둘이 같이 하면 왜 좋을지 한 줄",
  "sourceUrl": "공식·소개 페이지 (스팀·닌텐도 상점, 공식 공지·인스타, 예매처, 기사 등. 인스타 주소가 없으면 필수)",
  "instagramUrl": "근거가 된 인스타그램 게시물 주소. 게임은 필수(그 게시물이 소개한 게임만 추천), 다른 즐길 거리는 있으면 넣고 없으면 null",
  "instagramAuthor": "인스타 게시물 계정 (@ 없이), 없으면 null",
  "period": "즐길 수 있는 기간 (예: \"11.14~12.7\", \"상시\", \"12.24 하루\")",
  "postedAt": "인스타 게시 시각, 모르면 null",
  "address": "열리는 장소의 도로명 주소 (집·온라인이면 null)",
  "priceHint": "1인 2만원, 게임 2인 3만원대 같은 가격 감, 모르면 null",
  "tags": ["특징 키워드 2~5개 (예: 협동, 공포, 2인, 한정판)"],
  "naverPlaceId": "열리는 장소의 네이버 지도 장소 id, 없거나 모르면 null",
  "lat": null, "lng": null (열리는 장소의 위도·경도, 집·온라인이면 null)
}`;

/** 리뷰 한 줄을 프롬프트에 넣을 꼴로 — 원찬 "국물이 진해" */
const reviewQuote = (place: RatedPlace) =>
  place.reviews
    .filter((review) => review.review)
    .slice(0, 3)
    .map((review) => `${REVIEW_AUTHOR_LABEL[review.author]} "${review.review}"`)
    .join(", ");

const ratedLabel = (place: RatedPlace) => {
  const quote = reviewQuote(place);
  return `${place.name}(★${place.rating.average}${quote ? `, ${quote}` : ""})`;
};

/** 다녀와서 남긴 리뷰 별점으로 좋았던 곳·별로였던 곳을 알려 준다. 별 3점대는 넣지 않는다. */
const ratedLines = (rated: RatedPlace[]) => {
  const liked = rated
    .filter((place) => place.rating.average >= LIKED_RATING)
    .sort((a, b) => b.rating.average - a.rating.average)
    .slice(0, 15);
  const disliked = rated
    .filter((place) => place.rating.average <= DISLIKED_RATING)
    .slice(0, 30);
  return [
    ...(liked.length
      ? [
          `우리가 다녀와서 좋았던 곳(리뷰 평균 별 ${LIKED_RATING} 이상, 리뷰를 보고 이런 결의 비슷한 곳을 골라): ${liked.map(ratedLabel).join(", ")}`,
        ]
      : []),
    ...(disliked.length
      ? [
          `우리가 다녀와서 별로였던 곳(리뷰 평균 별 ${DISLIKED_RATING} 이하, 이곳들은 다시 추천하지 마. 보내도 저장되지 않아): ${disliked.map(ratedLabel).join(", ")}`,
        ]
      : []),
  ];
};

export const buildDateSpotPrompt = (options: {
  digestId: number;
  dayKey: string;
  settings: DateSettings;
  history: Awaited<ReturnType<typeof getRecommendationHistory>>;
  /** 다녀와서 가계부 내역에 리뷰를 남긴 곳 */
  rated?: RatedPlace[];
  /** 지역 수첩의 "이 동네 더 찾아 줘" — 이 지역 반경 안에서만 찾는다. */
  area?: AreaView | null;
  callbackUrl: string;
  token: string;
  extra: boolean;
}) => {
  const { settings, history, rated = [], area = null } = options;
  const day = kst(options.dayKey);
  return [
    `[데이트 추천 조사 요청] ${day.format("YYYY.MM.DD (dd)")}`,
    `원찬이랑 예은이가 같이 할 데이트 추천을 ${settings.count}개 찾아 줘.`,
    "가 볼 장소(카페·맛집·술집·전시·공방·산책·야경)와 같이 즐길 거리(팝업스토어, 인스타그램에서 소개된 둘이서 하는 협동·공포 게임, 공연·영화, 축제·시즌 이벤트, 원데이 클래스, 집데이트 거리)를 따로 나누지 말고 한 목록으로 섞어서 골라. 몇 개씩 나눌지는 정하지 말고, 오늘 둘에게 가장 좋은 것부터 골라.",
    area
      ? `지역 수첩에서 '${area.name}' 동네만 골라서 더 찾아 달라는 요청이야. 이 동네 밖은 빼.`
      : options.extra
        ? "오늘 이미 추천한 것이 있어서 더 찾아 달라는 요청이야. 오늘 고른 것과 겹치지 않게 다른 분위기로 골라."
        : "매일 아침 받아 보는 오늘의 추천이야.",
    "",
    area
      ? `지역: ${area.name} 한 곳만 — 가운데 ${area.address || `${area.lat}, ${area.lng}`} (위도 ${area.lat}, 경도 ${area.lng})에서 반경 ${area.radiusM / 1000}km 안. 장소는 좌표(lat·lng)로 반경 안인지 확인하고, 집·온라인 즐길 거리는 빼.`
      : `지역: ${settings.areas.join(", ")}`,
    `원하는 테마: ${settings.themes.join(", ") || "자유 (카페·맛집이나 한 종류만 몰리지 않게 섞어 줘)"}`,
    ...(settings.memo ? [`부탁: ${settings.memo}`] : []),
    ...(history.liked.length
      ? [`좋아했던 것(비슷한 결로 참고): ${history.liked.slice(0, 20).join(", ")}`]
      : []),
    ...(history.passed.length
      ? [`별로라고 한 것(이런 결은 피해): ${history.passed.slice(0, 20).join(", ")}`]
      : []),
    ...ratedLines(rated),
    "",
    "찾는 방법:",
    '1. web_search로 후보를 넓게 모아. 장소와 게임은 인스타그램 게시물로("site:instagram.com 성수 데이트", "#성수카페", "성수 팝업 이번주", "site:instagram.com 커플 게임 추천", "#커플게임", "#2인협동게임", "#스팀게임추천") 찾고, 나머지 즐길 거리는 공식 소식으로("이번주 팝업스토어 서울", "캐릭터 팝업 용산", "이번달 커플 공연", "연말 서울 축제") 찾아. 최근 3개월 안의 것을 우선해.',
    "2. 인스타그램 게시물은 공식 임베드 주소로 읽어: https://www.instagram.com/p/<코드>/embed/captioned/ (릴스도 같은 코드로 열려). 로그인 페이지를 억지로 열거나 다른 브라우저인 척하는 우회는 하지 마. 못 읽은 게시물은 건너뛰어.",
    "3. 장소는 naver-search-api 스킬의 local 검색으로 실제 주소와 업종을 확인해. 폐업했거나 확인이 안 되면 빼. 장소는 인스타그램 게시물 주소가 꼭 있어야 하고, 광고 티가 심한 게시물보다 실제 방문 후기를 우선해.",
    "4. 팝업·전시·공연·축제는 공식 공지나 예매처에서 기간과 장소를 확인해. 끝났거나 아직 공지가 없는 건 빼(오늘이 마지막 날이면 넣어도 돼). 게임은 스팀·닌텐도 상점이나 게임 추천 기사에서 직접 고르지 말고, 인스타그램 게시물이 소개한 게임만 골라. 고른 게임은 둘이 같이 할 수 있는지(로컬·온라인 2인 협동이나 대전) 상점 페이지에서 확인하고 플랫폼과 가격을 써(상점 페이지는 확인용이고 sourceUrl에 넣어).",
    "5. 즐길 거리는 근거 주소(sourceUrl: 공식·소개 페이지)를 꼭 넣어. 게임은 그 게임을 소개한 인스타그램 게시물 주소(instagramUrl)도 꼭 넣어. 다른 즐길 거리도 인스타 게시물이 있으면 instagramUrl을 같이 넣으면 게시물 사진이 보여(없으면 sourceUrl 페이지의 대표 이미지가 보여).",
    "",
    "결과는 채팅으로 길게 답하지 말고 아래 API로 보내. 보낸 뒤 채팅에는 몇 개 보냈는지만 한 줄로 말해.",
    'note에는 오늘 추천을 한두 문장으로 소개하는 하치와레 한마디를 써 (예: "날이 추워져서 실내 위주로 골랐어!").',
    'spots는 한 배열에 섞어 넣고, 각 원소의 kind로 장소("place")인지 즐길 거리("content")인지만 표시해. 숙소("stay")는 넣지 마.',
    SPOT_FORMAT,
    CONTENT_FORMAT,
    "보낼 때는 터미널에서 이렇게 해 (JSON은 파일로 써서 보내):",
    `curl -sS -X POST '${options.callbackUrl}' -H 'Content-Type: application/json' -H 'x-monitor-token: ${options.token}' --data @/tmp/date_spots.json`,
    `파일 본문 예: {"digestId": ${options.digestId}, "note": "...", "spots": [ ... ]}`,
    "응답이 201이면 성공이야. 400이면 메시지를 보고 고쳐서 다시 보내. 못 찾았어도 빈 spots로 꼭 보내.",
    "",
    `이미 추천한 것(${history.recommended.length}개) — 다시 추천하지 마:`,
    ...history.recommended.slice(0, 150),
  ].join("\n");
};

/** 지역 수첩 숙소 찾기에서 받는 숙소 수 */
export const STAY_SEARCH_COUNT = 5;

const STAY_FORMAT = `spots 원소 형식 (JSON) — 숙소:
{
  "kind": "stay",
  "name": "숙소 이름 (필수, NOL에 나온 이름)",
  "area": "동네 (예: 신도림)",
  "category": "호텔 | 모텔 | 펜션 | 게스트하우스 | 리조트 | 한옥스테이 | 글램핑·캠핑 | 기타 중 하나",
  "summary": "어떤 숙소인지 2문장 (객실·시설·분위기)",
  "reason": "우리 둘이 묵기에 왜 좋을지 한 줄",
  "sourceUrl": "NOL 숙소 페이지 주소 (필수, opencli yanolja가 돌려준 url 그대로 — 날짜가 실려 있어서 손대지 마)",
  "instagramUrl": null,
  "address": "도로명 주소",
  "priceHint": "1박 가격과 기준 날짜 (예: \"1박 12만원대 (11.29~30 기준)\"), 숙박 매진이면 \"숙박 매진, 대실만\"",
  "tags": ["NOL 평점·후기 수와 특징 2~5개 (예: \"평점 9.2\", \"후기 1,203\", \"스파\", \"주차\")"],
  "naverPlaceId": "네이버 지도 장소 id, 모르면 null",
  "lat": 37.5090, "lng": 126.8916 (opencli yanolja item의 lat·lng, 모르면 null)
}`;

/**
 * 지역 수첩의 "이 동네 숙소 찾아 줘" — 그 지역 반경 안에서 둘이 묵을 숙소를 NOL로 찾는다.
 * 가격은 날짜마다 다르므로 체크인 날짜(1박)를 정해서 보낸다.
 */
export const buildStayPrompt = (options: {
  digestId: number;
  area: AreaView;
  checkin: string;
  history: Awaited<ReturnType<typeof getRecommendationHistory>>;
  rated?: RatedPlace[];
  callbackUrl: string;
  token: string;
}) => {
  const { area, history, rated = [] } = options;
  const checkin = kst(options.checkin);
  const checkout = checkin.add(1, "day");
  const stayRated = rated.filter((place) => place.kind === "stay");
  return [
    `[지역 수첩 숙소 찾기] ${area.name}`,
    `원찬이랑 예은이가 '${area.name}'에서 묵을 숙소를 ${STAY_SEARCH_COUNT}곳 찾아 줘.`,
    `체크인 ${checkin.format("YYYY.MM.DD (dd)")} → 체크아웃 ${checkout.format("MM.DD (dd)")}, 1박 2인 기준이야.`,
    `지역: ${area.name} — 가운데 ${area.address || `${area.lat}, ${area.lng}`} (위도 ${area.lat}, 경도 ${area.lng})에서 반경 ${area.radiusM / 1000}km 안만. 좌표(lat·lng)로 반경 안인지 꼭 확인해.`,
    ...ratedLines(stayRated),
    "",
    "찾는 방법:",
    `1. yanolja-stays 스킬로 NOL을 찾아: opencli yanolja search "${area.name} 호텔" --checkin ${checkin.format("YYYY-MM-DD")} --checkout ${checkout.format("YYYY-MM-DD")} --sort rating --limit 15 (모텔·펜션·게스트하우스도 "${area.name} 숙소"로 한 번 더 찾아 섞어). 결과에 옆 동네가 섞이니 location·address로 걸러.`,
    "2. 평점·후기 수가 넉넉하고 둘이 묵기 좋은 곳(깔끔함·분위기·접근성)을 고르고, 광고(ad)는 평점이 좋을 때만 넣어. 숙박 요금이 없는 곳(대실만)은 빼.",
    "3. 최종 후보는 opencli yanolja item으로 주소·좌표(lat·lng)를 확인해. 네이버 지도 장소 id는 지역 검색이나 place_hours.py로 찾아 넣고, 못 찾으면 null.",
    "4. 가격은 위 날짜 기준 1박 가격을 priceHint에 날짜와 함께 써. sourceUrl은 NOL이 돌려준 url을 그대로 넣어.",
    "",
    "결과는 채팅으로 길게 답하지 말고 아래 API로 보내. 보낸 뒤 채팅에는 몇 개 보냈는지만 한 줄로 말해.",
    'note에는 고른 숙소를 한두 문장으로 소개하는 하치와레 한마디를 써 (예: "역에서 가까운 깔끔한 곳 위주로 골랐어!").',
    'spots의 kind는 모두 "stay"야.',
    STAY_FORMAT,
    "보낼 때는 터미널에서 이렇게 해 (JSON은 파일로 써서 보내):",
    `curl -sS -X POST '${options.callbackUrl}' -H 'Content-Type: application/json' -H 'x-monitor-token: ${options.token}' --data @/tmp/date_spots.json`,
    `파일 본문 예: {"digestId": ${options.digestId}, "note": "...", "spots": [ ... ]}`,
    "응답이 201이면 성공이야. 400이면 메시지를 보고 고쳐서 다시 보내. 못 찾았어도 빈 spots로 꼭 보내.",
    "",
    "이미 추천한 숙소 — 다시 추천하지 마:",
    ...history.recommended.filter((label) => label.startsWith("[숙소] ")).slice(0, 50),
  ].join("\n");
};

/**
 * 하루치 조사에 하치와레를 붙인다. 이미 찾는 중이면 409.
 * `extra`는 같은 날 두 번째 이후 요청(더 찾아 줘)이다.
 */
export const startDateSpotSearch = async (options: {
  origin: string;
  digestId: number;
  extra: boolean;
  /** 지역 수첩의 "이 동네 더 찾아 줘" */
  area?: AreaView | null;
  /** 지역 수첩의 "이 동네 숙소 찾아 줘" — area와 함께, 체크인 날짜(YYYY-MM-DD) */
  stayCheckin?: string | null;
}) => {
  const missing = missingHermesEnv();
  if (missing.length) {
    throw new DateSpotError(`Hermes 설정이 비어 있어요: ${missing.join(", ")}`, 503);
  }
  const config = getHermesConfig();
  const digest = await getDigestRow(options.digestId);
  if (!digest) throw new DateSpotError("조사 기록을 찾을 수 없어요.", 404);

  const token = randomBytes(24).toString("base64url");
  if (!(await claimDigestPending(digest.id, hashCallbackToken(token)))) {
    throw new DateSpotError("하치와레가 이미 찾고 있어요.", 409);
  }

  try {
    const [settings, history, rated] = await Promise.all([
      getDateSettings(),
      getRecommendationHistory(),
      getRatedPlaces(),
    ]);
    const callbackUrl = `${options.origin}/api/dates/agent/digests`;
    const input =
      options.area && options.stayCheckin
        ? buildStayPrompt({
            digestId: digest.id,
            area: options.area,
            checkin: options.stayCheckin,
            history,
            rated,
            callbackUrl,
            token,
          })
        : buildDateSpotPrompt({
            digestId: digest.id,
            dayKey: digest.dayKey,
            settings,
            history,
            rated,
            area: options.area ?? null,
            callbackUrl,
            token,
            extra: options.extra,
          });
    const hermesRunId = await startHermesRun(config, {
      sessionId: toHermesSessionId(config, `date-spots-${digest.id}-${Date.now()}`),
      input,
    });
    await setDigestHermesRun(digest.id, hermesRunId);
    return hermesRunId;
  } catch (error) {
    await releaseDigestPending(digest.id, "하치와레에게 요청하지 못했어요.");
    throw error;
  }
};

/**
 * 하치와레 작업이 끝났는데 찾는 중 상태가 남아 있으면 푼다.
 * 일부라도 받았으면(마지막 묶음만 빠진 경우) 받은 만큼으로 마감하고, 하나도 없으면 오류를 남긴다.
 */
export const reconcileDigestPending = async (digestId: number) => {
  const digest = await getDigestRow(digestId);
  if (!digest?.pendingHermesRunId || !digest.pendingSince) return;
  if (Date.now() - digest.pendingSince.valueOf() < GRACE_MS) return;
  if (digest.pendingHermesRunId === "starting" || missingHermesEnv().length) return;

  const status = await getHermesRunStatus(getHermesConfig(), digest.pendingHermesRunId);
  if (!status || !TERMINAL.has(status.status)) return;
  const received = await countDigestSpots(digest.id, digest.pendingSince);
  if (received > 0) return releaseDigestPending(digest.id, null);
  await releaseDigestPending(
    digest.id,
    status.status === "completed"
      ? "하치와레가 결과를 보내지 않고 작업을 끝냈어요."
      : status.error || "하치와레 작업이 중간에 실패했어요."
  );
};
