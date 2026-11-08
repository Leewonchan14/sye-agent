import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  max,
  or,
  sql,
} from "drizzle-orm";

import { getDb, schema } from "@/lib/db/db";
import { kst } from "@/lib/kst";
import { MONITOR_CLIENT_PRESETS } from "@/lib/monitor/presets";
import { normalizeRule } from "@/lib/monitor/rules";
import {
  DAILY_COLLECT_REQUEST,
  issueCollectSlot,
  nextCollectAt,
} from "@/lib/monitor/schedule";
import type {
  AgentRunInput,
  AgentSnapshotInput,
  MonitorCategory,
  MonitorClientPayload,
  MonitorClientView,
  MonitorIssueEvent,
  MonitorIssuePayload,
  MonitorItemView,
  MonitorOverview,
  MonitorRule,
  MonitorRunStats,
  MonitorRunView,
  MonitorUsage,
} from "@/lib/monitor/types";
import { REPORTER_GAPS } from "@/lib/monitor/types";

const {
  monitorClients: clientsT,
  monitorRuns: runsT,
  monitorArticles: articlesT,
  monitorItems: itemsT,
  monitorIssues: issuesT,
  monitorIssueSnapshots: snapsT,
} = schema;

/** 사용자에게 그대로 보여줄 수 있는 검증 오류 */
export class MonitorError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}

/** 콜백 토큰 유효 시간 — 긴 모니터링 런도 넉넉히 덮는다. */
const CALLBACK_TOKEN_TTL_MS = 3 * 60 * 60 * 1000;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

const parseDate = (value: string | null | undefined, field: string): Date | null => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.valueOf()))
    throw new MonitorError(`${field} 날짜 형식이 올바르지 않아요.`);
  return d;
};

/* ───────────────────────── 개요 ───────────────────────── */

export const getMonitorOverview = async (): Promise<MonitorOverview> => {
  const db = getDb();
  const clients = await db
    .select()
    .from(clientsT)
    .orderBy(asc(clientsT.sortOrder), asc(clientsT.id));

  const latestRuns = clients.length
    ? await db
        .selectDistinctOn([runsT.clientId], {
          id: runsT.id,
          clientId: runsT.clientId,
          until: runsT.until,
          reportedAt: runsT.reportedAt,
          pendingHermesRunId: runsT.pendingHermesRunId,
          lastError: runsT.lastError,
          collectKey: runsT.collectKey,
        })
        .from(runsT)
        .where(
          inArray(
            runsT.clientId,
            clients.map((c) => c.id)
          )
        )
        .orderBy(runsT.clientId, desc(runsT.until), desc(runsT.id))
    : [];

  const counts = latestRuns.length
    ? await db
        .select({ runId: itemsT.runId, n: sql<number>`count(*)::int` })
        .from(itemsT)
        .where(
          and(
            inArray(
              itemsT.runId,
              latestRuns.map((r) => r.id)
            ),
            eq(itemsT.included, true),
            eq(itemsT.isLead, true),
            isNotNull(itemsT.category)
          )
        )
        .groupBy(itemsT.runId)
    : [];

  const issues = await db
    .select({
      id: issuesT.id,
      title: issuesT.title,
      isActive: issuesT.isActive,
      collectStart: issuesT.collectStart,
      collectGapMinutes: issuesT.collectGapMinutes,
      pendingHermesRunId: issuesT.pendingHermesRunId,
      clientName: clientsT.name,
      totalAdded: sql<number>`coalesce((select sum(${snapsT.added}) from ${snapsT} where ${snapsT.issueId} = ${issuesT.id} and ${snapsT.isReport}), 0)::int`,
      brandMentions: sql<number>`coalesce((select sum(${snapsT.brandMentions}) from ${snapsT} where ${snapsT.issueId} = ${issuesT.id} and ${snapsT.isReport}), 0)::int`,
    })
    .from(issuesT)
    .leftJoin(clientsT, eq(issuesT.clientId, clientsT.id))
    .orderBy(desc(issuesT.isActive), desc(issuesT.createdAt));

  return {
    clients: clients.map((c) => {
      const run = latestRuns.find((r) => r.clientId === c.id);
      const view = toClientView(c);
      const includedCount = run ? (counts.find((x) => x.runId === run.id)?.n ?? 0) : 0;
      return {
        autoCollect: c.autoCollect,
        nextCollectAt: c.autoCollect
          ? nextCollectAt(
              view,
              run?.collectKey === kst().format("YYYY-MM-DD")
            ).toISOString()
          : null,
        id: c.id,
        slug: c.slug,
        name: c.name,
        latestRun: run
          ? {
              id: run.id,
              until: run.until.toISOString(),
              includedCount,
              reportedAt: iso(run.reportedAt),
              pending: Boolean(run.pendingHermesRunId),
              failed: Boolean(run.lastError) && includedCount === 0,
            }
          : null,
      };
    }),
    issues: issues.map(
      ({ collectStart, collectGapMinutes, pendingHermesRunId, ...issue }) => ({
        ...issue,
        pending: Boolean(pendingHermesRunId),
        nextCollectAt: issue.isActive
          ? issueCollectSlot({ collectStart, collectGapMinutes }).next.toISOString()
          : null,
      })
    ),
  };
};

