"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ConfirmOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * `window.confirm` 대신 사용하는 dialog 기반 확인 컴포넌트.
 * 앱 루트에서 한 번만 렌더해, 시트 안에서 열어도 backdrop이 시트까지 덮는다.
 */
export const ConfirmProvider = ({ children }: { children: React.ReactNode }) => {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({
    title: "",
    description: "",
  });
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
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

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) handleClose(false);
        }}
      >
        <DialogContent
          showCloseButton={false}
          overlayClassName="z-[100]"
          className="z-[100]"
        >
          <DialogHeader>
            <DialogTitle>{options.title}</DialogTitle>
            {options.description && (
              <DialogDescription className="whitespace-pre-wrap">
                {options.description}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              {options.cancelLabel ?? "취소"}
            </Button>
            <Button
              type="button"
              variant={options.destructive ? "destructive" : "default"}
              onClick={() => handleClose(true)}
            >
              {options.confirmLabel ?? "확인"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
};

export const useConfirmDialog = () => {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("ConfirmProvider가 없습니다.");
  return { confirm, dialog: null as React.ReactNode };
};
