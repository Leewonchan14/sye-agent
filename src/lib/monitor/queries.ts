"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import type { SetupDraftState } from "@/lib/monitor/draft";
import type { MonitorProgress } from "@/lib/monitor/progress-stages";
import type {
  MonitorCategory,
  MonitorClientPayload,
  MonitorClientView,
  MonitorImportance,
  MonitorIssueArticleView,
  MonitorIssuePayload,
  MonitorOverview,
  MonitorRule,
  MonitorSentiment,
  MonitorStatsPayload,
  StatsDays,
  StatsScope,
} from "@/lib/monitor/types";

/** 쿼리 키 — 무효화를 한 곳에서 관리한다. */
/**
 * 작업이 없을 때의 확인 간격. 화면을 열어 둔 사이 자동 수집이 시작·완료돼도 따라 바뀌게 한다.
 * (앱 기본값은 창 포커스 때 다시 불러오지 않으므로 모니터링 쿼리만 켠다.)
 */
const IDLE_REFETCH_MS = 60_000;

export const monitorKeys = {
  all: ["monitor"] as const,
  overview: () => [...monitorKeys.all, "overview"] as const,
  client: (clientId: number, runId?: number) =>
    [...monitorKeys.all, "client", clientId, runId ?? "latest"] as const,
  clientAll: (clientId: number) => [...monitorKeys.all, "client", clientId] as const,
  stats: (
    clientId: number,
    filter?: { days: StatsDays; scope: StatsScope; category: string | null }
  ) =>
    filter
      ? ([...monitorKeys.all, "stats", clientId, filter] as const)
      : ([...monitorKeys.all, "stats", clientId] as const),
  issue: (issueId: number) => [...monitorKeys.all, "issue", issueId] as const,
};

const readError = async (res: Response) => {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? "요청을 처리하지 못했어요.";
};

/** 같은 출처 요청이라 로그인 쿠키가 함께 간다. */
const api = async <T>(
  url: string,
  init?: { method?: string; body?: unknown }
): Promise<T> => {
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers:
      init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as T;
};

export const useMonitorOverview = () => {
  return useQuery({
    queryKey: monitorKeys.overview(),
    queryFn: () => api<MonitorOverview>("/api/monitor"),
    // 수집·집계가 돌고 있으면 첫 화면 요약도 따라 바뀌게 한다.
    // 쉬는 동안에도 자동 수집(예약 스크립트)이 언제든 시작하므로 1분마다 확인한다.
    refetchInterval: (query) =>
      query.state.data?.clients.some((c) => c.latestRun?.pending) ||
      query.state.data?.issues.some((i) => i.pending)
        ? 15_000
        : IDLE_REFETCH_MS,
    refetchOnWindowFocus: true,
  });
};

/** 대기 중인 Hermes 작업이 있으면 10초마다, 없어도 1분마다 다시 불러온다. */
export const useMonitorClient = (clientId: number, runId?: number) => {
  return useQuery({
    queryKey: monitorKeys.client(clientId, runId),
    queryFn: () =>
      api<MonitorClientPayload>(
        `/api/monitor/clients/${clientId}${runId ? `?runId=${runId}` : ""}`
      ),
    // 다른 날짜로 넘어갈 때 화면이 비지 않게 이전 내용을 유지한다.
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      query.state.data?.run?.pendingSince ? 10_000 : IDLE_REFETCH_MS,
    refetchOnWindowFocus: true,
  });
};

/** 매체·기자 통계. 기간·범위를 바꿔도 이전 표를 유지한다. */
export const useMonitorStats = (
  clientId: number,
  filter: { days: StatsDays; scope: StatsScope; category: string | null }
) => {
  const params = new URLSearchParams({
    days: String(filter.days),
    scope: filter.scope,
    ...(filter.category ? { category: filter.category } : {}),
  });
  return useQuery({
    queryKey: monitorKeys.stats(clientId, filter),
    queryFn: () =>
      api<MonitorStatsPayload>(`/api/monitor/clients/${clientId}/stats?${params}`),
    placeholderData: keepPreviousData,
  });
};

export const useMonitorIssue = (issueId: number) => {
  return useQuery({
    queryKey: monitorKeys.issue(issueId),
    queryFn: () => api<MonitorIssuePayload>(`/api/monitor/issues/${issueId}`),
    refetchInterval: (query) =>
      query.state.data?.issue.pendingSince ? 10_000 : IDLE_REFETCH_MS,
    refetchOnWindowFocus: true,
  });
};

