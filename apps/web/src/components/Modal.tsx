"use client";

import type { ReactNode } from "react";

export function Modal({
  title,
  label,
  children,
  onClose,
  testId,
  wide,
}: {
  title: string;
  label?: string;
  children: ReactNode;
  onClose?: () => void;
  testId?: string;
  wide?: boolean;
}) {
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={label ?? title}
      data-testid={testId}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className={`modal card card--pad${wide ? " modal--wide" : ""}`}>
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
