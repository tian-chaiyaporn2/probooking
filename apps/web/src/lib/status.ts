import { th } from "./strings";

/** Map domain state codes to Thai labels for party dashboards. */
export function statusLabel(state: string): string {
  return th.status[state] ?? state;
}

/** One-line “what to do next” for the current state, if we have guidance. */
export function nextActionHint(state: string): string | null {
  return th.nextAction[state] ?? null;
}
