import { createHash, randomBytes } from "node:crypto";

import {
  countRunItemsSince,
  getIssueRow,
  getRunRow,
  setCallbackToken,
  setIssuePending,
  setRunPending,
} from "@/lib/db/monitor";
import {
  getHermesConfig,
  missingHermesEnv,
  toHermesSessionId,
} from "@/lib/hermes/config";
import { getHermesRunStatus, startHermesRun } from "@/lib/hermes/run-client";
import { kst } from "@/lib/kst";
import { reportGreeting } from "@/lib/monitor/sender";
import {
  MAX_ISSUE_ARTICLES,
  type MonitorCategory,
  type MonitorRule,
} from "@/lib/monitor/types";

/**
 * 대시보드 버튼("더 찾기", "지금 다시 집계")을 Hermes 디태치 런으로 넘긴다.
 *
 * Hermes는 결과를 채팅으로 답하는 대신 `/api/monitor/agent/*`로 POST한다.
 * 이때 요청마다 발급한 **일회성 콜백 토큰**(`x-monitor-token`)을 쓰므로,
 * Hermes 쪽에 고정 키를 따로 설정하지 않아도 된다. 토큰은 그 런/이슈에만 유효하다.
 * 런이 POST 없이 끝나면 다음 조회 때 오류로 표시한다(`reconcile*Pending`).
 */

const TERMINAL = new Set(["completed", "failed", "cancelled", "error"]);
/** 시작 직후에는 상태 조회를 건너뛴다 (런 등록 지연 대비). */
const GRACE_MS = 60_000;

const ensureHermes = () => {
  const missing = missingHermesEnv();
  if (missing.length) throw new Error(`Hermes 설정이 비어 있어요: ${missing.join(", ")}`);
  return getHermesConfig();
};

export const hashCallbackToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

const issueCallbackToken = async (target: { kind: "run" | "issue"; id: number }) => {
  const token = randomBytes(24).toString("base64url");
  await setCallbackToken(target, hashCallbackToken(token));
  return token;
};

/** Hermes가 문서 없이도 따라 할 수 있도록 프롬프트에 그대로 싣는 item 형식 */
const ITEM_FORMAT = `items 원소 형식 (JSON):
{
  "url": "원문 URL (필수, 절대 자르지 말 것)",
  "naverUrl": "네이버 뉴스 링크가 있으면",
  "media": "매체명 (필수)",
  "title": "제목 (필수)",
  "reporter": "기자명, 모르면 null",
  "reporterStatus": "found(찾음) | fetch_failed(원문을 못 열었음) | not_on_page(원문을 읽었는데 기자 표기가 없음) | unverified(원문을 열지 않음)",
  "publishedAt": "2026-11-05T16:23:00+09:00 형식, 모르면 null",
  "summary": "핵심 내용 2~3문장",
  "category": "카테고리 key, 제외한 후보는 null",
  "subcategory": "세부 분류(있으면)",
  "score": 0~100 관련도,
  "reason": "고른 이유 한 줄",
  "excludedReason": "제외 이유 (category가 null일 때)",
  "blocked": 원문 접근이 막혔으면 true,
  "sentiment": "positive | neutral | negative — 고객사 입장에서 본 기사 논조. 고객사에 불리한 비판·사고·논란은 negative, 단순 언급·정보 전달은 neutral",
  "importance": "high | normal | low — 고객사가 오늘 꼭 알아야 하면 high(부정 이슈, 주요 매체 단독, 경쟁사 큰 움직임 등), 참고용이면 low"
}`;

const curlExample = (url: string, token: string, body: string) =>
  [
    "보낼 때는 터미널에서 이렇게 해 (JSON은 파일로 써서 보내):",
    `curl -sS -X POST '${url}' -H 'Content-Type: application/json' -H 'x-monitor-token: ${token}' --data @/tmp/monitor_result.json`,
    `파일 본문 예: ${body}`,
    "응답이 201이면 성공이야. 실패하면 응답 메시지를 보고 고쳐서 다시 보내.",
    '여러 번 나눠 보내야 하면 마지막 묶음을 뺀 나머지 본문에 "final": false를 넣어. 마지막 묶음에는 넣지 마 — 그걸 받아야 화면과 알림이 끝난 걸로 바뀌어.',
  ].join("\n");

