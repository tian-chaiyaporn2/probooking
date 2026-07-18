/** Thai-locale datetime helpers for party dashboards. */

const whenFmt = new Intl.DateTimeFormat("th-TH", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const rangeFmt = new Intl.DateTimeFormat("th-TH", {
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

/** Thai range for an availability window. */
export function formatWhenRange(startsAt: number, endsAt: number): string {
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return "—";
  return `${rangeFmt.format(new Date(startsAt))} – ${rangeFmt.format(new Date(endsAt))}`;
}

/** Time-of-day greeting for the professional home. */
export function greetingForHour(hour = new Date().getHours()): string {
  if (hour < 11) return "สวัสดีตอนเช้า";
  if (hour < 16) return "สวัสดีตอนบ่าย";
  return "สวัสดีตอนเย็น";
}
