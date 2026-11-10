"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuthStore } from "@/lib/auth-store";
import type {
  DateOverview,
  DateReaction,
  DateSettings,
  DateSpotView,
} from "@/lib/dates/types";

/** 쉬는 동안에도 아침 자동 조사가 언제든 끝나므로 1분마다 확인한다. */
const IDLE_REFETCH_MS = 60_000;
const PENDING_REFETCH_MS = 10_000;

export const dateKeys = {
  all: ["dates"] as const,
  overview: (day: string | null) =>
    [...dateKeys.all, "overview", day ?? "latest"] as const,
};

const readError = async (res: Response) => {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? "요청을 처리하지 못했어요.";
};

const useApi = () => {
  const token = useAuthStore((s) => s.token) ?? "";
  return async <T>(url: string, init?: { method?: string; body?: unknown }) => {
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

/** day가 null이면 오늘(오늘 조사가 없으면 가장 최근 날) */
export const useDateOverview = (day: string | null) => {
  const api = useApi();
  return useQuery({
    queryKey: dateKeys.overview(day),
    queryFn: () => api<DateOverview>(day ? `/api/dates?day=${day}` : "/api/dates"),
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      query.state.data?.digest?.pending ? PENDING_REFETCH_MS : IDLE_REFETCH_MS,
    refetchOnWindowFocus: true,
  });
};

const patchSpot = (
  data: DateOverview | undefined,
  spotId: number,
  reaction: DateReaction | null
): DateOverview | undefined => {
  if (!data) return data;
  const update = (s: DateSpotView) => (s.id === spotId ? { ...s, reaction } : s);
  const spots = data.digest?.spots.map(update) ?? [];
  const changed =
    spots.find((s) => s.id === spotId) ?? data.liked.find((s) => s.id === spotId);
  const liked = data.liked.filter((s) => s.id !== spotId);
  if (changed && reaction === "like") liked.unshift({ ...changed, reaction });
  return {
    ...data,
    digest: data.digest ? { ...data.digest, spots } : null,
    liked,
  };
};

export const useDateMutations = () => {
  const api = useApi();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: dateKeys.all });

  const collectNow = useMutation({
    mutationFn: () => api<DateOverview>("/api/dates", { method: "POST" }),
    onSuccess: (data) => {
      queryClient.setQueryData(dateKeys.overview(null), data);
      toast.success("하치와레가 인스타그램을 둘러보기 시작했어요.");
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const saveSettings = useMutation({
    mutationFn: (settings: DateSettings) =>
      api<DateOverview>("/api/dates/settings", { method: "PUT", body: settings }),
    onSuccess: () => {
      toast.success("조사 조건을 저장했어요.");
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const react = useMutation({
    mutationFn: ({
      spotId,
      reaction,
    }: {
      spotId: number;
      reaction: DateReaction | null;
    }) =>
      api<{ ok: true }>(`/api/dates/spots/${spotId}`, {
        method: "PATCH",
        body: { reaction },
      }),
    onMutate: async ({ spotId, reaction }) => {
      await queryClient.cancelQueries({ queryKey: dateKeys.all });
      const previous = queryClient.getQueriesData<DateOverview>({
        queryKey: dateKeys.all,
      });
      queryClient.setQueriesData<DateOverview>({ queryKey: dateKeys.all }, (data) =>
        patchSpot(data, spotId, reaction)
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      context?.previous.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(error.message);
    },
    onSettled: refresh,
  });

  return { collectNow, saveSettings, react };
};
