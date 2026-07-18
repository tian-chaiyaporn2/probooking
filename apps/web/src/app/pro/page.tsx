"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader } from "../../components/AppHeader";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { BookingThread } from "../../components/BookingThread";
import { CheckoutSummary } from "../../components/CheckoutSummary";
import { ProfilePanel } from "../../components/ProfilePanel";
import { useToast } from "../../components/Toast";
import {
  getMe,
  browseShifts,
  getProfessionalOffers,
  getProfessionalBookings,
  getProfessionalProfile,
  applyToShift,
  acceptOffer,
  declineOffer,
  arriveBooking,
  completeBooking,
  createReview,
  formatThb,
  type MeIdentity,
  type OpenShift,
  type ProfessionalOfferRow,
  type PartyBooking,
  type VerifiedProfile,
  type ShiftBrowseFilters,
} from "../../lib/api";
import { checkoutFromCompensation } from "../../lib/checkout";
import { getThaiErrorMessage, th } from "../../lib/strings";
import { statusLabel, nextActionHint } from "../../lib/status";
import { loadSession, clearSession } from "../../lib/session";

export default function ProPage() {
  const toast = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<MeIdentity | null>(null);
  const [profile, setProfile] = useState<VerifiedProfile | null>(null);
  const [shifts, setShifts] = useState<OpenShift[]>([]);
  const [offers, setOffers] = useState<ProfessionalOfferRow[]>([]);
  const [bookings, setBookings] = useState<PartyBooking[]>([]);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState("");
  const [urgency, setUrgency] = useState<"" | "standard" | "urgent">("");
  const [minBaht, setMinBaht] = useState("");
  const [filterHint, setFilterHint] = useState<string | null>(null);

  const proId = me?.professionalId ?? null;

  const loadShifts = useCallback(
    async (tok: string, filters: ShiftBrowseFilters = {}) => {
      const sh = await browseShifts(tok, filters);
      setShifts(sh.shifts);
      setFilterHint(sh.hint ?? null);
    },
    [],
  );

  const load = useCallback(
    async (id: string, tok: string, filters: ShiftBrowseFilters = {}) => {
      const [of, bk] = await Promise.all([
        getProfessionalOffers(id, tok),
        getProfessionalBookings(id, tok),
      ]);
      setOffers(of.offers);
      setBookings(bk.bookings);
      await loadShifts(tok, filters);
    },
    [loadShifts],
  );

  useEffect(() => {
    const sess = loadSession();
    if (!sess) return;
    setToken(sess.token);
    getMe(sess.token)
      .then(async (identity) => {
        setMe(identity);
        if (identity.professionalId) {
          try {
            setProfile(await getProfessionalProfile(identity.professionalId));
          } catch {
            setProfile(null);
          }
        }
      })
      .catch((e) => toast.error(getThaiErrorMessage(e)));
  }, [toast]);

  useEffect(() => {
    if (proId && token)
      void load(proId, token).catch((e) => toast.error(getThaiErrorMessage(e)));
  }, [proId, token, load, toast]);

  function currentFilters(): ShiftBrowseFilters {
    const filters: ShiftBrowseFilters = {};
    if (category.trim()) filters.category = category.trim();
    if (urgency) filters.urgency = urgency;
    if (minBaht && Number(minBaht) > 0)
      filters.minCompensation = Number(minBaht) * 100;
    return filters;
  }

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      if (proId && token) await load(proId, token, currentFilters());
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
        <main
          id="main"
          className="page"
          style={{ maxWidth: 460, textAlign: "center" }}
        >
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
      <main id="main" className="page page--party">
        <div className="workspace-head">
          <div>
            <h1>{me?.professionalName ?? "บุคลากร"}</h1>
            <span className="workspace-head__meta">
              บุคลากร ·{" "}
              {me?.professionalVerification && (
                <Badge tone="success">
                  {statusLabel(me.professionalVerification)}
                </Badge>
              )}
            </span>
          </div>
          <div className="actions">
            <Link href="/signin" className="btn btn--subtle">
              {th.party.switchRole}
            </Link>
            <Button variant="subtle" onClick={signOut}>
              {th.staffLogin.signOut}
            </Button>
          </div>
        </div>

        {profile ? <ProfilePanel profile={profile} /> : null}

        <h2>
          {th.party.offersToMe} ({pendingOffers.length})
        </h2>
        <div className="card" style={{ marginBottom: "var(--s5)" }}>
          <ul className="rowlist" data-testid="pro-offers">
            {offers.length === 0 && (
              <li className="empty">{th.party.noOffers}</li>
            )}
            {offers.map((o) => (
              <li
                key={o.offerId}
                data-testid={`offer-${o.offerId}`}
                style={{ alignItems: "flex-start" }}
              >
                <span className="row__main">
                  <span className="row__name">
                    {formatThb(o.compensation)}{" "}
                    {o.urgency === "urgent" && <Badge tone="warn">ด่วน</Badge>}
                  </span>
                  <span className="row__sub">
                    <Badge tone="info">{statusLabel(o.state)}</Badge>
                  </span>
                  {nextActionHint(o.state) ? (
                    <span className="row__hint muted">
                      {nextActionHint(o.state)}
                    </span>
                  ) : null}
                  {o.state === "PendingResponse" ? (
                    <div style={{ marginTop: "var(--s3)", maxWidth: 320 }}>
                      <CheckoutSummary
                        checkout={checkoutFromCompensation(o.compensation)}
                        protectedStamp={false}
                      />
                    </div>
                  ) : null}
                </span>
                {o.state === "PendingResponse" && (
                  <span className="row__actions actions">
                    <Button
                      data-testid="accept-offer"
                      variant="primary"
                      busy={busy}
                      onClick={() =>
                        void run(
                          () => acceptOffer(o.offerId, token),
                          "ยอมรับข้อเสนอแล้ว (รอคลินิกยืนยัน)",
                        )
                      }
                    >
                      {th.party.acceptOffer}
                    </Button>
                    <Button
                      data-testid="decline-offer"
                      variant="subtle"
                      busy={busy}
                      onClick={() =>
                        void run(
                          () => declineOffer(o.offerId, token),
                          "ปฏิเสธข้อเสนอแล้ว",
                        )
                      }
                    >
                      {th.party.declineOffer}
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
        <div className="filter-bar" data-testid="shift-filters">
          <label>
            {th.party.filterCategory}
            <input
              data-testid="filter-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="general"
            />
          </label>
          <label>
            {th.party.filterUrgency}
            <select
              data-testid="filter-urgency"
              value={urgency}
              onChange={(e) =>
                setUrgency(e.target.value as "" | "standard" | "urgent")
              }
            >
              <option value="">{th.party.urgencyAll}</option>
              <option value="urgent">{th.party.urgencyUrgent}</option>
              <option value="standard">{th.party.urgencyStandard}</option>
            </select>
          </label>
          <label>
            {th.party.filterMinBaht}
            <input
              data-testid="filter-min"
              inputMode="numeric"
              value={minBaht}
              onChange={(e) =>
                setMinBaht(e.target.value.replace(/[^0-9]/g, ""))
              }
            />
          </label>
          <Button
            data-testid="filter-apply"
            busy={busy}
            onClick={() => {
              if (!token) return;
              void loadShifts(token, currentFilters()).catch((e) =>
                toast.error(getThaiErrorMessage(e)),
              );
            }}
          >
            {th.party.filterApply}
          </Button>
          <Button
            variant="subtle"
            data-testid="filter-clear"
            onClick={() => {
              setCategory("");
              setUrgency("");
              setMinBaht("");
              if (token)
                void loadShifts(token).catch((e) =>
                  toast.error(getThaiErrorMessage(e)),
                );
            }}
          >
            {th.party.filterClear}
          </Button>
        </div>
        {filterHint ? (
          <p className="muted" style={{ fontSize: "0.85rem", marginTop: 0 }}>
            {filterHint}
          </p>
        ) : null}
        <div className="card" style={{ marginBottom: "var(--s5)" }}>
          <ul className="rowlist" data-testid="open-shifts">
            {shifts.length === 0 && (
              <li className="empty">{th.party.noOpenShifts}</li>
            )}
            {shifts.slice(0, 25).map((s) => (
              <li key={s.shiftId} data-testid={`open-${s.shiftId}`}>
                <span className="row__main">
                  <span className="row__name">
                    {formatThb(s.compensation)}{" "}
                    {s.urgent && <Badge tone="warn">ด่วน</Badge>}
                  </span>
                  <span className="row__sub muted">{s.category}</span>
                </span>
                <span className="row__actions">
                  <Button
                    data-testid="apply-shift"
                    busy={busy}
                    onClick={() =>
                      void run(
                        () => applyToShift(s.shiftId, proId!, token),
                        "สมัครแล้ว",
                      )
                    }
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
            {bookings.length === 0 && (
              <li className="empty">{th.party.noJobs}</li>
            )}
            {bookings.map((b) => (
              <li
                key={b.bookingId}
                data-testid={`pro-booking-${b.bookingId}`}
                style={{ alignItems: "flex-start" }}
              >
                <span className="row__main">
                  <span className="row__name">{formatThb(b.compensation)}</span>
                  <span className="row__sub">
                    <Badge tone="info">{statusLabel(b.state)}</Badge>{" "}
                    <span className="muted">
                      {th.party.payoutLabel}: {statusLabel(b.payoutState)}
                    </span>
                  </span>
                  {nextActionHint(b.state) ? (
                    <span className="row__hint muted">
                      {nextActionHint(b.state)}
                    </span>
                  ) : null}
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
                  <div style={{ marginTop: "var(--s3)" }}>
                    <BookingThread
                      bookingId={b.bookingId}
                      token={token}
                      selfId={proId}
                    />
                  </div>
                </span>
                <span className="row__actions actions">
                  {(b.state === "Confirmed" || b.state === "InProgress") && (
                    <>
                      <Button
                        data-testid="arrive"
                        busy={busy}
                        onClick={() =>
                          void run(
                            () => arriveBooking(b.bookingId, token),
                            "บันทึกการมาถึงแล้ว",
                          )
                        }
                      >
                        {th.party.arrive}
                      </Button>
                      <Button
                        data-testid="complete"
                        variant="primary"
                        busy={busy}
                        onClick={() =>
                          void run(
                            () => completeBooking(b.bookingId, token),
                            "ส่งงานเสร็จแล้ว",
                          )
                        }
                      >
                        {th.party.complete}
                      </Button>
                    </>
                  )}
                  {b.state === "ServiceCompleted" && (
                    <Button
                      data-testid="review"
                      busy={busy}
                      onClick={() =>
                        void run(
                          () => createReview(b.bookingId, { score: 5 }, token),
                          "รีวิวแล้ว",
                        )
                      }
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