/* ───────────────────────── 고객사 ───────────────────────── */

const toClientView = (row: typeof clientsT.$inferSelect): MonitorClientView => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  categories: row.categories as MonitorCategory[],
  rules: (row.rules as MonitorRule[]).map(normalizeRule),
  reportTitle: row.reportTitle,
  greeting: row.greeting,
  closing: row.closing,
  autoCollect: row.autoCollect,
  collectTime: row.collectTime,
  weekdaysOnly: row.weekdaysOnly,
});

/** 기본 고객사(홍콩관광청·파나소닉코리아)를 만든다. 이미 있는 slug는 건너뛴다. */
export const createPresetClients = async () => {
  const db = getDb();
  await db
    .insert(clientsT)
    .values(MONITOR_CLIENT_PRESETS.map((p, i) => ({ ...p, sortOrder: i })))
    .onConflictDoNothing({ target: clientsT.slug });
};

/** 화면 등록은 사람이 고를 필요 없는 식별자를 자동으로 만든다. */
const newClientSlug = () => `client-${Date.now().toString(36)}`;

export const createMonitorClient = async (input: {
  name: string;
  slug?: string;
  categories?: MonitorCategory[];
  rules?: MonitorRule[];
  weekdaysOnly?: boolean;
}) => {
  const db = getDb();
  const [row] = await db
    .insert(clientsT)
    .values({
      name: input.name,
      slug: input.slug ?? newClientSlug(),
      categories: input.categories ?? [
        { key: "main", name: `${input.name} 관련 보도`, goal: null },
      ],
      rules: input.rules ?? [],
      weekdaysOnly: input.weekdaysOnly ?? true,
      reportTitle: `[${input.name}] Daily Monitoring_{date}`,
      sortOrder: 100,
    })
    .returning();
  return toClientView(row);
};

export const getClientView = async (id: number) => {
  const db = getDb();
  const [row] = await db.select().from(clientsT).where(eq(clientsT.id, id)).limit(1);
  if (!row) throw new MonitorError("고객사를 찾을 수 없어요.", 404);
  return toClientView(row);
};

export const updateMonitorClient = async (
  id: number,
  patch: Partial<
    Pick<
      MonitorClientView,
      | "name"
      | "categories"
      | "rules"
      | "reportTitle"
      | "greeting"
      | "closing"
      | "autoCollect"
      | "collectTime"
      | "weekdaysOnly"
    >
  >
) => {
  const db = getDb();
  const [row] = await db
    .update(clientsT)
    .set(patch)
    .where(eq(clientsT.id, id))
    .returning();
  if (!row) throw new MonitorError("고객사를 찾을 수 없어요.", 404);
  return toClientView(row);
};

const toRunView = (row: typeof runsT.$inferSelect): MonitorRunView => ({
  id: row.id,
  since: row.since.toISOString(),
  until: row.until.toISOString(),
  stats: row.stats as MonitorRunStats,
  reportText: row.reportText,
  reportedAt: iso(row.reportedAt),
  pendingRequest: row.pendingHermesRunId ? row.pendingRequest : null,
  pendingSince: row.pendingHermesRunId ? iso(row.pendingSince) : null,
  lastError: row.lastError,
  createdAt: iso(row.createdAt),
});

export const getRunRow = async (runId: number) => {
  const db = getDb();
  const [row] = await db.select().from(runsT).where(eq(runsT.id, runId)).limit(1);
  return row ?? null;
};

