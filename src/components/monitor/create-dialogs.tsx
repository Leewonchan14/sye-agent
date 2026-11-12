"use client";

import { useState } from "react";

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
import { useSetupMutations } from "@/lib/monitor/queries";
import type { MonitorClientSummary } from "@/lib/monitor/types";

const splitList = (value: string) =>
  value
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

export const CreateIssueDialog = ({
  open,
  onOpenChange,
  clients,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: MonitorClientSummary[];
  onCreated: (id: number) => void;
}) => {
  const { createIssue } = useSetupMutations();
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState<number | null>(null);
  const [keywords, setKeywords] = useState("");
  const [brandTerms, setBrandTerms] = useState("");
  const clientItems = [
    { value: 0, label: "고객사 없음" },
    ...clients.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>이슈 추적 시작</DialogTitle>
          <DialogDescription>
            논란이 생겼을 때 보도 건수와 브랜드 언급을 보고 시점마다 쌓아 둬요.
          </DialogDescription>
        </DialogHeader>
        <form
          id="create-issue"
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            createIssue.mutate(
              {
                title: title.trim(),
                clientId,
                keywords: splitList(keywords),
                brandTerms: splitList(brandTerms),
              },
              {
                onSuccess: (d) => {
                  onCreated(d.issue.id);
                  onOpenChange(false);
                  setTitle("");
                  setKeywords("");
                  setBrandTerms("");
                },
              }
            );
          }}
        >
          <label className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
            이슈 이름
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 신제품 리콜 이슈"
            />
          </label>
          <div className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
            관련 고객사
            <Select
              items={clientItems}
              value={clientId ?? 0}
              onValueChange={(v) => setClientId((v as number) || null)}
            >
              <SelectTrigger className="w-full" aria-label="관련 고객사">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {clientItems.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
            검색어 (쉼표로 구분)
            <Input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="예: 제품명 리콜, 제품명 결함"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
            감시할 브랜드 단어 (쉼표로 구분)
            <Input
              value={brandTerms}
              onChange={(e) => setBrandTerms(e.target.value)}
              placeholder="예: 브랜드명, 대표 제품명"
            />
          </label>
        </form>
        <DialogFooter>
          <Button
            type="submit"
            form="create-issue"
            disabled={!title.trim() || createIssue.isPending}
          >
            추적 시작
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
