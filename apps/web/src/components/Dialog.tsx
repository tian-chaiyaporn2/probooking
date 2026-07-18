"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./Button";
import { CloseIcon } from "./icons";
import { th } from "../lib/strings";

/**
 * Accessible confirm dialog (native <dialog>). Escape and backdrop click cancel.
 * Parent owns `open`; unmount when closed.
 */
export function Dialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  confirmTestId = "dialog-confirm",
  cancelTestId = "dialog-cancel",
  busy,
  confirmDisabled,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  confirmTestId?: string;
  cancelTestId?: string;
  busy?: boolean;
  /** When true, confirm is disabled (e.g. invalid form). */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const cancel = cancelLabel ?? th.common.cancel;

  useEffect(() => {
    if (!open) return;
    const el = dialogRef.current;
    if (!el) return;
    if (!el.open) el.showModal();
    return () => {
      if (el.open) el.close();
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current && !busy) onCancel();
      }}
    >
      <div className="dialog__panel" role="document">
        <div className="dialog__head">
          <h2 id={titleId} className="dialog__title">
            {title}
          </h2>
          <button
            type="button"
            className="dialog__close"
            aria-label={th.a11y.closeDialog}
            onClick={onCancel}
            disabled={busy}
          >
            <CloseIcon />
          </button>
        </div>
        <div id={bodyId} className="dialog__body">
          {children}
        </div>
        <div className="dialog__actions">
          <Button data-testid={cancelTestId} variant="subtle" onClick={onCancel} disabled={!!busy}>
            {cancel}
          </Button>
          <Button
            data-testid={confirmTestId}
            variant="primary"
            busy={!!busy}
            disabled={!!confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