/** 고객사 화면 데이터. runId가 없으면 가장 최근 런을 보여준다. */
export const getMonitorClientPayload = async (
  clientId: number,
  runId?: number
): Promise<MonitorClientPayload> => {
  const db = getDb();
  const [client] = await db
    .select()
    .from(clientsT)
    .where(eq(clientsT.id, clientId))
    .limit(1);
  if (!client) throw new MonitorError("고객사를 찾을 수 없어요.", 404);

  const runs = await db
    .select({
      id: runsT.id,
      since: runsT.since,
      until: runsT.until,
      reportedAt: runsT.reportedAt,
      pendingHermesRunId: runsT.pendingHermesRunId,
      collectKey: runsT.collectKey,
      lastError: runsT.lastError,
    })
    .from(runsT)
    .where(eq(runsT.clientId, clientId))
    .orderBy(desc(runsT.until), desc(runsT.id))
    .limit(30);

  const runItemCounts = new Set(
    runs.length
      ? (
          await db
            .selectDistinct({ runId: itemsT.runId })
            .from(itemsT)
            .where(
              inArray(
                itemsT.runId,
                runs.map((r) => r.id)
              )
            )
        ).map((r) => r.runId)
      : []
  );

  const runCounts = runs.length
    ? await db
        .select({ runId: itemsT.runId, n: sql<number>`count(*)::int` })
        .from(itemsT)
        .where(
          and(
            inArray(
              itemsT.runId,
              runs.map((r) => r.id)
            ),
            eq(itemsT.included, true),
            isNotNull(itemsT.category),
            or(eq(itemsT.isLead, true), isNull(itemsT.dupGroup))
          )
        )
        .groupBy(itemsT.runId)
    : [];

  const targetId = runId ?? runs[0]?.id;
  const run = targetId ? await getRunRow(targetId) : null;
  if (run && run.clientId !== clientId)
    throw new MonitorError("다른 고객사의 수집 결과예요.");

  const items: MonitorItemView[] = run
    ? (
        await db
          .select({
            id: itemsT.id,
            articleId: itemsT.articleId,
            category: itemsT.category,
            subcategory: itemsT.subcategory,
            score: itemsT.score,
            reason: itemsT.reason,
            excludedReason: itemsT.excludedReason,
            excludedRule: itemsT.excludedRule,
            included: itemsT.included,
            dupGroup: itemsT.dupGroup,
            isLead: itemsT.isLead,
            flags: itemsT.flags,
            url: articlesT.url,
            naverUrl: articlesT.naverUrl,
            media: articlesT.media,
            title: articlesT.title,
            reporter: articlesT.reporter,
            publishedAt: articlesT.publishedAt,
            summary: articlesT.summary,
          })
          .from(itemsT)
          .innerJoin(articlesT, eq(itemsT.articleId, articlesT.id))
          .where(eq(itemsT.runId, run.id))
          .orderBy(asc(itemsT.sortOrder), desc(articlesT.publishedAt))
      ).map((i) => ({ ...i, publishedAt: iso(i.publishedAt) }))
    : [];

  return {
    client: toClientView(client),
    run: run ? toRunView(run) : null,
    items,
    runs: runs.map((r) => ({
      id: r.id,
      since: r.since.toISOString(),
      until: r.until.toISOString(),
      reportedAt: iso(r.reportedAt),
      includedCount: runCounts.find((c) => c.runId === r.id)?.n ?? 0,
      pending: Boolean(r.pendingHermesRunId),
      failed: Boolean(r.lastError) && !runItemCounts.has(r.id),
    })),
    collectedToday: runs.some((r) => r.collectKey === kst().format("YYYY-MM-DD")),
  };
};

/* ───────────────────────── 매일 자동 수집 ───────────────────────── */

/** 자동 수집이 켜진 고객사와 이 날짜 수집을 이미 시작했는지 */
export const listAutoCollectClients = async (collectKey: string) => {
  const db = getDb();
  const rows = await db
    .select({ client: clientsT, runId: runsT.id })
    .from(clientsT)
    .leftJoin(
      runsT,
      and(eq(runsT.clientId, clientsT.id), eq(runsT.collectKey, collectKey))
    )
    .where(eq(clientsT.autoCollect, true))
    .orderBy(asc(clientsT.sortOrder), asc(clientsT.id));
  return rows.map((r) => ({
    client: toClientView(r.client),
    createdAt: r.client.createdAt,
    collected: r.runId !== null,
  }));
};

/** 이 날짜의 수집을 선점한다. 이미 누가 시작했으면 null — 동시에 불려도 한 번만 시작된다. */
export const claimDailyRun = async (input: {
  clientId: number;
  collectKey: string;
  since: Date;
  until: Date;
}) => {
  const db = getDb();
  const [row] = await db
    .insert(runsT)
    .values({ ...input, autoState: "running" })
    .onConflictDoNothing({ target: [runsT.clientId, runsT.collectKey] })
    .returning();
  return row?.id ?? null;
};

/**
 * "지금 한 번 수집"의 빈 수집을 만든다. 오늘 자동 수집이 아직이면 그것으로 쳐서 두 번 돌지 않게 한다.
 * 돌고 있는 수집이 있으면 막는다.
 */
