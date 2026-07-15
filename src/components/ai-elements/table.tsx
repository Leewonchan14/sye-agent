"use client";

import { useCallback, useRef, useState } from "react";

import type { ExtraProps } from "streamdown";
import { CheckIcon, CopyIcon, DownloadIcon, ExpandIcon } from "lucide-react";
import {
  extractTableDataFromElement,
  tableDataToCSV,
  tableDataToMarkdown,
  tableDataToTSV,
} from "streamdown";

import {
  Dialog,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type TableWrapperProps = React.DetailedHTMLProps<
  React.TableHTMLAttributes<HTMLTableElement>,
  HTMLTableElement
> &
  ExtraProps;

const triggerClass =
  "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer";

export const TableWrapper = ({
  children,
  className,
}: TableWrapperProps) => {
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  const getTableData = useCallback(() => {
    const el = tableContainerRef.current?.querySelector(
      'table[data-streamdown="table"]',
    );
    if (!el) return null;
    return extractTableDataFromElement(el as HTMLElement);
  }, []);

  const handleCopy = useCallback(
    async (format: "csv" | "tsv" | "md") => {
      const data = getTableData();
      if (!data) return;

      let text: string;
      switch (format) {
        case "csv":
          text = tableDataToCSV(data);
          break;
        case "tsv":
          text = tableDataToTSV(data);
          break;
        default:
          text = tableDataToMarkdown(data);
          break;
      }

      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // clipboard unavailable
      }
    },
    [getTableData],
  );

  const handleDownload = useCallback(
    (format: "csv" | "markdown") => {
      const data = getTableData();
      if (!data) return;

      const text =
        format === "csv" ? tableDataToCSV(data) : tableDataToMarkdown(data);
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `table.${format === "csv" ? "csv" : "md"}`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [getTableData],
  );

  return (
    <div
      ref={tableContainerRef}
      data-streamdown="table-wrapper"
      className={cn(
        "my-4 flex flex-col gap-2 rounded-lg border border-border bg-sidebar p-2",
        className,
      )}
    >
      {/* Toolbar — shadcn DropdownMenu uses @base-ui with built-in portal */}
      <div className="flex items-center justify-end gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger className={triggerClass} aria-label="Copy table">
            {copied ? (
              <CheckIcon className="size-4 text-green-500" />
            ) : (
              <CopyIcon className="size-4" />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={4}>
            <DropdownMenuItem onClick={() => handleCopy("md")}>
              Copy as Markdown
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleCopy("csv")}>
              Copy as CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleCopy("tsv")}>
              Copy as TSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger
            className={triggerClass}
            aria-label="Download table"
          >
            <DownloadIcon className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={4}>
            <DropdownMenuItem onClick={() => handleDownload("csv")}>
              Download as CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDownload("markdown")}>
              Download as Markdown
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          className={triggerClass}
          aria-label="View fullscreen"
          onClick={() => setFullscreenOpen(true)}
        >
          <ExpandIcon className="size-4" />
        </button>
      </div>

      {/* Table container */}
      <div className="overflow-x-auto overflow-y-auto rounded-md border border-border bg-background">
        <table
          data-streamdown="table"
          className="w-full divide-y divide-border"
        >
          {children}
        </table>
      </div>

      {/* Fullscreen Dialog — shadcn Dialog uses @base-ui with built-in portal */}
      <Dialog open={fullscreenOpen} onOpenChange={setFullscreenOpen}>
        <DialogPortal>
          <DialogOverlay />
          <DialogContent
            className="flex max-h-[95vh] max-w-[95vw] flex-col"
            showCloseButton
          >
            <DialogTitle className="sr-only">Table fullscreen view</DialogTitle>
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full divide-y divide-border border-collapse">
                {children}
              </table>
            </div>
          </DialogContent>
        </DialogPortal>
      </Dialog>
    </div>
  );
};
