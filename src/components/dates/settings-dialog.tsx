"use client";

import { useState } from "react";

import { RuleSwitch, TagsEditor } from "@/components/monitor/rule-value-editors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Textarea } from "@/components/ui/textarea";
import { useDateMutations } from "@/lib/dates/queries";
import {
  type DateSettings,
  MAX_CONTENT_COUNT,
  MAX_SPOT_COUNT,
  MIN_SPOT_COUNT,
} from "@/lib/dates/types";

const COUNT_OPTIONS = Array.from(
  { length: MAX_SPOT_COUNT - MIN_SPOT_COUNT + 1 },
  (_, i) => MIN_SPOT_COUNT + i
).map((n) => ({ value: String(n), label: `${n}곳` }));

const CONTENT_COUNT_OPTIONS = Array.from({ length: MAX_CONTENT_COUNT + 1 }, (_, n) => ({
  value: String(n),
  label: n === 0 ? "안 받기" : `${n}개`,
}));

const Field = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-[13px] font-medium text-ink">{label}</span>
    {children}
    {hint && <span className="text-xs text-muted">{hint}</span>}
  </div>
);

/** 열 때마다 저장된 값으로 다시 시작하도록 부모가 key를 바꿔 준다. */
export const DateSettingsDialog = ({
  open,
  onOpenChange,
  settings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: DateSettings;
}) => {
  const [draft, setDraft] = useState(settings);
  const { saveSettings } = useDateMutations();
  const set = <K extends keyof DateSettings>(key: K, value: DateSettings[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>조사 조건</DialogTitle>
          <DialogDescription>
            하치와레가 매일 이 조건으로 데이트 장소와 같이 즐길 거리(팝업·게임·공연 등)를
            골라 와요.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-medium text-ink">매일 자동 조사</span>
            <RuleSwitch
              checked={draft.enabled}
              onChange={(v) => set("enabled", v)}
              label="매일 자동 조사"
            />
          </div>
          <Field label="조사 시각">
            <Input
              type="time"
              value={draft.collectTime}
              onChange={(e) => set("collectTime", e.target.value)}
              aria-label="조사 시각"
              disabled={!draft.enabled}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="장소">
              <Select
                items={COUNT_OPTIONS}
                value={String(draft.count)}
                onValueChange={(v) => set("count", Number(v))}
              >
                <SelectTrigger aria-label="하루 추천 수" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="즐길거리">
              <Select
                items={CONTENT_COUNT_OPTIONS}
                value={String(draft.contentCount)}
                onValueChange={(v) => set("contentCount", Number(v))}
              >
                <SelectTrigger aria-label="하루 즐길거리 수" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_COUNT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field
            label="지역"
            hint="동네 이름이 구체적일수록 잘 찾아요. 예: 성수, 연남, 을지로"
          >
            <TagsEditor
              value={draft.areas}
              onChange={(v) => set("areas", v)}
              label="지역"
              align="start"
            />
          </Field>
          <Field
            label="원하는 테마"
            hint="비워 두면 카페·맛집·전시·산책과 팝업·게임·공연을 섞어서 골라요."
          >
            <TagsEditor
              value={draft.themes}
              onChange={(v) => set("themes", v)}
              label="테마"
              align="start"
            />
          </Field>
          <Field label="하치와레에게 부탁">
            <Textarea
              value={draft.memo}
              onChange={(e) => set("memo", e.target.value)}
              placeholder="예: 웨이팅 긴 곳은 빼 줘, 비 오는 날엔 실내 위주로"
              maxLength={300}
              rows={3}
              aria-label="하치와레에게 부탁"
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            disabled={saveSettings.isPending || draft.areas.length === 0}
            onClick={() =>
              saveSettings.mutate(draft, { onSuccess: () => onOpenChange(false) })
            }
          >
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