export const createCollectNowRun = async (input: {
  clientId: number;
  collectKey: string;
  since: Date;
  until: Date;
}) => {
  const db = getDb();
  const [busy] = await db
    .select({ id: runsT.id })
    .from(runsT)
    .where(and(eq(runsT.clientId, input.clientId), isNotNull(runsT.pendingHermesRunId)))
    .limit(1);
  if (busy) throw new MonitorError("이미 하치와레가 모으고 있어요.", 409);

  const claimed = await claimDailyRun(input);
  if (claimed) return claimed;
  const [row] = await db
    .insert(runsT)
    .values({
      clientId: input.clientId,
      since: input.since,
      until: input.until,
      autoState: "running",
    })
    .returning();
  return row.id;
};

/** 아직 끝나지 않았다고 기록된 자동 수집과 그 고객사 */
export const listActiveAutoRuns = async () => {
  const db = getDb();
  const rows = await db
    .select({ run: runsT, client: clientsT })
    .from(runsT)
    .innerJoin(clientsT, eq(runsT.clientId, clientsT.id))
    .where(inArray(runsT.autoState, ["running", "retried"]))
    .orderBy(asc(runsT.id));
  return rows.map((r) => ({ run: r.run, client: toClientView(r.client) }));
};

/** 자동 수집 상태를 넘긴다. 다른 쪽이 먼저 넘겼으면 false — 재시도·알림이 한 번만 일어난다. */
export const advanceRunAutoState = async (runId: number, from: string, to: string) => {
  const db = getDb();
  const rows = await db
    .update(runsT)
    .set({ autoState: to })
    .where(and(eq(runsT.id, runId), eq(runsT.autoState, from)))
    .returning();
  return rows.length > 0;
};

export const advanceIssueAutoState = async (
  issueId: number,
  from: string,
  to: string | null
) => {
  const db = getDb();
  const rows = await db
    .update(issuesT)
    .set({ autoState: to })
    .where(and(eq(issuesT.id, issueId), eq(issuesT.autoState, from)))
    .returning();
  return rows.length > 0;
};

/** 리포트에 담기는 대표 기사 수 */
export const countRunLeads = async (runId: number) => {
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(itemsT)
    .where(
      and(
        eq(itemsT.runId, runId),
        eq(itemsT.included, true),
        isNotNull(itemsT.category),
        or(eq(itemsT.isLead, true), isNull(itemsT.dupGroup))
      )
    );
  return row.n;
};

export const getLatestSnapshot = async (issueId: number) => {
  const db = getDb();
  const [row] = await db
    .select()
    .from(snapsT)
    .where(eq(snapsT.issueId, issueId))
    .orderBy(desc(snapsT.at), desc(snapsT.id))
    .limit(1);
  return row ?? null;
};

/** 하치와레에게 넘기지 못한 빈 수집을 지워서 다음 확인 때 다시 시도하게 한다. */
export const releaseDailyRun = async (runId: number) => {
  const db = getDb();
  await db.delete(runsT).where(eq(runsT.id, runId));
};

/* ───────────────────────── 기사 선별 ───────────────────────── */

export const updateMonitorItem = async (
  id: number,
  patch: { included?: boolean; category?: string | null; subcategory?: string | null }
) => {
  const db = getDb();
  const set: Partial<typeof itemsT.$inferInsert> = { ...patch };
  // 제외 후보를 카테고리로 되살리면 제외 사유를 지운다.
  if (patch.category) {
    set.excludedReason = null;
    set.excludedRule = null;
  }
  const [row] = await db.update(itemsT).set(set).where(eq(itemsT.id, id)).returning();
  if (!row) throw new MonitorError("기사를 찾을 수 없어요.", 404);
  return row;
};

/** 같은 매체의 기사를 이 런에서 모두 빼고, 고객사 "제외 매체" 규칙에 추가한다. */
export const banMediaForRun = async (runId: number, media: string) => {
  const db = getDb();
  const run = await getRunRow(runId);
  if (!run) throw new MonitorError("수집 결과를 찾을 수 없어요.", 404);

  const [client] = await db.select().from(clientsT).where(eq(clientsT.id, run.clientId));
  const rules = [...((client.rules as MonitorRule[]) ?? [])];
  const idx = rules.findIndex((r) => r.id === "exclude-media");
  if (idx === -1) {
    rules.push({
      id: "exclude-media",
      title: "제외 매체",
      quote: "",
      kind: "tags",
      value: [media],
    });
  } else {
    const tags = Array.isArray(rules[idx].value) ? (rules[idx].value as string[]) : [];
    if (!tags.includes(media)) rules[idx] = { ...rules[idx], value: [...tags, media] };
  }
  await db.update(clientsT).set({ rules }).where(eq(clientsT.id, client.id));

  const articleIds = db
    .select({ id: articlesT.id })
    .from(articlesT)
    .where(eq(articlesT.media, media));
  await db
    .update(itemsT)
    .set({ included: false })
    .where(and(eq(itemsT.runId, runId), inArray(itemsT.articleId, articleIds)));
};

