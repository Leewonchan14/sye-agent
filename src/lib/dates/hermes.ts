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
import {
  getHermesConfig,
  missingHermesEnv,
  toHermesSessionId,
} from "@/lib/hermes/config";
import { getHermesRunStatus, startHermesRun } from "@/lib/hermes/run-client";
import { kst } from "@/lib/kst";
import { hashCallbackToken } from "@/lib/monitor/hermes";

/**
 * 하치와레(Hermes hachi 프로필)에게 인스타그램 데이트 장소 조사를 맡긴다.
 * 결과는 채팅 답 대신 `/api/dates/agent/digests`로 POST하고, 인증은 조사마다 발급한
 * 일회성 콜백 토큰(`x-monitor-token`)으로 한다. 모니터링 대시보드와 같은 방식이다.
 */

const TERMINAL = new Set(["completed", "failed", "cancelled", "error"]);
/** 시작 직후에는 상태 조회를 건너뛴다 (런 등록 지연 대비). */
const GRACE_MS = 60_000;

const SPOT_FORMAT = `spots 원소 형식 (JSON):
{
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
  "tags": ["분위기·특징 키워드 2~5개"]
}`;

export const buildDateSpotPrompt = (options: {
  digestId: number;
  dayKey: string;
  settings: DateSettings;
  history: Awaited<ReturnType<typeof getRecommendationHistory>>;
  callbackUrl: string;
  token: string;
  extra: boolean;
}) => {
  const { settings, history } = options;
  const day = kst(options.dayKey);
  return [
    `[데이트 장소 조사 요청] ${day.format("YYYY.MM.DD (dd)")}`,
    `원찬이랑 예은이가 가 볼 만한 데이트 장소를 인스타그램에서 ${settings.count}곳 찾아 줘.`,
    options.extra
      ? "오늘 이미 추천한 곳이 있어서 더 찾아 달라는 요청이야. 오늘 고른 곳과 겹치지 않게 다른 분위기로 골라."
      : "매일 아침 받아 보는 오늘의 추천이야.",
    "",
    `지역: ${settings.areas.join(", ")}`,
    `원하는 테마: ${settings.themes.join(", ") || "자유 (카페·맛집만 몰리지 않게 섞어 줘)"}`,
    ...(settings.memo ? [`부탁: ${settings.memo}`] : []),
    ...(history.liked.length
      ? [`좋아했던 곳(비슷한 결로 참고): ${history.liked.slice(0, 20).join(", ")}`]
      : []),
    ...(history.passed.length
      ? [`별로라고 한 곳(이런 결은 피해): ${history.passed.slice(0, 20).join(", ")}`]
      : []),
    "",
    "찾는 방법:",
    '1. web_search로 인스타그램 게시물을 찾아. 검색어 예: "site:instagram.com 성수 데이트", "연남동 데이트 코스 인스타", "#성수카페", "성수 팝업 이번주". 최근 3개월 안의 게시물을 우선해.',
    "2. 게시물 내용은 인스타그램 공식 임베드 주소로 읽어: https://www.instagram.com/p/<코드>/embed/captioned/ (릴스도 같은 코드로 열려). 로그인 페이지를 억지로 열거나 다른 브라우저인 척하는 우회는 하지 마. 못 읽은 게시물은 건너뛰어.",
    "3. 장소마다 naver-search-api 스킬의 local 검색으로 실제 주소와 업종을 확인해. 폐업했거나 확인이 안 되면 빼. 팝업·전시는 기간이 끝났으면 빼.",
    "4. 인스타그램 게시물 주소가 없는 장소는 넣지 마. 광고 티가 심한 게시물보다 실제 방문 후기를 우선해.",
    "",
    "결과는 채팅으로 길게 답하지 말고 아래 API로 보내. 보낸 뒤 채팅에는 몇 곳 보냈는지만 한 줄로 말해.",
    'note에는 오늘 추천을 한두 문장으로 소개하는 하치와레 한마디를 써 (예: "날이 추워져서 실내 위주로 골랐어!").',
    SPOT_FORMAT,
    "보낼 때는 터미널에서 이렇게 해 (JSON은 파일로 써서 보내):",
    `curl -sS -X POST '${options.callbackUrl}' -H 'Content-Type: application/json' -H 'x-monitor-token: ${options.token}' --data @/tmp/date_spots.json`,
    `파일 본문 예: {"digestId": ${options.digestId}, "note": "...", "spots": [ ... ]}`,
    "응답이 201이면 성공이야. 400이면 메시지를 보고 고쳐서 다시 보내. 못 찾았어도 빈 spots로 꼭 보내.",
    "",
    `이미 추천한 곳(${history.recommended.length}곳) — 다시 추천하지 마:`,
    ...history.recommended.slice(0, 150),
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
    const [settings, history] = await Promise.all([
      getDateSettings(),
      getRecommendationHistory(),
    ]);
    const input = buildDateSpotPrompt({
      digestId: digest.id,
      dayKey: digest.dayKey,
      settings,
      history,
      callbackUrl: `${options.origin}/api/dates/agent/digests`,
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