/** 집계 한 번의 기사 목록. 집계가 끝나면 바뀌지 않으므로 한 번만 읽는다. */
export const useIssueArticles = (
  issueId: number,
  snapshotId: number,
  enabled: boolean
) => {
  return useQuery({
    queryKey: [...monitorKeys.issue(issueId), "articles", snapshotId],
    queryFn: () =>
      api<{ articles: MonitorIssueArticleView[] }>(
        `/api/monitor/issues/${issueId}/snapshots/${snapshotId}/articles`
      ),
    enabled,
    staleTime: Infinity,
  });
};

/** 돌고 있는 수집·집계의 진행 상황을 5초마다 읽는다. */
export const useMonitorProgress = (kind: "run" | "issue", id: number) => {
  return useQuery({
    queryKey: [...monitorKeys.all, "progress", kind, id],
    queryFn: () =>
      api<{ progress: MonitorProgress | null }>(
        `/api/monitor/progress?kind=${kind}&id=${id}`
      ),
    refetchInterval: 5_000,
  });
};

/** 설정 초안을 2초마다 확인한다. 끝나면 멈춘다. */
export const useSetupDraft = (draftId: string | null) => {
  return useQuery({
    queryKey: [...monitorKeys.all, "draft", draftId],
    queryFn: () => api<SetupDraftState>(`/api/monitor/drafts/${draftId}`),
    enabled: Boolean(draftId),
    refetchInterval: (query) =>
      !query.state.data || query.state.data.status === "running" ? 2_000 : false,
  });
};

export const useMonitorMutations = (clientId?: number) => {
  const qc = useQueryClient();
  const refreshClient = () => {
    if (clientId) {
      qc.invalidateQueries({ queryKey: monitorKeys.clientAll(clientId) });
      qc.invalidateQueries({ queryKey: monitorKeys.stats(clientId) });
    }
    qc.invalidateQueries({ queryKey: monitorKeys.overview() });
  };
  const onError = (error: Error) => toast.error(error.message);

  const updateItem = useMutation({
    mutationFn: (v: {
      id: number;
      included?: boolean;
      category?: string | null;
      subcategory?: string | null;
      sentiment?: MonitorSentiment | null;
      importance?: MonitorImportance | null;
    }) => {
      const { id, ...body } = v;
      return api(`/api/monitor/items/${id}`, { method: "PATCH", body });
    },
    // 체크박스는 바로 반응하도록 낙관적으로 갱신한다.
    onMutate: async (v) => {
      if (!clientId) return;
      await qc.cancelQueries({ queryKey: monitorKeys.clientAll(clientId) });
      const snapshots = qc.getQueriesData<MonitorClientPayload>({
        queryKey: monitorKeys.clientAll(clientId),
      });
      snapshots.forEach(([key, data]) => {
        if (!data) return;
        qc.setQueryData<MonitorClientPayload>(key, {
          ...data,
          items: data.items.map((i) =>
            i.id === v.id
              ? {
                  ...i,
                  ...v,
                  ...(v.category ? { excludedReason: null, excludedRule: null } : {}),
                }
              : i
          ),
        });
      });
      return { snapshots };
    },
    onError: (error, _v, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
      onError(error);
    },
    onSettled: refreshClient,
  });

  const banMedia = useMutation({
    mutationFn: (v: { runId: number; media: string }) =>
      api(`/api/monitor/runs/${v.runId}/ban`, {
        method: "POST",
        body: { media: v.media },
      }),
    onSuccess: (_d, v) => toast.success(`'${v.media}'를 제외 매체에 추가했어요.`),
    onError,
    onSettled: refreshClient,
  });

  const markReported = useMutation({
    mutationFn: (v: { runId: number; reportText: string }) =>
      api(`/api/monitor/runs/${v.runId}/report`, {
        method: "POST",
        body: { reportText: v.reportText },
      }),
    onError,
    onSettled: refreshClient,
  });

  const unmarkReported = useMutation({
    mutationFn: (runId: number) =>
      api(`/api/monitor/runs/${runId}/report`, { method: "DELETE" }),
    onSuccess: () => toast.success("보고 전으로 되돌렸어요. 다음 수집에서 다시 모아요."),
    onError,
    onSettled: refreshClient,
  });

  const collectNow = useMutation({
    mutationFn: (id: number) =>
      api(`/api/monitor/clients/${id}/collect`, { method: "POST" }),
    onSuccess: () => toast.success("에이전트에게 맡겼어요. 몇 분 뒤 기사가 쌓여요."),
    onError,
    onSettled: refreshClient,
  });

  const askMore = useMutation({
    mutationFn: (v: { runId: number; category?: string; request: string }) =>
      api(`/api/monitor/runs/${v.runId}/more`, {
        method: "POST",
        body: { category: v.category, request: v.request },
      }),
    onSuccess: () => toast.success("에이전트에게 맡겼어요. 찾는 대로 표에 추가돼요."),
    onError,
    onSettled: refreshClient,
  });

  const updateClient = useMutation({
    mutationFn: (v: {
      id: number;
      categories?: MonitorCategory[];
      rules?: MonitorRule[];
      reportTitle?: string;
      greeting?: string;
      closing?: string;
      autoCollect?: boolean;
      collectTime?: string | null;
      weekdaysOnly?: boolean;
    }) => {
      const { id, ...body } = v;
      return api(`/api/monitor/clients/${id}`, { method: "PATCH", body });
    },
    // 규칙 순서 바꾸기·연속 수정이 이전 값 위에 덮이지 않도록 낙관적으로 갱신한다.
    onMutate: async (v) => {
      if (!clientId) return;
      await qc.cancelQueries({ queryKey: monitorKeys.clientAll(clientId) });
      const snapshots = qc.getQueriesData<MonitorClientPayload>({
        queryKey: monitorKeys.clientAll(clientId),
      });
      const patch: Partial<MonitorClientView> = { ...v };
      delete patch.id;
      snapshots.forEach(([key, data]) => {
        if (!data) return;
        qc.setQueryData<MonitorClientPayload>(key, {
          ...data,
          client: { ...data.client, ...patch },
        });
      });
      return { snapshots };
    },
    onError: (error, _v, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
      onError(error);
    },
    onSettled: refreshClient,
  });

  return {
    updateItem,
    banMedia,
    markReported,
    unmarkReported,
    collectNow,
    askMore,
    updateClient,
  };
};

