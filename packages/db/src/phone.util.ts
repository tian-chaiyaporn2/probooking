/**
 * Canonical phone form for login lookup and blind indexing. Strips common formatting and
 * normalizes Thai mobiles (0XXXXXXXXX → +66XXXXXXXXX) so equivalent numbers share one identity.
 */
export function normalizePhone(phone: string): string {
  let s = phone.trim().replace(/[\s\-().]/g, "");
  if (/^0\d{8,9}$/.test(s)) {
    s = `+66${s.slice(1)}`;
  }
  return s;
}
