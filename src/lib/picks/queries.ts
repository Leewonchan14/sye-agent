"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuthStore } from "@/lib/auth-store";
import type { CreatePickInput, PickView } from "@/lib/picks/types";

export const pickKeys = {
  all: ["picks"] as const,
  list: () => [...pickKeys.all, "list"] as const,
  detail: (id: number) => [...pickKeys.all, "detail", id] as const,
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

export const usePickHistory = () => {
  const api = useApi();
  return useQuery({
    queryKey: pickKeys.list(),
    queryFn: async () => (await api<{ picks: PickView[] }>("/api/picks")).picks,
    refetchOnWindowFocus: true,
  });
};

/** 다른 폰에서 다시 돌리거나 결정했을 수 있으므로 화면에 돌아오면 다시 읽는다. */
export const usePick = (id: number | null) => {
  const api = useApi();
  return useQuery({
    queryKey: pickKeys.detail(id ?? 0),
    queryFn: () => api<PickView>(`/api/picks/${id}`),
    enabled: id !== null,
    refetchOnWindowFocus: true,
  });
};

export const usePickMutations = () => {
  const api = useApi();
  const qc = useQueryClient();
  const onSaved = (pick: PickView) => {
    qc.setQueryData(pickKeys.detail(pick.id), pick);
    qc.invalidateQueries({ queryKey: pickKeys.list() });
  };
  const onError = (error: Error) => toast.error(error.message);

  const create = useMutation({
    mutationFn: (input: CreatePickInput) =>
      api<PickView>("/api/picks", { method: "POST", body: input }),
    onSuccess: onSaved,
    onError,
  });
  const reroll = useMutation({
    mutationFn: (id: number) =>
      api<PickView>(`/api/picks/${id}/reroll`, { method: "POST" }),
    onSuccess: onSaved,
    onError,
  });
  const decide = useMutation({
    mutationFn: (id: number) =>
      api<PickView>(`/api/picks/${id}`, { method: "PATCH", body: { status: "decided" } }),
    onSuccess: onSaved,
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: number) =>
      api<{ ok: true }>(`/api/picks/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: pickKeys.detail(id) });
      qc.invalidateQueries({ queryKey: pickKeys.list() });
    },
    onError,
  });

  return { create, reroll, decide, remove };
};
