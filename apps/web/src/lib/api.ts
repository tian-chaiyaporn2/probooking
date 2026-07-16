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

export const createOffer = (input: {
  shiftId: string;
  professionalId: string;
  compensation: number;
  urgency?: "standard" | "urgent";
}) => post<OfferCreated>("/offers", input);

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

/** Format integer satang as THB, e.g. 1_120_000 -> "฿11,200.00". */
export const formatThb = (s: number) =>
  `฿${(s / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
