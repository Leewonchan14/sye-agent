"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuthStore } from "@/lib/auth-store";
import type {
  MonitorCategory,
  MonitorClientPayload,
  MonitorClientView,
  MonitorIssuePayload,
  MonitorOverview,
  MonitorRule,
} from "@/lib/monitor/types";

/** 쿼리 키 — 무효화를 한 곳에서 관리한다. */
export const monitorKeys = {
  all: ["monitor"] as const,
  overview: () => [...monitorKeys.all, "overview"] as const,
  client: (clientId: number, runId?: number) =>
    [...monitorKeys.all, "client", clientId, runId ?? "latest"] as const,
  clientAll: (clientId: number) => [...monitorKeys.all, "client", clientId] as const,
  issue: (issueId: number) => [...monitorKeys.all, "issue", issueId] as const,
};

const readError = async (res: Response) => {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? "요청을 처리하지 못했어요.";
};

const useApi = () => {
  const token = useAuthStore((s) => s.token) ?? "";
  return async <T>(
    url: string,
    init?: { method?: string; body?: unknown }
  ): Promise<T> => {
    const res = await fetch(url, {
      method: init?.method ?? "GET",
      headers: {
        "x-auth-token": token,
        ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    if (!res.ok) throw new Error(await readError(res));
    return (await res.json()) as T;
  };
};

export const useMonitorOverview = () => {
  const api = useApi();
  return useQuery({
    queryKey: monitorKeys.overview(),
    queryFn: () => api<MonitorOverview>("/api/monitor"),
  });
};

/** 대기 중인 Hermes 작업이 있으면 10초마다 다시 불러온다. */
export const useMonitorClient = (clientId: number, runId?: number) => {
  const api = useApi();
  return useQuery({
    queryKey: monitorKeys.client(clientId, runId),
    queryFn: () =>
      api<MonitorClientPayload>(
        `/api/monitor/clients/${clientId}${runId ? `?runId=${runId}` : ""}`
      ),
    refetchInterval: (query) => (query.state.data?.run?.pendingSince ? 10_000 : false),
  });
};

export const useMonitorIssue = (issueId: number) => {
  const api = useApi();
  return useQuery({
    queryKey: monitorKeys.issue(issueId),
    queryFn: () => api<MonitorIssuePayload>(`/api/monitor/issues/${issueId}`),
    refetchInterval: (query) => (query.state.data?.issue.pendingSince ? 10_000 : false),
  });
};

export const useMonitorMutations = (clientId?: number) => {
  const api = useApi();
  const qc = useQueryClient();
  const refreshClient = () => {
    if (clientId) qc.invalidateQueries({ queryKey: monitorKeys.clientAll(clientId) });
    qc.invalidateQueries({ queryKey: monitorKeys.overview() });
  };
  const onError = (error: Error) => toast.error(error.message);

  const updateItem = useMutation({
    mutationFn: (v: {
      id: number;
      included?: boolean;
      category?: string | null;
      subcategory?: string | null;
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

  const askMore = useMutation({
    mutationFn: (v: { runId: number; category?: string; request: string }) =>
      api(`/api/monitor/runs/${v.runId}/more`, {
        method: "POST",
        body: { category: v.category, request: v.request },
      }),
    onSuccess: () => toast.success("하치와레에게 맡겼어요. 찾는 대로 표에 추가돼요."),
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

  return { updateItem, banMedia, markReported, askMore, updateClient };
};

export const useIssueMutations = (issueId: number) => {
  const api = useApi();
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
    }) => api(`/api/monitor/issues/${issueId}`, { method: "PATCH", body }),
    onError,
    onSettled: refresh,
  });

  return { recount, updateIssue };
};

export const useSetupMutations = () => {
  const api = useApi();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: monitorKeys.overview() });
  const onError = (error: Error) => toast.error(error.message);

  const createPresets = useMutation({
    mutationFn: () => api("/api/monitor", { method: "POST" }),
    onSuccess: () => toast.success("기본 고객사를 만들었어요."),
    onError,
    onSettled: refresh,
  });

  const createClient = useMutation({
    mutationFn: (body: { name: string; slug: string }) =>
      api<{ client: { id: number } }>("/api/monitor/clients", { method: "POST", body }),
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

  return { createPresets, createClient, createIssue };
};
