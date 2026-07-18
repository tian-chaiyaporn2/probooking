/** Thai-locale datetime helpers for party dashboards. */

const whenFmt = new Intl.DateTimeFormat("th-TH", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** Compact Thai date+time for shift starts / offer expiry (ms epoch). */
export function formatWhen(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return whenFmt.format(new Date(ms));
}
