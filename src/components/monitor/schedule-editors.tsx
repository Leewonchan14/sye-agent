"use client";

import { useState } from "react";

import { RuleSwitch } from "@/components/monitor/rule-value-editors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TIME } from "@/lib/monitor/period";
import {
  clientPeriod,
  defaultCollectTime,
  earliestCollectTime,
  effectiveCollectTime,
  issueCollectSlot,
  issueCollectTimes,
  type IssueSchedule,
  MAX_ISSUE_GAP_MINUTES,
  MIN_ISSUE_GAP_MINUTES,
  nextCollectLabel,
} from "@/lib/monitor/schedule";
import type { MonitorClientView } from "@/lib/monitor/types";
import { cn } from "@/lib/utils";

/** 목록에서 고친 값을 모아 저장하는 줄. 고친 것이 없으면 보이지 않는다. */
export const SaveBar = ({
  count,
  error,
  saving,
  onCancel,
  onSave,
}: {
  count: number;
  error?: string | null;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) =>
  count > 0 ? (
    <div
      role="status"
      className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/40 bg-surface px-4 py-2.5 shadow-sm"
    >
      <p className={cn("min-w-0 text-[13px] text-body", error && "text-error")}>
        {error ?? `저장하지 않은 변경 ${count}개`}
      </p>
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          취소
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={saving || Boolean(error)}
          onClick={onSave}
        >
          저장
        </Button>
      </div>
    </div>
  ) : null;

/** 고객사 매일 자동 수집 설정 — 켜기/끄기와 수집 시각을 고르고 저장한다. */
export const AutoCollectEditor = ({
  client,
  collectedToday,
  saving,
  onSave,
}: {
  client: MonitorClientView;
  collectedToday: boolean;
  saving: boolean;
  onSave: (patch: {
    autoCollect: boolean;
    collectTime?: string | null;
    weekdaysOnly?: boolean;
  }) => void;
}) => {
  const period = clientPeriod(client.rules);
  const earliest = earliestCollectTime(period);
  const saved = effectiveCollectTime(client);
  const [auto, setAuto] = useState(client.autoCollect);
  const [time, setTime] = useState(saved);
  const [weekdays, setWeekdays] = useState(client.weekdaysOnly);

  const tooEarly = Boolean(earliest && TIME.test(time) && time < earliest);
  const validTime = TIME.test(time) && !tooEarly;
  const dirty =
    auto !== client.autoCollect ||
    (auto && (time !== saved || weekdays !== client.weekdaysOnly));
  const canSave = dirty && (!auto || validTime) && !saving;
  const collectTime = time === defaultCollectTime(period) ? null : time;

  const status = !auto
    ? dirty
      ? "저장하면 자동 수집이 꺼져요."
      : "꺼져 있어요. 켜면 다음 수집 시각부터 하치와레가 모아요."
    : dirty && validTime
      ? `저장하면 다음 수집: ${nextCollectLabel({ ...client, collectTime, weekdaysOnly: weekdays }, collectedToday)}`
      : `다음 수집: ${nextCollectLabel(client, collectedToday)}`;

  return (
    <form
      aria-label="매일 자동 수집"
      className="flex flex-col gap-3 rounded-xl border border-hairline bg-surface px-4 py-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) {
          onSave({
            autoCollect: auto,
            ...(auto && { collectTime, weekdaysOnly: weekdays }),
          });
        }
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-medium text-ink">매일 자동 수집</h2>
          <p className="mt-0.5 text-[13px] text-muted">{status}</p>
        </div>
        <RuleSwitch checked={auto} label="매일 자동 수집" onChange={setAuto} />
      </div>
      {auto && (
        <div className="flex items-center justify-between gap-4 border-t border-hairline/60 pt-3">
          <p className="min-w-0 text-[13px] text-muted">
            평일만 수집
            <span className="block text-xs text-muted-soft">
              토·일은 쉬고, 월요일에 금요일부터 모아요.
            </span>
          </p>
          <RuleSwitch checked={weekdays} label="평일만 수집" onChange={setWeekdays} />
        </div>
      )}
      {(auto || dirty) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline/60 pt-3">
          <div className="min-w-0 text-[13px] text-muted">
            {auto && (
              <>
                수집 시각
                {earliest && (
                  <span className="block text-xs text-muted-soft">
                    모니터링 기간이 끝나는 {earliest} 이후로 정할 수 있어요.
                  </span>
                )}
              </>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-2">
              {auto && (
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value.slice(0, 5))}
                  aria-label="수집 시각"
                  aria-invalid={tooEarly || undefined}
                  className="h-8 w-[136px] font-mono text-[13px] tabular-nums"
                />
              )}
              {dirty && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAuto(client.autoCollect);
                    setTime(saved);
                    setWeekdays(client.weekdaysOnly);
                  }}
                >
                  취소
                </Button>
              )}
              <Button type="submit" size="sm" disabled={!canSave}>
                저장
              </Button>
            </div>
            {auto && tooEarly && (
              <span className="text-xs text-error">
                모니터링 기간이 끝나는 {earliest} 이후로 골라 주세요.
              </span>
            )}
          </div>
        </div>
      )}
    </form>
  );
};

const GAP_UNITS = [
  { value: "hour", label: "시간마다" },
  { value: "minute", label: "분마다" },
];

