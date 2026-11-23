"use client";

import {
  BedDouble,
  BookHeart,
  Camera,
  ExternalLink,
  Heart,
  MapPin,
  Plus,
  Search,
  Trash2,
  Utensils,
} from "lucide-react";
import { parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { toast } from "sonner";

import { useState } from "react";

import dynamic from "next/dynamic";

import type { MapPin as MapPinData } from "@/components/map/place-map";
import { PlaceRating } from "@/components/places/place-rating";
import { SidebarLayout } from "@/components/sidebar-layout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { formatWon } from "@/lib/ledger/format";
import { useAreaMutations, useAreaSearch, usePlaces } from "@/lib/places/client";
import {
  AREA_RADII,
  type AreaCandidate,
  type AreaView,
  type PlaceCard,
} from "@/lib/places/types";
import { cn } from "@/lib/utils";

/** 지도(maplibre)는 브라우저에서만 그린다. */
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

/** 핀 색 — 캔버스에 그려 CSS 변수를 못 쓴다. 다녀온 곳은 장미색, 숙소는 따뜻한 호박색 */
const VISITED_PIN = "#d96c75";
const STAY_PIN = "#c9893f";

const KIND_FILTERS = ["all", "eat", "play"] as const;
type KindFilter = (typeof KIND_FILTERS)[number];
const KIND_LABEL: Record<KindFilter, string> = {
  all: "전체",
  eat: "맛집·카페",
  play: "놀거리",
};

const formatRadius = (m: number) => (m >= 1000 ? `${m / 1000}km` : `${m}m`);
const formatDistance = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m / 10) * 10}m`;

const RADIUS_OPTIONS = AREA_RADII.map((m) => ({
  value: String(m),
  label: `반경 ${formatRadius(m)}`,
}));

/* ───────── 지역 추가 ───────── */

const AddAreaDialog = ({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (area: AreaView) => void;
}) => {
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const search = useAreaSearch(query);
  const { create } = useAreaMutations();
  const candidates = search.data?.candidates ?? [];

  const add = (candidate: AreaCandidate) =>
    create.mutate(
      {
        name: query,
        lat: candidate.lat,
        lng: candidate.lng,
        address: candidate.address,
      },
      {
        onSuccess: (area) => {
          toast.success(`'${area.name}' 지역을 만들었어요.`);
          setText("");
          setQuery("");
          onAdded(area);
        },
        onError: (err) => toast.error(err.message),
      }
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>지역 추가</DialogTitle>
          <DialogDescription>
            동네나 역 이름으로 찾아서, 지역의 가운데로 삼을 곳을 골라 주세요.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(text.trim());
          }}
        >
          <Input
            aria-label="지역 이름"
            placeholder="예: 신도림, 성수, 강릉"
            maxLength={20}
            value={text}
            onChange={(event) => setText(event.target.value)}
            autoFocus
          />
          <Button type="submit" disabled={!text.trim()}>
            <Search />
            찾기
          </Button>
        </form>
        {query && search.isFetching && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}
        {query && !search.isFetching && !candidates.length && (
          <p className="py-4 text-center text-[13px] text-muted">
            &lsquo;{query}&rsquo;로 찾은 곳이 없어요. 역 이름으로 다시 써 보세요.
          </p>
        )}
        {candidates.length > 0 && !search.isFetching && (
          <ul aria-label="찾은 곳" className="flex flex-col gap-1">
            {candidates.map((candidate) => (
              <li key={`${candidate.name}|${candidate.address}`}>
                <button
                  type="button"
                  disabled={create.isPending}
                  onClick={() => add(candidate)}
                  className="flex w-full items-start gap-2 rounded-xl p-2 text-left transition-colors hover:bg-canvas-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[14px] font-medium text-ink">
                      {candidate.name}
                      {candidate.category && (
                        <span className="ml-1.5 text-[12px] font-normal text-muted">
                          {candidate.category}
                        </span>
                      )}
                    </span>
                    {candidate.address && (
                      <span className="text-[12px] text-muted">{candidate.address}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
};

/* ───────── 카드 ───────── */

const PlacePhoto = ({ src }: { src: string | null }) => (
  <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-hairline bg-canvas-soft">
    {src ? (
      // 네이버·인스타그램 이미지 서버에서 바로 받는다.
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

const PlaceItem = ({ card, selected }: { card: PlaceCard; selected: boolean }) => {
  const meta = [
    card.category,
    card.distanceM !== null && `가운데서 ${formatDistance(card.distanceM)}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li>
      <article
        aria-label={card.name}
        data-place-key={card.key}
        className={cn(
          "flex scroll-mt-4 flex-col gap-3 rounded-2xl bg-surface p-3 ring-1 ring-hairline",
          selected && "ring-2 ring-primary"
        )}
      >
        <div className="flex gap-3">
          <PlacePhoto src={card.imageUrl} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h3 className="truncate text-[15px] font-semibold text-ink">{card.name}</h3>
            {meta && <p className="truncate text-[12px] text-muted">{meta}</p>}
            {card.source === "ledger" && (
              <p className="text-[12px] text-body tabular-nums">
                {card.visits}번 방문 · {formatWon(card.total)}
                {card.lastDate &&
                  ` · 마지막 ${card.lastDate.slice(2).replace(/-/g, ".")}`}
              </p>
            )}
            {card.source === "spot" && card.reason && (
              <p className="line-clamp-2 text-[12px] text-body">{card.reason}</p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {card.mapUrl && (
              <a
                href={card.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${card.name} 네이버 지도에서 열기`}
                className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
              >
                <ExternalLink />
              </a>
            )}
            {card.instagramUrl && (
              <a
                href={card.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${card.name} 인스타그램 게시물 열기`}
                className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
              >
                <Camera />
              </a>
            )}
          </div>
        </div>
        {card.source === "ledger" && (
          <PlaceRating
            placeKey={card.key}
            note={card.note}
            className="rounded-xl bg-canvas-soft p-3"
          />
        )}
        {card.source === "spot" && (
          <p className="text-[12px] text-muted">
            하치와레 추천 · 가계부에 지도 링크를 남기면 별점을 매길 수 있어요.
          </p>
        )}
      </article>
    </li>
  );
};

