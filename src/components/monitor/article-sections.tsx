"use client";

import {
  Ban,
  ChevronRight,
  ExternalLink,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { useState } from "react";

import { ToneMenu } from "@/components/monitor/tone-badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { kst } from "@/lib/kst";
import type { useMonitorMutations } from "@/lib/monitor/queries";
import { preferredLink, reporterLabel } from "@/lib/monitor/report";
import type {
  MonitorCategory,
  MonitorClientView,
  MonitorItemView,
  MonitorRunView,
} from "@/lib/monitor/types";
import { getReporterGap } from "@/lib/monitor/types";
import { cn } from "@/lib/utils";

type Mutations = ReturnType<typeof useMonitorMutations>;

interface Props {
  client: MonitorClientView;
  run: MonitorRunView;
  items: MonitorItemView[];
  mutations: Mutations;
  onAskMore: (category: MonitorCategory) => void;
}

const FLAG_LABEL: Record<string, { label: string; tone: string }> = {
  new: { label: "방금 찾음", tone: "bg-primary/10 text-primary" },
  dup: { label: "같은 보도자료", tone: "bg-muted text-muted-foreground" },
  reported: { label: "이전에 보고함", tone: "bg-warning/15 text-warning" },
  "over-limit": { label: "최대 건수 초과", tone: "bg-muted text-muted-foreground" },
  blocked: { label: "원문 차단", tone: "bg-destructive/10 text-destructive" },
};

const Pill = ({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) => (
  <span
    className={cn(
      "inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-medium whitespace-nowrap",
      className
    )}
  >
    {children}
  </span>
);

const ItemTime = ({ iso }: { iso: string | null }) => (
  <div className="pt-0.5 font-mono text-[12px] leading-snug text-muted-foreground tabular-nums">
    {iso ? (
      <>
        {kst(iso).format("MM.DD")}
        <br />
        {kst(iso).format("HH:mm")}
      </>
    ) : (
      "시각 미확인"
    )}
  </div>
);

const ItemRow = ({
  item,
  client,
  run,
  group,
  mutations,
}: {
  item: MonitorItemView;
  client: MonitorClientView;
  run: MonitorRunView;
  group: MonitorItemView[];
  mutations: Mutations;
}) => {
  const [groupOpen, setGroupOpen] = useState(false);
  const preferNaver = client.rules.some((r) => r.id === "naver-link" && r.value === true);
  const link = preferredLink(item, preferNaver);
  const categoryOptions = client.categories.map((c) => ({ value: c.key, label: c.name }));
  const subs = client.categories.find((c) => c.key === item.category)?.subs;
  const reporterGap = getReporterGap(item.flags);

  return (
    <div
      className={cn(
        "grid grid-cols-[24px_minmax(0,1fr)] gap-x-3 gap-y-2 border-t border-border/60 px-4 py-3.5 transition-colors first:border-t-0 hover:bg-muted sm:grid-cols-[24px_56px_minmax(0,1fr)_auto]",
        item.flags.includes("new") && "bg-primary/5"
      )}
    >
      <input
        type="checkbox"
        className="row-span-2 mt-1 size-4 cursor-pointer accent-[var(--primary)] sm:row-span-1"
        checked={item.included}
        aria-label="리포트에 포함"
        onChange={(e) =>
          mutations.updateItem.mutate({ id: item.id, included: e.target.checked })
        }
      />
      <ItemTime iso={item.publishedAt} />

      <div
        className={cn(
          "col-start-2 flex min-w-0 flex-col gap-1 sm:col-start-auto",
          !item.included && "opacity-55"
        )}
      >
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[15px] leading-snug font-medium break-words text-foreground hover:underline hover:underline-offset-4"
        >
          {item.title}
        </a>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground">{item.media}</span>
          <span>{item.reporter ? reporterLabel(item.reporter) : "기자 미확인"}</span>
          <ToneMenu
            sentiment={item.sentiment}
            importance={item.importance}
            onChange={(patch) => mutations.updateItem.mutate({ id: item.id, ...patch })}
          />
          {item.subcategory && <span>{item.subcategory}</span>}
          {group.length > 0 && (
            <Pill className="bg-primary/10 text-primary">
              보도자료 {group.length + 1}건 묶음
            </Pill>
          )}
          {item.flags.map(
            (f) =>
              FLAG_LABEL[f] && (
                <Pill key={f} className={FLAG_LABEL[f].tone}>
                  {FLAG_LABEL[f].label}
                </Pill>
              )
          )}
          {!item.reporter && reporterGap && (
            <Pill className="bg-warning/15 text-warning">{reporterGap.label}</Pill>
          )}
          {!item.reporter && !reporterGap && !item.flags.includes("blocked") && (
            <Pill className="bg-warning/15 text-warning">기자 확인 필요</Pill>
          )}
        </div>
        {item.reason && (
          <p className="flex items-baseline gap-1.5 text-[13px] text-foreground">
            <Sparkles className="size-3 shrink-0 translate-y-0.5 text-primary" />
            <span>{item.reason}</span>
          </p>
        )}
        {group.length > 0 && (
          <div className="mt-1">
            <button
              type="button"
              aria-expanded={groupOpen}
              onClick={() => setGroupOpen((o) => !o)}
              className="flex items-center gap-1.5 text-[13px] font-medium text-primary"
            >
              <ChevronRight
                className={cn("size-3.5 transition-transform", groupOpen && "rotate-90")}
              />
              같은 보도자료를 실은 매체 {group.length}곳 {groupOpen ? "접기" : "펼치기"}
            </button>
            {groupOpen && (
              <ul className="mt-2 grid gap-1">
                {group.map((g) => (
                  <li
                    key={g.id}
                    className="grid gap-x-3 text-[13px] text-foreground sm:grid-cols-[88px_104px_minmax(0,1fr)]"
                  >
                    <span className="font-mono text-[12px] text-muted-foreground tabular-nums">
                      {g.publishedAt ? kst(g.publishedAt).format("MM.DD HH:mm") : "—"}
                    </span>
                    <span>{g.media}</span>
                    <a
                      href={preferredLink(g, preferNaver)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate hover:underline"
                      title={g.title}
                    >
                      {g.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="col-start-2 flex flex-col gap-2 sm:col-start-auto sm:items-end">
        <span
          className="inline-flex items-center gap-1.5 font-mono text-[12px] whitespace-nowrap text-muted-foreground tabular-nums"
          title="AI 관련도"
        >
          관련도 {item.score}
          <span className="h-1 w-10 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${item.score}%` }}
            />
          </span>
        </span>
        <div className="flex w-full min-w-0 items-center gap-1 sm:w-auto">
          {subs?.length ? (
            <Select
              items={subs.map((s) => ({ value: s, label: s }))}
              value={item.subcategory ?? null}
              onValueChange={(value) =>
                mutations.updateItem.mutate({ id: item.id, subcategory: value as string })
              }
            >
              <SelectTrigger
                size="sm"
                className="w-full min-w-0 flex-1 text-[12px] sm:w-[104px] sm:flex-none"
                aria-label="세부 분류"
              >
                <SelectValue placeholder="세부 분류" />
              </SelectTrigger>
              <SelectContent>
                {subs.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Select
            items={categoryOptions}
            value={item.category}
            onValueChange={(value) =>
              mutations.updateItem.mutate({
                id: item.id,
                category: value as string,
                subcategory: null,
              })
            }
          >
            <SelectTrigger
              size="sm"
              className="w-full min-w-0 flex-1 text-[12px] sm:w-[148px] sm:flex-none"
              aria-label="카테고리 이동"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${item.media} 항상 제외`}
                  onClick={() =>
                    mutations.banMedia.mutate({ runId: run.id, media: item.media })
                  }
                />
              }
            >
              <Ban />
            </TooltipTrigger>
            <TooltipContent>이 매체 항상 제외</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};

const GoalMeter = ({ count, goal }: { count: number; goal: number | null }) => {
  if (goal === null) {
    return (
      <span className="text-[13px] text-muted-foreground">
        전수 집계 · 대표 {count}건
      </span>
    );
  }
  const short = count < goal;
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <span
          className={cn("block h-full rounded-full bg-success", short && "bg-warning")}
          style={{ width: `${goal ? Math.min(100, (count / goal) * 100) : 100}%` }}
        />
      </span>
      <span className="font-mono tabular-nums">
        {count} / {goal}
      </span>
      <span>{short ? `${goal - count}건 부족` : "목표 충족"}</span>
    </span>
  );
};

/** 부정 논조이거나 중요도가 높은 기사 — 먼저 확인해야 할 기사 */
const needsAttention = (item: MonitorItemView) =>
  item.sentiment === "negative" || item.importance === "high";

export const ArticleSections = ({ client, run, items, mutations, onAskMore }: Props) => {
  const [attentionOnly, setAttentionOnly] = useState(false);
  // 카테고리를 지우면 그 안의 기사는 제외 후보로 보여서 다시 분류할 수 있게 한다.
  const categoryKeys = new Set(client.categories.map((c) => c.key));
  const excluded = items.filter((i) => !i.category || !categoryKeys.has(i.category));
  const pending = Boolean(run.pendingSince);
  const reportedCount = items.filter(
    (i) => i.flags.includes("reported") && !i.included
  ).length;
  const picked = items.filter(
    (i) => i.category && categoryKeys.has(i.category) && (i.isLead || !i.dupGroup)
  );
  const negative = picked.filter((i) => i.sentiment === "negative").length;
  const important = picked.filter((i) => i.importance === "high").length;
  const attention = picked.filter(needsAttention).length;

  return (
    <div className="flex flex-col gap-8">
      {reportedCount > 0 && (
        <p className="rounded-xl bg-warning/10 px-4 py-2.5 text-[13px] text-foreground">
          이전에 보고한 기사 {reportedCount}건은 체크를 해제해 뒀어요. 다시 보내려면
          체크해 주세요.
        </p>
      )}
      {attention > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-[13px] text-foreground">
          <TriangleAlert className="size-4 shrink-0 text-destructive" />
          <span>
            먼저 볼 기사{" "}
            {[negative && `부정 ${negative}건`, important && `중요 ${important}건`]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <span className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            aria-pressed={attentionOnly}
            onClick={() => setAttentionOnly((v) => !v)}
          >
            {attentionOnly ? "전체 보기" : "부정·중요만 보기"}
          </Button>
        </div>
      )}
      {client.categories.map((category) => {
        const all = items.filter((i) => i.category === category.key);
        const allLeads = all.filter((i) => i.isLead || !i.dupGroup);
        const leads =
          attentionOnly && attention > 0 ? allLeads.filter(needsAttention) : allLeads;
        const included = allLeads.filter((i) => i.included).length;
        const total = all.length;

        return (
          <section key={category.key} aria-labelledby={`cat-${category.key}`}>
            <div className="mb-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
              <h2
                id={`cat-${category.key}`}
                className="text-lg font-medium text-foreground"
              >
                {category.name}
              </h2>
              <GoalMeter count={included} goal={category.goal} />
              {category.goal === null && total > allLeads.length && (
                <span className="text-[13px] text-muted-foreground">
                  전재 포함 총 {total}건
                </span>
              )}
              <span className="flex-1" />
              {category.goal !== null && included < category.goal && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => onAskMore(category)}
                >
                  <Sparkles /> 더 찾기
                </Button>
              )}
            </div>
            {leads.length ? (
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                {leads.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    client={client}
                    run={run}
                    group={
                      item.dupGroup
                        ? all.filter(
                            (g) => g.dupGroup === item.dupGroup && g.id !== item.id
                          )
                        : []
                    }
                    mutations={mutations}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                {allLeads.length
                  ? "이 카테고리에는 부정·중요 기사가 없어요."
                  : "이 카테고리로 분류된 기사가 아직 없어요."}
              </p>
            )}
          </section>
        );
      })}

      {excluded.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-muted-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 text-primary transition-transform group-open:rotate-90" />
            AI가 제외한 후보{" "}
            <span className="font-mono text-foreground">{excluded.length}</span>건
            <Pill className="bg-muted text-muted-foreground">
              규칙으로 제외 {excluded.filter((x) => x.excludedRule).length}
            </Pill>
            {excluded.some((x) => x.category && !categoryKeys.has(x.category)) && (
              <Pill className="bg-muted text-muted-foreground">
                지운 카테고리{" "}
                {
                  excluded.filter((x) => x.category && !categoryKeys.has(x.category))
                    .length
                }
              </Pill>
            )}
          </summary>
          <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
            {excluded.map((x) => (
              <div
                key={x.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-t border-border/60 px-4 py-3 first:border-t-0"
              >
                <div className="flex min-w-0 flex-col gap-1 opacity-70">
                  <a
                    href={x.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium break-words text-foreground hover:underline"
                  >
                    {x.title} <ExternalLink className="inline size-3" />
                  </a>
                  <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                    <span className="text-foreground">{x.media}</span>
                    {x.excludedRule && <Pill className="bg-muted">{x.excludedRule}</Pill>}
                    {x.category && !categoryKeys.has(x.category) ? (
                      <Pill className="bg-muted">지운 카테고리</Pill>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <X className="size-3" />
                        {x.excludedReason}
                      </span>
                    )}
                  </div>
                </div>
                <Select
                  items={client.categories.map((c) => ({ value: c.key, label: c.name }))}
                  value={null}
                  onValueChange={(value) =>
                    mutations.updateItem.mutate({
                      id: x.id,
                      category: String(value),
                      included: true,
                    })
                  }
                >
                  <SelectTrigger
                    size="sm"
                    className="text-[12px]"
                    aria-label="다시 포함할 카테고리"
                  >
                    <SelectValue placeholder="다시 포함" />
                  </SelectTrigger>
                  <SelectContent>
                    {client.categories.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};
