"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
    setToasts((list) => list.filter((x) => x.id !== id));
  }, []);

  useEffect(() => {
    return () => {
      for (const t of timers.current.values()) clearTimeout(t);
      timers.current.clear();
    };
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((t) => [...t, { id, kind, message }]);
      // Errors linger longer than confirmations.
      const handle = setTimeout(
        () => dismiss(id),
        kind === "error" ? 7000 : 4000,
      );
      timers.current.set(id, handle);
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

  // Chronological order; live-region role still follows kind.
  const ordered = toasts;

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="toast-viewport"
        role="region"
        aria-label={th.a11y.notifications}
      >
        <div className="toast-stack" aria-live="assertive" aria-relevant="additions text">
          {ordered
            .filter((t) => t.kind === "error")
            .map((t) => (
              <div
                key={t.id}
                className="toast toast--error"
                data-testid="toast-error"
              >
                <span className="toast__icon" aria-hidden>
                  <AlertIcon />
                </span>
                <span className="toast__msg">{t.message}</span>
                <button
                  type="button"
                  className="toast__close"
                  aria-label={th.a11y.dismissNotification}
                  onClick={() => dismiss(t.id)}
                >
                  <CloseIcon />
                </button>
              </div>
            ))}
        </div>
        <div className="toast-stack" aria-live="polite" aria-relevant="additions text">
          {ordered
            .filter((t) => t.kind === "success")
            .map((t) => (
              <div
                key={t.id}
                className="toast toast--success"
                data-testid="toast-success"
              >
                <span className="toast__icon" aria-hidden>
                  <CheckIcon />
                </span>
                <span className="toast__msg">{t.message}</span>
                <button
                  type="button"
                  className="toast__close"
                  aria-label={th.a11y.dismissNotification}
                  onClick={() => dismiss(t.id)}
                >
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
