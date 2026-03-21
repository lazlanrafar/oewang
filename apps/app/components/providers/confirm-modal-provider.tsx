"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  useEffect,
  type ReactNode,
} from "react";
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
          onMouseDown={() => settle(false)}
        >
          {/* Panel — stop propagation so clicks inside don't dismiss */}
          <div
            className="bg-background border border-border w-full max-w-sm mx-4 p-6 space-y-4"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              <h2 className="font-serif text-xl font-normal">
                {opts.title ?? "Are you absolutely sure?"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {opts.description ?? "This action cannot be undone."}
              </p>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button
                variant="outline"
                className="rounded-none h-10 uppercase text-xs tracking-widest font-medium"
                onClick={() => settle(false)}
              >
                {opts.cancelLabel ?? "Cancel"}
              </Button>
              <Button
                className={
                  opts.destructive
                    ? "rounded-none h-10 uppercase text-xs tracking-widest font-medium bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                    : "rounded-none h-10 uppercase text-xs tracking-widest font-medium"
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
