// Thin client for the ProBooking API. Base URL is inlined at build for the browser.
import { formatThb as formatThbDomain } from "@probook/domain";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

/**
 * Re-export domain money formatting so UI and API share one satang→THB rule (LOC-02).
 * Prefer this over a local float division that can drift from `packages/domain`.
 */
export const formatThb = (s: number) => formatThbDomain(s);

function authHeaders(
  base: Record<string, string> = {},
  token?: string,
): Record<string, string> {
  return token ? { ...base, authorization: `Bearer ${token}` } : base;
}

/**
 * Turn a non-OK response into a human error. The API returns Nest's JSON envelope
 * ({ statusCode, message, error }), so surfacing the raw body dumped things like
 * `429: {"statusCode":429,"message":"too many OTP requests…"}` into toasts and the login
 * form. Prefer the `message`; fall back to the raw text only if it is not that shape.
 */
/** An API error that also carries the HTTP status, so callers can branch on 401/403 (e.g.
 * expire a stale session) instead of substring-matching a message that never holds the code. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function errorFrom(res: Response): Promise<Error> {
  const text = await res.text();
  let message = text || `Request failed (${res.status})`;
  try {
    const body = JSON.parse(text) as { message?: string | string[] };
    const msg = Array.isArray(body.message)
      ? body.message.join("; ")
      : body.message;
    if (msg) message = msg;
  } catch {
    // not JSON — keep the raw text
  }
  return new ApiError(message, res.status);
}

async function post<T>(
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
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

/** Demo-only: wipe and re-seed the backend so a tester can start from a clean slate. */
export const resetDemo = () => post<{ ok: boolean }>("/demo/reset");

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
export const logout = (token: string) =>
  post<{ revoked: boolean }>("/auth/logout", undefined, token);

/**
 * One-shot login for the demo flow, where the code is echoed back under AUTH_DEV_MODE.
 * In production `requestOtp` returns no code, so callers must collect it from SMS and call
 * `verifyOtp` — a login that hands you the code is not a login.
 */
export async function loginAs(phone: string): Promise<string> {
  const { devCode } = await requestOtp(phone);
  if (!devCode) {
    throw new Error(
      "OTP code was not returned — set AUTH_DEV_MODE=true for the demo flow",
    );
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
  booking: {
    id: string;
    state: string;
    shiftId: string;
    professionalId: string;
  };
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
) =>
  post<{ shiftId: string; state: string; urgent: boolean }>(
    "/shifts",
    input,
    token,
  );

export const applyToShift = (
  shiftId: string,
  professionalId: string,
  token: string,
) =>
  post<{ id: string; state: string }>(
    `/shifts/${shiftId}/apply`,
    { professionalId },
    token,
  );

export const offerToProfessional = (
  shiftId: string,
  professionalId: string,
  token: string,
) => post<OfferCreated>(`/shifts/${shiftId}/offer`, { professionalId }, token);

export const acceptOffer = (id: string, token: string) =>
  post<Accepted>(`/offers/${id}/accept`, undefined, token);

export const declineOffer = (id: string, token: string) =>
  post<{ id: string; state: string }>(
    `/offers/${id}/decline`,
    undefined,
    token,
  );

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
  post<{ id: string; state: string }>(
    `/bookings/${bookingId}/complete`,
    undefined,
    token,
  );

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
  // "insurance" = a verified professional whose insurance evidence is awaiting review (VER-05).
  kind: "clinic" | "professional" | "insurance";
  id: string;
  name: string;
  licenceNo?: string;
  address?: string;
  profession?: string;
}

/** A live booking Operations can act on (credential hold VER-06 / suspend VER-04). */
export interface ActiveBooking {
  bookingId: string;
  professionalId: string;
  professionalName: string;
  clinicName: string;
  state: string;
  held: boolean;
  credential: string; // professional's licence state: Verified | Suspended | ...
}

export const getOpsBookings = (token: string) =>
  get<{ bookings: ActiveBooking[] }>("/ops/bookings", token);

export const getOpsCases = (token: string) =>
  get<{ cases: CaseSummary[] }>("/ops/cases", token);
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
  summary: {
    count: number;
    captured: number;
    payouts: number;
    refunds: number;
    exceptions: number;
  };
}

