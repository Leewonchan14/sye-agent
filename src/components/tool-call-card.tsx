"use client";

import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";

import { useCallback, useState } from "react";

import { Badge } from "@/components/ui/badge";

interface ToolCallCardProps {
  toolName: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  title?: string;
}

const tryFormatJson = (data: unknown): string => {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
};

const truncateJson = (data: unknown, maxLen = 200): string => {
  const formatted = tryFormatJson(data);
  if (formatted.length <= maxLen) return formatted;
  return formatted.slice(0, maxLen) + "...";
};

export const ToolCallCard = ({
  toolName,
  state,
  input,
  output,
  errorText,
  title,
}: ToolCallCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const isRunning = state === "input-streaming" || state === "input-available";
  const isError = state === "output-error";
  const isComplete = state === "output-available";
  const isDenied = state === "output-denied";

  const getStateBadge = () => {
    if (isError) {
      return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Error</Badge>;
    }
    if (isDenied) {
      return (
        <Badge className="bg-muted text-muted-foreground hover:bg-muted">Denied</Badge>
      );
    }
    if (isRunning) {
      return (
        <Badge className="gap-1 bg-blue-100 text-blue-700 hover:bg-blue-100">
          <Loader2 className="h-3 w-3 animate-spin" />
          Running
        </Badge>
      );
    }
    if (state === "approval-requested") {
      return (
        <Badge className="bg-muted text-muted-foreground hover:bg-muted">Approval</Badge>
      );
    }
    return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Done</Badge>;
  };

  const displayName = title ?? toolName;

  return (
    <div className="my-2 overflow-hidden rounded-lg border bg-card">
      {/* Header - always visible */}
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="font-mono text-xs font-medium text-foreground">
          {displayName}
        </span>
        <span className="ml-auto">{getStateBadge()}</span>
      </button>

      {/* Body - collapsible */}
      {isExpanded && (
        <div className="border-t px-3 py-2 space-y-2 text-xs">
          {/* Input */}
          {input !== undefined && input !== null && (
            <div>
              <div className="mb-1 font-medium text-muted-foreground">Input</div>
              <pre className="overflow-x-auto rounded bg-muted p-2 font-mono text-xs text-foreground">
                {isRunning && state === "input-streaming"
                  ? truncateJson(input)
                  : tryFormatJson(input)}
              </pre>
            </div>
          )}

          {/* Output */}
          {isComplete && output !== undefined && output !== null && (
            <div>
              <div className="mb-1 font-medium text-muted-foreground">Output</div>
              <pre className="overflow-x-auto rounded bg-muted p-2 font-mono text-xs text-foreground">
                {tryFormatJson(output)}
              </pre>
            </div>
          )}

          {/* Error */}
          {isError && errorText && (
            <div>
              <div className="mb-1 font-medium text-destructive">Error</div>
              <pre className="overflow-x-auto rounded bg-destructive/10 p-2 font-mono text-xs text-destructive">
                {errorText}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
