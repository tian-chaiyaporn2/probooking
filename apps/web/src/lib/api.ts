// Thin client for the ProBooking API. Base URL is inlined at build for the browser.
import { formatThb as formatThbDomain } from "@probook/domain";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

/**
 * Re-export domain money formatting so UI and API share one satang→THB rule (LOC-02).
 * Prefer this over a local float division that can drift from `packages/domain`.
 */
export const formatThb = (s: number) => formatThbDomain(s);

function authHeaders(base: Record<string, string> = {}, token?: string): Record<string, string> {
  return token ? { ...base, authorization: `Bearer ${token}` } : base;
}

/**
 * Turn a non-OK response into a human error. The API returns Nest's JSON envelope
 * ({ statusCode, message, error }), so surfacing the raw body dumped things like
 * `429: {"statusCode":429,"message":"too many OTP requests…"}` into toasts and the login
 * form. Prefer the `message`; fall back to the raw text only if it is not that shape.
 */
async function errorFrom(res: Response): Promise<Error> {
  const text = await res.text();
  try {
    const body = JSON.parse(text) as { message?: string | string[] };
    const msg = Array.isArray(body.message) ? body.message.join("; ") : body.message;
    if (msg) return new Error(msg);
  } catch {
    // not JSON — fall through to the raw text
  }
  return new Error(text || `Request failed (${res.status})`);
}

async function post<T>(path: string, body?: unknown, token?: string): Promise<T> {
  const init: RequestInit = {
    method: "POST",
    headers: authHeaders({ "content-type": "application/json" }, token),
    // Don't hang forever on a dead API/tunnel — surface an error the UI can show.
    signal: AbortSignal.timeout(15_000),
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) throw await errorFrom(res);
  return res.json() as Promise<T>;
}

async function get<T>(path: string, token?: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: authHeaders({}, token),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw await errorFrom(res);
  return res.json() as Promise<T>;
}

/**
 * Dev-only: obtain an internal role token so the ops/finance dashboards can call
 * guarded endpoints. Absent in production (the route 404s) — the dashboards must then use
 * the real OTP + access-list login.
 */
export const getDevToken = (role: "operations" | "finance" | "administrator") =>
  post<{ token: string; role: string }>("/auth/dev/token", { role });

/**
 * Request an OTP for a phone. Returns the code ONLY under AUTH_DEV_MODE (so the demo can
 * complete a login without an SMS partner); in production it returns undefined and the code
 * arrives by SMS.
 */
export const requestOtp = (phone: string) =>
  post<{ sent: boolean; devCode?: string }>("/auth/otp/request", { phone });

/** Verify an OTP code and receive a session token carrying whatever role the phone resolves to. */
export const verifyOtp = (phone: string, code: string) =>
  post<{ token: string; role: string }>("/auth/otp/verify", { phone, code });

/** Revoke the presented token so it cannot be reused (even before expiry). */
export const logout = (token: string) => post<{ revoked: boolean }>("/auth/logout", undefined, token);

/**
 * One-shot login for the demo flow, where the code is echoed back under AUTH_DEV_MODE.
 * In production `requestOtp` returns no code, so callers must collect it from SMS and call
 * `verifyOtp` — a login that hands you the code is not a login.
 */
export async function loginAs(phone: string): Promise<string> {
  const { devCode } = await requestOtp(phone);
  if (!devCode) {
    throw new Error("OTP code was not returned — set AUTH_DEV_MODE=true for the demo flow");
  }
  const { token, role } = await verifyOtp(phone, devCode);
  void role;
  return token;
}

export interface Checkout {
  compensation: number;
  serviceFee: number;
  tax: number;
  total: number;
}

export interface OfferCreated {
  id: string;
  state: string;
  expiresAt: number;
  checkout: Checkout;
}

export interface Accepted {
  id: string;
  state: string;
  fundingDueAt: number;
}

export interface Confirmed {
  booking: { id: string; state: string; shiftId: string; professionalId: string };
  checkout: Checkout;
}

export interface Registered {
  id: string;
  verification: string;
}

export const registerClinic = (input: {
  branchName: string;
  licenceNo: string;
  address: string;
  ownerPhone: string;
}) => post<Registered>("/clinics", input);

export const registerProfessional = (input: {
  displayName: string;
  profession: string;
  phone: string;
  payoutRef: string;
}) => post<Registered>("/professionals", input);