export const getReconciliation = (token: string) =>
  get<Reconciliation>("/finance/reconciliation", token);

// ----- Refunds (§6.4 dual-control) -----
export interface PendingApproval {
  id: string;
  capability: string;
  refId: string; // bookingId
  amount: number; // integer satang
  reason: string;
  state: "Pending" | "Executed" | "Rejected";
  initiatorId: string;
  initiatorRole: string;
  createdAt: number;
}

/** A finance person proposes a refund; it moves no money until a *different* finance person approves. */
export const proposeRefund = (
  bookingId: string,
  amount: number,
  reason: string,
  token: string,
) =>
  post<{ id: string; state: string; amount: number }>(
    "/finance/refunds",
    { bookingId, amount, reason },
    token,
  );

export const getPendingRefunds = (token: string) =>
  get<{ pending: PendingApproval[] }>("/finance/refunds", token);

/** Approve (execute) a proposed refund. Rejected with 403 if you are the initiator (§6.4). */
export const approveRefund = (id: string, token: string) =>
  post<{ id: string; state: string; refund?: number }>(
    `/finance/refunds/${id}/approve`,
    undefined,
    token,
  );

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
  money: {
    captured: number;
    paidOut: number;
    refunded: number;
    reconciliationExceptions: number;
  };
}

export const getMetrics = (token: string) =>
  get<MarketplaceMetrics>("/ops/metrics", token);

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
  post<{ id: string; held: boolean }>(
    `/bookings/${bookingId}/resolve-hold`,
    undefined,
    token,
  );

// Operations enforcement actions (VER-04/05/06).
export const verifyInsurance = (professionalId: string, token: string) =>
  post<{ state: string }>(
    `/ops/professionals/${professionalId}/verify-insurance`,
    undefined,
    token,
  );
export const suspendCredential = (professionalId: string, token: string) =>
  post<{ professionalId: string; credential: string }>(
    `/ops/professionals/${professionalId}/suspend-credential`,
    undefined,
    token,
  );
export const holdCredential = (bookingId: string, token: string) =>
  post<{ id: string; held: boolean }>(
    `/bookings/${bookingId}/hold-credential`,
    undefined,
    token,
  );

// ----- Party self-service (clinic / professional dashboards) -----

export interface MeIdentity {
  professionalId: string | null;
  professionalName: string | null;
  professionalVerification: string | null;
  clinics: {
    workspaceId: string;
    name: string;
    role: string;
    verification: string;
  }[];
}
export const getMe = (token: string) => get<MeIdentity>("/me", token);

export interface ClinicShiftRow {
  shiftId: string;
  category: string;
  compensation: number;
  urgency: "standard" | "urgent";
  startsAt: number;
  state: string;
  hasActiveOffer: boolean;
  booked: boolean;
  candidateCount: number;
  offer: { id: string; state: string; professionalId: string } | null;
}
export const getClinicShifts = (clinicId: string, token: string) =>
  get<{ shifts: ClinicShiftRow[] }>(`/clinics/${clinicId}/shifts`, token);

export interface Candidate {
  professionalId: string;
  via: "application" | "invitation";
  state: string;
}
export const getShiftCandidates = (shiftId: string, token: string) =>
  get<{ candidates: Candidate[] }>(`/shifts/${shiftId}/candidates`, token);

export interface ProfessionalOfferRow {
  offerId: string;
  shiftId: string;
  category: string;
  compensation: number;
  urgency: "standard" | "urgent";
  shiftStart: number;
  state: string;
  expiresAt: number;
}
export const getProfessionalOffers = (proId: string, token: string) =>
  get<{ offers: ProfessionalOfferRow[] }>(
    `/professionals/${proId}/offers`,
    token,
  );

export interface OpenShift {
  shiftId: string;
  category: string;
  compensation: number;
  startsAt: number;
  urgency: "standard" | "urgent";
  urgent: boolean;
}
export type ShiftBrowseFilters = {
  category?: string;
  urgency?: "standard" | "urgent";
  minCompensation?: number; // satang
  maxCompensation?: number; // satang
};

