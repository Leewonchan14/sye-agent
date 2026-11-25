"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ExternalLink, MapPinned, Pencil, RefreshCw, X } from "lucide-react";
import {
  createParser,
  debounce,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
  useQueryStates,
} from "nuqs";
import { toast } from "sonner";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import dynamic from "next/dynamic";
import Link from "next/link";

import {
  ExpenseCategoryChips,
  type CategoryFilter,
} from "@/components/ledger/category-chips";
import { DayRouteButton } from "@/components/ledger/day-route/day-route-button";
import { PlacePhotoCarousel } from "@/components/ledger/place-photos";
import { AreaBar, formatRadius } from "@/components/map/area-controls";
import { formatPeriod, MapPeriodFilter } from "@/components/map/map-period-filter";
import { spotPinColor, STAY_PIN } from "@/components/map/pin-colors";
import { PlaceListControls } from "@/components/map/place-list-controls";
import type { MapPin } from "@/components/map/place-map";
import { PlacePhoto } from "@/components/map/place-photo";
import { LayerChips, SpotDetail, SpotList } from "@/components/map/spot-layer";
import {
  PlaceReviewWriter,
  RatingSummary,
  ReviewList,
} from "@/components/places/place-reviews";
import { SidebarLayout } from "@/components/sidebar-layout";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAuthStore } from "@/lib/auth-store";
import { kst } from "@/lib/kst";
import { LEDGER_LIVE_QUERY, ledgerKeys, ledgerRequest } from "@/lib/ledger/client";
import { formatWon } from "@/lib/ledger/format";
import { MAP_RATED_FILTERS, MAP_SORTS, pickReviewSnippet } from "@/lib/ledger/map-filter";
import {
  filterSection,
  layerCounts,
  MAP_LAYERS,
  sectionSize,
  splitLayers,
  type LayerSectionId,
  type MapLayer,
} from "@/lib/ledger/map-layers";
import {
  MAP_RANGES,
  toMapSearchParams,
  type LedgerMapPayload,
  type LedgerMapPayment,
  type LedgerMapPlace,
} from "@/lib/ledger/map-types";
import { useMapLayers } from "@/lib/places/client";
import { REVIEW_AUTHOR_LABEL } from "@/lib/places/types";
import { cn } from "@/lib/utils";

/** 지도(maplibre)는 브라우저에서만 그린다. 서버 렌더링과 첫 번들에서 뺀다. */
const PlaceMap = dynamic(
  () => import("@/components/map/place-map").then((mod) => mod.PlaceMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex size-full items-center justify-center">
        <Spinner />
      </div>
    ),
  }
);

/** YYYY-MM-DD만 받는다. 형식이 맞지 않으면 없는 것으로 본다. */
const parseAsDayKey = createParser({
  parse: (value) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null),
  serialize: (value: string) => value,
});

/**
 * 기간은 주소에 남긴다. 바꿀 때마다 히스토리를 쌓아 뒤로 가기로 이전 기간으로 돌아간다.
 * - `?range=custom&from=2026-11-01&to=2026-11-22`: 직접 고른 날짜
 * - `?range=trip&trip=3`: 가계부 여행 하나
 */
const periodParsers = {
  range: parseAsStringLiteral(MAP_RANGES).withDefault("all"),
  from: parseAsDayKey,
  to: parseAsDayKey,
  trip: parseAsInteger,
  /** `?category=<분류 id>`: 어느 기간이든 그 분류 지출만 본다. */
  category: parseAsInteger,
};
/** 고른 장소. 공유·새로고침해도 같은 장소가 열린다. */
const placeParser = { history: "replace" } as const;
/**
 * 목록 검색·정렬·리뷰 필터. 기간과 달리 히스토리를 쌓지 않는다.
 * 검색어는 화면에는 바로 반영하고, 주소는 입력이 멈춘 뒤에 바꾼다.
 */
const listParsers = {
  q: parseAsString.withDefault("").withOptions({ limitUrlUpdates: debounce(300) }),
  sort: parseAsStringLiteral(MAP_SORTS).withDefault("visits"),
  rated: parseAsStringLiteral(MAP_RATED_FILTERS).withDefault("all"),
  /** `?layers=visited,want`: 지도에 겹쳐 볼 레이어. 기본은 모두 켠다. */
  layers: parseAsArrayOf(parseAsStringLiteral(MAP_LAYERS)).withDefault([...MAP_LAYERS]),
};

