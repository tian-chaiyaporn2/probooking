// Thin client for the ProBooking API. Base URL is inlined at build for the browser.
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

// Bearer token for internal (ops/finance) dashboard calls. The booking flow does NOT use
// this: it acts as two different parties (a clinic and a professional) within one page, so
// a single module-global token would silently attach the wrong identity to half the calls.
// Those callers pass their token explicitly instead.
let authToken: string | null = null;
export const setAuthToken = (token: string | null) => {
  authToken = token;
};

function authHeaders(base: Record<string, string> = {}, token?: string): Record<string, string> {
  const t = token ?? authToken;
  return t ? { ...base, authorization: `Bearer ${t}` } : base;
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
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function get<T>(path: string, token?: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: authHeaders({}, token),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
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
 * Log in as an ordinary party (a clinic owner or a professional) via OTP.
 *
 * `devCode` is returned by the API only under AUTH_DEV_MODE, which is how the demo can log
 * in without an SMS partner. In production the code arrives by SMS and this helper cannot
 * complete on its own — by design: a login that hands you the code is not a login.
 */
export async function loginAs(phone: string): Promise<string> {
  const { devCode } = await post<{ sent: boolean; devCode?: string }>("/auth/otp/request", { phone });
  if (!devCode) {
    throw new Error("OTP code was not returned — set AUTH_DEV_MODE=true for the demo flow");
  }
  const { token } = await post<{ token: string; role: string }>("/auth/otp/verify", {
    phone,
    code: devCode,
  });
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

export const verifyClinic = (id: string) => post<Registered>(`/ops/clinics/${id}/verify`);
export const verifyProfessional = (id: string) =>
  post<Registered>(`/ops/professionals/${id}/verify`);

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

// ----- Verified profile (VER-03) -----
export interface VerifiedProfile {
  id: string;
  selfDeclared: { displayName: string; profession: string; specialty: string | null };
  verified: {
    identityVerified: boolean;
    licence: { state: string; validUntil: number | null } | null;
    insurance: { state: string; validUntil: number | null } | null;
    rating: { count: number; average: number } | null;
  };
}

export const getProfile = (professionalId: string) =>
  get<VerifiedProfile>(`/professionals/${professionalId}/profile`);

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
}

export const getOpsCases = () => get<{ cases: CaseSummary[] }>("/ops/cases");
export const getOpsPending = () => get<{ pending: PendingVerification[] }>("/ops/pending");

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

export const getReconciliation = () => get<Reconciliation>("/finance/reconciliation");

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

export const getMetrics = () => get<MarketplaceMetrics>("/ops/metrics");

/** REP-02: fetch the Finance CSV export as text (Authorization header required). */
export async function fetchFinanceExport(): Promise<string> {
  const res = await fetch(`${API_BASE}/finance/export`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.text();
}
export const resolveHold = (bookingId: string) =>
  post<{ id: string; held: boolean }>(`/bookings/${bookingId}/resolve-hold`);

/** Format integer satang as THB, e.g. 1_120_000 -> "฿11,200.00". */
export const formatThb = (s: number) =>
  `฿${(s / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