export const markRunReported = async (runId: number, reportText: string) => {
  const db = getDb();
  await db
    .update(runsT)
    .set({ reportText, reportedAt: new Date() })
    .where(eq(runsT.id, runId));
};

/**
 * 보고 완료를 되돌린다. 이 수집의 기사는 다음 수집에서 다시 집계되고,
 * 이미 들어온 다른 수집에서 "이전에 보고함"으로 빠져 있던 같은 기사도 되살린다.
 */
export const unmarkRunReported = async (runId: number) => {
  const db = getDb();
  const run = await getRunRow(runId);
  if (!run) throw new MonitorError("수집 결과를 찾을 수 없어요.", 404);

  await db
    .update(runsT)
    .set({ reportText: null, reportedAt: null })
    .where(eq(runsT.id, runId));

  const articles = await db
    .selectDistinct({ id: itemsT.articleId })
    .from(itemsT)
    .where(and(eq(itemsT.runId, runId), eq(itemsT.included, true)));
  if (!articles.length) return;

  // 같은 기사를 다른 수집에서도 보고했다면 그대로 둔다.
  const stillReported = await db
    .selectDistinct({ id: itemsT.articleId })
    .from(itemsT)
    .innerJoin(runsT, eq(itemsT.runId, runsT.id))
    .where(
      and(
        eq(runsT.clientId, run.clientId),
        isNotNull(runsT.reportedAt),
        eq(itemsT.included, true),
        inArray(
          itemsT.articleId,
          articles.map((a) => a.id)
        )
      )
    );
  const keep = new Set(stillReported.map((a) => a.id));
  const restore = articles.map((a) => a.id).filter((id) => !keep.has(id));
  if (!restore.length) return;

  await db
    .update(itemsT)
    .set({
      flags: sql`${itemsT.flags} - 'reported'`,
      included: isNotNull(itemsT.category),
    })
    .where(
      and(
        inArray(itemsT.articleId, restore),
        sql`${itemsT.flags} @> '["reported"]'::jsonb`,
        inArray(
          itemsT.runId,
          db.select({ id: runsT.id }).from(runsT).where(eq(runsT.clientId, run.clientId))
        )
      )
    );
};

export const setRunPending = async (
  runId: number,
  pending: { hermesRunId: string; request: string } | null,
  error?: string | null
) => {
  const db = getDb();
  await db
    .update(runsT)
    .set({
      pendingHermesRunId: pending?.hermesRunId ?? null,
      pendingRequest: pending?.request ?? null,
      pendingSince: pending ? new Date() : null,
      ...(error !== undefined ? { lastError: error } : {}),
    })
    .where(eq(runsT.id, runId));
};

/** 콜백 토큰(해시)을 저장한다. 결과가 여러 번 나눠 와도 되도록 만료 시각까지 유효하다. */
export const setCallbackToken = async (
  target: { kind: "run" | "issue"; id: number },
  tokenHash: string | null,
  ttlMs = CALLBACK_TOKEN_TTL_MS
) => {
  const db = getDb();
  const set = {
    callbackTokenHash: tokenHash,
    callbackTokenExpiresAt: tokenHash ? new Date(Date.now() + ttlMs) : null,
  };
  if (target.kind === "run") {
    await db.update(runsT).set(set).where(eq(runsT.id, target.id));
  } else {
    await db.update(issuesT).set(set).where(eq(issuesT.id, target.id));
  }
};

/** 저장된 콜백 토큰 해시와 만료 시각 */
export const getCallbackToken = async (target: { kind: "run" | "issue"; id: number }) => {
  const db = getDb();
  const table = target.kind === "run" ? runsT : issuesT;
  const [row] = await db
    .select({
      hash: table.callbackTokenHash,
      expiresAt: table.callbackTokenExpiresAt,
    })
    .from(table)
    .where(eq(table.id, target.id))
    .limit(1);
  return row ?? null;
};

/* ───────────────────────── Hermes 연동 ───────────────────────── */