export const startMoreSearch = async (options: {
  origin: string;
  runId: number;
  clientName: string;
  categories: MonitorCategory[];
  rules: MonitorRule[];
  category: MonitorCategory | null;
  request: string;
  existingUrls: string[];
  /** 매일 자동 수집 — 하루치 본 수집이라 소스별 통계까지 함께 받는다. */
  daily?: boolean;
}) => {
  const config = ensureHermes();
  const run = await getRunRow(options.runId);
  if (!run) throw new Error("수집 결과를 찾을 수 없어요.");

  const token = await issueCallbackToken({ kind: "run", id: options.runId });
  const url = `${options.origin}/api/monitor/agent/runs`;

  const input = [
    `[모니터링 대시보드 요청] ${options.clientName}`,
    `수집 기간: ${kst(run.since).format("YYYY.MM.DD HH:mm")} ~ ${kst(run.until).format("YYYY.MM.DD HH:mm")} (KST). 이 기간에 게재된 기사만.`,
    `대상 카테고리: ${options.category ? `${options.category.name} (key: ${options.category.key})` : "전체"}`,
    `요청: ${options.request}`,
    "",
    "카테고리:",
    JSON.stringify(options.categories),
    "고객사 규칙(반드시 지켜):",
    JSON.stringify(options.rules.map(({ title, value }) => ({ title, value }))),
    "",
    "네가 가진 뉴스 검색·모니터링 스킬로 기사를 찾고, 원문에서 기자명과 게재 시각을 확인해.",
    "기자는 naver-search-api 스킬의 byline.py로 확인하고, fetch_failed나 not_on_page면 browser_exec로 원문을 열어 확인한 최종 결과를 reporterStatus에 넣어. 원문을 못 열었으면 기자 표기가 없다고 쓰지 마.",
    ...(options.daily
      ? [
          "이 고객사 전용 모니터링 스킬이 있으면 그 스킬의 수집·검증 절차를 그대로 따라.",
          "결과는 다 모은 뒤에 보내. 찾은 기사가 없어도 빈 items로 꼭 보내.",
        ]
      : []),
    "결과는 채팅으로 길게 답하지 말고 아래 API로 보내. 다 보낸 뒤 채팅에는 몇 건 보냈는지만 한 줄로 말해.",
    ITEM_FORMAT,
    curlExample(
      url,
      token,
      options.daily
        ? `{"runId": ${options.runId}, "stats": {"sources": [{"name": "네이버 뉴스", "count": 0}], "blocked": ["접근이 막힌 매체"]}, "items": [ ... ]}`
        : `{"runId": ${options.runId}, "items": [ ... ]}`
    ),
    "",
    `이미 표에 있는 URL(${options.existingUrls.length}건)은 보내지 마:`,
    ...options.existingUrls.slice(0, 200),
  ].join("\n");

  // 결과가 아주 빨리 와도 대기 상태가 먼저 기록되어 있도록 순서를 지킨다.
  await setRunPending(
    options.runId,
    { hermesRunId: "starting", request: options.request },
    null
  );
  try {
    const hermesRunId = await startHermesRun(config, {
      sessionId: toHermesSessionId(config, `monitor-run-${options.runId}-${Date.now()}`),
      input,
    });
    await setRunPending(options.runId, { hermesRunId, request: options.request });
    return hermesRunId;
  } catch (error) {
    await setRunPending(options.runId, null, "하치와레에게 요청하지 못했어요.");
    await setCallbackToken({ kind: "run", id: options.runId }, null);
    throw error;
  }
};

