import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { useAuthStore } from "@/lib/auth-store";
import { LEDGER_LIVE_QUERY, ledgerKeys, ledgerRequest } from "@/lib/ledger/client";
import type {
  AreaCandidate,
  AreaView,
  CreateAreaInput,
  PlaceNote,
  PlaceNoteInput,
  PlacesPayload,
} from "@/lib/places/types";

export const placeKeys = {
  all: ["places"] as const,
  list: (areaId: number | null) => ["places", "list", areaId ?? "recent"] as const,
  areaSearch: (q: string) => ["places", "area-search", q] as const,
  note: (key: string) => ["places", "note", key] as const,
};

const useToken = () => useAuthStore((s) => s.token) ?? "";

/** 한 장소의 우리 별점·리뷰. key가 비어 있으면 읽지 않는다. */
export const usePlaceNote = (key: string) => {
  const token = useToken();
  return useQuery({
    queryKey: placeKeys.note(key),
    queryFn: async () =>
      (
        await ledgerRequest<{ note: PlaceNote | null }>(
          token,
          `/api/places/notes?key=${encodeURIComponent(key)}`
        )
      ).note,
    enabled: Boolean(token && key),
  });
};

/** 지역 수첩. areaId가 없으면 서버가 최근에 연 지역을 고른다. */
export const usePlaces = (areaId: number | null) => {
  const token = useToken();
  return useQuery({
    queryKey: placeKeys.list(areaId),
    queryFn: () =>
      ledgerRequest<PlacesPayload>(
        token,
        areaId === null ? "/api/places" : `/api/places?area=${areaId}`
      ),
    enabled: Boolean(token),
    placeholderData: keepPreviousData,
    ...LEDGER_LIVE_QUERY,
  });
};

/** 지역 이름으로 중심 후보 찾기. 찾기를 누른 검색어(q)가 있을 때만 읽는다. */
export const useAreaSearch = (q: string) => {
  const token = useToken();
  return useQuery({
    queryKey: placeKeys.areaSearch(q),
    queryFn: () =>
      ledgerRequest<{ candidates: AreaCandidate[] }>(
        token,
        `/api/places/areas/search?q=${encodeURIComponent(q)}`
      ),
    enabled: Boolean(token && q),
    staleTime: 5 * 60_000,
  });
};

export const useAreaMutations = () => {
  const token = useToken();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: placeKeys.all });
  return {
    create: useMutation({
      mutationFn: (input: CreateAreaInput) =>
        ledgerRequest<AreaView>(token, "/api/places/areas", {
          method: "POST",
          body: input,
        }),
      onSuccess: refresh,
    }),
    setRadius: useMutation({
      mutationFn: ({ id, radiusM }: { id: number; radiusM: number }) =>
        ledgerRequest<AreaView>(token, `/api/places/areas/${id}`, {
          method: "PATCH",
          body: { radiusM },
        }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: number) =>
        ledgerRequest(token, `/api/places/areas/${id}`, { method: "DELETE" }),
      // 지운 지역은 다시 읽어도 404라서 버리고, 나머지는 기다리지 않고 새로 읽는다.
      onSuccess: (_data, id) => {
        queryClient.removeQueries({ queryKey: placeKeys.list(id) });
        void refresh();
      },
    }),
  };
};

/** 별점·리뷰를 저장하고, 별점을 보여 주는 화면(데이트 지도·지역 수첩)을 다시 읽는다. */
export const useSavePlaceNote = () => {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PlaceNoteInput) =>
      ledgerRequest<PlaceNote>(token, "/api/places/notes", {
        method: "PUT",
        body: input,
      }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ledgerKeys.all }),
        queryClient.invalidateQueries({ queryKey: placeKeys.all }),
      ]),
  });
};
