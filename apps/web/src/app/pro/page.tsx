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
import { SectionBlock } from "../../components/SectionBlock";
import { Stat } from "../../components/Stat";
import { useToast } from "../../components/Toast";
import {
  CalendarIcon,
  CheckIcon,
  InboxIcon,
  StethoscopeIcon,
} from "../../components/icons";
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
import { formatWhen } from "../../lib/datetime";
import { getThaiErrorMessage, th } from "../../lib/strings";
import { statusLabel, nextActionHint, categoryLabel } from "../../lib/status";
import { loadSession, clearSession } from "../../lib/session";

function nameInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "บ";
  if (parts.length === 1) return parts[0]!.slice(0, 2);
  return parts[0]![0]! + parts[parts.length - 1]![0]!;
}

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
  const activeJobs = bookings.filter(
    (b) =>
      b.state === "Confirmed" ||
      b.state === "InProgress" ||
      b.state === "AwaitingCompletion",
  );
  const displayName = me?.professionalName ?? th.party.rolePro;

  return (
    <>
      <AppHeader current="/pro" />
      <main id="main" className="page page--party page--pro">
        <div className="workspace-head workspace-head--pro">
          <div className="workspace-head__identity">
            <span className="workspace-head__avatar" aria-hidden>
              {nameInitials(displayName)}
            </span>
            <div>
              <h1>{displayName}</h1>
              <span className="workspace-head__meta">
                {th.party.rolePro}
                {me?.professionalVerification ? (
                  <>
                    {" · "}
                    <Badge tone="success">
                      {statusLabel(me.professionalVerification)}
                    </Badge>
                  </>
                ) : null}
              </span>
            </div>
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

        <div className="stat-grid pro-overview" data-testid="pro-overview">
          <Stat
            label={th.party.overviewOffers}
            value={String(pendingOffers.length)}
            hint={th.party.overviewOffersHint}
            icon={<InboxIcon />}
            tone={pendingOffers.length > 0 ? "success" : "default"}
          />
          <Stat
            label={th.party.overviewShifts}
            value={String(shifts.length)}
            hint={th.party.overviewShiftsHint}
            icon={<CalendarIcon />}
          />
          <Stat
            label={th.party.overviewJobs}
            value={String(activeJobs.length)}
            hint={th.party.overviewJobsHint}
            icon={<CheckIcon />}
            tone={activeJobs.length > 0 ? "success" : "default"}
          />
        </div>

        {profile ? <ProfilePanel profile={profile} /> : null}

        <SectionBlock title={th.party.offersToMe} count={pendingOffers.length}>
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

        <SectionBlock title={th.party.openShifts} count={shifts.length}>
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
      </main>
    </>
  );
}