export const startIssueRecount = async (options: {
  origin: string;
  issueId: number;
  title: string;
  keywords: string[];
  brandTerms: string[];
  lastSnapshotAt: string | null;
  isReport: boolean;
  reportRecipient: string;
  reportTemplate: string;
}) => {
  const config = ensureHermes();
  const since = options.lastSnapshotAt
    ? kst(options.lastSnapshotAt).format("YYYY.MM.DD HH:mm")
    : null;
  const token = await issueCallbackToken({ kind: "issue", id: options.issueId });
  const url = `${options.origin}/api/monitor/agent/issues/${options.issueId}/snapshots`;
  const now = kst();

  const input = [
    `[이슈 트래커 집계 요청] ${options.title}`,
    `검색 키워드: ${options.keywords.join(", ") || options.title}`,
    `브랜드 감시어: ${options.brandTerms.join(", ") || "없음"}`,
    since
      ? `집계 구간: ${since} 이후 ~ 지금 (네이버 뉴스 기준, KST)`
      : "집계 구간: 최초 보도부터 지금까지 (네이버 뉴스 기준, KST)",
    ...(options.isReport
      ? [
          `정기 보고용 집계야. 고객사 담당자에게 보낼 보고 초안(reportText)도 써줘. 인사는 '${reportGreeting(options.reportRecipient || "담당 매니저님")}'로 시작해.`,
          ...(options.reportTemplate
            ? [
                `보고 초안은 아래 서식을 그대로 따라 쓰고, 빈칸과 숫자만 이번 집계로 채워:\n${options.reportTemplate}`,
              ]
            : []),
        ]
      : ["중간 확인용 집계야. reportText는 비워도 돼."]),
    "",
    "added = 구간 안에 새로 게재된 관련 기사 수, mediaCount = 매체 수, brandMentions = 감시어가 본문·제목에 나온 기사 수.",
    "lastArticle = 가장 최근 기사. events = 이번 구간에 새로 생긴 중요한 흐름(없으면 빈 배열).",
    `articles = added로 센 기사 전부. 담당자가 화면에서 기사를 직접 확인하는 목록이라 빠뜨리면 안 돼. 손으로 옮겨 적지 말고 스윕 결과 파일에서 코드로 만들어. url은 네이버 링크가 있으면 네이버 링크, media는 매체 이름(모르면 비워), publishedAt은 'YYYY-MM-DD HH:mm'(KST), brandMention은 감시어가 제목·본문에 나왔는지, sentiment는 고객사 입장에서 본 논조(positive | neutral | negative). ${MAX_ISSUE_ARTICLES}건이 넘으면 최신순으로 ${MAX_ISSUE_ARTICLES}건만 보내.`,
    "at(집계 시각)은 보내지 마. 서버가 받은 시각으로 기록해. 기사 시각(lastArticle.time, events.at)은 KST로 써.",
    "결과는 채팅으로 길게 답하지 말고 아래 API로 보내. 보낸 뒤 채팅에는 숫자만 한 줄로 말해.",
    curlExample(
      url,
      token,
      JSON.stringify({
        label: options.isReport
          ? now.format("M/D H시")
          : `${now.format("M/D HH:mm")} 확인`,
        added: 0,
        mediaCount: 0,
        brandMentions: 0,
        lastArticle: { media: "", time: "HH:mm", title: "", url: "" },
        isReport: options.isReport,
        reportText: options.isReport ? "..." : null,
        events: [{ at: "MM.DD HH:mm", text: "", key: false }],
        articles: [
          {
            url: "https://...",
            media: "",
            title: "",
            publishedAt: "YYYY-MM-DD HH:mm",
            brandMention: false,
            sentiment: "neutral",
          },
        ],
      })
    ),
  ].join("\n");

  await setIssuePending(options.issueId, "starting", null);
  try {
    const hermesRunId = await startHermesRun(config, {
      sessionId: toHermesSessionId(
        config,
        `monitor-issue-${options.issueId}-${Date.now()}`
      ),
      input,
    });
    await setIssuePending(options.issueId, hermesRunId);
    return hermesRunId;
  } catch (error) {
    await setIssuePending(options.issueId, null, "하치와레에게 요청하지 못했어요.");
    await setCallbackToken({ kind: "issue", id: options.issueId }, null);
    throw error;
  }
};

const checkFinished = async (hermesRunId: string) => {
  if (hermesRunId === "starting") return null;
  const status = await getHermesRunStatus(getHermesConfig(), hermesRunId);
  if (!status || !TERMINAL.has(status.status)) return null;
  return status.status === "completed"
    ? "하치와레가 결과를 보내지 않고 작업을 끝냈어요. 다시 시도해 주세요."
    : status.error || "하치와레 작업이 중간에 실패했어요.";
};

/**
 * 대기 중인 런의 Hermes 작업이 끝났는데 대기가 남아 있으면 푼다.
 * 결과가 일부라도 왔으면(마지막 묶음만 못 보냈거나 `final`을 빠뜨린 경우) 받은 만큼으로 마감하고,
 * 하나도 안 왔으면 오류를 남긴다.
 */
export const reconcileRunPending = async (runId: number) => {
  const run = await getRunRow(runId);
  if (!run?.pendingHermesRunId || !run.pendingSince) return;
  if (Date.now() - run.pendingSince.valueOf() < GRACE_MS) return;
  if (missingHermesEnv().length) return;
  const error = await checkFinished(run.pendingHermesRunId);
  if (!error) return;
  const received = await countRunItemsSince(runId, run.pendingSince);
  await setRunPending(runId, null, received > 0 ? null : error);
};

export const reconcileIssuePending = async (issueId: number) => {
  const issue = await getIssueRow(issueId);
  if (!issue?.pendingHermesRunId || !issue.pendingSince) return;
  if (Date.now() - issue.pendingSince.valueOf() < GRACE_MS) return;
  if (missingHermesEnv().length) return;
  const error = await checkFinished(issue.pendingHermesRunId);
  if (error) await setIssuePending(issueId, null, error);
};
