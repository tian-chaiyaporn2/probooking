"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader } from "../../components/AppHeader";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { BookingThread } from "../../components/BookingThread";
import { CheckoutSummary } from "../../components/CheckoutSummary";
import { Dialog } from "../../components/Dialog";
import { EmptyState } from "../../components/EmptyState";
import { Skeleton } from "../../components/Skeleton";
import { useToast } from "../../components/Toast";
import {
  getMe,
  getClinicShifts,
  getShiftCandidates,
  getClinicBookings,
  getProfessionalProfile,
  searchProfessionals,
  postShift,
  offerToProfessional,
  confirmOffer,
  acceptCompletion,
  cancelBooking,
  formatThb,
  type MeIdentity,
  type ClinicShiftRow,
  type Candidate,
  type PartyBooking,
  type ProfessionalSearchResult,
} from "../../lib/api";
import { checkoutFromCompensation } from "../../lib/checkout";
import { getThaiErrorMessage, th } from "../../lib/strings";
import { statusLabel, nextActionHint, professionLabel } from "../../lib/status";
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

export default function ClinicPage() {
  const toast = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<MeIdentity | null>(null);
  const [meLoading, setMeLoading] = useState(false);
  const [shifts, setShifts] = useState<ClinicShiftRow[]>([]);
  const [candidates, setCandidates] = useState<Record<string, Candidate[]>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [bookings, setBookings] = useState<PartyBooking[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [comp, setComp] = useState("10000");
  const [urgent, setUrgent] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [profession, setProfession] = useState("");
  const [searchHits, setSearchHits] = useState<ProfessionalSearchResult[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searched, setSearched] = useState(false);

  const clinic =
    me?.clinics.find((c) => c.role === "clinic_owner") ??
    me?.clinics[0] ??
    null;

  const load = useCallback(async (workspaceId: string, tok: string) => {
    setListLoading(true);
    try {
      const [s, b] = await Promise.all([
        getClinicShifts(workspaceId, tok),
        getClinicBookings(workspaceId, tok),
      ]);
      setShifts(s.shifts);
      setBookings(b.bookings);
      const withCands = s.shifts.filter(
        (x) => x.candidateCount > 0 && !x.offer && !x.booked,
      );
      const cs = await Promise.all(
        withCands.map((x) =>
          getShiftCandidates(x.shiftId, tok)
            .then((r) => [x.shiftId, r.candidates] as const)
            .catch(() => [x.shiftId, [] as Candidate[]] as const),
        ),
      );
      setCandidates(Object.fromEntries(cs));
      const ids = new Set(
        cs.flatMap(([, list]) => list.map((c) => c.professionalId)),
      );
      const profiles = await Promise.all(
        [...ids].map((id) =>
          getProfessionalProfile(id)
            .then((p) => [id, p.selfDeclared.displayName] as const)
            .catch(() => [id, id.slice(0, 8)] as const),
        ),
      );
      setNames(Object.fromEntries(profiles));
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    const sess = loadSession();
    if (!sess) return;
    setToken(sess.token);
    setMeLoading(true);
    getMe(sess.token)
      .then(setMe)
      .catch((e) => toast.error(getThaiErrorMessage(e)))
      .finally(() => setMeLoading(false));
  }, [toast]);

  useEffect(() => {
    if (clinic && token)
      void load(clinic.workspaceId, token).catch((e) =>
        toast.error(getThaiErrorMessage(e)),
      );
  }, [clinic, token, load, toast]);

  async function run(id: string, fn: () => Promise<unknown>, ok: string) {
    setBusyId(id);
    try {
      await fn();
      if (clinic && token) await load(clinic.workspaceId, token);
      toast.success(ok);
    } catch (e) {
      toast.error(getThaiErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function runSearch() {
    setSearchBusy(true);
    try {
      const r = await searchProfessionals(
        profession.trim() ? { profession: profession.trim() } : {},
      );
      setSearchHits(r.professionals);
      setSearched(true);
    } catch (e) {
      toast.error(getThaiErrorMessage(e));
    } finally {
      setSearchBusy(false);
    }
  }

  function signOut() {
    clearSession();
    setToken(null);
  }

  if (!token) {
    return (
      <>
        <AppHeader current="/clinic" />
        <main
          id="main"
          className="page"
          style={{ maxWidth: 460, textAlign: "center" }}
        >
          <p className="muted" style={{ marginTop: "2rem" }}>
            {th.party.signInPromptClinic}
          </p>
          <Link href="/signin" className="btn btn--primary btn--lg">
            {th.party.pickAccount}
          </Link>
        </main>
      </>
    );
  }

  const cancelBusy = busyId === "cancel";

  return (
    <>
      <AppHeader current="/clinic" />
      <main id="main" className="page page--party">
        <div className="workspace-head">
          <div>
            <h1>
              {meLoading && !clinic ? (
                <Skeleton variant="line" />
              ) : (
                (clinic?.name ?? "คลินิก")
              )}
            </h1>
            <span className="workspace-head__meta">
              เจ้าของคลินิก ·{" "}
              {clinic ? (
                <Badge tone={verificationBadgeTone(clinic.verification)}>
                  {statusLabel(clinic.verification)}
                </Badge>
              ) : null}
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

        <div className="card card--pad" style={{ marginBottom: "var(--s5)" }}>
          <h2>{th.party.postShift}</h2>
          <div className="compose-row">
            <label className="compose-row__field">
              {th.party.compensationBaht}
              <input
                data-testid="shift-comp"
                inputMode="numeric"
                maxLength={7}
                value={comp}
                onChange={(e) =>
                  setComp(e.target.value.replace(/[^0-9]/g, "").slice(0, 7))
                }
              />
            </label>
            <label className="compose-row__check">
              <input
                type="checkbox"
                checked={urgent}
                onChange={(e) => setUrgent(e.target.checked)}
              />{" "}
              {th.party.urgent}
            </label>
            <Button
              data-testid="post-shift"
              variant="primary"
              busy={busyId === "post-shift"}
              disabled={
                !comp ||
                Number(comp) <= 0 ||
                !clinic ||
                (busyId !== null && busyId !== "post-shift")
              }
              onClick={() =>
                void run(
                  "post-shift",
                  () =>
                    postShift(
                      {
                        clinicWorkspaceId: clinic!.workspaceId,
                        compensation: Number(comp) * 100,
                        urgency: urgent ? "urgent" : "standard",
                      },
                      token,
                    ),
                  "ประกาศเวรแล้ว",
                )
              }
            >
              {th.party.postShift}
            </Button>
          </div>
          {Number(comp) > 0 && Number.isSafeInteger(Number(comp) * 100) ? (
            <div style={{ marginTop: "var(--s4)" }}>
              <CheckoutSummary
                checkout={checkoutFromCompensation(Number(comp) * 100)}
                protectedStamp={false}
              />
            </div>
          ) : null}
        </div>

        <div className="card card--pad" style={{ marginBottom: "var(--s5)" }}>
          <h2>{th.party.searchPros}</h2>
          <div className="filter-bar">
            <label>
              {th.party.searchProfession}
              <input
                data-testid="pro-search-profession"
                value={profession}
                onChange={(e) => setProfession(e.target.value)}
                placeholder="physician"
              />
            </label>
            <Button
              data-testid="pro-search"
              busy={searchBusy}
              onClick={() => void runSearch()}
            >
              {th.party.searchGo}
            </Button>
          </div>
          <ul className="rowlist" data-testid="pro-search-results">
            {!searched && <EmptyState as="li" title={th.party.searchIdle} />}
            {searched && searchHits.length === 0 && (
              <EmptyState as="li" title={th.party.noProsFound} />
            )}
            {searchHits.slice(0, 12).map((p) => (
              <li key={p.id}>
                <span className="row__main">
                  <span className="row__name">{p.displayName}</span>
                  <span className="row__sub muted">
                    {professionLabel(p.profession)}
                    {p.specialty ? ` · ${p.specialty}` : ""}
                    {p.rating != null ? ` · ★ ${p.rating.toFixed(1)}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <h2>
          {th.party.myShifts} (
          {listLoading && shifts.length === 0 ? "…" : shifts.length})
        </h2>
        <div className="card" style={{ marginBottom: "var(--s5)" }}>
          <ul
            className="rowlist"
            data-testid="clinic-shifts"
            aria-busy={listLoading || undefined}
          >
            {listLoading && shifts.length === 0 && <RowSkeleton />}
            {!listLoading && shifts.length === 0 && (
              <EmptyState as="li" title={th.party.noShifts} />
            )}
            {shifts.map((s) => (
              <li
                key={s.shiftId}
                data-testid={`shift-${s.shiftId}`}
                style={{ alignItems: "flex-start" }}
              >
                <span className="row__main">
                  <span className="row__name">
                    {formatThb(s.compensation)}{" "}
                    {s.urgency === "urgent" && <Badge tone="warn">ด่วน</Badge>}
                  </span>
                  <span className="row__sub muted">
                    {s.booked ? (
                      <Badge tone="success">{statusLabel("Confirmed")}</Badge>
                    ) : s.offer ? (
                      <Badge tone="info">{statusLabel(s.offer.state)}</Badge>
                    ) : (
                      <>
                        {th.party.candidates} {s.candidateCount} คน
                      </>
                    )}
                  </span>
                  {s.offer ? (
                    <span className="row__hint muted">
                      {nextActionHint(s.offer.state)}
                    </span>
                  ) : null}
                  {s.offer?.state === "AwaitingPayment" ? (
                    <div style={{ marginTop: "var(--s3)", maxWidth: 320 }}>
                      <CheckoutSummary
                        checkout={checkoutFromCompensation(s.compensation)}
                      />
                    </div>
                  ) : null}
                  {!s.booked &&
                    !s.offer &&
                    (candidates[s.shiftId]?.length ?? 0) > 0 && (
                      <span className="actions" style={{ marginTop: 6 }}>
                        {candidates[s.shiftId]!.map((c) => {
                          const offerBusyId = `offer-${s.shiftId}-${c.professionalId}`;
                          return (
                            <Button
                              key={c.professionalId}
                              data-testid="send-offer"
                              busy={busyId === offerBusyId}
                              disabled={
                                busyId !== null && busyId !== offerBusyId
                              }
                              onClick={() =>
                                void run(
                                  offerBusyId,
                                  () =>
                                    offerToProfessional(
                                      s.shiftId,
                                      c.professionalId,
                                      token,
                                    ),
                                  "ส่งข้อเสนอแล้ว",
                                )
                              }
                            >
                              {th.party.sendOffer} →{" "}
                              {names[c.professionalId] ??
                                c.professionalId.slice(0, 6)}
                            </Button>
                          );
                        })}
                      </span>
                    )}
                </span>
                {s.offer?.state === "AwaitingPayment" && (
                  <span className="row__actions">
                    <Button
                      data-testid="confirm-offer"
                      variant="primary"
                      busy={busyId === `confirm-${s.offer.id}`}
                      disabled={
                        busyId !== null && busyId !== `confirm-${s.offer.id}`
                      }
                      onClick={() =>
                        void run(
                          `confirm-${s.offer!.id}`,
                          () => confirmOffer(s.offer!.id, token),
                          "ยืนยันและคุ้มครองเงินแล้ว",
                        )
                      }
                    >
                      {th.party.confirmPay}
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <h2>
          {th.party.myBookings} (
          {listLoading && bookings.length === 0 ? "…" : bookings.length})
        </h2>
        <div className="card">
          <ul
            className="rowlist"
            data-testid="clinic-bookings"
            aria-busy={listLoading || undefined}
          >
            {listLoading && bookings.length === 0 && <RowSkeleton />}
            {!listLoading && bookings.length === 0 && (
              <EmptyState as="li" title={th.party.noBookings} />
            )}
            {bookings.map((b) => (
              <li
                key={b.bookingId}
                data-testid={`booking-${b.bookingId}`}
                style={{ alignItems: "flex-start" }}
              >
                <span className="row__main">
                  <span className="row__name">{formatThb(b.total)}</span>
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
                  <div style={{ marginTop: "var(--s3)", maxWidth: 320 }}>
                    <CheckoutSummary
                      checkout={{
                        compensation: b.compensation,
                        serviceFee: b.serviceFee,
                        tax: b.tax,
                        total: b.total,
                      }}
                      protectedStamp={
                        b.state === "Confirmed" || b.state === "InProgress"
                      }
                    />
                  </div>
                  <div style={{ marginTop: "var(--s3)" }}>
                    <BookingThread
                      bookingId={b.bookingId}
                      token={token}
                      selfId={clinic?.workspaceId ?? null}
                    />
                  </div>
                </span>
                <span className="row__actions actions">
                  {b.state === "AwaitingCompletion" && (
                    <Button
                      data-testid="accept-completion"
                      variant="primary"
                      busy={busyId === `complete-${b.bookingId}`}
                      disabled={
                        busyId !== null && busyId !== `complete-${b.bookingId}`
                      }
                      onClick={() =>
                        void run(
                          `complete-${b.bookingId}`,
                          () => acceptCompletion(b.bookingId, token),
                          "รับรองเสร็จและจ่ายเงินแล้ว",
                        )
                      }
                    >
                      {th.party.acceptPayout}
                    </Button>
                  )}
                  {(b.state === "Confirmed" || b.state === "InProgress") && (
                    <Button
                      data-testid="cancel-booking"
                      busy={busyId === "cancel" && cancelId === b.bookingId}
                      disabled={busyId !== null && busyId !== "cancel"}
                      onClick={() => setCancelId(b.bookingId)}
                    >
                      {th.party.cancel}
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </main>

      <Dialog
        open={cancelId !== null}
        title={th.party.cancelConfirmTitle}
        confirmLabel={th.party.cancel}
        busy={cancelBusy}
        onCancel={() => {
          if (!cancelBusy) setCancelId(null);
        }}
        onConfirm={() => {
          if (!cancelId) return;
          void run(
            "cancel",
            () => cancelBooking(cancelId, { reason: "ordinary" }, token),
            "ยกเลิกแล้ว",
          ).then(() => setCancelId(null));
        }}
      >
        <p>{th.party.cancelConfirmBody}</p>
      </Dialog>
    </>
  );
}