/** 이슈 자동 집계 일정 — 시작 시각과 간격을 고르고 저장한다. 그날의 집계 시각을 미리 보여 준다. */
export const IssueScheduleEditor = ({
  schedule,
  saving,
  onSave,
}: {
  schedule: IssueSchedule;
  saving: boolean;
  onSave: (schedule: IssueSchedule) => void;
}) => {
  const initialUnit = schedule.collectGapMinutes % 60 === 0 ? "hour" : "minute";
  const initialAmount = String(
    schedule.collectGapMinutes / (initialUnit === "hour" ? 60 : 1)
  );
  const [start, setStart] = useState(schedule.collectStart);
  const [unit, setUnit] = useState(initialUnit);
  const [amount, setAmount] = useState(initialAmount);

  const gap = Math.round(Number(amount) * (unit === "hour" ? 60 : 1));
  const validGap = gap >= MIN_ISSUE_GAP_MINUTES && gap <= MAX_ISSUE_GAP_MINUTES;
  const valid = validGap && TIME.test(start);
  const draft = { collectStart: start, collectGapMinutes: gap };
  const times = valid ? issueCollectTimes(draft) : [];
  const dirty =
    start !== schedule.collectStart || amount !== initialAmount || unit !== initialUnit;
  const canSave =
    dirty &&
    valid &&
    !saving &&
    (start !== schedule.collectStart || gap !== schedule.collectGapMinutes);

  const reset = () => {
    setStart(schedule.collectStart);
    setUnit(initialUnit);
    setAmount(initialAmount);
  };

  return (
    <form
      aria-label="자동 집계 일정"
      className="flex flex-col gap-3 rounded-xl border border-hairline bg-surface px-4 py-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSave(draft);
      }}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h2 className="text-[15px] font-medium text-ink">자동 집계 일정</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {!valid
              ? validGap
                ? "시작 시각을 골라 주세요."
                : "간격은 30분에서 24시간 사이로 정해 주세요."
              : `${dirty ? "저장하면 다음 집계" : "다음 자동 집계"}: ${issueCollectSlot(
                  draft
                ).next.format("M월 D일 (dd) HH:mm")}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
          매일
          <Input
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value.slice(0, 5))}
            aria-label="집계 시작 시각"
            className="h-8 w-[128px] font-mono text-[13px] tabular-nums"
          />
          부터
          <Input
            type="number"
            inputMode="decimal"
            min={unit === "hour" ? 0.5 : MIN_ISSUE_GAP_MINUTES}
            step={unit === "hour" ? 0.5 : 10}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="집계 간격"
            aria-invalid={!validGap || undefined}
            className="h-8 w-20 tabular-nums"
          />
          <Select
            items={GAP_UNITS}
            value={unit}
            onValueChange={(next) => setUnit(String(next))}
          >
            <SelectTrigger className="h-8" aria-label="간격 단위">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GAP_UNITS.map((u) => (
                <SelectItem key={u.value} value={u.value}>
                  {u.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline/60 pt-3">
        <p className="min-w-0 text-xs text-muted">
          {times.length > 0 && (
            <>
              하루 {times.length}번 ·{" "}
              <span className="font-mono tabular-nums">
                {times.slice(0, 8).join(" · ")}
                {times.length > 8 && ` 외 ${times.length - 8}번`}
              </span>
            </>
          )}
        </p>
        <div className="flex items-center gap-2">
          {dirty && (
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              취소
            </Button>
          )}
          <Button type="submit" size="sm" disabled={!canSave}>
            저장
          </Button>
        </div>
      </div>
    </form>
  );
};

/** 이슈 보고 초안의 받는 사람과 서식 — 하치와레가 보고 초안을 쓸 때 그대로 따른다. */
export const IssueReportEditor = ({
  recipient,
  template,
  saving,
  onSave,
}: {
  recipient: string;
  template: string;
  saving: boolean;
  onSave: (report: { reportRecipient: string; reportTemplate: string }) => void;
}) => {
  const [name, setName] = useState(recipient);
  const [body, setBody] = useState(template);
  const dirty = name !== recipient || body !== template;

  return (
    <form
      aria-label="보고 서식"
      className="flex flex-col gap-3 rounded-xl border border-hairline bg-surface px-4 py-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty && !saving)
          onSave({ reportRecipient: name.trim(), reportTemplate: body });
      }}
    >
      <div>
        <h2 className="text-[15px] font-medium text-ink">보고 서식</h2>
        <p className="mt-0.5 text-[13px] text-muted">
          보고 초안을 만들 때 하치와레가 이 내용을 따라 써요.
        </p>
      </div>
      <label className="flex flex-col gap-1.5 text-[13px] text-muted">
        받는 사람
        <Input
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 김슬기 매니저님 (비우면 담당 매니저님)"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] text-muted">
        서식 (선택)
        <Textarea
          rows={4}
          maxLength={4000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="예: 11/3(화) 15시 기준, 현재까지 파나소닉 언급 관련 추가 게재 기사는… 처럼 실제로 보내던 보고문을 붙여 넣어 주세요."
        />
      </label>
      <div className="flex justify-end gap-2">
        {dirty && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setName(recipient);
              setBody(template);
            }}
          >
            취소
          </Button>
        )}
        <Button type="submit" size="sm" disabled={!dirty || saving}>
          저장
        </Button>
      </div>
    </form>
  );
};