/** 헤더 요약 앞에 붙이는 기간 이름. 전체·올해·이번 달은 칩으로 충분하다. */
const periodTitle = (data: LedgerMapPayload) => {
  if (data.trip) return `${data.trip.name} · ${formatPeriod(data.from ?? "", data.to)}`;
  if (data.range === "custom" && data.from) return formatPeriod(data.from, data.to);
  return null;
};

/** 헤더 요약 앞에 붙이는 고른 분류 이름 */
const categoryTitle = (data: LedgerMapPayload) =>
  data.categories.find((item) => item.id === data.category)?.name ?? null;

const visitDate = (date: string) => {
  const day = kst(date);
  return day.format(day.isSame(kst(), "year") ? "M.D (dd)" : "YY.M.D (dd)");
};

const paymentLabel = (payment: LedgerMapPayment) =>
  payment.memo || payment.categoryName || "지출";

const PlaceDetail = ({
  place,
  startWriting,
  onClose,
}: {
  place: LedgerMapPlace;
  /** 목록 줄의 "리뷰 쓰기"로 열었으면 리뷰 입력창을 바로 연다. */
  startWriting: boolean;
  onClose: () => void;
}) => (
  <section
    aria-label={`${place.name} 방문 기록`}
    className="overflow-hidden rounded-2xl bg-surface ring-1 ring-hairline"
  >
    {/*
      고른 장소가 바뀌면 사진 위치(몇 번째 사진)를 처음으로 돌린다.
      흰 바탕 사진(로고 등)도 카드 본문과 구분되게 아래에 경계선을 둔다. 사진이 없으면 숨긴다.
    */}
    <div className="border-b border-hairline empty:hidden">
      <PlacePhotoCarousel
        key={place.key}
        name={place.name}
        mapUrl={place.mapUrl}
        imageUrls={place.imageUrls}
      />
    </div>
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 text-base font-semibold text-ink">{place.name}</h2>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="선택 해제"
            title="선택 해제 (Esc)"
            className="-mt-1 -mr-1.5 shrink-0 text-muted"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
        {(place.category || place.address) && (
          <p className="text-[12px] text-muted">
            {[place.category, place.address].filter(Boolean).join(" · ")}
          </p>
        )}
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-body tabular-nums">
          {place.visits}번 방문 · {formatWon(place.total)}
          {place.rating && <RatingSummary rating={place.rating} />}
        </p>
      </div>
      {/* 리뷰는 간 날에 붙는다. 쓸 때 간 날을 고르고(기본은 가장 최근), 고른 장소가 바뀌면 쓰던 리뷰를 닫는다. */}
      <PlaceReviewWriter
        key={`${place.key}:${startWriting}`}
        visits={place.entries.map((visit) => ({
          date: visit.date,
          entryId: visit.payments[0].id,
        }))}
        defaultWriting={startWriting}
      />
      {/*
        간 날 목록은 따로 스크롤하지 않는다. 화면 스크롤 안에 스크롤 칸이 또 있으면 그 위에서 쓸어 넘길 때
        목록만 움직이고 화면이 안 내려가, 스크롤이 걸리는 느낌이 든다. 넓은 화면에서는 카드가 통째로 스크롤한다.
      */}
      <ul aria-label="간 날" className="flex flex-col divide-y divide-hairline-soft">
        {place.entries.map((visit) => {
          const several = visit.payments.length > 1;
          return (
            <li key={visit.date} className="flex flex-col gap-1 py-1.5 text-[13px]">
              <div className="flex items-baseline gap-3">
                <span className="w-20 shrink-0 text-muted tabular-nums">
                  {visitDate(visit.date)}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-body",
                    several && "text-muted tabular-nums"
                  )}
                >
                  {several
                    ? `결제 ${visit.payments.length}건`
                    : paymentLabel(visit.payments[0])}
                </span>
                <span className="shrink-0 text-ink tabular-nums">
                  {formatWon(visit.amount)}
                </span>
              </div>
              {/* 같은 날 여러 번 결제했으면 날짜 아래에 결제를 하나씩 먼저 한 것부터 보여 준다. */}
              {several && (
                <ul
                  aria-label={`${visitDate(visit.date)} 결제`}
                  className="flex flex-col gap-0.5 pl-23 text-[12px]"
                >
                  {visit.payments.map((payment) => (
                    <li key={payment.id} className="flex items-baseline gap-3">
                      <span className="min-w-0 flex-1 truncate text-body">
                        {paymentLabel(payment)}
                      </span>
                      <span className="shrink-0 text-muted tabular-nums">
                        {formatWon(payment.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {/* 그날 남긴 리뷰. 연필로 고친다. 새 리뷰는 카드 위쪽 "리뷰 쓰기"에서 쓴다. */}
              <ReviewList
                key={`${place.key}:${visit.date}`}
                reviews={visit.reviews}
                variant="block"
              />
            </li>
          );
        })}
      </ul>
      <a
        href={place.mapUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
      >
        <ExternalLink />
        네이버 지도에서 열기
      </a>
    </div>
  </section>
);

const PlaceList = ({
  places,
  query,
  selectedKey,
  onSelect,
  onWrite,
  label = "다녀온 곳",
}: {
  places: LedgerMapPlace[];
  /** 검색어. 리뷰 글에 걸렸으면 그 리뷰를 보여 준다. */
  query: string;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  /** 리뷰 없는 줄의 "리뷰 쓰기": 장소 카드를 열면서 입력창도 연다. */
  onWrite: (key: string) => void;
  /** 목록의 접근성 이름 (다녀온 곳 · 묵었던 숙소) */
  label?: string;
}) => (
  <ol aria-label={label} className="flex flex-col gap-1">
    {places.map((place, index) => {
      const snippet = pickReviewSnippet(place, query);
      const canWrite = !place.rating;
      return (
        <li key={place.key} className="relative">
          <button
            type="button"
            aria-current={place.key === selectedKey || undefined}
            onClick={() => onSelect(place.key)}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-canvas-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              place.key === selectedKey && "bg-canvas-card"
            )}
          >
            <span className="w-4 shrink-0 text-center text-[12px] text-muted tabular-nums">
              {index + 1}
            </span>
            <PlacePhoto src={place.imageUrl} className="size-11 rounded-lg" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[14px] font-medium text-ink">
                {place.name}
              </span>
              <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted">
                {place.rating && <RatingSummary rating={place.rating} />}
                <span className="truncate">
                  {place.category || place.address || "장소"}
                </span>
              </span>
              {/* 가게를 누르지 않아도 최근 리뷰 한 줄을 본다. 전체 리뷰와 고치기는 장소 카드에서 한다. */}
              {snippet && (
                <span
                  data-testid="review-snippet"
                  className="mt-0.5 truncate text-[11px] text-body"
                >
                  “{snippet.review}”
                  <span className="text-muted">
                    {" "}
                    — {REVIEW_AUTHOR_LABEL[snippet.author]}
                  </span>
                </span>
              )}
              {/* 리뷰 한 줄 자리에 "리뷰 쓰기"를 둔다. 버튼 안에 버튼을 둘 수 없어 자리만 잡고 아래에 따로 겹친다. */}
              {canWrite && <span aria-hidden className="mt-0.5 h-4" />}
            </span>
            <span className="flex shrink-0 flex-col items-end">
              <span className="text-[13px] font-medium text-ink tabular-nums">
                {place.visits}번
              </span>
              <span className="text-[11px] text-muted tabular-nums">
                {formatWon(place.total)}
              </span>
            </span>
          </button>
          {canWrite && (
            <button
              type="button"
              aria-label={`${place.name} 리뷰 쓰기`}
              onClick={() => onWrite(place.key)}
              className="absolute bottom-2 left-[92px] inline-flex h-4 items-center gap-0.5 rounded-sm text-[11px] text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Pencil className="size-3" />
              리뷰 쓰기
            </button>
          )}
        </li>
      );
    })}
  </ol>
);

const Empty = () => (
  <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-hairline px-6 py-12 text-center">
    <MapPinned className="size-7 text-primary" />
    <h2 className="text-lg font-medium text-ink">아직 지도에 찍힌 곳이 없어요</h2>
    <p className="max-w-md text-sm text-muted">
      가계부 지출에 네이버 지도 링크를 붙이면 여기에 핀으로 모여요.
    </p>
    <Link
      href="/ledger"
      className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
    >
      가계부로 가기
    </Link>
  </div>
);

/** 목록 구역의 이름과, 그 안 가계부 장소·추천 목록의 접근성 이름 */
const SECTION_TEXT: Record<
  LayerSectionId,
  { title: string; ledger: string; spots: string }
> = {
  fresh: { title: "하치와레 새 추천", ledger: "", spots: "하치와레 새 추천" },
  visited: { title: "다녀온 곳", ledger: "다녀온 곳", spots: "다녀왔어로 표시한 곳" },
  want: { title: "가 보고 싶은 곳", ledger: "", spots: "가 보고 싶은 곳" },
  stay: { title: "숙소", ledger: "묵었던 숙소", spots: "숙소 추천" },
};

/** 레이어별 목록 머리: "다녀온 곳 4" */
const ListHeading = ({ label, count }: { label: string; count: number }) => (
  <h2 className="flex items-baseline gap-1.5 px-1 pt-1 text-[13px] font-semibold text-ink">
    {label}
    <span className="text-[12px] font-normal text-muted tabular-nums">{count}</span>
  </h2>
);

const EmptyPeriod = () => (
  <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-hairline px-6 py-12 text-center">
    <MapPinned className="size-7 text-muted-soft" />
    <h2 className="text-lg font-medium text-ink">이 조건에는 지도에 찍힌 곳이 없어요</h2>
    <p className="max-w-md text-sm text-muted">다른 기간·여행·분류를 골라 보세요.</p>
  </div>
);

export const DateMapPage = () => {
  const token = useAuthStore((s) => s.token) ?? "";
  const queryClient = useQueryClient();
  const [period, setPeriod] = useQueryStates(periodParsers, { history: "push" });
  const [selectedKey, setSelectedKey] = useQueryState("place", placeParser);
  const [list, setList] = useQueryStates(listParsers, { history: "replace" });
  /** `?area=<동네 id>`: 고른 동네. 바꿀 때마다 히스토리를 쌓아 뒤로 가기로 앞 동네로 돌아간다. */
  const [areaId, setAreaId] = useQueryState(
    "area",
    parseAsInteger.withOptions({ history: "push" })
  );
  // 장소가 많아도 글자를 칠 때 입력창이 밀리지 않게 거르기는 한 박자 늦게 한다.
  const query = useDeferredValue(list.q.trim());
  // 기간에 쓰지 않는 값(예: 전체인데 남은 from)은 API에 보내지 않는다.
  const search = toMapSearchParams(period);

  const { data, isLoading, error } = useQuery({
    queryKey: ledgerKeys.map(search),
    queryFn: () => ledgerRequest<LedgerMapPayload>(token, `/api/ledger/map?${search}`),
    enabled: Boolean(token),
    placeholderData: keepPreviousData,
    ...LEDGER_LIVE_QUERY,
  });

  /**
   * 기간을 바꾸면 고른 장소는 닫고, 그 기간에 쓰지 않는 값은 주소에서 지운다.
   * 분류는 기간과 따로 고르므로 그대로 둔다.
   */
  const changePeriod = (next: Partial<typeof period>) => {
    void setSelectedKey(null);
    void setPeriod({ from: null, to: null, trip: null, ...next });
  };
  const changeCategory = (value: CategoryFilter) => {
    void setSelectedKey(null);
    void setPeriod({ category: value === "all" ? null : value });
  };

  const refresh = useMutation({
    mutationFn: () =>
      ledgerRequest<{ resolved: number; remaining: number }>(token, "/api/ledger/map", {
        method: "POST",
      }),
    onSuccess: ({ resolved, remaining }) => {
      if (resolved) toast.success(`${resolved}곳을 지도에 찍었어요.`);
      else toast.error("이번에도 장소를 못 찾았어요. 잠시 뒤 다시 해 주세요.");
      if (remaining && resolved) toast(`아직 ${remaining}건이 남았어요.`);
      void queryClient.invalidateQueries({ queryKey: ledgerKeys.all });
    },
    onError: (err) => toast.error(err.message),
  });

  // Esc로 고른 장소를 닫는다. 사진 확대 창 같은 대화상자가 열려 있으면 그쪽이 먼저 닫힌다.
  const hasSelection = Boolean(selectedKey);
  useEffect(() => {
    if (!hasSelection) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector("[role=dialog]")) return;
      void setSelectedKey(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasSelection, setSelectedKey]);

  // 동네와 하치와레 추천 레이어. 동네를 바꾸는 동안에는 앞 동네 결과를 잠깐 보여 주므로,
  // 원은 고른 동네와 응답이 같을 때만 그린다.
  const layersQuery = useMapLayers(areaId);
  const layersData = layersQuery.data;
  const area =
    areaId !== null && layersData?.area?.id === areaId ? layersData.area : null;
  const selectArea = (id: number | null) => {
    void setSelectedKey(null);
    void setAreaId(id);
  };

  const sections = useMemo(
    () => splitLayers(data?.places ?? [], layersData, area),
    [data, layersData, area]
  );
  const counts = layerCounts(sections);
  /**
   * 레이어를 켜고 끈다. 마지막 하나는 끄지 않는다(빈 지도가 되지 않게).
   * 순서(다녀온 곳 → 가 보고 싶은 곳 → 숙소)를 지키고, 모두 켜면 주소에서 뺀다.
   */
  const toggleLayer = (layer: MapLayer) => {
    const on = list.layers.includes(layer);
    if (on && list.layers.length === 1) return;
    const next = MAP_LAYERS.filter((item) =>
      item === layer ? !on : list.layers.includes(item)
    );
    void setList({ layers: next.length === MAP_LAYERS.length ? null : next });
  };

  const visible = sections.filter((section) => list.layers.includes(section.layer));
  // 검색·리뷰 필터로 거른 구역. 지도 핀과 목록이 함께 따른다.
  const shownSections = useMemo(
    () =>
      sections
        .filter((section) => list.layers.includes(section.layer))
        .map((section) =>
          filterSection(section, { query, sort: list.sort, rated: list.rated })
        ),
    [sections, list.layers, query, list.sort, list.rated]
  );
  const pins = useMemo<MapPin[]>(
    () => [
      // 다녀온 곳 핀이 위에 그려지게 추천을 먼저 넣는다.
      ...shownSections.flatMap((section) =>
        section.spots.flatMap((card) =>
          card.lat !== null && card.lng !== null
            ? [
                {
                  key: card.key,
                  name: card.name,
                  lat: card.lat,
                  lng: card.lng,
                  visits: 0,
                  color: spotPinColor(card),
                },
              ]
            : []
        )
      ),
      ...shownSections.flatMap((section) =>
        section.ledger.map((place) =>
          section.id === "stay" ? { ...place, color: STAY_PIN } : place
        )
      ),
    ],
    [shownSections]
  );
  const filtering = Boolean(query) || list.rated !== "all";
  const clearFilters = () => void setList({ q: null, rated: null });
  const visibleTotal = visible.reduce((sum, section) => sum + sectionSize(section), 0);
  const shownTotal = shownSections.reduce(
    (sum, section) => sum + sectionSize(section),
    0
  );
  const searching = Boolean(layersData?.searching);

  // 걸러져 목록에 없는 장소도 카드는 계속 열어 둔다(보고 있던 것이 갑자기 닫히지 않게).
  const ledgerAll = sections.flatMap((section) => section.ledger);
  const spotAll = sections.flatMap((section) => section.spots);
  const selected = ledgerAll.find((place) => place.key === selectedKey) ?? null;
  const selectedSpot = selected
    ? null
    : (spotAll.find((card) => card.key === selectedKey) ?? null);
  const totalVisits = ledgerAll.reduce((sum, place) => sum + place.visits, 0);
  const totalSpent = ledgerAll.reduce((sum, place) => sum + place.total, 0);
  const mapBoxRef = useRef<HTMLDivElement>(null);
  /** 목록 줄의 "리뷰 쓰기"로 연 장소. 카드를 열면서 리뷰 입력창도 연다. */
  const [writeKey, setWriteKey] = useState<string | null>(null);
  const clearPlace = () => void setSelectedKey(null);
  // 이미 고른 장소를 다시 누르면 선택을 푼다.
  const selectPlace = (key: string) => {
    setWriteKey(null);
    void setSelectedKey(key === selectedKey ? null : key);
  };
  const writeReview = (key: string) => {
    setWriteKey(key);
    void setSelectedKey(key);
  };
  // 좁은 화면에서는 목록이 지도 아래에 있으므로, 목록에서 고르면 지도가 보이게 올린다.
  const selectFromList = (key: string) => {
    selectPlace(key);
    if (key === selectedKey) return;
    const box = mapBoxRef.current;
    if (box && box.getBoundingClientRect().top < 0) {
      box.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <SidebarLayout activeNav="map">
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 pt-5 pb-8 md:px-8 md:pt-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="flex items-center gap-2 text-xl font-semibold text-ink">
              <MapPinned className="size-5 text-primary" />
              데이트 지도
            </h1>
            <p className="text-[13px] text-muted tabular-nums" aria-live="polite">
              {data
                ? [
                    area && `${area.name} 반경 ${formatRadius(area.radiusM)}`,
                    periodTitle(data),
                    categoryTitle(data),
                    `다녀온 곳 ${counts.visited}곳 · ${totalVisits}번 · ${formatWon(totalSpent)}`,
                    counts.want > 0 && `가 보고 싶은 곳 ${counts.want}곳`,
                    counts.stay > 0 && `숙소 ${counts.stay}곳`,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "다녀온 곳, 가 보고 싶은 곳, 숙소를 동네별로 모아 봐요."}
            </p>
          </div>
          <MapPeriodFilter
            range={period.range}
            from={data?.range === "custom" ? data.from : period.from}
            to={data?.range === "custom" ? data.to : period.to}
            trips={data?.trips ?? []}
            selectedTrip={data?.trip ?? null}
            onPreset={(range) => changePeriod({ range })}
            onCustom={(from, to) => changePeriod({ range: "custom", from, to })}
            onTrip={(trip) => changePeriod({ range: "trip", trip })}
          />
        </header>

        {/* 동네를 고르면 그 반경 안만 보고, 하치와레에게 이 동네를 더 찾아 달라고 할 수 있다. */}
        <AreaBar
          areas={layersData?.areas ?? []}
          area={area}
          searching={searching}
          onSelect={selectArea}
        />

        {/* 지도에 겹쳐 볼 레이어. 기간·분류는 가계부에서 온 장소에만 걸린다. */}
        <LayerChips layers={list.layers} counts={counts} onToggle={toggleLayer} />

        {/* 가계부와 같은 분류 칩. 이 기간 지도에 찍힌 지출이 있는 분류만 보여 준다. */}
        {data && data.categories.length > 0 && (
          <ExpenseCategoryChips
            label="분류 필터"
            categories={data.categories}
            selected={data.category ?? "all"}
            onSelect={changeCategory}
          />
        )}

        {/* 하루만 골랐으면 그날 다닌 순서대로 잇는 동선을 볼 수 있다. 분류 필터와 상관없이 그날 전체를 잇는다. */}
        {data?.range === "custom" && data.from && data.from === data.to && (
          <DayRouteButton date={data.from} className="self-start" />
        )}

        {data && data.unresolved > 0 && (
          <div
            role="status"
            className="flex items-center justify-between gap-3 rounded-xl bg-canvas-soft px-3 py-2 text-[13px] text-body"
          >
            <span>지도에 못 찍은 곳 {data.unresolved}건</span>
            <Button
              size="sm"
              variant="outline"
              disabled={refresh.isPending}
              onClick={() => refresh.mutate()}
            >
              {refresh.isPending ? <Spinner /> : <RefreshCw />}
              다시 찾기
            </Button>
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}
        {error && !data && (
          <p className="py-10 text-center text-sm text-muted">{error.message}</p>
        )}

        {data &&
          !visibleTotal &&
          !area &&
          (data.range === "all" && data.category === null ? <Empty /> : <EmptyPeriod />)}

        {(visibleTotal > 0 || area) && (
          // 열을 minmax(0, 1fr)로 둬, 지도 캔버스가 처음 그린 너비보다 화면이 좁아져도 따라 줄어든다.
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_340px]">
            <div
              ref={mapBoxRef}
              className="h-[58vh] min-h-[320px] scroll-mt-4 overflow-hidden rounded-2xl ring-1 ring-hairline md:sticky md:top-4 md:h-[calc(100dvh-180px)]"
            >
              <PlaceMap
                places={pins}
                center={area ?? undefined}
                area={area}
                selectedKey={selectedKey}
                onSelect={selectPlace}
              />
            </div>
            <div className="flex flex-col gap-4">
              {/*
                넓은 화면에서는 목록을 내려도 고른 장소가 위에 붙어 있다. 위쪽 여백(그리드 위 gap-4)만큼
                배경을 깔아, 붙어 있을 때 그 틈으로 목록이 비치지 않게 한다.
                카드가 화면을 다 덮으면 목록 끝이 카드 밑에 가려 못 고르므로, 아래에 목록이 한 줄 이상 보이게
                높이를 줄이고 카드 안에서 스크롤한다.
              */}
              {(selected || selectedSpot) && (
                <div className="md:sticky md:top-0 md:z-10 md:-mt-4 md:max-h-[calc(100dvh-6rem)] md:overflow-y-auto md:bg-canvas md:pt-4">
                  {selected && (
                    <PlaceDetail
                      place={selected}
                      startWriting={writeKey === selected.key}
                      onClose={clearPlace}
                    />
                  )}
                  {selectedSpot && (
                    <SpotDetail card={selectedSpot} onClose={clearPlace} />
                  )}
                </div>
              )}
              <PlaceListControls
                query={list.q}
                onQueryChange={(value) => void setList({ q: value || null })}
                sort={list.sort}
                onSortChange={(value) => void setList({ sort: value })}
                rated={list.rated}
                onRatedChange={(value) => void setList({ rated: value })}
              />
              {filtering && (
                <p
                  className="-mt-2 flex items-center justify-between gap-2 px-1 text-[12px] text-muted tabular-nums"
                  aria-live="polite"
                >
                  <span>
                    {visibleTotal}곳 중 {shownTotal}곳
                  </span>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="rounded-md px-1 text-primary hover:underline"
                  >
                    검색·필터 지우기
                  </button>
                </p>
              )}
              {/* 구역마다 이름과 개수를 붙인다. 새 추천 → 다녀온 곳 → 가 보고 싶은 곳 → 숙소 */}
              {shownSections.map((section) => {
                const text = SECTION_TEXT[section.id];
                const size = sectionSize(section);
                // 하치와레가 이 동네를 찾는 동안에는 새 추천 구역을 비어 있어도 보여 준다.
                const waiting = section.id === "fresh" && area && searching;
                if (!size && !waiting) return null;
                return (
                  <section
                    key={section.id}
                    aria-label={text.title}
                    className="flex flex-col gap-1"
                  >
                    <ListHeading label={text.title} count={size} />
                    {section.ledger.length > 0 && (
                      <PlaceList
                        label={text.ledger}
                        places={section.ledger}
                        query={query}
                        selectedKey={selectedKey}
                        onSelect={selectFromList}
                        onWrite={writeReview}
                      />
                    )}
                    {section.spots.length > 0 && (
                      <SpotList
                        label={text.spots}
                        cards={section.spots}
                        query={query}
                        selectedKey={selectedKey}
                        onSelect={selectFromList}
                      />
                    )}
                    {!size && (
                      <p className="flex items-center gap-2 rounded-xl bg-canvas-soft px-3 py-3 text-[12px] text-muted">
                        <Spinner />
                        하치와레가 {area?.name}을 찾고 있어요. 다 찾으면 여기에 보여요.
                      </p>
                    )}
                  </section>
                );
              })}
              {!shownTotal && !(area && searching) && (
                <p className="rounded-xl border border-dashed border-hairline px-4 py-8 text-center text-[13px] text-muted">
                  {visibleTotal
                    ? "조건에 맞는 곳이 없어요."
                    : `${area?.name ?? "이 동네"}에는 아직 모아 둔 곳이 없어요. '더 찾아 줘'로 하치와레에게 부탁해 보세요.`}
                </p>
              )}
            </div>
          </div>
        )}
      </main>
    </SidebarLayout>
  );
};
