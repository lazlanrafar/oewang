"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";

import { Button } from "@workspace/ui";

export interface ConfirmOptions {
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export type ConfirmFn = (options?: ConfirmOptions) => Promise<boolean>;

const ConfirmModalContext = createContext<ConfirmFn | null>(null);

export function ConfirmModalProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions>({});
  const [visible, setVisible] = useState(false);
  const resolveRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions = {}): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setOpts(options);
      setVisible(true);
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setVisible(false);
  }, []);

  // Close on Escape key
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") settle(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [visible, settle]);

  return (
    <ConfirmModalContext.Provider value={confirm}>
      {children}

      {visible && (
        // Backdrop — click outside = cancel
        <div
          className="fixed inset-0 z-9999 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
          onPointerDown={() => settle(false)}
        >
          {/* Panel — stop propagation so clicks inside don't dismiss */}
          <div
            className="mx-4 w-full max-w-sm space-y-4 border border-border bg-background p-6"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              <h2 className="font-normal font-serif text-xl">{opts.title ?? "Are you absolutely sure?"}</h2>
              <p className="text-muted-foreground text-sm">{opts.description ?? "This action cannot be undone."}</p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                className="h-10 rounded-none font-medium text-xs uppercase tracking-widest"
                onClick={() => settle(false)}
              >
                {opts.cancelLabel ?? "Cancel"}
              </Button>
              <Button
                className={
                  opts.destructive
                    ? "h-10 rounded-none bg-destructive font-medium text-destructive-foreground text-xs uppercase tracking-widest hover:bg-destructive/90"
                    : "h-10 rounded-none font-medium text-xs uppercase tracking-widest"
                }
                onClick={() => settle(true)}
              >
                {opts.confirmLabel ?? "Confirm"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmModalContext.Provider>
  );
}

/**
 * Returns an imperative confirm function.
 * Resolves `true` on confirm, `false` on cancel/dismiss.
 *
 * @example
 * const confirm = useConfirm();
 * if (await confirm({ title: "Delete?", destructive: true })) doDelete();
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmModalContext);
  if (!ctx) throw new Error("useConfirm must be used within <ConfirmModalProvider>");
  return ctx;
}
