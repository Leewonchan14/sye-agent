"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ExternalLink, MapPin, MapPinned, RefreshCw } from "lucide-react";
import {
  createParser,
  parseAsInteger,
  parseAsStringLiteral,
  useQueryState,
  useQueryStates,
} from "nuqs";
import { toast } from "sonner";

import { useRef } from "react";

import dynamic from "next/dynamic";
import Link from "next/link";

import { PlacePhotoCarousel } from "@/components/ledger/place-photos";
import { formatPeriod, MapPeriodFilter } from "@/components/map/map-period-filter";
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
};
/** 고른 장소. 공유·새로고침해도 같은 장소가 열린다. */
const placeParser = { history: "replace" } as const;

/** 헤더 요약 앞에 붙이는 기간 이름. 전체·올해·이번 달은 칩으로 충분하다. */
const periodTitle = (data: LedgerMapPayload) => {
  if (data.trip) return `${data.trip.name} · ${formatPeriod(data.from ?? "", data.to)}`;
  if (data.range === "custom" && data.from) return formatPeriod(data.from, data.to);
  return null;
};

const visitDate = (date: string) => {
  const day = kst(date);
  return day.format(day.isSame(kst(), "year") ? "M.D (dd)" : "YY.M.D (dd)");
};

const PlacePhoto = ({ src, className }: { src: string | null; className?: string }) => (
  <div
    className={cn(
      "flex shrink-0 items-center justify-center overflow-hidden bg-canvas-soft",
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

const PlaceDetail = ({ place }: { place: LedgerMapPlace }) => (
  <section
    aria-label={`${place.name} 방문 기록`}
    className="overflow-hidden rounded-2xl bg-surface ring-1 ring-hairline"
  >
    {/* 고른 장소가 바뀌면 사진 위치(몇 번째 사진)를 처음으로 돌린다. */}
    <PlacePhotoCarousel
      key={place.key}
      name={place.name}
      mapUrl={place.mapUrl}
      imageUrls={place.imageUrls}
    />
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base font-semibold text-ink">{place.name}</h2>
        {(place.category || place.address) && (
          <p className="text-[12px] text-muted">
            {[place.category, place.address].filter(Boolean).join(" · ")}
          </p>
        )}
        <p className="mt-1 text-[13px] text-body tabular-nums">
          {place.visits}번 방문 · {formatWon(place.total)}
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-hairline-soft">
        {place.entries.map((visit) => (
          <li key={visit.id} className="flex items-baseline gap-3 py-1.5 text-[13px]">
            <span className="w-20 shrink-0 text-muted tabular-nums">
              {visitDate(visit.date)}
            </span>
            <span className="min-w-0 flex-1 truncate text-body">
              {visit.memo || visit.categoryName || "지출"}
            </span>
            <span className="shrink-0 text-ink tabular-nums">
              {formatWon(visit.amount)}
            </span>
          </li>
        ))}
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
            <span className="truncate text-[12px] text-muted">
              {place.category || place.address || "장소"}
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
    <h2 className="text-lg font-medium text-ink">이 기간에는 지도에 찍힌 곳이 없어요</h2>
    <p className="max-w-md text-sm text-muted">다른 기간이나 여행을 골라 보세요.</p>
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

  /** 기간을 바꾸면 고른 장소는 닫고, 그 기간에 쓰지 않는 값은 주소에서 지운다. */
  const changePeriod = (next: Partial<typeof period>) => {
    void setSelectedKey(null);
    void setPeriod({ from: null, to: null, trip: null, ...next });
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

  const places = data?.places ?? [];
  const selected = places.find((place) => place.key === selectedKey) ?? null;
  const totalVisits = places.reduce((sum, place) => sum + place.visits, 0);
  const totalSpent = places.reduce((sum, place) => sum + place.total, 0);
  const mapBoxRef = useRef<HTMLDivElement>(null);
  const selectPlace = (key: string) => void setSelectedKey(key);
  // 좁은 화면에서는 목록이 지도 아래에 있으므로, 목록에서 고르면 지도가 보이게 올린다.
  const selectFromList = (key: string) => {
    selectPlace(key);
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

        {data && !places.length && (data.range === "all" ? <Empty /> : <EmptyPeriod />)}

        {places.length > 0 && (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_340px]">
            <div
              ref={mapBoxRef}
              className="h-[58vh] min-h-[320px] scroll-mt-4 overflow-hidden rounded-2xl ring-1 ring-hairline md:sticky md:top-6 md:h-[calc(100dvh-180px)]"
            >
              <PlaceMap
                places={places}
                selectedKey={selectedKey}
                onSelect={selectPlace}
              />
            </div>
            <div className="flex flex-col gap-4">
              {selected && <PlaceDetail place={selected} />}
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
