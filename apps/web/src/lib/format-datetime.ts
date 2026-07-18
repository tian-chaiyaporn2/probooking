/** LOC-02: store UTC, display Asia/Bangkok. */
const BANGKOK = "Asia/Bangkok";

const dateFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: BANGKOK,
  day: "numeric",
  month: "short",
  year: "numeric",
});

const timeFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: BANGKOK,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateTimeFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: BANGKOK,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatBangkokDate(ms: number): string {
  return dateFmt.format(new Date(ms));
}

export function formatBangkokTime(ms: number): string {
  return timeFmt.format(new Date(ms));
}

export function formatBangkokDateTime(ms: number): string {
  return dateTimeFmt.format(new Date(ms));
}

export function formatShiftWindow(startMs: number, endMs?: number): string {
  const start = formatBangkokDateTime(startMs);
  if (!endMs) return start;
  const sameDay = formatBangkokDate(startMs) === formatBangkokDate(endMs);
  const end = sameDay ? formatBangkokTime(endMs) : formatBangkokDateTime(endMs);
  return `${start}–${end}`;
}
