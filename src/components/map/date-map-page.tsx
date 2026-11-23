"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ExternalLink, MapPin, MapPinned, RefreshCw, X } from "lucide-react";
import {
  createParser,
  parseAsInteger,
  parseAsStringLiteral,
  useQueryState,
  useQueryStates,
} from "nuqs";
import { toast } from "sonner";

import { useEffect, useRef } from "react";

import dynamic from "next/dynamic";
import Link from "next/link";

import {
  ExpenseCategoryChips,
  type CategoryFilter,
} from "@/components/ledger/category-chips";
import { DayRouteButton } from "@/components/ledger/day-route/day-route-button";
import { PlacePhotoCarousel } from "@/components/ledger/place-photos";
import { formatPeriod, MapPeriodFilter } from "@/components/map/map-period-filter";
import { PlaceRating, RatingStars } from "@/components/places/place-rating";
import { SidebarLayout } from "@/components/sidebar-layout";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAuthStore } from "@/lib/auth-store";
import { kst } from "@/lib/kst";
import { LEDGER_LIVE_QUERY, ledgerKeys, ledgerRequest } from "@/lib/ledger/client";
import { formatWon } from "@/lib/ledger/format";
import {
  MAP_RANGES,
  toMapSearchParams,
  type LedgerMapPayload,
  type LedgerMapPayment,
  type LedgerMapPlace,
} from "@/lib/ledger/map-types";
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

const PlacePhoto = ({ src, className }: { src: string | null; className?: string }) => (
  <div
    className={cn(
      // 흰 바탕 사진도 테두리가 보이게 한다.
      "flex shrink-0 items-center justify-center overflow-hidden border border-hairline bg-canvas-soft",
      className
    )}
  >
    {src ? (
      // 네이버 이미지 서버에서 바로 받는다. next/image 최적화를 거치지 않는다.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="size-full object-cover"
      />
    ) : (
      <MapPin className="size-5 text-muted-soft" />
    )}
  </div>
);

const PlaceDetail = ({
  place,
  onClose,
}: {
  place: LedgerMapPlace;
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
        <p className="mt-1 text-[13px] text-body tabular-nums">
          {place.visits}번 방문 · {formatWon(place.total)}
        </p>
      </div>
      {/* 고른 장소가 바뀌면 쓰던 별점 입력을 닫는다. */}
      <PlaceRating
        key={place.key}
        placeKey={place.key}
        note={place.note}
        className="rounded-xl bg-canvas-soft p-3"
      />
      {/* 간 날이 많으면 이 목록만 스크롤한다. 장소 이름과 지도 링크는 늘 보인다. */}
      <ul
        aria-label="간 날"
        className="-mr-2 flex max-h-72 flex-col divide-y divide-hairline-soft overflow-y-auto overscroll-contain pr-2"
      >
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
            </li>
          );
        })}
      </ul>
      <a
        href={place.mapUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        <ExternalLink />
        네이버 지도에서 열기
      </a>
    </div>
  </section>
);

const PlaceList = ({
  places,
  selectedKey,
  onSelect,
}: {
  places: LedgerMapPlace[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) => (
  <ol aria-label="다녀온 곳" className="flex flex-col gap-1">
    {places.map((place, index) => (
      <li key={place.key}>
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
              {place.note?.rating && <RatingStars rating={place.note.rating} />}
              <span className="truncate">
                {place.category || place.address || "장소"}
              </span>
            </span>
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
      </li>
    ))}
  </ol>
);

const Empty = () => (
  <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-hairline px-6 py-12 text-center">
    <MapPinned className="size-7 text-primary" />
    <h2 className="text-lg font-medium text-ink">아직 지도에 찍힌 곳이 없어요</h2>
    <p className="max-w-md text-sm text-muted">
      가계부 지출에 네이버 지도 링크를 붙이면 여기에 핀으로 모여요.
    </p>
    <Link href="/ledger" className={buttonVariants({ variant: "outline", size: "sm" })}>
      가계부로 가기
    </Link>
  </div>
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

  const places = data?.places ?? [];
  const selected = places.find((place) => place.key === selectedKey) ?? null;
  const totalVisits = places.reduce((sum, place) => sum + place.visits, 0);
  const totalSpent = places.reduce((sum, place) => sum + place.total, 0);
  const mapBoxRef = useRef<HTMLDivElement>(null);
  const clearPlace = () => void setSelectedKey(null);
  // 이미 고른 장소를 다시 누르면 선택을 푼다.
  const selectPlace = (key: string) =>
    void setSelectedKey(key === selectedKey ? null : key);
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
                    periodTitle(data),
                    categoryTitle(data),
                    `다녀온 곳 ${places.length}곳 · ${totalVisits}번 · ${formatWon(totalSpent)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "가계부에 남긴 네이버 지도 링크로 다녀온 곳을 모아 봐요."}
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
          !places.length &&
          (data.range === "all" && data.category === null ? <Empty /> : <EmptyPeriod />)}

        {places.length > 0 && (
          // 열을 minmax(0, 1fr)로 둬, 지도 캔버스가 처음 그린 너비보다 화면이 좁아져도 따라 줄어든다.
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_340px]">
            <div
              ref={mapBoxRef}
              className="h-[58vh] min-h-[320px] scroll-mt-4 overflow-hidden rounded-2xl ring-1 ring-hairline md:sticky md:top-4 md:h-[calc(100dvh-180px)]"
            >
              <PlaceMap
                places={places}
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
              {selected && (
                <div className="md:sticky md:top-0 md:z-10 md:-mt-4 md:max-h-[calc(100dvh-6rem)] md:overflow-y-auto md:overscroll-contain md:bg-canvas md:pt-4">
                  <PlaceDetail place={selected} onClose={clearPlace} />
                </div>
              )}
              <PlaceList
                places={places}
                selectedKey={selectedKey}
                onSelect={selectFromList}
              />
            </div>
          </div>
        )}
      </main>
    </SidebarLayout>
  );
};
