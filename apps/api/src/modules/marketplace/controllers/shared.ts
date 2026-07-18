import type { ShiftUrgency } from "@probook/domain";

/** Shared constants + DTOs for the marketplace HTTP controllers. */

export const HOUR_MS = 60 * 60 * 1000;

/**
 * Render a CSV cell: RFC-4180 quoting plus formula-injection defence — a cell that
 * begins with = + - @ (or a control char) is prefixed with a single quote so a
 * spreadsheet treats it as text, not an executable formula.
 */
export const csvCell = (v: string | number): string => {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export interface PostShiftDto {
  clinicWorkspaceId: string;
  compensation: number; // integer satang
  category?: string;
  urgency?: ShiftUrgency;
  insuranceRequired?: boolean;
  shiftStartInHours?: number;
}
