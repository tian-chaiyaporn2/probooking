"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppHeader } from "../../components/AppHeader";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { BookingThread } from "../../components/BookingThread";
import { CheckoutSummary } from "../../components/CheckoutSummary";
import { EmptyState } from "../../components/EmptyState";
import { ProfilePanel } from "../../components/ProfilePanel";
import { SectionBlock } from "../../components/SectionBlock";
import { Stat } from "../../components/Stat";
import { useToast } from "../../components/Toast";
import {
  CalendarIcon,
  CheckIcon,
  InboxIcon,
  ShieldCheckIcon,
  StethoscopeIcon,
  WalletIcon,
} from "../../components/icons";
import {
  getMe,
  browseShifts,
  getProfessionalOffers,
  getProfessionalBookings,
  getProfessionalProfile,
  listAvailability,
  addAvailability,
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
  type AvailabilityBlock,
  type ShiftBrowseFilters,
} from "../../lib/api";
import { checkoutFromCompensation } from "../../lib/checkout";
import {
  formatWhen,
  formatWhenRange,
  greetingForHour,
} from "../../lib/datetime";
import { getThaiErrorMessage, th } from "../../lib/strings";
import { statusLabel, nextActionHint, categoryLabel } from "../../lib/status";
import { loadSession } from "../../lib/session";

function nameInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "บ";
  if (parts.length === 1) return parts[0]!.slice(0, 2);
  return parts[0]![0]! + parts[parts.length - 1]![0]!;
}

function pickMarketPulse(shifts: OpenShift[]): OpenShift[] {
  return [...shifts]
    .sort((a, b) => {
      if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
      return b.compensation - a.compensation;
    })
    .slice(0, 3);
}

