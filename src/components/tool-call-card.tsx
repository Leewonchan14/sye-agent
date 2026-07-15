"use client";

import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";

import { useCallback, useState } from "react";

const fmt = (d: unknown): string => {
  try {
    return JSON.stringify(d, null, 2);
  } catch {
    return String(d);
  }
};

interface Props {
  toolName: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  title?: string;
}

export const ToolCallCard = ({
  toolName,
  state,
  input,
  output,
  errorText,
  title,
}: Props) => {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((p) => !p), []);

  const isRunning = state === "input-streaming" || state === "input-available";
  const isError = state === "output-error";
  const isDone = state === "output-available";

  return (
    <div
      className="my-1 overflow-hidden rounded-lg border"
      style={{
        borderColor: "var(--color-hairline)",
        backgroundColor: "var(--color-canvas-soft)",
      }}
    >
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
      >
        {open ? (
          <ChevronDown
            className="h-4 w-4 shrink-0"
            style={{ color: "var(--color-muted)" }}
          />
        ) : (
          <ChevronRight
            className="h-4 w-4 shrink-0"
            style={{ color: "var(--color-muted)" }}
          />
        )}
        <span
          className="font-mono text-xs font-medium"
          style={{ color: "var(--color-ink)" }}
        >
          {title ?? toolName}
        </span>
        <span className="ml-auto">
          {isError && <Badge color="var(--color-error)" label="Error" />}
          {isRunning && (
            <Badge
              color="var(--color-primary)"
              label="Running"
              icon={<Loader2 className="h-3 w-3 animate-spin" />}
            />
          )}
          {isDone && <Badge color="var(--color-success)" label="Done" />}
        </span>
      </button>
      {open && (
        <div
          className="space-y-2 px-3 py-2 text-xs"
          style={{ borderTop: "1px solid var(--color-hairline)" }}
        >
          {input != null && <Section label="Input" body={fmt(input)} />}
          {isDone && output != null && <Section label="Output" body={fmt(output)} />}
          {isError && errorText && <Section label="Error" body={errorText} error />}
        </div>
      )}
    </div>
  );
};

const Badge = ({
  color,
  label,
  icon,
}: {
  color: string;
  label: string;
  icon?: React.ReactNode;
}) => (
  <span
    className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
    style={{ backgroundColor: color }}
  >
    {icon}
    {label}
  </span>
);

const Section = ({
  label,
  body,
  error,
}: {
  label: string;
  body: string;
  error?: boolean;
}) => (
  <div>
    <div
      className="mb-1 font-medium"
      style={{ color: error ? "var(--color-error)" : "var(--color-muted)" }}
    >
      {label}
    </div>
    <pre
      className="overflow-x-auto rounded p-2 font-mono text-xs"
      style={{
        backgroundColor: "var(--color-canvas)",
        color: "var(--color-ink)",
        ...(error
          ? { backgroundColor: "var(--color-error)", color: "#fff", opacity: 0.1 }
          : {}),
      }}
    >
      {body}
    </pre>
  </div>
);