const Section = ({
  title,
  icon: Icon,
  cards,
  empty,
  selectedKey,
}: {
  title: string;
  icon: typeof Heart;
  cards: PlaceCard[];
  empty: string;
  selectedKey: string | null;
}) => {
  const unrated = cards.filter((card) => card.source === "ledger" && !card.note?.rating);
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">
        <Icon className="size-4 text-primary" />
        {title}
        <span className="text-[13px] font-normal text-muted tabular-nums">
          {cards.length}
        </span>
        {unrated.length > 0 && (
          <span className="ml-auto text-[12px] font-normal text-muted">
            별점 안 남긴 곳 {unrated.length}
          </span>
        )}
      </h2>
      {cards.length ? (
        <ul className="flex flex-col gap-2">
          {cards.map((card) => (
            <PlaceItem key={card.key} card={card} selected={card.key === selectedKey} />
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-hairline px-4 py-6 text-center text-[13px] text-muted">
          {empty}
        </p>
      )}
    </section>
  );
};

/* ───────── 화면 ───────── */

const NoAreas = ({ onAdd }: { onAdd: () => void }) => (
  <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-hairline px-6 py-12 text-center">
    <BookHeart className="size-7 text-primary" />
    <h2 className="text-lg font-medium text-ink">아직 지역이 없어요</h2>
    <p className="max-w-md text-sm text-muted">
      자주 가는 동네를 추가하면 그 동네에서 가 보고 싶은 곳, 다녀온 곳, 숙소를 한 번에
      모아 봐요.
    </p>
    <Button size="sm" onClick={onAdd}>
      <Plus />
      지역 추가
    </Button>
  </div>
);

const byKind = (cards: PlaceCard[], kind: KindFilter) =>
  kind === "all" ? cards : cards.filter((card) => card.kind === kind);

export const PlacesPage = () => {
  const [areaId, setAreaId] = useQueryState("area", parseAsInteger);
  const [kind, setKind] = useQueryState(
    "kind",
    parseAsStringLiteral(KIND_FILTERS).withDefault("all")
  );
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const { data, isLoading, error } = usePlaces(areaId);
  const { setRadius, remove } = useAreaMutations();

  const area = data?.area ?? null;
  const want = byKind(data?.want ?? [], kind);
  const visited = byKind(data?.visited ?? [], kind);
  const stays = data?.stays ?? [];

  const pins: MapPinData[] = [
    ...visited.map((card) => ({ card, color: VISITED_PIN })),
    ...stays.map((card) => ({ card, color: STAY_PIN })),
  ].flatMap(({ card, color }) =>
    card.lat !== null && card.lng !== null
      ? [
          {
            key: card.key,
            name: card.name,
            lat: card.lat,
            lng: card.lng,
            visits: card.visits,
            color,
          },
        ]
      : []
  );

  const selectArea = (id: number) => {
    setSelectedKey(null);
    void setAreaId(id);
  };
  const selectPin = (key: string) => {
    setSelectedKey(key);
    document
      .querySelector(`[data-place-key="${CSS.escape(key)}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <SidebarLayout activeNav="places">
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 pt-5 pb-8 md:px-8 md:pt-8">
        <header className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-ink">
            <BookHeart className="size-5 text-primary" />
            지역 수첩
          </h1>
          <p className="text-[13px] text-muted tabular-nums" aria-live="polite">
            {area
              ? `${area.name} 반경 ${formatRadius(area.radiusM)} · 가 보고 싶은 곳 ${data?.want.length ?? 0} · 다녀온 곳 ${data?.visited.length ?? 0} · 숙소 ${stays.length}`
              : "동네를 고르면 그 동네의 가 보고 싶은 곳·다녀온 곳·숙소를 한 번에 봐요."}
          </p>
        </header>

        {isLoading && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}
        {error && !data && (
          <p className="py-10 text-center text-sm text-muted">{error.message}</p>
        )}

        {data && !data.areas.length && <NoAreas onAdd={() => setAdding(true)} />}

        {data && area && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div
                role="group"
                aria-label="지역"
                className="flex min-w-0 flex-1 flex-wrap gap-1.5"
              >
                {data.areas.map((item) => (
                  <Button
                    key={item.id}
                    size="sm"
                    variant={item.id === area.id ? "default" : "outline"}
                    aria-pressed={item.id === area.id}
                    onClick={() => selectArea(item.id)}
                  >
                    {item.name}
                  </Button>
                ))}
                <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
                  <Plus />
                  지역
                </Button>
              </div>
              <div className="flex items-center gap-1">
                <Select
                  items={RADIUS_OPTIONS}
                  value={String(area.radiusM)}
                  onValueChange={(value) =>
                    setRadius.mutate(
                      { id: area.id, radiusM: Number(value) },
                      { onError: (err) => toast.error(err.message) }
                    )
                  }
                >
                  <SelectTrigger aria-label="반경" size="sm" className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RADIUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`${area.name} 지역 지우기`}
                  className="text-muted"
                  onClick={() => setRemoving(true)}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>

            <div role="group" aria-label="종류" className="flex gap-1.5">
              {KIND_FILTERS.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={kind === value}
                  onClick={() => void setKind(value === "all" ? null : value)}
                  className={cn(
                    "rounded-full px-3 py-1 text-[13px] text-body ring-1 ring-hairline transition-colors hover:bg-canvas-soft",
                    kind === value && "bg-ink text-canvas ring-ink hover:bg-ink"
                  )}
                >
                  {KIND_LABEL[value]}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_400px]">
              <div className="h-[42vh] min-h-[260px] overflow-hidden rounded-2xl ring-1 ring-hairline md:sticky md:top-4 md:h-[calc(100dvh-220px)]">
                <PlaceMap
                  key={area.id}
                  places={pins}
                  center={area}
                  selectedKey={selectedKey}
                  onSelect={selectPin}
                />
              </div>
              <div className="flex flex-col gap-6">
                <Section
                  title="가 보고 싶은 곳"
                  icon={Heart}
                  cards={want}
                  selectedKey={selectedKey}
                  empty="데이트 추천에서 '가 보고 싶어'로 표시한 이 동네 장소가 여기에 모여요."
                />
                <Section
                  title="다녀온 곳"
                  icon={Utensils}
                  cards={visited}
                  selectedKey={selectedKey}
                  empty="가계부에 네이버 지도 링크를 남긴 이 동네 장소가 여기에 모여요."
                />
                <Section
                  title="숙소"
                  icon={BedDouble}
                  cards={stays}
                  selectedKey={selectedKey}
                  empty="이 동네에서 묵었던 숙소가 여기에 모여요."
                />
              </div>
            </div>
          </>
        )}

        <AddAreaDialog
          open={adding}
          onOpenChange={setAdding}
          onAdded={(added) => {
            setAdding(false);
            selectArea(added.id);
          }}
        />

        <AlertDialog open={removing} onOpenChange={setRemoving}>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>
                &lsquo;{area?.name}&rsquo; 지역을 지울까요?
              </AlertDialogTitle>
              <AlertDialogDescription>
                지역만 지워지고, 장소와 우리 별점은 그대로 남아요.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>그대로 둘래</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() =>
                  area &&
                  remove.mutate(area.id, {
                    onSuccess: () => {
                      setRemoving(false);
                      setSelectedKey(null);
                      void setAreaId(null);
                    },
                    onError: (err) => toast.error(err.message),
                  })
                }
              >
                지울래
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </SidebarLayout>
  );
};
