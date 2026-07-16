"use client";

import { useState } from "react";
import {
  createOffer,
  acceptOffer,
  confirmOffer,
  completeBooking,
  acceptCompletion,
  formatThb,
  type Checkout,
  type Payout,
} from "../../lib/api";

type Step = { label: string; detail: string };

/**
 * Phase 0 booking-flow demo. Drives the API: create offer -> accept (soft hold) ->
 * confirm (eligibility + prefunding) -> Confirmed booking. Exists to verify the
 * vertical slice end to end (and is the target of the Playwright e2e).
 */
export default function FlowPage() {
  const [steps, setSteps] = useState<Step[]>([]);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [payout, setPayout] = useState<Payout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [payingOut, setPayingOut] = useState(false);

  async function run() {
    setRunning(true);
    setSteps([]);
    setCheckout(null);
    setBookingId(null);
    setPayout(null);
    setError(null);
    const log = (label: string, detail: string) =>
      setSteps((s) => [...s, { label, detail }]);
    try {
      const offer = await createOffer({
        shiftId: "shift-1",
        professionalId: "pro-1",
        compensation: 1_000_000, // 10,000 THB in satang
      });
      log("Offer created", `state=${offer.state}, fee=${formatThb(offer.checkout.serviceFee)}`);

      const accepted = await acceptOffer(offer.id);
      log("Professional accepted", `state=${accepted.state} (soft hold, not a booking)`);

      const confirmed = await confirmOffer(offer.id, true);
      log("Booking confirmed", `state=${confirmed.booking.state}`);
      setCheckout(confirmed.checkout);
      setBookingId(confirmed.booking.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function runPayout() {
    if (!bookingId) return;
    setPayingOut(true);
    setError(null);
    try {
      await completeBooking(bookingId); // professional marks completion
      const result = await acceptCompletion(bookingId); // accept + initiate payout
      setPayout(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPayingOut(false);
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: "3rem auto", padding: "0 1.5rem", fontFamily: "system-ui" }}>
      <h1>ProBooking — booking flow</h1>
      <p style={{ color: "#555" }}>
        Create a binding offer, accept it (soft hold), confirm the booking, then
        complete it and pay out the professional.
      </p>

      <button
        data-testid="run-flow"
        onClick={run}
        disabled={running}
        style={{
          padding: "0.6rem 1.1rem",
          fontSize: "1rem",
          borderRadius: 8,
          border: "1px solid #0b6",
          background: running ? "#eee" : "#0b6",
          color: running ? "#666" : "#fff",
          cursor: running ? "default" : "pointer",
        }}
      >
        {running ? "Running…" : "Run booking flow"}
      </button>

      <ol data-testid="steps" style={{ marginTop: "1.5rem", lineHeight: 1.8 }}>
        {steps.map((s, i) => (
          <li key={i}>
            <strong>{s.label}</strong> — <span>{s.detail}</span>
          </li>
        ))}
      </ol>

      {bookingId && (
        <div
          data-testid="result"
          style={{ marginTop: "1rem", padding: "1rem", border: "1px solid #0b6", borderRadius: 8 }}
        >
          <div data-testid="booking-status" style={{ fontWeight: 600, color: "#0a5" }}>
            Booking Confirmed
          </div>
          <div>Booking ID: <code data-testid="booking-id">{bookingId}</code></div>
          {checkout && (
            <table style={{ marginTop: "0.5rem", borderCollapse: "collapse" }}>
              <tbody>
                <tr><td>Compensation</td><td style={{ paddingLeft: 16 }}>{formatThb(checkout.compensation)}</td></tr>
                <tr><td>Service fee (12%)</td><td style={{ paddingLeft: 16 }}>{formatThb(checkout.serviceFee)}</td></tr>
                <tr><td>Tax</td><td style={{ paddingLeft: 16 }}>{formatThb(checkout.tax)}</td></tr>
                <tr style={{ fontWeight: 600 }}>
                  <td>Total</td>
                  <td data-testid="checkout-total" style={{ paddingLeft: 16 }}>{formatThb(checkout.total)}</td>
                </tr>
              </tbody>
            </table>
          )}

          <div style={{ marginTop: "1rem" }}>
            {!payout ? (
              <button
                data-testid="run-payout"
                onClick={runPayout}
                disabled={payingOut}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: 8,
                  border: "1px solid #06b",
                  background: payingOut ? "#eee" : "#06b",
                  color: payingOut ? "#666" : "#fff",
                  cursor: payingOut ? "default" : "pointer",
                }}
              >
                {payingOut ? "Paying out…" : "Complete & pay out"}
              </button>
            ) : (
              <div data-testid="payout">
                <span data-testid="payout-status" style={{ fontWeight: 600, color: "#0a5" }}>
                  Paid out
                </span>{" "}
                — <span data-testid="payout-amount">{formatThb(payout.payoutAmount)}</span> to the
                professional (booking {payout.bookingState})
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <p data-testid="error" style={{ color: "#c00", marginTop: "1rem" }}>
          Error: {error}
        </p>
      )}
    </main>
  );
}
