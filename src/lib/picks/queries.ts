"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useAuthStore } from "@/lib/auth-store";
import {
  type CreatePickInput,
  EMPTY_PICK_DRAFT,
  type PickBoard,
  type PickBoardPatch,
  type PickDraft,
  type PickView,
} from "@/lib/picks/types";

export const pickKeys = {
  all: ["picks"] as const,
  list: () => [...pickKeys.all, "list"] as const,
  board: () => [...pickKeys.all, "board"] as const,
};

/** 쓰던 후보를 서버에 저장하기 전에 기다리는 시간 — 글자마다 저장하지 않게 */
const DRAFT_SAVE_DELAY_MS = 500;
/** 다른 브라우저에서 바꾼 화면을 따라가려고 다시 읽는 간격 (화면을 보고 있을 때만) */
const BOARD_POLL_MS = 2_500;
const HISTORY_POLL_MS = 10_000;
/** 골라 줘 화면을 바꾸는 요청은 하나씩 차례로 보내서 순서가 뒤바뀌지 않게 한다. */
const BOARD_SCOPE = { id: "pick-board" };

const EMPTY_BOARD: PickBoard = { ...EMPTY_PICK_DRAFT, activePick: null };

/**
 * 이 탭에서 화면을 바꾸는 요청. 다시 읽기가 그보다 먼저 출발했으면 바뀌기 전 화면을 받아 올 수
 * 있으니, 그 응답은 버리고 이 탭이 알고 있는 화면을 지킨다.
 */
const boardWrites = { pending: 0, lastDoneAt: 0 };

const trackWrite = async <T>(write: () => Promise<T>) => {
  boardWrites.pending += 1;
  try {
    return await write();
  } finally {
    boardWrites.pending -= 1;
    boardWrites.lastDoneAt = Date.now();
  }
};

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

const onError = (error: Error) => toast.error(error.message);

export const usePickHistory = () => {
  const api = useApi();
  return useQuery({
    queryKey: pickKeys.list(),
    queryFn: async () => (await api<{ picks: PickView[] }>("/api/picks")).picks,
    refetchOnWindowFocus: true,
    refetchInterval: HISTORY_POLL_MS,
  });
};

/** 띄워 둔 뽑기가 `pick`이면 새 값으로 바꾼다. */
const withActivePick = (board: PickBoard | undefined, pick: PickView) =>
  board && board.activePick?.id === pick.id ? { ...board, activePick: pick } : board;

/**
 * 둘이 같이 보는 골라 줘 화면. 서버(DB)에 저장하고, 열어 둔 화면은 몇 초마다 다시 읽어서
 * 다른 브라우저에서 돌리거나 결정한 것도 같이 보여 준다.
 *
 * - 적는 후보는 화면의 `local`에 바로 반영하고, 잠깐 멈추면 서버에 저장한다.
 *   저장이 끝나기 전에는 다시 읽어 온 서버 값으로 입력을 덮지 않는다.
 * - 화면을 떠나거나 앱을 내리면 기다리지 않고 바로 저장한다.
 */
