"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader } from "../../components/AppHeader";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { Field, Input } from "../../components/Field";
import { PageHeader } from "../../components/PageHeader";
import { SectionBlock } from "../../components/SectionBlock";
import { useToast } from "../../components/Toast";
import {
  getMe,
  getClinicShifts,
  getShiftCandidates,
  getClinicBookings,
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
} from "../../lib/api";
import { getThaiErrorMessage } from "../../lib/strings";
import { loadSession, clearSession } from "../../lib/demo-accounts";

export default function ClinicPage() {
  const toast = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<MeIdentity | null>(null);
  const [shifts, setShifts] = useState<ClinicShiftRow[]>([]);
  const [candidates, setCandidates] = useState<Record<string, Candidate[]>>({});
  const [bookings, setBookings] = useState<PartyBooking[]>([]);
  const [comp, setComp] = useState("10000");
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);

  const clinic = me?.clinics.find((c) => c.role === "clinic_owner") ?? me?.clinics[0] ?? null;

  const load = useCallback(async (workspaceId: string, tok: string) => {
    const [s, b] = await Promise.all([getClinicShifts(workspaceId, tok), getClinicBookings(workspaceId, tok)]);
    setShifts(s.shifts);
    setBookings(b.bookings);
    const withCands = s.shifts.filter((x) => x.candidateCount > 0 && !x.offer && !x.booked);
    const cs = await Promise.all(
      withCands.map((x) =>
        getShiftCandidates(x.shiftId, tok)
          .then((r) => [x.shiftId, r.candidates] as const)
          .catch(() => [x.shiftId, [] as Candidate[]] as const),
      ),
    );
    setCandidates(Object.fromEntries(cs));
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
    if (clinic && token) void load(clinic.workspaceId, token).catch((e) => toast.error(getThaiErrorMessage(e)));
  }, [clinic, token, load, toast]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      if (clinic && token) await load(clinic.workspaceId, token);
      toast.success(ok);
    } catch (e) {
      toast.error(getThaiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <>
        <AppHeader current="/clinic" />
        <main className="page page--gate">
          <p className="muted page--gate__lead">เข้าสู่ระบบเป็นเจ้าของคลินิกเพื่อจัดการเวร</p>
          <Link href="/signin" className="btn btn--primary btn--lg">
            เลือกบัญชีเข้าสู่ระบบ
          </Link>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader current="/clinic" />
      <main className="page page--market">
        <PageHeader
          title={clinic?.name ?? "คลินิก"}
          subtitle={
            <span className="page-head__meta">
              เจ้าของคลินิก · {clinic ? <Badge tone="success">{clinic.verification}</Badge> : null}
            </span>
          }
          actions={
            <Button variant="subtle" onClick={() => { clearSession(); setToken(null); }}>
              ออกจากระบบ
            </Button>
          }
        />

        <SectionBlock title="ประกาศเวรใหม่">
          <div className="card card--pad">
            <div className="field-row">
              <Field label="ค่าตอบแทน (บาท)" htmlFor="shift-comp">
                <Input
                  id="shift-comp"
                  data-testid="shift-comp"
                  className="input--narrow"
                  inputMode="numeric"
                  value={comp}
                  onChange={(e) => setComp(e.target.value.replace(/[^0-9]/g, ""))}
                />
              </Field>
              <div className="field field--inline">
                <label className="field__label field__label--check" htmlFor="shift-urgent">
                  <input
                    id="shift-urgent"
                    type="checkbox"
                    checked={urgent}
                    onChange={(e) => setUrgent(e.target.checked)}
                  />{" "}
                  ด่วน (Urgent)
                </label>
              </div>
              <Button
                data-testid="post-shift"
                variant="primary"
                busy={busy}
                disabled={!comp || Number(comp) <= 0}
                onClick={() =>
                  void run(
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
                ประกาศเวร
              </Button>
            </div>
          </div>
        </SectionBlock>

        <SectionBlock title="เวรของฉัน" count={shifts.length}>
          <div className="card">
            <ul className="rowlist" data-testid="clinic-shifts">
              {shifts.length === 0 && <li className="empty">ยังไม่มีเวร — ประกาศเวรด้านบน</li>}
              {shifts.map((s) => (
                <li key={s.shiftId} data-testid={`shift-${s.shiftId}`} className="row--stacked">
                  <span className="row__main">
                    <span className="row__name">
                      {formatThb(s.compensation)} {s.urgency === "urgent" && <Badge tone="warn">ด่วน</Badge>}
                    </span>
                    <span className="row__sub muted">
                      {s.booked ? (
                        <Badge tone="success">จองแล้ว</Badge>
                      ) : s.offer ? (
                        <Badge tone="info">ข้อเสนอ: {s.offer.state}</Badge>
                      ) : (
                        <>ผู้สมัคร {s.candidateCount} คน</>
                      )}
                    </span>
                    {!s.booked && !s.offer && (candidates[s.shiftId]?.length ?? 0) > 0 && (
                      <span className="actions row__actions--inset">
                        {candidates[s.shiftId]!.map((c) => (
                          <Button
                            key={c.professionalId}
                            data-testid="send-offer"
                            busy={busy}
                            onClick={() => void run(() => offerToProfessional(s.shiftId, c.professionalId, token), "ส่งข้อเสนอแล้ว")}
                          >
                            ส่งข้อเสนอ → {c.professionalId.slice(0, 6)}…
                          </Button>
                        ))}
                      </span>
                    )}
                  </span>
                  {s.offer?.state === "AwaitingPayment" && (
                    <span className="row__actions">
                      <Button
                        data-testid="confirm-offer"
                        variant="primary"
                        busy={busy}
                        onClick={() => void run(() => confirmOffer(s.offer!.id, token), "ยืนยันและกันเงินแล้ว")}
                      >
                        ยืนยัน & จ่าย
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </SectionBlock>

        <SectionBlock title="การจอง" count={bookings.length}>
          <div className="card">
            <ul className="rowlist" data-testid="clinic-bookings">
              {bookings.length === 0 && <li className="empty">ยังไม่มีการจอง</li>}
              {bookings.map((b) => (
                <li key={b.bookingId} data-testid={`booking-${b.bookingId}`}>
                  <span className="row__main">
                    <span className="row__name">{formatThb(b.total)}</span>
                    <span className="row__sub">
                      <Badge tone="info">{b.state}</Badge> <span className="muted">จ่ายออก: {b.payoutState}</span>
                    </span>
                  </span>
                  <span className="row__actions actions">
                    {b.state === "AwaitingCompletion" && (
                      <Button
                        data-testid="accept-completion"
                        variant="primary"
                        busy={busy}
                        onClick={() => void run(() => acceptCompletion(b.bookingId, token), "รับงานและจ่ายเงินแล้ว")}
                      >
                        รับงาน & จ่ายเงิน
                      </Button>
                    )}
                    {(b.state === "Confirmed" || b.state === "InProgress") && (
                      <Button
                        data-testid="cancel-booking"
                        busy={busy}
                        onClick={() => void run(() => cancelBooking(b.bookingId, { reason: "ordinary" }, token), "ยกเลิกแล้ว")}
                      >
                        ยกเลิก
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