/** Hermes가 수집 전에 읽는 고객사 설정 + 최근 보고한 URL(중복 제외용). */
export const getAgentClientContext = async (slug: string) => {
  const db = getDb();
  const [client] = await db
    .select()
    .from(clientsT)
    .where(eq(clientsT.slug, slug))
    .limit(1);
  if (!client) throw new MonitorError(`'${slug}' 고객사가 없어요.`, 404);

  const reported = await db
    .selectDistinct({ url: articlesT.url })
    .from(itemsT)
    .innerJoin(runsT, eq(itemsT.runId, runsT.id))
    .innerJoin(articlesT, eq(itemsT.articleId, articlesT.id))
    .where(
      and(
        eq(runsT.clientId, client.id),
        isNotNull(runsT.reportedAt),
        gte(runsT.until, kst().subtract(14, "day").toDate()),
        eq(itemsT.included, true)
      )
    );

  return { client: toClientView(client), reportedUrls: reported.map((r) => r.url) };
};

const reportedUrlSet = async (clientId: number, excludeRunId?: number) => {
  const db = getDb();
  const rows = await db
    .selectDistinct({ url: articlesT.url })
    .from(itemsT)
    .innerJoin(runsT, eq(itemsT.runId, runsT.id))
    .innerJoin(articlesT, eq(itemsT.articleId, articlesT.id))
    .where(
      and(
        eq(runsT.clientId, clientId),
        isNotNull(runsT.reportedAt),
        eq(itemsT.included, true),
        excludeRunId ? sql`${runsT.id} <> ${excludeRunId}` : undefined
      )
    );
  return new Set(rows.map((r) => r.url));
};

/**
 * Hermes가 보낸 수집 결과를 저장한다.
 * - runId가 있으면 "더 찾기" 결과로 보고 기존 런에 붙인다(new 표시, 대기 상태 해제).
 * - 없으면 client·since·until로 새 런을 만든다.
 * 이미 보고한 기사는 reported 표시 후 기본 제외한다.
 */
/** 카테고리 최대 건수를 넘는 기사를 점수 낮은 순으로 리포트에서 뺀다. 사람이 다시 체크할 수 있다. */
const applyCategoryLimits = async (runId: number, categories: MonitorCategory[]) => {
  const db = getDb();
  for (const { key, maxItems } of categories) {
    if (!maxItems) continue;
    const leads = await db
      .select({ id: itemsT.id })
      .from(itemsT)
      .where(
        and(
          eq(itemsT.runId, runId),
          eq(itemsT.category, key),
          eq(itemsT.included, true),
          or(eq(itemsT.isLead, true), isNull(itemsT.dupGroup))
        )
      )
      .orderBy(desc(itemsT.score), asc(itemsT.sortOrder));
    const overflow = leads.slice(maxItems).map((i) => i.id);
    if (!overflow.length) continue;
    await db
      .update(itemsT)
      .set({
        included: false,
        flags: sql`${itemsT.flags} || '["over-limit"]'::jsonb`,
      })
      .where(inArray(itemsT.id, overflow));
  }
};

const addUsage = (a: MonitorUsage | undefined, b: MonitorUsage): MonitorUsage => ({
  tokens: (a?.tokens ?? 0) + b.tokens,
  tools: (a?.tools ?? 0) + b.tools,
});

