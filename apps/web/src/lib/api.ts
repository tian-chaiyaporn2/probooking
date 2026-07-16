// Thin client for the ProBooking API. Base URL is inlined at build for the browser.
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function post<T>(path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method: "POST", headers: { "content-type": "application/json" } };
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

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
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

export const postShift = (input: {
  clinicWorkspaceId: string;
  compensation: number;
  category?: string;
  urgency?: "standard" | "urgent";
}) => post<{ shiftId: string; state: string; urgent: boolean }>("/shifts", input);

export const applyToShift = (shiftId: string, professionalId: string) =>
  post<{ id: string; state: string }>(`/shifts/${shiftId}/apply`, { professionalId });

export const offerToProfessional = (shiftId: string, professionalId: string) =>
  post<OfferCreated>(`/shifts/${shiftId}/offer`, { professionalId });

export const acceptOffer = (id: string) => post<Accepted>(`/offers/${id}/accept`);

export const confirmOffer = (id: string, prefundingSucceeded = true) =>
  post<Confirmed>(`/offers/${id}/confirm`, { prefundingSucceeded });

export interface Payout {
  id: string;
  bookingState: string;
  payoutState: string;
  payoutAmount: number;
}

export const completeBooking = (bookingId: string) =>
  post<{ id: string; state: string }>(`/bookings/${bookingId}/complete`);

export const acceptCompletion = (bookingId: string) =>
  post<Payout>(`/bookings/${bookingId}/accept-completion`);

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

export const createReview = (
  bookingId: string,
  input: { by: "clinic" | "professional"; score: number; text?: string },
) => post<ReviewResult>(`/bookings/${bookingId}/reviews`, input);

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
export const resolveHold = (bookingId: string) =>
  post<{ id: string; held: boolean }>(`/bookings/${bookingId}/resolve-hold`);

/** Format integer satang as THB, e.g. 1_120_000 -> "฿11,200.00". */
export const formatThb = (s: number) =>
  `฿${(s / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
