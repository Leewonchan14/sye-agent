"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useAuthStore } from "@/lib/auth-store";
import {
  type CreatePickInput,
  EMPTY_PICK_DRAFT,
  type PickDraft,
  type PickView,
} from "@/lib/picks/types";

export const pickKeys = {
  all: ["picks"] as const,
  list: () => [...pickKeys.all, "list"] as const,
  detail: (id: number) => [...pickKeys.all, "detail", id] as const,
  draft: () => [...pickKeys.all, "draft"] as const,
};

/** 쓰던 후보를 서버에 저장하기 전에 기다리는 시간 — 글자마다 저장하지 않게 */
const DRAFT_SAVE_DELAY_MS = 500;

const readError = async (res: Response) => {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? "요청을 처리하지 못했어요.";
};

const useApi = () => {
  const token = useAuthStore((s) => s.token) ?? "";
  return async <T>(
    url: string,
    init?: { method?: string; body?: unknown; keepalive?: boolean }
  ) => {
    const res = await fetch(url, {
      method: init?.method ?? "GET",
      keepalive: init?.keepalive,
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

/**
 * 돌리기 전에 적고 있는 고민과 후보. 서버(DB)에 저장해서 다른 폰에서 열어도 이어서 쓴다.
 *
 * - 입력은 화면의 `local`에 바로 반영하고, 잠깐 멈추면 서버에 저장한다.
 * - 저장이 끝나기 전에는 다시 읽어 온 서버 값으로 입력을 덮지 않는다.
 * - 화면을 떠나거나 앱을 내리면 기다리지 않고 바로 저장한다.
 */
export const usePickDraft = () => {
  const api = useApi();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: pickKeys.draft(),
    queryFn: () => api<PickDraft>("/api/picks/draft"),
    refetchOnWindowFocus: true,
  });
  /** 아직 서버에 저장하지 못한 입력 */
  const [local, setLocal] = useState<PickDraft | null>(null);
  const pending = useRef<PickDraft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { mutate: save } = useMutation({
    mutationFn: (draft: PickDraft) =>
      api<PickDraft>("/api/picks/draft", { method: "PUT", body: draft, keepalive: true }),
    // 저장 요청이 앞뒤가 바뀌어 도착하지 않도록 하나씩 차례로 보낸다.
    scope: { id: "pick-draft" },
    onError: (error) => toast.error(error.message, { id: "pick-draft-save" }),
  });

  /** 기다리던 저장을 바로 보낸다. */
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const draft = pending.current;
    if (!draft) return;
    pending.current = null;
    void qc.cancelQueries({ queryKey: pickKeys.draft() });
    qc.setQueryData(pickKeys.draft(), draft);
    save(draft, {
      onSuccess: (saved) => {
        qc.setQueryData(pickKeys.draft(), saved);
        // 저장하는 동안 더 고친 게 없을 때만 서버 값을 보여 준다.
        if (!pending.current) setLocal(null);
      },
    });
  }, [qc, save]);

  const setDraft = useCallback(
    (draft: PickDraft) => {
      setLocal(draft);
      pending.current = draft;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, DRAFT_SAVE_DELAY_MS);
    },
    [flush]
  );

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [flush]);

  return {
    draft: local ?? query.data ?? EMPTY_PICK_DRAFT,
    setDraft,
    flush,
    /** 서버에서 쓰던 후보를 읽어 왔는지 (실패해도 빈 칸으로 쓸 수 있게 true) */
    ready: !query.isPending,
    /** 아직 서버에 저장되지 않은 입력이 있는지 */
    saving: local !== null,
  };
};
