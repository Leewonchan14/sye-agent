"use client";

import {
  BedDouble,
  ChevronDown,
  MapPin,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { useState } from "react";

import { categoryChipClass } from "@/components/ledger/category-chips";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { kst } from "@/lib/kst";
import {
  useAreaMutations,
  useAreaSearch,
  useAreaSpotMutations,
} from "@/lib/places/client";
import { AREA_RADII, type AreaCandidate, type AreaView } from "@/lib/places/types";
import { cn } from "@/lib/utils";

export const formatRadius = (m: number) => (m >= 1000 ? `${m / 1000}km` : `${m}m`);

const RADIUS_OPTIONS = AREA_RADII.map((m) => ({
  value: String(m),
  label: `반경 ${formatRadius(m)}`,
}));

/* ───────── 동네 추가 ───────── */

export const AddAreaDialog = ({
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
          toast.success(`'${area.name}' 동네를 만들었어요.`);
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
          <DialogTitle>동네 추가</DialogTitle>
          <DialogDescription>
            동네나 역 이름으로 찾아서, 동네의 가운데로 삼을 곳을 골라 주세요.
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
            aria-label="동네 이름"
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

/* ───────── 숙소 찾기 ───────── */

/** 다가오는 토요일 (오늘이 토요일이면 오늘) */
const nextSaturday = () => {
  const today = kst().startOf("day");
  return today.add((6 - today.day() + 7) % 7, "day").format("YYYY-MM-DD");
};

export const StaySearchDialog = ({
  open,
  onOpenChange,
  areaName,
  pending,
  onSearch,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  areaName: string;
  pending: boolean;
  onSearch: (checkin: string) => void;
}) => {
  const [checkin, setCheckin] = useState(nextSaturday);
  const today = kst().format("YYYY-MM-DD");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{areaName} 숙소 찾기</DialogTitle>
          <DialogDescription>
            가격은 날짜마다 달라서, 묵을 날을 정해 1박 기준으로 NOL(야놀자)에서 찾아요.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (checkin) onSearch(checkin);
          }}
        >
          <label className="flex flex-col gap-1 text-[12px] font-medium text-muted">
            체크인
            <Input
              type="date"
              aria-label="체크인 날짜"
              min={today}
              value={checkin}
              onChange={(event) => setCheckin(event.target.value)}
            />
          </label>
          {checkin && (
            <p className="text-[12px] text-muted">
              {kst(checkin).format("M.D (dd)")} →{" "}
              {kst(checkin).add(1, "day").format("M.D (dd)")} 1박 2인
            </p>
          )}
          <Button type="submit" disabled={!checkin || pending}>
            {pending ? <Spinner /> : <BedDouble />}
            찾아 줘
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

/* ───────── 동네 줄 ───────── */

const ALL = "all";

/**
 * 데이트 지도의 동네 줄. 동네를 고르면 그 반경 안만 보고, 반경 바꾸기·지우기와
 * 하치와레에게 이 동네(숙소)를 더 찾아 달라고 할 수 있다.
 */
export const AreaBar = ({
  areas,
  area,
  searching,
  onSelect,
}: {
  areas: AreaView[];
  area: AreaView | null;
  /** 하치와레가 지금 찾고 있는지 (오늘 조사 포함) */
  searching: boolean;
  onSelect: (areaId: number | null) => void;
}) => {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [stayDialog, setStayDialog] = useState(false);
  const { setRadius, remove } = useAreaMutations();
  const { search } = useAreaSpotMutations();
  const busy = searching || search.isPending;
  const items = [
    { value: ALL, label: "동네 전체" },
    ...areas.map((item) => ({ value: String(item.id), label: item.name })),
  ];

  const findMore = (mode: "places" | "stay", checkin?: string) =>
    area &&
    search.mutate(
      { areaId: area.id, mode, checkin },
      {
        onSuccess: () => {
          setStayDialog(false);
          toast.success(
            mode === "stay" && checkin
              ? `하치와레가 ${area.name} 숙소를 ${kst(checkin).format("M.D")} 1박 기준으로 찾기 시작했어요.`
              : `하치와레가 ${area.name}에서 찾기 시작했어요.`
          );
        },
        onError: (err) => toast.error(err.message),
      }
    );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Select
        items={items}
        value={area ? String(area.id) : ALL}
        onValueChange={(value) =>
          onSelect(!value || value === ALL ? null : Number(value))
        }
      >
        <SelectTrigger
          size="sm"
          aria-label="동네"
          className={cn(
            categoryChipClass(Boolean(area)),
            "h-auto! max-w-44 gap-1 py-1 pr-1.5 pl-2.5 text-[12px]"
          )}
        >
          <MapPin className="size-3.5" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {area && (
        <>
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
            <SelectTrigger
              size="sm"
              aria-label="반경"
              className={cn(
                categoryChipClass(false),
                "h-auto! gap-1 py-1 pr-1.5 pl-2.5 text-[12px]"
              )}
            >
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
            size="icon-xs"
            variant="ghost"
            aria-label={`${area.name} 동네 지우기`}
            className="text-muted"
            onClick={() => setRemoving(true)}
          >
            <Trash2 />
          </Button>
        </>
      )}
      <button
        type="button"
        aria-label="동네 추가"
        onClick={() => setAdding(true)}
        className={cn(categoryChipClass(false), "gap-1 px-2.5 py-1 text-[12px]")}
      >
        <Plus className="size-3.5" />
        동네
      </button>
      {/* 가 볼 곳·숙소 찾기를 메뉴 하나로 묶어, 좁은 화면에서도 동네 줄이 한 줄에 들어가게 한다. */}
      {area && (
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={busy}
            render={<Button size="xs" variant="outline" className="ml-auto" />}
          >
            {busy ? <Spinner /> : <Sparkles />}
            {busy ? "하치와레가 찾는 중" : "더 찾아 줘"}
            {!busy && <ChevronDown className="text-muted" />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>하치와레가 {area.name}에서</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => findMore("places")}>
                <Sparkles />가 볼 곳 더 찾아 줘
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStayDialog(true)}>
                <BedDouble />
                숙소 찾아 줘 (NOL)
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <AddAreaDialog
        open={adding}
        onOpenChange={setAdding}
        onAdded={(added) => {
          setAdding(false);
          onSelect(added.id);
        }}
      />
      {area && (
        <StaySearchDialog
          open={stayDialog}
          onOpenChange={setStayDialog}
          areaName={area.name}
          pending={search.isPending}
          onSearch={(checkin) => findMore("stay", checkin)}
        />
      )}
      <AlertDialog open={removing} onOpenChange={setRemoving}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              &lsquo;{area?.name}&rsquo; 동네를 지울까요?
            </AlertDialogTitle>
            <AlertDialogDescription>
              동네만 지워지고, 장소와 우리 리뷰는 그대로 남아요.
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
                    onSelect(null);
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
    </div>
  );
};
