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

export const CreateClientDialog = ({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: number) => void;
}) => {
  const { createClient } = useSetupMutations();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>고객사 추가</DialogTitle>
          <DialogDescription>
            slug는 하치와레 모니터링 스킬이 이 고객사를 찾을 때 쓰는 이름이에요.
          </DialogDescription>
        </DialogHeader>
        <form
          id="create-client"
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            createClient.mutate(
              { name: name.trim(), slug: slug.trim() },
              {
                onSuccess: (d) => {
                  onCreated(d.client.id);
                  onOpenChange(false);
                  setName("");
                  setSlug("");
                },
              }
            );
          }}
        >
          <label className="flex flex-col gap-1.5 text-[13px] text-muted">
            고객사 이름
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="반올림피자"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] text-muted">
            slug (영문 소문자·숫자·하이픈)
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="banolim"
              className="font-mono"
            />
          </label>
        </form>
        <DialogFooter>
          <Button
            type="submit"
            form="create-client"
            disabled={
              !name.trim() || !/^[a-z0-9-]{2,40}$/.test(slug) || createClient.isPending
            }
          >
            추가
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

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
          <label className="flex flex-col gap-1.5 text-[13px] text-muted">
            이슈 이름
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="차예련 학폭 의혹"
            />
          </label>
          <div className="flex flex-col gap-1.5 text-[13px] text-muted">
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
          <label className="flex flex-col gap-1.5 text-[13px] text-muted">
            검색어 (쉼표로 구분)
            <Input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="차예련 학폭, 85년생 여배우 학폭"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] text-muted">
            감시할 브랜드 단어 (쉼표로 구분)
            <Input
              value={brandTerms}
              onChange={(e) => setBrandTerms(e.target.value)}
              placeholder="파나소닉, 나노케어, 드라이어 앰버서더"
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
