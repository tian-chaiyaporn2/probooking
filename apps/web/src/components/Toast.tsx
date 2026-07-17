"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { th } from "../lib/strings";
import { AlertIcon, CheckIcon, CloseIcon } from "./icons";

type ToastKind = "error" | "success";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  error: (message: string) => void;
  success: (message: string) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Toast notifications — feedback that doesn't shove the layout around (replaces inline error text). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((t) => [...t, { id, kind, message }]);
      // Errors linger longer than confirmations.
      setTimeout(() => dismiss(id), kind === "error" ? 7000 : 4000);
    },
    [dismiss],
  );

  // Stable identity so pages can safely list `toast` in effect/callback deps.
  const api = useMemo<ToastApi>(
    () => ({
      error: (m) => push("error", m),
      success: (m) => push("success", m),
      dismiss,
    }),
    [push, dismiss],
  );

  const errors = toasts.filter((t) => t.kind === "error");
  const successes = toasts.filter((t) => t.kind === "success");

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-viewport" role="region" aria-label={th.a11y.notifications}>
        <div className="toast-stack" aria-live="assertive">
          {errors.map((t) => (
            <div key={t.id} className="toast toast--error" data-testid="toast-error" role="alert">
              <span className="toast__icon" aria-hidden>
                <AlertIcon />
              </span>
              <span className="toast__msg">{t.message}</span>
              <button type="button" className="toast__close" aria-label={th.a11y.dismissNotification} onClick={() => dismiss(t.id)}>
                <CloseIcon />
              </button>
            </div>
          ))}
        </div>
        <div className="toast-stack" aria-live="polite">
          {successes.map((t) => (
            <div key={t.id} className="toast toast--success" data-testid="toast-success" role="status">
              <span className="toast__icon" aria-hidden>
                <CheckIcon />
              </span>
              <span className="toast__msg">{t.message}</span>
              <button type="button" className="toast__close" aria-label={th.a11y.dismissNotification} onClick={() => dismiss(t.id)}>
                <CloseIcon />
              </button>
            </div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
