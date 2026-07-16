/**
 * Landing shell. The customer promise (PRD §1.2) is the north-star copy. Real
 * marketplace routes (search, shifts, offers, bookings) are added per Phase 1 scope.
 */
export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "4rem auto", padding: "0 1.5rem", fontFamily: "system-ui" }}>
      <h1>ProBooking</h1>
      <p style={{ fontSize: "1.25rem", color: "#444" }}>
        Verified. Available. Bookable. Payment Protected.
      </p>
      <p>
        Two-sided marketplace for temporary clinic shifts. Clinics find, compare, invite, and book
        verified professionals; professionals control availability, accept clear terms, and receive
        traceable payout.
      </p>
      <p style={{ color: "#888", fontSize: "0.9rem" }}>
        Phase 0 — Concierge Validation. Bangkok and surrounding provinces.
      </p>
      <p>
        <a href="/flow" data-testid="flow-link">
          → Try the booking flow demo
        </a>
      </p>
    </main>
  );
}