export const usePickBoard = () => {
  const api = useApi();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: pickKeys.board(),
    queryFn: async () => {
      const startedAt = Date.now();
      const board = await api<PickBoard>("/api/picks/board");
      const known = qc.getQueryData<PickBoard>(pickKeys.board());
      const stale = boardWrites.pending > 0 || boardWrites.lastDoneAt >= startedAt;
      return stale && known ? known : board;
    },
    refetchOnWindowFocus: true,
    refetchInterval: BOARD_POLL_MS,
  });
  /** 아직 서버에 저장하지 못한 입력 */
  const [local, setLocal] = useState<PickDraft | null>(null);
  const pending = useRef<PickDraft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { mutate: patch } = useMutation({
    mutationFn: (body: PickBoardPatch) =>
      trackWrite(() =>
        api<PickBoard>("/api/picks/board", { method: "PATCH", body, keepalive: true })
      ),
    scope: BOARD_SCOPE,
    onSuccess: (board) => qc.setQueryData(pickKeys.board(), board),
    onError: (error) => toast.error(error.message, { id: "pick-board-save" }),
  });

  const cancelTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  /** 기다리던 후보 저장을 바로 보낸다. */
  const flush = useCallback(() => {
    cancelTimer();
    const draft = pending.current;
    if (!draft) return;
    pending.current = null;
    qc.setQueryData<PickBoard>(pickKeys.board(), (b) => ({
      ...(b ?? EMPTY_BOARD),
      ...draft,
    }));
    patch(draft, {
      onSuccess: () => {
        // 저장하는 동안 더 고친 게 없을 때만 서버 값을 보여 준다.
        if (!pending.current) setLocal(null);
      },
    });
  }, [qc, patch]);

  const setDraft = useCallback(
    (draft: PickDraft) => {
      setLocal(draft);
      pending.current = draft;
      cancelTimer();
      timer.current = setTimeout(flush, DRAFT_SAVE_DELAY_MS);
    },
    [flush]
  );

  /**
   * 화면에 띄울 뽑기를 바꾼다(null이면 후보를 적는 화면). `draft`를 주면 적는 후보도 같이 바꾼다.
   * 다른 브라우저도 이 화면을 따라온다.
   */
  const show = useCallback(
    (pickId: number | null, draft?: PickDraft) => {
      cancelTimer();
      pending.current = null;
      setLocal(null);
      void qc.cancelQueries({ queryKey: pickKeys.board() });
      const picked =
        pickId === null
          ? null
          : (qc.getQueryData<PickView[]>(pickKeys.list())?.find((p) => p.id === pickId) ??
            undefined);
      qc.setQueryData<PickBoard>(pickKeys.board(), (b) => {
        const base = { ...(b ?? EMPTY_BOARD), ...draft };
        return picked === undefined ? base : { ...base, activePick: picked };
      });
      patch({ ...draft, activePickId: pickId });
    },
    [qc, patch]
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

  const board = query.data ?? EMPTY_BOARD;
  return {
    draft: local ?? { title: board.title, labels: board.labels },
    activePick: board.activePick,
    setDraft,
    flush,
    show,
    /** 서버에서 화면을 읽어 왔는지 (실패해도 빈 칸으로 쓸 수 있게 true) */
    ready: !query.isPending,
    /** 아직 서버에 저장되지 않은 입력이 있는지 */
    saving: local !== null,
  };
};

export const usePickMutations = () => {
  const api = useApi();
  const qc = useQueryClient();
  const onSaved = (pick: PickView) => {
    qc.setQueryData<PickBoard>(pickKeys.board(), (b) => withActivePick(b, pick));
    void qc.invalidateQueries({ queryKey: pickKeys.list() });
  };

  const create = useMutation({
    mutationFn: (input: CreatePickInput) =>
      trackWrite(() => api<PickView>("/api/picks", { method: "POST", body: input })),
    scope: BOARD_SCOPE,
    // 서버가 뽑은 결과를 둘이 같이 보는 화면에 띄운다.
    onSuccess: (pick) => {
      qc.setQueryData<PickBoard>(pickKeys.board(), (b) => ({
        ...(b ?? EMPTY_BOARD),
        activePick: pick,
      }));
      void qc.invalidateQueries({ queryKey: pickKeys.list() });
    },
    onError,
  });
  const reroll = useMutation({
    mutationFn: (id: number) =>
      trackWrite(() => api<PickView>(`/api/picks/${id}/reroll`, { method: "POST" })),
    scope: BOARD_SCOPE,
    onSuccess: onSaved,
    onError,
  });
  const decide = useMutation({
    mutationFn: (id: number) =>
      trackWrite(() =>
        api<PickView>(`/api/picks/${id}`, {
          method: "PATCH",
          body: { status: "decided" },
        })
      ),
    scope: BOARD_SCOPE,
    onSuccess: onSaved,
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: number) =>
      trackWrite(() => api<{ ok: true }>(`/api/picks/${id}`, { method: "DELETE" })),
    scope: BOARD_SCOPE,
    // 띄워 둔 뽑기를 지우면 서버도 화면을 비운다(외래 키 on delete set null).
    onSuccess: (_data, id) => {
      qc.setQueryData<PickBoard>(pickKeys.board(), (b) =>
        b && b.activePick?.id === id ? { ...b, activePick: null } : b
      );
      void qc.invalidateQueries({ queryKey: pickKeys.list() });
    },
    onError,
  });

  return { create, reroll, decide, remove };
};
