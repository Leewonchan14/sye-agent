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
  MapLayersPayload,
  PlaceReview,
  UpdateReviewInput,
} from "@/lib/places/types";

export const placeKeys = {
  all: ["places"] as const,
  layers: (areaId: number | null) => ["places", "layers", areaId ?? "all"] as const,
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

const SEARCHING_POLL_MS = 5_000;

/**
 * 데이트 지도의 동네와 하치와레 추천 레이어. areaId가 없으면 전체.
 * 리뷰·표시·동네를 바꾸면 placeKeys.all로 함께 다시 읽는다.
 */
export const useMapLayers = (areaId: number | null) => {
  const token = useToken();
  return useQuery({
    queryKey: placeKeys.layers(areaId),
    queryFn: () =>
      ledgerRequest<MapLayersPayload>(
        token,
        areaId === null ? "/api/places/layers" : `/api/places/layers?area=${areaId}`
      ),
    enabled: Boolean(token),
    placeholderData: keepPreviousData,
    ...LEDGER_LIVE_QUERY,
    // 하치와레가 찾는 동안에는 결과가 오는 대로 보이게 자주 읽는다.
    refetchInterval: (query) =>
      query.state.data?.searching ? SEARCHING_POLL_MS : LEDGER_LIVE_QUERY.refetchInterval,
  });
};

/** "이 동네 더 찾아 줘", 하치와레 추천에 가 보고 싶어·별로 표시 */
export const useAreaSpotMutations = () => {
  const token = useToken();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: placeKeys.all });
  return {
    search: useMutation({
      mutationFn: ({
        areaId,
        ...body
      }: {
        areaId: number;
        /** places: 가 볼 곳·즐길 거리 · stay: 숙소(NOL) */
        mode?: "places" | "stay";
        /** 숙소 체크인 날짜 (YYYY-MM-DD) */
        checkin?: string;
      }) =>
        ledgerRequest(token, `/api/places/areas/${areaId}/search`, {
          method: "POST",
          body,
        }),
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
        queryClient.removeQueries({ queryKey: placeKeys.layers(id) });
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
