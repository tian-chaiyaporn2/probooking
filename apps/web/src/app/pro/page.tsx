"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader } from "../../components/AppHeader";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { BookingThread } from "../../components/BookingThread";
import { CheckoutSummary } from "../../components/CheckoutSummary";
import { EmptyState } from "../../components/EmptyState";
import { ProfilePanel } from "../../components/ProfilePanel";
import { Skeleton } from "../../components/Skeleton";
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
import { statusLabel, nextActionHint, categoryLabel } from "../../lib/status";
import { loadSession, clearSession } from "../../lib/session";
import { verificationBadgeTone } from "../../lib/tones";

function RowSkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="rowlist__skeleton" aria-hidden>
          <span className="row__main">
            <Skeleton variant="line" />
            <Skeleton variant="line-short" />
          </span>
        </li>
      ))}
    </>
  );
}

export default function ProPage() {
  const toast = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<MeIdentity | null>(null);
  const [meLoading, setMeLoading] = useState(false);
  const [profile, setProfile] = useState<VerifiedProfile | null>(null);
  const [profileError, setProfileError] = useState(false);
  const [shifts, setShifts] = useState<OpenShift[]>([]);
  const [offers, setOffers] = useState<ProfessionalOfferRow[]>([]);
  const [bookings, setBookings] = useState<PartyBooking[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
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
      setListLoading(true);
      try {
        const [of, bk] = await Promise.all([
          getProfessionalOffers(id, tok),
          getProfessionalBookings(id, tok),
        ]);
        setOffers(of.offers);
        setBookings(bk.bookings);
        await loadShifts(tok, filters);
      } finally {
        setListLoading(false);
      }
    },
    [loadShifts],
  );

  useEffect(() => {
    const sess = loadSession();
    if (!sess) return;
    setToken(sess.token);
    setMeLoading(true);
    getMe(sess.token)
      .then(async (identity) => {
        setMe(identity);
        if (identity.professionalId) {
          try {
            setProfile(await getProfessionalProfile(identity.professionalId));
            setProfileError(false);
          } catch {
            setProfile(null);
            setProfileError(true);
          }
        }
      })
      .catch((e) => toast.error(getThaiErrorMessage(e)))
      .finally(() => setMeLoading(false));
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

  async function run(id: string, fn: () => Promise<unknown>, ok: string) {
    setBusyId(id);
    try {
      await fn();
      if (proId && token) await load(proId, token, currentFilters());
      toast.success(ok);
    } catch (e) {
      toast.error(getThaiErrorMessage(e));
    } finally {
      setBusyId(null);
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
            <h1>
              {meLoading && !me?.professionalName ? (
                <Skeleton variant="line" />
              ) : (
                (me?.professionalName ?? "บุคลากร")
              )}
            </h1>
            <span className="workspace-head__meta">
              บุคลากร ·{" "}
              {me?.professionalVerification && (
                <Badge
                  tone={verificationBadgeTone(me.professionalVerification)}
                >
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

        {profile ? (
          <ProfilePanel profile={profile} />
        ) : profileError ? (
          <p role="status" className="form-error form-error--info">
            {th.party.profileLoadFailed}
          </p>
        ) : null}

        <h2>
          {th.party.offersToMe} (
          {listLoading && offers.length === 0 ? "…" : pendingOffers.length})
        </h2>
        <div className="card" style={{ marginBottom: "var(--s5)" }}>
          <ul
            className="rowlist"
            data-testid="pro-offers"
            aria-busy={listLoading || undefined}
          >
            {listLoading && offers.length === 0 && <RowSkeleton />}
            {!listLoading && pendingOffers.length === 0 && (
              <EmptyState as="li" title={th.party.noOffers} />
            )}
            {pendingOffers.map((o) => (
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
                  <div style={{ marginTop: "var(--s3)", maxWidth: 320 }}>
                    <CheckoutSummary
                      checkout={checkoutFromCompensation(o.compensation)}
                      protectedStamp={false}
                    />
                  </div>
                </span>
                <span className="row__actions actions">
                  <Button
                    data-testid="accept-offer"
                    variant="primary"
                    busy={busyId === `accept-${o.offerId}`}
                    disabled={
                      busyId !== null && busyId !== `accept-${o.offerId}`
                    }
                    onClick={() =>
                      void run(
                        `accept-${o.offerId}`,
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
                    busy={busyId === `decline-${o.offerId}`}
                    disabled={
                      busyId !== null && busyId !== `decline-${o.offerId}`
                    }
                    onClick={() =>
                      void run(
                        `decline-${o.offerId}`,
                        () => declineOffer(o.offerId, token),
                        "ปฏิเสธข้อเสนอแล้ว",
                      )
                    }
                  >
                    {th.party.declineOffer}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <h2>
          {th.party.openShifts} (
          {listLoading && shifts.length === 0 ? "…" : shifts.length})
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
            busy={busyId === "filter"}
            disabled={busyId !== null && busyId !== "filter"}
            onClick={() => {
              if (!token) return;
              setBusyId("filter");
              void loadShifts(token, currentFilters())
                .catch((e) => toast.error(getThaiErrorMessage(e)))
                .finally(() => setBusyId(null));
            }}
          >
            {th.party.filterApply}
          </Button>
          <Button
            variant="subtle"
            data-testid="filter-clear"
            disabled={busyId !== null}
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
          <ul
            className="rowlist"
            data-testid="open-shifts"
            aria-busy={listLoading || undefined}
          >
            {listLoading && shifts.length === 0 && <RowSkeleton />}
            {!listLoading && shifts.length === 0 && (
              <EmptyState as="li" title={th.party.noOpenShifts} />
            )}
            {shifts.slice(0, 25).map((s) => (
              <li key={s.shiftId} data-testid={`open-${s.shiftId}`}>
                <span className="row__main">
                  <span className="row__name">
                    {formatThb(s.compensation)}{" "}
                    {s.urgent && <Badge tone="warn">ด่วน</Badge>}
                  </span>
                  <span className="row__sub muted">{categoryLabel(s.category)}</span>
                </span>
                <span className="row__actions">
                  <Button
                    data-testid="apply-shift"
                    busy={busyId === `apply-${s.shiftId}`}
                    disabled={
                      !proId ||
                      (busyId !== null && busyId !== `apply-${s.shiftId}`)
                    }
                    onClick={() =>
                      void run(
                        `apply-${s.shiftId}`,
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
          {th.party.myJobs} (
          {listLoading && bookings.length === 0 ? "…" : bookings.length})
        </h2>
        <div className="card">
          <ul
            className="rowlist"
            data-testid="pro-bookings"
            aria-busy={listLoading || undefined}
          >
            {listLoading && bookings.length === 0 && <RowSkeleton />}
            {!listLoading && bookings.length === 0 && (
              <EmptyState as="li" title={th.party.noJobs} />
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
                        busy={busyId === `arrive-${b.bookingId}`}
                        disabled={
                          busyId !== null && busyId !== `arrive-${b.bookingId}`
                        }
                        onClick={() =>
                          void run(
                            `arrive-${b.bookingId}`,
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
                        busy={busyId === `complete-${b.bookingId}`}
                        disabled={
                          busyId !== null &&
                          busyId !== `complete-${b.bookingId}`
                        }
                        onClick={() =>
                          void run(
                            `complete-${b.bookingId}`,
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
                      busy={busyId === `review-${b.bookingId}`}
                      disabled={
                        busyId !== null && busyId !== `review-${b.bookingId}`
                      }
                      onClick={() =>
                        void run(
                          `review-${b.bookingId}`,
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
