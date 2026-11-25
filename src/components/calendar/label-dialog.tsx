"use client";

import { useMutation } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/lib/auth-store";
import { calendarRequest } from "@/lib/calendar/client";
import { LABEL_COLORS, labelColor, type LabelColorKey } from "@/lib/calendar/labels";
import type { CalendarLabel } from "@/lib/calendar/types";
import { cn } from "@/lib/utils";

const SHEET_CONTENT_CLASS =
  "flex max-h-[85dvh] flex-col overflow-hidden left-0 right-0 top-auto bottom-0 max-w-none translate-x-0 translate-y-0 rounded-t-3xl rounded-b-none sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:right-auto sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: CalendarLabel[];
  onChanged: () => void;
}

/** 라벨 목록 조회·이름 수정·삭제·추가를 다룬다. 변경되면 `onChanged`로 상위가 갱신한다. */
export const LabelDialog = ({ open, onOpenChange, labels, onChanged }: Props) => {
  const token = useAuthStore((s) => s.token);
  const [name, setName] = useState("");
  const [color, setColor] = useState<LabelColorKey>(LABEL_COLORS[0].key);
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  const addLabel = useMutation({
    mutationFn: () =>
      calendarRequest<{ label: CalendarLabel }>(token, "/api/calendar/labels", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), color }),
      }),
    onSuccess: () => {
      toast.success("라벨을 추가했어요.");
      setName("");
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const renameLabel = useMutation({
    mutationFn: ({ id, name: next }: { id: number; name: string }) =>
      calendarRequest<{ label: CalendarLabel }>(token, "/api/calendar/labels", {
        method: "PATCH",
        body: JSON.stringify({ id, name: next }),
      }),
    onSuccess: (_data, variables) => {
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[variables.id];
        return next;
      });
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeLabel = useMutation({
    mutationFn: (id: number) =>
      calendarRequest<{ ok: true }>(token, `/api/calendar/labels?id=${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      toast.success("라벨을 지웠어요.");
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const commitRename = (id: number) => {
    const label = labels.find((item) => item.id === id);
    const value = (drafts[id] ?? label?.name ?? "").trim();
    if (!value) {
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      toast.error("라벨 이름을 입력해 주세요.");
      return;
    }
    if (value === (label?.name ?? "").trim()) {
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    renameLabel.mutate({ id, name: value });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="label-dialog" className={SHEET_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>라벨 관리</DialogTitle>
        </DialogHeader>
        <div className="-mx-4 min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-4">
          {labels.length === 0 && (
            <p className="py-6 text-center text-[12px] text-muted">
              라벨이 없어요. 아래에서 추가해 주세요.
            </p>
          )}
          {labels.map((label) => (
            <div
              key={label.id}
              className="flex items-center gap-2 rounded-xl border border-hairline bg-surface px-3 py-2"
            >
              <span
                className="size-3 shrink-0 rounded-full"
                style={{ backgroundColor: labelColor(label.color) }}
              />
              <Input
                value={drafts[label.id] ?? label.name}
                onChange={(event) =>
                  setDrafts((prev) => ({ ...prev, [label.id]: event.target.value }))
                }
                onBlur={() => commitRename(label.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
                aria-label={`${label.name} 이름`}
                maxLength={20}
                className="h-8 flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`${label.name} 라벨 삭제`}
                onClick={() => removeLabel.mutate(label.id)}
              >
                <Trash2 className="size-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
        <div className="-mx-4 -mb-4 shrink-0 space-y-2 border-t border-hairline bg-popover px-4 py-3">
          <div className="flex gap-2">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="새 라벨 이름"
              maxLength={20}
              aria-label="새 라벨 이름"
            />
            <Button
              type="button"
              data-testid="btn-add-label"
              onClick={() => addLabel.mutate()}
              disabled={!name.trim() || addLabel.isPending}
            >
              <Plus /> 추가
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="색 선택">
            {LABEL_COLORS.map((item) => {
              const selected = item.key === color;
              return (
                <button
                  key={item.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={item.name}
                  onClick={() => setColor(item.key)}
                  className={cn(
                    "grid size-7 place-items-center rounded-full transition-transform",
                    selected && "ring-2 ring-primary ring-offset-2 ring-offset-popover"
                  )}
                  style={{ backgroundColor: item.hex }}
                />
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
