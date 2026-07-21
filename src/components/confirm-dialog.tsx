"use client";

import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ConfirmDialogOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

/**
 * `window.confirm` 대신 사용하는 dialog 기반 확인 컴포넌트.
 * useConfirmDialog() 훅으로 열고 닫습니다.
 */
export const useConfirmDialog = () => {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmDialogOptions>({
    title: "",
    description: "",
  });
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmDialogOptions): Promise<boolean> => {
    setOptions(opts);
    setOpen(true);

    const { promise, resolve } = Promise.withResolvers<boolean>();
    resolveRef.current = resolve;
    return promise;
  }, []);

  const handleClose = useCallback((confirmed: boolean) => {
    setOpen(false);
    resolveRef.current?.(confirmed);
    resolveRef.current = null;
  }, []);

  const dialog = (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose(false);
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{options.title}</DialogTitle>
          {options.description && (
            <DialogDescription className="whitespace-pre-wrap">
              {options.description}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => handleClose(false)}>
            {options.cancelLabel ?? "취소"}
          </Button>
          <Button
            variant={options.destructive ? "destructive" : "default"}
            onClick={() => handleClose(true)}
          >
            {options.confirmLabel ?? "확인"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return { confirm, dialog };
};