export const verifyClinic = (id: string, token: string) =>
  post<Registered>(`/ops/clinics/${id}/verify`, undefined, token);
export const verifyProfessional = (id: string, token: string) =>
  post<Registered>(`/ops/professionals/${id}/verify`, undefined, token);

// Each action below is taken BY someone: the caller passes the token of the party acting.
// The API derives authority from that token, so passing the wrong one is a 403 rather than
// a silently mis-attributed action.
export const postShift = (
  input: {
    clinicWorkspaceId: string;
    compensation: number;
    category?: string;
    urgency?: "standard" | "urgent";
  },
  token: string,
) => post<{ shiftId: string; state: string; urgent: boolean }>("/shifts", input, token);

export const applyToShift = (shiftId: string, professionalId: string, token: string) =>
  post<{ id: string; state: string }>(`/shifts/${shiftId}/apply`, { professionalId }, token);

export const offerToProfessional = (shiftId: string, professionalId: string, token: string) =>
  post<OfferCreated>(`/shifts/${shiftId}/offer`, { professionalId }, token);

export const acceptOffer = (id: string, token: string) =>
  post<Accepted>(`/offers/${id}/accept`, undefined, token);

// No `prefundingSucceeded`: whether funds were captured is the API's finding, not ours.
export const confirmOffer = (id: string, token: string) =>
  post<Confirmed>(`/offers/${id}/confirm`, undefined, token);

export interface Payout {
  id: string;
  bookingState: string;
  payoutState: string;
  payoutAmount: number;
}

export const completeBooking = (bookingId: string, token: string) =>
  post<{ id: string; state: string }>(`/bookings/${bookingId}/complete`, undefined, token);

export const acceptCompletion = (bookingId: string, token: string) =>
  post<Payout>(`/bookings/${bookingId}/accept-completion`, undefined, token);

export interface ReviewResult {
  id: string;
  published: boolean;
}

export interface Rating {
  subjectId: string;
  hasRating: boolean;
  count?: number;
  average?: number;
  note?: string;
}

// `by` is no longer sent: the API derives the author from the caller's identity.
export const createReview = (
  bookingId: string,
  input: { score: number; text?: string },
  token: string,
) => post<ReviewResult>(`/bookings/${bookingId}/reviews`, input, token);

export const getRating = (professionalId: string) =>
  get<Rating>(`/professionals/${professionalId}/rating`);

// ----- Operations dashboard -----
export interface CaseSummary {
  id: string;
  kind: string;
  state: string;
  refId: string | null;
  subject: string;
}

export interface PendingVerification {
  kind: "clinic" | "professional";
  id: string;
  name: string;
  licenceNo?: string;
  address?: string;
  profession?: string;
}

export const getOpsCases = (token: string) => get<{ cases: CaseSummary[] }>("/ops/cases", token);
export const getOpsPending = (token: string) =>
  get<{ pending: PendingVerification[] }>("/ops/pending", token);

// ----- Finance -----
export interface ReconciliationRow {
  paymentOrderId: string;
  bookingId: string | null;
  captured: number;
  payouts: number;
  refunds: number;
  undistributed: number;
  conserved: boolean;
}

export interface Reconciliation {
  rows: ReconciliationRow[];
  summary: { count: number; captured: number; payouts: number; refunds: number; exceptions: number };
}

export const getReconciliation = (token: string) =>
  get<Reconciliation>("/finance/reconciliation", token);

// ----- Reporting & exports (REP-02/03) -----
export interface MarketplaceMetrics {
  shifts: { total: number; open: number };
  offers: { total: number };
  bookings: {
    total: number;
    confirmed: number;
    awaitingCompletion: number;
    completed: number;
    cancelled: number;
    held: number;
  };
  cases: { open: number };
  money: { captured: number; paidOut: number; refunded: number; reconciliationExceptions: number };
}

export const getMetrics = (token: string) => get<MarketplaceMetrics>("/ops/metrics", token);

/** REP-02: fetch the Finance CSV export as text (Authorization header required). */
export async function fetchFinanceExport(token: string): Promise<string> {
  const res = await fetch(`${API_BASE}/finance/export`, {
    headers: authHeaders({}, token),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw await errorFrom(res);
  return res.text();
}
export const resolveHold = (bookingId: string, token: string) =>
  post<{ id: string; held: boolean }>(`/bookings/${bookingId}/resolve-hold`, undefined, token);
