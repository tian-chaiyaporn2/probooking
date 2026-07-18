"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader } from "../../components/AppHeader";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { PageHeader } from "../../components/PageHeader";
import { SectionBlock } from "../../components/SectionBlock";
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
import { getThaiErrorMessage } from "../../lib/strings";
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
    getMe(sess.token).then(setMe).catch((e) => toast.error(getThaiErrorMessage(e)));
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

  if (!token) {
    return (
      <>
        <AppHeader current="/pro" />
        <main className="page page--gate">
          <p className="muted page--gate__lead">เข้าสู่ระบบเป็นบุคลากรเพื่อหาเวรและรับงาน</p>
          <Link href="/signin" className="btn btn--primary btn--lg">
            เลือกบัญชีเข้าสู่ระบบ
          </Link>
        </main>
      </>
    );
  }

  const pendingOffers = offers.filter((o) => o.state === "PendingResponse").length;

  return (
    <>
      <AppHeader current="/pro" />
      <main className="page page--market">
        <PageHeader
          title={me?.professionalName ?? "บุคลากร"}
          subtitle={
            <span className="page-head__meta">
              บุคลากร · {me?.professionalVerification && <Badge tone="success">{me.professionalVerification}</Badge>}
            </span>
          }
          actions={
            <Button variant="subtle" onClick={() => { clearSession(); setToken(null); }}>
              ออกจากระบบ
            </Button>
          }
        />

        <SectionBlock title="ข้อเสนอถึงฉัน" count={pendingOffers}>
          <div className="card">
            <ul className="rowlist" data-testid="pro-offers">
              {offers.length === 0 && <li className="empty">ยังไม่มีข้อเสนอ — สมัครเวรด้านล่างก่อน</li>}
              {offers.map((o) => (
                <li key={o.offerId} data-testid={`offer-${o.offerId}`}>
                  <span className="row__main">
                    <span className="row__name">
                      {formatThb(o.compensation)} {o.urgency === "urgent" && <Badge tone="warn">ด่วน</Badge>}
                    </span>
                    <span className="row__sub">
                      <Badge tone="info">{o.state}</Badge>
                    </span>
                  </span>
                  {o.state === "PendingResponse" && (
                    <span className="row__actions">
                      <Button
                        data-testid="accept-offer"
                        variant="primary"
                        busy={busy}
                        onClick={() => void run(() => acceptOffer(o.offerId, token), "ยอมรับข้อเสนอแล้ว (รอคลินิกยืนยัน)")}
                      >
                        ยอมรับ
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </SectionBlock>

        <SectionBlock title="เวรที่เปิดรับ" count={shifts.length}>
          <div className="card">
            <ul className="rowlist" data-testid="open-shifts">
              {shifts.length === 0 && <li className="empty">ยังไม่มีเวรเปิดรับ</li>}
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
                      สมัคร
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </SectionBlock>

        <SectionBlock title="งานของฉัน" count={bookings.length}>
          <div className="card">
            <ul className="rowlist" data-testid="pro-bookings">
              {bookings.length === 0 && <li className="empty">ยังไม่มีงาน</li>}
              {bookings.map((b) => (
                <li key={b.bookingId} data-testid={`pro-booking-${b.bookingId}`}>
                  <span className="row__main">
                    <span className="row__name">{formatThb(b.total)}</span>
                    <span className="row__sub">
                      <Badge tone="info">{b.state}</Badge> <span className="muted">จ่ายออก: {b.payoutState}</span>
                    </span>
                  </span>
                  <span className="row__actions actions">
                    {(b.state === "Confirmed" || b.state === "InProgress") && (
                      <>
                        <Button
                          data-testid="arrive"
                          busy={busy}
                          onClick={() => void run(() => arriveBooking(b.bookingId, token), "บันทึกการมาถึงแล้ว")}
                        >
                          มาถึงแล้ว
                        </Button>
                        <Button
                          data-testid="complete"
                          variant="primary"
                          busy={busy}
                          onClick={() => void run(() => completeBooking(b.bookingId, token), "ส่งงานเสร็จแล้ว")}
                        >
                          ส่งงานเสร็จ
                        </Button>
                      </>
                    )}
                    {b.state === "ServiceCompleted" && (
                      <Button
                        data-testid="review"
                        busy={busy}
                        onClick={() => void run(() => createReview(b.bookingId, { score: 5 }, token), "รีวิวแล้ว")}
                      >
                        รีวิว ★5
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
