"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader } from "../../components/AppHeader";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { CheckoutSummary } from "../../components/CheckoutSummary";
import { useToast } from "../../components/Toast";
import {
  getMe,
  browseShifts,
  getProfessionalOffers,
  getProfessionalBookings,
  applyToShift,
  acceptOffer,
  arriveBooking,
  completeBooking,
  createReview,
  formatThb,
  type MeIdentity,
  type OpenShift,
  type ProfessionalOfferRow,
  type PartyBooking,
} from "../../lib/api";
import { checkoutFromCompensation } from "../../lib/checkout";
import { getThaiErrorMessage, th } from "../../lib/strings";
import { statusLabel, nextActionHint } from "../../lib/status";
import { loadSession, clearSession } from "../../lib/demo-accounts";

export default function ProPage() {
  const toast = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<MeIdentity | null>(null);
  const [shifts, setShifts] = useState<OpenShift[]>([]);
  const [offers, setOffers] = useState<ProfessionalOfferRow[]>([]);
  const [bookings, setBookings] = useState<PartyBooking[]>([]);
  const [busy, setBusy] = useState(false);

  const proId = me?.professionalId ?? null;

  const load = useCallback(async (id: string, tok: string) => {
    const [sh, of, bk] = await Promise.all([
      browseShifts(tok),
      getProfessionalOffers(id, tok),
      getProfessionalBookings(id, tok),
    ]);
    setShifts(sh.shifts);
    setOffers(of.offers);
    setBookings(bk.bookings);
  }, []);

  useEffect(() => {
    const sess = loadSession();
    if (!sess) return;
    setToken(sess.token);
    getMe(sess.token)
      .then(setMe)
      .catch((e) => toast.error(getThaiErrorMessage(e)));
  }, [toast]);

  useEffect(() => {
    if (proId && token) void load(proId, token).catch((e) => toast.error(getThaiErrorMessage(e)));
  }, [proId, token, load, toast]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      if (proId && token) await load(proId, token);
      toast.success(ok);
    } catch (e) {
      toast.error(getThaiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    clearSession();
    setToken(null);
  }

  if (!token) {
    return (
      <>
        <AppHeader current="/pro" />
        <main id="main" className="page" style={{ maxWidth: 460, textAlign: "center" }}>
          <p className="muted" style={{ marginTop: "2rem" }}>
            {th.party.signInPromptPro}
          </p>
          <Link href="/signin" className="btn btn--primary btn--lg">
            {th.party.pickAccount}
          </Link>
        </main>
      </>
    );
  }

  const pendingOffers = offers.filter((o) => o.state === "PendingResponse");

  return (
    <>
      <AppHeader current="/pro" />
      <main id="main" className="page" style={{ maxWidth: 880 }}>
        <div className="actions" style={{ justifyContent: "space-between", marginBottom: "var(--s5)" }}>
          <div>
            <h1 style={{ margin: 0 }}>{me?.professionalName ?? "บุคลากร"}</h1>
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              บุคลากร ·{" "}
              {me?.professionalVerification && (
                <Badge tone="success">{statusLabel(me.professionalVerification)}</Badge>
              )}
            </span>
          </div>
          <span className="actions">
            <Link href="/signin" className="btn btn--subtle">
              {th.party.switchRole}
            </Link>
            <Button variant="subtle" onClick={signOut}>
              {th.staffLogin.signOut}
            </Button>
          </span>
        </div>

        <h2>
          {th.party.offersToMe} ({pendingOffers.length})
        </h2>
        <div className="card" style={{ marginBottom: "var(--s5)" }}>
          <ul className="rowlist" data-testid="pro-offers">
            {offers.length === 0 && <li className="empty">{th.party.noOffers}</li>}
            {offers.map((o) => (
              <li key={o.offerId} data-testid={`offer-${o.offerId}`} style={{ alignItems: "flex-start" }}>
                <span className="row__main">
                  <span className="row__name">
                    {formatThb(o.compensation)} {o.urgency === "urgent" && <Badge tone="warn">ด่วน</Badge>}
                  </span>
                  <span className="row__sub">
                    <Badge tone="info">{statusLabel(o.state)}</Badge>
                  </span>
                  {nextActionHint(o.state) ? <span className="row__hint muted">{nextActionHint(o.state)}</span> : null}
                  {o.state === "PendingResponse" ? (
                    <div style={{ marginTop: "var(--s3)", maxWidth: 320 }}>
                      <CheckoutSummary checkout={checkoutFromCompensation(o.compensation)} protectedStamp={false} />
                    </div>
                  ) : null}
                </span>
                {o.state === "PendingResponse" && (
                  <span className="row__actions">
                    <Button
                      data-testid="accept-offer"
                      variant="primary"
                      busy={busy}
                      onClick={() =>
                        void run(() => acceptOffer(o.offerId, token), "ยอมรับข้อเสนอแล้ว (รอคลินิกยืนยัน)")
                      }
                    >
                      {th.party.acceptOffer}
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <h2>
          {th.party.openShifts} ({shifts.length})
        </h2>
        <div className="card" style={{ marginBottom: "var(--s5)" }}>
          <ul className="rowlist" data-testid="open-shifts">
            {shifts.length === 0 && <li className="empty">{th.party.noOpenShifts}</li>}
            {shifts.slice(0, 25).map((s) => (
              <li key={s.shiftId} data-testid={`open-${s.shiftId}`}>
                <span className="row__main">
                  <span className="row__name">
                    {formatThb(s.compensation)} {s.urgent && <Badge tone="warn">ด่วน</Badge>}
                  </span>
                  <span className="row__sub muted">{s.category}</span>
                </span>
                <span className="row__actions">
                  <Button
                    data-testid="apply-shift"
                    busy={busy}
                    onClick={() => void run(() => applyToShift(s.shiftId, proId!, token), "สมัครแล้ว")}
                  >
                    {th.party.apply}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <h2>
          {th.party.myJobs} ({bookings.length})
        </h2>
        <div className="card">
          <ul className="rowlist" data-testid="pro-bookings">
            {bookings.length === 0 && <li className="empty">{th.party.noJobs}</li>}
            {bookings.map((b) => (
              <li key={b.bookingId} data-testid={`pro-booking-${b.bookingId}`} style={{ alignItems: "flex-start" }}>
                <span className="row__main">
                  <span className="row__name">{formatThb(b.compensation)}</span>
                  <span className="row__sub">
                    <Badge tone="info">{statusLabel(b.state)}</Badge>{" "}
                    <span className="muted">
                      {th.party.payoutLabel}: {statusLabel(b.payoutState)}
                    </span>
                  </span>
                  {nextActionHint(b.state) ? <span className="row__hint muted">{nextActionHint(b.state)}</span> : null}
                  {(b.state === "Confirmed" || b.state === "InProgress") && (
                    <div style={{ marginTop: "var(--s3)", maxWidth: 320 }}>
                      <CheckoutSummary
                        checkout={{
                          compensation: b.compensation,
                          serviceFee: b.serviceFee,
                          tax: b.tax,
                          total: b.total,
                        }}
                      />
                    </div>
                  )}
                </span>
                <span className="row__actions actions">
                  {(b.state === "Confirmed" || b.state === "InProgress") && (
                    <>
                      <Button
                        data-testid="arrive"
                        busy={busy}
                        onClick={() => void run(() => arriveBooking(b.bookingId, token), "บันทึกการมาถึงแล้ว")}
                      >
                        {th.party.arrive}
                      </Button>
                      <Button
                        data-testid="complete"
                        variant="primary"
                        busy={busy}
                        onClick={() => void run(() => completeBooking(b.bookingId, token), "ส่งงานเสร็จแล้ว")}
                      >
                        {th.party.complete}
                      </Button>
                    </>
                  )}
                  {b.state === "ServiceCompleted" && (
                    <Button
                      data-testid="review"
                      busy={busy}
                      onClick={() => void run(() => createReview(b.bookingId, { score: 5 }, token), "รีวิวแล้ว")}
                    >
                      {th.party.review}
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </>
  );
}