export const ingestAgentRun = async (
  input: AgentRunInput,
  usage?: MonitorUsage | null
) => {
  const db = getDb();
  let run: typeof runsT.$inferSelect | null;
  const appending = Boolean(input.runId);

  if (input.runId) {
    run = await getRunRow(input.runId);
    if (!run) throw new MonitorError("runId에 해당하는 수집 결과가 없어요.", 404);
  } else {
    const [client] = await db
      .select()
      .from(clientsT)
      .where(eq(clientsT.slug, input.client!))
      .limit(1);
    if (!client) throw new MonitorError(`'${input.client}' 고객사가 없어요.`, 404);
    [run] = await db
      .insert(runsT)
      .values({
        clientId: client.id,
        since: parseDate(input.since, "since")!,
        until: parseDate(input.until, "until")!,
        stats: input.stats ?? {},
      })
      .returning();
  }

  // 자동 수집의 첫 결과는 그날의 본 수집이라 "새로 찾음" 표시를 붙이지 않는다.
  const flagNew = appending && run.pendingRequest !== DAILY_COLLECT_REQUEST;

  const [client] = await db.select().from(clientsT).where(eq(clientsT.id, run.clientId));
  const skipReported = (client.rules as MonitorRule[]).some(
    (r) => r.id === "skip-reported" && r.value === true
  );
  const reported = skipReported
    ? await reportedUrlSet(run.clientId, run.id)
    : new Set<string>();

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${itemsT.sortOrder}), 0)::int` })
    .from(itemsT)
    .where(eq(itemsT.runId, run.id));

  let inserted = 0;
  for (const [index, item] of input.items.entries()) {
    const [article] = await db
      .insert(articlesT)
      .values({
        url: item.url,
        naverUrl: item.naverUrl ?? null,
        media: item.media,
        title: item.title,
        reporter: item.reporter ?? null,
        publishedAt: parseDate(item.publishedAt, "publishedAt"),
        summary: item.summary ?? null,
      })
      .onConflictDoUpdate({
        target: articlesT.url,
        set: {
          media: item.media,
          title: item.title,
          naverUrl: sql`coalesce(excluded.naver_url, ${articlesT.naverUrl})`,
          reporter: sql`coalesce(excluded.reporter, ${articlesT.reporter})`,
          publishedAt: sql`coalesce(excluded.published_at, ${articlesT.publishedAt})`,
          summary: sql`coalesce(excluded.summary, ${articlesT.summary})`,
        },
      })
      .returning();

    const isReported = reported.has(item.url);
    const flags = [
      ...(item.blocked ? ["blocked"] : []),
      ...(flagNew ? ["new"] : []),
      ...(isReported ? ["reported"] : []),
      ...(item.dupGroup && !item.isLead ? ["dup"] : []),
      ...(!item.reporter && item.reporterStatus && item.reporterStatus !== "found"
        ? [REPORTER_GAPS[item.reporterStatus].flag]
        : []),
    ];
    const excluded = !item.category || Boolean(item.excludedReason);

    const rows = await db
      .insert(itemsT)
      .values({
        runId: run.id,
        articleId: article.id,
        category: excluded ? null : item.category,
        subcategory: item.subcategory ?? null,
        score: item.score,
        reason: item.reason,
        excludedReason: excluded ? (item.excludedReason ?? "카테고리 없음") : null,
        excludedRule: item.excludedRule ?? null,
        included: !excluded && !isReported,
        dupGroup: item.dupGroup ?? null,
        isLead: item.isLead,
        flags,
        sortOrder: maxOrder + index + 1,
      })
      .onConflictDoNothing({ target: [itemsT.runId, itemsT.articleId] })
      .returning();
    inserted += rows.length;
  }

  if (!flagNew) await applyCategoryLimits(run.id, client.categories as MonitorCategory[]);

  if (appending) {
    await setRunPending(run.id, null, null);
    // 소요 시간은 하치와레가 적어 보낸 값 대신 앱이 잰다. "더 찾기"는 본 수집 시간을 덮지 않는다.
    const measured =
      !flagNew && run.pendingSince
        ? { measuredSec: Math.round((Date.now() - run.pendingSince.valueOf()) / 1000) }
        : {};
    if (input.stats || usage || "measuredSec" in measured) {
      const stats = run.stats as MonitorRunStats;
      await db
        .update(runsT)
        .set({
          stats: {
            ...stats,
            ...input.stats,
            ...measured,
            ...(usage && { usage: addUsage(stats.usage, usage) }),
          },
        })
        .where(eq(runsT.id, run.id));
    }
  }

  return { runId: run.id, inserted };
};

/* ───────────────────────── 이슈 트래커 ───────────────────────── */

export const createMonitorIssue = async (input: {
  title: string;
  clientId: number | null;
  keywords: string[];
  brandTerms: string[];
}) => {
  const db = getDb();
  const [row] = await db.insert(issuesT).values(input).returning();
  return row;
};

export const updateMonitorIssue = async (
  id: number,
  patch: Partial<{
    title: string;
    keywords: string[];
    brandTerms: string[];
    isActive: boolean;
    events: MonitorIssueEvent[];
    collectStart: string;
    collectGapMinutes: number;
    lastAutoSlot: string;
    reportRecipient: string;
    reportTemplate: string;
  }>
) => {
  const db = getDb();
  const [row] = await db.update(issuesT).set(patch).where(eq(issuesT.id, id)).returning();
  if (!row) throw new MonitorError("이슈를 찾을 수 없어요.", 404);
  return row;
};

export const getIssueRow = async (id: number) => {
  const db = getDb();
  const [row] = await db.select().from(issuesT).where(eq(issuesT.id, id)).limit(1);
  return row ?? null;
};

/** 자동 집계 대상(감시 중인 이슈)과 직전 정기 보고 시각 */
export const listAutoIssues = async () => {
  const db = getDb();
  const issues = await db
    .select()
    .from(issuesT)
    .where(eq(issuesT.isActive, true))
    .orderBy(asc(issuesT.id));
  if (!issues.length) return [];

  const reports = await db
    .select({ issueId: snapsT.issueId, at: max(snapsT.at) })
    .from(snapsT)
    .where(
      and(
        inArray(
          snapsT.issueId,
          issues.map((i) => i.id)
        ),
        eq(snapsT.isReport, true)
      )
    )
    .groupBy(snapsT.issueId);

  return issues.map((issue) => ({
    issue,
    lastReportAt: iso(reports.find((r) => r.issueId === issue.id)?.at),
  }));
};

/** 이 시각의 자동 집계를 선점한다. 이미 누가 시작했으면 false — 동시에 불려도 한 번만 돈다. */
export const claimIssueSlot = async (issueId: number, slot: string) => {
  const db = getDb();
  const rows = await db
    .update(issuesT)
    .set({ lastAutoSlot: slot, autoState: "running" })
    .where(
      and(
        eq(issuesT.id, issueId),
        or(isNull(issuesT.lastAutoSlot), sql`${issuesT.lastAutoSlot} <> ${slot}`)
      )
    )
    .returning();
  return rows.length > 0;
};

/** 하치와레에게 넘기지 못했으면 선점을 되돌려 다음 확인 때 다시 시도하게 한다. */
export const releaseIssueSlot = async (issueId: number, previous: string | null) => {
  const db = getDb();
  await db
    .update(issuesT)
    .set({ lastAutoSlot: previous, autoState: null })
    .where(eq(issuesT.id, issueId));
};

export const getMonitorIssuePayload = async (
  id: number
): Promise<MonitorIssuePayload> => {
  const db = getDb();
  const [row] = await db
    .select({ issue: issuesT, clientName: clientsT.name })
    .from(issuesT)
    .leftJoin(clientsT, eq(issuesT.clientId, clientsT.id))
    .where(eq(issuesT.id, id))
    .limit(1);
  if (!row) throw new MonitorError("이슈를 찾을 수 없어요.", 404);
  const { issue } = row;

  const snapshots = await db
    .select()
    .from(snapsT)
    .where(eq(snapsT.issueId, id))
    .orderBy(asc(snapsT.at), asc(snapsT.id));

  return {
    issue: {
      id: issue.id,
      title: issue.title,
      clientId: issue.clientId,
      clientName: row.clientName,
      keywords: issue.keywords,
      brandTerms: issue.brandTerms,
      events: issue.events as MonitorIssueEvent[],
      isActive: issue.isActive,
      collectStart: issue.collectStart,
      collectGapMinutes: issue.collectGapMinutes,
      reportRecipient: issue.reportRecipient,
      reportTemplate: issue.reportTemplate,
      pendingSince: issue.pendingHermesRunId ? iso(issue.pendingSince) : null,
      lastError: issue.lastError,
    },
    snapshots: snapshots.map((s) => ({
      id: s.id,
      at: s.at.toISOString(),
      label: s.label,
      added: s.added,
      mediaCount: s.mediaCount,
      brandMentions: s.brandMentions,
      lastArticle:
        s.lastArticle as MonitorIssuePayload["snapshots"][number]["lastArticle"],
      reportText: s.reportText,
      isReport: s.isReport,
      usage: (s.usage as MonitorUsage | null) ?? null,
    })),
  };
};

export const setIssuePending = async (
  id: number,
  hermesRunId: string | null,
  error?: string | null
) => {
  const db = getDb();
  await db
    .update(issuesT)
    .set({
      pendingHermesRunId: hermesRunId,
      pendingSince: hermesRunId ? new Date() : null,
      ...(error !== undefined ? { lastError: error } : {}),
    })
    .where(eq(issuesT.id, id));
};

export const addIssueSnapshot = async (
  issueId: number,
  input: AgentSnapshotInput,
  usage?: MonitorUsage | null
) => {
  const db = getDb();
  const issue = await getIssueRow(issueId);
  if (!issue) throw new MonitorError("이슈를 찾을 수 없어요.", 404);

  const [row] = await db
    .insert(snapsT)
    .values({
      issueId,
      at: parseDate(input.at, "at") ?? new Date(),
      label: input.label,
      added: input.added,
      mediaCount: input.mediaCount ?? null,
      brandMentions: input.brandMentions,
      lastArticle: input.lastArticle ?? null,
      reportText: input.reportText ?? null,
      isReport: input.isReport,
      usage: usage ?? null,
    })
    .returning();

  await db
    .update(issuesT)
    .set({
      pendingHermesRunId: null,
      pendingSince: null,
      lastError: null,
      ...(input.events?.length
        ? { events: [...(issue.events as MonitorIssueEvent[]), ...input.events] }
        : {}),
    })
    .where(eq(issuesT.id, issueId));

  return row;
};