export const useIssueMutations = (issueId: number) => {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: monitorKeys.issue(issueId) });
    qc.invalidateQueries({ queryKey: monitorKeys.overview() });
  };
  const onError = (error: Error) => toast.error(error.message);

  const recount = useMutation({
    mutationFn: (isReport: boolean) =>
      api(`/api/monitor/issues/${issueId}/recount`, {
        method: "POST",
        body: { isReport },
      }),
    onSuccess: () => toast.success("집계를 시작했어요. 끝나면 화면이 갱신돼요."),
    onError,
    onSettled: refresh,
  });

  const updateIssue = useMutation({
    mutationFn: (body: {
      title?: string;
      keywords?: string[];
      brandTerms?: string[];
      isActive?: boolean;
      collectStart?: string;
      collectGapMinutes?: number;
      reportRecipient?: string;
      reportTemplate?: string;
    }) => api(`/api/monitor/issues/${issueId}`, { method: "PATCH", body }),
    onError,
    onSettled: refresh,
  });

  return { recount, updateIssue };
};

export const useSetupMutations = () => {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: monitorKeys.overview() });
  const onError = (error: Error) => toast.error(error.message);

  const createClient = useMutation({
    mutationFn: (body: {
      name: string;
      categories: MonitorCategory[];
      rules: MonitorRule[];
      weekdaysOnly: boolean;
      collectNow: boolean;
    }) =>
      api<{ client: { id: number }; collectError: string | null }>(
        "/api/monitor/clients",
        { method: "POST", body }
      ),
    onError,
    onSettled: refresh,
  });

  const createIssue = useMutation({
    mutationFn: (body: {
      title: string;
      clientId: number | null;
      keywords: string[];
      brandTerms: string[];
    }) => api<{ issue: { id: number } }>("/api/monitor/issues", { method: "POST", body }),
    onError,
    onSettled: refresh,
  });

  const startDraft = useMutation({
    mutationFn: (body: { name: string; request: string }) =>
      api<{ draftId: string }>("/api/monitor/drafts", { method: "POST", body }),
    onError,
  });

  return { createClient, createIssue, startDraft };
};