export default function ProPage() {
  const toast = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<MeIdentity | null>(null);
  const [profile, setProfile] = useState<VerifiedProfile | null>(null);
  const [shifts, setShifts] = useState<OpenShift[]>([]);
  const [offers, setOffers] = useState<ProfessionalOfferRow[]>([]);
  const [bookings, setBookings] = useState<PartyBooking[]>([]);
  const [availability, setAvailability] = useState<AvailabilityBlock[]>([]);
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

  const loadAvailability = useCallback(async (id: string, tok: string) => {
    try {
      const av = await listAvailability(id, tok);
      setAvailability(av.availability);
    } catch {
      setAvailability([]);
    }
  }, []);

  const load = useCallback(
    async (id: string, tok: string, filters: ShiftBrowseFilters = {}) => {
      const [of, bk] = await Promise.all([
        getProfessionalOffers(id, tok),
        getProfessionalBookings(id, tok),
      ]);
      setOffers(of.offers);
      setBookings(bk.bookings);
      await Promise.all([loadShifts(tok, filters), loadAvailability(id, tok)]);
    },
    [loadShifts, loadAvailability],
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

  const pendingOffers = useMemo(
    () => offers.filter((o) => o.state === "PendingResponse"),
    [offers],
  );
  const activeJobs = useMemo(
    () =>
      bookings.filter(
        (b) =>
          b.state === "Confirmed" ||
          b.state === "InProgress" ||
          b.state === "AwaitingCompletion",
      ),
    [bookings],
  );
  const earnedSatang = useMemo(
    () =>
      bookings
        .filter((b) => b.payoutState === "Paid")
        .reduce((sum, b) => sum + b.compensation, 0),
    [bookings],
  );
  const pendingPayoutSatang = useMemo(
    () =>
      bookings
        .filter(
          (b) => b.payoutState === "Pending" || b.payoutState === "Processing",
        )
        .reduce((sum, b) => sum + b.compensation, 0),
    [bookings],
  );
  const completedCount = useMemo(
    () => bookings.filter((b) => b.state === "ServiceCompleted").length,
    [bookings],
  );
  const upcomingAvailability = useMemo(
    () => availability.filter((a) => a.endsAt > Date.now()).slice(0, 4),
    [availability],
  );
  const marketPulse = useMemo(() => pickMarketPulse(shifts), [shifts]);
  const nextJob = activeJobs[0] ?? null;

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

  const displayName = me?.professionalName ?? th.party.rolePro;
  const bookable =
    me?.professionalVerification === "Verified" ||
    profile?.verified.identityVerified === true;
  const greeting = greetingForHour();

  return (
    <>
      <AppHeader current="/pro" />
      <main id="main" className="page page--party page--pro">
        <header className="pro-home">
          <div className="pro-home__top">
            <div className="pro-home__intro">
              <p className="pro-home__greeting">{greeting}</p>
              <div className="workspace-head__identity">
                <span className="workspace-head__avatar" aria-hidden>
                  {nameInitials(displayName)}
                </span>
                <div>
                  <h1>{displayName}</h1>
                  <span className="workspace-head__meta">
                    <span
                      className={`pro-home__ready${bookable ? " pro-home__ready--on" : ""}`}
                    >
                      {bookable ? (
                        <>
                          <ShieldCheckIcon /> {th.party.bookableReady}
                        </>
                      ) : (
                        th.party.bookablePending
                      )}
                    </span>
                    {profile?.verified.rating ? (
                      <>
                        {" · "}
                        <span className="pro-home__rating">
                          ★ {profile.verified.rating.average.toFixed(1)}
                        </span>
                      </>
                    ) : null}
                  </span>
                </div>
              </div>
            </div>
            <div className="actions">
              <Link href="/signin" className="btn btn--subtle">
                {th.party.switchRole}
              </Link>
            </div>
          </div>

          <div className="stat-grid pro-overview" data-testid="pro-overview">
            <Stat
              label={th.party.earnedLabel}
              value={formatThb(earnedSatang)}
              hint={th.party.paymentProtectedHint}
              icon={<WalletIcon />}
              tone={earnedSatang > 0 ? "success" : "default"}
            />
            <Stat
              label={th.party.pendingPayoutLabel}
              value={formatThb(pendingPayoutSatang)}
              hint={
                pendingOffers.length > 0
                  ? th.party.overviewOffersHint
                  : th.party.overviewJobsHint
              }
              icon={<InboxIcon />}
              tone={pendingPayoutSatang > 0 ? "success" : "default"}
            />
            <Stat
              label={
                profile?.verified.rating
                  ? th.party.ratingLabel
                  : th.party.completedJobsLabel
              }
              value={
                profile?.verified.rating
                  ? profile.verified.rating.average.toFixed(1)
                  : String(completedCount)
              }
              hint={
                profile?.verified.rating
                  ? `${profile.verified.rating.count} รีวิว`
                  : th.party.overviewJobsHint
              }
              icon={<CheckIcon />}
              tone={
                profile?.verified.rating || completedCount > 0
                  ? "success"
                  : "default"
              }
            />
          </div>
        </header>

        {pendingOffers.length > 0 ? (
          <a
            href="#pro-offers"
            className="pro-attention"
            data-testid="pro-attention"
          >
            <span className="pro-attention__icon" aria-hidden>
              <InboxIcon />
            </span>
            <span className="pro-attention__body">
              <strong>{th.party.attentionOffers(pendingOffers.length)}</strong>
              <span className="muted">{th.party.attentionOffersCta}</span>
            </span>
            <span className="pro-attention__arrow" aria-hidden>
              →
            </span>
          </a>
        ) : null}

        {nextJob ? (
          <div className="pro-next" data-testid="pro-next-job">
            <div className="pro-next__label">{th.party.nextJobTitle}</div>
            <div className="pro-next__row">
              <span className="row__money">
                {formatThb(nextJob.compensation)}
              </span>
              <Badge tone="info">{statusLabel(nextJob.state)}</Badge>
              <span className="muted">
                {th.party.payoutLabel}: {statusLabel(nextJob.payoutState)}
              </span>
            </div>
            {nextActionHint(nextJob.state) ? (
              <p className="pro-next__hint muted">
                {nextActionHint(nextJob.state)}
              </p>
            ) : null}
          </div>
        ) : null}

        {profile ? (
          <ProfilePanel profile={profile} bookable={bookable} />
        ) : null}

        <SectionBlock
          title={th.party.availabilityTitle}
          count={upcomingAvailability.length}
        >
          <div
            className="card card--pad availability-panel"
            data-testid="pro-availability"
          >
            {upcomingAvailability.length === 0 ? (
              <EmptyState
                title={th.party.availabilityEmpty}
                description={th.party.availabilityEmptyDesc}
                icon={<CalendarIcon />}
              />
            ) : (
              <ul className="availability-list">
                {upcomingAvailability.map((a) => (
                  <li key={a.id}>
                    <span className="availability-list__when">
                      {formatWhenRange(a.startsAt, a.endsAt)}
                    </span>
                    {a.openToRequests ? (
                      <Badge tone="accent">
                        {th.party.availabilityOpenToRequests}
                      </Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <div className="availability-actions actions">
              <Button
                data-testid="avail-tomorrow"
                variant="primary"
                busy={busy}
                onClick={() => {
                  if (!proId || !token) return;
                  void run(
                    () =>
                      addAvailability(
                        proId,
                        {
                          startsInHours: 24,
                          durationHours: 8,
                          openToRequests: true,
                        },
                        token,
                      ),
                    th.party.availabilityAdded,
                  );
                }}
              >
                {th.party.availabilityAddTomorrow}
              </Button>
              <Button
                data-testid="avail-today"
                busy={busy}
                onClick={() => {
                  if (!proId || !token) return;
                  void run(
                    () =>
                      addAvailability(
                        proId,
                        {
                          startsInHours: 4,
                          durationHours: 4,
                          openToRequests: true,
                        },
                        token,
                      ),
                    th.party.availabilityAdded,
                  );
                }}
              >
                {th.party.availabilityAddToday}
              </Button>
            </div>
          </div>
        </SectionBlock>

        <section
          className="market-pulse"
          aria-labelledby="market-pulse-heading"
        >
          <div className="section-block__head">
            <h2 id="market-pulse-heading">{th.party.marketPulseTitle}</h2>
            <span className="section-block__count">{marketPulse.length}</span>
          </div>
          <p className="market-pulse__sub muted">{th.party.marketPulseSub}</p>
          {marketPulse.length === 0 ? (
            <p className="muted">{th.party.marketPulseEmpty}</p>
          ) : (
            <div className="market-pulse__grid" data-testid="market-pulse">
              {marketPulse.map((s) => (
                <article
                  key={s.shiftId}
                  className={`market-card${s.urgent ? " market-card--urgent" : ""}`}
                >
                  <div className="market-card__top">
                    <span className="row__money">
                      {formatThb(s.compensation)}
                    </span>
                    {s.urgent ? (
                      <Badge tone="warn">{th.party.urgencyUrgent}</Badge>
                    ) : null}
                  </div>
                  <h3 className="market-card__title">
                    {categoryLabel(s.category)}
                  </h3>
                  <p className="market-card__when muted">
                    {th.party.shiftStarts} {formatWhen(s.startsAt)}
                  </p>
                  <Button
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
                </article>
              ))}
            </div>
          )}
          <a href="#open-shifts-section" className="market-pulse__more">
            {th.party.browseAllShifts} →
          </a>
        </section>

        <SectionBlock
          id="pro-offers"
          title={th.party.offersToMe}
          count={pendingOffers.length}
        >
          <div className="card">
            <ul className="rowlist" data-testid="pro-offers">
              {offers.length === 0 && (
                <EmptyState
                  as="li"
                  title={th.party.noOffers}
                  description={th.party.noOffersDesc}
                  icon={<InboxIcon />}
                />
              )}
              {offers.map((o) => (
                <li
                  key={o.offerId}
                  data-testid={`offer-${o.offerId}`}
                  className={o.urgency === "urgent" ? "row--urgent" : undefined}
                  style={{ alignItems: "flex-start" }}
                >
                  <span
                    className={`row__avatar${o.urgency === "urgent" ? " row__avatar--urgent" : ""}`}
                    aria-hidden
                  >
                    <InboxIcon />
                  </span>
                  <span className="row__main">
                    <span className="row__money">
                      {formatThb(o.compensation)}
                      {o.urgency === "urgent" && (
                        <Badge tone="warn">{th.party.urgencyUrgent}</Badge>
                      )}
                    </span>
                    <span className="row__name">
                      {categoryLabel(o.category)}
                    </span>
                    <span className="row__sub">
                      <Badge tone="info">{statusLabel(o.state)}</Badge>
                      <span className="muted">
                        {th.party.shiftStarts} {formatWhen(o.shiftStart)}
                      </span>
                      {o.expiresAt ? (
                        <span className="muted">
                          · {th.party.offerExpires} {formatWhen(o.expiresAt)}
                        </span>
                      ) : null}
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
        </SectionBlock>

        <SectionBlock title={th.party.myJobs} count={bookings.length}>
          <div className="card">
            <ul className="rowlist" data-testid="pro-bookings">
              {bookings.length === 0 && (
                <EmptyState
                  as="li"
                  title={th.party.noJobs}
                  description={th.party.noJobsDesc}
                  icon={<CheckIcon />}
                />
              )}
              {bookings.map((b) => (
                <li
                  key={b.bookingId}
                  data-testid={`pro-booking-${b.bookingId}`}
                  style={{ alignItems: "flex-start" }}
                >
                  <span className="row__avatar row__avatar--job" aria-hidden>
                    <CheckIcon />
                  </span>
                  <span className="row__main">
                    <span className="row__money">
                      {formatThb(b.compensation)}
                    </span>
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
                            () =>
                              createReview(b.bookingId, { score: 5 }, token),
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
        </SectionBlock>

        <SectionBlock
          id="open-shifts-section"
          title={th.party.openShifts}
          count={shifts.length}
        >
          <div
            className="filter-bar filter-bar--panel"
            data-testid="shift-filters"
          >
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
          <div className="card">
            <ul className="rowlist" data-testid="open-shifts">
              {shifts.length === 0 && (
                <EmptyState
                  as="li"
                  title={th.party.noOpenShifts}
                  description={th.party.noOpenShiftsDesc}
                  icon={<CalendarIcon />}
                />
              )}
              {shifts.slice(0, 25).map((s) => (
                <li
                  key={s.shiftId}
                  data-testid={`open-${s.shiftId}`}
                  className={s.urgent ? "row--urgent" : undefined}
                >
                  <span
                    className={`row__avatar${s.urgent ? " row__avatar--urgent" : ""}`}
                    aria-hidden
                  >
                    <StethoscopeIcon />
                  </span>
                  <span className="row__main">
                    <span className="row__money">
                      {formatThb(s.compensation)}
                      {s.urgent && (
                        <Badge tone="warn">{th.party.urgencyUrgent}</Badge>
                      )}
                    </span>
                    <span className="row__name">
                      {categoryLabel(s.category)}
                    </span>
                    <span className="row__sub muted">
                      {th.party.shiftStarts} {formatWhen(s.startsAt)}
                    </span>
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
        </SectionBlock>
      </main>
    </>
  );
}
