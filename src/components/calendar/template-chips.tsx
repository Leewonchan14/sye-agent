"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/lib/auth-store";
import { calendarKeys, calendarRequest } from "@/lib/calendar/client";
import type { CalendarOwner, CalendarTemplate } from "@/lib/calendar/types";

export interface TemplateSnapshot {
  title: string;
  owner: CalendarOwner;
  allDay: boolean;
  labelId: number | null;
  location: string;
  memo: string;
  durationMinutes: number;
}

interface Props {
  onApply: (template: CalendarTemplate) => void;
  getSnapshot: () => TemplateSnapshot;
}

/** 일정 다이얼로그 상단의 템플릿 칩. `/api/calendar/templates`를 직접 호출한다. */
export const TemplateChips = ({ onApply, getSnapshot }: Props) => {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");

  const { data: templates = [] } = useQuery({
    queryKey: calendarKeys.templates,
    queryFn: async () => {
      const res = await calendarRequest<{ templates: CalendarTemplate[] }>(
        token,
        "/api/calendar/templates"
      );
      return res.templates;
    },
    enabled: Boolean(token),
  });

  const saveTemplate = useMutation({
    mutationFn: async () => {
      const snapshot = getSnapshot();
      const res = await calendarRequest<{ template: CalendarTemplate }>(
        token,
        "/api/calendar/templates",
        { method: "POST", body: JSON.stringify({ name: name.trim(), ...snapshot }) }
      );
      return res.template;
    },
    onSuccess: () => {
      toast.success("템플릿을 저장했어요.");
      setName("");
      setSaveOpen(false);
      queryClient.invalidateQueries({ queryKey: calendarKeys.templates });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeTemplate = useMutation({
    mutationFn: (id: number) =>
      calendarRequest<{ ok: true }>(token, `/api/calendar/templates?id=${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      toast.success("템플릿을 지웠어요.");
      queryClient.invalidateQueries({ queryKey: calendarKeys.templates });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSaveOpen(true)}
        >
          <Bookmark /> 현재 내용을 템플릿으로 저장
        </Button>
        {templates.map((template) => (
          <span
            key={template.id}
            data-testid={`template-chip-${template.id}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-hairline bg-surface py-0.5 pr-0.5 pl-3"
          >
            <button
              type="button"
              className="text-[12px] text-body hover:text-ink"
              onClick={() => onApply(template)}
            >
              {template.name}
            </button>
            <button
              type="button"
              aria-label={`${template.name} 템플릿 삭제`}
              className="grid size-5 place-items-center rounded-full text-muted hover:bg-canvas-soft hover:text-destructive"
              onClick={() => removeTemplate.mutate(template.id)}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>템플릿 저장</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label
                className="text-[12px] font-medium text-muted"
                htmlFor="template-name"
              >
                템플릿 이름
              </label>
              <Input
                id="template-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="예: 주말 데이트"
                maxLength={20}
                className="mt-1"
                autoComplete="off"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setSaveOpen(false)}>
                취소
              </Button>
              <Button
                type="button"
                onClick={() => saveTemplate.mutate()}
                disabled={!name.trim() || saveTemplate.isPending}
              >
                저장
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
