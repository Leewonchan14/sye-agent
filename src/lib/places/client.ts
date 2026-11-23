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
  CreateReviewInput,
  PlaceReview,
  PlacesPayload,
  UpdateReviewInput,
} from "@/lib/places/types";

export const placeKeys = {
  all: ["places"] as const,
  list: (areaId: number | null) => ["places", "list", areaId ?? "recent"] as const,
  areaSearch: (q: string) => ["places", "area-search", q] as const,
  entryReviews: (entryId: number) => ["places", "entry-reviews", entryId] as const,
};

const useToken = () => useAuthStore((s) => s.token) ?? "";

/** 한 내역의 리뷰. entryId가 없으면 읽지 않는다. */
export const useEntryReviews = (entryId: number | null) => {
  const token = useToken();
  return useQuery({
    queryKey: placeKeys.entryReviews(entryId ?? 0),
    queryFn: async () =>
      (
        await ledgerRequest<{ reviews: PlaceReview[] }>(
          token,
          `/api/places/reviews?entryId=${entryId}`
        )
      ).reviews,
    enabled: Boolean(token && entryId),
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
    // 하치와레가 찾는 동안에는 결과가 오는 대로 보이게 자주 읽는다.
    refetchInterval: (query) =>
      query.state.data?.searching ? SEARCHING_POLL_MS : LEDGER_LIVE_QUERY.refetchInterval,
  });
};

const SEARCHING_POLL_MS = 5_000;

/** "이 동네 더 찾아 줘", 하치와레 추천에 가 보고 싶어·별로 표시 */
export const useAreaSpotMutations = () => {
  const token = useToken();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: placeKeys.all });
  return {
    search: useMutation({
      mutationFn: (areaId: number) =>
        ledgerRequest(token, `/api/places/areas/${areaId}/search`, { method: "POST" }),
      onSuccess: refresh,
    }),
    react: useMutation({
      mutationFn: ({
        spotId,
        reaction,
      }: {
        spotId: number;
        reaction: "like" | "pass" | "visited" | null;
      }) =>
        ledgerRequest(token, `/api/dates/spots/${spotId}`, {
          method: "PATCH",
          body: { reaction },
        }),
      onSuccess: refresh,
    }),
  };
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

/** 리뷰 쓰기·고치기·지우기. 리뷰를 보여 주는 화면(가계부·데이트 지도·지역 수첩)을 다시 읽는다. */
export const useReviewMutations = () => {
  const token = useToken();
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ledgerKeys.all }),
      queryClient.invalidateQueries({ queryKey: placeKeys.all }),
    ]);
  return {
    create: useMutation({
      mutationFn: (input: CreateReviewInput) =>
        ledgerRequest<PlaceReview>(token, "/api/places/reviews", {
          method: "POST",
          body: input,
        }),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, ...patch }: UpdateReviewInput & { id: number }) =>
        ledgerRequest<PlaceReview>(token, `/api/places/reviews/${id}`, {
          method: "PATCH",
          body: patch,
        }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: number) =>
        ledgerRequest(token, `/api/places/reviews/${id}`, { method: "DELETE" }),
      onSuccess: refresh,
    }),
  };
};