/** SRC-02/03: filtered open shifts (token optional — route is public). */
export function browseShifts(token?: string, filters: ShiftBrowseFilters = {}) {
  const q = new URLSearchParams();
  if (filters.category) q.set("category", filters.category);
  if (filters.urgency) q.set("urgency", filters.urgency);
  if (filters.minCompensation !== undefined)
    q.set("minCompensation", String(filters.minCompensation));
  if (filters.maxCompensation !== undefined)
    q.set("maxCompensation", String(filters.maxCompensation));
  const qs = q.toString();
  return get<{ shifts: OpenShift[]; hint?: string }>(
    `/shifts${qs ? `?${qs}` : ""}`,
    token,
  );
}

export interface VerifiedProfile {
  id: string;
  selfDeclared: {
    displayName: string;
    profession: string;
    specialty: string | null;
  };
  verified: {
    identityVerified: boolean;
    // VER-04 credential: a nurse's licence or a dental assistant's certificate (kind says which).
    credential: { kind: string; state: string; validUntil: number | null } | null;
    insurance: { state: string; validUntil: number | null } | null;
    rating: { count: number; average: number } | null;
  };
}

/** VER-03: public marketplace profile (no PII). */
export const getProfessionalProfile = (id: string) =>
  get<VerifiedProfile>(`/professionals/${id}/profile`);

/** AVL-01/02: one-off availability windows for a professional. */
export interface AvailabilityBlock {
  id: string;
  startsAt: number;
  endsAt: number;
  openToRequests: boolean;
}

export const listAvailability = (proId: string, token: string) =>
  get<{ availability: AvailabilityBlock[] }>(
    `/professionals/${proId}/availability`,
    token,
  );

/** Relative hours from now — matches API convenience contract. */
export const addAvailability = (
  proId: string,
  input: {
    startsInHours?: number;
    durationHours?: number;
    openToRequests?: boolean;
  },
  token: string,
) =>
  post<AvailabilityBlock>(`/professionals/${proId}/availability`, input, token);

export interface ProfessionalSearchResult {
  id: string;
  displayName: string;
  profession: string;
  specialty: string | null;
  rating: number | null;
}

/** SRC-01: browse professionals by profession/specialty. */
export function searchProfessionals(
  filters: { profession?: string; specialty?: string } = {},
) {
  const q = new URLSearchParams();
  if (filters.profession) q.set("profession", filters.profession);
  if (filters.specialty) q.set("specialty", filters.specialty);
  const qs = q.toString();
  return get<{ professionals: ProfessionalSearchResult[] }>(
    `/professionals${qs ? `?${qs}` : ""}`,
  );
}

export interface BookingMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: number;
}

export interface BookingContact {
  clinicPhone: string | null;
  professionalPhone: string | null;
}

export const listMessages = (bookingId: string, token: string) =>
  get<{ messages: BookingMessage[] }>(`/bookings/${bookingId}/messages`, token);

export const postMessage = (bookingId: string, body: string, token: string) =>
  post<BookingMessage>(`/bookings/${bookingId}/messages`, { body }, token);

export const getBookingContact = (bookingId: string, token: string) =>
  get<BookingContact>(`/bookings/${bookingId}/contact`, token);

export interface PartyBooking {
  bookingId: string;
  shiftId: string;
  counterpartyId: string;
  state: string;
  compensation: number;
  serviceFee: number;
  tax: number;
  total: number;
  payoutState: string;
}
export const getClinicBookings = (clinicId: string, token: string) =>
  get<{ bookings: PartyBooking[] }>(`/clinics/${clinicId}/bookings`, token);
export const getProfessionalBookings = (proId: string, token: string) =>
  get<{ bookings: PartyBooking[] }>(`/professionals/${proId}/bookings`, token);

export const arriveBooking = (bookingId: string, token: string) =>
  post<{ id: string; arrived: boolean }>(
    `/bookings/${bookingId}/arrive`,
    undefined,
    token,
  );

export const cancelBooking = (
  bookingId: string,
  input: { reason: string },
  token: string,
) =>
  post<{ id: string; outcome: string; fraction?: number }>(
    `/bookings/${bookingId}/cancel`,
    input,
    token,
  );
